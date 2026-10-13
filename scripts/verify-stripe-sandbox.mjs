import { createHash, randomBytes } from 'node:crypto'
import { createReadStream, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { extname, join, resolve, sep } from 'node:path'
import { Readable } from 'node:stream'
import { createBillingServer } from '../billing-server/server.mjs'
import { _electron as electron, chromium } from 'playwright'

const site = resolve(process.env.LANDING_SITE_DIR || '')
const installer = resolve(process.env.BILLING_TEST_INSTALLER_PATH || '')
if (!existsSync(join(site, 'sales.js')) || !existsSync(installer)) throw new Error('Set LANDING_SITE_DIR and BILLING_TEST_INSTALLER_PATH to existing files.')
if (!process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_')) throw new Error('A Stripe test secret key is required.')
const dir = mkdtempSync(join(tmpdir(), 'nafran-stripe-test-'))
const billingPort = 38747
const sitePort = 38901
const billingOrigin = `http://127.0.0.1:${billingPort}`
const siteOrigin = `http://127.0.0.1:${sitePort}`
const env = {
  ...process.env,
  BILLING_PORT: String(billingPort),
  BILLING_DB_PATH: join(dir, 'billing.db'),
  BILLING_PUBLIC_URL: billingOrigin,
  APP_PUBLIC_URL: siteOrigin,
  BILLING_ALLOWED_ORIGINS: siteOrigin,
  DOWNLOAD_SIGNING_KEY: randomBytes(32).toString('hex'),
  LOCAL_DOWNLOAD_PATH: installer,
}
let emailed = null
const service = createBillingServer({
  env,
  sendEmail: async (message) => {
    emailed = message
    writeFileSync(join(dir, 'local-email.json'), JSON.stringify(message))
    return true
  },
})
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.woff2': 'font/woff2' }
const gateway = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, siteOrigin)
    const pathname = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname)
    const file = resolve(site, '.' + pathname)
    if (!file.startsWith(site + sep) || !existsSync(file)) { res.writeHead(404).end(); return }
    res.writeHead(200, { 'content-type': types[extname(file)] || 'application/octet-stream' })
    if (pathname === '/index.html') {
      const html = readFileSync(file, 'utf8').replace('<script src="./sales.js"', `<script src="./sales.js" data-billing-api="${billingOrigin}"`)
      res.end(html)
    } else createReadStream(file).pipe(res)
  } catch (error) { res.writeHead(500).end(String(error)) }
})
const listen = (server, port) => new Promise((ok, fail) => { server.once('error', fail); server.listen(port, '127.0.0.1', ok) })
const close = (server) => new Promise((ok) => server.close(ok))
const check = (label, passed) => { if (!passed) throw new Error(`FAIL ${label}`); console.log(`PASS ${label}`) }
let browser
try {
  await listen(service.server, billingPort)
  await listen(gateway, sitePort)
  browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ acceptDownloads: true })
  const page = await context.newPage()
  const browserErrors = []
  page.on('pageerror', (error) => browserErrors.push(error.message))
  let salesStatus = null
  page.on('response', (response) => { if (response.url().endsWith('/sales.js')) salesStatus = response.status() })
  await page.goto(siteOrigin, { waitUntil: 'domcontentloaded' })
  check('website billing script loads without browser errors', salesStatus === 200 && browserErrors.length === 0)
  check('website displays the 1-day trial form', await page.locator('[data-trial-request] input[type="email"]').count() === 1)
  await page.locator('[data-trial-request] input[type="email"]').fill(`trial-${Date.now()}@example.test`)
  await page.locator('[data-trial-request] button[type="submit"]').click()
  await page.locator('[data-purchase-status]').waitFor({ timeout: 15000 })
  const trialMessage = await page.locator('[data-purchase-status]').innerText()
  check(`website trial request succeeds (${trialMessage.replace(/NF(?:-[A-Z0-9]{4}){10}/g, '[redacted]')})`, trialMessage.includes('trial key was emailed'))
  check('website emails the trial key without showing it in the browser', emailed?.kind === 'trial' && !((await page.locator('[data-purchase-status]').innerText()).includes(emailed.licenseKey)))
  const trialKey = emailed.licenseKey
  await page.locator('[data-license-download] input[name="licenseKey"]').fill(trialKey)
  await page.locator('[data-license-download] button[type="submit"]').click()
  await page.waitForFunction(() => document.querySelector('[data-purchase-status] a')?.textContent.includes('Download the Windows installer'), { timeout: 15000 })
  check('trial key produces a protected installer link on the website', true)
  const trialDesktop = await electron.launch({
    cwd: resolve(import.meta.dirname, '..'),
    args: ['.', `--user-data-dir=${join(dir, 'trial-profile')}`],
    env: { ...process.env, LEADSNAP_BILLING_API_URL: billingOrigin, APPDATA: join(dir, 'trial-appdata') },
    timeout: 60000,
  })
  try {
    const trialWindow = await trialDesktop.firstWindow()
    await trialWindow.locator('[data-view="settings"]').first().click()
    await trialWindow.locator('[data-stab="acct"]').first().click()
    await trialWindow.locator('#nafran-license-key').fill(trialKey)
    await trialWindow.getByRole('button', { name: 'Activate', exact: true }).click()
    await trialWindow.getByText('1-day trial active on this machine', { exact: false }).waitFor({ timeout: 15000 })
    const allowed = await trialWindow.evaluate(() => window.desktop.enrichment.start())
    check('actual desktop app unlocks on the emailed trial key', allowed.started === true)
    service.db.prepare("update trial_licenses set expires_at = '2000-01-01T00:00:00.000Z'").run()
    const blocked = await trialWindow.evaluate(async () => { try { await window.desktop.local.imports.websites([]); return '' } catch (error) { return String(error?.message || error) } })
    check('actual desktop app blocks features after server-side trial expiry', /Activate an active 1-day trial or lifetime/.test(blocked))
  } finally { await trialDesktop.close() }
  check('website Buy Now button loads', await page.locator('[data-buy-product="lifetime"]').count() > 0)
  await page.locator('[data-buy-product="lifetime"]').first().click()
  await page.waitForURL(/checkout\.stripe\.com/, { timeout: 60000 })
  check('website opens real Stripe test Checkout', page.url().startsWith('https://checkout.stripe.com/'))
  console.log('STRIPE_CHECKOUT_READY')
  const email = `nafran-test-${Date.now()}@example.com`
  await page.locator('input[name="email"]').fill(email)
  await page.locator('input[name="cardNumber"]').fill('4242424242424242')
  await page.locator('input[name="cardExpiry"]').fill('1234')
  await page.locator('input[name="cardCvc"]').fill('123')
  await page.locator('input[name="billingName"]').fill('Nafran Test Buyer')
  await page.getByRole('button', { name: /Pay|Subscribe/i }).last().click()
  await page.waitForURL((url) => url.origin === siteOrigin && url.searchParams.has('purchase'), { timeout: 90000 })
  check('Stripe test payment returns to website', true)
  await page.locator('[data-purchase-status]').waitFor({ timeout: 60000 })
  await page.waitForFunction(() => document.querySelector('[data-purchase-status]')?.textContent.includes('Download the installer'), { timeout: 60000 })
  check('website shows license and installer link after payment', /NF(?:-[A-Z0-9]{4}){10}/.test(await page.locator('[data-purchase-status]').innerText()))
  check('license email captured in local test outbox', emailed?.to === email && /^NF(?:-[A-Z0-9]{4}){10}$/.test(emailed.licenseKey) && emailed.download === siteOrigin + '/#download')
  const firstCount = service.db.prepare('select count(*) as count from licenses').get().count
  const token = await page.evaluate((origin) => localStorage.getItem('nafran.billing.installation.' + new URL(origin).host), billingOrigin)
  const second = await fetch(billingOrigin + '/v1/license', { method: 'POST', headers: { authorization: `Bearer ${token}` } }).then((response) => response.json())
  check('repeated return keeps one license', firstCount === 1 && !second.licenseKey && service.db.prepare('select count(*) as count from licenses').get().count === 1)
  const stored = service.db.prepare('select key_hash, sent_at from licenses').get()
  check('database stores license hash and sent timestamp', stored.key_hash === createHash('sha256').update(emailed.licenseKey).digest('hex') && Boolean(stored.sent_at))
  const href = await page.locator('[data-purchase-status] a').getAttribute('href')
  const download = await fetch(href)
  check('private installer download succeeds', download.status === 200 && /attachment/.test(download.headers.get('content-disposition')))
  const downloadedHash = createHash('sha256')
  for await (const chunk of Readable.fromWeb(download.body)) downloadedHash.update(chunk)
  const sourceHash = createHash('sha256')
  for await (const chunk of createReadStream(installer)) sourceHash.update(chunk)
  check('downloaded installer matches packaged installer', downloadedHash.digest('hex') === sourceHash.digest('hex'))
  const packagedApp = process.env.BILLING_TEST_APP_EXE
  const desktop = await electron.launch({
    ...(packagedApp ? { executablePath: resolve(packagedApp) } : { cwd: resolve(import.meta.dirname, '..') }),
    args: [...(packagedApp ? [] : ['.']), `--user-data-dir=${join(dir, 'desktop-profile')}`],
    env: { ...process.env, LEADSNAP_BILLING_API_URL: billingOrigin, APPDATA: join(dir, 'appdata') },
    timeout: 60000,
  })
  try {
    const appWindow = await desktop.firstWindow()
    await appWindow.locator('[data-view="settings"]').first().click()
    await appWindow.locator('[data-stab="acct"]').first().click()
    await appWindow.locator('#nafran-license-key').fill(emailed.licenseKey)
    await appWindow.getByRole('button', { name: 'Activate', exact: true }).click()
    await appWindow.getByText('License activated on this machine.').waitFor({ timeout: 60000 })
    await appWindow.getByText('Lifetime license active on this machine', { exact: false }).waitFor({ timeout: 15000 })
    check(`${packagedApp ? 'packaged desktop app' : 'desktop app'} accepts emailed key in Settings`, true)
  } finally { await desktop.close() }
  const activationToken = await fetch(billingOrigin + '/v1/installations', { method: 'POST' }).then((response) => response.json()).then((body) => body.token)
  const activate = await fetch(billingOrigin + '/v1/activate', { method: 'POST', headers: { authorization: `Bearer ${activationToken}`, 'content-type': 'application/json' }, body: JSON.stringify({ licenseKey: emailed.licenseKey }) })
  check('separate desktop installation activates against Stripe payment', activate.status === 200 && (await activate.json()).active)
  console.log('REAL_STRIPE_SANDBOX_FLOW_PASSED')
} catch (error) {
  console.error(error.message)
  if (browser) {
    const pages = browser.contexts().flatMap((context) => context.pages())
    if (pages[0]) {
      console.error('Browser URL:', pages[0].url())
      console.error('Browser fields:', (await pages[0].locator('input').evaluateAll((nodes) => nodes.map((n) => ({ name: n.name, type: n.type, placeholder: n.placeholder })))).slice(0, 30))
      await pages[0].screenshot({ path: join(dir, 'checkout-failure.png') }).catch(() => {})
    }
  }
  console.error('Test artifacts:', dir)
  process.exitCode = 1
} finally {
  if (browser) await browser.close()
  if (gateway.listening) await close(gateway)
  if (service.server.listening) await close(service.server)
  service.db.close()
  if (process.exitCode !== 1) rmSync(dir, { recursive: true, force: true })
}
