import assert from 'node:assert/strict'
import {spawn} from 'node:child_process'
import {createServer} from 'node:net'
import {resolve} from 'node:path'
import {chromium} from 'playwright'

// Meta Pixel event assertions with a stubbed fbq. No real Meta, Stripe, trial or email requests.
const probe=createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r))
const child=spawn(process.execPath,['website/server.mjs'],{env:{...process.env,LANDING_ROOT:resolve('website'),LANDING_PORT:String(port)},windowsHide:true,stdio:'ignore'})
const base='http://127.0.0.1:'+port
let browser
try {
 for(let i=0;i<60;i++){try{if((await fetch(base)).ok)break}catch{}await new Promise(r=>setTimeout(r,100))}
 assert.equal((await fetch(base+'/analytics.js')).status,200,'analytics.js is served')
 browser=await chromium.launch({headless:true})
 async function setup({stub=true,blockAnalytics=false}={}){
  const ctx=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'})
  const page=await ctx.newPage(), calls=[], errors=[], s={trialEmail:'',failTrial:false,failCheckout:false,checkoutCalls:0,stripe:0,metaRequests:0}
  page.on('pageerror',e=>errors.push(e.message))
  await page.exposeFunction('__fbqRecord',(args,url)=>calls.push({args,url}))
  if(stub)await page.addInitScript(()=>{window.fbq=function(...a){window.__fbqRecord(a,location.href+(window===top?'':' [frame]')+' '+document.readyState+' '+performance.now())}})
  await ctx.route('https://connect.facebook.net/**',r=>{s.metaRequests++;return r.abort()})
  await ctx.route('https://www.facebook.com/**',r=>r.abort())
  if(blockAnalytics)await ctx.route('**/analytics.js',r=>r.abort())
  await ctx.route('https://checkout.stripe.com/**',r=>{s.stripe++;return r.fulfill({contentType:'text/html',body:'<title>Stripe fixture</title>'})})
  await ctx.route('https://api.mamalead.com/**',async route=>{
   const path=new URL(route.request().url()).pathname, body=route.request().postDataJSON?.()
   if(path==='/v1/installations')return route.fulfill({json:{token:'t'.repeat(43)}})
   if(path==='/v1/status')return route.fulfill({json:{lifetime:{active:false},purchaseEmail:null,purchaseError:null,trialRequest:{requested:!!s.trialEmail,emailSent:!!s.trialEmail,email:s.trialEmail,canChangeEmail:true}}})
   if(path==='/v1/trial'){if(s.failTrial)return route.fulfill({status:503,json:{error:'Email delivery is unavailable.'}});s.trialEmail=body.email;return route.fulfill({json:{emailSent:true}})}
   if(path==='/v1/checkout'){s.checkoutCalls++;if(s.failCheckout)return route.fulfill({status:503,json:{error:'Checkout unavailable.'}});return route.fulfill({json:{url:'https://checkout.stripe.com/c/pay/pixel_fixture'}})}
   return route.fulfill({status:404,json:{error:'not in fixture'}})
  })
  return {ctx,page,calls,errors,s}
 }
 const count=(calls,ev)=>calls.filter(c=>c.args[0]==='track'&&c.args[1]===ev).length
 const inits=calls=>calls.filter(c=>c.args[0]==='init')

 // 1. PageView once per page; correct ID; no advanced matching.
 {const {ctx,page,calls,errors}=await setup()
  await page.goto(base,{waitUntil:'networkidle'})
  await page.evaluate(()=>{location.hash='#pricing'});await page.waitForTimeout(400)
  assert.equal(inits(calls).length,1);assert.deepEqual(inits(calls)[0].args,['init','1628121598802764'],'init with ID only, no advanced matching')
  assert.equal(count(calls,'PageView'),1,'one PageView on home despite re-renders/hash')
  for(const p of ['support','privacy','terms']){calls.length=0;await page.goto(base+'/'+p,{waitUntil:'networkidle'});assert.equal(count(calls,'PageView'),1,'PageView on '+p+' '+JSON.stringify(calls))}
  calls.length=0;await page.goto(base+'/thank-you?checkout=success&session_id=cs_test_secret',{waitUntil:'networkidle'})
  assert.equal(count(calls,'PageView'),1,'PageView on thank-you')
  assert.ok(calls.every(c=>!c.url.includes('session_id')&&!c.url.includes('cs_test')),'Pixel never sees checkout session id')
  assert.equal(count(calls,'Purchase'),0,'Purchase pending, never fired')
  assert.deepEqual(errors,[]);await ctx.close()}

 // 2. Lead: zero on failure, one on success, zero on duplicate and on restored request after reload.
 {const {ctx,page,calls,errors,s}=await setup()
  await page.goto(base,{waitUntil:'networkidle'})
  await page.locator('#top .hero-trial').click()
  const dialog=page.getByRole('dialog')
  s.failTrial=true
  await page.locator('#trial-email').fill('trial@example.test');await dialog.getByRole('button',{name:'Send my trial key'}).click()
  await page.waitForTimeout(800);assert.equal(count(calls,'Lead'),0,'no Lead on delivery failure')
  await page.locator('#trial-email').fill('trial');await dialog.getByRole('button',{name:'Send my trial key'}).click();await page.waitForTimeout(300)
  assert.equal(count(calls,'Lead'),0,'no Lead on invalid email')
  s.failTrial=false
  await page.locator('#trial-email').fill('trial@example.test');await dialog.getByRole('button',{name:'Send my trial key'}).click()
  await dialog.getByRole('button',{name:'Use a different email'}).waitFor()
  assert.equal(count(calls,'Lead'),1,'one Lead on confirmed delivery')
  assert.ok(!JSON.stringify(calls).includes('example.test'),'no email in events')
  await dialog.getByRole('button',{name:'Use a different email'}).click()
  await page.locator('#trial-email').fill('trial@example.test');await dialog.getByRole('button',{name:'Send my trial key'}).click();await page.waitForTimeout(800)
  assert.equal(count(calls,'Lead'),1,'no Lead on duplicate email')
  calls.length=0;await page.reload({waitUntil:'networkidle'});await page.locator('#top .hero-trial').click();await page.waitForTimeout(600)
  assert.equal(count(calls,'Lead'),0,'no Lead on restored request')
  assert.deepEqual(errors,[]);await ctx.close()}

 // 3. InitiateCheckout: zero on error or prewarm hover, one on valid Stripe URL, navigation still happens.
 {const {ctx,page,calls,errors,s}=await setup()
  await page.goto(base,{waitUntil:'networkidle'})
  await page.locator('.hero-buy').hover();await page.waitForTimeout(300)
  s.failCheckout=true;await page.locator('.hero-buy').click()
  await page.getByRole('button',{name:'Try again',exact:true}).waitFor()
  assert.equal(count(calls,'InitiateCheckout'),0,'no InitiateCheckout on error/prewarm')
  s.failCheckout=false
  await Promise.all([page.waitForURL(/checkout\.stripe\.com/),page.getByRole('button',{name:'Try again',exact:true}).click()])
  assert.equal(count(calls,'InitiateCheckout'),1,'one InitiateCheckout before Stripe navigation')
  assert.equal(s.stripe,1);assert.deepEqual(errors,[]);await ctx.close()}

 // 4. Blocked Meta script (real loader, connect.facebook.net aborted) and blocked analytics.js: flows still work.
 for(const opts of [{stub:false},{stub:false,blockAnalytics:true}]){
  const {ctx,page,errors,s}=await setup(opts)
  await page.goto(base,{waitUntil:'networkidle'})
  if(!opts.blockAnalytics)assert.ok(s.metaRequests>=1,'real loader requested fbevents.js (blocked)')
  await page.locator('#top .hero-trial').click()
  const dialog=page.getByRole('dialog')
  await page.locator('#trial-email').fill('blocked@example.test');await dialog.getByRole('button',{name:'Send my trial key'}).click()
  await dialog.getByRole('button',{name:'Use a different email'}).waitFor()
  await page.keyboard.press('Escape');await page.goto(base,{waitUntil:'networkidle'})
  await Promise.all([page.waitForURL(/checkout\.stripe\.com/),page.locator('.hero-buy').click()])
  assert.equal(s.checkoutCalls,1);assert.deepEqual(errors,[],JSON.stringify(opts));await ctx.close()}

 console.log('PASS Meta Pixel: one init+PageView per page (5 pages), sanitized thank-you URL, Lead only on confirmed delivery (0 on failure/invalid/duplicate/restore), InitiateCheckout only on valid Stripe URL (0 on error/hover), no Purchase, no email in events, flows work with Meta or analytics.js blocked')
} finally { await browser?.close(); child.kill() }
