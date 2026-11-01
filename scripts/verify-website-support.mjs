// Isolated public form -> real billing handler -> SQLite inbox. Email delivery is a fixture.
import assert from 'node:assert/strict'
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'
import {spawn} from 'node:child_process'
import {createServer} from 'node:net'
import {chromium} from 'playwright'
import {createBillingServer} from '../billing-server/server.mjs'
import {parse} from 'parse5'
const supportMailto='mailto:mamaleads997@gmail.com?subject=MamaLead%20Support'
// Catch a plain text email or a missing mailto before the browser runtime mounts.
for(const file of ['index.html','support.html','privacy.html','terms.html','thank-you.html']){
 let addresses=0
 const visit=(node,link=null)=>{
  if(['script','style'].includes(node.tagName))return
  if(node.tagName==='a')link=node.attrs.find(a=>a.name==='href')?.value
  if(node.nodeName==='#text'&&node.value.includes('mamaleads997@gmail.com')){
   addresses++;assert.equal(link,supportMailto,`${file}: displayed support email must be a mailto with MamaLead Support subject`)
  }
  for(const child of node.childNodes||[])visit(child,link)
 }
 visit(parse(readFileSync(resolve('website',file),'utf8'),{scriptingEnabled:false}))
 if(file==='support.html')assert.ok(addresses>0,'Support page must display its linked email address')
}
const dir=mkdtempSync(join(tmpdir(),'mamalead-web-support-')),probe=createServer()
await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r))
const base='http://127.0.0.1:'+port,mail=[]
const captchaFile=join(dir,'turnstile.env');writeFileSync(captchaFile,'TURNSTILE_SITE_KEY=fixture-public\nTURNSTILE_SECRET_KEY=fixture-private\nTURNSTILE_HOSTNAMES=127.0.0.1\n')
const api=createBillingServer({env:{STRIPE_SECRET_KEY:'sk_test_fixture',STRIPE_PRICE_LIFETIME:'price_fixture',BILLING_PUBLIC_URL:'http://127.0.0.1:38747',BILLING_DB_PATH:join(dir,'billing.db'),BILLING_ALLOWED_ORIGINS:base,RESEND_API_KEY:'fixture-only',EMAIL_FROM:'QA <qa@example.test>',SUPPORT_INBOX:'support@example.test',DOWNLOAD_SIGNING_KEY:'fixture-signing-key-not-production',TURNSTILE_CONFIG_FILE:captchaFile},fetch:async(url,options)=>{if(url==='https://challenges.cloudflare.com/turnstile/v0/siteverify'){assert.equal(JSON.parse(options.body).response,'fixture-token');return Response.json({success:true,hostname:'127.0.0.1',action:'mamalead_support'})}assert.equal(url,'https://api.resend.com/emails');mail.push(JSON.parse(options.body));return Response.json({id:'test-message'})}})
await new Promise(r=>api.server.listen(0,'127.0.0.1',r))
const apiBase='http://127.0.0.1:'+api.server.address().port
const child=spawn(process.execPath,['website/server.mjs'],{env:{...process.env,LANDING_ROOT:resolve('website'),LANDING_PORT:String(port)},windowsHide:true,stdio:'ignore'})
let browser
try{
 for(let i=0;i<60;i++){try{if((await fetch(base+'/support.html')).ok)break}catch{}await new Promise(r=>setTimeout(r,100))}
 browser=await chromium.launch({headless:true})
 const page=await browser.newPage({viewport:{width:1280,height:900},reducedMotion:'reduce'}),errors=[]
 await page.route('https://challenges.cloudflare.com/turnstile/v0/api.js*',r=>r.fulfill({contentType:'text/javascript',body:`window.turnstile={render(el,o){this.options=o;el.textContent='Security check (local test fixture)';setTimeout(()=>o.callback('fixture-token'),0);return 1},reset(){setTimeout(()=>this.options.callback('fixture-token'),0)}}`}))
 page.on('pageerror',e=>errors.push(e.message))
 for(const path of ['/support','/privacy','/terms','/thank-you'])assert.equal((await fetch(base+path)).status,200,path)
 for(const path of ['/contact','/contact/']){const r=await fetch(base+path+'?topic=bug',{redirect:'manual'});assert.equal(r.status,301);assert.equal(r.headers.get('location'),'/support?topic=bug')}
 assert.equal((await fetch(base+'/support/',{redirect:'manual'})).headers.get('location'),'/support')
 assert.equal((await fetch(base+'/.env')).status,404)
 const url=base+'/support?billingApi='+encodeURIComponent(apiBase)
 await page.goto(url,{waitUntil:'networkidle'})
 assert.equal(await page.locator('link[rel="canonical"]').getAttribute('href'),'https://mamalead.com/support')
 const emailLink=page.getByRole('link',{name:'mamaleads997@gmail.com',exact:true})
 assert.equal(await emailLink.getAttribute('href'),supportMailto)
 const emailStyle=await emailLink.evaluate(el=>{const s=getComputedStyle(el);return {color:s.color,weight:s.fontWeight,underline:s.textDecorationLine,font:s.fontFamily}})
 assert.equal(emailStyle.color,'rgb(28, 28, 28)');assert.equal(emailStyle.weight,'700');assert.match(emailStyle.underline,/underline/);assert.match(emailStyle.font,/Satoshi/)
 await emailLink.hover();await page.waitForTimeout(180)
 assert.ok(Number(await emailLink.evaluate(el=>getComputedStyle(el).opacity))<1,'Subtle hover feedback')
 await emailLink.focus();await page.keyboard.press('Shift+Tab');await page.keyboard.press('Tab')
 assert.equal(await emailLink.evaluate(el=>el===document.activeElement&&getComputedStyle(el).outlineStyle==='solid'),true,'Email link has a keyboard focus outline')
 await page.locator('button[type="submit"]').click()
 await page.getByRole('link',{name:'Email: Enter a valid email address.'}).waitFor()
 await page.getByRole('link',{name:'Message: Write at least 10 characters.'}).waitFor()
 await page.evaluate(()=>window.turnstile.options['expired-callback']())
 await page.getByText('Please complete the security check again.',{exact:true}).waitFor()
 assert.equal(await page.locator('button[type="submit"]').getAttribute('aria-disabled'),'true')
 await page.evaluate(()=>window.turnstile.options.callback('fixture-token'))
 await page.locator('#f-email').fill('review@example.test')
 await page.locator('#f-name').fill('Website QA')
 await page.locator('#f-category').selectOption('bug')
 await page.locator('#f-subject').fill('Website import question')
 await page.locator('#f-last4').fill('ABCD')
 await page.locator('#f-message').fill('My imported website should remain saved after switching pages.')
 await page.reload({waitUntil:'networkidle'})
 assert.match(await page.locator('#f-message').inputValue(),/remain saved/)
 let conflict=true
 await page.route(apiBase+'/v1/support/web',async route=>{if(conflict){conflict=false;return route.fulfill({status:409,headers:{'access-control-allow-origin':base},json:{error:'Request id conflict'}})}return route.continue()})
 await page.locator('button[type="submit"]').click()
 await page.getByText(/We couldn't send your message right now/).waitFor()
 await page.getByRole('button',{name:'Try again',exact:true}).evaluate(el=>{el.click();el.click()})
 await page.getByText(/ML-S-[A-Z0-9]{6}/).first().waitFor()
 const rows=api.db.prepare('select * from billing_support_messages').all()
 assert.equal(rows.length,1);assert.equal(mail.length,2);assert.equal(rows[0].source,'website');assert.equal(rows[0].receipt_status,'sent')
 assert.equal(api.db.prepare('select count(*) n from installations').get().n,0)
 assert.equal(rows[0].email,'review@example.test');assert.match(rows[0].message,/remain saved/)
 assert.match(rows[0].message,/Licence key ending \(provided by visitor\): ABCD/);assert.equal(rows[0].license_last4,null)
 assert.equal(await page.evaluate(()=>localStorage.getItem('mamalead.web.support.draft')),null)
 const out=resolve('screenshots/qa-1.4.31/support');mkdirSync(out,{recursive:true})
 await page.screenshot({path:join(out,'website-ticket-saved.png'),animations:'disabled'})
 for(const width of [375,768,1440]){
  await page.setViewportSize({width,height:900});await page.goto(url,{waitUntil:'networkidle'})
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'form fits '+width)
  await page.screenshot({path:join(out,'website-form-'+width+'.png'),animations:'disabled'})
 }
 assert.deepEqual(errors,[])
 await page.route(apiBase+'/v1/support/web/config',r=>r.fulfill({headers:{'access-control-allow-origin':base},json:{configured:false,captchaConfigured:false,turnstileSiteKey:null}}))
 await page.reload({waitUntil:'networkidle'})
 await page.getByText('The support form is temporarily unavailable. Please email mamaleads997@gmail.com.',{exact:true}).waitFor()
 assert.equal(await page.locator('button[type="submit"]').getAttribute('aria-disabled'),'true')
 assert.equal(await page.locator(`a[href="${supportMailto}"]`).count()>0,true)
 console.log('PASS public CAPTCHA form, clean routes, validation links, draft recovery, conflict recovery, double-click prevention, no billing installations, inbox + acknowledgment and responsive layouts; no real messages sent')
}finally{await browser?.close();child.kill();await new Promise(r=>api.server.close(r));api.db.close()}
