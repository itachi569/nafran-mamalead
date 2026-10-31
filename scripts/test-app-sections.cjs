const {test}=require('node:test'),assert=require('node:assert/strict'),{mkdtempSync,rmSync}=require('node:fs'),{tmpdir}=require('node:os'),{join}=require('node:path')
const {LocalDatabase}=require('../dist-electron/db/local-db.js'),{Repository}=require('../dist-electron/db/repository.js')
function fixture(fn){const dir=mkdtempSync(join(tmpdir(),'mamalead-sections-'));const db=new LocalDatabase(join(dir,'qa.db'));try{const ws=db.ensureWorkspace();return fn(db,new Repository(db),ws.id)}finally{db.close();rmSync(dir,{recursive:true,force:true})}}
const seed=(db,ws,id,extra={})=>{db.run('insert into leads(id,workspace_id,name,phone,website,score,rating,review_count,captured_at) values(?,?,?,?,?,?,?,?,?)',[id,ws,extra.name||id,extra.phone||'',extra.website||'',extra.score||0,extra.rating||null,extra.reviews||null,extra.at||new Date().toISOString()])}
test('ML114/115 list names, duplicate feedback, edits and cascading deletion stay workspace-scoped',()=>fixture((db,repo,ws)=>{
 seed(db,ws,'one',{phone:'+92 302 1158891'});seed(db,ws,'two')
 db.run("insert into workspaces(id,name,owner_id,created_at) select 'other','Other',owner_id,created_at from workspaces where id=?",[ws]);seed(db,'other','private')
 const list=repo.createList(ws,'  '+ 'a'.repeat(300)+'  ');assert.equal(repo.listLists(ws)[0].name.length,80);assert.equal(list.existed,false)
 assert.deepEqual(repo.createList(ws,'a'.repeat(80)),{id:list.id,existed:true});assert.equal(repo.createList(ws,'  Trimmed  ').existed,false)
 assert.equal(repo.listLists(ws).some(row=>row.name==='Trimmed'),true)
 repo.renameList(ws,list.id,'Renamed');assert.equal(repo.listLists(ws).find(row=>row.id===list.id).name,'Renamed');assert.throws(()=>repo.renameList('other',list.id,'No'))
 repo.addLeadsToList(list.id,['one','two']);repo.upsertContact({leadId:'one',kind:'email',value:'hi@example.com'})
 repo.upsertSocialProfile({workspaceId:ws,leadId:'one',platform:'facebook',profileUrl:'https://facebook.com/examplebusiness'})
 repo.updateLead(ws,'one',{name:'Updated',phone:'+92 300 1234567',website:'www.example.com'});assert.equal(repo.getLead(ws,'one').name,'Updated');assert.throws(()=>repo.updateLead(ws,'private',{name:'No'}));assert.throws(()=>repo.updateLead(ws,'one',{name:''}))
 assert.equal(repo.deleteLeads(ws,['private']).deleted,0);assert.equal(repo.deleteLeads(ws,['one']).deleted,1)
 assert.equal(repo.listMembers(list.id).length,1);assert.equal(repo.listContacts(ws,'email').length,0);assert.equal(repo.listSocialProfiles(ws).length,0)
 assert.equal(db.one('select count(*) as n from list_items where lead_id=?',['one']).n,0)
}))
test('ML112/120 all outcomes count; repeated places are labelled separately; removing a run preserves leads',()=>fixture((db,repo,ws)=>{
 const input={provider:'chromium-maps',keywords:['dentist'],location:'Lahore',maxResultsPerKeyword:1,detail:true,durationMs:100,startedAt:new Date().toISOString(),finishedAt:new Date().toISOString(),error:null,leads:[{name:'Dental Studio',placeRef:'same-place'}]}
 let last
 for(const status of ['done','done','done','done','done','done','cancelled','cancelled','failed'])last=repo.saveRun(ws,{...input,status})
 assert.deepEqual(Object.fromEntries(Object.entries(repo.runCounts(ws)).filter(([k])=>k!=='medianMs')),{runs:9,clean:6,failed:1,stopped:2,places:9})
 assert.equal(repo.leadSummary(ws).total,1)
 const runId=repo.listRuns(ws)[0].id;assert.equal(repo.deleteRun('other',runId).deleted,0);assert.equal(repo.deleteRun(ws,runId).deleted,1)
 assert.equal(repo.leadSummary(ws).total,1);assert.equal(db.one('select count(*) as n from scrape_run_leads where run_id=?',[runId]).n,0)
}))
test('ML117 phone searches normalize local/international punctuation and contact rows',()=>fixture((db,repo,ws)=>{
 seed(db,ws,'Phone Business',{phone:'+92 302 1158891'});seed(db,ws,'Different',{phone:'+44 161 5550000'})
 for(const q of ['0302 1158891','923021158891','+92-302-1158891'])assert.deepEqual(repo.listLeads(ws,{search:q}).rows.map(row=>row.id),['Phone Business'])
 repo.upsertContact({leadId:'Different',kind:'phone',value:'+44 20 7123 4567'});assert.equal(repo.listLeads(ws,{search:'02071234567'}).rows[0].id,'Different')
}))
test('ML116 sorts use a whitelist and pages remain bounded with 10,000 leads',()=>fixture((db,repo,ws)=>{
 db.transaction(()=>{for(let n=0;n<10000;n++)seed(db,ws,'Row '+String(n).padStart(5,'0'),{score:n%101,rating:n%6,reviews:n,at:new Date(1700000000000+n*1000).toISOString()})})
 const start=performance.now(),page=repo.listLeads(ws,{sort:'score',limit:100});assert.equal(page.total,10000);assert.equal(page.rows.length,100);assert.equal(page.rows[0].score,100)
 assert.equal(repo.listLeads(ws,{sort:'name',limit:100}).rows[0].name,'Row 00000');assert.equal(repo.listLeads(ws,{sort:'reviews',limit:100}).rows[0].review_count,9999)
 assert.equal(repo.listLeads(ws,{offset:9900,limit:100}).rows.length,100);assert.ok(performance.now()-start<1500)
 assert.equal(repo.listLeads(ws,{sort:'invalid; drop table leads'}).total,10000)
}))
test('ML118 immediate invalid-line and same-domain merge feedback survives reload',()=>fixture((db,repo,ws)=>{
 const session=repo.startWebsiteLookup(ws,['not a url !!','','mailto:bad@example.com','https://httpstat.us/503','https://httpstat.us/403'],{email:true,phone:false,social:false,address:false})
 assert.equal(session.discarded,2);assert.equal(session.invalidCount,2);assert.equal(session.mergedCount,1);assert.equal(session.added+session.reused,1);assert.equal(session.rows.length,1);assert.ok(session.discardedSamples.includes('not a url !!'))
 assert.equal(repo.websiteLookupSession(ws,session.jobId).invalidCount,2)
 assert.throws(()=>repo.deleteLeads(ws,session.rows.map(row=>row.leadId)),/Stop the active scan/)
}))
