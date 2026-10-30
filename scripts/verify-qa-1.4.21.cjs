const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os')
const {LocalDatabase}=require('../dist-electron/db/local-db.js'),{Repository}=require('../dist-electron/db/repository.js')
const {WebsiteEnricher}=require('../dist-electron/enrichment/website.js')
const {EnrichmentRunner}=require('../dist-electron/enrichment/runner.js')
const {readWebsitePage}=require('../dist-electron/enrichment/http-page.js')
const {cleanWebsiteUrl}=require('../dist-electron/website-domain.js')
const {directoryScanError}=require('../dist-electron/enrichment/source-policy.js')
const {phoneInfo}=require('../dist-electron/phone-format.js')
const {readWebsiteFile}=require('../dist-electron/imports/website-file.js')
const {buildFormattedExport}=require('../dist-electron/export/writer.js')
const ExcelJS=require('exceljs')
const folder=fs.mkdtempSync(path.join(os.tmpdir(),'mamalead-qa-1421-'))
function response(url,html,status=200){const r=new Response(html,{status,headers:{'content-type':'text/html'}});Object.defineProperty(r,'url',{value:url});return r}
async function withFetch(fn,work){const old=global.fetch;global.fetch=fn;try{return await work()}finally{global.fetch=old}}
async function main(){
 let seen=[]
 await withFetch(async url=>{seen.push(url);return response(url,'<a href="mailto:hello@clinic.test">Email</a>')},async()=>{
  const result=await new WebsiteEnricher().inspectContactFast('http://clinic.test/?utm_source=maps',undefined,true)
  assert.equal(result.error,null);assert.equal(result.emails[0].value,'hello@clinic.test')
  assert.equal(seen[0],'https://clinic.test/');assert.equal(result.canonicalWebsite,'https://clinic.test/')
 })
 seen=[]
 await withFetch(async url=>{seen.push(url);return response(url,url.includes('www.')?'OK':'broken',url.includes('www.')?200:500)},async()=>{
  const result=await readWebsitePage('http://clinic.test',{signal:new AbortController().signal,home:true})
  assert.equal(result.url,'https://www.clinic.test/');assert.equal(seen.length,2)
 })
 await withFetch(async url=>response(url,'denied',403),async()=>{await assert.rejects(readWebsitePage('http://clinic.test',{signal:new AbortController().signal,home:true}),/HTTP 403/)})
 assert.equal(cleanWebsiteUrl('http://clinic.test/contact?utm_campaign=x&gclid=y&office=2#email'),'http://clinic.test/contact?office=2')
 for(const url of ['https://facebook.com/clinic','https://wa.me/923001234567','https://oladoc.com/clinic','https://lovable.app'])assert.ok(directoryScanError(url))
 for(const url of ['https://clinic.lovable.app','https://clinic.github.io','https://clinic.wixsite.com/contact'])assert.equal(directoryScanError(url),null)
 assert.equal(phoneInfo('+924235761234').area,'042');assert.equal(phoneInfo('+922135761234').area,'021');assert.equal(phoneInfo('+923001234567').mobile,true)
 console.log('PASS HTTPS-first, www retry, canonical URL, blocked access, tracking cleanup, social/builder policy and Pakistani landlines')
 const file=path.join(folder,'leads.db');let db=new LocalDatabase(file),repo=new Repository(db),ws=db.ensureWorkspace().id
 const imp=repo.importWebsites(ws,['clinic.test','empty.test','failed.test'],false),[good,empty,failed]=imp.leadIds
 const noSite=repo.importWebsites(ws,['nosite.test'],false).leadIds[0];db.run("update leads set website='' where id=?",[noSite])
 const inspect=WebsiteEnricher.prototype.inspectPhoneFast,close=WebsiteEnricher.prototype.close
 WebsiteEnricher.prototype.inspectPhoneFast=async url=>({canonicalWebsite:url,emails:[],phones:url.includes('clinic')?[{value:'+924235761234',page:url,score:90}]:[],socials:[],people:[],pagesRead:[url],error:url.includes('failed')?'HTTP 500':null})
 WebsiteEnricher.prototype.close=async()=>{}
 try{
  const job=repo.queueJob(ws,'phone',[good,empty,failed,noSite])
  assert.equal(repo.scanOutcomes(ws,'phone')[good].status,'pending')
  await new EnrichmentRunner(db,repo).drain()
  const state=repo.jobStatus(ws,job.jobId);assert.equal(state.status,'done');assert.equal(state.failed,1);assert.equal(state.processed,4)
  assert.deepEqual([good,empty,failed,noSite].map(id=>repo.scanOutcomes(ws,'phone')[id].status),['found','not-published','error','skipped'])
 }finally{WebsiteEnricher.prototype.inspectPhoneFast=inspect;WebsiteEnricher.prototype.close=close}
 const before=repo.getLead(ws,good).score
 const email=repo.upsertContact({leadId:good,kind:'email',value:'hello@clinic.test',source:'https://clinic.test/',verified:false,score:80})
 assert.ok(repo.getLead(ws,good).score>before)
 assert.equal(repo.getLead(ws,good).score,db.one('select score from leads where id=?',[good]).score)
 const exported=await buildFormattedExport(repo,ws,{kind:'leads',format:'xlsx',separator:',',columns:['Business name','Domain','Rating','Score','Phone','Email'],leadIds:[good],limit:50,scope:'filtered'})
 const book=new ExcelJS.Workbook();await book.xlsx.load(exported.content)
 const sheet=book.worksheets[0];let scoreCell
 sheet.eachRow(row=>{if(row.getCell(2).value==='clinic.test')scoreCell=row.getCell(4)})
 assert.equal(typeof scoreCell.value,'number')
 const imported=await readWebsiteFile('own-export.xlsx',exported.content);assert.ok(imported.content.includes('clinic.test'))
 const merged=new ExcelJS.Workbook(),s=merged.addWorksheet('Sites');s.mergeCells('A1:D2');s.getCell('A1').value='MamaLead';s.getCell('A4').value='Domain';s.getCell('A5').value={text:'',hyperlink:'https://clinic.test'};s.getCell('A6').value=null
 assert.ok((await readWebsiteFile('merged.xlsx',await merged.xlsx.writeBuffer())).content.includes('clinic.test'))
 console.log('PASS durable mixed scan outcomes, stored score parity, numeric XLSX and real branded/merged XLSX round trip')
 // Seed a pre-upgrade polluted row without running the new import policy.
 db.run('update leads set website=? where id=?',['https://facebook.com/clinic',empty])
 repo.upsertContact({leadId:empty,kind:'email',value:'manual@clinic.test',source:'manual'})
 repo.upsertContact({leadId:empty,kind:'phone',value:'+12025550123',source:'https://facebook.com/other'})
 db.run("delete from app_data_migrations where name='quality-1.4.21'")
 db.close();db=new LocalDatabase(file);repo=new Repository(db)
 assert.equal(repo.getLead(ws,empty).website,'')
 assert.equal(repo.listContacts(ws,'phone',[empty]).length,0)
 assert.equal(repo.listContacts(ws,'email',[empty])[0].value,'manual@clinic.test')
 assert.ok(repo.listSocialProfiles(ws,[empty]).some(x=>x.profile_url.includes('/clinic')))
 assert.ok(db.one('select count(*) n from data_quality_repairs').n>=2)
 const archives=db.one('select count(*) n from data_quality_repairs').n
 db.close();db=new LocalDatabase(file);repo=new Repository(db)
 assert.equal(db.one('select count(*) n from data_quality_repairs').n,archives)
 assert.equal(db.query('pragma foreign_key_check').length,0)
 db.close()
 console.log('PASS upgrade cleanup preserves manual contacts and source archives; idempotent restart and foreign keys')
 // Exercise real billing client with an isolated encrypted-token directory and fake transport.
 const Module=require('node:module'),load=Module._load
 Module._load=function(name,...args){if(name==='electron')return {app:{isPackaged:false,getPath:()=>folder},safeStorage:{isEncryptionAvailable:()=>true,encryptString:Buffer.from,decryptString:b=>b.toString()}};return load.call(this,name,...args)}
 let client;delete require.cache[require.resolve('../dist-electron/billing/client.js')];try{client=require('../dist-electron/billing/client.js')}finally{Module._load=load}
 let assistCalls=0,trialCalls=0
 await withFetch(async(url,opts)=>{
  const pathname=new URL(url).pathname
  if(pathname==='/v1/installations')return Response.json({token:'A'.repeat(43)})
  if(pathname==='/v1/status')return Response.json({connected:true,lifetime:{active:true}})
  if(pathname==='/v1/trial'){trialCalls++;return Response.json({})}
  if(pathname==='/v1/assist/chat'){assistCalls++;return assistCalls===1?new Response('<html>Gateway</html>',{status:502}):Response.json({text:'Ready.',model:'test'})}
  throw new Error('Unexpected URL')
 },async()=>{
  await assert.rejects(client.billingRequestTrial('qa@fixture.test',true),/Lifetime access is already active/)
  assert.equal(trialCalls,0)
  assert.equal((await client.billingAssistChat({messages:[]})).text,'Ready.');assert.equal(assistCalls,2)
 })
 await withFetch(async()=>new Response('<html>Gateway</html>',{headers:{'content-type':'text/html'}}),async()=>{await assert.rejects(client.billingAssistChat({}),/unexpected response/)} )
 console.log('PASS main-process Lifetime trial guard; Assist HTML errors and bounded gateway retry')
 console.log('QA artifacts: '+folder)
}
main().catch(e=>{console.error(e);process.exitCode=1})
