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

const here = dirname(fileURLToPath(import.meta.url))
const billingModule = resolve(process.env.BILLING_SERVER_MODULE ?? join(here, '../../billing-server/server.mjs'))
const { createBillingServer } = await import(pathToFileURL(billingModule).href)

const dir = mkdtempSync(join(tmpdir(), 'nafran-admin-'))
const database = join(dir, 'billing.db')
const sessions = new Map()
const chargeCreated = Math.floor(Date.now() / 1000)
let chargeRefunded = false
const charge = () => ({ id: 'ch_mock', customer: 'cus_mock', amount: 3000, amount_captured: 3000, amount_refunded: chargeRefunded ? 3000 : 0, refunded: chargeRefunded, currency: 'usd', created: chargeCreated, paid: true, status: 'succeeded', disputed: false, payment_intent: 'pi_mock', livemode: false, billing_details: { email: 'buyer@example.test' } })
const fakeStripe = async (raw, request = {}) => {
  const path = new URL(raw).pathname
  const body = request.body ? new URLSearchParams(request.body) : null
  let result
  if (path.endsWith('/prices/price_lifetime')) result = { active: true, currency: 'usd', unit_amount: 3000, recurring: null }
  else if (path.endsWith('/prices/price_decision')) result = { active: true, currency: 'usd', unit_amount: 300, recurring: { interval: 'month' } }
  else if (path.endsWith('/checkout/sessions') && request.method === 'POST') {
    const id = body.get('mode') === 'payment' ? 'cs_test_lifetime' : 'cs_test_decision'
    sessions.set(id, { id, url: `https://checkout.stripe.com/c/pay/${id}`, client_reference_id: body.get('client_reference_id'), mode: body.get('mode'), metadata: { product: body.get('metadata[product]') }, status: 'open', payment_status: 'unpaid', customer: 'cus_mock', customer_details: { email: 'buyer@example.test' }, payment_intent: id === 'cs_test_lifetime' ? 'pi_mock' : null, subscription: id === 'cs_test_decision' ? 'sub_mock' : null, livemode: false, amount_total: id === 'cs_test_lifetime' ? 3000 : 300, currency: 'usd' })
    result = { id, url: sessions.get(id).url }
  } else if (/\/checkout\/sessions\/cs_test_\w+\/line_items$/.test(path)) result = { data: [{ price: { id: path.includes('decision') ? 'price_decision' : 'price_lifetime' } }] }
  else if (/\/checkout\/sessions\/cs_test_\w+$/.test(path)) result = sessions.get(path.split('/').at(-1))
  else if (path.endsWith('/payment_intents/pi_mock')) result = { status: 'succeeded', latest_charge: 'ch_mock' }
  else if (path.endsWith('/charges/ch_mock')) result = charge()
  else if (path === '/v1/charges') result = { data: new URL(raw).searchParams.get('customer') === 'cus_mock' ? [charge()] : [], has_more: false }
  else if (path.endsWith('/subscriptions/sub_mock')) result = { status: 'active', livemode: false, items: { data: [{ quantity: 1, price: { currency: 'usd', unit_amount: 300, recurring: { interval: 'month' } } }] } }
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
  const { licenseKey } = (await bill('/v1/license', buyer, 'POST')).body
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
  const sessionSecret = randomBytes(32).toString('base64url')
  const adminEnv = { ...billingEnv, ADMIN_TOKEN_SHA256: createHash('sha256').update(ownerToken).digest('hex'), ADMIN_SESSION_SECRET: sessionSecret }
  store = await createSqliteAdminStore(database)
  const admin = createAdminHandler({ env: adminEnv, store, fetch: fakeStripe })
  const call = async (url, o = {}) => {
    const r = await admin.handle({ method: o.method ?? 'GET', url, authorization: o.auth, cookie: o.cookie, csrf: o.csrf, ip: o.ip ?? '127.0.0.1', readBody: async () => (o.body ? JSON.stringify(o.body) : '') })
    bodies.push(r.body)
    return { status: r.status, body: JSON.parse(r.body), headers: r.headers }
  }

  check('every admin endpoint requires sign-in', (await Promise.all(['summary', 'users', 'revenue', 'purchases', 'licenses', 'activations', 'health'].map((p) => call(`/admin/api/${p}`)))).every((r) => r.status === 401))
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
  check('revenue: $30.00 net from the Stripe test charge', revenue.body.available && revenue.body.net === 3000 && revenue.body.gross === 3000 && revenue.body.refunded === 0 && revenue.body.lifetimeSales === 1)
  check('revenue: monthly series has the sale in the right month', revenue.body.months.length === 12 && revenue.body.months.find((m) => m.key === month)?.net === 3000)
  check('revenue: payment row is masked', revenue.body.payments[0].id === '…h_mock' && revenue.body.payments[0].email === 'b••••@example.test' && revenue.body.payments[0].status === 'paid')
  chargeRefunded = true
  const refundedRevenue = await call('/admin/api/revenue?refresh=1', { cookie })
  check('revenue: a refund brings net revenue to $0', refundedRevenue.body.net === 0 && refundedRevenue.body.refunded === 3000 && refundedRevenue.body.payments[0].status === 'refunded')
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
  check('verify reads the payment from Stripe (test)', verified.status === 200 && verified.body.paid && !verified.body.refunded && verified.body.amount === 3000 && !verified.body.livemode)

  const trialInstall = (await bill('/v1/installations', null, 'POST')).body.token
  check('billing flow: a 1-day trial key is sent', (await bill('/v1/trial', trialInstall, 'POST', { email: 'trial@example.test' })).status === 200 && sentMessages.at(-1)?.kind === 'trial')
  const trialKey = sentMessages.at(-1).licenseKey
  check('billing flow: the trial activates on its first machine', (await bill('/v1/activate', trialInstall, 'POST', { licenseKey: trialKey }, 'd'.repeat(64))).status === 200)
  const trialSummary = await call('/admin/api/summary', { cookie })
  const trialUsers = await call('/admin/api/users?filter=licensed', { cookie })
  check('admin shows trial use without counting it as a paid license', trialSummary.body.counts.trials === 1 && trialSummary.body.counts.licenses === 1 && trialSummary.body.usage.licensed === 3 && trialUsers.body.rows.some((r) => r.licenseType === 'trial' && r.licensed))

  const all = bodies.join('\n')
  const db = new DatabaseSync(database, { readOnly: true })
  const hashes = [...db.prepare('select token_hash as h from installations').all(), ...db.prepare('select key_hash as h from licenses').all()].map((r) => r.h)
  check('no license key, tokens, hashes, Stripe ids or secrets appear in any admin response', ![licenseKey, trialKey, trialInstall, buyer, desktopA, desktopB, desktopC, ownerToken, sessionSecret, grant, ...Object.values(secrets), ...hashes, 'token_hash', 'key_hash', 'buyer@example.test', 'trial@example.test', 'cus_mock', 'ch_mock', 'pi_mock', 'cs_test_lifetime'].some((value) => all.includes(value)))
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
