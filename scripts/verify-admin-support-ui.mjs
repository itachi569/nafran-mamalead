import assert from 'node:assert/strict'
import {createServer} from 'node:http'
import {readFileSync,mkdirSync} from 'node:fs'
import {resolve,join} from 'node:path'
import {chromium} from 'playwright'
const out=resolve('screenshots/admin-email-only');mkdirSync(out,{recursive:true})
const html=readFileSync('admin-dashboard/index.html','utf8').replace("return (this.props.dataSource ?? 'live') === 'fixture';","return true;")
const server=createServer((req,res)=>{
 if(req.url.startsWith('/admin/api/lead-cache/stats')){res.setHeader('content-type','application/json');res.end(JSON.stringify({lookups:10,hitRate:.5,leadsServed:50,leadsRequested:100,partialHits:2,contributed:60,places:60,quarantined:0,topQueries:[{keyword:'dentist',location:'Lahore',lookups:10,hitRate:.5,places:60}]}));return}
 res.setHeader('content-type',req.url.endsWith('.js')?'application/javascript':'text/html');res.end(req.url.endsWith('.js')?readFileSync('admin-dashboard/'+req.url.slice('/admin/'.length)):html)
})
await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true})
try {
 const page=await browser.newPage({viewport:{width:1440,height:950}}),errors=[];page.on('pageerror',e=>{errors.push(e.message);console.log('UI ERROR',e.message)});page.on('console',m=>{if(m.type()==='error')console.log(m.text())})
 const supportRequests=[];page.on('request',r=>{if(r.url().includes('/admin/api/support'))supportRequests.push(r.url())});
 await page.goto('http://127.0.0.1:'+server.address().port+'/admin/');
 await page.getByRole('button',{name:'View previous history',exact:true}).waitFor();
 const cache=page.getByRole('heading',{name:'Shared lead cache',exact:true}).locator('..')
 for(const period of ['Today','7 days','30 days']){
  await cache.getByRole('button',{name:period,exact:true}).click()
  await page.waitForFunction(()=>document.body.innerText.includes('50% cache hit rate'))
  assert.match(await cache.locator('tbody').innerText(),/dentist[\s\S]*Lahore[\s\S]*50%/)
 }
 assert.match(await page.getByRole('region',{name:'Activity reporting period'}).innerText(),/Activity from/);
 assert.match(await page.getByRole('region',{name:'Customer activity',exact:true}).innerText(),/0 total downloads/);
 await page.getByRole('button',{name:'View previous history',exact:true}).click();
 assert.match(await page.getByRole('region',{name:'Activity reporting period'}).innerText(),/Previous history/);
 assert.match(await page.getByRole('region',{name:'Customer activity',exact:true}).innerText(),/1 total downloads/);
 await page.getByRole('button',{name:'Back to current reporting',exact:true}).click();
 assert.match(await page.getByRole('region',{name:'Customer activity',exact:true}).innerText(),/0 total downloads/);
 for(const section of ['Overview','Revenue','Users','Purchases']){
  await page.getByRole('button',{name:section,exact:true}).click();
  assert.doesNotMatch(await page.locator('body').innerText(),/Decision Maker|Decision pass|Add-on active|with add-on/i);
  await page.screenshot({path:join(out,'admin-'+section.toLowerCase()+'.png'),fullPage:true});
 }
 // Ticket UI has been retired; keep licence-email records and other admin views usable.
 for(const width of [1440,600]){
  await page.setViewportSize({width,height:950});
  for(const section of ['Overview','Revenue','Users','Purchases','Licenses',...(width===1440?['Installation slots','Email delivery','Service health']:['Slots','Email','Health'])]){
   await page.getByRole('button',{name:section,exact:true}).first().click();
   assert.equal(await page.getByRole('button',{name:'Support',exact:true}).count(),0);
   assert.equal(await page.getByRole('region',{name:'Support inbox'}).count(),0);
   assert.equal(await page.locator('textarea').count(),0);
   assert.doesNotMatch(await page.locator('body').innerText(),/Open inbox|Needs reply|Customer messages|Review reply|ticket view/i);
  }
  await page.getByRole('button',{name:'Overview',exact:true}).first().click();
  await page.screenshot({path:join(out,'admin-'+width+'.png'),fullPage:true});
 }
 assert.deepEqual(supportRequests,[],'Dashboard must not poll the retired support API');
 assert.deepEqual(errors,[]);console.log('PASS desktop/mobile admin views, reporting and cache; ticket UI and polling removed; no renderer errors')
}finally{await browser.close();await new Promise(r=>server.close(r))}
