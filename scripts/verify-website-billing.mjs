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
 let trialEmail='', trialCalls=0, registrations=0, paid=false, failDelivery=true, checkoutCalls=0, failCheckout=false, purchaseError=null, checkoutGate=null, statusCalls=0, purchaseEmail='paid@example.test', failStatus=false
 await page.route('https://api.mamalead.com/**',async route=>{
  const req=route.request(), path=new URL(req.url()).pathname, body=req.postDataJSON()
  if(path==='/v1/download')return route.fulfill({headers:{'content-type':'application/octet-stream','content-disposition':'attachment; filename="MamaLead Setup QA.exe"'},body:'QA download fixture — not an executable'})
  if(path==='/v1/installations'){registrations++;return route.fulfill({json:{token:'t'.repeat(43)}})}
  assert.equal(req.headers().authorization,'Bearer '+'t'.repeat(43))
  if(path==='/v1/status'){statusCalls++;if(failStatus)return route.fulfill({status:503,json:{error:'Payment verification temporarily unavailable.'}});return route.fulfill({json:{lifetime:{active:paid},purchaseEmail:paid?purchaseEmail:null,purchaseError,trialRequest:{requested:!!trialEmail,emailSent:!!trialEmail,email:trialEmail,canChangeEmail:true}}})}
  if(path==='/v1/trial'){
   trialCalls++
   if(failDelivery)return route.fulfill({status:503,json:{error:'Email delivery is unavailable. Please retry.'}})
   if(trialEmail)assert.equal(body.replaceExisting,true)
   trialEmail=body.email;return route.fulfill({json:{emailSent:true}})
  }
  if(path==='/v1/checkout'){checkoutCalls++;assert.deepEqual(body,{product:'lifetime',channel:'website'});assert.equal(await page.locator('#trial-email').count(),0,'Lifetime must not open a website email form');if(checkoutGate)await checkoutGate;if(failCheckout)return route.fulfill({status:503,json:{error:'Secure checkout is temporarily unavailable. Please retry.'}});return route.fulfill({json:{url:'https://checkout.stripe.com/c/pay/website_fixture'}})}
  throw new Error('Unexpected request '+path)
 })
 await page.goto(base,{waitUntil:'networkidle'})
 assert.equal(await page.locator('[data-public-download="windows"]').count()>0,true,'Windows download remains available')
 assert.equal(await page.locator('a[href*="platform=mac"], [data-public-download^="mac-"]').count(),0,'Retired Mac downloads stay off the public site')
 for(const width of [390,768,1440]){
  await page.setViewportSize({width,height:1000})
  await page.evaluate(()=>window.scrollTo({top:document.documentElement.scrollHeight,behavior:'instant'}))
  const topLink=page.getByRole('link',{name:'Back to top',exact:true})
  const topBox=await topLink.boundingBox(),helpBox=await page.locator('.help-launcher').boundingBox()
  assert.ok(topBox.width>=44&&topBox.height>=44&&topBox.y+topBox.height<helpBox.y,'Top control sits above help at '+width)
  assert.ok(topBox.x>=0&&topBox.x+topBox.width<=width,'Top control fits at '+width)
  await topLink.click()
  assert.equal(await page.evaluate(()=>window.scrollY),0,'Reduced-motion return to top at '+width)
  await page.evaluate(()=>window.scrollTo({top:document.documentElement.scrollHeight,behavior:'instant'}))
  await topLink.focus();await page.keyboard.press('Shift+Tab');await page.keyboard.press('Tab')
  assert.equal(await topLink.evaluate(el=>el===document.activeElement&&getComputedStyle(el).outlineStyle==='solid'),true)
  await page.keyboard.press('Enter')
  assert.equal(await page.evaluate(()=>window.scrollY),0,'Keyboard return to top at '+width)
 }
 await page.emulateMedia({reducedMotion:'no-preference'})
 await page.evaluate(()=>window.scrollTo({top:document.documentElement.scrollHeight,behavior:'instant'}))
 const scrollStart=await page.evaluate(()=>window.scrollY)
 await page.getByRole('link',{name:'Back to top',exact:true}).click()
 await page.waitForFunction(start=>window.scrollY>0&&window.scrollY<start,scrollStart,{timeout:3000})
 await page.waitForFunction(()=>window.scrollY===0,null,{timeout:5000})
 await page.emulateMedia({reducedMotion:'reduce'})
 await page.locator('#top .hero-trial').click()
 const dialog=page.getByRole('dialog');await dialog.waitFor()
 assert.equal(await dialog.getByRole('link',{name:'Already have a key? Download the app'}).count(),0)
 assert.equal(await dialog.locator('a[href*="/v1/download"]').count(),0,'No download bypass before email delivery')
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
 const downloadEvent=page.waitForEvent('download')
 await dialog.getByRole('link',{name:'Download for Windows'}).click()
 const download=await downloadEvent
 assert.equal(download.suggestedFilename(),'MamaLead Setup QA.exe')
 assert.equal(await download.failure(),null)
 assert.ok(await dialog.getByText('Your license key has been emailed to you',{exact:true}).isVisible(),'download preserves the activation instructions')
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
 await dialog.getByText('Your license key has been emailed to you',{exact:true}).waitFor()
 await page.keyboard.press('Escape')
 await page.goto(base+'/?checkout=success&session_id=forged',{waitUntil:'networkidle'})
 assert.equal(await page.getByText('Payment successful',{exact:true}).count(),0,'query string must not grant access')
 await page.getByRole('button',{name:'Dismiss checkout message'}).click()
 await page.goto(base,{waitUntil:'networkidle'})
 await page.route('https://checkout.stripe.com/**',route=>route.fulfill({body:'Fixture secure checkout'}))
 failCheckout=true
 await page.locator('.hero-buy').click()
 await page.getByText('Secure checkout is temporarily unavailable. Please retry.',{exact:true}).waitFor()
 assert.equal(await dialog.count(),0)
 failCheckout=false
 const navigation=page.waitForRequest('https://checkout.stripe.com/c/pay/website_fixture')
 await page.getByRole('button',{name:'Try again',exact:true}).click();await navigation
 assert.equal(checkoutCalls,2)
 for(const selector of ['.hero-buy','.desktop-pricing','.pricing-lifetime .pricing-action','#top a:has-text("Buy now")']){
  await page.goto(base,{waitUntil:'networkidle'})
  let cta
  cta=page.locator(selector)
  const before=checkoutCalls,next=page.waitForRequest('https://checkout.stripe.com/c/pay/website_fixture')
  await cta.evaluate(el=>{el.click();el.click()});await next
  assert.equal(checkoutCalls,before+1,'double click creates one checkout request: '+selector)
 }
 const statusBeforeAction=statusCalls, appCheckout=page.waitForRequest('https://checkout.stripe.com/c/pay/website_fixture')
 await page.goto(base+'/?action=lifetime#pricing');await appCheckout
 assert.equal(statusCalls,statusBeforeAction,'app checkout skips redundant status request')
 await page.goto(base,{waitUntil:'networkidle'});await page.evaluate(()=>localStorage.clear());trialEmail=''
 await page.reload({waitUntil:'networkidle'})
 await page.locator('#download a').filter({hasText:'Download for Windows'}).first().click()
 await dialog.getByRole('heading',{name:'How do you want to start?'}).waitFor()
 assert.ok(await dialog.getByRole('link',{name:/Claim lifetime access/}).isVisible())
 assert.ok(await dialog.getByRole('button',{name:/Free.*24 hours/}).isVisible())
 assert.equal(await dialog.getByRole('link',{name:'Download for Windows'}).count(),0)
 await page.screenshot({path:out+'/download-chooser.png'})
 const registerBefore=registrations, checkoutBefore=checkoutCalls
 await dialog.getByRole('link',{name:/Claim lifetime access/}).hover()
 await page.waitForFunction(()=>Object.keys(localStorage).some(k=>k.startsWith('mamalead.website.installation:')))
 assert.equal(registrations,registerBefore+1,'Lifetime intent warms browser identity once')
 assert.equal(checkoutCalls,checkoutBefore,'hover does not create a Stripe checkout')
 let releaseCheckout;checkoutGate=new Promise(resolve=>{releaseCheckout=resolve})
 const chooserNavigation=page.waitForRequest('https://checkout.stripe.com/c/pay/website_fixture')
 await dialog.getByRole('link',{name:/Claim lifetime access/}).click()
 await page.getByText('Opening secure Stripe Checkout…',{exact:true}).waitFor({timeout:1500})
 assert.equal(await dialog.count(),0,'chooser closes and shows checkout feedback immediately')
 releaseCheckout();checkoutGate=null;await chooserNavigation
 await page.goto(base,{waitUntil:'networkidle'})
 await page.locator('#download a').filter({hasText:'Download for Windows'}).first().click()
 await dialog.getByRole('button',{name:/Free.*24 hours/}).click()
 await dialog.getByRole('heading',{name:'Get your free 1-day trial'}).waitFor()
 assert.ok(await page.locator('#trial-email').isVisible())
 await dialog.getByRole('button',{name:/Back/}).click()
 await dialog.getByRole('heading',{name:'How do you want to start?'}).waitFor()
 await page.keyboard.press('Escape')
 await page.goto(base+'/?action=trial#download',{waitUntil:'networkidle'})
 await dialog.getByRole('heading',{name:'Get your free 1-day trial'}).waitFor()
 assert.ok(await page.evaluate(()=>window.scrollY>500),'app trial handoff scrolls to download before the form')
 await page.keyboard.press('Escape')

 await page.evaluate(()=>window.MamaLeadBilling.checkout())
 purchaseError='This email already has a lifetime account. The duplicate payment was refunded; use the original license key.'
 await page.goto(base+'/?checkout=success&session_id=duplicate',{waitUntil:'networkidle'})
 await page.getByText(purchaseError,{exact:true}).waitFor()
 assert.equal(await page.getByText('Payment successful',{exact:true}).count(),0)
 purchaseError=null
 await page.goto(base+'/thank-you.html?checkout=success&session_id=forged',{waitUntil:'networkidle'})
 await page.getByRole('alert').filter({hasText:'still being confirmed'}).waitFor()
 assert.equal(await page.locator('#payment-confirmed').isVisible(),false,'return URL alone never shows paid/download state')
 paid=true;purchaseEmail=null
 await page.getByRole('button',{name:'Check payment again'}).click()
 await page.getByRole('alert').filter({hasText:'still being confirmed'}).waitFor()
 assert.equal(await page.locator('#payment-confirmed').isVisible(),false,'payment without emailed key does not show delivery confirmation')
 purchaseError='This email already has a lifetime account. The duplicate payment was refunded; use the original license key.'
 await page.reload({waitUntil:'networkidle'});await page.getByRole('alert').filter({hasText:purchaseError}).waitFor()
 assert.equal(await page.locator('#payment-confirmed').isVisible(),false,'duplicate refund never shows success')
 purchaseError=null;purchaseEmail='paid@example.test';failStatus=true
 await page.reload({waitUntil:'networkidle'});await page.getByRole('alert').filter({hasText:'Payment verification temporarily unavailable'}).waitFor()
 assert.equal(await page.locator('#payment-confirmed').isVisible(),false)
 failStatus=false
 await page.getByRole('button',{name:'Check payment again'}).click()
 await page.getByRole('heading',{name:'Thank you for choosing MamaLead.'}).waitFor()
 assert.ok(await page.getByText('paid@example.test',{exact:true}).isVisible())
 assert.equal(await page.locator('#open-app').getAttribute('href'),'mamalead://billing')
 const paidDownload=page.waitForEvent('download');await page.locator('#download-app').click()
 assert.equal((await paidDownload).suggestedFilename(),'MamaLead Setup QA.exe')
 assert.ok(await page.locator('#payment-confirmed').isVisible(),'direct download retains activation instructions')
 for(const width of [1440,768,390]){
  await page.setViewportSize({width,height:1000});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1))
  assert.ok(await page.locator('img').evaluateAll(imgs=>imgs.every(img=>img.complete&&img.naturalWidth>0)))
  await page.screenshot({path:out+'/thank-you-'+width+'.png',fullPage:true})
 }
 await page.reload({waitUntil:'networkidle'});await page.locator('#payment-confirmed').waitFor()
 paid=true
 await page.goto(base+'/?checkout=success&session_id=verified',{waitUntil:'networkidle'})
 await page.getByText('Payment successful',{exact:true}).waitFor()
 assert.equal(new URL(page.url()).pathname,'/thank-you.html','old checkout returns also use the new thank-you page')
 await page.getByRole('link',{name:'Back to MamaLead'}).click()
 assert.equal(new URL(page.url()).search,'')
 assert.deepEqual(errors,[])
 console.log('PASS download chooser, both choices/back, immediate checkout feedback, identity prewarm, fast app handoff, all Lifetime buttons, retry/double-click protection, trial download/recovery and verified payment; no real payments or email')
}finally{await browser?.close();child.kill()}
