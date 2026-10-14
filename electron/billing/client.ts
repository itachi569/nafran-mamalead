import { app, safeStorage } from 'electron'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { arch, hostname, platform, release } from 'node:os'
import { join } from 'node:path'

export interface BillingStatus {
  configured: boolean
  connected: boolean
  mode?: 'test' | 'live'
  message?: string
  lifetime?: { amount: number; currency: string; interval: null; active: boolean }
  trial?: { active: boolean; expiresAt: string | null }
  decisionMaker?: { amount: number; currency: string; interval: string | null; available?: boolean; active: boolean; status: string; includedPeople: number; monthlyLimit: number; monthlyUsed: number; monthlyRemaining: number; renewsAt: string | null }
  hasCustomer?: boolean
  license?: { active: boolean; kind?: 'trial' | 'lifetime'; email?: string; last4?: string; activatedAt?: string | null; expiresAt?: string | null }
}

export interface BillingInvoice {
  id: string
  number: string
  issued: string
  total: number
  currency: string
  status: string
  url: string
}

export class LicenseAccessError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'LicenseAccessError'
  }
}

type LicensedFeature = 'lifetime' | 'decisionMaker'
const LICENSE_STATUS_TTL_MS = 15_000
let verifiedLicense: { status: BillingStatus; expiresAt: number } | null = null
let pendingLicenseCheck: Promise<BillingStatus> | null = null
let machineIdentity: { id: string; label: string } | null = null

function deviceIdentity(): { id: string; label: string } {
  if (machineIdentity) return machineIdentity
  let machineId = ''
  if (platform() === 'win32') {
    const output = execFileSync('reg.exe', ['query', 'HKLM\\SOFTWARE\\Microsoft\\Cryptography', '/v', 'MachineGuid'], {
      encoding: 'utf8', timeout: 5000, windowsHide: true,
    })
    machineId = /MachineGuid\s+REG_SZ\s+([^\s]+)/i.exec(output)?.[1] ?? ''
  } else if (platform() === 'linux' && existsSync('/etc/machine-id')) {
    machineId = readFileSync('/etc/machine-id', 'utf8').trim()
  } else {
    machineId = hostname()
  }
  if (!machineId) throw new Error('This device identity could not be read. License activation needs a stable device ID.')
  machineIdentity = {
    id: createHash('sha256').update(`nafran-device-v1\0${platform()}\0${machineId.toLowerCase()}`).digest('hex'),
    label: `${platform() === 'win32' ? 'Windows' : platform()} ${arch()} ${release()}`.slice(0, 64),
  }
  return machineIdentity
}

function billingUrl(): URL | null {
  // A shipped app must never accept a caller-selected license server, even from its environment.
  const configured = app.isPackaged
    ? 'https://api.mamalead.com'
    : process.env.LEADSNAP_BILLING_API_URL?.trim() || 'http://127.0.0.1:38747'
  if (!configured) return null
  const url = new URL(configured)
  if (url.username || url.password || url.search || url.hash || (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)))) {
    throw new Error('Billing API URL must use HTTPS or local HTTP.')
  }
  return url
}

function tokenPath(): string {
  const base = billingUrl()
  if (!base) throw new Error('Billing server is not configured for this build.')
  const directory = join(app.getPath('userData'), 'secrets')
  const legacy = join(directory, 'billing-installation.enc')
  if (base.origin === 'http://127.0.0.1:38747' && existsSync(legacy)) return legacy
  const scope = createHash('sha256').update(base.origin + base.pathname).digest('hex').slice(0, 20)
  return join(directory, `billing-installation-${scope}.enc`)
}

async function request<T>(path: string, method = 'GET', body?: unknown, token?: string): Promise<T> {
  const base = billingUrl()
  if (!base) throw new Error('Billing server is not configured for this build.')
  const device = deviceIdentity()
  const response = await fetch(new URL(path, base), {
    method,
    headers: { 'x-nafran-device-id': device.id, 'x-nafran-device-platform': device.label,
      ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    redirect: 'error',
    signal: AbortSignal.timeout(20_000),
  })
  const result = await response.json() as T & { error?: string }
  if (!response.ok) throw new Error(result.error || `Billing server returned ${response.status}.`)
  return result
}

let tokenPromise: Promise<string> | null = null
async function installationToken(): Promise<string> {
  if (tokenPromise) return tokenPromise
  tokenPromise = (async () => {
    if (!safeStorage.isEncryptionAvailable()) throw new Error('Secure storage is unavailable on this machine.')
    const path = tokenPath()
    if (existsSync(path)) {
      try {
        const token = safeStorage.decryptString(readFileSync(path))
        if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new Error('Invalid saved token')
        return token
      } catch {
        throw new Error('Saved billing identity could not be unlocked on this OS account. It was not replaced.')
      }
    }
    const created = await request<{ token: string }>('/v1/installations', 'POST')
    if (!/^[A-Za-z0-9_-]{43}$/.test(created.token)) throw new Error('Billing server returned an invalid identity.')
    mkdirSync(join(app.getPath('userData'), 'secrets'), { recursive: true })
    writeFileSync(path, safeStorage.encryptString(created.token), { mode: 0o600, flag: 'wx' })
    return created.token
  })()
  try { return await tokenPromise } catch (error) { tokenPromise = null; throw error }
}

export async function billingStatus(): Promise<BillingStatus> {
  try {
    if (!billingUrl()) return { configured: false, connected: false, message: 'Billing server URL is not configured for this build.' }
    return await request<BillingStatus>('/v1/status', 'GET', undefined, await installationToken())
  } catch (error) {
    return { configured: true, connected: false, message: error instanceof Error ? error.message : 'Billing server is unavailable.' }
  }
}

/** Main-process gate for paid work. Only a fresh server status can start a user action. */
export async function requireActiveLicense(feature: LicensedFeature = 'lifetime', fresh = true): Promise<void> {
  try {
    let status: BillingStatus
    if (!fresh && verifiedLicense && verifiedLicense.expiresAt > Date.now()) {
      status = verifiedLicense.status
    } else {
      pendingLicenseCheck ??= request<BillingStatus>('/v1/status', 'GET', undefined, await installationToken())
        .finally(() => { pendingLicenseCheck = null })
      status = await pendingLicenseCheck
      const entitled = status.lifetime?.active || status.trial?.active
      const trialExpiry = status.trial?.active && status.trial.expiresAt ? Date.parse(status.trial.expiresAt) : Infinity
      verifiedLicense = status.connected && entitled && status.license?.active
        ? { status, expiresAt: Math.min(Date.now() + LICENSE_STATUS_TTL_MS, trialExpiry) }
        : null
    }
    if (!status.connected || !(status.lifetime?.active || status.trial?.active) || !status.license?.active || (status.trial?.active && status.license?.kind === 'trial' && status.trial.expiresAt && Date.parse(status.trial.expiresAt) <= Date.now())) {
      throw new LicenseAccessError('Activate an active 1-day trial or lifetime Nafran license in Settings → Account before using this feature.')
    }
    if (feature === 'decisionMaker' && !(status.decisionMaker?.active && status.decisionMaker.available !== false && status.decisionMaker.amount === 300 &&
      status.decisionMaker.interval === 'month' && status.decisionMaker.monthlyLimit === 1000)) {
      throw new LicenseAccessError('Decision Makers requires the $3/month subscription. Subscribe in Settings → Usage.')
    }
  } catch (error) {
    if (error instanceof LicenseAccessError) throw error
    verifiedLicense = null
    throw new LicenseAccessError(`License verification is unavailable. Connect to the billing server and try again. ${error instanceof Error ? error.message : ''}`.trim())
  }
}

export async function billingCheckout(product: 'lifetime' | 'decisionMaker', email: string): Promise<string> {
  if (product === 'decisionMaker') {
    const result = await request<{ url: string }>('/v1/checkout', 'POST', { product }, await installationToken())
    return result.url
  }
  const address = email.trim().toLowerCase()
  if (address.length > 254 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(address)) throw new Error('Enter a valid email address for your lifetime key.')
  const result = await request<{ url: string }>('/v1/checkout', 'POST', { product, email: address }, await installationToken())
  return result.url
}

export async function billingConsumeDecisionMaker(leadId: string): Promise<void> {
  await request('/v1/decision-maker/consume', 'POST', { leadId }, await installationToken())
}

export async function billingRequestTrial(email: string, replaceExisting = false): Promise<{ emailSent: boolean; message: string }> {
  const address = email.trim().toLowerCase()
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(address) || address.length > 254) {
    throw new Error('Enter a valid email address for your trial key.')
  }
  return request<{ emailSent: boolean; message: string }>('/v1/trial', 'POST', { email: address, replaceExisting }, await installationToken())
}

export async function billingPortal(): Promise<string> {
  const result = await request<{ url: string }>('/v1/portal', 'POST', {}, await installationToken())
  return result.url
}

export async function billingActivate(licenseKey: string): Promise<{ active: boolean; email?: string; last4?: string; activatedAt?: string | null }> {
  const key = licenseKey.trim()
  if (!key) throw new Error('Enter your Nafran license key first.')
  const result = await request<{ active: boolean; email?: string; last4?: string; activatedAt?: string | null }>('/v1/activate', 'POST', { licenseKey: key }, await installationToken())
  verifiedLicense = null
  return result
}

export async function billingInvoices(): Promise<BillingInvoice[]> {
  if (!billingUrl()) return []
  const result = await request<{ invoices: BillingInvoice[] }>('/v1/invoices', 'GET', undefined, await installationToken())
  return result.invoices
}
