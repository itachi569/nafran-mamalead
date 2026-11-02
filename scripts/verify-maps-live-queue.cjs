const assert=require('node:assert/strict'),{mkdtempSync}=require('node:fs'),{tmpdir}=require('node:os'),{join}=require('node:path')
const {LocalDatabase}=require('../dist-electron/db/local-db.js'),{Repository}=require('../dist-electron/db/repository.js')
const {EnrichmentRunner}=require('../dist-electron/enrichment/runner.js'),{WebsiteEnricher}=require('../dist-electron/enrichment/website.js')
;(async()=>{
 const db=new LocalDatabase(join(mkdtempSync(join(tmpdir(),'maps-live-queue-')),'leads.db')),repo=new Repository(db),ws=db.ensureWorkspace().id
 const at=new Date().toISOString(),visited=[]
 const original=WebsiteEnricher.prototype.inspectContactFast
 WebsiteEnricher.prototype.inspectContactFast=async url=>{visited.push(url);return{emails:[{value:'hello@'+new URL(url).hostname,page:url+'/contact',score:80}],phones:[],socials:[],people:[],pagesRead:[url],error:null}}
 const add=(index,placeRef='place-'+index)=>repo.saveRun(ws,{runId:'live',provider:'chromium-maps',status:'running',keywords:['software house'],location:'Lahore',maxResultsPerKeyword:10,detail:true,durationMs:0,startedAt:at,finishedAt:null,error:null,leads:[{name:'Business '+index,website:'https://business-'+index+'.mamalead-qa.org',address:index+' Lahore',placeRef}]})
 try{
  const first=add(1),firstId=first.leadIds[0]
  assert.ok(firstId);assert.equal(add(1).leadIds[0],firstId,'streamed/final lead resolves to saved identity')
  const initial=repo.queueMapsEmails(ws,'live')
  let release;const authorization=new Promise(resolve=>release=resolve)
  const runner=new EnrichmentRunner(db,repo,{authorize:async()=>authorization})
  const draining=runner.drain()
  assert.equal(repo.jobStatus(ws,initial.jobId).status,'running','claim before awaiting authorization')
  add(2);const waiting=repo.queueMapsEmails(ws,'live')
  assert.notEqual(waiting.jobId,initial.jobId,'new row cannot append to an already selected snapshot')
  add(3);const merged=repo.queueMapsEmails(ws,'live')
  assert.equal(merged.jobId,waiting.jobId,'backlog stays in one queued batch')
  assert.equal(repo.queueMapsEmails(ws,'live').queued,0,'checkpoints do not duplicate work')
  release();await draining
  assert.equal(visited.length,3);assert.equal(new Set(visited).size,3)
  assert.equal(repo.listContacts(ws,'email').length,3,'emails saved before the Maps run is done')
  assert.equal(repo.listRuns(ws,1)[0].status,'running')
  assert.equal(repo.queueMapsEmails(ws,'live').queued,0,'finalization does not rescan existing contacts')
  const noRef=add(4,'');assert.equal(add(4,'').leadIds[0],noRef.leadIds[0],'identity also stable when Google omits a place ID')
  console.log('PASS live Maps email queue: bounded batches, authorization race, no duplicate scans, stable saved identities, all 3 emails persisted while Maps is running')
 }finally{WebsiteEnricher.prototype.inspectContactFast=original;db.close()}
})().catch(error=>{console.error(error);process.exitCode=1})
