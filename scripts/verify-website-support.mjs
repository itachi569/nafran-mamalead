// Isolated public form -> real billing handler -> SQLite inbox. Email delivery is a fixture.
import assert from 'node:assert/strict'
import {mkdtempSync,mkdirSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'
import {spawn} from 'node:child_process'
import {createServer} from 'node:net'
import {chromium} from 'playwright'
import {createBillingServer} from '../billing-server/server.mjs'
const dir=mkdtempSync(join(tmpdir(),'mamalead-web-support-')),probe=createServer()
await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r))
const base='http://127.0.0.1:'+port,mail=[]
const api=createBillingServer({env:{STRIPE_SECRET_KEY:'sk_test_fixture',STRIPE_PRICE_LIFETIME:'price_fixture',BILLING_PUBLIC_URL:'http://127.0.0.1:38747',BILLING_DB_PATH:join(dir,'billing.db'),BILLING_ALLOWED_ORIGINS:base,RESEND_API_KEY:'fixture-only',EMAIL_FROM:'QA <qa@example.test>',SUPPORT_INBOX:'support@example.test',DOWNLOAD_SIGNING_KEY:'fixture-signing-key-not-production'},fetch:async(url,options)=>{assert.equal(url,'https://api.resend.com/emails');mail.push(JSON.parse(options.body));return Response.json({id:'test-message'})}})
await new Promise(r=>api.server.listen(0,'127.0.0.1',r))
const apiBase='http://127.0.0.1:'+api.server.address().port
const child=spawn(process.execPath,['website/server.mjs'],{env:{...process.env,LANDING_ROOT:resolve('website'),LANDING_PORT:String(port)},windowsHide:true,stdio:'ignore'})
let browser
try{
 for(let i=0;i<60;i++){try{if((await fetch(base+'/support.html')).ok)break}catch{}await new Promise(r=>setTimeout(r,100))}
 browser=await chromium.launch({headless:true})
 const page=await browser.newPage({viewport:{width:1280,height:900},reducedMotion:'reduce'}),errors=[]
 page.on('pageerror',e=>errors.push(e.message))
 const url=base+'/support.html?billingApi='+encodeURIComponent(apiBase)
 await page.goto(url,{waitUntil:'networkidle'})
 await page.locator('#f-email').fill('review@example.test')
 await page.locator('#f-name').fill('Website QA')
 await page.locator('#f-category').selectOption('bug')
 await page.locator('#f-subject').fill('Website import question')
 await page.locator('#f-last4').fill('ABCD')
 await page.locator('#f-message').fill('My imported website should remain saved after switching pages.')
 await page.reload({waitUntil:'networkidle'})
 assert.match(await page.locator('#f-message').inputValue(),/remain saved/)
 let conflict=true
 await page.route(apiBase+'/v1/support',async route=>{if(conflict){conflict=false;return route.fulfill({status:409,headers:{'access-control-allow-origin':base},json:{error:'Request id conflict'}})}return route.continue()})
 await page.locator('button[type="submit"]').click()
 await page.getByText(/We couldn't send your message right now/).waitFor()
 await page.getByRole('button',{name:'Try again',exact:true}).evaluate(el=>{el.click();el.click()})
 await page.getByText(/ML-S-[A-Z0-9]{6}/).first().waitFor()
 const rows=api.db.prepare('select * from billing_support_messages').all()
 assert.equal(rows.length,1);assert.equal(mail.length,1)
 assert.equal(rows[0].email,'review@example.test');assert.match(rows[0].message,/remain saved/)
 assert.match(rows[0].message,/Licence key ending \(provided by visitor\): ABCD/);assert.equal(rows[0].license_last4,null)
 assert.equal(await page.evaluate(()=>localStorage.getItem('mamalead.web.support.draft')),null)
 const out=resolve('screenshots/qa-1.4.29/support');mkdirSync(out,{recursive:true})
 await page.screenshot({path:join(out,'website-ticket-saved.png'),animations:'disabled'})
 for(const width of [375,768,1440]){
  await page.setViewportSize({width,height:900});await page.goto(url,{waitUntil:'networkidle'})
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'form fits '+width)
  await page.screenshot({path:join(out,'website-form-'+width+'.png'),animations:'disabled'})
 }
 assert.deepEqual(errors,[])
 console.log('PASS website draft recovery, authenticated send, request-id conflict recovery, double-click prevention, persisted admin inbox ticket, mocked email, and responsive layouts; no real messages sent')
}finally{await browser?.close();child.kill();await new Promise(r=>api.server.close(r));api.db.close()}
