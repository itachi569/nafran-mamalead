import assert from 'node:assert/strict'
import { paymentDetails } from '../billing-server/payment-details.mjs'

const method = { type: 'card', customer: 'cus_fixture', card: { brand: 'visa', last4: '4242', exp_month: 8, exp_year: 2029, fingerprint: 'private-fingerprint' }, billing_details: { name: 'Review User', address: { line1: 'Private address' } } }
const expected = { card: { brand: 'visa', last4: '4242', expiryMonth: 8, expiryYear: 2029, holder: 'Review User' } }
const owner = { customer_id: 'cus_fixture', lifetime_session_id: 'cs_fixture' }
let requests = []
const stripe = result => async path => { requests.push(path); return result }
assert.deepEqual(await paymentDetails(() => { throw Error('No request expected') }, null), { card: null })
assert.deepEqual(await paymentDetails(stripe({ customer: 'cus_fixture', payment_status: 'paid', payment_intent: { payment_method: method, client_secret: 'private-secret' } }), owner), expected)
assert.ok(requests[0].includes('expand[]=payment_intent.payment_method'))
assert.deepEqual(await paymentDetails(stripe({ customer: 'cus_fixture', payment_status: 'unpaid', payment_intent: { payment_method: method } }), owner), { card: null })
assert.deepEqual(await paymentDetails(stripe({ customer: { id: 'cus_fixture', invoice_settings: { default_payment_method: method } }, payment_status: 'paid', payment_intent: { payment_method: { ...method, card: { ...method.card, last4: '1111' } } } }), owner), expected)
assert.deepEqual(await paymentDetails(stripe({ id: 'cus_fixture', invoice_settings: { default_payment_method: method } }), { customer_id: 'cus_fixture' }), expected)
assert.deepEqual(await paymentDetails(stripe({ id: 'cus_fixture', invoice_settings: { default_payment_method: { type: 'bank_account' } } }), { customer_id: 'cus_fixture' }), { card: null })
await assert.rejects(paymentDetails(stripe({ customer: 'cus_other', payment_status: 'paid', payment_intent: { payment_method: method } }), owner), /customer did not match/)
await assert.rejects(paymentDetails(stripe({ customer: 'cus_fixture', payment_status: 'paid', payment_intent: { payment_method: { ...method, customer: 'cus_other' } } }), owner), /method did not match/)
await assert.rejects(paymentDetails(stripe({ id: 'cus_other' }), { customer_id: 'cus_fixture' }), /customer did not match/)
assert.deepEqual(await paymentDetails(stripe({ customer: 'cus_fixture', payment_status: 'paid', payment_intent: { payment_method: { ...method, card: { ...method.card, last4: '4242424242424242' } } } }), owner), { card: null })
console.log('PASS card display metadata only; paid checkout fallback; current default card precedence; non-card and unlinked states; customer isolation; no full card data')
