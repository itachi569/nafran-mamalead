import assert from 'node:assert/strict'
import {spawn} from 'node:child_process'
import {mkdtempSync,mkdirSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'
import {createServer} from 'node:net'
import {chromium} from 'playwright'
import {createBillingServer} from '../billing-server/server.mjs'

const dir=mkdtempSync(join(tmpdir(),'mama-ai-ui-')),out=resolve('screenshots/mama-ai');mkdirSync(out,{recursive:true})
const probe=createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));const base='http://127.0.0.1:'+port
let providerCalls=0,configReads=0
const api=createBillingServer({env:{STRIPE_SECRET_KEY:'sk_test_fixture',STRIPE_PRICE_LIFETIME:'price_fixture',BILLING_DB_PATH:join(dir,'billing.db'),BILLING_ALLOWED_ORIGINS:base,DOWNLOAD_SIGNING_KEY:'fixture-only-signing-key',CEREBRAS_API_KEY:'fixture-only-private-key',TURNSTILE_SITE_KEY:'fixture',TURNSTILE_SECRET_KEY:'fixture'},fetch:async(url,request)=>{
 if(url.includes('siteverify'))return Response.json({success:true,hostname:'mamalead.com',action:'mamalead_chat'})
 providerCalls++;const question=JSON.parse(request.body).messages.at(-1).content
 if(question==='Fail once')return new Response('private error',{status:500})
 return Response.json({choices:[{message:{content:'MamaLead finds published business emails, phones and social profiles. Lifetime costs Rs 10,000 once; you can try it free for one day. Contact hello@mamalead.com for support.'}}]})
}})
await new Promise(r=>api.server.listen(0,'127.0.0.1',r));const apiBase='http://127.0.0.1:'+api.server.address().port
const child=spawn(process.execPath,['website/server.mjs'],{env:{...process.env,LANDING_ROOT:resolve('website'),LANDING_PORT:String(port)},windowsHide:true,stdio:'ignore'})
let browser
try{
 for(let n=0;n<100;n++){try{if((await fetch(base)).ok)break}catch{}await new Promise(r=>setTimeout(r,50))}
 for(const asset of ['mama-ai.js','mama-ai.css']){const response=await fetch(base+'/'+asset);assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store')}
 browser=await chromium.launch({headless:true,channel:'chromium'})
 // The page renderer may create the launcher after this deferred script, or replace
 // the original body after it ran. Neither ordering may leave a dead chat button.
 const race=await browser.newPage()
 await race.route(base+'/boot-race',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><body><script src="/mama-ai.js" defer></script></body>'}))
 await race.route('https://api.mamalead.com/**',r=>r.fulfill({json:{configured:false,remaining:6}}))
 await race.goto(base+'/boot-race',{waitUntil:'networkidle'})
 await race.evaluate(()=>{document.body.innerHTML='<button id="mama-ai-launcher">Ask Mama AI</button>'})
 await race.locator('#mama-ai-launcher').click()
 await race.locator('#mama-ai-panel:not([hidden])').waitFor()
 assert.equal(await race.locator('#mama-ai-panel').count(),1)
 await race.getByRole('button',{name:'Close Mama AI'}).click()
 await race.locator('#mama-ai-launcher').click()
 assert.equal(await race.locator('#mama-ai-panel').count(),1)
 await race.close()
 for(const width of [1440,375,768]){
  api.db.prepare('delete from assist_usage').run()
  const page=await browser.newPage({viewport:{width,height:900},reducedMotion:'reduce'}),errors=[]
  page.on('pageerror',e=>errors.push(e.message))
  await page.addInitScript(()=>{let options;window.turnstile={render:(el,o)=>{options=o;setTimeout(()=>{o.callback('fixture-token');window.chatSecurityReady=true},10);return 'fixture-widget'},reset:()=>setTimeout(()=>options.callback('fixture-token'),10)}})
  await page.route(apiBase+'/**',async route=>{if(route.request().url().includes('/v1/assist/web/')){if(route.request().url().endsWith('/config'))configReads++;return route.continue()}return route.fulfill({json:{configured:false}})})
  await page.route('https://api.mamalead.com/**',r=>r.fulfill({json:{configured:false}}))
  const before=configReads
  await page.goto(base+'/?billingApi='+encodeURIComponent(apiBase),{waitUntil:'networkidle'})
  assert.equal(configReads,before,'chat does not contact API before opening')
  await page.locator('#mama-ai-launcher').click()
  const panel=page.getByRole('dialog',{name:'Mama AI — MamaLead guide'}),input=panel.getByRole('textbox'),send=panel.getByRole('button',{name:'Send message'})
  await panel.waitFor();await page.waitForFunction(()=>window.chatSecurityReady)
  for(const section of ['#mama-ai','#footer']){
   await panel.getByRole('button',{name:'Close Mama AI',exact:true}).click()
   await page.locator(section).getByRole('button',{name:'Ask Mama AI',exact:true}).click()
   await panel.waitFor()
  }
  assert.doesNotMatch(await panel.innerText(),/6 (short|questions|messages|left)|daily allowance/i)
  assert.equal(await page.locator('#mama-ai-launcher').isVisible(),false)
  assert.equal(await page.locator('.back-to-top').isVisible(),false)
  assert.ok(await panel.locator('.mama-ai-email a').isVisible())
  assert.equal(await panel.locator('.mama-ai-email a').getAttribute('href'),'mailto:hello@mamalead.com?subject=MamaLead%20Support')
  const rect=await panel.boundingBox();assert.ok(rect.x>=0&&rect.x+rect.width<=width&&rect.y>=0&&rect.y+rect.height<=900)
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1))
  await panel.screenshot({path:join(out,'mama-ai-'+width+'.png'),animations:'disabled'})
  if(width===1440){
   await input.fill('Fail once');await send.click();await panel.getByRole('alert').filter({hasText:'not counted'}).waitFor();assert.equal(await input.inputValue(),'Fail once')
   for(let i=0;i<6;i++){
    await input.fill(i===0?'<img src=x onerror="window.chatXss=true">':i===5?'mujy support chaeya':'What is included?')
    await send.click();await page.waitForFunction(n=>document.querySelectorAll('.mama-ai-message[data-role=assistant]').length===n,i+1)
   }
   assert.equal(await page.evaluate(()=>Boolean(window.chatXss)),false)
   const answerEmails=panel.locator('.mama-ai-message[data-role=assistant] a');assert.equal(await answerEmails.count(),6)
   for(const link of await answerEmails.all())assert.equal(await link.getAttribute('href'),'mailto:hello@mamalead.com?subject=MamaLead%20Support')
   assert.ok(await panel.locator('.mama-ai-handoff').isVisible());assert.match(await panel.locator('.mama-ai-handoff').innerText(),/support team.*connect/)
   assert.ok(await send.isDisabled());assert.ok(await input.isDisabled());assert.equal(providerCalls,7)
   await panel.screenshot({path:join(out,'mama-ai-limit.png'),animations:'disabled'})
   await page.keyboard.press('Escape');assert.ok(await page.locator('#mama-ai-launcher').isVisible());assert.ok(await page.locator('.back-to-top').isVisible())
   await page.reload({waitUntil:'networkidle'});await page.locator('#mama-ai-launcher').click();await panel.locator('.mama-ai-handoff').waitFor();assert.equal(await panel.locator('.mama-ai-message[data-role=assistant]').count(),6);assert.ok(await input.isDisabled());assert.equal(providerCalls,7)
  }
  assert.deepEqual(errors,[]);await page.close()
 }
 console.log('PASS desktop/mobile layout, assets, lazy connection, real API quota, failure retry, six replies, reload persistence, email handoff, escaped text, close/reopen and browser errors; provider/CAPTCHA are test doubles.')
}finally{await browser?.close();child.kill();await new Promise(r=>api.server.close(r));api.db.close();rmSync(dir,{recursive:true,force:true})}
