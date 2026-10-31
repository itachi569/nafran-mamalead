import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createHash, createHmac } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { createBillingServer } from '../billing-server/server.mjs'
import { buildLicenseEmail, greetingNameFromEmail } from '../billing-server/license-email.mjs'
import { createCloudFunction } from '../billing-server/api/billing.mjs'

const dir = mkdtempSync(join(tmpdir(), 'mamalead-billing-'))
const database = join(dir, 'billing.db')
const installerPath = join(dir, 'Nafran.exe')
const macInstallerPath = join(dir, 'Nafran.dmg')
const intelInstallerPath = join(dir, 'Nafran-Intel.dmg')
writeFileSync(installerPath, 'installer bytes')
const sessions = new Map()
const customers = new Map()
const subscriptions = new Map()
const emails = []
const refunds = []
let chargeRefunded = false
let failNextLicenseEmail = false
const fakeStripe = async (raw, request) => {
  const url = new URL(raw)
  const path = url.pathname
  const body = request.body ? new URLSearchParams(request.body) : null
  let result
  if (path.endsWith('/prices/price_lifetime')) result = { active: true, currency: 'pkr', unit_amount: 1000000, recurring: null }
  else if (path.endsWith('/prices/price_decision')) result = { active: true, currency: 'pkr', unit_amount: 100000, recurring: { interval: 'month' } }
  else if (path.endsWith('/refunds') && request.method === 'POST') { refunds.push(Object.fromEntries(body)); result = {id:'re_fixture'+refunds.length,status:'succeeded'} }
  else if (path.endsWith('/customers') && request.method === 'POST') {
    const id = `cus_mock${customers.size + 1}`
    customers.set(id, body.get('email'))
    result = { id, email: body.get('email') }
  }
  else if (path.endsWith('/checkout/sessions') && request.method === 'POST') {
    const decisionPass = body.get('metadata[product]') === 'decisionMaker'
    const count = [...sessions.keys()].filter((key) => key !== 'cs_test_standalone').length
    const id = decisionPass && body.get('metadata[checkoutFlow]') === 'desktop-standalone' ? 'cs_test_standalone' : decisionPass ? `cs_test_decision${count || ''}` : `cs_test_lifetime${count || ''}`
    const url = `https://checkout.stripe.com/c/pay/${id}`
    sessions.set(id, { id, url, success_url:body.get('success_url'), cancel_url:body.get('cancel_url'), client_reference_id: body.get('client_reference_id'), mode: body.get('mode'), metadata: { product: body.get('metadata[product]'), checkoutFlow: body.get('metadata[checkoutFlow]') }, status: 'open', payment_status: 'unpaid', customer: body.get('customer'), customer_details: { email: customers.get(body.get('customer')) }, payment_intent: 'pi_mock', subscription: null, livemode: false, amount_total: decisionPass ? 100000 : 1000000, currency: 'pkr', manualPrice: body.get('line_items[0][price_data][unit_amount]') })
    if (body.get('mode') === 'subscription') subscriptions.set('sub_mock', { id: 'sub_mock', status: 'active', livemode: false, customer: body.get('customer'), latest_invoice: 'in_decision', items: { data: [{ price: { id: 'price_decision' }, current_period_start: Math.floor(Date.now() / 1000) - 60, current_period_end: Math.floor(Date.now() / 1000) + 2_592_000 }] } })
    result = { id, url }
  } else if (/\/checkout\/sessions\/cs_test_\w+\/line_items$/.test(path)) {
    result = { data: [{ price: path.includes('decision') || path.includes('standalone') ? { currency: 'pkr', unit_amount: 100000, recurring: null } : { id: 'price_lifetime' }, quantity: 1 }] }
  } else if (/\/checkout\/sessions\/cs_test_\w+$/.test(path)) result = sessions.get(path.split('/').at(-1))
  else if (path.endsWith('/payment_intents/pi_mock')) result = { status: 'succeeded', latest_charge: 'ch_mock' }
  else if (path.endsWith('/charges/ch_mock')) result = { paid: true, refunded: chargeRefunded, amount_refunded: chargeRefunded ? 1000000 : 0, disputed: false, created: Math.floor(Date.now() / 1000) }
  else if (path.endsWith('/subscriptions/sub_mock')) result = subscriptions.get('sub_mock')
  else if (path.endsWith('/invoices/in_decision')) result = { id: 'in_decision', subscription: 'sub_mock', status: 'paid' }
  else if (path.endsWith('/billing_portal/sessions')) result = { url: 'https://billing.stripe.com/p/session/mock' }
  else if (path.endsWith('/invoices')) result = { data: [{ id: 'in_mock', number: 'M-1', created: 1_700_000_000, total: 1000000, currency: 'pkr', status: 'paid', hosted_invoice_url: 'https://invoice.stripe.com/i/mock' }] }
  else throw new Error(`Unexpected Stripe request: ${path}`)
  return { ok: true, json: async () => result }
}

const service = createBillingServer({
  env: { STRIPE_SECRET_KEY: 'sk_test_placeholder', STRIPE_PRICE_LIFETIME: 'price_lifetime', STRIPE_PRICE_DECISION_MAKER: 'price_decision', BILLING_DB_PATH: database, BILLING_PORT: '0', BILLING_PUBLIC_URL: 'http://127.0.0.1:38747', LOCAL_DOWNLOAD_PATH: installerPath, MAC_ARM64_LOCAL_DOWNLOAD_PATH: macInstallerPath, MAC_X64_LOCAL_DOWNLOAD_PATH: intelInstallerPath, DOWNLOAD_SIGNING_KEY: 'test-download-secret-with-32-characters', STRIPE_WEBHOOK_SECRET: 'whsec_test', BILLING_ALLOWED_ORIGINS: 'https://mamalead.com' },
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
  check('email greeting reads a clean name from Gmail-style addresses', greetingNameFromEmail('jane.doe+trial@gmail.com') === 'Jane Doe')
  const escapedGreeting = buildLicenseEmail({ to: 'amy.<script>@gmail.com', licenseKey: 'NF-TEST', kind: 'trial', download: 'https://mamalead.com/#download' })
  check('email greeting cannot inject HTML into the template', escapedGreeting.html.includes('Hey Amy Script,') && !escapedGreeting.html.includes('<script>') && !escapedGreeting.html.includes('{{'))
  const optionsBeforeMac = await call('/v1/download-options', null)
  check('download choices show Windows ready and both Mac builds unavailable before upload', optionsBeforeMac.status === 200 && optionsBeforeMac.body.windows === true && optionsBeforeMac.body.macArm64 === false && optionsBeforeMac.body.macX64 === false)
  const missingMac = await call('/v1/download?platform=mac', null)
  check('Mac download does not serve a missing installer', missingMac.status === 503)
  writeFileSync(macInstallerPath, 'mac installer bytes')
  const optionsWithMac = await call('/v1/download-options', null)
  check('download choices enable Apple Silicon only when its installer exists', optionsWithMac.status === 200 && optionsWithMac.body.macArm64 === true && optionsWithMac.body.macX64 === false)
  const macDownload = await fetch(base + '/v1/download?platform=mac-arm64')
  check('Apple Silicon download streams its own DMG', macDownload.status === 200 && await macDownload.text() === 'mac installer bytes' && macDownload.headers.get('content-disposition')?.includes('Apple-Silicon.dmg'))
  writeFileSync(intelInstallerPath, 'intel installer bytes')
  const optionsWithIntel = await call('/v1/download-options', null)
  check('download choices enable Intel when its installer exists', optionsWithIntel.body.macX64 === true)
  const intelDownload = await fetch(base + '/v1/download?platform=mac-x64')
  check('Intel download streams its own DMG', intelDownload.status === 200 && await intelDownload.text() === 'intel installer bytes' && intelDownload.headers.get('content-disposition')?.includes('Intel.dmg'))
  const wrongPlatform = await call('/v1/download?platform=linux', null)
  check('unknown platform cannot fall back to the Windows installer', wrongPlatform.status === 400)
  const freeDownload = await fetch(base + '/v1/download')
  check('visitors can download every installer without a key or account', freeDownload.status === 200 && await freeDownload.text() === 'installer bytes' && service.db.prepare('select count(*) as n from billing_public_downloads').get().n === 3)
  const downloadHead = await fetch(base + '/v1/download?platform=windows', { method: 'HEAD' })
  check('HEAD returns GET metadata without downloading or counting a download', downloadHead.status === 200 && await downloadHead.text() === '' && ['content-type','content-length','content-disposition'].every(key => downloadHead.headers.get(key) === freeDownload.headers.get(key)) && service.db.prepare('select count(*) as n from billing_public_downloads').get().n === 3)
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
  check('the Rs 10,000 PKR lifetime price comes from Stripe', status.body.lifetime.amount === 1000000 && status.body.lifetime.currency === 'pkr' && !status.body.lifetime.active)
  const standaloneToken = (await call('/v1/installations', null, 'POST')).body.token
  const earlyAddon = await call('/v1/checkout', standaloneToken, 'POST', { product: 'decisionMaker' })
  check('browser-only identity must open the desktop app to buy Decision Makers', earlyAddon.status === 403 && /desktop app/i.test(earlyAddon.body.error))
  const trial = await call('/v1/trial', token, 'POST', { email: 'trial@example.test' })
  const trialKey = emails.at(-1)?.licenseKey
  check('a 1-day trial key is emailed and not returned to the browser', trial.status === 200 && trial.body.emailSent && !JSON.stringify(trial.body).includes(trialKey) && emails.at(-1)?.kind === 'trial')
  const trialEmail = emails.at(-1)
  check('trial email uses the branded layout, recipient name, real key, and inline logo', trialEmail.html.includes('Hey Trial,') && trialEmail.html.includes(trialKey) && trialEmail.html.includes('300 Google Maps leads') && trialEmail.html.includes('cid:mamalead-logo') && trialEmail.attachments[0]?.content_id === 'mamalead-logo' && !trialEmail.html.includes('ML-7Q4K-P2XD-9HVA'))
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
  check('trial starts on first machine activation without the monthly Decision Makers add-on', trialActivation.status === 200 && trialActivation.body.kind === 'trial' && trialStatus.body.trial.active && !trialStatus.body.decisionMaker.active)
  check('server stores a hashed device ID and platform with activation', service.db.prepare('select device_id, device_platform from installations where token_hash = ?').get(createHash('sha256').update(trialMachine).digest('hex')).device_id === firstDevice)
  check('same installation token cannot be reused without its device identity', (await call('/v1/status', trialMachine)).status === 403 && (await call('/v1/status', trialMachine, 'GET', undefined, otherDevice)).status === 403)
  check('trial expiry is 24 hours after first activation', Math.abs(Date.parse(trialActivation.body.expiresAt) - Date.parse(trialActivation.body.activatedAt) - 86_400_000) < 1000)
  const firstMap = await call('/v1/maps/reserve', trialMachine, 'POST', { requested: 100 }, firstDevice)
  check('trial reserves 100 Maps lead slots', firstMap.status === 200 && firstMap.body.allowed === 100 && firstMap.body.remaining === 200)
  check('active Maps reservation can be renewed', (await call('/v1/maps/heartbeat', trialMachine, 'POST', { reservationId: firstMap.body.reservationId }, firstDevice)).status === 200)
  const firstMapDone = await call('/v1/maps/settle', trialMachine, 'POST', { reservationId: firstMap.body.reservationId, captured: 100 }, firstDevice)
  check('100 captured leads leave 200 trial leads', firstMapDone.status === 200 && firstMapDone.body.used === 100 && firstMapDone.body.remaining === 200)
  check('a repeated settlement does not double count', (await call('/v1/maps/settle', trialMachine, 'POST', { reservationId: firstMap.body.reservationId, captured: 100 }, firstDevice)).body.used === 100)
  const emptyMap = await call('/v1/maps/reserve', trialMachine, 'POST', { requested: 50 }, firstDevice)
  const emptyMapDone = await call('/v1/maps/settle', trialMachine, 'POST', { reservationId: emptyMap.body.reservationId, captured: 0 }, firstDevice)
  check('a search with no captured leads returns its unused allowance', emptyMapDone.body.used === 100 && emptyMapDone.body.remaining === 200)
  const secondMap = await call('/v1/maps/reserve', trialMachine, 'POST', { requested: 100 }, firstDevice)
  const secondMapDone = await call('/v1/maps/settle', trialMachine, 'POST', { reservationId: secondMap.body.reservationId, captured: 100 }, firstDevice)
  check('another keyword uses the same 300-lead allowance', secondMapDone.body.used === 200 && secondMapDone.body.remaining === 100)
  const parallelMaps = await Promise.all([
    call('/v1/maps/reserve', trialMachine, 'POST', { requested: 300 }, firstDevice),
    call('/v1/maps/reserve', trialMachine, 'POST', { requested: 300 }, firstDevice),
  ])
  const lastMap = parallelMaps.find((result) => result.status === 200)
  check('concurrent searches cannot reserve more than the remaining 100 leads', lastMap?.body.allowed === 100 && parallelMaps.some((result) => result.status === 429))
  await call('/v1/maps/settle', trialMachine, 'POST', { reservationId: lastMap.body.reservationId, captured: 100 }, firstDevice)
  check('the trial stops at 300 Maps leads', (await call('/v1/maps/reserve', trialMachine, 'POST', { requested: 1 }, firstDevice)).status === 429)
  const anotherTrialMachine = (await call('/v1/installations', null, 'POST')).body.token
  check('trial key cannot be activated on another machine', (await call('/v1/activate', anotherTrialMachine, 'POST', { licenseKey: trialKey }, otherDevice)).status === 409)
  check('same email cannot claim a new trial through another browser', (await call('/v1/trial', anotherTrialMachine, 'POST', { email: 'trial@example.test' }, otherDevice)).status === 409)
  service.db.prepare("update trial_licenses set expires_at = '2000-01-01T00:00:00.000Z'").run()
  check('expired trial disables all features on the server', !(await call('/v1/status', trialMachine, 'GET', undefined, firstDevice)).body.license.active)
  check('expired trial key cannot be reactivated', (await call('/v1/activate', trialMachine, 'POST', { licenseKey: trialKey }, firstDevice)).status === 403)
  check('expired trial key cannot download the installer', (await call('/v1/download-by-license', null, 'POST', { licenseKey: trialKey })).status === 403)
  const checkout = await call('/v1/checkout', token, 'POST', { product: 'lifetime', email: 'buyer@example.test' })
  check('Lifetime Deal creates a hosted Stripe Checkout', checkout.status === 200 && checkout.body.url.startsWith('https://checkout.stripe.com/'))
  check('Stripe Checkout uses a Customer with the entered email', customers.get(sessions.get('cs_test_lifetime').customer) === 'buyer@example.test')
  const resumed = await call('/v1/checkout', token, 'POST', { product: 'lifetime', email: 'buyer@example.test' })
  check('an open Checkout session is reused instead of duplicated', resumed.status === 200 && resumed.body.url === checkout.body.url)
  Object.assign(sessions.get('cs_test_lifetime'), { status: 'complete', payment_status: 'paid' })
  const paid = await fetch(base + '/return?session_id=cs_test_lifetime')
  check('completed Checkout is reconciled to this installation', paid.status === 200 && (await call('/v1/status', token)).body.lifetime.active)
  const duplicateLifetime = await call('/v1/checkout', token, 'POST', { product: 'lifetime', email: 'buyer@example.test' })
  check('a paid Lifetime Deal cannot start another checkout', duplicateLifetime.status === 409)
  const issued = await call('/v1/license', token, 'POST')
  check('a paid Lifetime Deal issues a license key without storing it in plaintext', issued.status === 200 && /^NF(?:-[A-Z0-9]{4}){10}$/.test(issued.body.licenseKey) && issued.body.email === 'buyer@example.test' && !readFileSync(database).includes(Buffer.from(issued.body.licenseKey)))
  const lifetimeEmail = emails.findLast((message) => message.kind === 'lifetime')
  check('lifetime email uses the same layout with its recipient and paid key', lifetimeEmail?.html.includes('Hey Buyer,') && lifetimeEmail.html.includes(issued.body.licenseKey) && lifetimeEmail.html.includes('Unlimited Google Maps leads') && lifetimeEmail.html.includes('Rs 10,000 PKR') && lifetimeEmail.attachments[0]?.content_id === 'mamalead-logo')
  const reissued = await call('/v1/license', token, 'POST')
  check('reopening a paid return does not issue a second license', reissued.status === 200 && reissued.body.licenseKey === null && reissued.body.last4 === issued.body.licenseKey.slice(-4) && service.db.prepare('select count(*) as count from licenses').get().count === 1)
  const repeatBuyer = (await call('/v1/installations', null, 'POST')).body.token
  const repeatedEmail = await call('/v1/checkout', repeatBuyer, 'POST', { product: 'lifetime', email: 'BUYER@example.test' })
  check('another installation cannot pay again or get another lifetime key for the same email', repeatedEmail.status === 409 && /This email is already used/i.test(repeatedEmail.body.error) && service.db.prepare('select count(*) as count from licenses').get().count === 1)
  const trialUpgradeBuyer = (await call('/v1/installations', null, 'POST')).body.token
  const upgradeCheckout = await call('/v1/checkout', trialUpgradeBuyer, 'POST', { product: 'lifetime', email: 'trial@example.test' })
  check('a trial email can start one lifetime upgrade', upgradeCheckout.status === 200 && upgradeCheckout.body.url.startsWith('https://checkout.stripe.com/'))
  const duplicatePendingBuyer = (await call('/v1/installations', null, 'POST')).body.token
  const duplicatePending = await call('/v1/checkout', duplicatePendingBuyer, 'POST', { product: 'lifetime', email: 'trial@example.test' })
  check('a second installation cannot start a duplicate lifetime payment while the first is pending', duplicatePending.status === 409)
  const upgradeSessionId = upgradeCheckout.body.url.split('/').at(-1)
  sessions.get(upgradeSessionId).status = 'expired'
  const afterExpiredCheckout = await call('/v1/checkout', duplicatePendingBuyer, 'POST', { product: 'lifetime', email: 'trial@example.test' })
  check('an expired unpaid checkout releases the email for a new attempt', afterExpiredCheckout.status === 200)
  check('activation without a device identity is rejected', (await call('/v1/activate', token, 'POST', { licenseKey: issued.body.licenseKey })).status === 400)
  const activated = await call('/v1/activate', token, 'POST', { licenseKey: issued.body.licenseKey }, firstDevice)
  check('the purchased license activates the current installation', activated.status === 200 && activated.body.active)
  check('Lifetime blocks requesting or activating a trial without changing access', (await call('/v1/trial', token, 'POST', {email:'new-trial@example.com'}, firstDevice)).status === 409 && (await call('/v1/activate', token, 'POST', {licenseKey:trialKey}, firstDevice)).status === 409 && (await call('/v1/status', token, 'GET', undefined, firstDevice)).body.license.kind === 'lifetime')
  const unlimitedMaps = await call('/v1/maps/reserve', token, 'POST', { requested: 1600 }, firstDevice)
  check('lifetime Maps leads have no total quota', unlimitedMaps.status === 200 && unlimitedMaps.body.allowed === 1600 && unlimitedMaps.body.remaining === null && unlimitedMaps.body.reservationId === null)
  const secondToken = (await call('/v1/installations', null, 'POST')).body.token
  const secondActivation = await call('/v1/activate', secondToken, 'POST', { licenseKey: issued.body.licenseKey }, otherDevice)
  check('the same license activates a second installation', secondActivation.status === 200 && secondActivation.body.active)
  check('a second Lifetime device also cannot request or activate a trial', (await call('/v1/trial', secondToken, 'POST', {email:'second-trial@example.com'}, otherDevice)).status === 409 && (await call('/v1/activate', secondToken, 'POST', {licenseKey:trialKey}, otherDevice)).status === 409)
  check('the second installation inherits verified Stripe entitlement', (await call('/v1/status', secondToken, 'GET', undefined, otherDevice)).body.license.active)
  const includedStatus = await call('/v1/status', token, 'GET', undefined, firstDevice)
  check('lifetime activation includes 1,000 Decision Maker searches for 30 days', includedStatus.body.decisionMaker.active && includedStatus.body.decisionMaker.status === 'included' && includedStatus.body.decisionMaker.monthlyRemaining === 1000 && Date.parse(includedStatus.body.decisionMaker.renewsAt) > Date.now())
  const includedUse = await call('/v1/decision-maker/consume', token, 'POST', { leadId: '00000000-0000-4000-8000-000000000010' }, firstDevice)
  const includedOtherDevice = await call('/v1/decision-maker/consume', secondToken, 'POST', { leadId: '00000000-0000-4000-8000-000000000010' }, otherDevice)
  check('included allowance is shared across both licensed devices', includedUse.status === 200 && includedUse.body.remaining === 999 && includedOtherDevice.status === 200 && includedOtherDevice.body.remaining === 998)
  const includedOwner = service.db.prepare('select id from installations where token_hash = ?').get(createHash('sha256').update(token).digest('hex')).id
  const includedLicense = service.db.prepare('select id, activated_at from licenses where installation_id = ?').get(includedOwner)
  const includedKey = `included:${includedLicense.id}:${new Date(includedLicense.activated_at).toISOString()}`
  const fillIncluded = service.db.prepare('insert into decision_lead_uses (owner_id, period_key, subject_hash, slot, created_at) values (?, ?, ?, ?, ?)')
  service.db.exec('BEGIN')
  for (let slot = 3; slot <= 999; slot += 1) fillIncluded.run(includedOwner, includedKey, `included-${slot}`, slot, new Date().toISOString())
  service.db.exec('COMMIT')
  const lastIncluded = await call('/v1/decision-maker/consume', token, 'POST', { leadId: '00000000-0000-4000-8000-000000000012' }, firstDevice)
  const overIncluded = await call('/v1/decision-maker/consume', secondToken, 'POST', { leadId: '00000000-0000-4000-8000-000000000013' }, otherDevice)
  check('the included 1,000th search succeeds and the 1,001st is blocked', lastIncluded.status === 200 && lastIncluded.body.remaining === 0 && overIncluded.status === 429)
  const earlyPass = await call('/v1/checkout', token, 'POST', { product: 'decisionMaker' }, firstDevice)
  check('after included 1,000 are used, a new 30-day pass can be bought immediately', earlyPass.status === 200 && earlyPass.body.url.startsWith('https://checkout.stripe.com/'))
  check('an unpaid pass does not unlock Decision Makers', !(await call('/v1/status', token, 'GET', undefined, firstDevice)).body.decisionMaker.active)
  sessions.get(earlyPass.body.url.split('/').at(-1)).status = 'expired'
  service.db.prepare('update licenses set activated_at = ? where key_last4 = ?').run(new Date(Date.now() - 31 * 86_400_000).toISOString(), issued.body.licenseKey.slice(-4))
  check('Decision Makers included access ends after 30 days', !(await call('/v1/status', token, 'GET', undefined, firstDevice)).body.decisionMaker.active && (await call('/v1/decision-maker/consume', secondToken, 'POST', { leadId: '00000000-0000-4000-8000-000000000011' }, otherDevice)).status === 403)
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
  check('after the included month, restored lifetime access needs a new Decision Makers pass', !(await call('/v1/status', token, 'GET', undefined, firstDevice)).body.decisionMaker.active)
  const beforeDecision = await call('/v1/decision-maker/consume', token, 'POST', { leadId: '00000000-0000-4000-8000-000000000001' }, firstDevice)
  check('Decision Maker lookup without an active pass is denied by the server', beforeDecision.status === 403)
  const decisionCheckout = await call('/v1/checkout', token, 'POST', { product: 'decisionMaker' }, firstDevice)
  const decisionSessionId = decisionCheckout.body.url?.split('/').at(-1)
  check('Decision Makers opens a manual Rs 1,000 one-time Checkout', decisionCheckout.status === 200 && sessions.get(decisionSessionId)?.mode === 'payment' && sessions.get(decisionSessionId)?.manualPrice === '100000' && !sessions.get(decisionSessionId)?.subscription)
  const resumedDecision = await call('/v1/checkout', secondToken, 'POST', { product: 'decisionMaker' }, otherDevice)
  check('a second licensed device reuses the owner’s open pass checkout', resumedDecision.body.url === decisionCheckout.body.url)
  Object.assign(sessions.get(decisionSessionId), { status: 'complete', payment_status: 'paid' })
  const decisionReturn = await fetch(base + `/return?session_id=${decisionSessionId}`)
  const paidStatus = await call('/v1/status', secondToken, 'GET', undefined, otherDevice)
  check('verified one-time payment unlocks 1,000 searches for 30 days on both devices', decisionReturn.status === 200 && paidStatus.body.decisionMaker.active && paidStatus.body.decisionMaker.status === 'paid' && paidStatus.body.decisionMaker.monthlyRemaining === 1000 && paidStatus.body.decisionMaker.periodDays === 30)
  const decisionLead = '00000000-0000-4000-8000-000000000001'
  const firstUse = await call('/v1/decision-maker/consume', token, 'POST', { leadId: decisionLead }, firstDevice)
  const duplicateUse = await call('/v1/decision-maker/consume', token, 'POST', { leadId: decisionLead }, firstDevice)
  check('each device and lead pair is counted once', firstUse.status === 200 && firstUse.body.remaining === 999 && duplicateUse.body.remaining === 999)
  const periodKey = `pass:${decisionSessionId}`
  const ownerId = service.db.prepare('select id from installations where token_hash = ?').get(createHash('sha256').update(token).digest('hex')).id
  const insertUsage = service.db.prepare('insert into decision_lead_uses (owner_id, period_key, subject_hash, slot, created_at) values (?, ?, ?, ?, ?)')
  service.db.exec('BEGIN')
  for (let slot = 2; slot <= 999; slot += 1) insertUsage.run(ownerId, periodKey, `filler-${slot}`, slot, new Date().toISOString())
  service.db.exec('COMMIT')
  const lastUse = await call('/v1/decision-maker/consume', secondToken, 'POST', { leadId: decisionLead }, otherDevice)
  const overLimit = await call('/v1/decision-maker/consume', secondToken, 'POST', { leadId: '00000000-0000-4000-8000-000000000002' }, otherDevice)
  check('the 1,000th lead succeeds and the 1,001st is blocked across both devices', lastUse.status === 200 && lastUse.body.remaining === 0 && overLimit.status === 429)
  const nextPass = await call('/v1/checkout', secondToken, 'POST', { product: 'decisionMaker' }, otherDevice)
  const nextSessionId = nextPass.body.url?.split('/').at(-1)
  check('used paid quota permits another immediate manual payment', nextPass.status === 200 && nextSessionId !== decisionSessionId && sessions.get(nextSessionId)?.mode === 'payment')
  check('the unpaid next pass cannot reset the used quota', !(await call('/v1/status', token, 'GET', undefined, firstDevice)).body.decisionMaker.active)
  Object.assign(sessions.get(nextSessionId), { status: 'complete', payment_status: 'paid' })
  const nextReturn = await fetch(base + `/return?session_id=${nextSessionId}`)
  const nextStatus = await call('/v1/status', token, 'GET', undefined, firstDevice)
  check('second verified payment immediately starts a fresh 1,000-search period', nextReturn.status === 200 && nextStatus.body.decisionMaker.active && nextStatus.body.decisionMaker.monthlyRemaining === 1000 && service.db.prepare('select count(*) as n from decision_passes').get().n === 2)
  const paidOwner = service.db.prepare('select decision_pass_started_at, decision_pass_expires_at from installations where id = ?').get(ownerId)
  const shift = 31 * 86_400_000
  service.db.prepare('update installations set decision_pass_started_at = ?, decision_pass_expires_at = ? where id = ?').run(new Date(Date.parse(paidOwner.decision_pass_started_at) - shift).toISOString(), new Date(Date.parse(paidOwner.decision_pass_expires_at) - shift).toISOString(), ownerId)
  check('a paid pass expires after 30 days without automatic renewal', !(await call('/v1/status', token, 'GET', undefined, firstDevice)).body.decisionMaker.active && (await call('/v1/decision-maker/consume', token, 'POST', { leadId: decisionLead }, firstDevice)).status === 403)
  // Recover an existing, pre-handoff purchase without offering this legacy flow to new buyers.
  const legacyOwnerId = service.db.prepare('select id from installations where token_hash = ?').get(createHash('sha256').update(standaloneToken).digest('hex')).id
  sessions.set('cs_test_standalone', { id: 'cs_test_standalone', url: 'https://checkout.stripe.com/c/pay/cs_test_standalone', client_reference_id: legacyOwnerId, mode: 'payment', metadata: { product: 'decisionMaker', checkoutFlow: 'desktop-standalone' }, status: 'open', payment_status: 'unpaid', customer: null, customer_details: { email: null }, payment_intent: 'pi_mock', subscription: null, livemode: false, amount_total: 100000, currency: 'pkr' })
  service.db.prepare('update installations set pending_decision_session_id = ? where id = ?').run('cs_test_standalone', legacyOwnerId)
  const standaloneSession = sessions.get('cs_test_standalone')
  customers.set('cus_standalone', 'standalone@example.test')
  Object.assign(standaloneSession, { status: 'complete', payment_status: 'paid', customer: 'cus_standalone', customer_details: { email: 'standalone@example.test' } })
  const standaloneStatusBeforeKey = await call('/v1/status', standaloneToken)
  const standaloneKey = emails.find((message) => message.kind === 'decision')?.licenseKey
  check('standalone payment emails a separate Decision Makers key', standaloneStatusBeforeKey.status === 200 && standaloneStatusBeforeKey.body.decisionKeyEmail === 'standalone@example.test' && /^NF(?:-[A-Z0-9]{4}){10}$/.test(standaloneKey ?? '') && !JSON.stringify(standaloneStatusBeforeKey.body).includes(standaloneKey))
  const standaloneDevice = 'e'.repeat(64)
  const standaloneActivation = await call('/v1/activate', standaloneToken, 'POST', { licenseKey: standaloneKey }, standaloneDevice)
  const standaloneStatus = await call('/v1/status', standaloneToken, 'GET', undefined, standaloneDevice)
  check('the separate key activates 1,000 Decision Maker searches for 30 days', standaloneActivation.status === 200 && standaloneActivation.body.kind === 'decision' && standaloneStatus.body.license.kind === 'decision' && standaloneStatus.body.decisionMaker.active && standaloneStatus.body.decisionMaker.monthlyRemaining === 1000)
  check('Decision Makers-only key does not unlock Maps scraping', (await call('/v1/maps/reserve', standaloneToken, 'POST', { requested: 1 }, standaloneDevice)).status === 403)
  const standaloneUse = await call('/v1/decision-maker/consume', standaloneToken, 'POST', { leadId: '00000000-0000-4000-8000-000000000005' }, standaloneDevice)
  check('standalone Decision Makers usage is counted by the server', standaloneUse.status === 200 && standaloneUse.body.remaining === 999)
  const standaloneOwner = service.db.prepare('select installation_id from decision_licenses where email = ?').get('standalone@example.test').installation_id
  const standaloneInsert = service.db.prepare('insert into decision_lead_uses (owner_id, period_key, subject_hash, slot, created_at) values (?, ?, ?, ?, ?)')
  service.db.exec('begin')
  try {
    for (let slot = 2; slot <= 1000; slot += 1) standaloneInsert.run(standaloneOwner, 'pass:cs_test_standalone', `standalone-${slot}`, slot, new Date().toISOString())
    service.db.exec('commit')
  } catch (error) { service.db.exec('rollback'); throw error }
  const standaloneRenewal = await call('/v1/checkout', standaloneToken, 'POST', { product: 'decisionMaker' }, standaloneDevice)
  const standaloneRenewalSessionId = standaloneRenewal.body.url?.split('/').at(-1)
  check('Decision Makers-only buyer can manually buy another pass when 1,000 searches are used', standaloneRenewal.status === 200 && standaloneRenewalSessionId !== 'cs_test_standalone' && sessions.get(standaloneRenewalSessionId)?.mode === 'payment')
  Object.assign(sessions.get(standaloneRenewalSessionId), { status: 'complete', payment_status: 'paid' })
  const standaloneRenewalResult = await fetch(base + `/return?session_id=${standaloneRenewalSessionId}`)
  const renewedStandaloneStatus = await call('/v1/status', standaloneToken, 'GET', undefined, standaloneDevice)
  check('renewal resets standalone quota without emailing another key', standaloneRenewalResult.status === 200 && renewedStandaloneStatus.body.decisionMaker.monthlyRemaining === 1000 && emails.filter((message) => message.kind === 'decision').length === 1)
  const directDevice = 'f'.repeat(64)
  const directToken = (await call('/v1/installations', null, 'POST', undefined, directDevice)).body.token
  const directCheckout = await call('/v1/checkout', directToken, 'POST', { product: 'decisionMaker' }, directDevice)
  const directSessionId = directCheckout.body.url?.split('/').at(-1)
  check('desktop Decision Makers opens a device-bound one-time Checkout', directCheckout.status === 200 && sessions.get(directSessionId)?.metadata.checkoutFlow === 'desktop-direct' && sessions.get(directSessionId)?.mode === 'payment')
  Object.assign(sessions.get(directSessionId), { status: 'complete', payment_status: 'paid', customer: 'cus_direct', customer_details: { email: 'direct@example.test' } })
  const directReturn = await fetch(base + `/return?session_id=${directSessionId}`)
  const directStatus = await call('/v1/status', directToken, 'GET', undefined, directDevice)
  const directOwner = service.db.prepare('select id from installations where token_hash = ?').get(createHash('sha256').update(directToken).digest('hex')).id
  check('verified desktop payment unlocks 1,000 searches without an emailed key', directReturn.status === 200 && directStatus.body.decisionMaker.active && directStatus.body.decisionMaker.monthlyRemaining === 1000 && directStatus.body.license.kind === 'decision' && directStatus.body.license.active && !directStatus.body.decisionKeyEmail && service.db.prepare('select count(*) as n from decision_licenses where installation_id = ?').get(directOwner).n === 0 && emails.filter((message) => message.kind === 'decision').length === 1)
  const directUse = await call('/v1/decision-maker/consume', directToken, 'POST', { leadId: '00000000-0000-4000-8000-000000000006' }, directDevice)
  check('device-bound pass counts Decision Maker searches', directUse.status === 200 && directUse.body.remaining === 999)
  const directInsert = service.db.prepare('insert into decision_lead_uses (owner_id, period_key, subject_hash, slot, created_at) values (?, ?, ?, ?, ?)')
  // Batch fixture writes: 999 synchronous fsyncs can outlast the local HTTP keep-alive on Windows.
  service.db.exec('begin')
  try {
  for (let slot = 2; slot <= 1000; slot += 1) directInsert.run(directOwner, `pass:${directSessionId}`, `direct-lead-${slot}`, slot, new Date().toISOString())
    service.db.exec('commit')
  } catch(error) {service.db.exec('rollback');throw error}
  const directRenewal = await call('/v1/checkout', directToken, 'POST', { product: 'decisionMaker' }, directDevice)
  const directRenewalId = directRenewal.body.url?.split('/').at(-1)
  check('exhausted device-bound pass can be renewed manually with the same Stripe customer', directRenewal.status === 200 && directRenewalId !== directSessionId && sessions.get(directRenewalId)?.customer === 'cus_direct')
  Object.assign(sessions.get(directRenewalId), { status: 'complete', payment_status: 'paid' })
  await fetch(base + `/return?session_id=${directRenewalId}`)
  const directRenewed = await call('/v1/status', directToken, 'GET', undefined, directDevice)
  check('another verified payment resets device-bound quota without a key email', directRenewed.body.decisionMaker.monthlyRemaining === 1000 && emails.filter((message) => message.kind === 'decision').length === 1)
  service.db.prepare('update installations set decision_pass_started_at = ?, decision_pass_expires_at = ? where id = ?').run(new Date(Date.now() - 61 * 86_400_000).toISOString(), new Date(Date.now() - 31 * 86_400_000).toISOString(), directOwner)
  const directExpired = await call('/v1/status', directToken, 'GET', undefined, directDevice)
  check('device-bound pass ends after 30 days without an automatic charge', !directExpired.body.decisionMaker.active && (await call('/v1/decision-maker/consume', directToken, 'POST', { leadId: '00000000-0000-4000-8000-000000000007' }, directDevice)).status === 403)
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
    const websiteToken = (await call('/v1/installations', null, 'POST')).body.token
  const webCheckout = await call('/v1/checkout', websiteToken, 'POST', {product:'lifetime',channel:'website'})
  const webSession = sessions.get(webCheckout.body.url?.split('/').at(-1))
  check('website Lifetime checkout collects email on Stripe and returns to the website', webCheckout.status === 200 && !webSession.customer_details.email && webSession.metadata.checkoutFlow === 'website' && webSession.success_url.startsWith('https://mamalead.com/?checkout=success') && webSession.cancel_url === 'https://mamalead.com/?checkout=cancelled#pricing')
  check('direct website checkout reuses an open session', (await call('/v1/checkout',websiteToken,'POST',{product:'lifetime',channel:'website'})).body.url===webCheckout.body.url)
  check('website unpaid checkout cannot claim success', !(await call('/v1/status',websiteToken)).body.lifetime.active)
  Object.assign(webSession,{status:'complete',payment_status:'paid',customer:'cus_website',customer_details:{email:'website@example.test'}})
  const webPaid = await call('/v1/status',websiteToken)
  check('verified website payment emails a key before reporting delivery', webPaid.status === 200 && webPaid.body.lifetime.active && webPaid.body.purchaseEmail === 'website@example.test' && emails.at(-1).to === 'website@example.test')
  const webKey = emails.at(-1).licenseKey, emailCount = emails.length
  await call('/v1/status',websiteToken)
  check('repeat website status is idempotent', emails.length === emailCount)
  const repeatWebToken=(await call('/v1/installations',null,'POST')).body.token
  const repeatWebCheckout=await call('/v1/checkout',repeatWebToken,'POST',{product:'lifetime',channel:'website'})
  const repeatWebSession=sessions.get(repeatWebCheckout.body.url.split('/').at(-1))
  Object.assign(repeatWebSession,{status:'complete',payment_status:'paid',customer:'cus_repeat_website',customer_details:{email:' WEBSITE@EXAMPLE.TEST '}})
  const beforeRefunds=refunds.length,repeatWebStatus=await call('/v1/status',repeatWebToken)
  check('Stripe-entered duplicate email is refunded without issuing another Lifetime key',repeatWebStatus.status===200 && !repeatWebStatus.body.lifetime.active && /duplicate payment was refunded/.test(repeatWebStatus.body.purchaseError) && emails.length===emailCount && refunds.length===beforeRefunds+1)
  await call('/v1/status',repeatWebToken)
  check('duplicate website return is idempotent',refunds.length===beforeRefunds+1 && emails.length===emailCount)
  for (const device of ['c'.repeat(64),'d'.repeat(64)]) {
    const installation=(await call('/v1/installations',null,'POST')).body.token
    const result=await call('/v1/activate',installation,'POST',{licenseKey:webKey},device)
    check('website purchase leaves desktop activation slots available '+device[0],result.status===200 && result.body.active)
  }
  const webTrialToken=(await call('/v1/installations',null,'POST')).body.token
  await call('/v1/trial',webTrialToken,'POST',{email:'website-trial@example.test'})
  const webTrialKey=emails.at(-1).licenseKey
  check('browser trial status confirms actual email delivery', (await call('/v1/status',webTrialToken)).body.trialRequest.emailSent === true)
  const trialDesktop=(await call('/v1/installations',null,'POST')).body.token, webTrialDevice='e'.repeat(64)
  check('website trial key activates on the desktop', (await call('/v1/activate',trialDesktop,'POST',{licenseKey:webTrialKey},webTrialDevice)).status === 200)
  const nextBrowser=(await call('/v1/installations',null,'POST')).body.token
  await call('/v1/trial',nextBrowser,'POST',{email:'another-website-trial@example.test'})
  const nextKey=emails.at(-1).licenseKey, nextDesktop=(await call('/v1/installations',null,'POST')).body.token
  check('changing browser and email cannot restart a trial on the same device', (await call('/v1/activate',nextDesktop,'POST',{licenseKey:nextKey},webTrialDevice)).status === 409)
  const retryToken=(await call('/v1/installations',null,'POST')).body.token
  const retryCheckout=await call('/v1/checkout',retryToken,'POST',{product:'lifetime',channel:'website'})
  const retrySession=sessions.get(retryCheckout.body.url.split('/').at(-1))
  Object.assign(retrySession,{status:'complete',payment_status:'paid',customer:'cus_webretry',customer_details:{email:'website-retry@example.test'}})
  failNextLicenseEmail=true
  check('website return does not confirm an undelivered key', (await call('/v1/status',retryToken)).status === 503)
  const retryPaid=await call('/v1/status',retryToken)
  check('website return recovers pending delivery after reconciliation cleared the pending checkout', retryPaid.status===200 && retryPaid.body.purchaseEmail==='website-retry@example.test')
  const duplicateEmailToken=(await call('/v1/installations',null,'POST')).body.token
  const beforeDuplicateSessions=sessions.size, beforeDuplicateEmails=emails.length
  const duplicateLifetime=await call('/v1/checkout',duplicateEmailToken,'POST',{product:'lifetime',channel:'website',email:' WEBSITE@EXAMPLE.TEST '})
  check('already-used Lifetime email is rejected before Stripe checkout creation',duplicateLifetime.status===409 && /This email is already used/.test(duplicateLifetime.body.error) && sessions.size===beforeDuplicateSessions)
  check('original buyer sees the same duplicate-email notice', /This email is already used/.test((await call('/v1/checkout',websiteToken,'POST',{product:'lifetime',channel:'website',email:'website@example.test'})).body.error))
  const duplicateTrial=await call('/v1/trial',duplicateEmailToken,'POST',{email:' WEBSITE-TRIAL@EXAMPLE.TEST '})
  check('already-used trial email shows the explicit notice without another email',duplicateTrial.status===409 && /This email is already used/.test(duplicateTrial.body.error) && emails.length===beforeDuplicateEmails)
  const racingTokens=await Promise.all([0,1].map(async()=> (await call('/v1/installations',null,'POST')).body.token))
  const racingTrials=await Promise.all(racingTokens.map(t=>call('/v1/trial',t,'POST',{email:'concurrent-trial@example.test'})))
  check('concurrent trial requests cannot issue two keys for one email',racingTrials.filter(r=>r.status===200).length===1 && racingTrials.filter(r=>r.status===409).length===1)
  const racingCheckouts=await Promise.all(racingTokens.map(t=>call('/v1/checkout',t,'POST',{product:'lifetime',channel:'website',email:'concurrent-lifetime@example.test'})))
  check('concurrent Lifetime requests cannot open two checkouts for one email',racingCheckouts.filter(r=>r.status===200).length===1 && racingCheckouts.filter(r=>r.status===409).length===1)
  console.log('PASS website purchase/trial delivery, duplicate emails and desktop handoff')
} finally {
    await new Promise((resolve) => live.server.close(resolve))
    live.db.close()
  }
  const cloudRows = new Map()
  const cloudReservations = new Map()
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
      async reserveLifetimeEmail(email, installationId) { if (cloudReservations.has(email) && cloudReservations.get(email).installation_id !== installationId) return null; const previous = cloudReservations.get(email); const row = previous || { email, installation_id: installationId, created_at: new Date().toISOString() }; cloudReservations.set(email, row); return { ...row, newlyCreated: !previous } },
      async lifetimeCheckoutByEmail(email) { return cloudReservations.get(email) ?? null },
      async releaseLifetimeEmail(email, installationId) { if (cloudReservations.get(email)?.installation_id === installationId) cloudReservations.delete(email) },
      async saveLifetimeCheckout(email, installationId, sessionId, customerId) { Object.assign(cloudReservations.get(email), { session_id: sessionId, customer_id: customerId }); Object.assign(cloudRows.get(installationId), { pending_lifetime_session_id: sessionId, customer_id: customerId }) },
      async lifetimeCheckoutForInstallation(installationId) { return [...cloudReservations.values()].find((row) => row.installation_id === installationId) ?? null },
      async lifetimeLicenseByEmail() { return null },
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
  check('Vercel function reads Stripe status through persistent-store interface', cloudStatus.status === 200 && JSON.parse(cloudStatus.body).lifetime.amount === 1000000)
  const cloudCheckout = await cloudCall('checkout', 'POST', cloudToken, { product: 'lifetime', email: 'cloud@example.test' })
  check('Vercel function creates HTTPS Checkout return URLs', cloudCheckout.status === 200 && JSON.parse(cloudCheckout.body).url.startsWith('https://checkout.stripe.com/'))
  const cloudSessionId = JSON.parse(cloudCheckout.body).url.split('/').at(-1)
  Object.assign(sessions.get(cloudSessionId), { status: 'complete', payment_status: 'paid' })
  const recovered = await cloudCall('status', 'GET', cloudToken)
  check('status refresh recovers a paid Checkout without browser return', recovered.status === 200 && JSON.parse(recovered.body).lifetime.active)
  const cloudGrant = await cloudCall('downloadLink', 'POST', cloudToken)
  const grantValue = new URL(JSON.parse(cloudGrant.body).url).searchParams.get('grant')
  const cloudDownload = await cloudCall('download', 'GET', null, null, `&grant=${encodeURIComponent(grantValue)}`)
  check('Vercel serves installer bytes only through private Blob access', cloudDownload.status === 200 && cloudDownload.body === 'installer bytes' && blobAccess.pathname === 'installers/Nafran.exe' && blobAccess.options.access === 'private')
  const invalidDownload = await cloudCall('download', 'GET', null, null, '&grant=forged')
  check('forged download grants are rejected', invalidDownload.status === 401)
  const cloudReturn = await cloudCall('return', 'GET', null, null, `&session_id=${cloudSessionId}`)
  check('Vercel function reconciles a verified payment', cloudReturn.status === 200 && cloudRows.values().next().value.lifetime_session_id === cloudSessionId)
  const legacyPath = join(dir, 'legacy.db')
  const legacy = new DatabaseSync(legacyPath)
  legacy.exec('create table installations (id text primary key, token_hash text not null unique, customer_id text, lifetime_session_id text, decision_subscription_id text, created_at text not null)')
  legacy.exec('create table licenses (id text primary key, installation_id text not null, key_hash text not null unique, key_last4 text not null, email text not null, created_at text not null, sent_at text, revoked_at text, activated_at text)')
  legacy.prepare('insert into licenses (id, installation_id, key_hash, key_last4, email, created_at) values (?, ?, ?, ?, ?, ?)').run('legacy-1', 'buyer-1', 'hash-1', '1111', 'buyer@example.test', '2026-10-01')
  legacy.prepare('insert into licenses (id, installation_id, key_hash, key_last4, email, created_at) values (?, ?, ?, ?, ?, ?)').run('legacy-2', 'buyer-2', 'hash-2', '2222', 'BUYER@example.test', '2026-10-01')
  legacy.close()
  const migrated = createBillingServer({ env: { STRIPE_SECRET_KEY: 'sk_test_placeholder', STRIPE_PRICE_LIFETIME: 'price_lifetime', STRIPE_PRICE_DECISION_MAKER: 'price_decision', BILLING_DB_PATH: legacyPath, BILLING_PORT: '0', BILLING_PUBLIC_URL: 'http://127.0.0.1:38749' }, fetch: fakeStripe })
  check('an existing local billing database gains trial storage and pending Checkout columns', migrated.db.prepare('pragma table_info(installations)').all().filter((column) => column.name.startsWith('pending_')).length === 2 && Boolean(migrated.db.prepare("select name from sqlite_master where name='trial_licenses'").get()))
  check('historical duplicate emails do not prevent a billing database migration', migrated.db.prepare('select count(*) as n from licenses').get().n === 2 && !migrated.db.prepare("select name from sqlite_master where name='licenses_one_per_email'").get())
  migrated.db.close()
  console.log(`${passed}/${passed} billing server checks passed`)
} finally {
  await new Promise((resolve) => service.server.close(resolve))
  service.db.close()
  rmSync(dir, { recursive: true, force: true })
}
