import assert from 'node:assert/strict'
import {createBillingHandler} from '../billing-server/core.mjs'

// Exercise cache expiry and provider failures without making payments or waiting a minute.
const realNow=Date.now
let now=realNow(), requests=0, fail=false, active=true, release
const row={id:'fixture'}, sessionRequests=[]
Date.now=()=>now
let gate=new Promise(resolve=>{release=resolve})
const {handle}=createBillingHandler({
  env:{STRIPE_SECRET_KEY:'sk_test_fixture',STRIPE_PRICE_LIFETIME:'price_fixture'},
  store:{byTokenHash:async()=>row,byId:async()=>row},
  fetch:async url=>{
    if(url.includes('/checkout/sessions/')) {
      sessionRequests.push(url)
      assert.equal(url,'https://api.stripe.com/v1/checkout/sessions/cs_test_fixture?expand[]=line_items')
      return {ok:true,json:async()=>({id:'cs_test_fixture',status:'open',url:'https://checkout.stripe.com/c/pay/fixture',line_items:{data:[{price:{id:'price_fixture'},quantity:1}]}})}
    }
    assert.equal(url,'https://api.stripe.com/v1/prices/price_fixture')
    requests++
    if(gate)await gate
    return {ok:!fail,json:async()=>fail?{error:{message:'Provider unavailable'}}:{active,currency:'pkr',unit_amount:1000000}}
  }
})
const status=()=>handle({method:'GET',url:'/v1/status',authorization:'Bearer '+'a'.repeat(43)})
try {
  const simultaneous=[status(),status(),status()]
  await new Promise(resolve=>setImmediate(resolve))
  assert.equal(requests,1,'concurrent visitors share the in-flight price lookup')
  release();gate=null
  for(const result of await Promise.all(simultaneous))assert.equal(result.status,200)
  now+=59_999;assert.equal((await status()).status,200);assert.equal(requests,1)
  now+=2;fail=true;assert.equal((await status()).status,502);assert.equal(requests,2)
  fail=false;active=false;assert.equal((await status()).status,502);assert.equal(requests,3)
  active=true;assert.equal((await status()).status,200);assert.equal(requests,4)
  assert.equal((await status()).status,200);assert.equal(requests,4)
  row.pending_lifetime_session_id='cs_test_fixture'
  const reopened=await handle({method:'POST',url:'/v1/checkout',authorization:'Bearer '+'a'.repeat(43),readBody:async()=>JSON.stringify({product:'lifetime',channel:'website'})})
  assert.equal(reopened.status,200);assert.equal(JSON.parse(reopened.body).url,'https://checkout.stripe.com/c/pay/fixture')
  assert.equal(sessionRequests.length,1,'reopening retrieves the current session and line items together once')
  assert.equal(requests,4,'reopening does not repeat the price lookup')
  console.log('PASS concurrent price lookup, 60-second expiry, failed/inactive price rejection, recovery and one-request checkout reopening; no payment or licence status cached')
} finally {Date.now=realNow;release()}
