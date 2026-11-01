const {test}=require('node:test'),assert=require('node:assert/strict')
const {mkdtempSync,rmSync}=require('node:fs'),{tmpdir}=require('node:os'),{join}=require('node:path')
const {normalizePhone}=require('../dist-electron/phone-format.js')
const {contactFindingsFromHtml}=require('../dist-electron/enrichment/website.js')
const {matchesWebsiteFilter}=require('../dist-electron/enrichment/source-policy.js')
const {LocalDatabase}=require('../dist-electron/db/local-db.js'),{Repository}=require('../dist-electron/db/repository.js')
function fixture(fn){const dir=mkdtempSync(join(tmpdir(),'ml1432-'));const db=new LocalDatabase(join(dir,'qa.db'));try{const ws=db.ensureWorkspace();return fn(db,new Repository(db),ws.id)}finally{db.close();rmSync(dir,{recursive:true,force:true})}}
function seed(db,ws,id,phone=''){db.run('insert into leads(id,workspace_id,name,phone,website,address,captured_at) values(?,?,?,?,?,?,?)',[id,ws,id,phone,'https://clinic.pk','Lahore, Pakistan',new Date().toISOString()])}
test('ML122 all Pakistan formats collapse to E.164; malformed numbers are rejected',()=>{
 for(const input of ['03001234567','+923001234567','00923001234567','923001234567','+9203001234567','tel:0300-1234567'])assert.equal(normalizePhone(input,'https://clinic.pk'),'+923001234567',input)
 for(const input of ['+920313268284','1234','192.168.0.1','+92300123456799999'])assert.equal(normalizePhone(input,'https://clinic.pk'),'',input)
 assert.equal(normalizePhone('020 7946 0958','https://company.co.uk'),'+442079460958')
 assert.equal(normalizePhone('(415) 555-2671','United States'),'+14155552671')
 assert.equal(normalizePhone('030 901820','https://berlin.de'),'+4930901820')
 assert.equal(normalizePhone('03001234567','https://product.io'),'03001234567','A generic .io domain must not invent a country')
 assert.equal(normalizePhone('03001234567','https://product.com tel:+443001234567'),'+443001234567','Published UK evidence must win over a Pakistani-looking prefix')
 assert.equal(normalizePhone('+39 06 6982'),' +39066982'.trim(),'Italian significant zero must stay')
})
test('ML122 HTML tel/text/JSON-LD duplicates merge and strongest source survives',()=>{
 const html='<footer>Call us <a href="tel:03142165733">03142165733</a></footer><p>Phone +92 314 2165733</p><script type="application/ld+json">{"telephone":["00923142165733","+9203142165733","+920313268284"]}</script>'
 const found=contactFindingsFromHtml(html,'https://clinic.pk/contact')
 assert.deepEqual(found.phones.map(x=>x.value),['+923142165733'])
 assert.ok(found.phones[0].score>=80)
 assert.deepEqual(contactFindingsFromHtml(html,'https://clinic.com/contact').phones.map(x=>x.value),['+923142165733'],'An international number on the same page supplies the missing country')
})
test('ML122 database repairs archive originals, merge duplicates and are idempotent',()=>fixture((db,repo,ws)=>{
 seed(db,ws,'one','03142165733')
 db.run("update leads set website='https://clinic.com',address='' where id='one'")
 const values=['03142165733','+923142165733','00923142165733','+920313268284']
 values.forEach((value,i)=>db.run("insert into lead_contacts(id,workspace_id,lead_id,kind,value,source,score,created_at) values(?,?,?,'phone',?,?,?,?)",['p'+i,ws,'one',value,i===0?'manual':'https://clinic.pk',50+i,new Date().toISOString()]))
 db.run("delete from app_data_migrations where name='phones-1.4.32'")
 repo=new Repository(db)
 assert.equal(repo.getLead(ws,'one').phone,'+923142165733')
 assert.deepEqual(repo.listContacts(ws,'phone').map(x=>x.value),['+923142165733'])
 const count=db.one("select count(*) n from data_quality_repairs where reason like '%phone%'").n
 assert.ok(count>=4);new Repository(db);assert.equal(db.one("select count(*) n from data_quality_repairs where reason like '%phone%'").n,count)
 repo.upsertContact({leadId:'one',kind:'phone',value:'00923142165733'});assert.equal(repo.listContacts(ws,'phone').length,1)
 repo.updateLead(ws,'one',{phone:'+92 314 2165733'});assert.equal(repo.getLead(ws,'one').phone,'+923142165733')
}))
test('ML121 removing list membership or list never deletes underlying leads',()=>fixture((db,repo,ws)=>{
 seed(db,ws,'one');seed(db,ws,'two')
 const list=repo.createList(ws,'Shortlist');repo.addLeadsToList(list.id,['one','two'])
 assert.deepEqual(repo.listMembers(list.id).sort(),['one','two'])
 repo.removeLeadFromList(list.id,'one');assert.deepEqual(repo.listMembers(list.id),['two'])
 repo.deleteList(list.id);assert.equal(repo.listLists(ws).length,0);assert.equal(repo.leadSummary(ws).total,2)
}))
test('ML124 has/none/any use actual business websites, while Maps preserves social links',()=>fixture((db,repo,ws)=>{
 const socials=['https://facebook.com/clinic','https://m.facebook.com/clinic','https://instagram.com/clinic','https://wa.me/923001234567','https://linktr.ee/clinic','https://youtube.com/@clinic']
 for(const url of socials){assert.equal(matchesWebsiteFilter(url,'has'),false);assert.equal(matchesWebsiteFilter(url,'none'),true);assert.equal(matchesWebsiteFilter(url,'any'),true)}
 assert.equal(matchesWebsiteFilter('https://clinic.pk','has'),true)
 assert.equal(matchesWebsiteFilter('','none'),true)
 repo.saveRun(ws,{status:'done',provider:'chromium-maps',keywords:['clinic'],location:'Lahore',maxResultsPerKeyword:1,detail:true,durationMs:100,startedAt:new Date().toISOString(),finishedAt:new Date().toISOString(),error:null,leads:[{name:'Clinic',phone:'03001234567',website:socials[0]}]})
 const lead=repo.listLeads(ws).rows[0];assert.equal(lead.website,'');assert.equal(lead.phone,'+923001234567');assert.equal(repo.listSocialProfiles(ws).length,1)
}))
test('ML125 mixed social links count as discarded and reasons survive reload',()=>fixture((db,repo,ws)=>{
 const result=repo.startWebsiteLookup(ws,['https://clinic.pk','https://facebook.com/clinic','https://wa.me/923001234567'],{email:true,phone:false,social:false,address:false})
 assert.equal(result.rows.length,1);assert.equal(result.invalidCount,2)
 assert.ok(result.discardedSamples.every(x=>x.includes('social profile, not a website')))
 assert.equal(repo.websiteLookupSession(ws,result.jobId).invalidCount,2)
}))
test('ML125 all-social input produces a useful error and no records',()=>fixture((db,repo,ws)=>{
 assert.throws(()=>repo.startWebsiteLookup(ws,['https://facebook.com/clinic'],{email:true}),/Social profile, not a website/)
 assert.equal(repo.leadSummary(ws).total,0)
}))
