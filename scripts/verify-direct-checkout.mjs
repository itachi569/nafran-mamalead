import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createBillingServer } from '../billing-server/server.mjs'

const directory = mkdtempSync(join(tmpdir(), 'nafran-direct-checkout-'))
const sessions = new Map()
const legacySessions = new Set()
const refunds = []
const emails = []
let lifetimePrice = { currency: 'pkr', unit_amount: 1000000 }
const stripeFetch = async (raw, request) => {
  const path = new URL(raw).pathname
  const fields = request.body ? new URLSearchParams(request.body) : null
  let result
  if (path.endsWith('/prices/price_lifetime')) result = { active: true, ...lifetimePrice, recurring: null }
  else if (path.endsWith('/checkout/sessions') && request.method === 'POST') {
    const number = sessions.size + 1
    const id = `cs_test_direct${number}`
    result = {
      id, url: `https://checkout.stripe.com/c/pay/${id}`,
      client_reference_id: fields.get('client_reference_id'),
      metadata: { product: fields.get('metadata[product]'), checkoutFlow: fields.get('metadata[checkoutFlow]') },
      mode: fields.get('mode'), status: 'open', payment_status: 'unpaid', livemode: false,
      customer: null, customer_details: { email: null }, payment_intent: `pi_direct${number}`,
    }
    assert.equal(fields.get('customer'), null)
    assert.equal(fields.get('customer_email'), null)
    assert.equal(fields.get('customer_creation'), 'always')
    assert.equal(fields.get('payment_method_types[0]'), 'card')
    sessions.set(id, result)
  } else if (/\/checkout\/sessions\/cs_test_direct\d+\/line_items$/.test(path)) result = { data: [{ price: { id: legacySessions.has(path.split('/').at(-2)) ? 'price_legacyusd' : 'price_lifetime' } }] }
  else if (/\/checkout\/sessions\/cs_test_direct\d+\/expire$/.test(path) && request.method === 'POST') {
    const session = sessions.get(path.split('/').at(-2))
    session.status = 'expired'
    result = session
  }
  else if (/\/checkout\/sessions\/cs_test_direct\d+$/.test(path)) result = sessions.get(path.split('/').at(-1))
  else if (/\/payment_intents\/pi_direct\d+$/.test(path)) result = { status: 'succeeded', latest_charge: `ch_direct${path.at(-1)}` }
  else if (/\/charges\/ch_direct\d+$/.test(path)) result = { paid: true, refunded: refunds.some((id) => id.endsWith(path.at(-1))), amount_refunded: refunds.some((id) => id.endsWith(path.at(-1))) ? 1000000 : 0, disputed: false }
  else if (path.endsWith('/refunds') && request.method === 'POST') {
    assert.equal(fields.get('reason'), 'duplicate')
    assert.ok(request.headers['idempotency-key'].startsWith('duplicate-lifetime-cs_test_direct'))
    refunds.push(fields.get('payment_intent'))
    result = { id: `re_direct${refunds.length}`, status: 'succeeded' }
  } else throw new Error(`Unexpected Stripe request: ${path}`)
  return { ok: true, json: async () => result }
}
const service = createBillingServer({
  env: {
    STRIPE_SECRET_KEY: 'sk_test_directcheckout', STRIPE_PRICE_LIFETIME: 'price_lifetime',
    BILLING_DB_PATH: join(directory, 'billing.db'), BILLING_PORT: '0',
    BILLING_PUBLIC_URL: 'http://127.0.0.1:38747',
    DOWNLOAD_SIGNING_KEY: 'direct-checkout-test-signing-secret-123456',
  },
  fetch: stripeFetch,
  sendEmail: async (message) => { emails.push(message); return true },
})

try {
  await new Promise((resolve, reject) => service.server.once('error', reject).listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${service.server.address().port}`
  const call = async (path, token, method = 'GET', body) => {
    const response = await fetch(base + path, { method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined })
    return { status: response.status, body: await response.json() }
  }
  const first = (await call('/v1/installations', null, 'POST')).body.token
  const checkout = await call('/v1/checkout', first, 'POST', { product: 'lifetime' })
  assert.equal(checkout.status, 200)
  assert.equal(checkout.body.url, sessions.get('cs_test_direct1').url)
  assert.equal((await call('/v1/checkout', first, 'POST', { product: 'lifetime' })).body.url, checkout.body.url)
  assert.equal(sessions.size, 1)
  Object.assign(sessions.get('cs_test_direct1'), { status: 'complete', payment_status: 'paid', customer: 'cus_direct1', customer_details: { email: 'buyer@example.test' } })
  const paid = await call('/v1/status', first)
  assert.equal(paid.status, 200)
  assert.equal(paid.body.lifetime.active, true)
  assert.equal(paid.body.purchaseEmail, 'buyer@example.test')
  assert.equal(emails.length, 1)
  assert.equal(emails[0].to, 'buyer@example.test')
  assert.equal((await call('/v1/status', first)).body.purchaseEmail, 'buyer@example.test')
  assert.equal(emails.length, 1)
  console.log('PASS  Stripe collects email and card; verified payment emails one key and unlocks Account handoff')

  const second = (await call('/v1/installations', null, 'POST')).body.token
  assert.equal((await call('/v1/checkout', second, 'POST', { product: 'lifetime' })).status, 200)
  Object.assign(sessions.get('cs_test_direct2'), { status: 'complete', payment_status: 'paid', customer: 'cus_direct2', customer_details: { email: 'BUYER@example.test' } })
  const duplicate = await call('/v1/status', second)
  assert.equal(duplicate.status, 200)
  assert.equal(duplicate.body.lifetime.active, false)
  assert.match(duplicate.body.purchaseError, /refunded/)
  assert.deepEqual(refunds, ['pi_direct2'])
  assert.equal(emails.length, 1)
  assert.equal((await call('/v1/status', second)).body.purchaseError, duplicate.body.purchaseError)
  assert.equal(refunds.length, 1)
  console.log('PASS  a duplicate email is refunded once, gets no second key, and shows a clear status')

  const third = (await call('/v1/installations', null, 'POST')).body.token
  lifetimePrice = { currency: 'usd', unit_amount: 3000 }
  assert.equal((await call('/v1/checkout', third, 'POST', { product: 'lifetime' })).status, 502)
  assert.equal(sessions.size, 2)
  lifetimePrice = { currency: 'pkr', unit_amount: 830000 }
  assert.equal((await call('/v1/checkout', third, 'POST', { product: 'lifetime' })).status, 502)
  assert.equal(sessions.size, 2)
  console.log('PASS  USD and wrong-PKR Stripe prices cannot open Checkout')

  lifetimePrice = { currency: 'pkr', unit_amount: 1000000 }
  const oldCheckout = await call('/v1/checkout', third, 'POST', { product: 'lifetime' })
  assert.equal(oldCheckout.status, 200)
  legacySessions.add('cs_test_direct3')
  const replacement = await call('/v1/checkout', third, 'POST', { product: 'lifetime' })
  assert.equal(replacement.status, 200)
  assert.equal(sessions.get('cs_test_direct3').status, 'expired')
  assert.equal(replacement.body.url, sessions.get('cs_test_direct4').url)
  console.log('PASS  an old USD Checkout is expired before a PKR Checkout opens')
} finally {
  service.close()
  rmSync(directory, { recursive: true, force: true })
}
