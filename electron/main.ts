import { app, BrowserWindow, dialog, ipcMain, Notification, safeStorage, shell } from 'electron'
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, type BrowserContext } from 'playwright'
import { autoUpdater } from 'electron-updater'
import { AUTOMATION_ARGS, IGNORED_DEFAULT_ARGS, chromeUserAgent } from './scraper/browser'
import { ScrapeRunner } from './scraper/runner'
import { normaliseQuery, type StartRunRequest } from './scraper/types'
import { closeDatabase, openDatabase } from './db'
import { registerLocalDatabase } from './db/ipc'
import { EnrichmentRunner } from './enrichment/runner'
import { checkKey } from './enrichment/dataforseo'
import { isUsableEmail, isUsablePerson } from './enrichment/website'
import { readApifyCredential, readDataForSeoCredential, readMailVerifierCredential } from './runtime-config'
import { askAssist, type AssistChatRequest } from './assist'
import { readLeadsAngelBundle, verifyEmailAddressesWithLeadsAngel, type LeadsAngelCredentials } from './leadsangel'
import { billingAssistStatus, billingActivate, billingCheckout, billingConsumeDecisionMaker, billingHeartbeatMaps, billingInvoices, billingPortal, billingRequestTrial, billingReserveMaps, billingSettleMaps, billingStatus, requireActiveLicense } from './billing/client'
import {
  DEFAULT_APIFY_EMAIL_ACTOR,
  parseApifyEmailResult,
  runEmailVerificationBatches,
  verifyEmailAddress,
  verifyEmailAddressesWithApify,
  type EmailVerificationBatchProgress,
  type EmailValidityProvider,
  type EmailValidityResult,
} from './email-verifier'

const devUrl = process.env.VITE_DEV_SERVER_URL
const decisionSubscribeLink = 'mamalead://subscribe/decision-makers'
const billingReturnLink = 'mamalead://billing'
let pendingBillingReturn = process.argv.includes(billingReturnLink)
let pendingDecisionSubscribe = process.argv.includes(decisionSubscribeLink)
const ownsInstance = app.requestSingleInstanceLock()
if (!ownsInstance) app.quit()
if (ownsInstance) {
  const receiveSubscribeLink = (url: string) => {
    if (url !== decisionSubscribeLink && url !== billingReturnLink) return
    if (url === billingReturnLink) pendingBillingReturn = true
    else pendingDecisionSubscribe = true
    const window = BrowserWindow.getAllWindows()[0]
    if (!window) return
    if (window.isMinimized()) window.restore()
    window.show()
    window.focus()
    window.webContents.send(url === billingReturnLink ? 'billing:return-handoff' : 'billing:decision-subscribe-handoff')
  }
  app.on('second-instance', (_event, args) => {
    if (args.includes(decisionSubscribeLink)) receiveSubscribeLink(decisionSubscribeLink)
    if (args.includes(billingReturnLink)) receiveSubscribeLink(billingReturnLink)
  })
  app.on('open-url', (event, url) => { event.preventDefault(); receiveSubscribeLink(url) })
}
const runner = new ScrapeRunner()
let enricher: EnrichmentRunner | null = null

/**
 * The DataForSEO credential, held in memory for as long as the app is open.
 *
 * It reaches the main process only when the window hands it over, it is never written to a file,
 * and it goes when the app closes. That way the half of the app that talks to a paid service cannot
 * leak a key it does not keep — the copy that survives a restart is the user's own, in their own
 * settings.
 *
 * A machine that would rather supply it from the environment can: DATAFORSEO_API_KEY is read once
 * at launch, or DATAFORSEO_API_KEY_FILE can point at a host-mounted secret file. Anything the user
 * saves in Settings takes over from there for the current session.
 */
const runtimeCredential = readDataForSeoCredential()
let deepApiKey = runtimeCredential.value
let deepKeyFromEnvironment = runtimeCredential.fromEnvironment
const mailVerifierCredential = readMailVerifierCredential()
let mailVerifierApiKey = mailVerifierCredential.value
let mailVerifierFromEnvironment = mailVerifierCredential.fromEnvironment
const apifyCredential = readApifyCredential()
let apifyApiToken = apifyCredential.value
let apifyFromEnvironment = apifyCredential.fromEnvironment
let leadsAngelCredentials: LeadsAngelCredentials | null = null
let mockEmailVerifierRequests = 0
let mockEmailVerifierDelayMs = 0
let mockEmailVerifierUnknown = false
let emailValidityBusy = false
let emailValidityController: AbortController | null = null

type EmailValidityProgress = EmailVerificationBatchProgress & {
  state: 'idle' | 'running' | 'cancelling' | 'completed' | 'cancelled' | 'failed'
  message: string
}
let emailValidityProgress: EmailValidityProgress = {
  state: 'idle', message: '', total: 0, checked: 0, failed: 0, pending: 0, retries: 0, batchSize: 0,
}

function setEmailValidityProgress(patch: Partial<EmailValidityProgress>): void {
  emailValidityProgress = { ...emailValidityProgress, ...patch }
  broadcast('emailValidity:progress', emailValidityProgress)
}

type UpdateState = {
  state: 'disabled' | 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'not-available' | 'error'
  version: string | null
  percent: number | null
  message: string
}

function readUpdateFeedUrl(): string {
  const fromEnvironment = (process.env.LEADSNAP_UPDATE_URL ?? '').trim()
  let configured = fromEnvironment
  try {
    if (!configured) {
      const file = JSON.parse(readFileSync(join(__dirname, 'update-config.json'), 'utf8')) as { feedUrl?: unknown }
      configured = typeof file.feedUrl === 'string' ? file.feedUrl.trim() : ''
    }
  } catch {
    // A source checkout has no embedded feed until a configured build is made.
  }
  if (!configured) return ''
  try {
    const url = new URL(configured)
    const localTestFeed = url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)
    if ((!localTestFeed && url.protocol !== 'https:') || url.username || url.password || url.search || url.hash) return ''
    if (!url.pathname.endsWith('/')) url.pathname += '/'
    return url.toString()
  } catch {
    return ''
  }
}

const updateFeedUrl = readUpdateFeedUrl()
const storeManagedUpdates = process.windowsStore === true
const updateDisabledMessage = storeManagedUpdates
  ? 'Updates are managed automatically by Microsoft Store.'
  : !updateFeedUrl
  ? 'Auto-updates are not configured for this build.'
  : 'Update checks are available in the installed app.'
let updateState: UpdateState = {
  state: app.isPackaged && updateFeedUrl && !storeManagedUpdates ? 'idle' : 'disabled',
  version: null,
  percent: null,
  message: app.isPackaged && updateFeedUrl && !storeManagedUpdates ? 'Updates are ready to check.' : updateDisabledMessage,
}

function updateStatus(): UpdateState {
  return { ...updateState }
}

function broadcastUpdateStatus(): void {
  broadcast('updates:status', updateStatus())
}

function setUpdateState(patch: Partial<UpdateState>): UpdateState {
  updateState = { ...updateState, ...patch }
  broadcastUpdateStatus()
  return updateStatus()
}

function configureAutoUpdater(): void {
  if (!app.isPackaged || !updateFeedUrl || storeManagedUpdates) return

  autoUpdater.setFeedURL({ provider: 'generic', url: updateFeedUrl, useMultipleRangeRequest: false })
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.on('checking-for-update', () => setUpdateState({ state: 'checking', message: 'Checking for a newer version…', percent: null }))
  autoUpdater.on('update-available', (info) => {
    setUpdateState({ state: 'available', version: info.version, message: `Version ${info.version} is available to download.`, percent: null })
  })
  autoUpdater.on('download-progress', (progress) =>
    setUpdateState({ state: 'downloading', percent: Math.round(progress.percent), message: `Downloading update — ${Math.round(progress.percent)}%.` }),
  )
  autoUpdater.on('update-downloaded', (info) => {
    setUpdateState({ state: 'ready', version: info.version, percent: 100, message: `Version ${info.version} is ready. Restart to install it.` })
  })
  autoUpdater.on('update-not-available', () => setUpdateState({ state: 'not-available', percent: null, message: 'You are using the latest version.' }))
  autoUpdater.on('error', (error) => setUpdateState({ state: 'error', percent: null, message: error.message || 'The update check failed.' }))
}

async function checkForUpdate(): Promise<UpdateState> {
  if (!app.isPackaged || !updateFeedUrl || storeManagedUpdates) return setUpdateState({ state: 'disabled', message: updateDisabledMessage })
  if (updateState.state === 'checking' || updateState.state === 'downloading' || updateState.state === 'ready') return updateStatus()
  setUpdateState({ state: 'checking', version: null, percent: null, message: 'Checking for a newer version…' })
  try {
    await autoUpdater.checkForUpdates()
  } catch (error) {
    return setUpdateState({ state: 'error', message: error instanceof Error ? error.message : 'The update check failed.' })
  }
  return updateStatus()
}

/** Google's own sign-in page, pointed at Maps the way Maps' own "Sign in" button points at it. */
const GOOGLE_SIGN_IN = 'https://accounts.google.com/ServiceLogin?continue=https%3A%2F%2Fwww.google.com%2Fmaps&hl=en'

/** Whether the saved profile is signed in, once that has been read. Null until it is known. */
let googleSession: boolean | null = null
/**
 * The app's own browser, open and waiting for a run.
 *
 * A run started from the window goes through the Google gate first, and the browser that takes the
 * sign-in is the browser the run then uses — one window, opened once. It stays here between the
 * sign-in and the scrape so nothing has to close it and open it again, and it is closed when the
 * run that claimed it ends, when the app quits, or when the user closes it themselves.
 */
let armedBrowser: BrowserContext | null = null
/** The program that browser was opened with, so a run it takes is driven by the same one. */
let armedExecutable = ''
/**
 * The same browser while it is still being signed in to.
 *
 * A browser only becomes the armed one once an account is in it and a run can use it, but the
 * automated check has to see it during the wait as well — that wait is the whole point of the gate.
 * This is the reference used for that, and the test hooks below are the only things that read it.
 */
let gateBrowser: BrowserContext | null = null
/** What the gate is doing, step by step, for the automated check. Idle when no gate is running. */
let gateStage = 'idle'

/**
 * The automated checks' own door into the app, and the only one.
 *
 * A check that drives the renderer over the DevTools protocol — every suite in `scripts/` — can
 * reach nothing in this process, and a check cannot sign in to a real Google account. This one call
 * writes the session cookie a sign-in would have left in the saved profile, so a suite can drive a
 * real run through the gate. It is refused outright unless the app was started with the flag, so a
 * packaged build answers nothing whatever the caller asks.
 */
ipcMain.handle('app:testHook', async (_event, name: string) => {
  if (process.env.LEADSNAP_TEST_HOOKS !== '1') {
    throw new Error('This build does not offer test hooks.')
  }
  if (name === 'seedGoogleSession') {
    return (globalThis as unknown as { __leadsnapTest?: { seedSession?: () => Promise<boolean> } }).__leadsnapTest
      ?.seedSession?.()
  }
  if (name === 'mockOneEmailValidity') {
    mockEmailVerifierRequests = 1
    mockEmailVerifierDelayMs = 0
    mockEmailVerifierUnknown = false
    return true
  }
  if (name === 'mockUnknownEmailValidity') {
    mockEmailVerifierRequests = 1
    mockEmailVerifierDelayMs = 0
    mockEmailVerifierUnknown = true
    return true
  }
  if (name === 'mockSlowEmailValidity') {
    mockEmailVerifierRequests = 1
    mockEmailVerifierDelayMs = 250
    return true
  }
  throw new Error(`Unknown test hook: ${name}`)
})

/** Progress of a scrape or an enrichment pass, forwarded to whichever windows are open. */
function broadcast(channel: string, payload: unknown): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.webContents.isDestroyed()) window.webContents.send(channel, payload)
  }
}

/**
 * Where the Google sign-in is kept.
 *
 * The app's own folder, beside the database, so it survives updates and stays where a desktop app
 * keeps its things. Deliberately not the user's Chrome profile on disk: Chrome would have to be
 * closed to use it, an automated run would be writing to the profile they browse with, and this
 * app has no business reading their history to scrape a public page.
 */
function googleProfileDir(): string {
  return join(app.getPath('userData'), 'google-profile')
}

/** Google's session cookies. Any one of these means an account is signed in, whichever it is. */
const GOOGLE_SESSION_COOKIES = new Set(['SID', 'HSID', 'SSID', 'SAPISID', '__Secure-1PSID', '__Secure-3PSID'])

function hasGoogleSession(cookies: { name: string; domain: string }[]): boolean {
  return cookies.some((cookie) => GOOGLE_SESSION_COOKIES.has(cookie.name) && /(^|\.)google\.com$/.test(cookie.domain))
}

/** A launcher for the saved profile, shared by the sign-in window and the status read. */
function profileLaunchOptions(headless: boolean, executablePath?: string) {
  return {
    headless,
    userAgent: chromeUserAgent(),
    ignoreDefaultArgs: IGNORED_DEFAULT_ARGS,
    args: AUTOMATION_ARGS,
    ...(executablePath ? { executablePath } : {}),
  }
}

/**
 * Makes the sign-in outlive the window that made it.
 *
 * A cookie without an expiry is a session cookie, and a browser throws those away when it exits —
 * some of Google's are exactly that. They are written back here with a year on them, which is what
 * turns "sign in once" into the truth: Google reissues them on every request, so the expiry is only
 * ever a floor under the account staying signed in.
 */
async function keepSessionCookies(context: BrowserContext): Promise<void> {
  const year = Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60
  try {
    const cookies = (await context.cookies()).filter(
      (cookie) => cookie.expires <= 0 && /(^|\.)google\.com$/.test(cookie.domain),
    )
    if (!cookies.length) return
    await context.addCookies(cookies.map((cookie) => ({ ...cookie, expires: year })))
  } catch {
    // Worth trying, never worth failing the sign-in over: the account is signed in either way.
  }
}

/**
 * Waits for the account to be signed in.
 *
 * Google's own page takes the email and the password; all this app ever sees is the session cookie
 * that lands in the profile afterwards. The loop watches for one, and the delay before it answers
 * gives Google's redirect time to land. Closing the window first is the user saying they are done
 * without signing in, and the browser is left closed either way.
 *
 * The wait is abortable because it sits between the run button and the run: pressing Stop while the
 * sign-in window is open has to end the attempt, not leave it holding the profile folder.
 */
async function waitForGoogleAccount(
  context: BrowserContext,
  signal: AbortSignal,
  timeoutMs = 15 * 60 * 1000,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  let closed = false
  context.once('close', () => {
    closed = true
  })
  const gone = () => closed || context.isClosed() || !context.pages().length || signal.aborted
  while (!gone() && Date.now() < deadline) {
    if (hasGoogleSession(await context.cookies().catch(() => []))) {
      await new Promise((resolve) => setTimeout(resolve, 4_000))
      return true
    }
    await new Promise((resolve) => setTimeout(resolve, 1_500))
  }
  return false
}

/**
 * Opens the app's own browser on Google's sign-in page and keeps it open for the run.
 *
 * This is the browser the app runs in, not the one the user browses with: it is the app's own
 * profile folder, opened from the app's own data directory, and it is the same folder every run
 * starts from. Nothing signs in on the user's behalf — the account chooser, the password and the
 * second factor are Google's own page in a window they drive — and what is kept afterwards is the
 * cookie jar that page leaves behind.
 *
 * The window is deliberately left open. The caller hands it to the run, which carries on in it.
 */
async function armGoogleBrowser(
  signal: AbortSignal,
  executablePath: string,
): Promise<{ context: BrowserContext } | { closed: true }> {
  if (armedBrowser && !armedBrowser.isClosed()) return { context: armedBrowser }
  const dir = googleProfileDir()
  mkdirSync(dir, { recursive: true })
  gateStage = 'opening the browser'
  let context: BrowserContext
  try {
    context = await chromium.launchPersistentContext(dir, {
      ...profileLaunchOptions(false, executablePath || undefined),
      viewport: { width: 1280, height: 860 },
      // The automated check drives this browser through the protocol rather than through
      // Playwright, which has no handle on a browser the app opened. A normal launch passes
      // nothing, so nothing is listening.
      ...(process.env.LEADSNAP_TEST_HOOKS === '1' ? { args: [...AUTOMATION_ARGS, '--remote-debugging-port=0'] } : {}),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    gateStage = `could not open: ${message}`
    throw new Error(
      `The app's browser could not open: ${message} If another window already has this profile, close it and run again.`,
    )
  }
  gateStage = 'waiting for the sign-in'
  gateBrowser = context
  const page = context.pages()[0] ?? (await context.newPage())
  // A failure to load Google's page is not fatal: the window is open, so the user can navigate and
  // the run reports what happened rather than leaving a window nobody can explain.
  await page.goto(GOOGLE_SIGN_IN, { waitUntil: 'domcontentloaded' }).catch(() => undefined)
  const signedIn = await waitForGoogleAccount(context, signal)
  if (!signedIn) {
    gateStage = 'the window was closed before an account was signed in'
    gateBrowser = null
    await context.close().catch(() => undefined)
    return { closed: true }
  }
  await keepSessionCookies(context)
  armedBrowser = context
  armedExecutable = executablePath
  gateStage = 'connected'
  context.once('close', () => {
    if (armedBrowser === context) armedBrowser = null
  })
  googleSession = true
  gateBrowser = null
  return { context }
}

/**
 * Whether the saved profile holds a signed-in account.
 *
 * Read from the profile itself rather than remembered from the sign-in window, because a profile
 * signed in on an earlier launch is still signed in now. Reading it means opening it, so it is only
 * done when nothing else holds the folder, and the answer is kept for the session. A browser that
 * is already open is read where it stands: opening the folder a second time is exactly what a
 * profile cannot do.
 */
async function googleSignedIn(): Promise<boolean> {
  if (armedBrowser && !armedBrowser.isClosed()) {
    googleSession = hasGoogleSession(await armedBrowser.cookies().catch(() => []))
    return googleSession
  }
  if (googleSession !== null) return googleSession
  if (runner.busy) return false
  let context: BrowserContext | null = null
  try {
    context = await chromium.launchPersistentContext(googleProfileDir(), profileLaunchOptions(true))
    googleSession = hasGoogleSession(await context.cookies().catch(() => []))
    return googleSession
  } catch {
    return false
  } finally {
    await context?.close().catch(() => undefined)
  }
}

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 980,
    minHeight: 680,
    backgroundColor: '#ededde',
    title: 'MamaLead',
    show: false,
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  window.once('ready-to-show', () => window.show())
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url)
    return { action: 'deny' }
  })
  if (devUrl) void window.loadURL(devUrl)
  else void window.loadFile(join(__dirname, '../dist/index.html'))
  return
}

ipcMain.handle('app:info', () => ({
  version: app.getVersion(),
  platform: process.platform,
  isPackaged: app.isPackaged,
  electron: process.versions.electron,
}))

function stripePage(raw: string, allowed: string[]): string {
  const url = new URL(raw)
  if (url.protocol !== 'https:' || !allowed.includes(url.hostname) || url.username || url.password) {
    throw new Error('Billing server returned an unexpected Stripe URL.')
  }
  return url.toString()
}

ipcMain.handle('billing:status', () => billingStatus())
ipcMain.handle('billing:claim-return-handoff', () => {
  const pending = pendingBillingReturn
  pendingBillingReturn = false
  return pending
})
ipcMain.handle('billing:claim-decision-subscribe-handoff', () => {
  const claimed = pendingDecisionSubscribe
  pendingDecisionSubscribe = false
  return claimed
})
ipcMain.handle('billing:request-trial', (_event, payload: { email: string; replaceExisting?: boolean } | string) =>
  billingRequestTrial(typeof payload === 'string' ? payload : payload.email, typeof payload === 'string' ? false : payload.replaceExisting === true))
ipcMain.handle('billing:checkout', async (_event, payload: { product: 'lifetime' | 'decisionMaker'; email: string }) => {
  const url = stripePage(await billingCheckout(payload.product, payload.email), ['checkout.stripe.com'])
  await shell.openExternal(url)
  return { opened: true }
})
ipcMain.handle('billing:activate', async (_event, licenseKey: string) => {
  const result = await billingActivate(licenseKey)
  if (result.active) void enricher?.drain()
  return result
})
ipcMain.handle('billing:portal', async () => {
  const url = stripePage(await billingPortal(), ['billing.stripe.com'])
  await shell.openExternal(url)
  return { opened: true }
})
ipcMain.handle('billing:invoices', () => billingInvoices())
ipcMain.handle('billing:openInvoice', async (_event, raw: string) => {
  const url = stripePage(raw, ['invoice.stripe.com', 'pay.stripe.com'])
  await shell.openExternal(url)
  return { opened: true }
})

ipcMain.handle('updates:status', () => updateStatus())
ipcMain.handle('updates:check', () => checkForUpdate())
ipcMain.handle('updates:download', async () => {
  if (!app.isPackaged || !updateFeedUrl || storeManagedUpdates) return setUpdateState({ state: 'disabled', message: updateDisabledMessage })
  if (updateState.state !== 'available') return updateStatus()
  try {
    setUpdateState({ state: 'downloading', message: 'Downloading the update…', percent: 0 })
    await autoUpdater.downloadUpdate()
  } catch (error) {
    return setUpdateState({ state: 'error', message: error instanceof Error ? error.message : 'The update download failed.' })
  }
  return updateStatus()
})
ipcMain.handle('updates:install', () => {
  if (updateState.state !== 'ready') return { started: false }
  autoUpdater.quitAndInstall()
  return { started: true }
})

/** Sends a short OS notification without exposing any renderer or filesystem access. */
ipcMain.handle('notifications:show', (_event, payload: { title?: string; body?: string } = {}) => {
  if (!Notification.isSupported()) return { shown: false }
  const title = String(payload.title ?? 'MamaLead').trim().slice(0, 120) || 'MamaLead'
  const body = String(payload.body ?? '').trim().slice(0, 500)
  if (!body) return { shown: false }
  new Notification({ title, body }).show()
  return { shown: true }
})

/** MamaLead Assist uses the authenticated server; no provider key is distributed. */
ipcMain.handle('assist:status', () => billingAssistStatus())
ipcMain.handle('assist:test', () => askAssist({ messages: [{ role: 'user', content: 'Say hello in one short sentence.' }] })
  .then(({ model }) => ({ connected: true, model })))
ipcMain.handle('assist:chat', (_event, payload: AssistChatRequest = {}) => askAssist(payload))

type EmailValiditySummary = {
  configured: boolean
  provider: EmailValidityProvider
  checked: number
  updated: number
  valid: number
  invalid: number
  risky: number
  unknown: number
  skipped: number
  limited: number
  failed: number
  cancelled: boolean
}

function savedLeadsAngelPath(): string {
  return join(app.getPath('userData'), 'secrets', 'leadsangel.enc')
}

function importLeadsAngelZip(path: string): { configured: boolean; expiresOn: string | null } {
  if (emailValidityBusy) throw new Error('Wait for the current email check to finish before importing a license.')
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Secure license storage is unavailable on this machine.')
  const credentials = readLeadsAngelBundle(path)
  mkdirSync(join(app.getPath('userData'), 'secrets'), { recursive: true })
  writeFileSync(savedLeadsAngelPath(), safeStorage.encryptString(JSON.stringify(credentials)), { mode: 0o600 })
  leadsAngelCredentials = credentials
  return { configured: true, expiresOn: credentials.expiresOn }
}

ipcMain.handle('emailValidity:importLeadsAngelZip', async () => {
  const selection = await dialog.showOpenDialog({
    title: 'Import LeadsAngel SMTP verification ZIP',
    properties: ['openFile'],
    filters: [{ name: 'ZIP archive', extensions: ['zip'] }],
  })
  if (selection.canceled || !selection.filePaths[0]) return { configured: Boolean(leadsAngelCredentials), expiresOn: leadsAngelCredentials?.expiresOn ?? null }
  return importLeadsAngelZip(selection.filePaths[0])
})

ipcMain.handle('emailValidity:removeLeadsAngel', () => {
  if (emailValidityBusy) throw new Error('Wait for the current email check to finish before removing a license.')
  if (existsSync(savedLeadsAngelPath())) unlinkSync(savedLeadsAngelPath())
  leadsAngelCredentials = null
  return { configured: false, expiresOn: null }
})

ipcMain.handle('emailValidity:status', () => ({
  configured: Boolean(leadsAngelCredentials || apifyApiToken || mailVerifierApiKey),
  fromEnvironment: leadsAngelCredentials ? false : apifyApiToken ? apifyFromEnvironment : mailVerifierFromEnvironment,
  provider: leadsAngelCredentials ? 'leadsangel' : apifyApiToken ? 'apify' : mailVerifierApiKey ? 'mailverifier' : null,
  leadsAngelConfigured: Boolean(leadsAngelCredentials),
  leadsAngelExpiresOn: leadsAngelCredentials?.expiresOn ?? null,
  progress: emailValidityProgress,
}))

ipcMain.handle('emailValidity:cancel', () => {
  if (!emailValidityController || !emailValidityBusy) return { cancelled: false }
  emailValidityController.abort(new DOMException('Cancelled', 'AbortError'))
  setEmailValidityProgress({ state: 'cancelling', message: 'Stopping email validity check…' })
  return { cancelled: true }
})

/**
 * Verifies the pending email contacts shown by Email Finder. Each unique address costs one provider
 * credit even when the same address belongs to several leads. LeadsAngel and Apify receive
 * small batches; MailVerifier remains available as a configured fallback.
 */
ipcMain.handle(
  'emailValidity:verify',
  async (_event, payload: { leadIds?: string[]; contactIds?: string[]; force?: boolean; recheckUnknown?: boolean } = {}): Promise<EmailValiditySummary> => {
    await requireActiveLicense()
    if (emailValidityBusy) throw new Error('An email validity check is already running. Please wait for it to finish.')
    emailValidityBusy = true
    emailValidityController = new AbortController()
    setEmailValidityProgress({ state: 'running', message: 'Preparing email validity check…', total: 0, checked: 0, failed: 0, pending: 0, retries: 0, batchSize: 0 })
    try {
    const leadsAngel = leadsAngelCredentials
    if (payload.recheckUnknown && !leadsAngel) throw new Error('Import the LeadsAngel ZIP in Settings → Account to recheck Unknown emails.')
    const provider: EmailValidityProvider | null = payload.recheckUnknown
      ? 'leadsangel'
      : mockEmailVerifierRequests > 0
      ? 'apify'
      : leadsAngel
        ? 'leadsangel'
        : apifyApiToken
        ? 'apify'
        : mailVerifierApiKey
          ? 'mailverifier'
          : null
    if (!provider) throw new Error('Email verification is not configured. Import a LeadsAngel ZIP in Settings → Account.')
    const { db, repository } = openDatabase()
    const workspace = db.ensureWorkspace()
    const contactIds = new Set((payload.contactIds ?? []).map(String))
    const all = repository.listContacts(workspace.id, 'email', payload.leadIds) as {
      id: string
      value: string
      validation_status?: string | null
    }[]
    const scoped = all.filter((row) => !contactIds.size || contactIds.has(String(row.id)))
    const selected = scoped.filter((row) => payload.recheckUnknown ? row.validation_status === 'unknown' : payload.force || !row.validation_status)
    const skipped = scoped.length - selected.length
    const byAddress = new Map<string, typeof selected>()
    for (const row of selected) {
      const address = String(row.value ?? '').trim().toLowerCase()
      if (!address) continue
      const matches = byAddress.get(address) ?? []
      matches.push(row)
      byAddress.set(address, matches)
    }
    const entries = Array.from(byAddress.entries())
    const limited = Math.max(0, entries.length - 100)
    const queue = entries.slice(0, 100)
    const summary: EmailValiditySummary = {
      configured: true,
      provider,
      checked: 0,
      updated: 0,
      valid: 0,
      invalid: 0,
      risky: 0,
      unknown: 0,
      skipped,
      limited,
      failed: 0,
      cancelled: false,
    }

    setEmailValidityProgress({ total: queue.length, pending: queue.length, message: queue.length ? `Checking 0 of ${queue.length} emails…` : 'No unchecked emails in this pass.' })

    const save = (rows: typeof selected, result: EmailValidityResult) => {
      for (const row of rows) repository.updateEmailValidation(row.id, result)
      summary.checked += 1
      summary.updated += rows.length
      summary[result.status] += 1
    }
    if (queue.length) {
      if (mockEmailVerifierRequests > 0) {
        mockEmailVerifierRequests -= 1
        for (const [address, rows] of queue) {
          if (mockEmailVerifierDelayMs) await new Promise((resolve) => setTimeout(resolve, mockEmailVerifierDelayMs))
          if (emailValidityController.signal.aborted) break
          const mockResult = parseApifyEmailResult(address, mockEmailVerifierUnknown ? {
            email: address,
            status: 'unknown',
            mailboxStatus: 'unknown',
            hasMx: true,
            deliverabilityScore: 70,
            reasons: ['Live mailbox check could not complete'],
          } : {
            email: address,
            status: 'valid',
            mailboxStatus: 'accepted',
            mailboxExists: true,
            deliverabilityScore: 96,
            reasons: ['Mailbox accepted the address'],
          })
          save(rows, mockResult)
          setEmailValidityProgress({ checked: summary.checked, pending: queue.length - summary.checked, message: `Checking ${summary.checked} of ${queue.length} emails…` })
        }
        mockEmailVerifierDelayMs = 0
        mockEmailVerifierUnknown = false
      } else if (provider === 'leadsangel' && leadsAngel) {
        const outcome = await runEmailVerificationBatches(
          queue.map(([address]) => address),
          async (batch, signal) => {
            await requireActiveLicense('lifetime', false)
            return verifyEmailAddressesWithLeadsAngel(leadsAngel, batch, signal, (message) => setEmailValidityProgress({ message }))
          },
          {
            signal: emailValidityController.signal,
            batchSize: 2,
            onResult: (result) => {
              const rows = byAddress.get(result.email.toLowerCase())
              if (rows) save(rows, result)
            },
            onProgress: (progress) => setEmailValidityProgress({
              ...progress,
              message: `LeadsAngel SMTP: ${progress.checked} of ${progress.total} checked · ${progress.failed} need retry.`,
            }),
          },
        )
        summary.failed = outcome.failed.length
      } else if (provider === 'apify') {
        const outcome = await runEmailVerificationBatches(
          queue.map(([address]) => address),
          async (batch, signal) => {
            await requireActiveLicense('lifetime', false)
            return verifyEmailAddressesWithApify(
              apifyApiToken, batch, process.env.APIFY_EMAIL_VERIFIER_ACTOR?.trim() || DEFAULT_APIFY_EMAIL_ACTOR, signal,
            )
          },
          {
            signal: emailValidityController.signal,
            onResult: (result) => {
              const rows = byAddress.get(result.email.toLowerCase())
              if (rows) {
                save(rows, result)
              }
            },
            onProgress: (progress) => setEmailValidityProgress({
              ...progress,
              message: progress.batchSize
                ? `Checking ${progress.checked} of ${progress.total} emails · batch of ${progress.batchSize} · ${progress.retries} retries…`
                : `Checked ${progress.checked} of ${progress.total} emails · ${progress.failed} need retry.`,
            }),
          },
        )
        summary.failed = outcome.failed.length
      } else {
        for (const [address, rows] of queue) {
          if (emailValidityController.signal.aborted) break
          await requireActiveLicense('lifetime', false)
          let result: EmailValidityResult
          try {
            result = await verifyEmailAddress(mailVerifierApiKey, address)
          } catch {
            summary.failed += 1
            setEmailValidityProgress({ checked: summary.checked, failed: summary.failed, pending: queue.length - summary.checked - summary.failed, message: `Checked ${summary.checked} of ${queue.length} emails · ${summary.failed} need retry.` })
            continue
          }
          save(rows, result)
          setEmailValidityProgress({ checked: summary.checked, failed: summary.failed, pending: queue.length - summary.checked - summary.failed, message: `Checked ${summary.checked} of ${queue.length} emails · ${summary.failed} need retry.` })
        }
      }
    }
    summary.cancelled = emailValidityController.signal.aborted
    setEmailValidityProgress({
      state: summary.cancelled ? 'cancelled' : 'completed',
      checked: summary.checked,
      failed: summary.failed,
      pending: queue.length - summary.checked - summary.failed,
      batchSize: 0,
      message: summary.cancelled
        ? `Stopped after ${summary.checked} of ${queue.length} emails. Remaining emails can be checked again.`
        : summary.failed
          ? `Checked ${summary.checked} of ${queue.length}. ${summary.failed} failed and remain Not checked for the next pass.`
          : `Checked ${summary.checked} of ${queue.length} emails.`,
    })
    return summary
    } catch (error) {
      setEmailValidityProgress({ state: 'failed', batchSize: 0, message: error instanceof Error ? error.message : 'Email validity check failed.' })
      throw error
    } finally {
      emailValidityBusy = false
      emailValidityController = null
    }
  },
)

ipcMain.handle('scraper:providers', () => runner.providers())

ipcMain.handle('scraper:last', () => runner.last)

/**
 * Starts a run and wires up everything that has to happen around one.
 *
 * A run has to be written to the local database before the window hears about it, so a crash
 * between the two cannot lose captured leads, and a finished scrape is what queues the enrichment
 * pass over the new leads. Both belong to every run however it was started, so both live here.
 */
let reservingMapsRun = false
async function startRun(request: StartRunRequest, context?: BrowserContext, executablePath?: string) {
  if (runner.busy || reservingMapsRun) throw new Error('A scrape is already running.')
  const query = normaliseQuery(request?.query)
  if (!query.keywords.length) throw new Error('Add at least one keyword before starting a run.')
  reservingMapsRun = true
  let quota: Awaited<ReturnType<typeof billingReserveMaps>> | undefined
  let handle: ReturnType<ScrapeRunner['start']>
  try {
    const requestedTotal = Math.min(query.maxResultsTotal ?? Infinity, query.maxResultsPerKeyword * query.keywords.length)
    quota = await billingReserveMaps(requestedTotal)
    if (runner.busy) throw new Error('A scrape is already running.')
    handle = runner.start({
    provider: request?.provider,
    // A billing allowance can lower the requested limit, never increase it.
    query: { ...request?.query, maxResultsTotal: Math.min(requestedTotal, quota.allowed) },
    context,
    executablePath,
    onProgress: (progress) => broadcast('scraper:progress', progress),
    })
  } catch (error) {
    if (quota?.reservationId) void billingSettleMaps(quota.reservationId, 0).catch(() => undefined)
    throw error
  } finally {
    reservingMapsRun = false
  }
  // A successful runner start always has a server-approved allowance.
  if (!quota) throw new Error('The Maps lead allowance could not be confirmed.')
  // A long scrape must stop if the purchase is revoked or the billing server becomes unavailable.
  let checkingLicense = false
  const licenseTimer = setInterval(() => {
    if (checkingLicense || !runner.busy) return
    checkingLicense = true
    const checks = [requireActiveLicense(), ...(quota.reservationId ? [billingHeartbeatMaps(quota.reservationId)] : [])]
    void Promise.all(checks).catch(() => runner.stop()).finally(() => { checkingLicense = false })
  }, 15_000)
  void handle.result.finally(() => clearInterval(licenseTimer)).catch(() => undefined)
  void handle.result.then(async (summary) => {
    let finalSummary = summary
    let stored: { runId: string; saved: number } | null = null
    let storeError: string | null = null
    if (quota.reservationId) {
      try {
        const settled = await billingSettleMaps(quota.reservationId, summary.leads.length)
        if (settled.accepted < summary.leads.length) finalSummary = { ...summary, leads: summary.leads.slice(0, settled.accepted) }
      } catch (error) {
        storeError = error instanceof Error ? error.message : String(error)
        finalSummary = { ...summary, leads: [], status: 'failed', error: 'Trial lead usage could not be confirmed. Retry when the license server is available.' }
      }
    }
    if (!storeError) try {
      const { db, repository } = openDatabase()
      stored = repository.saveRun(db.ensureWorkspace().id, {
        runId: finalSummary.runId,
        provider: finalSummary.provider,
        status: finalSummary.status === 'idle' || finalSummary.status === 'running' ? 'done' : finalSummary.status,
        keywords: finalSummary.query.keywords,
        location: finalSummary.query.location,
        maxResultsPerKeyword: finalSummary.query.maxResultsPerKeyword,
        detail: finalSummary.query.detail,
        durationMs: finalSummary.durationMs,
        startedAt: finalSummary.startedAt,
        finishedAt: finalSummary.finishedAt,
        error: finalSummary.error,
        leads: finalSummary.leads,
      })
    } catch (error) {
      storeError = error instanceof Error ? error.message : String(error)
    }
    runner.replaceLast(finalSummary)
    broadcast('scraper:done', { ...finalSummary, stored, storeError })

    // A fresh scrape is what creates the work: the newly captured leads have websites and no
    // addresses yet, which is exactly what enrichment reads. Queued here rather than in the
    // renderer so a run enriches whether or not a window is watching.
    if (stored && finalSummary.leads.length) {
      queueEnrichmentForNewLeads(finalSummary.leads.map((lead) => lead.name))
    }

    // The app's own browser was opened for this run, so the run is what closes it. Leaving it open
    // would hold the profile folder and make the next run open a second window.
    if (context && armedBrowser === context) {
      armedBrowser = null
      armedExecutable = ''
      void context.close().catch(() => undefined)
    }
  })
  return { runId: handle.runId }
}

ipcMain.handle('scraper:start', async (event, request: StartRunRequest) => {
  await requireActiveLicense()
  if (runner.busy) throw new Error('A scrape is already running.')
  // Only the window shell knows where the app keeps its folders, so a run that asked for the saved
  // profile is handed the path here. Nothing else is allowed to name one.
  const query = { ...request?.query }
  if (query.savedProfile) {
    if (armedBrowser && !armedBrowser.isClosed()) {
      throw new Error('The app’s browser is already open for a run. Close it, then run again.')
    }
    query.profileDir = googleProfileDir()
  }
  return startRun({ ...request, query })
})

/**
 * Run with filters: connect Google first, then scrape in the browser that took the sign-in.
 *
 * This is the gate the run button goes through. A run never starts from a profile Google has never
 * seen — that is the run that meets the sign-in wall and the account chooser with no account in it —
 * so when the app's own browser holds no signed-in account, it opens, asks, and waits. The moment
 * the account is in, the same window is handed to the run and the scrape carries on in it.
 *
 * A run with an account already saved does not open anything: the profile on file is used, and the
 * window (if the settings open one) is the run's own. Nothing here types an email or a password;
 * the user signs in on Google's page, in a window they can see.
 */
ipcMain.handle('scraper:runWithGoogle', async (_event, request: StartRunRequest) => {
  await requireActiveLicense()
  const license = await billingStatus()
  if (license.license?.kind === 'trial' && license.mapsLeads?.remaining === 0) {
    throw new Error('The trial’s 300 Maps leads are used. Activate a lifetime key to continue.')
  }
  if (runner.busy) throw new Error('A scrape is already running.')
  gateStage = 'checking the saved account'
  const query = { ...request?.query, savedProfile: true, profileDir: googleProfileDir() }
  const executablePath = (query.executablePath ?? '').trim()
  const progress = (message: string, found = 0) =>
    broadcast('scraper:progress', {
      runId: 'google-gate',
      status: 'running',
      provider: request?.provider ?? 'chromium-maps',
      keyword: '',
      keywordIndex: 0,
      keywordTotal: 0,
      found,
      target: 0,
      message,
      at: new Date().toISOString(),
    })

  if (!(await googleSignedIn())) {
    if (runner.busy) throw new Error('A scrape is already running.')
    gateStage = 'asking for the account'
    progress('Google is not connected yet — sign in inside the window that just opened. The run starts the moment your account is in.')
    const controller = new AbortController()
    const stop = () => controller.abort()
    runner.onStop(stop)
    let armed: { context: BrowserContext } | { closed: true }
    try {
      armed = await armGoogleBrowser(controller.signal, executablePath)
    } finally {
      runner.offStop(stop)
    }
    if ('closed' in armed) {
      const message = controller.signal.aborted
        ? 'Cancelled before Google was connected.'
        : 'The browser window closed before an account was signed in. Run again and sign in.'
      broadcast('scraper:progress', {
        runId: 'google-gate',
        status: controller.signal.aborted ? 'cancelled' : 'failed',
        provider: request?.provider ?? 'chromium-maps',
        keyword: '',
        keywordIndex: 0,
        keywordTotal: 0,
        found: 0,
        target: 0,
        message,
        at: new Date().toISOString(),
      })
      throw new Error(message)
    }
    if (controller.signal.aborted) throw new Error('Cancelled before the run started.')
    gateStage = 'connected — starting the run'
    progress('Google account connected — starting the run in the same window.')
    try { return await startRun({ ...request, query }, armed.context, armedExecutable) }
    catch (error) {
      if (armedBrowser === armed.context) { armedBrowser = null; armedExecutable = '' }
      await armed.context.close().catch(() => undefined)
      throw error
    }
  }

  gateStage = 'connected — starting the run'
  progress('Google account connected — starting the run.')
  return startRun({ ...request, query })
})


ipcMain.handle('scraper:stop', () => runner.stop())

ipcMain.handle('scraper:googleStatus', async () => {
  const saved = existsSync(googleProfileDir())
  return { profile: saved, signedIn: saved ? await googleSignedIn() : false }
})

/**
 * Opens the app's own browser so the user can connect Google, and keeps the window.
 *
 * This is the same window Run with filters opens; pressing it here just gets the connection out of
 * the way early. Nothing signs in on the user's behalf — the account chooser, the password and the
 * second factor are Google's own page in a window they drive — and the profile it leaves behind is
 * what every later run starts from.
 */
ipcMain.handle('scraper:signInGoogle', async (_event, options?: { executablePath?: string }) => {
  if (runner.busy) throw new Error('A scrape is running. Stop it, then sign in.')
  const executablePath = options?.executablePath?.trim() ?? ''
  const controller = new AbortController()
  const stop = () => controller.abort()
  runner.onStop(stop)
  try {
    const armed = await armGoogleBrowser(controller.signal, executablePath)
    return { signedIn: !('closed' in armed) }
  } finally {
    runner.offStop(stop)
  }
})

/**
 * Asks for a browser executable.
 *
 * Only an executable — a program, never a profile folder. Unless the run has been told to reuse
 * the profile this app signed in with, every run starts a brand-new throwaway one, so nothing of
 * the user's own browser session is read or touched. A browser that carries its own brand and
 * version (Chrome, Edge, Brave) presents better to Google than a build that looks like automation.
 */
ipcMain.handle('scraper:pickBrowser', async (event) => {
  const options = {
    title: 'Choose a browser executable',
    message: 'A program only. Runs start a fresh profile unless the saved Google profile is on.',
    properties: ['openFile' as const],
    filters:
      process.platform === 'win32'
        ? [{ name: 'Executables', extensions: ['exe'] }]
        : [{ name: 'All files', extensions: ['*'] }],
  }
  // The dialog is parented to the window when there is one, so it opens modal to the app.
  const window = BrowserWindow.fromWebContents(event.sender)
  const picked = window ? await dialog.showOpenDialog(window, options) : await dialog.showOpenDialog(options)
  if (picked.canceled || !picked.filePaths.length) return null
  return picked.filePaths[0]
})

ipcMain.handle('enrichment:status', () => ({
  running: enricher?.busy ?? false,
  pending: enricher?.pending() ?? 0,
}))

ipcMain.handle('enrichment:start', async () => {
  await requireActiveLicense()
  void enricher?.drain()
  return { started: true }
})

// A foreground website import queues its social job after the database import has returned. It
// then asks the runner to take that one-site job first, so a long background queue cannot delay the
// result the user is looking at.
ipcMain.handle('enrichment:prioritize', async (_event, payload: { jobId?: string } = {}) => {
  const { db } = openDatabase()
  const job = payload.jobId ? db.one<{ kind: string }>(
    'select kind from enrichment_jobs where workspace_id = ? and id = ?', [db.ensureWorkspace().id, payload.jobId],
  ) : null
  if (payload.jobId && !job) throw new Error('The requested scan job was not found.')
  await requireActiveLicense(job?.kind === 'decision-maker' || job?.kind === 'deep' ? 'decisionMaker' : 'lifetime')
  void enricher?.prioritize(payload.jobId)
  return { started: true }
})

ipcMain.handle('enrichment:stop', () => {
  enricher?.stop()
  return { stopped: true }
})

/**
 * Takes the DataForSEO credential from the window, and checks it if asked.
 *
 * The window is where the key lives — the user types it in Settings — so this end only ever holds it
 * for the session. `check` is what the Settings row presses to find out whether the key works and
 * what is left on the account, using an endpoint that costs nothing.
 */
ipcMain.handle('deep:key', (_event, payload: { key?: string } = {}) => {
  const next = String(payload.key ?? '').trim()
  deepApiKey = next
  // A key saved in the app is the user's current answer, so it takes over from the environment's.
  if (next) deepKeyFromEnvironment = false
  return { saved: Boolean(deepApiKey), fromEnvironment: deepKeyFromEnvironment }
})

ipcMain.handle('deep:status', () => ({
  saved: Boolean(deepApiKey),
  fromEnvironment: deepKeyFromEnvironment,
}))

ipcMain.handle('deep:check', async (_event, payload: { key?: string } = {}) => {
  const key = (payload.key ?? deepApiKey).trim()
  return checkKey(key)
})

/**
 * Queues the two-step owner/email pass over the leads supplied by the Decision Makers page.
 *
 * The worker first asks for a founder/owner and then runs a depth-10 email search for that person.
 * It goes through the same queue as the free passes, so one progress bar and one Stop cover it, and
 * a key that is missing is refused here rather than paid for later.
 */
ipcMain.handle('deep:run', async (_event, payload: { leadIds?: string[] } = {}) => {
  try { await requireActiveLicense('decisionMaker') }
  catch (error) { return { queued: 0, error: error instanceof Error ? error.message : 'A license is required.' } }
  if (!deepApiKey) {
    return { queued: 0, error: 'Add a DataForSEO key in Settings → Account before running a deep pass.' }
  }
  try {
    const { db, repository } = openDatabase()
    const workspace = db.ensureWorkspace()
    const leadIds = payload.leadIds?.length ? payload.leadIds : repository.leadsNeedingContact(workspace.id, 'email').map((lead) => lead.id)
    if (!leadIds.length) return { queued: 0, error: 'Every lead already has a contact on file.' }
    const { queued } = repository.queueJob(workspace.id, 'deep', leadIds)
    void enricher?.drain()
    return { queued, error: null }
  } catch (error) {
    return { queued: 0, error: error instanceof Error ? error.message : 'The pass could not be queued.' }
  }
})

/**
 * Queues an email and a social pass over the leads that have a website and no detail yet.
 *
 * Called after a scrape so the pages fill themselves in. The queue is durable, so if the app is
 * closed mid-run the work is still waiting on the next launch.
 */
function queueEnrichmentForNewLeads(_names: string[]): void {
  try {
    const { db, repository } = openDatabase()
    const workspace = db.ensureWorkspace()
    for (const kind of ['email', 'social'] as const) {
      const leads = repository.leadsNeedingContact(workspace.id, kind, 50)
      if (leads.length) repository.queueJob(workspace.id, kind, leads.map((lead) => lead.id))
    }
    void enricher?.drain()
  } catch {
    // Enrichment is a bonus on top of a scrape; a failure here must not affect the run.
  }
}

if (ownsInstance) app.whenReady().then(() => {
  if (app.isPackaged) app.setAsDefaultProtocolClient('mamalead')
  if (existsSync(savedLeadsAngelPath()) && safeStorage.isEncryptionAvailable()) {
    try {
      const saved = JSON.parse(safeStorage.decryptString(readFileSync(savedLeadsAngelPath()))) as LeadsAngelCredentials
      if (saved.licenseKey && saved.deviceId) leadsAngelCredentials = saved
    } catch {
      // A license encrypted for another OS account cannot be used by this account.
    }
  }
  const leadsAngelImportArg = process.argv.find((arg) => arg.startsWith('--leadsangel-import-zip='))
  if (leadsAngelImportArg) {
    try {
      importLeadsAngelZip(leadsAngelImportArg.slice('--leadsangel-import-zip='.length))
    } catch (error) {
      console.error('Could not import the LeadsAngel ZIP:', error instanceof Error ? error.message : 'Unknown error')
    }
  }
  if (!apifyApiToken) {
    const userCredential = readApifyCredential(join(app.getPath('userData'), 'secrets', 'apify.key'))
    apifyApiToken = userCredential.value
    apifyFromEnvironment = userCredential.fromEnvironment
  }
  if (!mailVerifierApiKey) {
    const userCredential = readMailVerifierCredential(join(app.getPath('userData'), 'secrets', 'mailverifier.key'))
    mailVerifierApiKey = userCredential.value
    mailVerifierFromEnvironment = userCredential.fromEnvironment
  }
  // The database is opened and its handlers registered before the window loads, so the first
  // page render can already read saved leads.
  const { db, repository } = openDatabase()
  // Clear anything an earlier version stored that is not really a contact: an address from a
  // footer or a form widget, and a "person" that is a button or a service heading.
  repository.pruneNoisyContacts(isUsableEmail)
  repository.pruneNoisyPeople(isUsablePerson)
  // A suggestion has to be a person: drop the company pages an earlier pass offered as contacts.
  // `ensureWorkspace` returns the same single local workspace the IPC layer goes on to use.
  const workspaceId = db.ensureWorkspace().id
  repository.pruneNoisyCandidates(isUsablePerson, workspaceId)
  // A previous Electron process may have stopped while an enrichment job was running. Recover
  // those durable rows before the first window can queue a new foreground scan.
  repository.requeueInterruptedJobs(workspaceId)
  registerLocalDatabase(db, repository, (leadIds) => {
    // Imported websites are named after their host; the worker fills in the real business.
    if (leadIds.length) void requireActiveLicense('lifetime').then(() => enricher?.drain()).catch(() => undefined)
  }, async (channel, payload) => {
    if (channel === 'db:jobs:queue') {
      const kind = (payload as { kind?: string } | undefined)?.kind
      await requireActiveLicense(kind === 'decision-maker' || kind === 'deep' ? 'decisionMaker' : 'lifetime')
    } else if (channel === 'db:imports:websites' || channel === 'db:exports:write') {
      try { await requireActiveLicense('lifetime') } catch { await requireActiveLicense('decisionMaker') }
    } else if (channel === 'db:imports:social') {
      await requireActiveLicense()
    }
  })

  enricher = new EnrichmentRunner(db, repository, {
    onProgress: (progress) => broadcast('enrichment:progress', progress),
    authorize: (kind, fresh) => requireActiveLicense(kind === 'deep' || kind === 'decision-maker' ? 'decisionMaker' : 'lifetime', fresh),
    consumeDecisionLead: async (leadId) => {
      const usage = await billingConsumeDecisionMaker(leadId)
      broadcast('billing:decision-usage', usage)
    },
    // The window owns the DataForSEO credential: it is entered in Settings, it is read back from
    // there, and it is handed over for as long as the app is open. Nothing here writes it down.
    deepKey: () => deepApiKey,
  })
  // Resume durable enrichment work after a restart. The runner prioritises fresh one-site scans,
  // so a saved queue cannot make a domain import look frozen while the window is open.
  void enricher.drain()

  configureAutoUpdater()
  createWindow()
  if (app.isPackaged && updateFeedUrl) {
    // Let the first window render before an update request starts and keep startup responsive.
    setTimeout(() => void checkForUpdate(), 8000)
  }
  app.on('activate', () => {
    if (!BrowserWindow.getAllWindows().length) createWindow()
  })
})

app.on('window-all-closed', () => {
  void runner.stop()
  if (process.platform !== 'darwin') app.quit()
})

app.on('will-quit', () => {
  enricher?.stop()
  // The app's own browser is a browser of its own, so it outlives the app unless it is closed here.
  // A window armed for a run counts: the run it was waiting for is not going to happen now.
  void armedBrowser?.close().catch(() => undefined)
  closeDatabase()
})

/**
 * A window onto the app's own browser, for the automated check only.
 *
 * The check has to see what that browser is showing, which browser a run continued in, and close it
 * the way a user would — none of which is visible from the app's window, because the browser is
 * Playwright's, not Electron's. It is published only when the environment asks for it by name, so a
 * normal launch exposes nothing and no part of the app depends on it.
 */
if (process.env.LEADSNAP_TEST_HOOKS === '1') {
  /** Whichever of the two a check should be looking at: the waiting window, or the run's. */
  const current = () => {
    for (const context of [gateBrowser, armedBrowser]) {
      if (context && !context.isClosed()) return context
    }
    return null
  }
  ;(globalThis as Record<string, unknown>).__leadsnapTest = {
    where: 'main',
    /**
     * Puts a Google session into the saved profile, so a check can drive a real run.
     *
     * The gate will not scrape without an account, and no automated check can sign in to a real one.
     * This writes the same cookie jar entry a sign-in leaves behind — the cookie names the gate
     * watches for, with an expiry, in the app's own profile folder — and nothing else. It is offered
     * only under the same flag as the rest of this hook.
     */
    seedSession: async () => {
      const dir = googleProfileDir()
      mkdirSync(dir, { recursive: true })
      const context = await chromium.launchPersistentContext(dir, profileLaunchOptions(true))
      const expires = Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60
      await context.addCookies([{ name: 'SID', value: 'test-session', domain: '.google.com', path: '/', expires, secure: true }])
      const planted = hasGoogleSession(await context.cookies().catch(() => []))
      await context.close().catch(() => undefined)
      googleSession = planted ? true : googleSession
      return planted
    },
    /** The DevTools port the app's own browser is listening on, or 0 when it is not. */
    port: () => {
      const file = join(app.getPath('userData'), 'google-profile', 'DevToolsActivePort')
      if (!existsSync(file)) return 0
      return Number(readFileSync(file, 'utf8').split('\n')[0]) || 0
    },
    browser: () => {
      const context = current()
      return {
        open: Boolean(context),
        pages: context ? context.pages().map((page) => page.url()) : [],
        stage: gateStage,
      }
    },
    stage: () => ({ stage: gateStage, signedIn: googleSession, busy: runner.busy }),
    closeBrowser: async () => {
      const context = current()
      if (!context) return false
      await context.close().catch(() => undefined)
      return true
    },
  }
}
