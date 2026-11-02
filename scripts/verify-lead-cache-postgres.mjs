import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {createNeonLeadCacheStore} from '../billing-server/lead-cache-store.mjs'
import {handleLeadCache} from '../billing-server/lead-cache.mjs'
import {cacheKeyFor,hash} from '../billing-server/lead-cache-key.mjs'
if(!process.env.PGLITE_QA_MODULE)throw new Error('Set PGLITE_QA_MODULE to the separately installed @electric-sql/pglite module.')
const {PGlite}=createRequire(import.meta.url)(process.env.PGLITE_QA_MODULE),db=new PGlite()
let calls=0
const store=createNeonLeadCacheStore('postgresql://fixture',async()=>{},()=>({
 connect:async()=>{},end:async()=>{},query:(sql,params)=>{calls++;return db.query(sql,params)}
}))
const query={keyword:'dentist',location:'Lahore',region:'pk',language:'en',cacheKey:cacheKeyFor('dentist','Lahore','pk','en')}
const env={LEAD_CACHE_ENABLED:'1',LEAD_CACHE_SERVE:'1'}
const call=(path,input,id='one')=>handleLeadCache({path,input,installationId:id,kind:'lifetime',ip:id,env,store})
const lookup=(id='one',extra={})=>call('lookup',{keyVersion:'v1',runId:'run1',queries:[query],limitPerQuery:150,...extra},id)
try{
 await lookup()
 const places=Array.from({length:100},(_,i)=>({rank:i,name:'Dentist '+i,category:'Dentist',address:'1 Main St',phone:'',website:'https://dentist'+i+'.com',rating:4,reviewCount:3,placeRef:String(100000+i),mapsUrl:'https://www.google.com/maps/place/Test?cid='+(100000+i)}))
 const start=calls
 assert.equal((await call('contribute',{keyVersion:'v1',runId:'run1',query,places})).accepted,100)
 assert.ok(calls-start<30,'bulk Postgres contribution has a bounded query count')
 const hit=await lookup('two',{exclude:{placeRefs:[hash('cid:100001')]}})
 assert.equal(hit.results[0].places.length,99)
 await call('enrichment',{placeKey:'cid:100000',website:'https://dentist0.com',emails:[{value:'hello@dentist0.com',source:'https://dentist0.com/contact',score:80}],phones:[],socials:[],address:'',scannedKinds:['email']})
 await call('enrichment',{placeKey:'cid:100000',website:'https://dentist0.com',emails:[],phones:[{value:'+14155552671',source:'https://dentist0.com/contact'}],socials:[],address:'',scannedKinds:['phone']})
 const e=(await lookup('three')).results[0].places[0].enrichment
 assert.equal(e.emails.length,1);assert.equal(e.phones.length,1)
 const stats=await store.leadCacheAdminStats({fromDay:'2020-01-01',toDay:'2099-01-01'})
 assert.equal(stats.places,100);assert.equal(stats.contributed,100)
 await store.leadCachePrune()
 console.log('PASS PostgreSQL SQL via PGlite: schema, transactions, 100-place bulk upsert, hashed exclusion, independent enrichment freshness, statistics and pruning')
}finally{await db.close()}
