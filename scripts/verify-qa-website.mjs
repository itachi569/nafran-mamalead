import assert from 'node:assert/strict'
import {spawn} from 'node:child_process'
import {createServer} from 'node:net'
import {mkdirSync} from 'node:fs'
import {resolve} from 'node:path'
import {chromium} from 'playwright'
const probe=createServer();await new Promise(done=>probe.listen(0,'127.0.0.1',done));const port=probe.address().port;await new Promise(done=>probe.close(done))
const child=spawn(process.execPath,['website/server.mjs'],{cwd:process.cwd(),env:{...process.env,LANDING_ROOT:resolve('website'),LANDING_PORT:String(port)},windowsHide:true,stdio:'ignore'})
let browser
try{
 const base='http://127.0.0.1:'+port
 for(let i=0;i<50;i++){try{if((await fetch(base)).ok)break}catch{}await new Promise(r=>setTimeout(r,100))}
 assert.equal((await fetch(base+'/terms.html')).status,200)
 browser=await chromium.launch({headless:true})
 const out=resolve('screenshots/qa-1.4.19/website');mkdirSync(out,{recursive:true})
 for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
  const page=await browser.newPage({viewport});const errors=[];page.on('pageerror',e=>errors.push(e.message))
  await page.goto(base,{waitUntil:'networkidle'})
  assert.ok(await page.locator('a[href="mailto:billing@nafran.co"]').count())
  assert.ok(await page.locator('a[href="/terms.html"],a[href="terms.html"]').count())
  assert.doesNotMatch(await page.locator('body').innerText(),/Subscribe\s*[·•]\s*Rs\s*1,000|Decision Makers pass/i)
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1))
  assert.match(await page.locator('#top h1').innerText(),/Rs 10,000/)
  assert.equal(await page.locator('#top .hero-trial').getAttribute('href'),'#download')
  assert.match(await page.locator('.pricing-grid article').first().innerText(),/LIFETIME ACCESS/)
  assert.ok(await page.evaluate(()=>Boolean(document.querySelector('#pricing').compareDocumentPosition(document.querySelector('#how')) & Node.DOCUMENT_POSITION_FOLLOWING)))
  await page.screenshot({path:out+'/home-'+viewport.width+'.png'})
  await page.locator('#top .hero-trial').click()
  await page.waitForFunction(()=>location.hash==='#download'&&document.querySelector('#download').getBoundingClientRect().top<innerHeight*.6)
  await page.waitForTimeout(700)
  assert.ok(await page.locator('#download a').filter({hasText:'Download for Windows'}).first().isVisible())
  await page.screenshot({path:out+'/trial-download-'+viewport.width+'.png'})
  await page.goto(base+'/terms.html',{waitUntil:'networkidle'})
  assert.match(await page.locator('body').innerText(),/10,000/)
  assert.ok(await page.locator('a[href="mailto:billing@nafran.co"]').count())
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1))
  await page.screenshot({path:out+'/terms-'+viewport.width+'.png'})
  assert.deepEqual(errors,[]);await page.close()
 }
 console.log('PASS desktop/mobile homepage and Terms; support/terms links; no retired subscription CTA; no overflow or JS errors')
}finally{await browser?.close();child.kill()}
