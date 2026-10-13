// Two independent Stripe test buyers, read through the same database by the owner dashboard.
// No real charges or customer emails: Stripe is in test mode and email delivery is captured here.
import { createHash, randomBytes } from 'node:crypto'
import { createReadStream, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { extname, join, resolve, sep } from 'node:path'
import { chromium } from 'playwright'
import { createBillingServer } from '../billing-server/server.mjs'
import { createAdminServer } from '../admin-dashboard/server/local-server.mjs'
import { createSqliteAdminStore } from '../admin-dashboard/server/stores.mjs'

const site = resolve(process.env.LANDING_SITE_DIR || '')
const installer = resolve(process.env.BILLING_TEST_INSTALLER_PATH || '')
if (!existsSync(join(site, 'sales.js')) || !existsSync(installer)) throw new Error('Set LANDING_SITE_DIR and BILLING_TEST_INSTALLER_PATH.')
if (!process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_')) throw new Error('Only a Stripe test secret key is accepted.')

const dir = mkdtempSync(join(tmpdir(), 'nafran-two-buyers-'))
const billingPort = 38757
const sitePort = 38911
const billingOrigin = `http://127.0.0.1:${billingPort}`
const siteOrigin = `http://127.0.0.1:${sitePort}`
const database = join(dir, 'billing.db')
const env = {
  ...process.env,
  BILLING_PORT: String(billingPort),
  BILLING_DB_PATH: database,
  BILLING_PUBLIC_URL: billingOrigin,
  APP_PUBLIC_URL: siteOrigin,
  BILLING_ALLOWED_ORIGINS: siteOrigin,
  DOWNLOAD_SIGNING_KEY: randomBytes(32).toString('hex'),
  LOCAL_DOWNLOAD_PATH: installer,
}
const messages = []
const billing = createBillingServer({ env, sendEmail: async (message) => { messages.push(message); return true } })
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.woff2': 'font/woff2' }
const landing = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, siteOrigin)
    const pathname = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname)
    const file = resolve(site, '.' + pathname)
    if (!file.startsWith(site + sep) || !existsSync(file)) { response.writeHead(404).end(); return }
    response.writeHead(200, { 'content-type': types[extname(file)] || 'application/octet-stream' })
    if (pathname === '/index.html') {
      response.end(readFileSync(file, 'utf8').replace('<script src="./sales.js"', `<script src="./sales.js" data-billing-api="${billingOrigin}"`))
    } else createReadStream(file).pipe(response)
  } catch { response.writeHead(500).end() }
})
const listen = (server, port) => new Promise((done, fail) => { server.once('error', fail); server.listen(port, '127.0.0.1', done) })
const close = (server) => new Promise((done) => server.close(done))
const check = (name, condition) => { if (!condition) throw new Error(`FAIL ${name}`); console.log(`PASS ${name}`) }
let browser
let admin
let adminStore
try {
  await listen(billing.server, billingPort)
  await listen(landing, sitePort)
  browser = await chromium.launch({ headless: true })
  const buyerEmails = []
  for (let buyer = 1; buyer <= 2; buyer += 1) {
    const context = await browser.newContext()
    try {
      const page = await context.newPage()
      const email = `nafran-two-buyer-${Date.now()}-${buyer}@example.com`
      buyerEmails.push(email)
      await page.goto(siteOrigin, { waitUntil: 'domcontentloaded' })
      await page.locator('[data-buy-product="lifetime"]').first().click()
      await page.waitForURL(/checkout\.stripe\.com/, { timeout: 60_000 })
      await page.locator('input[name="email"]').fill(email)
      await page.locator('input[name="cardNumber"]').fill('4242424242424242')
      await page.locator('input[name="cardExpiry"]').fill('1234')
      await page.locator('input[name="cardCvc"]').fill('123')
      await page.locator('input[name="billingName"]').fill(`Nafran Test Buyer ${buyer}`)
      await page.getByRole('button', { name: /Pay|Subscribe/i }).last().click()
      await page.waitForURL((url) => url.origin === siteOrigin && url.searchParams.has('purchase'), { timeout: 90_000 })
      await page.waitForFunction(() => document.querySelector('[data-purchase-status]')?.textContent.includes('Download the installer'), { timeout: 60_000 })
      check(`buyer ${buyer} completes Stripe test payment and receives a license`,
        messages.some((item) => item.to === email && item.kind === 'lifetime' && /^NF(?:-[A-Z0-9]{4}){10}$/.test(item.licenseKey)))
    } finally { await context.close() }
  }
  check('two separate license rows exist', billing.db.prepare('select count(*) as n from licenses').get().n === 2)
  check('two distinct buyers received license emails', new Set(messages.filter((m) => m.kind === 'lifetime').map((m) => m.to)).size === 2)

  const ownerToken = randomBytes(32).toString('base64url')
  adminStore = await createSqliteAdminStore(database)
  admin = await createAdminServer({
    env: { ...env, ADMIN_TOKEN_SHA256: createHash('sha256').update(ownerToken).digest('hex'), ADMIN_SESSION_SECRET: randomBytes(32).toString('base64url'), ADMIN_LOG: '0' },
    store: adminStore,
  })
  await listen(admin.server, 0)
  const adminOrigin = `http://127.0.0.1:${admin.server.address().port}`
  const login = await fetch(adminOrigin + '/admin/api/session', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: ownerToken }),
  })
  const cookie = login.headers.get('set-cookie')?.split(';')[0]
  check('owner dashboard sign-in succeeds', login.status === 200 && Boolean(cookie))
  const getAdmin = async (path) => {
    const response = await fetch(adminOrigin + '/admin/api/' + path, { headers: { cookie } })
    if (!response.ok) throw new Error(`Admin ${path} returned ${response.status}`)
    return response.json()
  }
  const summary = await getAdmin('summary')
  check('dashboard summary counts 2 customers, 2 payments and 2 licenses',
    summary.counts.customers === 2 && summary.counts.purchases === 2 && summary.counts.licenses === 2 && summary.counts.emailed === 2 && summary.usage.registered === 2)
  const users = await getAdmin('users')
  const purchases = await getAdmin('purchases')
  check('dashboard lists both users and both paid purchases',
    users.rows.length === 2 && purchases.rows.filter((item) => item.status === 'paid').length === 2)
  const revenue = await getAdmin('revenue')
  check('dashboard revenue totals $60 across the 2 Stripe test payments',
    revenue.available && revenue.net === 6000 && revenue.lifetimeSales === 2)

  const ownerContext = await browser.newContext()
  try {
    const page = await ownerContext.newPage()
    await page.goto(adminOrigin + '/admin/')
    await page.getByRole('textbox', { name: 'Owner token' }).fill(ownerToken)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await page.getByRole('button', { name: 'Users', exact: true }).click()
    const payingLabel = page.getByText('Paying customers', { exact: true }).last()
    await payingLabel.waitFor({ timeout: 20_000 })
    const payingValue = (await payingLabel.evaluate((element) => element.parentElement?.parentElement?.innerText))?.split('\n')[1]?.trim()
    check('signed-in dashboard UI displays 2 paying customers', payingValue === '2')
    const registeredLabel = page.getByText('Registered', { exact: true }).first()
    const registeredValue = (await registeredLabel.evaluate((element) => element.parentElement?.parentElement?.innerText))?.split('\n')[1]?.trim()
    check('signed-in dashboard UI displays 2 registered users', registeredValue === '2')
  } finally { await ownerContext.close() }
  console.log('TWO_BUYER_DASHBOARD_FLOW_PASSED')
} finally {
  if (browser) await browser.close()
  if (admin?.server.listening) await close(admin.server)
  adminStore?.close()
  if (landing.listening) await close(landing)
  if (billing.server.listening) await close(billing.server)
  billing.db.close()
  rmSync(dir, { recursive: true, force: true })
}
