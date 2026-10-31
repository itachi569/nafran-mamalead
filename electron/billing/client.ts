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
  purchaseError?: string | null
  purchaseEmail?: string | null
  decisionKeyEmail?: string | null
  coreLicenseActive?: boolean
  decisionKeyActive?: boolean
  lifetime?: { amount: number; currency: string; interval: null; active: boolean }
  trial?: { active: boolean; expiresAt: string | null }
  trialRequest?: { requested: boolean; email: string | null; canChangeEmail: boolean }
  mapsLeads?: { used: number | null; limit: number | null; remaining: number | null }
  decisionMaker?: { amount: number; currency: string; interval: string | null; periodDays?: number; available?: boolean; active: boolean; status: string; ownerKind?: 'decision' | 'lifetime'; includedPeople: number; monthlyLimit: number; monthlyUsed: number; monthlyRemaining: number; renewsAt: string | null; periodId?: string | null }
  hasCustomer?: boolean
  license?: { active: boolean; kind?: 'trial' | 'lifetime' | 'decision'; email?: string; last4?: string; activatedAt?: string | null; expiresAt?: string | null }
}

export interface BillingInvoice {
  id: string
  number: string
  issued: string
  total: number
  currency: string
  status: string
  url: string
  pdfUrl?: string
  amountPaid?: number
  description?: string
}

export class LicenseAccessError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'LicenseAccessError'
  }
}

type LicensedFeature = 'lifetime'
const LICENSE_STATUS_TTL_MS = 15_000
let verifiedLicense: { status: BillingStatus; expiresAt: number } | null = null
let pendingLicenseCheck: Promise<BillingStatus> | null = null
let machineIdentity: { id: string; label: string } | null = null
let supportBillingCache:BillingStatus|null=null
export const cachedSupportBilling=()=>supportBillingCache

/** Support keeps structured validation/rate errors and retries the same message ID. */
export async function billingSupportRequest(path:string,body?:unknown,signal?:AbortSignal):Promise<any> {
  const base=billingUrl();if(!base)throw new Error('Support is not configured.')
  signal?.throwIfAborted()
  const token=await new Promise<string>((resolve,reject)=>{
    const abort=()=>reject(new Error('Cancelled'))
    signal?.addEventListener('abort',abort,{once:true})
    installationToken().then(resolve,reject).finally(()=>signal?.removeEventListener('abort',abort))
    if(signal?.aborted)abort()
  }),device=deviceIdentity()
  for(let attempt=0;attempt<(body?2:1);attempt++){
    signal?.throwIfAborted()
    try{
      const response=await fetch(new URL(path,base),{method:body?'POST':'GET',redirect:'error',headers:{authorization:`Bearer ${token}`,'content-type':'application/json','x-nafran-device-id':device.id,'x-nafran-device-platform':device.label},body:body?JSON.stringify(body):undefined,signal:AbortSignal.any([AbortSignal.timeout(15000),...(signal?[signal]:[])])})
      const result=await response.json().catch(()=>({message:'Support returned an incomplete response.'}))
      if(response.ok)return result
      const error=Object.assign(new Error(result.message || result.error || 'Support is temporarily unavailable.'),{status:response.status,field:result.field,retryAfterSeconds:result.retryAfterSeconds})
      if(![502,503,504].includes(response.status)||attempt===1||!body)throw error
    }catch(error){if(signal?.aborted)throw error;const status=(error as {status?:number}).status;if(attempt===1||!body||(status&&! [502,503,504].includes(status)))throw error}
    await new Promise<void>((resolve,reject)=>{const end=()=>{clearTimeout(timer);signal?.removeEventListener('abort',abort)};const abort=()=>{end();reject(new Error('Cancelled'))};const timer=setTimeout(()=>{end();resolve()},1500);signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort()})
  }
  throw new Error('Support is temporarily unavailable.')
}

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

async function request<T>(path: string, method = 'GET', body?: unknown, token?: string, timeoutMs = 20_000): Promise<T> {
  const base = billingUrl()
  if (!base) throw new Error('Billing server is not configured for this build.')
  const device = deviceIdentity()
  const signal = AbortSignal.timeout(timeoutMs)
  const attempts = path === '/v1/assist/chat' ? 2 : 1
  for (let attempt=0;attempt<attempts;attempt++) {
  const response = await fetch(new URL(path, base), {
    method,
    headers: { 'x-nafran-device-id': device.id, 'x-nafran-device-platform': device.label,
      ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    redirect: 'error',
    signal,
  })
  if ([502,503,504].includes(response.status)) {
    await response.body?.cancel()
    if (attempt+1<attempts) continue
    throw new Error('MamaLead service is temporarily unavailable. Please retry shortly.')
  }
  if (!response.headers.get('content-type')?.includes('application/json')) {
    await response.body?.cancel()
    throw new Error('MamaLead service returned an unexpected response. Please retry shortly.')
  }
  let result: T & {error?:string}
  try { result = await response.json() } catch { throw new Error('MamaLead service returned an incomplete response. Please retry.') }
  if (!response.ok) throw new Error(result.error || `MamaLead service returned HTTP ${response.status}. Please retry.`)
  return result
  }
  throw new Error('MamaLead service is temporarily unavailable. Please retry shortly.')
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
    const status=await request<BillingStatus>('/v1/status', 'GET', undefined, await installationToken())
    supportBillingCache=status
    return status
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
      const entitled = status.coreLicenseActive ?? Boolean(status.license?.active && status.license.kind !== 'decision')
      const trialExpiry = status.trial?.active && status.trial.expiresAt ? Date.parse(status.trial.expiresAt) : Infinity
      verifiedLicense = status.connected && entitled && status.license?.active
        ? { status, expiresAt: Math.min(Date.now() + LICENSE_STATUS_TTL_MS, trialExpiry) }
        : null
    }
    const coreActive = status.coreLicenseActive ?? Boolean(status.license?.active && status.license.kind !== 'decision')
    const entitlement = coreActive && (status.lifetime?.active || status.trial?.active)
    if (feature !== 'lifetime' || !status.connected || !entitlement || (status.trial?.active && status.trial.expiresAt && Date.parse(status.trial.expiresAt) <= Date.now())) {
      throw new LicenseAccessError('Activate an active 1-day trial or lifetime MamaLead license in Settings → Account before using this feature.')
    }
  } catch (error) {
    if (error instanceof LicenseAccessError) throw error
    verifiedLicense = null
    throw new LicenseAccessError(`License verification is unavailable. Connect to the billing server and try again. ${error instanceof Error ? error.message : ''}`.trim())
  }
}

export interface MapsReservation {
  reservationId: string | null
  allowed: number
  used: number | null
  remaining: number | null
}

export async function billingReserveMaps(requested: number): Promise<MapsReservation> {
  return request<MapsReservation>('/v1/maps/reserve', 'POST', { requested }, await installationToken())
}

export async function billingHeartbeatMaps(reservationId: string): Promise<void> {
  await request('/v1/maps/heartbeat', 'POST', { reservationId }, await installationToken())
}

export async function billingSettleMaps(reservationId: string, captured: number): Promise<{ accepted: number; used: number; remaining: number }> {
  return request('/v1/maps/settle', 'POST', { reservationId, captured }, await installationToken())
}

export async function billingCheckout(product: 'lifetime', email: string): Promise<string> {
  if (product !== 'lifetime') throw new Error('This product is no longer available in this app.')
  if (!email.trim()) {
    const result = await request<{ url: string }>('/v1/checkout', 'POST', { product }, await installationToken())
    return result.url
  }
  const address = email.trim().toLowerCase()
  if (address.length > 254 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(address)) throw new Error('Enter a valid email address for your lifetime key.')
  const result = await request<{ url: string }>('/v1/checkout', 'POST', { product, email: address }, await installationToken())
  return result.url
}

export async function billingRequestTrial(email: string, replaceExisting = false): Promise<{ emailSent: boolean; message: string }> {
  const address = email.trim().toLowerCase()
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(address) || address.length > 254) {
    throw new Error('Enter a valid email address for your trial key.')
  }
  const status = await request<BillingStatus>('/v1/status', 'GET', undefined, await installationToken())
  if (status.lifetime?.active || (status.license?.active && status.license.kind === 'lifetime')) throw new Error('Lifetime access is already active. You do not need a trial.')
  return request<{ emailSent: boolean; message: string }>('/v1/trial', 'POST', { email: address, replaceExisting }, await installationToken())
}

export async function billingPortal(): Promise<string> {
  const result = await request<{ url: string }>('/v1/portal', 'POST', {}, await installationToken())
  return result.url
}

export async function billingActivate(licenseKey: string): Promise<{ active: boolean; email?: string; last4?: string; activatedAt?: string | null }> {
  const key = licenseKey.trim()
  if (!key) throw new Error('Enter your MamaLead license key first.')
  const result = await request<{ active: boolean; email?: string; last4?: string; activatedAt?: string | null }>('/v1/activate', 'POST', { licenseKey: key }, await installationToken())
  verifiedLicense = null
  return result
}

export async function billingInvoices(): Promise<BillingInvoice[]> {
  if (!billingUrl()) return []
  const result = await request<{ invoices: BillingInvoice[] }>('/v1/invoices', 'GET', undefined, await installationToken())
  return result.invoices
}

export async function billingPaymentDetails(): Promise<{ card: { brand: string; last4: string; expiryMonth: number | null; expiryYear: number | null; holder: string } | null }> {
  return request('/v1/payment-details', 'GET', undefined, await installationToken())
}

/** Server-managed AI reuses the device-bound installation identity. */
export async function billingAssistStatus(): Promise<{ configured: boolean; savedOnDevice: boolean }> {
  return request('/v1/assist/status', 'GET', undefined, await installationToken())
}
export async function billingAssistChat(payload: unknown): Promise<{ text: string; model: string }> {
  return request('/v1/assist/chat', 'POST', payload, await installationToken(), 45_000)
}
