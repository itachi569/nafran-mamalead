import assert from 'node:assert/strict'
import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { _electron as electron } from 'playwright'
import { createBillingServer } from '../billing-server/server.mjs'

const root = resolve(import.meta.dirname, '..')
const directory = mkdtempSync(join(tmpdir(), 'nafran-desktop-decision-'))
const delivered = []
let checkoutSession
let checkoutFields
const sessions = new Map()
const fakeStripe = async (raw, request = {}) => {
  const path = new URL(raw).pathname
  let result
  if (path.endsWith('/prices/price_lifetime')) result = { active: true, currency: 'pkr', unit_amount: 1000000, recurring: null }
  else if (path.endsWith('/checkout/sessions') && request.method === 'POST') {
    checkoutFields = new URLSearchParams(request.body)
    checkoutSession = {
      id: `cs_test_direct${sessions.size + 1}`, url: `https://checkout.stripe.com/c/pay/cs_test_direct${sessions.size + 1}`,
      client_reference_id: checkoutFields.get('client_reference_id'), mode: checkoutFields.get('mode'),
      metadata: { product: checkoutFields.get('metadata[product]'), checkoutFlow: checkoutFields.get('metadata[checkoutFlow]') },
      status: 'open', payment_status: 'unpaid', customer: null, customer_details: { email: null },
      payment_intent: 'pi_decision', amount_total: 100000, currency: 'pkr', livemode: false,
    }
    sessions.set(checkoutSession.id, checkoutSession)
    result = checkoutSession
  } else if (/\/checkout\/sessions\/cs_test_direct\d+\/line_items$/.test(path)) result = { data: [{ price: { currency: 'pkr', unit_amount: 100000, recurring: null }, quantity: 1 }] }
  else if (/\/checkout\/sessions\/cs_test_direct\d+$/.test(path)) result = sessions.get(path.split('/').at(-1))
  else if (path.endsWith('/payment_intents/pi_decision')) result = { status: 'succeeded', latest_charge: 'ch_decision' }
  else if (path.endsWith('/charges/ch_decision')) result = { paid: true, refunded: false, amount_refunded: 0, disputed: false, created: Math.floor(Date.now() / 1000) }
  else throw new Error(`Unexpected Stripe request: ${path}`)
  return { ok: true, json: async () => result }
}
const service = createBillingServer({
  env: {
    STRIPE_SECRET_KEY: 'sk_test_decision', STRIPE_PRICE_LIFETIME: 'price_lifetime',
    BILLING_DB_PATH: join(directory, 'billing.db'), BILLING_PORT: '0',
    BILLING_PUBLIC_URL: 'http://127.0.0.1:38747', DOWNLOAD_SIGNING_KEY: 'desktop-decision-test-signing-secret-123456',
  },
  fetch: fakeStripe,
  sendEmail: async (message) => { delivered.push(message); return true },
})
let desktop
try {
  await new Promise((resolve, reject) => service.server.once('error', reject).listen(0, '127.0.0.1', resolve))
  const origin = `http://127.0.0.1:${service.server.address().port}`
  const env = { ...process.env, LEADSNAP_BILLING_API_URL: origin, APPDATA: join(directory, 'appdata') }
  delete env.ELECTRON_RUN_AS_NODE
  const packaged = process.env.NAFRAN_TEST_PACKAGED === '1'
  desktop = await electron.launch(packaged ? {
    executablePath: resolve(root, 'release/win-unpacked/Nafran Leads Scraper.exe'),
    args: [`--user-data-dir=${join(directory, 'profile')}`], env, timeout: 60_000,
  } : { cwd: root, args: ['.', `--user-data-dir=${join(directory, 'profile')}`], env, timeout: 60_000 })
  if (packaged) await desktop.evaluate((_, mockOrigin) => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = (input, init) => {
      const url = new URL(String(input))
      if (url.origin === 'https://api.mamalead.com') return originalFetch(new URL(url.pathname + url.search, mockOrigin), init)
      return originalFetch(input, init)
    }
  }, origin)
  await desktop.evaluate(({ shell }) => { globalThis.__nafranOpenedCheckoutUrl = ''; shell.openExternal = async (url) => { globalThis.__nafranOpenedCheckoutUrl = url } })
  const page = await desktop.firstWindow()
  await page.locator('[data-view="settings"]').first().click()
  await page.locator('[data-stab="plan"]').first().click()
  if (process.env.NAFRAN_CAPTURE_SITE_SHOTS === '1') {
    await page.setViewportSize({ width: 1496, height: 1000 })
    await page.screenshot({ path: resolve(root, 'website/img/app/settings.png') })
    await page.locator('.billing-plan-grid').scrollIntoViewIfNeeded()
    await page.screenshot({ path: resolve(root, 'website/img/app/settings-plans.png') })
  }
  const subscribe = page.locator('[data-decision-subscribe="1"]')
  assert.equal(await subscribe.evaluate((button) => getComputedStyle(button).backgroundColor), 'rgb(28, 28, 28)')
  await subscribe.getByText('Subscribe now').click()
  assert.equal(checkoutFields.get('mode'), 'payment')
  assert.equal(checkoutFields.get('customer_creation'), 'always')
  assert.equal(checkoutFields.get('line_items[0][price_data][unit_amount]'), '100000')
  assert.equal(checkoutFields.get('metadata[checkoutFlow]'), 'desktop-direct')
  assert.equal(await desktop.evaluate(() => globalThis.__nafranOpenedCheckoutUrl), checkoutSession.url)
  console.log('PASS  prominent Subscribe button opens a device-bound Rs 1,000 one-time Stripe Checkout')

  checkoutSession.status = 'complete'
  checkoutSession.payment_status = 'paid'
  checkoutSession.customer = 'cus_decision'
  checkoutSession.customer_details.email = 'decision@example.test'
  await page.locator('[data-stab="plan"][aria-current="page"]').waitFor({ timeout: 15_000 })
  await page.locator('[data-notifications-button="1"]').click()
  await page.locator('[data-notifications-panel="1"]').getByText(/1000 of 1,000 searches are available until/).waitFor({ timeout: 15_000 })
  await page.locator('[data-notifications-close="1"]').click()
  const status = await page.evaluate(() => window.desktop.billing.status())
  assert.equal(status.license.kind, 'decision')
  assert.equal(status.decisionMaker.monthlyRemaining, 1000)
  assert.equal(status.coreLicenseActive, false)
  assert.equal(status.decisionKeyEmail, null)
  assert.equal(delivered.length, 0)
  console.log('PASS  verified payment unlocks the app and saves a notification without emailing a key')
  const mapsFailure = await page.evaluate(async () => {
    try { await window.desktop.scraper.start({ provider: 'invalid', query: {} }); return '' }
    catch (error) { return String(error?.message ?? error) }
  })
  assert.match(mapsFailure, /Activate an active 1-day trial or lifetime/)
  console.log('PASS  device-bound pass unlocks Decision Makers without unlocking Maps')
  const imported = await page.evaluate(() => window.desktop.local.imports.websites(['https://example.com']))
  assert.equal(imported.leadIds.length, 1)
  console.log('PASS  Decision Makers-only buyer can import a website for a lookup')

  const owner = service.db.prepare('select owner_id from decision_passes limit 1').get().owner_id
  const insertUse = service.db.prepare('insert into decision_lead_uses (owner_id, period_key, subject_hash, slot, created_at) values (?, ?, ?, ?, ?)')
  for (let slot = 1; slot <= 500; slot += 1) insertUse.run(owner, `pass:${checkoutSession.id}`, `standalone-lead-${slot}`, slot, new Date().toISOString())
  await page.evaluate(() => window.dispatchEvent(new Event('nafran:billing-updated')))
  await page.locator('[data-notifications-button="1"]').click()
  await page.locator('[data-notifications-panel="1"]').getByText(/500 of 1000 searches remain/).waitFor({ timeout: 15_000 })
  console.log('PASS  Decision Makers-only buyer also receives the saved 500-search alert')
  await page.locator('[data-notifications-close="1"]').click()
  for (let slot = 501; slot <= 900; slot += 1) insertUse.run(owner, `pass:${checkoutSession.id}`, `standalone-lead-${slot}`, slot, new Date().toISOString())
  await page.evaluate(() => window.dispatchEvent(new Event('nafran:billing-updated')))
  await page.locator('[data-notifications-button="1"]').click()
  await page.locator('[data-notifications-panel="1"]').getByText(/100 of 1000 searches remain/).waitFor({ timeout: 15_000 })
  console.log('PASS  Decision Makers-only buyer also receives the saved 100-search alert')
  await page.locator('[data-notifications-close="1"]').click()
  for (let slot = 901; slot <= 1000; slot += 1) insertUse.run(owner, `pass:${checkoutSession.id}`, `standalone-lead-${slot}`, slot, new Date().toISOString())
  await page.evaluate(() => window.dispatchEvent(new Event('nafran:billing-updated')))
  await desktop.evaluate(({ app }) => { app.emit('second-instance', {}, ['mamalead://subscribe/decision-makers'], '', {}) })
  await page.waitForFunction(() => Boolean(localStorage.getItem('nafran.billing.decisionCheckoutUntil')), null, { timeout: 15_000 })
  assert.equal(sessions.size, 2)
  assert.equal(checkoutFields.get('customer'), 'cus_decision')
  assert.equal(await desktop.evaluate(() => globalThis.__nafranOpenedCheckoutUrl), checkoutSession.url)
  console.log('PASS  website handoff opens the app and starts renewal Checkout')
  checkoutSession.status = 'complete'
  checkoutSession.payment_status = 'paid'
  await page.waitForFunction(async () => (await window.desktop.billing.status()).decisionMaker?.monthlyRemaining === 1000, null, { timeout: 15_000 })
  assert.equal(delivered.length, 0)
  console.log('PASS  manual renewal restores 1,000 searches without a key email')
} finally {
  if (desktop) await desktop.close().catch(() => {})
  service.close()
  const tempRoot = realpathSync(tmpdir()) + sep
  if (realpathSync(directory).startsWith(tempRoot)) rmSync(directory, { recursive: true, force: true })
}
