// Regression coverage for real crawler + queue + SQLite, isolated from customer data.
const {test} = require('node:test')
const assert = require('node:assert/strict')
const {mkdtempSync} = require('node:fs')
const {tmpdir} = require('node:os')
const {join} = require('node:path')
const {WebsiteEnricher, socialLinksFromHtml} = require('../dist-electron/enrichment/website.js')
const {EnrichmentRunner} = require('../dist-electron/enrichment/runner.js')
const {LocalDatabase} = require('../dist-electron/db/local-db.js')
const {Repository} = require('../dist-electron/db/repository.js')
const html = name => `<a href="https://instagram.com/${name}">Instagram</a>`
function response(url, body, status=200) { const result = new Response(body,{status}); Object.defineProperty(result,'url',{value:url}); return result }
function delay(ms, signal) { return new Promise((resolve,reject)=>{ if(signal?.aborted)return reject(signal.reason); const stop=()=>{clearTimeout(timer);reject(signal.reason)}; const timer=setTimeout(()=>{signal?.removeEventListener('abort',stop);resolve()},ms);signal?.addEventListener('abort',stop,{once:true}) }) }
async function mocked(fetcher, run) { const original=global.fetch;global.fetch=fetcher;try{return await run()}finally{global.fetch=original} }
function database() { const db=new LocalDatabase(join(mkdtempSync(join(tmpdir(),'mamalead-social-batch-')),'leads.db'));return {db,repo:new Repository(db),ws:db.ensureWorkspace().id} }

test('a healthy homepage taking over the former 3.5-second cutoff still returns its profiles', async()=>{
  await mocked(async(url,init)=>{await delay(3800,init.signal);return response(url,html('slowclinic'))},async()=>{
    const result=await new WebsiteEnricher().inspectSocialFast('https://slow.fixture.test/')
    assert.equal(result.error,null);assert.equal(result.socials[0].handle,'slowclinic')
  })
})
test('transient connection failure retries HTTP as HTTPS and clears the earlier error',async()=>{
  const requested=[]
  await mocked(async url=>{requested.push(url);if(requested.length===1)throw new TypeError('fetch failed');return response(url,html('recoveredclinic'))},async()=>{
    const result=await new WebsiteEnricher().inspectSocialFast('http://clinic.fixture.test/')
    assert.deepEqual(requested,['https://clinic.fixture.test/','https://www.clinic.fixture.test/'])
    assert.equal(result.error,null);assert.equal(result.socials.length,1)
  })
})
test('temporary 503 retries once; access denial stays an error without repeated requests',async()=>{
  let calls=0
  await mocked(async url=>response(url,++calls===1?'busy':html('recovered'),calls===1?503:200),async()=>{
    const result=await new WebsiteEnricher().inspectSocialFast('https://clinic.fixture.test/')
    assert.equal(calls,2);assert.equal(result.error,null);assert.equal(result.socials.length,1)
  })
  calls=0
  await mocked(async url=>{calls++;return response(url,'denied',403)},async()=>{
    const result=await new WebsiteEnricher().inspectSocialFast('https://clinic.fixture.test/')
    assert.equal(calls,1);assert.match(result.error,/HTTP 403/)
  })
})
test('a missing Maps location URL falls back to the same business homepage',async()=>{
  await mocked(async url=>response(url,url.endsWith('/missing')?'missing':html('clinic'),url.endsWith('/missing')?404:200),async()=>{
    const result=await new WebsiteEnricher().inspectSocialFast('https://clinic.fixture.test/missing')
    assert.equal(result.error,null);assert.equal(result.socials[0].handle,'clinic')
  })
})
test('hidden injected profile links are excluded; genuine visible links remain',()=>{
  const result=socialLinksFromHtml(`<marquee style="position:absolute;width:0px"><a href="https://x.com/unrelated">spam</a></marquee><div hidden>${html('hidden')}</div><div style="display:none">${html('hidden2')}</div>${html('clinic')}`,'https://clinic.fixture.test')
  assert.deepEqual(result.map(x=>x.handle),['clinic'])
})
test('50 sites complete with out-of-order progress, retry, one unavailable site and later successes',async()=>{
  const {db,repo,ws}=database(),events=[],attempts=new Map();let active=0,peak=0
  try{await mocked(async(url,init)=>{
    const name=new URL(url).hostname.replace(/^www\./,'').split('.')[0],n=Number(name.slice(4));attempts.set(n,(attempts.get(n)||0)+1)
    active++;peak=Math.max(peak,active)
    try{
      await delay(n===0?300:15,init.signal)
      if(n===1&&attempts.get(n)===1)throw new TypeError('fetch failed')
      return response(url,n===2?'denied':n===3?'<h1>No published profiles</h1>':html(name),n===2?403:200)
    }finally{active--}
  },async()=>{
    const urls=Array.from({length:50},(_,i)=>`https://site${i}.fixture.test`)
    const imported=repo.importWebsites(ws,urls,false),job=repo.queueJob(ws,'social',imported.leadIds)
    const runner=new EnrichmentRunner(db,repo,{onProgress:event=>{if(event.jobId===job.jobId)events.push(event)}})
    await runner.drain()
    const status=repo.jobStatus(ws,job.jobId)
    assert.equal(status.processed,50);assert.equal(status.total,50);assert.equal(status.failed,1);assert.equal(status.found,48)
    assert.equal(peak,3);assert.equal(attempts.get(1),2);assert.equal(attempts.get(2),1)
    assert.equal(status.outcomes[imported.leadIds[0]].status,'found')
    assert.equal(status.outcomes[imported.leadIds[2]].status,'error')
    assert.equal(status.outcomes[imported.leadIds[3]].status,'not-published')
    assert.equal(status.outcomes[imported.leadIds[49]].status,'found')
    assert.equal(Object.keys(status.outcomes).length,50)
    assert(events.some(e=>e.outcomes[imported.leadIds[1]]&&!e.outcomes[imported.leadIds[0]]),'later sites appear while the first site is still loading')
    assert(events.every((e,i)=>i===0||e.processed>=events[i-1].processed),'progress never goes backwards')
    assert(events.every(e=>e.processed===Object.keys(e.outcomes).length),'percentage matches actually completed rows')
    assert.deepEqual(status.activeLeadIds,[])
    assert.equal(db.one('select count(*) n from social_profiles').n,48)
    assert.equal(repo.jobTotals(ws).running,0);assert.equal(repo.jobTotals(ws).queued,0)
  })}finally{db.close()}
})
test('Stop aborts every in-flight website; the next scan can run normally',async()=>{
  const {db,repo,ws}=database();let active=0
  try{await mocked(async(url,init)=>{
    active++;try{await delay(url.includes('after')?5:5000,init.signal);return response(url,html('clinic'))}finally{active--}
  },async()=>{
    const imported=repo.importWebsites(ws,['https://one.fixture.test','https://two.fixture.test','https://three.fixture.test'],false)
    const job=repo.queueJob(ws,'social',imported.leadIds),runner=new EnrichmentRunner(db,repo)
    const pending=runner.drain();await delay(30);runner.stop(job.jobId);await pending
    assert.equal(active,0);assert.equal(repo.jobStatus(ws,job.jobId).status,'cancelled')
    const next=repo.importWebsites(ws,['https://after.fixture.test'],false),second=repo.queueJob(ws,'social',next.leadIds)
    await runner.drain();assert.equal(repo.jobStatus(ws,second.jobId).status,'done');assert.equal(repo.jobStatus(ws,second.jobId).found,1)
  })}finally{db.close()}
})

test('a site that never responds times out after its retry without trapping other sites',async()=>{
  const {db,repo,ws}=database(),events=[];const start=Date.now()
  try{await mocked(async(url,init)=>{
    if(url.includes('unavailable'))await delay(60000,init.signal)
    return response(url,html('clinic'))
  },async()=>{
    const imported=repo.importWebsites(ws,['https://unavailable.fixture.test','https://working.fixture.test','https://another.fixture.test'],false)
    const job=repo.queueJob(ws,'social',imported.leadIds),runner=new EnrichmentRunner(db,repo,{onProgress:e=>{if(e.jobId===job.jobId)events.push(e)}})
    await runner.drain()
    const status=repo.jobStatus(ws,job.jobId)
    assert.equal(status.processed,3);assert.equal(status.failed,1);assert.equal(status.found,2)
    assert.match(status.outcomes[imported.leadIds[0]].error,/too long/)
    assert(events.some(e=>e.processed===2&&e.activeLeadIds.includes(imported.leadIds[0])))
    // The homepage gets 12s and host fallback shares the 16s whole-site deadline.
    // Permit 1.5s of test scheduling overhead while preserving the concurrent-results assertion above.
    assert(Date.now()-start<17500,'a permanently unresponsive site respects its 16s whole-site budget')
  })}finally{db.close()}
})
