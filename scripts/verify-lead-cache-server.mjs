import assert from 'node:assert/strict'
import {test} from 'node:test'
import {DatabaseSync} from 'node:sqlite'
import {createSqliteLeadCacheStore} from '../billing-server/lead-cache-store.mjs'
import {handleLeadCache,validatePlace} from '../billing-server/lead-cache.mjs'
import {cacheKeyFor,hash} from '../billing-server/lead-cache-key.mjs'
import {readFileSync} from 'node:fs'

const env={LEAD_CACHE_ENABLED:'1',LEAD_CACHE_SERVE:'1'}
const meta=(keyword='dentist',location='Lahore')=>({keyword,location,region:'pk',language:'en',cacheKey:cacheKeyFor(keyword,location,'pk','en')})
const place=(i,extra={})=>({rank:i,name:'Dentist '+i,category:'Dentist',address:'Street '+i,phone:'+923'+String(i).padStart(9,'0'),website:'https://dentist'+i+'.com',rating:4,reviewCount:12,latitude:31.5,longitude:74.3,placeRef:String(100000+i),mapsUrl:'https://www.google.com/maps/place/Test?cid='+(100000+i),...extra})
function fixture(){
  const db=new DatabaseSync(':memory:'),store=createSqliteLeadCacheStore(db)
  db.exec('create table trial_map_runs(id text primary key,installation_id text,reserved integer,created_at text)')
  const call=(path,input,installationId='one',options={})=>handleLeadCache({path,input,installationId,kind:'lifetime',ip:installationId,env,store,...options})
  const lookup=(id='one',run='run1',limit=150,extra={})=>call('lookup',{keyVersion:'v1',runId:run,queries:[meta()],limitPerQuery:limit,...extra},id)
  const contribute=(places,id='one',run='run1',extra={})=>call('contribute',{keyVersion:'v1',runId:run,query:meta(),places,...extra},id)
  return {db,store,call,lookup,contribute}
}
test('strict keys, idempotent schema, cache population, exclude hashes and fresh filtering',async()=>{
  const f=fixture()
  createSqliteLeadCacheStore(f.db)
  assert.equal(cacheKeyFor(' ＤＥＮＴＩＳＴ ',' Lahore  ','pk','en'),meta().cacheKey)
  for(const [k,l] of [['dentists','Lahore'],['dental clinic','Lahore'],['dentist','LHR'],['dentist','Lahore, Pakistan']])assert.notEqual(meta(k,l).cacheKey,meta().cacheKey)
  await assert.rejects(f.lookup('one','bad',150,{queries:[{...meta(),cacheKey:'a'.repeat(64)}]}),e=>e.status===400)
  await f.lookup()
  const source=Array.from({length:100},(_,i)=>place(i))
  assert.equal((await f.contribute(source)).accepted,100)
  f.db.prepare('update lead_cache_queries set exhausted_at=? where cache_key=?').run(new Date().toISOString(),meta().cacheKey)
  assert.equal((await f.lookup('limited-page','r',10)).results[0].exhausted,false,'a limited response is not the complete query')
  assert.equal((await f.lookup('complete-page','r',150)).results[0].exhausted,true)
  for(const fixture of JSON.parse(readFileSync(new URL('./fixtures/lead-cache-keys.json',import.meta.url)))){
    assert.equal(cacheKeyFor(...fixture.input),fixture.key)
    if(fixture.key===meta().cacheKey)continue
    const [keyword,location,region,language]=fixture.input
    assert.equal((await f.lookup('different','r',150,{queries:[{keyword,location,region,language,cacheKey:fixture.key}]})).results[0].places.length,0)
  }
  const hit=await f.lookup('two')
  assert.equal(hit.results[0].places.length,100)
  assert.equal(hit.results[0].stale,0)
  assert.equal((await f.lookup('two','run2',150,{exclude:{placeRefs:[hash('cid:100000')]}})).results[0].places.length,99)
  const other=meta('dental clinic')
  await f.call('lookup',{keyVersion:'v1',runId:'other',queries:[other],limitPerQuery:150})
  await f.call('contribute',{keyVersion:'v1',runId:'other',query:other,places:source})
  const capped=await f.lookup('budget','r',150,{queries:[meta(),other],maxResultsTotal:150})
  assert.equal(capped.results.reduce((sum,r)=>sum+r.places.length,0),150,'server never returns beyond the full run allowance across queries')
  await assert.rejects(f.lookup('two','raw',150,{exclude:{domains:['private-customer-domain.com']}}),e=>e.status===400)
  f.db.prepare("update lead_cache_places set scraped_at=? where place_key='cid:100001'").run(new Date(Date.now()-31*86400000).toISOString())
  const stale=await f.lookup('three')
  assert.equal(stale.results[0].places.length,99);assert.equal(stale.results[0].stale,1)
  const stats=f.store.leadCacheAdminStats({fromDay:'2020-01-01',toDay:'2099-01-01'})
  assert.equal(stats.places,100);assert.ok(stats.hits>=1);assert.equal(stats.topQueries[0].keyword,'dentist')
  assert.equal(JSON.stringify(hit).includes('installation_id'),false)
  f.db.close()
})
test('receipt and aggregate allowance prevent replay; distinct votes protect phone and website',async()=>{
  const f=fixture()
  await assert.rejects(f.contribute([place(1)]),e=>e.status===403)
  await f.lookup('one','run1',2)
  assert.equal((await f.contribute([place(1),place(2,{notes:'private note',score:999,ownerEmail:'private@example.com'})])).accepted,2)
  assert.equal((await f.contribute([place(1)])).duplicates,1)
  await assert.rejects(f.contribute([place(3)]),e=>e.status===403)
  assert.equal(f.db.prepare("select confirmations from lead_cache_places where place_key='cid:100001'").get().confirmations,1)
  await f.lookup('two','run1',2)
  await f.contribute([place(1,{phone:'+14155552671',website:'https://newdentist.com'})],'two')
  assert.equal(f.db.prepare("select phone_e164 from lead_cache_places where place_key='cid:100001'").get().phone_e164,place(1).phone)
  await f.lookup('two','run2',2);await f.contribute([place(1,{phone:'+14155552671',website:'https://newdentist.com'})],'two','run2')
  assert.equal(f.db.prepare("select confirmations from lead_cache_places where place_key='cid:100001'").get().confirmations,2)
  await f.lookup('three','run1',2);await f.contribute([place(1,{phone:'+14155552671',website:'https://newdentist.com'})],'three')
  assert.equal(f.db.prepare("select phone_e164 from lead_cache_places where place_key='cid:100001'").get().phone_e164,'+14155552671')
  assert.equal(JSON.stringify((await f.lookup('four')).results).includes('private note'),false)
  f.db.close()
})
test('validation rejects poisoned payloads and blocks installations with >20% bad rows',async()=>{
  const f=fixture();await f.lookup()
  for(const extra of [{mapsUrl:'https://evil.com/maps/?cid=100001'},{website:'http://127.0.0.1'},{website:'http://internal.local'},{phone:'123'},{name:'Email x@y.com'},{latitude:100},{rating:6},{placeRef:'222222'},{mapsUrl:'https://google.com.attacker.org/maps/?cid=100001'}])assert.ok(validatePlace(place(1,extra)).rejected)
  await assert.rejects(f.contribute([place(1),place(2,{website:'http://127.0.0.1'})]),e=>e.status===422)
  await assert.rejects(f.contribute([place(1)]),e=>e.status===403)
  assert.equal(f.db.prepare('select count(*) n from lead_cache_places').get().n,0)
  f.db.close()
})
test('trial receipts, rate limit, kill switches and website filters',async()=>{
  const f=fixture()
  const body={keyVersion:'v1',runId:'trialrun',queries:[meta()],limitPerQuery:20,reservationId:'reserve1'}
  await assert.rejects(f.call('lookup',body,'trial',{kind:'trial'}),e=>e.status===403)
  f.db.prepare('insert into trial_map_runs values(?,?,?,?)').run('reserve1','trial',20,new Date().toISOString())
  assert.equal((await f.call('lookup',body,'trial',{kind:'trial'})).enabled,true)
  await assert.rejects(f.call('lookup',{...body,runId:'replay'},'trial',{kind:'trial'}),e=>e.status===403)
  await f.lookup();await f.contribute([place(1),place(2,{website:''})])
  assert.equal((await f.lookup('has','r',10,{websiteFilter:'has'})).results[0].places.length,1)
  assert.equal((await f.lookup('none','r',10,{websiteFilter:'none'})).results[0].places.length,1)
  assert.deepEqual(await f.call('lookup',{},'off',{env:{}}),{enabled:false})
  assert.equal((await f.call('lookup',{...body,runId:'serveoff'},'off',{env:{...env,LEAD_CACHE_SERVE:'0'}})).results[0].places.length,0)
  for(let i=0;i<60;i++)await f.lookup('limited','r'+i,1)
  await assert.rejects(f.lookup('limited','r61',1),e=>e.status===429&&e.retryAfter>0)
  f.db.close()
})
test('enrichment only accepts matching public sources and strips sensitive fields',async()=>{
  const f=fixture();await f.lookup();await f.contribute([place(1)])
  const input={placeKey:'cid:100001',website:place(1).website,emails:[{value:'info@dentist1.com',source:'https://dentist1.com/contact',score:80,validation_status:'valid'},{value:'secret@elsewhere.com',source:'https://dentist1.com'}],phones:[],socials:[],address:'Business street',owner:'PRIVATE'}
  await assert.rejects(f.call('enrichment',input,'unrelated'),e=>e.status===403)
  assert.equal((await f.call('enrichment',input)).accepted,true)
  const result=await f.lookup('next'),e=result.results[0].places[0].enrichment
  assert.equal(e.emails.length,1);assert.equal(e.emails[0].value,'info@dentist1.com')
  assert.equal(JSON.stringify(e).includes('validation'),false);assert.equal(JSON.stringify(e).includes('PRIVATE'),false)
  f.db.close()
})
