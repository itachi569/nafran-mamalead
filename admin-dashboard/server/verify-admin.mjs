// Local, offline test of the owner admin API against the real purchase → license → download → activation flow.
// Uses the billing server with a fake Stripe fetch: no network, no real payments, no email.
// Run from the repo root: node admin-dashboard/server/verify-admin.mjs
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { createHash, randomBytes } from 'node:crypto'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import { createAdminHandler } from './admin-core.mjs'
import { createSqliteAdminStore } from './stores.mjs'
import { hashOwnerPassword } from './owner-password.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const billingModule = resolve(process.env.BILLING_SERVER_MODULE ?? join(here, '../../billing-server/server.mjs'))
const { createBillingServer } = await import(pathToFileURL(billingModule).href)

const dir = mkdtempSync(join(tmpdir(), 'nafran-admin-'))
const database = join(dir, 'billing.db')
const sessions = new Map()
const chargeCreated = Math.floor(Date.now() / 1000)
let chargeRefunded = false
const charge = () => ({ id: 'ch_mock', customer: 'cus_mock', amount: 1000000, amount_captured: 1000000, amount_refunded: chargeRefunded ? 1000000 : 0, refunded: chargeRefunded, currency: 'pkr', created: chargeCreated, paid: true, status: 'succeeded', disputed: false, payment_intent: 'pi_mock', livemode: false, billing_details: { email: 'buyer@example.test' } })
const decisionCharge = () => ({ ...charge(), id: 'ch_decision', amount: 100000, amount_captured: 100000, amount_refunded: 0, refunded: false, payment_intent: 'pi_decision' })
const fakeStripe = async (raw, request = {}) => {
  const path = new URL(raw).pathname
  const body = request.body ? new URLSearchParams(request.body) : null
  let result
  if (path.endsWith('/prices/price_lifetime')) result = { active: true, currency: 'pkr', unit_amount: 1000000, recurring: null }
  else if (path.endsWith('/prices/price_decision')) result = { active: true, currency: 'pkr', unit_amount: 100000, recurring: { interval: 'month' } }
  else if (path.endsWith('/checkout/sessions') && request.method === 'POST') {
    const id = body.get('metadata[product]') === 'decisionMaker' ? 'cs_test_decision' : 'cs_test_lifetime'
    sessions.set(id, { id, url: `https://checkout.stripe.com/c/pay/${id}`, client_reference_id: body.get('client_reference_id'), mode: body.get('mode'), metadata: { product: body.get('metadata[product]'), checkoutFlow: body.get('metadata[checkoutFlow]') }, status: 'open', payment_status: 'unpaid', customer: 'cus_mock', customer_details: { email: 'buyer@example.test' }, payment_intent: id === 'cs_test_lifetime' ? 'pi_mock' : 'pi_decision', subscription: null, livemode: false, amount_total: id === 'cs_test_lifetime' ? 1000000 : 100000, currency: 'pkr' })
    result = { id, url: sessions.get(id).url }
  } else if (/\/checkout\/sessions\/cs_test_\w+\/line_items$/.test(path)) result = { data: [{ price: path.includes('decision') ? { currency: 'pkr', unit_amount: 100000, recurring: null } : { id: 'price_lifetime' }, quantity: 1 }] }
  else if (/\/checkout\/sessions\/cs_test_\w+$/.test(path)) result = sessions.get(path.split('/').at(-1))
  else if (path.endsWith('/payment_intents/pi_mock')) result = { status: 'succeeded', latest_charge: 'ch_mock' }
  else if (path.endsWith('/payment_intents/pi_decision')) result = { status: 'succeeded', latest_charge: 'ch_decision' }
  else if (path.endsWith('/charges/ch_mock')) result = charge()
  else if (path.endsWith('/charges/ch_decision')) result = decisionCharge()
  else if (path === '/v1/charges') result = { data: new URL(raw).searchParams.get('customer') === 'cus_mock' ? [...(sessions.get('cs_test_decision')?.status === 'complete' ? [decisionCharge()] : []), charge()] : [], has_more: false }
  else if (path.endsWith('/subscriptions/sub_mock')) result = { id: 'sub_mock', customer: 'cus_mock', status: 'active', livemode: false, latest_invoice: 'in_mock', items: { data: [{ current_period_start: chargeCreated - 3600, current_period_end: chargeCreated + 2592000, quantity: 1, price: { id: 'price_decision', currency: 'pkr', unit_amount: 100000, recurring: { interval: 'month' } } }] } }
  else if (path.endsWith('/invoices/in_mock')) result = { id: 'in_mock', status: 'paid', subscription: 'sub_mock' }
  else throw new Error(`Unexpected Stripe request: ${path}`)
  return { ok: true, json: async () => result }
}

const secrets = { STRIPE_SECRET_KEY: 'sk_test_placeholder', STRIPE_WEBHOOK_SECRET: 'whsec_test', DOWNLOAD_SIGNING_KEY: 'test-download-secret-with-32-characters' }
const billingEnv = { ...secrets, STRIPE_PRICE_LIFETIME: 'price_lifetime', STRIPE_PRICE_DECISION_MAKER: 'price_decision', BILLING_DB_PATH: database, BILLING_PORT: '0', BILLING_PUBLIC_URL: 'http://127.0.0.1:38747', DOWNLOAD_URL: 'https://downloads.example.test/Nafran.exe' }
const sentMessages = []
const billing = createBillingServer({ env: billingEnv, fetch: fakeStripe, sendEmail: async (message) => { sentMessages.push(message); return true } })
await new Promise((done) => billing.server.listen(0, '127.0.0.1', done))
const base = `http://127.0.0.1:${billing.server.address().port}`
const bill = async (path, token, method = 'GET', data, device) => {
  const response = await fetch(base + path, { method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(device ? { 'x-nafran-device-id': device, 'x-nafran-device-platform': 'Windows x64 10.0' } : {}), ...(data ? { 'content-type': 'application/json' } : {}) }, body: data ? JSON.stringify(data) : undefined })
  return { status: response.status, body: await response.json() }
}

let passed = 0
const check = (name, condition) => { assert.ok(condition, name); passed += 1; console.log(`PASS  ${name}`) }
const bodies = []
let store
try {
  // 1. Real purchase → license → download → activation flow through the billing server.
  const buyer = (await bill('/v1/installations', null, 'POST')).body.token
  await bill('/v1/checkout', buyer, 'POST', { product: 'lifetime' })
  Object.assign(sessions.get('cs_test_lifetime'), { status: 'complete', payment_status: 'paid' })
  await fetch(base + '/return?session_id=cs_test_lifetime')
  const licenseKey = sentMessages.find((message) => message.kind === 'lifetime')?.licenseKey
  check('billing flow: lifetime key is emailed after Checkout', /^NF-(?:[A-Z0-9]{4}-){9}[A-Z0-9]{4}$/.test(licenseKey ?? ''))
  const link = await bill('/v1/download-link', buyer, 'POST')
  const grant = new URL(link.body.url).searchParams.get('grant')
  check('billing flow: protected download still redirects for a paid buyer', (await fetch(`${base}/v1/download?grant=${encodeURIComponent(grant)}`, { redirect: 'manual' })).status === 302)
  const desktopA = (await bill('/v1/installations', null, 'POST')).body.token
  const desktopB = (await bill('/v1/installations', null, 'POST')).body.token
  const desktopC = (await bill('/v1/installations', null, 'POST')).body.token
  const devices = ['a'.repeat(64), 'b'.repeat(64), 'c'.repeat(64)]
  check('billing flow: two desktop activations succeed', (await bill('/v1/activate', desktopA, 'POST', { licenseKey }, devices[0])).status === 200 && (await bill('/v1/activate', desktopB, 'POST', { licenseKey }, devices[1])).status === 200)
  check('billing flow: third activation is still denied', (await bill('/v1/activate', desktopC, 'POST', { licenseKey }, devices[2])).status === 409)
  const statusA = await bill('/v1/status', desktopA, 'GET', undefined, devices[0])
  check('billing flow: /v1/status response is unchanged and licensed', statusA.status === 200 && statusA.body.license.active === true && statusA.body.lifetime.active === true && !('lastSeen' in statusA.body))
  const raw = new DatabaseSync(database, { readOnly: true })
  const seenOf = () => raw.prepare("select last_seen_at as s from installations where last_seen_at is not null").all().map((r) => r.s)
  const firstSeen = seenOf()
  await bill('/v1/status', desktopA, 'GET', undefined, devices[0])
  check('last-seen is recorded once and throttled to one write per 10 minutes', firstSeen.length === 1 && seenOf()[0] === firstSeen[0])
  raw.close()

  // 2. Admin API over the same database, read-only.
  const ownerToken = randomBytes(32).toString('base64url')
  const ownerEmail = 'owner@gmail.com'
  const ownerPassword = 'correct-horse-battery-staple'
  const ownerPasswordHash = await hashOwnerPassword(ownerPassword)
  const sessionSecret = randomBytes(32).toString('base64url')
  const adminEnv = { ...billingEnv, ADMIN_TOKEN_SHA256: createHash('sha256').update(ownerToken).digest('hex'), ADMIN_OWNER_EMAIL: ownerEmail, ADMIN_PASSWORD_HASH: ownerPasswordHash, ADMIN_SESSION_SECRET: sessionSecret }
  store = await createSqliteAdminStore(database)
  const admin = createAdminHandler({ env: adminEnv, store, fetch: fakeStripe })
  const call = async (url, o = {}) => {
    const r = await admin.handle({ method: o.method ?? 'GET', url, authorization: o.auth, cookie: o.cookie, csrf: o.csrf, ip: o.ip ?? '127.0.0.1', readBody: async () => (o.body ? JSON.stringify(o.body) : '') })
    bodies.push(r.body)
    return { status: r.status, body: JSON.parse(r.body), headers: r.headers }
  }

  check('every admin endpoint requires sign-in', (await Promise.all(['summary', 'users', 'revenue', 'purchases', 'licenses', 'activations', 'health'].map((p) => call(`/admin/api/${p}`)))).every((r) => r.status === 401))
  const authConfig = await call('/admin/api/auth-config')
  check('public sign-in configuration reveals no credentials', authConfig.status === 200 && authConfig.body.emailLoginEnabled === true && authConfig.body.tokenLoginEnabled === true && !authConfig.body.email && !authConfig.body.passwordHash)
  check('wrong email or password is rejected', (await call('/admin/api/session', { method: 'POST', body: { email: 'other@gmail.com', password: ownerPassword }, ip: '10.0.0.8' })).status === 401 && (await call('/admin/api/session', { method: 'POST', body: { email: ownerEmail, password: 'wrong-password' }, ip: '10.0.0.8' })).status === 401)
  const emailLogin = await call('/admin/api/session', { method: 'POST', body: { email: '  OWNER@GMAIL.COM ', password: ownerPassword }, ip: '10.0.0.8' })
  const emailCookie = emailLogin.headers['set-cookie']?.split(';')[0]
  check('Gmail and password sign-in opens an HttpOnly owner session', emailLogin.status === 200 && /HttpOnly/.test(emailLogin.headers['set-cookie']) && (await call('/admin/api/session', { cookie: emailCookie })).status === 200)
  const passwordOnly = createAdminHandler({ env: { ...adminEnv, ADMIN_ALLOW_TOKEN_LOGIN: '0' }, store, fetch: fakeStripe })
  const passwordOnlyCall = async (payload, cookieHeader) => passwordOnly.handle({ method: 'POST', url: '/admin/api/session', cookie: cookieHeader, ip: '10.0.0.11', readBody: async () => JSON.stringify(payload) })
  check('email-only mode disables the old owner token without locking out Gmail sign-in', (await passwordOnlyCall({ token: ownerToken })).status === 401 && (await passwordOnlyCall({ email: ownerEmail, password: ownerPassword })).status === 200)
  check('changing sign-in method invalidates previously issued sessions', (await passwordOnly.handle({ method: 'GET', url: '/admin/api/session', cookie: emailCookie, ip: '10.0.0.12' })).status === 401)
  check('a wrong bearer token is rejected', (await call('/admin/api/summary', { auth: 'Bearer wrong-token-wrong-token-wrong', ip: '10.0.0.9' })).status === 401)
  for (let i = 0; i < 5; i += 1) await call('/admin/api/session', { method: 'POST', body: { token: `bad-${i}-xxxxxxxxxxxxxxxxxxxxxxxx` }, ip: '10.0.0.7' })
  check('repeated bad sign-ins are throttled', (await call('/admin/api/session', { method: 'POST', body: { token: ownerToken }, ip: '10.0.0.7' })).status === 429)
  const login = await call('/admin/api/session', { method: 'POST', body: { token: ownerToken } })
  const cookie = login.headers['set-cookie']?.split(';')[0]
  check('owner sign-in sets an HttpOnly SameSite=Strict session cookie', login.status === 200 && /HttpOnly/.test(login.headers['set-cookie']) && /SameSite=Strict/.test(login.headers['set-cookie']))
  check('a tampered session cookie is rejected', (await call('/admin/api/summary', { cookie: cookie.replace(/.$/, (c) => (c === 'A' ? 'B' : 'A')) })).status === 401)

  const summary = await call('/admin/api/summary', { cookie })
  const c = summary.body.counts
  const u = summary.body.usage
  check('summary counts the test purchase, customer, license and slots', summary.status === 200 && c.purchases === 1 && c.customers === 1 && c.licenses === 1 && c.slotsUsed === 2 && c.slotsTotal === 2 && summary.body.mode === 'test')
  check('usage: 4 registered, 2 desktop, 1 checkout identity, 1 not yet seen', u.tracking === true && u.registered === 4 && u.desktop === 2 && u.checkout === 1 && u.unseen === 1 && u.licensed === 2)
  check('usage: one desktop active in the last 24 hours', u.active24h === 1 && u.active7d === 1 && u.active30d === 1)
  check('downloads: one protected download recorded', summary.body.downloads.tracking === true && summary.body.downloads.total === 1 && summary.body.downloads.buyers === 1)
  check('summary reports an emailed key while email configuration is hidden from the admin fixture', summary.body.email.provider === 'none' && c.emailed === 1)

  const users = await call('/admin/api/users?filter=active7', { cookie })
  check('users endpoint filters active installs and masks email', users.body.rows.length === 1 && users.body.rows[0].licensed && users.body.rows[0].email === 'b••••@example.test')
  check('users unknown filter is rejected', (await call('/admin/api/users?filter=x', { cookie })).status === 400)

  const revenue = await call('/admin/api/revenue', { cookie })
  const month = new Date(chargeCreated * 1000).toISOString().slice(0, 7)
  check('revenue: Rs 10,000 PKR net from the Stripe test charge', revenue.body.available && revenue.body.currency === 'pkr' && revenue.body.net === 1000000 && revenue.body.gross === 1000000 && revenue.body.refunded === 0 && revenue.body.lifetimeSales === 1)
  check('revenue: monthly series has the sale in the right month', revenue.body.months.length === 12 && revenue.body.months.find((m) => m.key === month)?.net === 1000000)
  check('revenue: payment row is masked', revenue.body.payments[0].id === '…h_mock' && revenue.body.payments[0].email === 'b••••@example.test' && revenue.body.payments[0].status === 'paid')
  chargeRefunded = true
  const refundedRevenue = await call('/admin/api/revenue?refresh=1', { cookie })
  check('revenue: a refund brings net revenue to Rs 0', refundedRevenue.body.net === 0 && refundedRevenue.body.refunded === 1000000 && refundedRevenue.body.payments[0].status === 'refunded')
  chargeRefunded = false
  const liveAdmin = createAdminHandler({ env: { ...adminEnv, STRIPE_SECRET_KEY: 'sk_live_placeholder' }, store, fetch: async () => { throw new Error('must not call Stripe') } })
  const liveRevenue = JSON.parse((await liveAdmin.handle({ method: 'GET', url: '/admin/api/revenue', authorization: `Bearer ${ownerToken}`, ip: '127.0.0.2' })).body)
  check('revenue: a live key is not read unless ADMIN_ALLOW_LIVE_READS=1', liveRevenue.available === false)

  const purchases = await call('/admin/api/purchases', { cookie })
  const row = purchases.body.rows[0]
  check('purchases list shows masked Stripe ids and masked email', purchases.body.rows.length === 1 && row.status === 'paid' && row.session === '…fetime' && row.email === 'b••••@example.test' && row.license.last4 === licenseKey.slice(-4))
  check('purchase filters and search work', (await call('/admin/api/purchases?filter=unlicensed', { cookie })).body.rows.length === 0 && (await call('/admin/api/purchases?q=nomatch', { cookie })).body.rows.length === 0 && (await call('/admin/api/purchases?q=example.test', { cookie })).body.rows.length === 1)
  check('unknown filters are rejected', (await call('/admin/api/licenses?filter=drop', { cookie })).status === 400)
  check('license filter "full" finds the license at its activation limit', (await call('/admin/api/licenses?filter=full', { cookie })).body.rows.length === 1)
  const activations = await call('/admin/api/activations', { cookie })
  check('activation slots show both machines', activations.body.rows[0].slots.filter((s) => s.installation).length === 2)
  check('activation slots include short device IDs and platform', activations.body.rows[0].slots.some((s) => s.device === devices[0].slice(0, 8) && s.platform === 'Windows x64 10.0'))
  const publicInstaller = await fetch(`${base}/v1/download`, { redirect: 'manual' })
  const publicSummary = await call('/admin/api/summary', { cookie })
  check('anonymous public download is counted without a license', publicInstaller.status === 302 && publicSummary.body.downloads.public === 1 && publicSummary.body.downloads.total === 2)
  const health = await call('/admin/api/health?probe=1', { cookie })
  const state = Object.fromEntries(health.body.checks.map((x) => [x.id, x.state]))
  check('health reports configuration without values', state.stripe_key === 'ok' && state.email === 'missing' && state.installer === 'warn' && state.database === 'ok' && state.stripe_api === 'ok' && state.usage_tracking === 'ok' && state.webhooks === 'warn')

  check('verify requires the admin request header', (await call('/admin/api/purchases/verify', { method: 'POST', cookie, body: { id: row.id } })).status === 403)
  const verified = await call('/admin/api/purchases/verify', { method: 'POST', cookie, csrf: '1', body: { id: row.id } })
  check('verify reads the payment from Stripe (test)', verified.status === 200 && verified.body.paid && !verified.body.refunded && verified.body.amount === 1000000 && verified.body.currency === 'pkr' && !verified.body.livemode)

  const trialInstall = (await bill('/v1/installations', null, 'POST')).body.token
  check('billing flow: a 1-day trial key is sent', (await bill('/v1/trial', trialInstall, 'POST', { email: 'trial@example.test' })).status === 200 && sentMessages.at(-1)?.kind === 'trial')
  const trialKey = sentMessages.at(-1).licenseKey
  check('billing flow: the trial activates on its first machine', (await bill('/v1/activate', trialInstall, 'POST', { licenseKey: trialKey }, 'd'.repeat(64))).status === 200)
  const trialSummary = await call('/admin/api/summary', { cookie })
  const trialUsers = await call('/admin/api/users?filter=licensed', { cookie })
  check('admin shows sent, activated and active trials without counting them as paid licenses', trialSummary.body.counts.trials === 1 && trialSummary.body.counts.trialActivated === 1 && trialSummary.body.counts.trialActive === 1 && trialSummary.body.counts.licenses === 1 && trialSummary.body.usage.licensed === 3 && trialUsers.body.rows.some((r) => r.licenseType === 'trial' && r.licensed))

  const secondTrialInstall = (await bill('/v1/installations', null, 'POST')).body.token
  check('a second person can receive a trial key without activating it', (await bill('/v1/trial', secondTrialInstall, 'POST', { email: 'second-trial@example.test' })).status === 200)
  const secondTrialKey = sentMessages.at(-1).licenseKey
  const twoTrials = await call('/admin/api/summary', { cookie })
  check('dashboard separates trial keys sent from trial activations', twoTrials.body.counts.trials === 2 && twoTrials.body.counts.trialActivated === 1 && twoTrials.body.counts.trialActive === 1)

  check('the buyer has an included Decision Makers month before buying a pass', (await bill('/v1/status', desktopA, 'GET', undefined, devices[0])).body.decisionMaker.status === 'included')
  billing.db.prepare('update licenses set activated_at = ?').run(new Date(Date.now() - 31 * 86_400_000).toISOString())
  check('Decision Makers manual pass Checkout starts for the lifetime owner', (await bill('/v1/checkout', desktopA, 'POST', { product: 'decisionMaker' }, devices[0])).status === 200)
  Object.assign(sessions.get('cs_test_decision'), { status: 'complete', payment_status: 'paid' })
  await fetch(base + '/return?session_id=cs_test_decision')
  const addonSummary = await call('/admin/api/summary', { cookie })
  check('retired pass counters are absent while Lifetime and trial totals remain', !('addons' in addonSummary.body.counts) && addonSummary.body.counts.purchases === 1 && addonSummary.body.counts.trials === 2)
  const addonRevenue = await call('/admin/api/revenue?refresh=1', { cookie })
  check('historical payments remain recorded without a retired plan system', !('activeSubs' in addonRevenue.body) && !('mrr' in addonRevenue.body) && addonRevenue.body.otherNet === 100000 && addonRevenue.body.net === 1100000 && addonRevenue.body.payments.some((payment) => payment.amount === 100000))

  // Private keys use single-machine binding and must not inflate paid purchases.
  const privateKeys = [
    { id: 'owner-live', kind: 'lifetime', last4: 'P001', active: true },
    { id: 'owner-trial', kind: 'trial', last4: 'P002', active: true },
    { id: 'owner-expired', kind: 'trial', last4: 'P003', expired: true },
    { id: 'owner-revoked', kind: 'lifetime', last4: 'P004', revoked: true },
    { id: 'owner-wrong-binding', kind: 'lifetime', last4: 'P005', wrongBinding: true },
    { id: 'owner-unused', kind: 'lifetime', last4: 'P006', unactivated: true },
  ]
  for (const entry of privateKeys) {
    const token = (await bill('/v1/installations', null, 'POST')).body.token
    const installation = billing.db.prepare('select id from installations where token_hash = ?').get(createHash('sha256').update(token).digest('hex')).id
    const at = new Date().toISOString()
    billing.db.prepare(`insert into owner_licenses (id,kind,key_hash,key_last4,email,label,created_by,reason,created_at,activated_at,expires_at,revoked_at,bound_installation_id)
      values (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(entry.id, entry.kind, createHash('sha256').update(entry.id).digest('hex'), entry.last4,
      'private@example.test', 'Private QA grant', 'operator', 'Test only', at, entry.unactivated ? null : at,
      entry.kind === 'trial' ? new Date(Date.now() + (entry.expired ? -1 : 1) * 86400000).toISOString() : null,
      entry.revoked ? at : null, entry.wrongBinding ? 'different-installation' : installation)
    billing.db.prepare('update installations set license_id = ?, license_slot = 1 where id = ?').run(entry.id, installation)
  }
  const privateSummary = (await call('/admin/api/summary', { cookie })).body
  const privateUsers = (await call('/admin/api/users', { cookie })).body.rows.filter((r) => r.ownerIssued)
  check('owner-issued Lifetime and unexpired trials are counted as active access', privateSummary.counts.ownerKeys === 6 && privateSummary.counts.ownerActive === 2 && privateSummary.usage.licensed === 5)
  check('private keys do not inflate purchased licenses, revenue or emailed trials', privateSummary.counts.licenses === 1 && privateSummary.counts.purchases === 1 && privateSummary.counts.customers === 1 && privateSummary.counts.trials === 2)
  check('revoked, expired, unused and incorrectly bound private keys cannot count as licensed', privateUsers.length === 6 && privateUsers.filter((r) => r.licensed).map((r) => r.license).sort().join(',') === 'P001,P002')
  check('private key holders retain masked email and the correct grant type', privateUsers.every((r) => r.email === 'p••••••@example.test') && privateUsers.find((r) => r.license === 'P002').licenseType === 'trial')

  const futureCutoff = new Date(Date.now() + 3600000).toISOString()
  const freshAdmin = createAdminHandler({ env: { ...adminEnv, ADMIN_REPORTING_SINCE: futureCutoff, ADMIN_SHOW_EMAILS: '1' }, store, fetch: fakeStripe })
  const freshCall = async (url, auth = `Bearer ${ownerToken}`) => freshAdmin.handle({ method: 'GET', url, authorization: auth, ip: '127.0.0.3' })
  const fresh = JSON.parse((await freshCall('/admin/api/summary')).body)
  check('fresh activity reporting starts at zero without resetting customers or licences', fresh.activity.since === futureCutoff && fresh.activity.usage.registered === 0 && fresh.activity.usage.active7d === 0 && fresh.activity.downloads.total === 0 && fresh.activity.trials === 0 && fresh.counts.purchases === 1 && fresh.counts.ownerKeys === 6 && fresh.usage.licensed === 5)
  check('previous activity remains available in the same authenticated summary', fresh.downloads.total === 2 && fresh.counts.trials === 2 && fresh.usage.registered > 0)
  billing.db.prepare('update billing_public_downloads set created_at = ?').run(futureCutoff)
  const period = JSON.parse((await freshCall('/admin/api/summary')).body)
  check('a download on the new reporting boundary is counted exactly once', period.activity.downloads.total === 1 && period.activity.downloads.public === 1 && period.downloads.total === 2)
  const fullUsers = JSON.parse((await freshCall('/admin/api/users')).body).rows
  check('owner can see full customer and private-grant emails after sign-in', fullUsers.some((r) => r.email === 'buyer@example.test') && fullUsers.some((r) => r.email === 'private@example.test'))
  check('a requested trial email is visible before activation, without granting access', fullUsers.some((r) => r.email === 'second-trial@example.test' && r.licenseType === 'trial' && !r.licensed))
  check('complete emails and activity history remain unavailable without owner authentication', (await freshCall('/admin/api/users', '')).status === 401 && (await freshCall('/admin/api/summary', '')).status === 401)

  const all = bodies.join('\n')
  const db = new DatabaseSync(database, { readOnly: true })
  const hashes = [...db.prepare('select token_hash as h from installations').all(), ...db.prepare('select key_hash as h from licenses').all(), ...db.prepare('select key_hash as h from owner_licenses').all()].map((r) => r.h)
  check('no license key, tokens, hashes, Stripe ids or secrets appear in any admin response', ![licenseKey, trialKey, secondTrialKey, trialInstall, secondTrialInstall, buyer, desktopA, desktopB, desktopC, ownerToken, ownerEmail, ownerPassword, ownerPasswordHash, sessionSecret, grant, ...Object.values(secrets), ...hashes, 'token_hash', 'key_hash', 'buyer@example.test', 'trial@example.test', 'second-trial@example.test', 'cus_mock', 'ch_mock', 'pi_mock', 'cs_test_lifetime'].some((value) => all.includes(value)))
  check('the admin store cannot write to the billing database', (() => { try { db.exec("update licenses set revoked_at = 'x'"); return false } catch { return true } })())
  db.close()
  check('license enforcement is unchanged after admin use', (await bill('/v1/status', desktopA, 'GET', undefined, devices[0])).body.license.active === true && (await bill('/v1/activate', desktopC, 'POST', { licenseKey }, devices[2])).status === 409)
  console.log(`${passed}/${passed} admin checks passed`)
} finally {
  store?.close()
  await new Promise((done) => billing.server.close(done))
  billing.db.close()
  rmSync(dir, { recursive: true, force: true })
}
