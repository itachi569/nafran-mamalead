import assert from 'node:assert/strict'
import { billingPage } from '../billing-server/payment-page.mjs'
const success=billingPage('Purchase confirmed','Verified',{product:'lifetime',verified:true,keyDelivered:true})
assert.match(success.body,/Lifetime access/)
assert.match(success.body,/10,000/)
assert.match(success.body,/Your license key has been emailed/)
assert.match(success.body,/class="watermark"/)
assert.match(success.body,/data:image\/png;base64,/)
assert.match(success.body,/href="mamalead:\/\/billing"/)
assert.match(success.headers['content-security-policy'],/img-src data:/)
const pending=billingPage('Purchase confirmed','Verified',{product:'lifetime',verified:true})
assert.doesNotMatch(pending.body,/Your license key has been emailed/)
for(const title of ['Checkout cancelled','Duplicate payment refunded','MamaLead billing']){
 const neutral=billingPage(title,'<unsafe & text>')
 assert.doesNotMatch(neutral.body,/aria-label="Verified purchase summary"/)
 assert.doesNotMatch(neutral.body,/Payment received/)
 assert.match(neutral.body,/&lt;unsafe &amp; text&gt;/)
}
assert.doesNotMatch(billingPage('Unverified','',{product:'lifetime'}).body,/aria-label="Verified purchase summary"/)
const decision=billingPage('Decision Makers ready','Verified',{product:'decisionMaker',verified:true})
assert.match(decision.body,/30-day pass/)
assert.doesNotMatch(decision.body,/10,000|Lifetime access/)
console.log('PASS verified Lifetime/Decision receipts, neutral cancellation/refund, email-delivery states, escaping, embedded logo and app-return link')
