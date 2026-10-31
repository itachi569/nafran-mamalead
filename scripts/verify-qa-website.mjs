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
 const out=resolve('screenshots/qa-1.4.22/website');mkdirSync(out,{recursive:true})
 for(const viewport of [{width:1440,height:1000},{width:390,height:844},{width:375,height:812},{width:768,height:1024}]){
  const page=await browser.newPage({viewport});const errors=[],failedResources=[];page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)failedResources.push(r.status()+' '+r.url())})
  await page.goto(base,{waitUntil:'networkidle'})
  assert.ok(await page.locator('a[href="support.html"]').count())
  assert.ok(await page.locator('a[href="/terms.html"],a[href="terms.html"]').count())
  assert.doesNotMatch(await page.locator('body').innerText(),/Subscribe\s*[·•]\s*Rs\s*1,000|Decision Makers pass/i)
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1))
  if(viewport.width <= 640){
   assert.ok((await page.locator('.site-header').boundingBox()).height <= 65, 'compact mobile header')
   const menu=page.locator('.mobile-menu-button')
   await menu.click();assert.equal(await menu.getAttribute('aria-expanded'),'true')
   for(const link of await page.locator('#mobile-menu a').all()) assert.ok((await link.boundingBox()).height >= 44,'44px mobile navigation targets')
   await page.locator('#mobile-menu a[href="#faq"]').click();assert.equal(await menu.getAttribute('aria-expanded'),'false')
   await menu.click();await page.keyboard.press('Escape');assert.equal(await menu.getAttribute('aria-expanded'),'false')
   const tiny=await page.locator('body').evaluate(el=>Array.from(el.querySelectorAll('*')).filter(e=>e.childNodes.length&&Array.from(e.childNodes).some(n=>n.nodeType===3&&n.textContent.trim())&&e.getBoundingClientRect().height>0&&getComputedStyle(e).display!=='none'&&parseFloat(getComputedStyle(e).fontSize)<12).map(e=>({text:e.textContent.slice(0,55),size:getComputedStyle(e).fontSize})))
   assert.deepEqual(tiny,[],'mobile text at least 12px')
   await page.goto(base,{waitUntil:'networkidle'})
  }
  assert.match(await page.locator('#top h1').innerText(),/Find Your Next Client or Job\s+on Google Maps/)
  assert.match(await page.locator('.hero-buy').innerText(),/Claim lifetime access at 50% off/)
  assert.equal(await page.locator('.zip-search-demo [data-demo-slot]').count(),10)
  assert.ok(await page.locator('.zip-search-demo [data-demo-slot]').first().evaluate(el=>getComputedStyle(el).animationName.includes('zipHeroDemoSlot')))
  assert.match(await page.locator('#top').innerText(),/Save Rs 10,000/)
  assert.match(await page.locator('.zip-offer-card').innerText(),/463 of 500 launch licenses claimed/)
  assert.ok(await page.locator('[data-offer-sample]').isVisible())
  assert.doesNotMatch(await page.locator('#top').innerText(),/Launch window.*gone|v1\.4\.0/)
  if(viewport.width<=640){
   const offer=await page.locator('.zip-offer-main').boundingBox(),badge=await page.locator('.zip-offer-main>span:last-child').boundingBox()
   assert.ok(badge.x>offer.x+offer.width*.65 && badge.y<offer.y+offer.height*.5,'discount badge stays beside the mobile offer')
  }
  assert.equal(await page.locator('#top .hero-trial').getAttribute('href'),'#download')
  assert.match(await page.locator('.pricing-grid article').first().innerText(),/LIFETIME ACCESS/)
  assert.ok(await page.evaluate(()=>Boolean(document.querySelector('#pricing').compareDocumentPosition(document.querySelector('#how')) & Node.DOCUMENT_POSITION_FOLLOWING)))
  await page.waitForTimeout(1800)
  await page.screenshot({path:out+'/home-'+viewport.width+'.png'})
  await page.locator('#top .hero-trial').click()
  await page.getByRole('dialog').waitFor()
  await page.locator('#trial-email').waitFor()
  await page.waitForTimeout(1000);
  assert.ok(await page.locator('#download').evaluate(el=>el.getBoundingClientRect().top<innerHeight*.6), JSON.stringify(await page.locator('#download').evaluate(el=>({top:el.getBoundingClientRect().top,scroll:scrollY,height:innerHeight,body:document.body.scrollTop}))))
  await page.screenshot({path:out+'/trial-download-'+viewport.width+'.png'})
  await page.getByRole('dialog').getByRole('button',{name:'Close',exact:true}).click()
  await page.goto(base+'/terms.html',{waitUntil:'networkidle'})
  assert.match(await page.locator('body').innerText(),/10,000/)
  assert.ok(await page.locator('a[href="mailto:billing@nafran.co"]').count())
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1))
  await page.screenshot({path:out+'/terms-'+viewport.width+'.png'})
  assert.deepEqual(errors,[]);assert.deepEqual(failedResources,[]);await page.close()
 }
 const reduced=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'})
 await reduced.goto(base,{waitUntil:'networkidle'})
 const visibleSlots=await reduced.locator('.zip-search-demo [data-demo-slot]').evaluateAll(els=>els.filter(el=>getComputedStyle(el).opacity==='1').map(el=>el.textContent))
 assert.deepEqual(visibleSlots,['dentists','Lahore'],'reduced motion keeps a readable static demo')
 await reduced.close()
 const published=await browser.newPage({viewport:{width:1440,height:1000}})
 await published.route('https://published-preview.example/**',async route=>{
  const url=new URL(route.request().url()),response=await route.fetch({url:base+url.pathname+url.search})
  await route.fulfill({response})
 })
 await published.goto('https://published-preview.example/',{waitUntil:'networkidle'})
 await published.locator('.zip-offer-card').waitFor()
 assert.doesNotMatch(await published.locator('.zip-offer-card').innerText(),/463 of 500/,'sample sales count stays in local design previews')
 assert.match(await published.locator('.zip-offer-card').innerText(),/Save 50% on Lifetime/)
 assert.equal(await published.locator('[data-offer-sample]').count(),0)
 await published.close()
 console.log('PASS desktop/mobile homepage and Terms; support/terms links; no retired subscription CTA; no overflow or JS errors')
}finally{await browser?.close();child.kill()}
