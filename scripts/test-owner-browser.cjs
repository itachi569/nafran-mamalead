const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os')
const {GoogleOwnerBrowser,readGoogleResults}=require('../dist-electron/enrichment/google-browser.js')
const {LocalDatabase}=require('../dist-electron/db/local-db.js'),{Repository}=require('../dist-electron/db/repository.js'),{EnrichmentRunner}=require('../dist-electron/enrichment/runner.js')
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'mamalead-browser-test-')),events=[],browser=new GoogleOwnerBrowser(path.join(temp,'chrome'),s=>events.push(s))
const {findOwnerContact}=require('../dist-electron/enrichment/owner-search.js')
const originalFetch=global.fetch,checks=[]
async function main(){
 await browser.open();const page=browser.page,context=page.context();assert.ok(browser.status().open)
 assert.ok(!browser.child.spawnargs.some(a=>/enable-automation|AutomationControlled/.test(a)))
 const searches=[];let mode='normal'
 const result=(url,title='Northstar founder')=>`<div class="result"><a href="${url}"><h3>${title}</h3></a><p>Published company contact details.</p></div>`
 await context.route('https://www.google.com/**',async route=>{
  const u=new URL(route.request().url());const q=u.searchParams.get('q');if(q)searches.push(q)
  const html=mode==='blocked'?'<form id="captcha-form">Verify you are human</form>':mode==='empty'?'<p>Your search did not match any documents</p>':mode==='unknown'?'<p>Unexpected result page</p>':result('https://northstar.test/'+(q?.startsWith('Janet')?'contact':'about'))+result('https://www.google.com/ignore','Ignored')+`<section data-text-ad>${result('https://ads.test','Sponsored')}</section><section><h2>AI Overview</h2><p>Invented email wrong@northstar.test</p><a href="https://northstar.test/ai">Source</a></section>`
  await route.fulfill({contentType:'text/html',body:html})
 })
 const signal=new AbortController().signal
 await page.goto('https://www.google.com/search?q=fixture')
 const parsed=await readGoogleResults(page);assert.equal(parsed.hits.length,2);assert.ok(!JSON.stringify(parsed.hits).includes('wrong@'));assert.ok(parsed.hits.find(h=>h.aiOverview));checks.push('Organic and AI source links parsed; ads, Google navigation and generated emails excluded')
 global.fetch=async url=>{
  assert.match(String(url),/^https:\/\/northstar\.test\//,'No API request or unrelated source')
  return new Response(String(url).endsWith('/contact')?'<p>Janet Cole</p><a href="mailto:janet@northstar.test">Email Janet</a>':'<article><h2>Janet Cole</h2><p>Founder of Northstar.</p></article>')
 }
 searches.length=0
 const owner=await findOwnerContact({name:'Northstar',website:'https://northstar.test'},{search:(q,s)=>browser.search(q,s)})
 assert.equal(owner.error,null);assert.equal(owner.people[0].email,'janet@northstar.test');assert.equal(searches.length,2);assert.match(searches[1],/^Janet Cole owner of/);checks.push('Real Chrome DOM → two queries → publicly sourced owner email, with no API key')
 mode='blocked';const blocked=new AbortController(),start=Date.now();const pending=browser.search('blocked',blocked.signal)
 while(browser.status().phase!=='verification')await new Promise(r=>setTimeout(r,25))
 blocked.abort();await assert.rejects(pending,{name:'AbortError'});assert.ok(Date.now()-start<4000);checks.push('CAPTCHA pauses for user; Stop cancels promptly without bypass or Not published')
 const resume=browser.search('resume',signal)
 while(browser.status().phase!=='verification')await new Promise(r=>setTimeout(r,25))
 mode='normal';await page.goto('https://www.google.com/search?q=resume');assert.equal((await resume).hits.length,2);checks.push('User-completed Google check resumes the same query')
 mode='empty';assert.deepEqual((await browser.search('empty',signal)).hits,[]);checks.push('Genuine empty results distinguished from blocked or unreadable pages')
 // Fake test session exists only in this disposable profile, never the user's profile.
 await context.addCookies([{name:'SID',value:'fixture-only',domain:'.google.com',path:'/',secure:true,expires:Math.floor(Date.now()/1000)+3600}])
 await browser.prepare(signal,()=>{});assert.ok(await browser.signedIn());await browser.close();await browser.open();assert.ok(await browser.signedIn());checks.push('Dedicated profile survives browser restart')
 await browser.close()
 const db=new LocalDatabase(path.join(temp,'leads.db')),repo=new Repository(db),ws=db.ensureWorkspace().id,credits=[],queries=[]
 const runner=new EnrichmentRunner(db,repo,{authorize:async()=>{},prepareOwnerSearch:async()=>{},ownerSearch:async q=>{queries.push(q);return {hits:[],error:'MamaLead Chrome was closed. Open it and retry.'}},consumeDecisionLead:async id=>credits.push(id)})
 const ids=repo.importWebsites(ws,['northstar.test','other.test'],false).leadIds,job=repo.queueJob(ws,'decision-maker',ids);await runner.drain();const status=repo.jobStatus(ws,job.jobId)
 assert.equal(status.status,'failed');assert.equal(status.processed,1);assert.equal(status.total,2);assert.equal(credits.length,1);assert.equal(queries.length,1);checks.push('Closed browser stops batch; remaining companies are unscanned and uncharged')
 const gated=new EnrichmentRunner(db,repo,{authorize:async()=>{},prepareOwnerSearch:async()=>{throw Error('Sign in first')},ownerSearch:async()=>{throw Error('Must not search')},consumeDecisionLead:async id=>credits.push(id)})
 repo.queueJob(ws,'decision-maker',[ids[1]]);await gated.drain();assert.equal(credits.length,1);db.close();checks.push('Sign-in setup occurs before consuming credits')
 console.log(JSON.stringify({passed:true,checks},null,2))
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{global.fetch=originalFetch;await browser.close()})
