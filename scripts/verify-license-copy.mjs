// Local fixtures only. No issued keys, email sends, payments or production reads.
import assert from 'node:assert/strict'
import {spawn} from 'node:child_process'
import {createServer} from 'node:net'
import {mkdirSync} from 'node:fs'
import {resolve,join} from 'node:path'
import {chromium} from 'playwright'
import {buildLicenseEmail} from '../billing-server/license-email.mjs'

const key='NF-'+Array(10).fill('ABCD').join('-')
for(const kind of ['trial','lifetime','decision']){
 const email=buildLicenseEmail({to:'demo@example.test',licenseKey:key,kind,download:'https://mamalead.com/#download'})
 const url=new URL(email.html.match(/href="([^"]+)"[^>]*>Copy license key<\/a>/)?.[1])
 assert.equal(url.origin,'https://mamalead.com');assert.equal(url.pathname,'/copy-key');assert.equal(url.search,'')
 assert.equal(new URLSearchParams(url.hash.slice(1)).get('key'),key)
 assert.match(email.text,/Copy license key \(opens a browser page\)/)
 assert.doesNotMatch(email.html,/<script|onclick=|javascript:/i)
 assert.ok(email.html.indexOf('Copy license key')>email.html.indexOf(key))
}
const injection=buildLicenseEmail({to:'demo@example.test',licenseKey:'"><script>alert(1)</script>',kind:'trial',download:'https://mamalead.com/#download'})
assert.doesNotMatch(injection.html,/<script>|href="[^"]*"\s+on/i)
const probe=createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r))
const child=spawn(process.execPath,['website/server.mjs'],{env:{...process.env,LANDING_ROOT:resolve('website'),LANDING_HOST:'127.0.0.1',LANDING_PORT:String(port)},stdio:'ignore'})
const base='http://127.0.0.1:'+port,out=resolve('screenshots/license-copy');mkdirSync(out,{recursive:true})
let browser
try{
 for(let n=0;n<100;n++){try{await fetch(base+'/copy-key');break}catch{await new Promise(r=>setTimeout(r,50))}}
 const res=await fetch(base+'/copy-key');assert.equal(res.status,200)
 assert.equal(res.headers.get('referrer-policy'),'no-referrer');assert.equal(res.headers.get('cache-control'),'no-store')
 assert.match(res.headers.get('content-security-policy'),/connect-src 'none'/);assert.match(res.headers.get('x-robots-tag'),/noindex/)
 assert.doesNotMatch(await res.text(),new RegExp(key))
 for(const path of ['/copy-key.js','/copy-key.css'])assert.equal((await fetch(base+path)).status,200)
 for(const path of ['/copy-key.html','/copy-key/']){const r=await fetch(base+path,{redirect:'manual'});assert.equal(r.status,301);assert.equal(r.headers.get('location'),'/copy-key')}
 browser=await chromium.launch({headless:true,channel:'chromium'})
 const context=await browser.newContext({permissions:['clipboard-read','clipboard-write'],viewport:{width:800,height:900}})
 const page=await context.newPage(),requests=[],errors=[]
 page.on('request',r=>requests.push(r.url()));page.on('pageerror',e=>errors.push(e.message))
 await page.goto(base+'/copy-key#key='+encodeURIComponent(key))
 await page.getByRole('button',{name:'Copy license key',exact:true}).waitFor()
 assert.equal(await page.locator('#license-key').inputValue(),key);assert.equal(new URL(page.url()).hash,'')
 assert.equal(await page.evaluate(()=>localStorage.length+sessionStorage.length),0)
 await page.screenshot({path:join(out,'copy-page-desktop.png'),fullPage:true})
 await page.getByRole('button',{name:'Copy license key',exact:true}).click()
 assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),key)
 assert.match(await page.getByRole('status').innerText(),/^Copied!/)
 await page.screenshot({path:join(out,'copy-page-success.png'),fullPage:true})
 assert.ok(requests.every(url=>new URL(url).origin===base&&!url.includes(key)&&!new URL(url).hash),'The key must never travel in HTTP requests')
 await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{throw new Error('Denied')}}}))
 await page.getByRole('button',{name:'Key copied',exact:true}).click()
 assert.match(await page.getByRole('status').innerText(),/browser blocked/)
 assert.deepEqual(await page.locator('#license-key').evaluate(el=>[el.selectionStart,el.selectionEnd]),[0,key.length])
 await page.reload();assert.equal(await page.locator('#license-key').inputValue(),'');assert.equal(await page.locator('#copy-key').isDisabled(),true)
 await page.goto(base+'/copy-key#key='+encodeURIComponent('<img src=x onerror=alert(1)>'))
 assert.equal(await page.locator('#copy-key').isDisabled(),true);assert.equal(await page.locator('#license-key').inputValue(),'')
 for(const width of [375,390]){
  await page.setViewportSize({width,height:900});await page.goto(base+'/copy-key#key='+key)
  await page.waitForFunction(value=>document.getElementById('license-key').value===value,key)
  assert.equal(await page.locator('#copy-key').isDisabled(),false);assert.equal(new URL(page.url()).hash,'')
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true)
  assert.equal(await page.locator('#license-key').evaluate(el=>el.scrollHeight<=el.clientHeight+1),true,'Whole key must fit')
  await page.screenshot({path:join(out,'copy-page-'+width+'.png'),fullPage:true})
 }
 assert.deepEqual(errors,[])
 console.log('PASS trial/Lifetime email copy links, actual clipboard copy, blocked-clipboard fallback, invalid input, no key requests/storage, private headers and responsive preview')
}finally{await browser?.close();child.kill()}
