// Isolated regression tests for the remaining v1.4.21 report. Never touches a customer profile.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os')
const {LocalDatabase}=require('../dist-electron/db/local-db.js'),{Repository}=require('../dist-electron/db/repository.js')
const {WebsiteEnricher}=require('../dist-electron/enrichment/website.js'),{EnrichmentRunner}=require('../dist-electron/enrichment/runner.js')
const {readWebsitePage}=require('../dist-electron/enrichment/http-page.js')
const {localDate}=require('../dist-electron/local-date.js')
const {buildFormattedExport}=require('../dist-electron/export/writer.js')
const ExcelJS=require('exceljs')
const folder=fs.mkdtempSync(path.join(os.tmpdir(),'mamalead-qa-1422-'))
function tsModule(file){
 const code=require('esbuild').buildSync({entryPoints:[path.resolve(file)],bundle:true,platform:'node',format:'cjs',write:false}).outputFiles[0].text
 const mod={exports:{}};new Function('module','exports','require',code)(mod,mod.exports,require);return mod.exports
}
function response(url,html,status=200){const r=new Response(html,{status});Object.defineProperty(r,'url',{value:url});return r}
async function withFetch(fn,work){const old=global.fetch;global.fetch=fn;try{return await work()}finally{global.fetch=old}}
const delay=(ms,signal)=>new Promise((resolve,reject)=>{
 const done=()=>{clearTimeout(timer);signal.removeEventListener('abort',abort);resolve()}
 const abort=()=>{clearTimeout(timer);reject(signal.reason)}
 const timer=setTimeout(done,ms);signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort()
})
async function main(){
 const began=Date.now()
 await withFetch(async(url,{signal})=>{await delay(7000,signal);return response(url,'<a href="mailto:hello@slow.test">Email</a>')},async()=>{
  const page=await readWebsitePage('http://slow.test',{signal:new AbortController().signal,home:true,timeoutMs:5000})
  assert.equal(page.url,'https://slow.test/');assert.ok(Date.now()-began>=6900)
 })
 const timeout=AbortSignal.timeout,deadlines=[],requests=[]
 AbortSignal.timeout=ms=>{deadlines.push(ms);return timeout(15)}
 try{
  await withFetch(async(url,{signal})=>{
   requests.push(url);if(requests.length===1)await delay(1000,signal)
   return response(url,'HTTP fallback failed',500)
  },async()=>await assert.rejects(readWebsitePage('http://slow.test',{signal:new AbortController().signal,home:true}),/too long.*HTTPS/))
  assert.deepEqual(deadlines,[12000,5000,5000])
 }finally{AbortSignal.timeout=timeout}
 let calls=0
 await withFetch(async()=>{calls++;throw Object.assign(new Error('fetch failed'),{cause:{code:'CERT_HAS_EXPIRED'}})},async()=>await assert.rejects(readWebsitePage('http://bad-cert.test',{signal:new AbortController().signal,home:true}),/certificate/))
 assert.equal(calls,1)
 const stop=new AbortController()
 await withFetch(async(_url,{signal})=>{stop.abort(new Error('User stopped'));await delay(1,signal)},async()=>await assert.rejects(readWebsitePage('http://cancel.test',{signal:stop.signal,home:true}),/User stopped/))
 console.log('PASS ML-58: real seven-second HTTPS response, bounded fallbacks, truthful primary timeout, TLS and Stop')

 const {importPreview,websiteListFromCsv}=tsModule('src/app/website-import.ts')
 const preview=importPreview('oladoc.com\nyoutube.com\nhttps://facebook.com/clinic\nclinic.test\nhttps://clinic.test/')
 assert.equal(preview.sites.length,1);assert.equal(preview.invalid,3);assert.equal(preview.duplicates,1)
 assert.ok(preview.rows.filter(row=>row.status==='Skipped').every(row=>row.reason))
 assert.equal(importPreview('https://facebook.com/clinic',true).profiles.length,1)
 assert.equal(importPreview('youtube.com',true).profiles.length,0)
 assert.equal(websiteListFromCsv('Website\noladoc.com\nyoutube.com\nclinic.test').preview.sites.length,1)
 const {coveragePins}=tsModule('src/app/coverage-pins.ts')
 const points=Array.from({length:50},(_,i)=>({id:String(i),name:'Clinic '+i,latitude:31+i/100,longitude:74+i/100}))
 let pins=coveragePins(points)
 assert.equal(pins.reduce((n,p)=>n+p.count,0),50);assert.equal(new Set(pins.flatMap(p=>p.ids)).size,50)
 assert.ok(pins.length<=24)
 pins=coveragePins(points.map(point=>({...point,latitude:31,longitude:74})))
 assert.equal(pins.length,1);assert.equal(pins[0].count,50)
 assert.deepEqual(coveragePins([{...points[0],latitude:null}]),[])
 console.log('PASS ML-15/75: every geocoded lead represented; coincident locations cluster; import preview rejects directories/social roots')

 const file=path.join(folder,'leads.db');let db=new LocalDatabase(file),repo=new Repository(db),ws=db.ensureWorkspace().id
 assert.throws(()=>repo.startWebsiteLookup(ws,['oladoc.com','youtube.com'],{email:true,phone:false,social:false,address:false}),/business website/)
 assert.equal(repo.listLeads(ws).total,0);assert.equal(repo.listImports(ws).length,0,'nested import rolls back fully')
 const existing=repo.importWebsites(ws,Array.from({length:4},(_,i)=>'site'+i+'.test'),false).leadIds
 for(const id of existing){
  const job=repo.queueJob(ws,'social',[id]);repo.markJob(job.jobId,'failed',0,'Old error')
  repo.saveJobProgress(job.jobId,{processed:1,total:1,found:0,failed:1,outcomes:{[id]:{status:'error',searches:0,error:'Old error'}}})
 }
 const oldInspect=WebsiteEnricher.prototype.inspectContactFast,oldClose=WebsiteEnricher.prototype.close
 WebsiteEnricher.prototype.inspectContactFast=async url=>({
  canonicalWebsite:url,emails:[],phones:[],people:[],
  socials:url.includes('site0.')?[{platform:'facebook',handle:'clinic',profileUrl:'https://facebook.com/clinic',page:url}]:[],
  pagesRead:url.includes('site0.')?[url]:[],error:url.includes('site0.')?null:'DNS address could not be found'
 })
 WebsiteEnricher.prototype.close=async()=>{}
 let session
 try{
  session=repo.startWebsiteLookup(ws,Array.from({length:6},(_,i)=>'site'+i+'.test'),{email:false,phone:false,social:true,address:false})
  await new EnrichmentRunner(db,repo).drain()
 }finally{WebsiteEnricher.prototype.inspectContactFast=oldInspect;WebsiteEnricher.prototype.close=oldClose}
 assert.equal(repo.listLeads(ws).total,4,'new unreadable placeholders removed; previous saved leads retained')
 const result=repo.websiteLookupSession(ws,session.jobId)
 assert.equal(result.rows.length,6);assert.equal(result.rows.filter(row=>row.status==='failed').length,5)
 const batch=repo.listImports(ws).find(item=>item.job_id===session.jobId)
 assert.equal(batch.added,0);assert.equal(batch.reused,4);assert.equal(batch.scan_found,1);assert.equal(batch.scan_failed,5)
 assert.equal(repo.scanOutcomes(ws,'social')[existing[0]].status,'found')
 assert.equal(repo.scanOutcomes(ws,'social')[existing[1]].status,'error')
 let diagnostics=JSON.parse(repo.recentScanErrors(ws,'site5.test'))
 assert.equal(diagnostics[0].domain,'site5.test');assert.match(diagnostics[0].error,/DNS/)
 assert.ok(!diagnostics.some(item=>item.domain==='site0.test'),'new success clears stale failure')
 const partial=repo.queueJob(ws,'website',[existing[0]],{fields:{email:true,phone:false,social:false,address:false}})
 repo.markJob(partial.jobId,'done',0)
 repo.saveJobProgress(partial.jobId,{processed:1,total:1,found:0,failed:0,outcomes:{[existing[0]]:{status:'not-published',searches:0}},fieldFindings:{[existing[0]]:{email:false}}})
 assert.equal(repo.scanOutcomes(ws,'social')[existing[0]].status,'found','unselected field does not replace social result')
 assert.equal(repo.scanOutcomes(ws,'email')[existing[0]].status,'not-published','do not infer an email from another field')
 const freshFail=repo.queueJob(ws,'social',[existing[0]])
 repo.markJob(freshFail.jobId,'failed',0,'New HTTP 403')
 repo.saveJobProgress(freshFail.jobId,{processed:1,total:1,found:0,failed:1,outcomes:{[existing[0]]:{status:'error',searches:0,error:'New HTTP 403'}}})
 assert.equal(repo.scanOutcomes(ws,'social')[existing[0]].status,'error')
 assert.match(repo.recentScanErrors(ws,'site0.test'),/New HTTP 403/)
 db.close();db=new LocalDatabase(file);repo=new Repository(db)
 assert.equal(repo.websiteLookupSession(ws,session.jobId).rows.length,6,'failure snapshots survive restart')
 assert.equal(JSON.parse(repo.recentScanErrors(ws,'site5.test'))[0].domain,'site5.test')
 const manual=repo.startWebsiteLookup(ws,['manual.test'],{email:false,phone:false,social:true,address:false})
 repo.upsertContact({leadId:manual.rows[0].leadId,kind:'email',value:'manual@manual.test',source:'manual'})
 repo.discardFailedImport(manual.jobId,manual.rows[0].leadId)
 assert.ok(repo.getLead(ws,manual.rows[0].leadId),'never remove manual/user data')
 repo.markJob(manual.jobId,'failed',0,'Cancelled by user')
 assert.deepEqual(db.query('pragma foreign_key_check'),[])
 console.log('PASS ML-62/74/75/78: current per-field outcomes, persisted domain errors, rollback safeguards, six failure snapshots and truthful history')

 for(const status of ['done','failed','cancelled'])repo.saveRun(ws,{provider:'chromium-maps',status,keywords:['dentist'],location:'Lahore',maxResultsPerKeyword:20,detail:true,durationMs:100,startedAt:new Date().toISOString(),finishedAt:new Date().toISOString(),error:status==='failed'?'network':null,leads:[]})
 const counts=repo.runCounts(ws);assert.equal(counts.runs,3);assert.equal(counts.clean,1);assert.equal(counts.failed,1);assert.equal(counts.stopped,1)
 const at='2026-10-31T19:30:00.000Z'
 assert.equal(localDate(at,'Asia/Karachi'),'2026-11-01');assert.equal(localDate(at,'America/Los_Angeles'),'2026-10-31')
 const RealDate=Date,oldTZ=process.env.TZ;process.env.TZ='Asia/Karachi'
 global.Date=class extends RealDate{constructor(...args){super(...(args.length?args:[at]))}static now(){return new RealDate(at).getTime()}}
 try{
  const exp=await buildFormattedExport(repo,ws,{kind:'website',format:'xlsx',lookupJobId:session.jobId,columns:['Business name','Website','Status','Error'],limit:10,separator:','})
  const book=new ExcelJS.Workbook();await book.xlsx.load(exp.content)
  assert.match(book.worksheets[0].getCell(2,1).value,/2026-11-01/)
  assert.equal(exp.rows,6);fs.writeFileSync(path.join(folder,'lookup.xlsx'),exp.content)
 }finally{global.Date=RealDate;if(oldTZ===undefined)delete process.env.TZ;else process.env.TZ=oldTZ}
 db.close()
 console.log('PASS ML-19/76: done/stopped/failed counts, timezone boundary and real XLSX date with all six scan rows')
 console.log('QA artifacts: '+folder)
}
main().catch(error=>{console.error(error);process.exitCode=1})
