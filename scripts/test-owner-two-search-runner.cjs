const assert=require('node:assert/strict')
const {mkdtempSync}=require('node:fs'),{join}=require('node:path'),{tmpdir}=require('node:os')
const {LocalDatabase}=require('../dist-electron/db/local-db.js'),{Repository}=require('../dist-electron/db/repository.js')
const {EnrichmentRunner}=require('../dist-electron/enrichment/runner.js')
const {WebsiteEnricher}=require('../dist-electron/enrichment/website.js')
const db=new LocalDatabase(join(mkdtempSync(join(tmpdir(),'owner-two-search-')),'leads.db')),repo=new Repository(db),ws=db.ensureWorkspace().id
const originalFetch=global.fetch,queries=[],credits=[],events=[]
const runner=new EnrichmentRunner(db,repo,{authorize:async()=>{},deepKey:()=> 'fixture',consumeDecisionLead:async id=>credits.push(id),onProgress:p=>events.push(p)})
WebsiteEnricher.prototype.inspectPeople=async()=>{throw Error('Legacy crawler must not run')}
WebsiteEnricher.prototype.searchPublicWeb=async()=>{throw Error('Alternative search must not run')}
let slowStarted
async function main(){
 let fixtureDomain=''
 global.fetch=async(raw,options)=>{
  const url=new URL(String(raw))
  if(url.hostname==='api.dataforseo.com'){
   assert.equal(url.pathname,'/v3/serp/google/organic/live/advanced')
   const q=JSON.parse(options.body)[0].keyword;queries.push(q)
   if(q.includes('slow-owner.test')){slowStarted?.();await new Promise((_,reject)=>options.signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true}))}
   if(q.includes('error-owner.test'))return Response.json({tasks:[{status_code:50000,status_message:'Fixture provider unavailable'}]})
   const domain=(fixtureDomain=q.match(/([\w.-]+\.test)/)?.[1] || (q.match(/(named-owner|missing-owner|error-owner)/)?.[1]?q.match(/(named-owner|missing-owner|error-owner)/)[1]+'.test':fixtureDomain))
   const path=q.includes('Janet Cole')?'/contact':'/about'
   return Response.json({tasks:[{status_code:20000,result:[{items:domain.startsWith('empty-')?[]:[{type:'organic',title:'Owner',url:'https://'+domain+path,description:'Published source'}]}]}]})
  }
  assert.ok(url.hostname.endsWith('.test'))
  assert.ok(['/about','/contact'].includes(url.pathname),'Extra crawl')
  return new Response(url.pathname==='/about'?'<article><h2>Janet Cole</h2><p>Founder</p></article>':url.hostname==='named-owner.test'?'<p>Janet Cole</p><a href="mailto:janet@named-owner.test">Email Janet</a>':'<p>No owner email here</p>')
 }
 const ids=repo.importWebsites(ws,['named-owner.test','missing-owner.test','error-owner.test'],false).leadIds
 for(const id of ids.slice(1))repo.addDecisionMaker({workspaceId:ws,leadId:id,fullName:'Old Owner',title:'Founder',email:'old@previous.test',source:'https://previous.test/about'})
 const job=repo.queueJob(ws,'decision-maker',ids);await runner.drain();const status=repo.jobStatus(ws,job.jobId)
 assert.equal(status.status,'failed');assert.equal(status.processed,3);assert.equal(status.found,1);assert.equal(status.failed,1)
 assert.deepEqual(Object.values(status.outcomes).map(r=>r.searches),[2,6,1]);assert.deepEqual(Object.values(status.outcomes).map(r=>r.status),['found','not-published','error']);assert.deepEqual(credits,ids)
 assert.ok(!repo.decisionMakerLedger(ws).some(p=>p.lead_id===ids[1]&&p.email));assert.ok(repo.decisionMakerLedger(ws).some(p=>p.lead_id===ids[2]&&p.full_name==='Old Owner'))
 assert.ok(events.some(p=>p.message.startsWith('Search 3 ·')))
 const batch=repo.importWebsites(ws,Array.from({length:50},(_,i)=>`empty-${i}.test`),false).leadIds
 const large=repo.queueJob(ws,'decision-maker',batch);await runner.drain();const complete=repo.jobStatus(ws,large.jobId)
 assert.equal(complete.total,50);assert.equal(complete.processed,50);assert.equal(Object.keys(complete.outcomes).length,50)
 const deepId=repo.importWebsites(ws,['empty-deep.test'],false).leadIds[0],deep=repo.queueJob(ws,'deep',[deepId]);await runner.drain();assert.equal(repo.jobStatus(ws,deep.jobId).outcomes[deepId].searches,4)
 const stopIds=repo.importWebsites(ws,['slow-owner.test','empty-never.test'],false).leadIds,stopJob=repo.queueJob(ws,'decision-maker',stopIds)
 const started=new Promise(resolve=>{slowStarted=resolve}),running=runner.drain();await started;runner.stop(stopJob.jobId);await running
 assert.equal(repo.jobStatus(ws,stopJob.jobId).status,'cancelled');assert.ok(!queries.some(q=>q.includes('empty-never.test')))
 console.log(JSON.stringify({passed:true,checks:['all owner entry points use bounded adaptive searches','exact query and one-per-company credit counts','per-business outcomes persist','stale successful results replaced; errors preserve saved data','50 imported leads all processed','Stop cancels in-flight API and skips remaining leads','no legacy crawler or alternate search'],requests:queries.length},null,2))
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>{global.fetch=originalFetch;db.close()})
