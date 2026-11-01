const {test}=require('node:test'),assert=require('node:assert/strict')
const {mkdtempSync,rmSync}=require('node:fs'),{tmpdir}=require('node:os'),{join}=require('node:path')
const {lookupRowFromFindings,DEFAULT_LOOKUP_FIELDS}=require('../dist-electron/enrichment/website-lookup.js')
const {uniquePhones,uniqueAddresses}=require('../dist-electron/enrichment/contact-dedupe.js')
const {contactFindingsFromHtml}=require('../dist-electron/enrichment/website.js')
const {extractPublishedEmails}=require('../dist-electron/enrichment/email-extractor.js')
const {precheckEmail}=require('../dist-electron/email-precheck.js')
const {LocalDatabase}=require('../dist-electron/db/local-db.js'),{Repository}=require('../dist-electron/db/repository.js')
const addresses=['Shop 53, Ground Floor, Beverly Centre, F-6, Islamabad, 44000, PK','Shop 53, Ground Floor, Beverly Centre, F-6, Islamabad 44000, Pakistan']
const phones=[{value:'+92512604400',page:'https://coffee.pk/',score:30},{value:'+92 51 2604400',page:'https://coffee.pk/contact',score:95}]
const findings={emails:[],phones,addresses,socials:[],people:[],pagesRead:['https://coffee.pk/'],error:null}
test('ML127 merged HTTP/rendered phones and country-equivalent addresses have one result and strongest source',()=>{
 const clean=uniquePhones(phones);assert.equal(clean.length,1);assert.equal(clean[0].page,'https://coffee.pk/contact')
 assert.equal(uniquePhones([{value:'03142165733'},{value:'+923142165733'}]).length,1)
 const row=lookupRowFromFindings({id:'one',name:'Coffee',website:'https://coffee.pk'},findings,DEFAULT_LOOKUP_FIELDS)
 assert.equal(row.phones.length,1);assert.equal(row.phones[0].value,'+92512604400');assert.equal(row.address,addresses[0])
 assert.equal(uniqueAddresses([...addresses,'Shop 54, Ground Floor, Beverly Centre, F-6, Islamabad, 44000, PK']).length,2)
 assert.equal(uniqueAddresses(['12 King Street, London, UK','12 King Street London United Kingdom']).length,1)
 assert.equal(uniqueAddresses(['53 Main Road, PK','153 Main Road, PK']).length,2)
 assert.equal(uniqueAddresses(['شارع الملك 12, AE','شارع الملك 13, AE']).length,2)
})
test('ML128 extraction drops non-public domains and precheck never calls DNS for them',async()=>{
 const bad=['mlops-desk@gateway.internal','a@b.local','x@site.test','a@x.invalid','a@x.example','a@x.lan','a@x.home','a@x.corp','a@x.intranet','a@x.onion','a@x.localhost','a@x.home.arpa','a@x.123','a@x.c']
 const html='<p>'+bad.join(' ')+' real@dentology.com</p><a href="mailto:help@gateway.internal">Email</a>'
 assert.deepEqual(contactFindingsFromHtml(html,'https://dentology.com/').emails.map(e=>e.value),['real@dentology.com'])
 assert.deepEqual(extractPublishedEmails(bad.join(' ')+' real@dentology.com'),['real@dentology.com'])
 let called=false;const resolver={resolveMx:async()=>{called=true;throw Error('Unexpected DNS')},cancel(){}}
 for(const value of bad){const result=await precheckEmail(value,undefined,resolver);assert.equal(result.status,'invalid',value);assert.match(result.message,/No provider credit/i)}
 assert.equal(called,false)
})
test('ML127/128 historical lookup rows are clean on read/export and old private contacts are archived once',()=>{
 const dir=mkdtempSync(join(tmpdir(),'ml1433-')),db=new LocalDatabase(join(dir,'qa.db'))
 try{
  const ws=db.ensureWorkspace(),repo=new Repository(db),session=repo.startWebsiteLookup(ws.id,['https://coffee.pk'],DEFAULT_LOOKUP_FIELDS),leadId=session.rows[0].leadId
  const row={...lookupRowFromFindings({id:leadId,name:'Coffee',website:'https://coffee.pk'},findings,DEFAULT_LOOKUP_FIELDS),phones:phones.map(p=>({value:p.value,source:p.page})),address:addresses.join(' | '),emails:[{value:'ops@gateway.internal',source:'https://coffee.pk/'}]}
  repo.saveWebsiteLookupRow(session.jobId,row)
  const saved=repo.websiteLookupSession(ws.id,session.jobId).rows[0];assert.equal(saved.phones.length,1);assert.equal(saved.address.includes('|'),false);assert.equal(saved.emails.length,0)
  db.run("insert into lead_contacts (id,workspace_id,lead_id,kind,value,source,created_at) values (?,?,?,?,?,?,?)",['bad',ws.id,leadId,'email','ops@gateway.internal','https://coffee.pk/',new Date().toISOString()])
  db.run('delete from app_data_migrations where name=?',['private-emails-1.4.34'])
  new Repository(db);assert.equal(db.one('select id from lead_contacts where id=?',['bad']),null)
  const count=()=>db.one("select count(*) n from data_quality_repairs where row_id='bad'").n
  assert.equal(count(),1);new Repository(db);assert.equal(count(),1)
  assert.throws(()=>repo.upsertContact({leadId,kind:'email',value:'ops@gateway.internal'}),/public domain/)
 }finally{db.close();rmSync(dir,{recursive:true,force:true})}
})
