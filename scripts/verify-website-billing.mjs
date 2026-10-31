import assert from 'node:assert/strict'
import {spawn} from 'node:child_process'
import {createServer} from 'node:net'
import {mkdirSync} from 'node:fs'
import {resolve} from 'node:path'
import {chromium} from 'playwright'

const probe=createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r))
const child=spawn(process.execPath,['website/server.mjs'],{env:{...process.env,LANDING_ROOT:resolve('website'),LANDING_PORT:String(port)},windowsHide:true,stdio:'ignore'})
let browser
try {
 const base='http://127.0.0.1:'+port
 for(let i=0;i<60;i++){try{if((await fetch(base)).ok)break}catch{}await new Promise(r=>setTimeout(r,100))}
 browser=await chromium.launch({headless:true})
 const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'})
 const errors=[];page.on('pageerror',e=>errors.push(e.message))
 let trialEmail='', trialCalls=0, registrations=0, paid=false, failDelivery=true, checkoutCalls=0
 await page.route('https://api.mamalead.com/**',async route=>{
  const req=route.request(), path=new URL(req.url()).pathname, body=req.postDataJSON()
  if(path==='/v1/installations'){registrations++;return route.fulfill({json:{token:'t'.repeat(43)}})}
  assert.equal(req.headers().authorization,'Bearer '+'t'.repeat(43))
  if(path==='/v1/status')return route.fulfill({json:{lifetime:{active:paid},purchaseEmail:paid?'paid@example.test':null,trialRequest:{requested:!!trialEmail,emailSent:!!trialEmail,email:trialEmail,canChangeEmail:true}}})
  if(path==='/v1/trial'){
   trialCalls++
   if(failDelivery)return route.fulfill({status:503,json:{error:'Email delivery is unavailable. Please retry.'}})
   if(trialEmail)assert.equal(body.replaceExisting,true)
   trialEmail=body.email;return route.fulfill({json:{emailSent:true}})
  }
  if(path==='/v1/checkout'){checkoutCalls++;assert.equal(body.product,'lifetime');assert.equal(body.channel,'website');if(body.email==='already@example.test')return route.fulfill({status:409,json:{error:'This email is already used for Lifetime access. Use the key already emailed to you.'}});assert.equal(body.email,'paid@example.test');return route.fulfill({json:{url:'https://checkout.stripe.com/c/pay/website_fixture'}})}
  throw new Error('Unexpected request '+path)
 })
 await page.goto(base,{waitUntil:'networkidle'})
 await page.locator('#top .hero-trial').click()
 const dialog=page.getByRole('dialog');await dialog.waitFor()
 await page.locator('#trial-email').fill('invalid')
 await dialog.getByRole('button',{name:'Send my trial key'}).click()
 assert.equal(trialCalls,0)
 await page.locator('#trial-email').fill('trial@example.test')
 await dialog.getByRole('button',{name:'Send my trial key'}).click()
 await dialog.getByRole('alert').filter({hasText:'Email delivery is unavailable'}).waitFor()
 assert.equal(await dialog.getByText('Your license key has been emailed to you',{exact:true}).count(),0)
 failDelivery=false
 await dialog.getByRole('button',{name:'Send my trial key'}).click()
 await dialog.getByText('Your license key has been emailed to you',{exact:true}).waitFor()
 assert.equal(trialCalls,2);assert.equal(registrations,1)
 assert.match(await dialog.getByRole('link',{name:'Download for Windows'}).getAttribute('href'),/v1\/download/)
 const out=resolve('screenshots/qa-1.4.22/website');mkdirSync(out,{recursive:true})
 await page.screenshot({path:out+'/trial-key-sent.png'})
 await dialog.getByRole('button',{name:'Use a different email'}).click()
 await page.locator('#trial-email').fill('trial@example.test')
 await dialog.getByRole('button',{name:'Send my trial key'}).click()
 await dialog.getByRole('alert').filter({hasText:'This email is already used'}).waitFor()
 assert.equal(trialCalls,2,'duplicate trial email is not issued again')
 await page.locator('#trial-email').fill('corrected@example.test')
 await dialog.getByRole('button',{name:'Send my trial key'}).click()
 await dialog.getByText('Your license key has been emailed to you',{exact:true}).waitFor()
 assert.equal(trialCalls,3);assert.equal(trialEmail,'corrected@example.test')
 await page.reload({waitUntil:'networkidle'});await page.locator('#top .hero-trial').click()
 await dialog.getByText('Your license key has been emailed to you',{exact:true}).waitFor()
 assert.equal(trialCalls,3,'reload recovers delivery without sending another key')
 await page.keyboard.press('Escape');assert.equal(await dialog.count(),0)
 await page.locator('#download a').filter({hasText:'Download for Windows'}).first().click()
 await dialog.getByText('How do you want to start?',{exact:true}).waitFor()
 await page.keyboard.press('Escape')
 await page.goto(base+'/?checkout=success&session_id=forged',{waitUntil:'networkidle'})
 assert.equal(await page.getByText('Payment successful',{exact:true}).count(),0,'query string must not grant access')
 await page.getByRole('button',{name:'Dismiss checkout message'}).click()
 const navigation=page.waitForRequest('https://checkout.stripe.com/c/pay/website_fixture')
 await page.route('https://checkout.stripe.com/**',route=>route.fulfill({body:'Fixture secure checkout'}))
 await page.locator('.hero-buy').click()
 await dialog.getByText('Get Lifetime access',{exact:true}).waitFor()
 await page.locator('#trial-email').fill('already@example.test')
 await dialog.getByRole('button',{name:'Continue to secure payment'}).click()
 await dialog.getByRole('alert').filter({hasText:'This email is already used'}).waitFor()
 await page.screenshot({path:out+'/duplicate-lifetime-email.png'})
 await page.locator('#trial-email').fill('paid@example.test')
 await dialog.getByRole('button',{name:'Continue to secure payment'}).click();await navigation
 assert.equal(checkoutCalls,2)
 paid=true
 await page.goto(base+'/?checkout=success&session_id=verified',{waitUntil:'networkidle'})
 await page.getByText('Payment successful',{exact:true}).waitFor()
 assert.ok(await page.getByText('Your license key has been emailed to you. Download MamaLead and continue your work.',{exact:true}).isVisible())
 await page.waitForTimeout(1200)
 await page.screenshot({path:out+'/payment-confirmed.png'})
 await page.getByRole('button',{name:'Close',exact:true}).click()
 assert.equal(new URL(page.url()).search,'')
 assert.deepEqual(errors,[])
 console.log('PASS website trial validation, failed delivery, correction, refresh recovery, download choices, forged return rejection and verified Stripe handoff; no real payments or email')
}finally{await browser?.close();child.kill()}
