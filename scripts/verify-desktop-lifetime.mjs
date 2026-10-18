import assert from 'node:assert/strict'
import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { _electron as electron } from 'playwright'
import { createBillingServer } from '../billing-server/server.mjs'

const root = resolve(import.meta.dirname, '..')
const directory = mkdtempSync(join(tmpdir(), 'nafran-desktop-lifetime-'))
let checkoutSession
let decisionCheckoutSession
let checkoutFields
const delivered = []
const fakeStripe = async (raw, request) => {
  const path = new URL(raw).pathname
  let result
  if (path.endsWith('/prices/price_lifetime')) result = { active: true, currency: 'pkr', unit_amount: 1000000, recurring: null }
  else if (path.endsWith('/prices/price_decision')) result = { active: true, currency: 'pkr', unit_amount: 100000, recurring: { interval: 'month' } }
  else if (path.endsWith('/checkout/sessions') && request.method === 'POST') {
    const fields = new URLSearchParams(request.body)
    if (fields.get('metadata[product]') === 'decisionMaker') {
      decisionCheckoutSession = {
        id: 'cs_test_decision', url: 'https://checkout.stripe.com/c/pay/cs_test_decision',
        client_reference_id: fields.get('client_reference_id'), mode: 'payment',
        metadata: { product: 'decisionMaker' }, status: 'open', payment_status: 'unpaid',
        customer: fields.get('customer'), payment_intent: 'pi_decision', livemode: false,
        amount_total: 100000, currency: 'pkr',
      }
      result = decisionCheckoutSession
    } else {
      checkoutFields = fields
      checkoutSession = {
        id: 'cs_test_desktop', url: 'https://checkout.stripe.com/c/pay/cs_test_desktop',
        client_reference_id: fields.get('client_reference_id'), mode: 'payment',
        metadata: { product: 'lifetime', checkoutFlow: fields.get('metadata[checkoutFlow]') }, status: 'open', payment_status: 'unpaid',
        customer: null, customer_details: { email: null },
        payment_intent: 'pi_desktop', livemode: false,
      }
      result = checkoutSession
    }
  } else if (path.endsWith('/checkout/sessions/cs_test_desktop/line_items')) result = { data: [{ price: { id: 'price_lifetime' } }] }
  else if (path.endsWith('/checkout/sessions/cs_test_desktop')) result = checkoutSession
  else if (path.endsWith('/checkout/sessions/cs_test_decision/line_items')) result = { data: [{ price: { currency: 'pkr', unit_amount: 100000, recurring: null }, quantity: 1 }] }
  else if (path.endsWith('/checkout/sessions/cs_test_decision')) result = decisionCheckoutSession
  else if (path.endsWith('/payment_intents/pi_desktop')) result = { status: 'succeeded', latest_charge: 'ch_desktop' }
  else if (path.endsWith('/charges/ch_desktop')) result = { paid: true, refunded: false, amount_refunded: 0, disputed: false }
  else if (path.endsWith('/payment_intents/pi_decision')) result = { status: 'succeeded', latest_charge: 'ch_decision' }
  else if (path.endsWith('/charges/ch_decision')) result = { paid: true, refunded: false, amount_refunded: 0, disputed: false, created: Math.floor(Date.now() / 1000) }
  else throw new Error(`Unexpected Stripe request: ${path}`)
  return { ok: true, json: async () => result }
}
const service = createBillingServer({
  env: {
    STRIPE_SECRET_KEY: 'sk_test_desktoplifetime', STRIPE_PRICE_LIFETIME: 'price_lifetime', STRIPE_PRICE_DECISION_MAKER: 'price_decision',
    BILLING_DB_PATH: join(directory, 'billing.db'), BILLING_PORT: '0',
    BILLING_PUBLIC_URL: 'http://127.0.0.1:38747',
    DOWNLOAD_SIGNING_KEY: 'desktop-lifetime-test-signing-secret-123456',
  },
  fetch: fakeStripe,
  sendEmail: async (message) => { delivered.push(message); return true },
})
let desktop
try {
  await new Promise((resolve, reject) => service.server.once('error', reject).listen(0, '127.0.0.1', resolve))
  const origin = `http://127.0.0.1:${service.server.address().port}`
  const packaged = process.env.NAFRAN_TEST_PACKAGED === '1'
  const env = { ...process.env, LEADSNAP_BILLING_API_URL: origin, APPDATA: join(directory, 'appdata') }
  delete env.ELECTRON_RUN_AS_NODE
  desktop = await electron.launch(packaged ? {
    executablePath: resolve(root, 'release/win-unpacked/Nafran Leads Scraper.exe'),
    args: [`--user-data-dir=${join(directory, 'profile')}`], env, timeout: 60_000,
  } : {
    cwd: root, args: ['.', `--user-data-dir=${join(directory, 'profile')}`], env, timeout: 60_000,
  })
  if (packaged) await desktop.evaluate((_, mockOrigin) => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = (input, init) => {
      const url = new URL(String(input))
      if (url.origin === 'https://api.mamalead.com') return originalFetch(new URL(url.pathname + url.search, mockOrigin), init)
      return originalFetch(input, init)
    }
  }, origin)
  await desktop.evaluate(({ shell }) => {
    globalThis.__nafranOpenedCheckoutUrl = ''
    shell.openExternal = async (url) => { globalThis.__nafranOpenedCheckoutUrl = url }
  })
  const page = await desktop.firstWindow()
  assert.match(await page.locator('[data-view="settings"]').first().innerText(), /Settings & Billing/)
  await page.locator('[data-view="settings"]').first().click()
  await page.locator('[data-stab="plan"]').first().click()
  await page.locator('.billing-stage').waitFor()
  assert.match(await page.locator('.billing-stage').innerText(), /Rs\s*10,000[\s\S]*Rs 1,000\/30 days/)
  assert.equal(await page.locator('[data-lifetime-buy="1"]').isEnabled(), true)
  if (process.env.NAFRAN_WEBSITE_SETTINGS_SCREENSHOT || process.env.NAFRAN_WEBSITE_PLANS_SCREENSHOT || process.env.NAFRAN_WEBSITE_ACCOUNT_SCREENSHOT) {
    await page.setViewportSize({ width: 1500, height: 1000 })
    if (process.env.NAFRAN_WEBSITE_SETTINGS_SCREENSHOT) {
      await page.screenshot({ path: process.env.NAFRAN_WEBSITE_SETTINGS_SCREENSHOT })
    }
    if (process.env.NAFRAN_WEBSITE_PLANS_SCREENSHOT) {
      await page.locator('.billing-plan-grid').scrollIntoViewIfNeeded()
      await page.screenshot({ path: process.env.NAFRAN_WEBSITE_PLANS_SCREENSHOT })
    }
    if (process.env.NAFRAN_WEBSITE_ACCOUNT_SCREENSHOT) {
      await page.locator('[data-stab="acct"]').click()
      await page.locator('#nafran-license-key').waitFor()
      await page.screenshot({ path: process.env.NAFRAN_WEBSITE_ACCOUNT_SCREENSHOT, clip: { x: 0, y: 0, width: 1500, height: 725 } })
      await page.locator('[data-stab="plan"]').click()
      await page.locator('.billing-stage').waitFor()
    }
  }
  if (process.env.NAFRAN_SETTINGS_SCREENSHOT) await page.screenshot({ path: process.env.NAFRAN_SETTINGS_SCREENSHOT, fullPage: true })
  if (process.env.NAFRAN_SETTINGS_DARK_SCREENSHOT) {
    await page.locator('[data-theme-btn="1"]').click()
    await page.screenshot({ path: process.env.NAFRAN_SETTINGS_DARK_SCREENSHOT, fullPage: true })
  }
  await page.locator('[data-stab="pay"]').click()
  await page.getByRole('heading', { name: 'Payment', exact: true }).waitFor()
  await page.locator('[data-stab="plan"]').click()
  await page.locator('[data-trial-open="1"]').click()
  await page.locator('[data-trial-form="1"]').waitFor()
  await page.locator('[data-lifetime-buy="1"]').click()
  await page.waitForFunction(() => Boolean(document.body.textContent?.includes('Enter your email and card on Stripe Checkout')))
  assert.equal(await page.locator('[data-lifetime-payment="1"]').count(), 0)
  assert.equal(checkoutFields.get('customer'), null)
  assert.equal(checkoutFields.get('customer_creation'), 'always')
  assert.equal(checkoutFields.get('payment_method_types[0]'), 'card')
  assert.equal(checkoutFields.get('customer_email'), null)
  assert.equal(checkoutSession.status, 'open')
  assert.equal(await desktop.evaluate(() => globalThis.__nafranOpenedCheckoutUrl), checkoutSession.url)
  console.log('PASS  Buy now opens Stripe Checkout directly, where Stripe collects email and card')

  checkoutSession.status = 'complete'
  checkoutSession.payment_status = 'paid'
  checkoutSession.customer = 'cus_desktop'
  checkoutSession.customer_details.email = 'buyer@example.test'
  await page.locator('[data-stab="acct"][aria-current="page"]').waitFor({ timeout: 15_000 })
  await page.locator('[data-license-next-step="1"]').getByText('Your lifetime license key was sent to buyer@example.test.', { exact: false }).waitFor()
  assert.equal(delivered.length, 1)
  assert.equal(delivered[0].to, 'buyer@example.test')
  assert.equal(await page.locator('#nafran-license-key').evaluate((element) => element === document.activeElement), true)
  console.log('PASS  verified payment opens and focuses the Account licence field')

  await page.locator('#nafran-license-key').fill(delivered[0].licenseKey)
  await page.locator('#nafran-license-key').press('Enter')
  await page.locator('[data-license-notice="1"]').getByText('License activated on this machine.').waitFor({ timeout: 15_000 })
  const lifetimeLicense = service.db.prepare('select id, installation_id, activated_at from licenses where activated_at is not null').get()
  const periodKey = `included:${lifetimeLicense.id}:${lifetimeLicense.activated_at}`
  const insertUse = service.db.prepare('insert into decision_lead_uses (owner_id, period_key, subject_hash, slot, created_at) values (?, ?, ?, ?, ?)')
  service.db.exec('begin')
  try {
    for (let slot = 1; slot <= 500; slot += 1) insertUse.run(lifetimeLicense.installation_id, periodKey, `mock-lead-${slot}`, slot, new Date().toISOString())
    service.db.exec('commit')
  } catch (error) { service.db.exec('rollback'); throw error }
  await page.evaluate(() => window.dispatchEvent(new Event('nafran:billing-updated')))
  await page.locator('[data-notifications-button="1"]').click()
  await page.locator('[data-notifications-panel="1"]').getByText('Decision Makers allowance is low').waitFor({ timeout: 15_000 })
  assert.match(await page.locator('[data-notifications-panel="1"]').innerText(), /500 of 1000 searches remain/)
  console.log('PASS  the 500-search alert is saved in notification history')
  await page.locator('[data-notifications-close="1"]').click()
  service.db.exec('begin')
  try {
    for (let slot = 501; slot <= 900; slot += 1) insertUse.run(lifetimeLicense.installation_id, periodKey, `mock-lead-${slot}`, slot, new Date().toISOString())
    service.db.exec('commit')
  } catch (error) { service.db.exec('rollback'); throw error }
  await page.evaluate(() => window.dispatchEvent(new Event('nafran:billing-updated')))
  await page.locator('[data-notifications-button="1"]').click()
  await page.locator('[data-notifications-panel="1"]').getByText(/100 of 1000 searches remain/).waitFor({ timeout: 15_000 })
  assert.match(await page.locator('[data-notifications-panel="1"]').innerText(), /100 of 1000 searches remain/)
  console.log('PASS  the 100-search alert is saved in notification history')
  await page.locator('[data-notifications-close="1"]').click()
  await page.locator('[data-assist="1"]').click()
  await page.locator('[data-chatinput="1"]').fill('Mere kitny Decision Makers baqi hain?')
  await page.locator('[data-chatinput="1"]').press('Enter')
  await page.locator('[data-chat-panel="1"] [data-msg="bot"]').getByText(/100 of 1000 Decision Maker searches baqi hain/).waitFor({ timeout: 15_000 })
  console.log('PASS  Nafran Assist answers with the exact server-verified remaining count')
  await page.locator('[data-chat-panel="1"]').getByRole('button', { name: 'Close chat' }).click()

  service.db.exec('begin')
  try {
    for (let slot = 901; slot <= 1000; slot += 1) insertUse.run(lifetimeLicense.installation_id, periodKey, `mock-lead-${slot}`, slot, new Date().toISOString())
    service.db.exec('commit')
  } catch (error) { service.db.exec('rollback'); throw error }
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await page.locator('[data-stab="plan"]').click()
  const renewalButton = page.locator('[data-decision-subscribe="1"]')
  await renewalButton.getByText('Subscribe again').waitFor({ timeout: 15_000 })
  await renewalButton.click()
  assert.equal(decisionCheckoutSession.mode, 'payment')
  assert.equal(decisionCheckoutSession.amount_total, 100000)
  assert.equal(await desktop.evaluate(() => globalThis.__nafranOpenedCheckoutUrl), decisionCheckoutSession.url)
  decisionCheckoutSession.status = 'complete'
  decisionCheckoutSession.payment_status = 'paid'
  await page.locator('[data-notifications-button="1"]').click()
  await page.locator('[data-notifications-panel="1"]').getByText('Decision Makers are ready').waitFor({ timeout: 15_000 })
  assert.equal(service.db.prepare('select count(*) as n from decision_passes').get().n, 1)
  assert.match(await page.locator('[data-notifications-panel="1"]').innerText(), /1000 of 1,000 searches are available/)
  console.log('PASS  a verified manual payment unlocks 1,000 more searches and saves the success notification')
} finally {
  if (desktop) await desktop.close().catch(() => {})
  service.close()
  const tempRoot = realpathSync(tmpdir()) + sep
  if (realpathSync(directory).startsWith(tempRoot)) rmSync(directory, { recursive: true, force: true })
}
