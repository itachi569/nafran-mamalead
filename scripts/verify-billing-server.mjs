import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createHash, createHmac } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { createBillingServer } from '../billing-server/server.mjs'
import { createCloudFunction } from '../billing-server/api/billing.mjs'

const dir = mkdtempSync(join(tmpdir(), 'mamalead-billing-'))
const database = join(dir, 'billing.db')
const installerPath = join(dir, 'Nafran.exe')
writeFileSync(installerPath, 'installer bytes')
const sessions = new Map()
const emails = []
let chargeRefunded = false
let failNextLicenseEmail = false
const fakeStripe = async (raw, request) => {
  const url = new URL(raw)
  const path = url.pathname
  const body = request.body ? new URLSearchParams(request.body) : null
  let result
  if (path.endsWith('/prices/price_lifetime')) result = { active: true, currency: 'usd', unit_amount: 3000, recurring: null }
  else if (path.endsWith('/prices/price_decision')) result = { active: true, currency: 'usd', unit_amount: 300, recurring: { interval: 'month' } }
  else if (path.endsWith('/checkout/sessions') && request.method === 'POST') {
    const id = body.get('mode') === 'payment' ? 'cs_test_lifetime' : 'cs_test_decision'
    const url = `https://checkout.stripe.com/c/pay/${id}`
    sessions.set(id, { id, url, client_reference_id: body.get('client_reference_id'), mode: body.get('mode'), metadata: { product: body.get('metadata[product]') }, status: 'open', payment_status: 'unpaid', customer: 'cus_mock', customer_details: { email: 'buyer@example.test' }, payment_intent: id === 'cs_test_lifetime' ? 'pi_mock' : null, subscription: id === 'cs_test_decision' ? 'sub_mock' : null, livemode: false })
    result = { id, url }
  } else if (/\/checkout\/sessions\/cs_test_\w+\/line_items$/.test(path)) {
    result = { data: [{ price: { id: path.includes('decision') ? 'price_decision' : 'price_lifetime' } }] }
  } else if (/\/checkout\/sessions\/cs_test_\w+$/.test(path)) result = sessions.get(path.split('/').at(-1))
  else if (path.endsWith('/payment_intents/pi_mock')) result = { status: 'succeeded', latest_charge: 'ch_mock' }
  else if (path.endsWith('/charges/ch_mock')) result = { paid: true, refunded: chargeRefunded, amount_refunded: chargeRefunded ? 3000 : 0, disputed: false }
  else if (path.endsWith('/subscriptions/sub_mock')) result = { status: 'active', livemode: false }
  else if (path.endsWith('/billing_portal/sessions')) result = { url: 'https://billing.stripe.com/p/session/mock' }
  else if (path.endsWith('/invoices')) result = { data: [{ id: 'in_mock', number: 'M-1', created: 1_700_000_000, total: 3000, currency: 'usd', status: 'paid', hosted_invoice_url: 'https://invoice.stripe.com/i/mock' }] }
  else throw new Error(`Unexpected Stripe request: ${path}`)
  return { ok: true, json: async () => result }
}

const service = createBillingServer({
  env: { STRIPE_SECRET_KEY: 'sk_test_placeholder', STRIPE_PRICE_LIFETIME: 'price_lifetime', STRIPE_PRICE_DECISION_MAKER: 'price_decision', BILLING_DB_PATH: database, BILLING_PORT: '0', BILLING_PUBLIC_URL: 'http://127.0.0.1:38747', LOCAL_DOWNLOAD_PATH: installerPath, DOWNLOAD_SIGNING_KEY: 'test-download-secret-with-32-characters', STRIPE_WEBHOOK_SECRET: 'whsec_test', BILLING_ALLOWED_ORIGINS: 'https://mamalead.com' },
  fetch: fakeStripe,
  sendEmail: async (message) => {
    if (message.kind === 'lifetime' && failNextLicenseEmail) { failNextLicenseEmail = false; return false }
    emails.push(message)
    return true
  },
})
await new Promise((resolve) => service.server.listen(0, '127.0.0.1', resolve))
const base = `http://127.0.0.1:${service.server.address().port}`
let passed = 0
function check(name, condition) { assert.ok(condition, name); passed += 1; console.log(`PASS  ${name}`) }
async function call(path, token, method = 'GET', data, device) {
  const response = await fetch(base + path, { method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(device ? { 'x-nafran-device-id': device, 'x-nafran-device-platform': 'Windows x64 10.0' } : {}), ...(data ? { 'content-type': 'application/json' } : {}) }, body: data ? JSON.stringify(data) : undefined })
  return { status: response.status, body: await response.json() }
}
try {
  const freeDownload = await fetch(base + '/v1/download')
  check('any visitor can download the installer without a key or account', freeDownload.status === 200 && await freeDownload.text() === 'installer bytes' && service.db.prepare('select count(*) as n from billing_public_downloads').get().n === 1)
  const forgedFreeDownload = await fetch(base + '/v1/download?grant=forged')
  check('a supplied forged download grant is still rejected', forgedFreeDownload.status === 401)
  const register = await call('/v1/installations', null, 'POST')
  const token = register.body.token
  check('registration returns a random installation token', register.status === 201 && /^[A-Za-z0-9_-]{43}$/.test(token))
  const preflight = await fetch(base + '/v1/checkout', { method: 'OPTIONS', headers: { origin: 'https://mamalead.com', 'access-control-request-method': 'POST', 'access-control-request-headers': 'authorization,content-type' } })
  check('the website origin can preflight the private billing API', preflight.status === 204 && preflight.headers.get('access-control-allow-origin') === 'https://mamalead.com')
  const foreignOrigin = await fetch(base + '/v1/installations', { method: 'POST', headers: { origin: 'https://foreign.example.test' } })
  check('an unrelated browser origin is denied', foreignOrigin.status === 403)
  check('the database stores only a token hash', !readFileSync(database).includes(Buffer.from(token)))
  const unauthenticated = await call('/v1/status', null)
  check('billing status requires an installation token', unauthenticated.status === 401)
  const status = await call('/v1/status', token)
  check('the $30 lifetime price comes from Stripe', status.body.lifetime.amount === 3000 && !status.body.lifetime.active)
  const earlyAddon = await call('/v1/checkout', token, 'POST', { product: 'decisionMaker' })
  check('a separate Decision Maker subscription is no longer sold', earlyAddon.status === 400)
  const trial = await call('/v1/trial', token, 'POST', { email: 'trial@example.test' })
  const trialKey = emails.at(-1)?.licenseKey
  check('a 1-day trial key is emailed and not returned to the browser', trial.status === 200 && trial.body.emailSent && !JSON.stringify(trial.body).includes(trialKey) && emails.at(-1)?.kind === 'trial')
  check('trial key is stored only as a hash', /^NF(?:-[A-Z0-9]{4}){10}$/.test(trialKey) && !readFileSync(database).includes(Buffer.from(trialKey)))
  const repeatedTrial = await call('/v1/trial', token, 'POST', { email: 'trial@example.test' })
  check('an email and browser cannot claim another trial', repeatedTrial.status === 409)
  const trialInstaller = await call('/v1/download-by-license', null, 'POST', { licenseKey: trialKey })
  check('emailed trial key can obtain a protected installer link before activation', trialInstaller.status === 200 && trialInstaller.body.url.includes('/v1/download?grant='))
  const trialDownloadUrl = new URL(trialInstaller.body.url)
  const trialDownload = await fetch(base + trialDownloadUrl.pathname + trialDownloadUrl.search)
  check('the server streams the private installer only through a signed trial grant', trialDownload.status === 200 && await trialDownload.text() === 'installer bytes' && trialDownload.headers.get('content-length') === '15')
  const firstDevice = 'a'.repeat(64)
  const otherDevice = 'b'.repeat(64)
  const trialMachine = (await call('/v1/installations', null, 'POST', undefined, firstDevice)).body.token
  const trialActivation = await call('/v1/activate', trialMachine, 'POST', { licenseKey: trialKey }, firstDevice)
  const trialStatus = await call('/v1/status', trialMachine, 'GET', undefined, firstDevice)
  check('trial starts on first machine activation and unlocks every built-in feature', trialActivation.status === 200 && trialActivation.body.kind === 'trial' && trialStatus.body.trial.active && trialStatus.body.decisionMaker.active)
  check('server stores a hashed device ID and platform with activation', service.db.prepare('select device_id, device_platform from installations where token_hash = ?').get(createHash('sha256').update(trialMachine).digest('hex')).device_id === firstDevice)
  check('same installation token cannot be reused without its device identity', (await call('/v1/status', trialMachine)).status === 403 && (await call('/v1/status', trialMachine, 'GET', undefined, otherDevice)).status === 403)
  check('trial expiry is 24 hours after first activation', Math.abs(Date.parse(trialActivation.body.expiresAt) - Date.parse(trialActivation.body.activatedAt) - 86_400_000) < 1000)
  const anotherTrialMachine = (await call('/v1/installations', null, 'POST')).body.token
  check('trial key cannot be activated on another machine', (await call('/v1/activate', anotherTrialMachine, 'POST', { licenseKey: trialKey }, otherDevice)).status === 409)
  check('same email cannot claim a new trial through another browser', (await call('/v1/trial', anotherTrialMachine, 'POST', { email: 'trial@example.test' }, otherDevice)).status === 409)
  service.db.prepare("update trial_licenses set expires_at = '2000-01-01T00:00:00.000Z'").run()
  check('expired trial disables all features on the server', !(await call('/v1/status', trialMachine, 'GET', undefined, firstDevice)).body.license.active)
  check('expired trial key cannot be reactivated', (await call('/v1/activate', trialMachine, 'POST', { licenseKey: trialKey }, firstDevice)).status === 403)
  check('expired trial key cannot download the installer', (await call('/v1/download-by-license', null, 'POST', { licenseKey: trialKey })).status === 403)
  const checkout = await call('/v1/checkout', token, 'POST', { product: 'lifetime' })
  check('Lifetime Deal creates a hosted Stripe Checkout', checkout.status === 200 && checkout.body.url.startsWith('https://checkout.stripe.com/'))
  const resumed = await call('/v1/checkout', token, 'POST', { product: 'lifetime' })
  check('an open Checkout session is reused instead of duplicated', resumed.status === 200 && resumed.body.url === checkout.body.url)
  Object.assign(sessions.get('cs_test_lifetime'), { status: 'complete', payment_status: 'paid' })
  const paid = await fetch(base + '/return?session_id=cs_test_lifetime')
  check('completed Checkout is reconciled to this installation', paid.status === 200 && (await call('/v1/status', token)).body.lifetime.active)
  const duplicateLifetime = await call('/v1/checkout', token, 'POST', { product: 'lifetime' })
  check('a paid Lifetime Deal cannot start another checkout', duplicateLifetime.status === 409)
  const issued = await call('/v1/license', token, 'POST')
  check('a paid Lifetime Deal issues a license key without storing it in plaintext', issued.status === 200 && /^NF(?:-[A-Z0-9]{4}){10}$/.test(issued.body.licenseKey) && issued.body.email === 'buyer@example.test' && !readFileSync(database).includes(Buffer.from(issued.body.licenseKey)))
  const reissued = await call('/v1/license', token, 'POST')
  check('reopening a paid return does not issue a second license', reissued.status === 200 && reissued.body.licenseKey === null && reissued.body.last4 === issued.body.licenseKey.slice(-4) && service.db.prepare('select count(*) as count from licenses').get().count === 1)
  check('activation without a device identity is rejected', (await call('/v1/activate', token, 'POST', { licenseKey: issued.body.licenseKey })).status === 400)
  const activated = await call('/v1/activate', token, 'POST', { licenseKey: issued.body.licenseKey }, firstDevice)
  check('the purchased license activates the current installation', activated.status === 200 && activated.body.active)
  const secondToken = (await call('/v1/installations', null, 'POST')).body.token
  const secondActivation = await call('/v1/activate', secondToken, 'POST', { licenseKey: issued.body.licenseKey }, otherDevice)
  check('the same license activates a second installation', secondActivation.status === 200 && secondActivation.body.active)
  check('the second installation inherits verified Stripe entitlement', (await call('/v1/status', secondToken, 'GET', undefined, otherDevice)).body.license.active)
  const thirdToken = (await call('/v1/installations', null, 'POST')).body.token
  const thirdActivation = await call('/v1/activate', thirdToken, 'POST', { licenseKey: issued.body.licenseKey }, 'c'.repeat(64))
  check('a third installation is denied by the activation limit', thirdActivation.status === 409)
  const grant = await call('/v1/download-link', token, 'POST', undefined, firstDevice)
  check('an active license receives a protected short-lived download grant', grant.status === 200 && grant.body.url.includes('/v1/download?grant='))
  const paidDownloadUrl = new URL(grant.body.url)
  const paidDownload = await fetch(base + paidDownloadUrl.pathname + paidDownloadUrl.search)
  check('the server streams the private installer after verified payment', paidDownload.status === 200 && await paidDownload.text() === 'installer bytes')
  const licenseDownload = await call('/v1/download-by-license', null, 'POST', { licenseKey: issued.body.licenseKey })
  check('a valid key can request a protected installer link', licenseDownload.status === 200 && licenseDownload.body.url.includes('/v1/download?grant='))
  const webhookPayload = JSON.stringify({ id: 'evt_test_completed', type: 'checkout.session.completed', data: { object: { id: 'cs_test_lifetime' } } })
  const webhookTimestamp = Math.floor(Date.now() / 1000)
  const webhookSignature = createHmac('sha256', 'whsec_test').update(`${webhookTimestamp}.${webhookPayload}`).digest('hex')
  const webhook = await fetch(base + '/webhooks/stripe', { method: 'POST', headers: { 'stripe-signature': `t=${webhookTimestamp},v1=${webhookSignature}`, 'content-type': 'application/json' }, body: webhookPayload })
  check('Stripe webhooks require and accept a verified signature', webhook.status === 200 && (await webhook.json()).received === true)
  const webhookBuyer = (await call('/v1/installations', null, 'POST')).body.token
  const webhookBuyerId = service.db.prepare('select id from installations where token_hash = ?').get(createHash('sha256').update(webhookBuyer).digest('hex')).id
  sessions.set('cs_test_webhook', { ...sessions.get('cs_test_lifetime'), id: 'cs_test_webhook', client_reference_id: webhookBuyerId, status: 'complete', payment_status: 'paid', customer_details: { email: 'webhook-buyer@example.test' } })
  const retryPayload = JSON.stringify({ id: 'evt_test_retry', type: 'checkout.session.completed', data: { object: { id: 'cs_test_webhook' } } })
  const retrySignature = createHmac('sha256', 'whsec_test').update(`${webhookTimestamp}.${retryPayload}`).digest('hex')
  const sendRetryWebhook = () => fetch(base + '/webhooks/stripe', { method: 'POST', headers: { 'stripe-signature': `t=${webhookTimestamp},v1=${retrySignature}`, 'content-type': 'application/json' }, body: retryPayload })
  failNextLicenseEmail = true
  const failedDelivery = await sendRetryWebhook()
  const pendingDelivery = service.db.prepare('select encrypted_key, sent_at from licenses where installation_id = ?').get(webhookBuyerId)
  check('webhook reports delivery failure and keeps only an encrypted retry copy', failedDelivery.status === 503 && pendingDelivery.encrypted_key?.split('.').length === 3 && !pendingDelivery.sent_at)
  const retriedDelivery = await sendRetryWebhook()
  const recoveredDelivery = service.db.prepare('select encrypted_key, sent_at from licenses where installation_id = ?').get(webhookBuyerId)
  check('retrying the signed webhook emails the same paid key and clears the encrypted copy', retriedDelivery.status === 200 && emails.at(-1).to === 'webhook-buyer@example.test' && emails.at(-1).deliveryId && !recoveredDelivery.encrypted_key && Boolean(recoveredDelivery.sent_at))
  const webhookLicense = await call('/v1/license', webhookBuyer, 'POST')
  check('a buyer returning after webhook delivery does not get a duplicate key', webhookLicense.status === 200 && webhookLicense.body.licenseKey === null && webhookLicense.body.emailSent)
  const badWebhook = await fetch(base + '/webhooks/stripe', { method: 'POST', headers: { 'stripe-signature': 't=1,v1=bad', 'content-type': 'application/json' }, body: webhookPayload })
  check('an invalid Stripe webhook signature is rejected', badWebhook.status === 400)
  chargeRefunded = true
  check('a refunded payment revokes active status despite a saved license', !(await call('/v1/status', token, 'GET', undefined, firstDevice)).body.lifetime.active)
  check('a refunded payment revokes other machines too', !(await call('/v1/status', secondToken, 'GET', undefined, otherDevice)).body.license.active)
  const afterRefund = await call('/v1/activate', token, 'POST', { licenseKey: issued.body.licenseKey }, firstDevice)
  check('a refunded license cannot be activated again', afterRefund.status === 403)
  const refundedDownload = await call('/v1/download-by-license', null, 'POST', { licenseKey: issued.body.licenseKey })
  check('a refunded license cannot download the installer', refundedDownload.status === 403)
  chargeRefunded = false
  check('restored $30 purchase includes Decision Makers without an add-on', (await call('/v1/status', token, 'GET', undefined, firstDevice)).body.decisionMaker.active)
  const invoices = await call('/v1/invoices', token, 'GET', undefined, firstDevice)
  check('invoice rows come from Stripe', invoices.body.invoices.length === 1 && invoices.body.invoices[0].number === 'M-1')
  const portal = await call('/v1/portal', token, 'POST', undefined, firstDevice)
  check('customer portal is created on the server', portal.body.url.startsWith('https://billing.stripe.com/'))
  const live = createBillingServer({
    env: { STRIPE_SECRET_KEY: 'rk_live_placeholder', STRIPE_PRICE_LIFETIME: 'price_lifetime', STRIPE_PRICE_DECISION_MAKER: 'price_decision', BILLING_DB_PATH: join(dir, 'live.db'), BILLING_PORT: '0', BILLING_PUBLIC_URL: 'http://127.0.0.1:38748' },
    fetch: fakeStripe,
  })
  try {
    await new Promise((resolve) => live.server.listen(0, '127.0.0.1', resolve))
    const liveBase = `http://127.0.0.1:${live.server.address().port}`
    const registration = await fetch(liveBase + '/v1/installations', { method: 'POST' })
    const liveToken = (await registration.json()).token
    const forbidden = await fetch(liveBase + '/v1/checkout', { method: 'POST', headers: { authorization: `Bearer ${liveToken}`, 'content-type': 'application/json' }, body: JSON.stringify({ product: 'lifetime' }) })
    check('live Checkout refuses a local HTTP return URL', forbidden.status === 503)
  } finally {
    await new Promise((resolve) => live.server.close(resolve))
    live.db.close()
  }
  const cloudRows = new Map()
  let blobAccess
  const cloud = createCloudFunction({
    env: { STRIPE_SECRET_KEY: 'sk_test_placeholder', STRIPE_PRICE_LIFETIME: 'price_lifetime', STRIPE_PRICE_DECISION_MAKER: 'price_decision', BILLING_PUBLIC_URL: 'https://billing.example.test', DATABASE_URL: 'postgres://example', BLOB_DOWNLOAD_PATH: 'installers/Nafran.exe', DOWNLOAD_SIGNING_KEY: 'cloud-test-download-secret' },
    fetch: fakeStripe,
    getBlob: async (pathname, options) => {
      blobAccess = { pathname, options }
      return { statusCode: 200, blob: { contentType: 'application/octet-stream' }, stream: new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('installer bytes')); controller.close() } }) }
    },
    storeFactory: () => ({
      async create(id, tokenHash, createdAt) { cloudRows.set(id, { id, token_hash: tokenHash, created_at: createdAt, customer_id: null, lifetime_session_id: null, decision_subscription_id: null, pending_lifetime_session_id: null, pending_decision_session_id: null }) },
      async byTokenHash(tokenHash) { return [...cloudRows.values()].find((row) => row.token_hash === tokenHash) ?? null },
      async byId(id) { return cloudRows.get(id) ?? null },
      async savePending(id, product, sessionId) { cloudRows.get(id)[product === 'lifetime' ? 'pending_lifetime_session_id' : 'pending_decision_session_id'] = sessionId },
      async saveLifetime(id, sessionId, customerId) { Object.assign(cloudRows.get(id), { lifetime_session_id: sessionId, pending_lifetime_session_id: null, customer_id: customerId }) },
      async saveDecision(id, subscriptionId, customerId) { Object.assign(cloudRows.get(id), { decision_subscription_id: subscriptionId, pending_decision_session_id: null, customer_id: customerId }) },
    }),
  })
  const cloudCall = async (endpoint, method = 'GET', token, data, query = '') => {
    const response = await cloud.fetch(new Request(`https://billing.example.test/api/billing?endpoint=${endpoint}${query}`, { method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(data ? { 'content-type': 'application/json' } : {}) }, body: data ? JSON.stringify(data) : undefined }))
    return { status: response.status, body: await response.text() }
  }
  const cloudHealth = await cloudCall('health')
  check('Vercel function routes the HTTPS health request', cloudHealth.status === 200 && JSON.parse(cloudHealth.body).ok)
  const cloudRegistration = await cloudCall('installations', 'POST')
  const cloudToken = JSON.parse(cloudRegistration.body).token
  check('Vercel function stores a new installation', cloudRegistration.status === 201 && cloudRows.size === 1)
  const cloudStatus = await cloudCall('status', 'GET', cloudToken)
  check('Vercel function reads Stripe status through persistent-store interface', cloudStatus.status === 200 && JSON.parse(cloudStatus.body).lifetime.amount === 3000)
  const cloudCheckout = await cloudCall('checkout', 'POST', cloudToken, { product: 'lifetime' })
  check('Vercel function creates HTTPS Checkout return URLs', cloudCheckout.status === 200 && JSON.parse(cloudCheckout.body).url.startsWith('https://checkout.stripe.com/'))
  Object.assign(sessions.get('cs_test_lifetime'), { status: 'complete', payment_status: 'paid' })
  const recovered = await cloudCall('status', 'GET', cloudToken)
  check('status refresh recovers a paid Checkout without browser return', recovered.status === 200 && JSON.parse(recovered.body).lifetime.active)
  const cloudGrant = await cloudCall('downloadLink', 'POST', cloudToken)
  const grantValue = new URL(JSON.parse(cloudGrant.body).url).searchParams.get('grant')
  const cloudDownload = await cloudCall('download', 'GET', null, null, `&grant=${encodeURIComponent(grantValue)}`)
  check('Vercel serves installer bytes only through private Blob access', cloudDownload.status === 200 && cloudDownload.body === 'installer bytes' && blobAccess.pathname === 'installers/Nafran.exe' && blobAccess.options.access === 'private')
  const invalidDownload = await cloudCall('download', 'GET', null, null, '&grant=forged')
  check('forged download grants are rejected', invalidDownload.status === 401)
  const cloudReturn = await cloudCall('return', 'GET', null, null, '&session_id=cs_test_lifetime')
  check('Vercel function reconciles a verified payment', cloudReturn.status === 200 && cloudRows.values().next().value.lifetime_session_id === 'cs_test_lifetime')
  const legacyPath = join(dir, 'legacy.db')
  const legacy = new DatabaseSync(legacyPath)
  legacy.exec('create table installations (id text primary key, token_hash text not null unique, customer_id text, lifetime_session_id text, decision_subscription_id text, created_at text not null)')
  legacy.close()
  const migrated = createBillingServer({ env: { STRIPE_SECRET_KEY: 'sk_test_placeholder', STRIPE_PRICE_LIFETIME: 'price_lifetime', STRIPE_PRICE_DECISION_MAKER: 'price_decision', BILLING_DB_PATH: legacyPath, BILLING_PORT: '0', BILLING_PUBLIC_URL: 'http://127.0.0.1:38749' }, fetch: fakeStripe })
  check('an existing local billing database gains trial storage and pending Checkout columns', migrated.db.prepare('pragma table_info(installations)').all().filter((column) => column.name.startsWith('pending_')).length === 2 && Boolean(migrated.db.prepare("select name from sqlite_master where name='trial_licenses'").get()))
  migrated.db.close()
  console.log(`${passed}/${passed} billing server checks passed`)
} finally {
  await new Promise((resolve) => service.server.close(resolve))
  service.db.close()
  rmSync(dir, { recursive: true, force: true })
}
