// Checks the Google gate: Run with filters must connect the app's own browser before it scrapes,
// and the run must carry on in the window that took the connection rather than opening another.
//
// Two runs, each in its own throwaway app-data folder:
//
//   1. Nothing connected. The run must not scrape. It opens the app's own browser on Google's
//      sign-in page, says so, and waits — and closing that window has to end the attempt cleanly.
//   2. A session arrives while it waits, put into that same browser through its own debug protocol,
//      the way Google's own sign-in page leaves one behind. The gate must notice, and the run must
//      start at once in the window already open — no second browser, no sign-in step.
//
// The added cookie is a cookie-jar entry, not a login: nothing here signs in to a real account, and
// Google's own page is only loaded, never driven.
const { _electron, chromium } = require('playwright')
const { mkdtempSync, mkdirSync, existsSync, rmSync } = require('node:fs')
const { join } = require('node:path')
const { tmpdir } = require('node:os')

const APP = process.cwd()
const GOOGLE_PROFILE = 'google-profile'
/** One of the names Google issues a session under — the gate watches for exactly these. */
const SESSION_COOKIE = { name: 'SID', value: 'gate-test-session', domain: '.google.com', path: '/' }

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** Logs a line the moment it happens, so a hang says where it happened. */
function step(message) {
  console.log(`[${new Date().toISOString().slice(11, 19)}] ${message}`)
}

/**
 * Starts the app with its own user-data folder.
 *
 * The switch is the only thing that moves the app's folder: `APPDATA` is ignored by the launched
 * process, so a check that relied on it would read — and write — the real one. Everything the app
 * keeps, the database and the Google profile alike, lands under the folder named here.
 */
async function launchApp(userDataDir) {
  const app = await _electron.launch({
    args: ['.', `--user-data-dir=${userDataDir}`],
    cwd: APP,
    // The app publishes a window onto its own browser only when asked for by name.
    env: { ...process.env, LEADSNAP_TEST_HOOKS: '1' },
    timeout: 60000,
  })
  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  await page.waitForSelector('[data-view="dashboard"]', { timeout: 30000 })
  await page.click('[data-view="maps"]')
  await page.waitForTimeout(800)
  // One keyword and a small cap: this is about the gate, not about volume. Each chip is removed by
  // a fresh query, because removing one re-renders the row and detaches the handles already held.
  for (let guard = 0; guard < 12; guard += 1) {
    const chip = await page.$('[data-kw="1"]')
    if (!chip) break
    await chip.click()
    await page.waitForTimeout(250)
  }
  await page.fill('[data-kwinput]', 'dentist')
  await page.press('[data-kwinput]', 'Enter')
  for (let i = 0; i < 4; i += 1) {
    await page.click('[aria-label="Fewer results"]')
    await page.waitForTimeout(150)
  }
  await page.waitForTimeout(300)
  return { app, page }
}

/** The app's own browser, as the app sees it. */
function appBrowser(app) {
  return app.evaluate(() => globalThis.__leadsnapTest?.browser() ?? null)
}

/** Closes it the way the user would, with the X on the window. */
function closeAppBrowser(app) {
  return app.evaluate(() => globalThis.__leadsnapTest?.closeBrowser() ?? false)
}

/** The port the app's own browser listens on for the protocol. 0 until it is open. */
function appBrowserPort(app) {
  return app.evaluate(() => globalThis.__leadsnapTest?.port() ?? 0)
}

/** Waits for that browser to be up and showing Google's sign-in page. */
async function waitForSignInPage(app, timeoutMs = 40000) {
  const deadline = Date.now() + timeoutMs
  let last = null
  while (Date.now() < deadline) {
    last = await appBrowser(app).catch(() => null)
    if (last?.open && (last.pages ?? []).some((url) => /accounts\.google\.com/.test(url))) return { browser: last, port: await appBrowserPort(app) }
    await sleep(500)
  }
  return { browser: last, port: await appBrowserPort(app) }
}

/**
 * Puts a Google session into a profile folder while nothing is using it.
 *
 * The cookie carries an expiry, because a session cookie in this jar is not written back by the
 * browser — that is the whole reason the app's real sign-in writes its own back with one.
 */
async function seedSession(profileDir) {
  const context = await chromium.launchPersistentContext(profileDir, { headless: true })
  await context.addCookies([
    { ...SESSION_COOKIE, expires: Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60, secure: true },
  ])
  const readBack = await context.cookies()
  await context.close()
  return readBack.some((cookie) => cookie.name === 'SID')
}

/**
 * Puts a Google session into the browser the app already has open.
 *
 * Through the browser's own protocol, not through Playwright, because this browser is the app's:
 * the point is that the session lands in the very window the gate is waiting on.
 */
async function plantSessionInOpenBrowser(port) {
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`)
  const context = browser.contexts()[0]
  const page = await context.newPage()
  const cdp = await context.newCDPSession(page)
  await cdp.send('Storage.getCookies')
  await cdp.send('Storage.setCookies', {
    cookies: [{ ...SESSION_COOKIE, expires: Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60, secure: true }],
  })
  const readBack = await cdp.send('Storage.getCookies')
  const planted = (readBack.cookies ?? []).some((cookie) => cookie.name === 'SID')
  await page.close().catch(() => undefined)
  await browser.close().catch(() => undefined)
  return planted
}

/** Waits for the app's own browser to be up and showing Google's sign-in page. */
async function waitForSignInPage(app, timeoutMs = 40000) {
  const deadline = Date.now() + timeoutMs
  let last = null
  while (Date.now() < deadline) {
    last = await appBrowser(app).catch(() => null)
    if (last?.open && (last.pages ?? []).some((url) => /accounts\.google\.com/.test(url))) return { browser: last, port: await appBrowserPort(app) }
    await sleep(500)
  }
  return { browser: last, port: await appBrowserPort(app) }
}

const buttonState = (page) =>
  page.evaluate(() => document.querySelector('[data-runbtn="1"]')?.getAttribute('data-state') ?? 'missing')

async function runNote(page) {
  // The line under the page title, tagged in the markup, so this reads the app's own status rather
  // than whatever text happens to sit nearby.
  return page.evaluate(() => {
    const note = document.querySelector('[data-runnote="1"]')?.textContent ?? ''
    return note.replace(/\s+/g, ' ').trim().slice(0, 180)
  })
}

async function waitForState(page, state, timeoutMs) {
  try {
    await page.waitForFunction(
      (wanted) => document.querySelector('[data-runbtn="1"]')?.getAttribute('data-state') === wanted,
      state,
      { timeout: timeoutMs },
    )
    return true
  } catch {
    return false
  }
}

/** Case 1: nothing connected — the gate has to open the app's browser and wait there. */
async function caseNotConnected() {
  const root = mkdtempSync(join(tmpdir(), 'leadsnap-gate-a-'))
  const userData = join(root, 'userdata')
  mkdirSync(userData, { recursive: true })
  step('=== case 1: no Google account connected ===')
  const { app, page } = await launchApp(userData)
  step(`run setup, on the maps page: ${(await page.$$eval('[data-kw="1"]', (nodes) => nodes.map((n) => n.textContent.replace('×', '').trim()))).join(', ')}`)

  await page.click('[data-runbtn="1"]')
  step('pressed Run with filters')
  const showedWait = await waitForState(page, 'wait', 40000)
  step(`button showed the connecting state (not "Scraping"): ${showedWait}`)
  step(`note while connecting: ${await runNote(page)}`)

  step(`app opened its own profile folder: ${existsSync(join(userData, GOOGLE_PROFILE))} | ${join(userData, GOOGLE_PROFILE).replace(root, '<test>')}`)

  const { browser, port } = await waitForSignInPage(app)
  const urls = browser?.pages ?? []
  step(`app browser open with a page: ${Boolean(browser?.open)} (debug port ${port || 'none'})`)
  step(`that browser is showing: ${(urls[0] ?? '(nothing)').slice(0, 90)}`)
  step(`it is waiting on Google, not scraping: ${urls.some((url) => /accounts\.google\.com/.test(url))}`)

  // Closing that window is the user saying no. The run has to end cleanly rather than hang.
  step(`closed the app browser window: ${await closeAppBrowser(app)}`)
  step(`closing the window ended the attempt: ${await waitForState(page, 'idle', 40000)}`)
  step(`note after closing: ${await runNote(page)}`)

  await app.close()
  rmSync(root, { recursive: true, force: true })
  step('case 1 done')
}

/** Case 2: the account arrives while the gate waits — the run must continue in that same window. */
async function caseConnectedDuringWait() {
  const root = mkdtempSync(join(tmpdir(), 'leadsnap-gate-b-'))
  const userData = join(root, 'userdata')
  mkdirSync(userData, { recursive: true })
  step('=== case 2: the account is connected while the gate waits ===')

  const { app, page } = await launchApp(userData)
  step(`account row reads connected before anything: ${/Connected/.test(await page.textContent('[data-googlenote="1"]'))}`)

  await page.click('[data-runbtn="1"]')
  step('pressed Run with filters')
  const { browser, port } = await waitForSignInPage(app)
  const waitingUrls = browser?.pages ?? []
  step(`gate opened the app's browser and is waiting: ${waitingUrls.some((url) => /accounts\.google\.com/.test(url))}`)
  step(`debug port of that browser: ${port || 'none'}`)

  // The browser the run must use is the one already open. Its port identifies it.
  const planted = port ? await plantSessionInOpenBrowser(port) : false
  step(`session planted in that same browser: ${planted}`)

  const scraped = await waitForState(page, 'run', 60000)
  step(`button went to scraping in the same window, no second browser: ${scraped}`)
  const same = await appBrowserPort(app)
  step(`still the same browser (port ${same}): ${Boolean(port) && same === port}`)
  step(`note: ${await runNote(page)}`)
  await page.waitForTimeout(6000)
  const later = await runNote(page)
  step(`note later: ${later}`)
  step(`the run is reading Google Maps: ${/searching google maps|read \d+ place|captured \d+/i.test(later)}`)

  // Stop before closing: the run is real work against Google, and this check is about the gate.
  await page.evaluate(() => window.desktop?.scraper?.stop?.()).catch(() => undefined)
  step(`stopped the run: ${await waitForState(page, 'idle', 60000)}`)

  await app.close()
  rmSync(root, { recursive: true, force: true })
  step('case 2 done')
}

/**
 * Case 3: the account is already saved. The run must go straight to work from the saved profile,
 * with no sign-in step and no browser opened to ask for one.
 */
async function caseAlreadyConnected() {
  const root = mkdtempSync(join(tmpdir(), 'leadsnap-gate-c-'))
  const userData = join(root, 'userdata')
  mkdirSync(join(userData, GOOGLE_PROFILE), { recursive: true })
  step('=== case 3: the account is already saved ===')
  step(`session seeded in the saved profile: ${await seedSession(join(userData, GOOGLE_PROFILE))}`)

  const { app, page } = await launchApp(userData)
  await page.waitForTimeout(1500)
  step(`account row reads connected: ${/Connected/.test(await page.textContent('[data-googlenote="1"]'))}`)
  step(`no browser open before the run: ${(await appBrowser(app))?.open === false}`)

  await page.click('[data-runbtn="1"]')
  step('pressed Run with filters')
  const wentToScraping = await waitForState(page, 'run', 60000)
  step(`button went to scraping, with no connecting step: ${wentToScraping}`)
  step(`note: ${await runNote(page)}`)

  // With an account on file there is nothing to ask for, so the gate opens no browser of its own.
  // The run's own browser — headless by default — is the provider's, and is not one of these.
  step(`gate opened no browser, before or during: ${(await appBrowser(app))?.open === false}`)
  step(`no sign-in window anywhere: ${!JSON.stringify(await appBrowser(app)).includes('accounts.google.com')}`)
  step(`note while scraping: ${await runNote(page)}`)

  await page.evaluate(() => window.desktop?.scraper?.stop?.()).catch(() => undefined)
  step(`stopped the run: ${await waitForState(page, 'idle', 60000)}`)

  await app.close()
  rmSync(root, { recursive: true, force: true })
  step('case 3 done')
}

async function main() {
  await caseNotConnected()
  await caseConnectedDuringWait()
  await caseAlreadyConnected()
  step('all cases done')
}

main().catch((error) => {
  console.error('gate check failed:', error.message)
  process.exitCode = 1
})
