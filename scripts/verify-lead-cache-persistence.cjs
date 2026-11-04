const assert=require('node:assert/strict'),{mkdtempSync}=require('node:fs'),{tmpdir}=require('node:os'),{join}=require('node:path')
const {LocalDatabase}=require('../dist-electron/db/local-db.js'),{Repository}=require('../dist-electron/db/repository.js')
const {LeadCacheRepository}=require('../dist-electron/db/lead-cache-repository.js')
const file=join(mkdtempSync(join(tmpdir(),'mamalead-cache-db-')),'leads.db')
let db=new LocalDatabase(file),repo=new Repository(db),cache=new LeadCacheRepository(db),ws=db.ensureWorkspace().id
const now=new Date().toISOString(),lead={name:'Dentist',address:'1 Main St',website:'https://dentist.com',phone:'+14155552671',placeRef:'123456',mapsUrl:'https://www.google.com/maps/place/Test?cid=123456'}
const saved=repo.saveRun(ws,{runId:'cache',provider:'chromium-maps',status:'running',keywords:['dentist'],location:'Lahore',maxResultsPerKeyword:8,detail:true,startedAt:now,finishedAt:null,durationMs:0,error:null,leads:[lead]})
const id=saved.leadIds[0]
cache.seed(repo,ws,id,{emails:[{value:'hello@dentist.com',source:'https://dentist.com/contact',score:80}],phones:[],socials:[],address:'',enrichedAt:now,scannedKinds:['email','social']})
assert.equal(repo.listContacts(ws,'email').length,1)
assert.equal(repo.queueMapsEmails(ws,'cache').queued,0)
assert.ok(repo.cacheSeededIds('social').has(id))
assert.equal(db.one('select validation_status from lead_contacts where lead_id=?',[id]).validation_status,null)
cache.diagnostics('cache',1);assert.equal(db.one('select cache_hits from scrape_runs where id=?',['cache']).cache_hits,1)
cache.enqueue('contribute',{public:'data'});const out=cache.pending()[0]
cache.failed(out.id,0);assert.equal(cache.pending().length,0)
db.run('update lead_cache_outbox set next_attempt_at=?,attempts=3',[now]);assert.equal(cache.pending().length,0)
cache.enqueue('enrichment',{public:'data'})
db.close();db=new LocalDatabase(file);repo=new Repository(db);cache=new LeadCacheRepository(db)
assert.equal(cache.pending().length,1);cache.complete(cache.pending()[0].id);assert.equal(cache.pending().length,0)
assert.equal(repo.listContacts(ws,'email').length,1)
assert.ok(repo.knownIdentities(ws).has({website:'https://www.dentist.com/another'}))
const placeholderId=repo.importWebsites(ws,['https://realbiz.pk'],false).leadIds[0]
cache.seed(repo,ws,placeholderId,{emails:[{value:'contact@info.com',source:'https://realbiz.pk/contact',score:90}],phones:[],socials:[],address:'',enrichedAt:now,scannedKinds:['email']})
assert.deepEqual(repo.listContacts(ws,'email',[placeholderId]),[])
assert.equal(repo.cacheSeededIds('email').has(placeholderId),false,'discarded template email must not suppress a fresh website scan')
db.close()
console.log('PASS real SQLite: cached contacts and verification reset, no duplicate enrichment jobs, hidden hit count, identity dedupe, durable retry/drop/reopen')
