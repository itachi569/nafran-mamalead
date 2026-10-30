import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createBillingServer } from '../billing-server/server.mjs'

const directory = mkdtempSync(join(tmpdir(), 'mamalead-owner-keys-'))
const database = join(directory, 'billing.db')
let mailCount = 0, unexpectedStripeCalls = 0
const service = createBillingServer({
  env: { STRIPE_SECRET_KEY: 'sk_live_testfixture', STRIPE_PRICE_LIFETIME: 'price_ownerfixture', BILLING_DB_PATH: database, BILLING_PORT: '0', BILLING_PUBLIC_URL: 'http://127.0.0.1:38747' },
  fetch: async url => {
    if (!String(url).endsWith('/prices/price_ownerfixture')) { unexpectedStripeCalls++; throw Error('Owner grant must not fabricate a Stripe purchase') }
    return { ok: true, json: async () => ({ active: true, currency: 'pkr', unit_amount: 1000000, recurring: null }) }
  },
  sendEmail: async () => { mailCount++; return true },
})
await new Promise(resolve => service.server.listen(0, '127.0.0.1', resolve))
const base = `http://127.0.0.1:${service.server.address().port}`
const call = async (path, token, data, device = 'a'.repeat(64)) => {
  const r = await fetch(base + path, { method: data === undefined ? 'GET' : 'POST', headers: { 'content-type': 'application/json', 'x-nafran-device-id': device, ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: data === undefined ? undefined : JSON.stringify(data) })
  return { status: r.status, body: await r.json() }
}
const issue = (kind, ...extra) => JSON.parse(execFileSync(process.execPath, [resolve('scripts/issue-owner-license.mjs'), '--db', database, '--kind', kind, '--reason', 'Automated isolated verification', ...extra], { encoding: 'utf8', stdio: ['pipe','pipe','pipe'] }))
let checks = 0
const check = (label, value) => { assert.ok(value, label); checks++; console.log('PASS ' + label) }
try {
  const first = (await call('/v1/installations', null, {})).body.token
  const second = (await call('/v1/installations', null, {}, 'b'.repeat(64))).body.token
  const lifetime = issue('lifetime')
  check('operator can issue Lifetime without email; key is not stored in cleartext', lifetime.ok && lifetime.email === null && !JSON.stringify(service.db.prepare('select * from owner_licenses').all()).includes(lifetime.licenseKey))
  check('unactivated customer remains locked in live mode', !(await call('/v1/status', first)).body.coreLicenseActive)
  check('public customer API cannot issue owner keys', (await call('/v1/owner-licenses', first, {kind:'lifetime'})).status === 404)
  check('ordinary trial still requires an email', (await call('/v1/trial', first, {})).status >= 400)
  check('unrecognised key remains rejected', (await call('/v1/activate', first, {licenseKey:'NF-' + Array(10).fill('0000').join('-')})).status === 401)
  check('private Lifetime activates via the existing app flow', (await call('/v1/activate', first, {licenseKey:lifetime.licenseKey})).body.active)
  const active = (await call('/v1/status', first)).body
  check('Lifetime grants unlimited Maps without a payment record', active.mode === 'live' && active.coreLicenseActive && active.license.kind === 'lifetime' && active.lifetime.active && active.mapsLeads.limit === null && !active.hasCustomer)
  check('retired Decision Makers is not granted', !active.decisionMaker.active)
  check('owner key cannot be used on a second installation', (await call('/v1/activate', second, {licenseKey:lifetime.licenseKey},'b'.repeat(64))).status === 409)
  execFileSync(process.execPath, [resolve('scripts/issue-owner-license.mjs'), '--db', database, '--revoke', lifetime.id, '--reason', 'Revocation verification'], { stdio: 'pipe' })
  check('revocation immediately removes Lifetime access', !(await call('/v1/status', first)).body.coreLicenseActive)
  check('revoked owner key cannot reactivate', (await call('/v1/activate', first, {licenseKey:lifetime.licenseKey})).status === 401)
  const trial = issue('trial', '--email', 'owner@example.com')
  const activated = (await call('/v1/activate', first, {licenseKey:trial.licenseKey})).body
  check('trial begins a 24-hour clock on first activation', activated.active && Date.parse(activated.expiresAt)-Date.parse(activated.activatedAt) === 86400000)
  const again = (await call('/v1/activate', first, {licenseKey:trial.licenseKey})).body
  check('reactivating trial does not reset its expiry', again.expiresAt === activated.expiresAt)
  const reservation = await call('/v1/maps/reserve', first, {requested:500})
  check('owner trial keeps the customer 300-lead cap', reservation.status === 200 && reservation.body.allowed === 300)
  check('concurrent reservation cannot exceed trial allowance', (await call('/v1/maps/reserve',first,{requested:1})).status === 429)
  service.db.prepare('update owner_licenses set expires_at = ? where id = ?').run('2020-01-01T00:00:00.000Z',trial.id)
  check('expired trial is inactive and cannot reserve leads', !(await call('/v1/status',first)).body.coreLicenseActive && (await call('/v1/maps/reserve',first,{requested:1})).status === 403)
  check('expired trial cannot renew itself by reactivation', (await call('/v1/activate', first, {licenseKey:trial.licenseKey})).status === 409)
  check('regular paid and email-trial records stay untouched', service.db.prepare('select count(*) n from licenses').get().n === 0 && service.db.prepare('select count(*) n from trial_licenses').get().n === 0)
  check('issue/revoke actions are audited and no emails or purchases occur', service.db.prepare('select count(*) n from admin_license_actions').get().n === 3 && mailCount === 0 && unexpectedStripeCalls === 0)
  console.log(`PASS ${checks} owner-licence checks`)
} finally { service.close() }
