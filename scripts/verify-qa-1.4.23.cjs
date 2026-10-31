const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os')
const {LocalDatabase}=require('../dist-electron/db/local-db.js'),{Repository}=require('../dist-electron/db/repository.js')
const {WebsiteEnricher,contactFindingsFromHtml,socialLinksFromHtml}=require('../dist-electron/enrichment/website.js')
const {EnrichmentRunner}=require('../dist-electron/enrichment/runner.js')
const {parseMailVerifierResponse,parseApifyEmailResult}=require('../dist-electron/email-verifier.js')
const {parseLeadsAngelResult}=require('../dist-electron/leadsangel.js')
const {precheckEmail,isRoleEmail}=require('../dist-electron/email-precheck.js')
const {canonicalSocialProfile,primarySocialProfiles}=require('../dist-electron/social-profile.js')
const {resolvePublishedShareLinks}=require('../dist-electron/enrichment/social-redirects.js')
const {readWebsitePage}=require('../dist-electron/enrichment/http-page.js')
const {plural}=require('../dist-electron/plural.js')
const fields={email:false,phone:false,social:true,address:false}
async function main(){
 for(const message of ['Email is not deliverable','Not-deliverable - mailbox disabled','No MX records found','Domain does not accept mail','Mailbox unavailable'])assert.equal(parseMailVerifierResponse('a@b.com',{response:message}).status,'invalid',message)
 assert.equal(parseMailVerifierResponse('a@b.com',{status:'invalid',response:'deliverable'}).verified,false)
 for(const flag of ['disposable','isCatchAll','catchAll','role']){
  assert.equal(parseApifyEmailResult('a@b.com',{status:'valid',[flag]:true,score:99}).status,'risky')
  assert.equal(parseLeadsAngelResult('a@b.com',{status:'safe',[flag]:true}).verified,false)
 }
 assert.equal(parseLeadsAngelResult('a@b.com',{status:'unsafe',reason:'disposable'}).status,'risky')
 assert.equal(parseLeadsAngelResult('a@b.com',{status:'safe',reason:'accepted'}).status,'valid')
 console.log('PASS ML-83/84: negative verdicts and risk flags never become Valid')

 let dnsCalls=0
 const resolver=(mx=[],a=[],aaaa=[],error)=>({cancel(){},async resolveMx(){dnsCalls++;if(error)throw Object.assign(new Error(error),{code:error});return mx},async resolve4(){return a},async resolve6(){return aaaa}})
 assert.equal((await precheckEmail('person@gmial.com',undefined,resolver())).status,'risky');assert.equal(dnsCalls,0)
 assert.match((await precheckEmail('person@gmial.com',undefined,resolver())).message,/person@gmail.com/)
 assert.equal((await precheckEmail('a@no-mail-1423.test',undefined,resolver())).status,'invalid')
 assert.equal((await precheckEmail('a@null-mx-1423.test',undefined,resolver([{exchange:'.',priority:0}]))).status,'invalid')
 assert.equal(await precheckEmail('a@mx-1423.test',undefined,resolver([{exchange:'mail.mx-1423.test',priority:10}])),null)
 assert.equal(await precheckEmail('a@implicit-1423.test',undefined,resolver([],['192.0.2.1'])),null)
 assert.equal((await precheckEmail('a@timeout-1423.test',undefined,resolver([],[],[],'ETIMEOUT'))).status,'unknown')
 const before=dnsCalls;await precheckEmail('b@mx-1423.test',undefined,resolver());assert.equal(dnsCalls,before,'domain DNS cache')
 assert.ok(isRoleEmail('info@clinic.test'));assert.ok(!isRoleEmail('sam@clinic.test'))
 console.log('PASS ML-85: typo suggestion, no paid check for dead/null-MX domain, A fallback, uncertain DNS and cache')

 assert.equal(canonicalSocialProfile('https://instagram.com/dentistinlahore/profilecard/?igsh=abc').profileUrl,'https://www.instagram.com/dentistinlahore')
 assert.equal(canonicalSocialProfile('https://fb.com/ClinicPage').profileUrl,'https://www.facebook.com/ClinicPage')
 assert.equal(canonicalSocialProfile('https://youtube.com/ClinicPage').profileUrl,'https://www.youtube.com/ClinicPage')
 for(const url of ['https://facebook.com/share/abc','https://youtube.com/watch?v=abc','https://instagram.com/p/abc','https://instagram.com/instagram','https://facebook.com/wix','https://youtube.com/user/YouTube'])assert.equal(canonicalSocialProfile(url),null,url)
 const socials=socialLinksFromHtml('<footer><a href="https://instagram.com/drtehsinarauf">Doctor</a><a href="https://instagram.com/rahmanandrahmanpackagesmall">Clinic</a><p>Designed by <a href="https://facebook.com/AcmeWebStudio">Acme</a></p><a href="https://facebook.com/wix">Wix</a></footer>','https://rahmanandrahmanpackages.com')
 assert.equal(socials.length,2)
 for(const list of [socials,[...socials].reverse()])assert.equal(primarySocialProfiles(list,'https://rahmanandrahmanpackages.com')[0].handle,'rahmanandrahmanpackagesmall')
 let calls=0,original=global.fetch
 try{
  global.fetch=async()=>{calls++;return new Response(null,{status:302,headers:{location:'https://www.facebook.com/ClinicPage'}})}
  const html='<a href="https://www.facebook.com/share/QA1423/">Facebook</a>',signal=new AbortController().signal
  assert.equal((await resolvePublishedShareLinks(html,'https://clinic.test',signal))[0].handle,'ClinicPage')
  await resolvePublishedShareLinks(html,'https://clinic.test',signal);assert.equal(calls,1)
  global.fetch=async()=>new Response(null,{status:302,headers:{location:'http://127.0.0.1/private'}})
  assert.deepEqual(await resolvePublishedShareLinks('<a href="https://www.facebook.com/share/Unsafe1423/">x</a>','https://clinic.test',signal),[])
  global.fetch=async(url,options)=>{assert.match(options.headers['user-agent'],/Mozilla\/5.0.*Chrome/);assert.ok(options.headers['accept-language']);return new Response('published contact page')}
  assert.match((await readWebsitePage('https://clinic.test',{signal})).html,/published contact/)
 }finally{global.fetch=original}
 const findings=contactFindingsFromHtml('<p>info [at] rehabcure [dot] org</p><p>office (at) clinic (dot) pk</p>','https://rehabcure.org')
 assert.equal(findings.emails.length,2);assert.ok(findings.emails.every(e=>e.score<=35))
 console.log('PASS ML-86/87/88/89/90: canonical links, bounded cached redirects, brand selection, credit filtering, browser headers and obfuscated email confidence')

 const server=require('node:http').createServer((req,res)=>res.end(req.url==='/blocked'?'<title>Just a moment</title><p>Verify you are human</p>':'<title>Published business page</title><a href="https://instagram.com/realclinic">Instagram</a>'))
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
 try{
  global.fetch=async()=>new Response('Forbidden',{status:403})
  const base='http://127.0.0.1:'+server.address().port
  assert.match((await readWebsitePage(base,{signal:new AbortController().signal,home:true,renderFallback:true})).html,/Published business page/)
  await assert.rejects(readWebsitePage(base+'/blocked',{signal:new AbortController().signal,home:true,renderFallback:true}),/security check/)
  const stop=new AbortController();stop.abort(new Error('Stopped'))
  await assert.rejects(readWebsitePage(base,{signal:stop.signal,home:true,renderFallback:true}),/Stopped/)
  console.log('PASS ML-87: real hidden-browser fallback reads a public page; challenge and Stop remain failures')
 }finally{global.fetch=original;server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}

 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'mamalead-qa1423-')),file=path.join(directory,'leads.db')
 let db=new LocalDatabase(file),repo=new Repository(db),ws=db.ensureWorkspace().id
 const socialId=repo.importWebsites(ws,['rahmanandrahmanpackages.com']).leadIds[0]
 repo.upsertSocialProfile({workspaceId:ws,leadId:socialId,...socials[0],source:'https://rahmanandrahmanpackages.com'})
 repo.upsertSocialProfile({workspaceId:ws,leadId:socialId,...socials[1],source:'https://rahmanandrahmanpackages.com'})
 assert.equal(db.one('select handle from social_profiles where lead_id=?',[socialId]).handle,'rahmanandrahmanpackagesmall','rescan repairs previously saved weak match')
 const inspect=WebsiteEnricher.prototype.inspectContactFast,close=WebsiteEnricher.prototype.close
 WebsiteEnricher.prototype.inspectContactFast=async url=>({canonicalWebsite:url,emails:[],phones:[],socials:[],people:[],pagesRead:url.includes('unreachable')?[]:[url],error:url.includes('unreachable')?'DNS address could not be found':null})
 WebsiteEnricher.prototype.close=async()=>{}
 try{
  const first=repo.startWebsiteLookup(ws,['unreachable1423.test','good1423.test'],fields)
  await new EnrichmentRunner(db,repo).drain()
  const result=repo.websiteLookupSession(ws);assert.equal(result.jobId,first.jobId);assert.equal(result.rows.length,2)
  assert.equal(result.added+result.reused+result.discarded,2);assert.equal(result.discarded,1)
  const retry=repo.startWebsiteLookup(ws,['unreachable1423.test'],fields)
  await new EnrichmentRunner(db,repo).drain()
  assert.equal(repo.websiteLookupSession(ws).jobId,retry.jobId)
  assert.equal(repo.websiteLookupSession(ws).rows[0].status,'failed');assert.equal(repo.websiteLookupSession(ws).discarded,1)
  assert.equal(repo.listImports(ws).find(b=>b.job_id===retry.jobId).discarded,1)
  db.close();db=new LocalDatabase(file);repo=new Repository(db)
  assert.equal(repo.websiteLookupSession(ws).jobId,retry.jobId,'newest all-failed retry survives restart')
 }finally{WebsiteEnricher.prototype.inspectContactFast=inspect;WebsiteEnricher.prototype.close=close}
 console.log('PASS ML-79/82: newest failed retry, archived result, matching counts and restart')

 const legacy=repo.startWebsiteLookup(ws,['legacy-bad1423.test','legacy-manual1423.test'],fields)
 for(const row of legacy.rows)repo.saveWebsiteLookupRow(legacy.jobId,{...row,status:'failed',error:'Old network failure'})
 repo.markJob(legacy.jobId,'failed',0,'Old network failure')
 const manualId=legacy.rows[1].leadId
 repo.upsertContact({leadId:manualId,kind:'email',value:'hello@legacy-manual1423.test',source:'manual'})
 db.run("delete from app_data_migrations where name='quality-1.4.23'")
 repo=new Repository(db)
 assert.equal(repo.getLead(ws,legacy.rows[0].leadId),null)
 assert.ok(repo.getLead(ws,manualId),'preserve manual contact')
 assert.equal(repo.websiteLookupSession(ws,legacy.jobId).rows.length,2)
 assert.ok(db.query('select * from data_quality_repairs where row_id=?',[legacy.rows[0].leadId]).length)
 const count=db.query('select * from data_quality_repairs').length;new Repository(db);assert.equal(db.query('select * from data_quality_repairs').length,count,'idempotent migration')
 assert.deepEqual(db.query('pragma foreign_key_check'),[]);db.close()
 assert.equal(plural(1,'site'),'1 site');assert.equal(plural(1,'error'),'1 error');assert.equal(plural(2,'website'),'2 websites')
 console.log('PASS ML-80/81: plural labels, archived legacy cleanup, preserved manual data, idempotency and foreign keys')
 console.log('QA artifacts: '+directory)
}
main().catch(e=>{console.error(e);process.exitCode=1})
