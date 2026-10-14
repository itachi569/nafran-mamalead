import assert from 'node:assert/strict'
import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { _electron as electron } from 'playwright'
import { createBillingServer } from '../billing-server/server.mjs'

const root = resolve(import.meta.dirname, '..')
const directory = mkdtempSync(join(tmpdir(), 'nafran-desktop-lifetime-'))
let checkoutSession
let customerEmail
const fakeStripe = async (raw, request) => {
  const path = new URL(raw).pathname
  let result
  if (path.endsWith('/prices/price_lifetime')) result = { active: true, currency: 'usd', unit_amount: 3000, recurring: null }
  else if (path.endsWith('/customers') && request.method === 'POST') { customerEmail = new URLSearchParams(request.body).get('email'); result = { id: 'cus_desktop', email: customerEmail } }
  else if (path.endsWith('/checkout/sessions') && request.method === 'POST') {
    const fields = new URLSearchParams(request.body)
    checkoutSession = {
      id: 'cs_test_desktop', url: 'https://checkout.stripe.com/c/pay/cs_test_desktop',
      client_reference_id: fields.get('client_reference_id'), mode: 'payment',
      metadata: { product: 'lifetime' }, status: 'open', payment_status: 'unpaid',
      customer: fields.get('customer'), customer_details: { email: customerEmail },
      payment_intent: 'pi_desktop', livemode: false,
    }
    result = checkoutSession
  } else if (path.endsWith('/checkout/sessions/cs_test_desktop/line_items')) result = { data: [{ price: { id: 'price_lifetime' } }] }
  else if (path.endsWith('/checkout/sessions/cs_test_desktop')) result = checkoutSession
  else if (path.endsWith('/payment_intents/pi_desktop')) result = { status: 'succeeded', latest_charge: 'ch_desktop' }
  else if (path.endsWith('/charges/ch_desktop')) result = { paid: true, refunded: false, amount_refunded: 0, disputed: false }
  else throw new Error(`Unexpected Stripe request: ${path}`)
  return { ok: true, json: async () => result }
}
const service = createBillingServer({
  env: {
    STRIPE_SECRET_KEY: 'sk_test_desktoplifetime', STRIPE_PRICE_LIFETIME: 'price_lifetime',
    BILLING_DB_PATH: join(directory, 'billing.db'), BILLING_PORT: '0',
    BILLING_PUBLIC_URL: 'http://127.0.0.1:38747',
    DOWNLOAD_SIGNING_KEY: 'desktop-lifetime-test-signing-secret-123456',
  },
  fetch: fakeStripe,
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
  await desktop.evaluate(({ shell }) => { shell.openExternal = async () => {} })
  const page = await desktop.firstWindow()
  await page.locator('[data-view="settings"]').first().click()
  await page.locator('[data-stab="plan"]').first().click()
  await page.getByRole('textbox', { name: 'Email for lifetime key' }).fill('buyer@example.test')
  await page.getByRole('button', { name: 'Buy Lifetime' }).click()
  await page.getByRole('button', { name: 'Waiting for payment…' }).waitFor()
  assert.equal(await page.locator('[data-stab="plan"]').getAttribute('aria-current'), 'page')
  assert.equal(checkoutSession.status, 'open')
  console.log('PASS  opening Stripe Checkout keeps the app on Usage while payment is pending')

  checkoutSession.status = 'complete'
  checkoutSession.payment_status = 'paid'
  await page.locator('[data-stab="acct"][aria-current="page"]').waitFor({ timeout: 15_000 })
  await page.locator('[data-license-next-step="1"]').getByText('Payment confirmed.', { exact: false }).waitFor()
  assert.equal(await page.locator('#nafran-license-key').evaluate((element) => element === document.activeElement), true)
  assert.equal(await page.getByRole('button', { name: 'Waiting for payment…' }).count(), 0)
  console.log('PASS  verified paid status automatically opens and focuses Account licence entry')
} finally {
  if (desktop) await desktop.close().catch(() => {})
  service.close()
  const tempRoot = realpathSync(tmpdir()) + sep
  if (realpathSync(directory).startsWith(tempRoot)) rmSync(directory, { recursive: true, force: true })
}
