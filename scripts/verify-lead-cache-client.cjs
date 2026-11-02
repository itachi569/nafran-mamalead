const {test}=require('node:test'),assert=require('node:assert/strict')
const {CachedMapsProvider}=require('../dist-electron/scraper/cached-maps.js')
const {IdentitySet,cacheKeyFor,placeIdentity}=require('../dist-electron/scraper/cache-key.js')
const {normaliseQuery}=require('../dist-electron/scraper/types.js')
const query=normaliseQuery({keywords:['dentist'],location:'Lahore',region:'pk',language:'en',headless:true,maxResultsPerKeyword:150,maxResultsTotal:150})
const place=(i,extra={})=>({id:'lead'+i,name:'Dentist '+i,category:'Dentist',address:i+' Main Street',area:'Lahore',postcode:'',phone:'+923'+String(i).padStart(9,'0'),website:'https://dentist'+i+'.com',rating:4,reviewCount:10,latitude:31.5,longitude:74.3,placeRef:String(100000+i),mapsUrl:'https://www.google.com/maps/place/Test?cid='+(100000+i),provider:'chromium-maps',capturedAt:new Date().toISOString(),scrapedAt:new Date().toISOString(),keyword:'dentist',query:'dentist in Lahore',placeKey:'cid:'+(100000+i),...extra})
const result=(places,q=query,exhausted=false)=>({enabled:true,warmBrowser:false,results:q.keywords.map(k=>({cacheKey:cacheKeyFor(k,q.location,q.region,q.language),places,exhausted,stale:0}))})
function harness(cached,live,own=[],q=query){
 const events=[],posts=[],sleeps=[],diagnostics=[]
 const inner={id:'chromium-maps',label:'Chromium · Google Maps',requiresBrowser:true,calls:[],lastRunExhausted:false,
  async run(query,sink,signal){this.calls.push(query);const out=[];for(const lead of live){signal.throwIfAborted();if(this.skip?.(lead))continue;if(out.length>=query.maxResultsTotal)break;out.push(lead);sink({lead,message:'Captured',status:'running'})}this.lastRunExhausted=out.length<query.maxResultsTotal;return out},async close(){}}
 const deps={enabled:true,reservationId:null,appVersion:'test',known:new IdentitySet(own),seeds:new Map(),lookup:async()=>cached,enqueue:(kind,body)=>posts.push({kind,body}),diagnostics:(...a)=>diagnostics.push(a),sleep:async ms=>sleeps.push(ms)}
 return {inner,deps,posts,sleeps,diagnostics,events,run:signal=>new CachedMapsProvider(inner,deps,'run1').run(q,e=>events.push(e),signal||new AbortController().signal)}
}
test('100 cached + 50 live; owned/cached rows never consume the live allowance or upload twice',async()=>{
 const h=harness(result(Array.from({length:100},(_,i)=>place(i))),Array.from({length:180},(_,i)=>place(i)))
 const rows=await h.run();assert.equal(rows.length,150);assert.equal(new Set(rows.map(p=>p.placeRef)).size,150)
 assert.equal(h.inner.calls[0].maxResultsTotal,50);assert.equal(h.posts[0].body.places.length,50)
 assert.ok(h.posts[0].body.places.every(p=>Number(p.placeRef)>=100100))
 assert.ok(h.sleeps.every(ms=>ms>=300));assert.equal(h.events.filter(e=>e.lead).length,150)
 assert.equal(h.diagnostics.at(-1)[1],100)
 assert.ok(h.posts[0].body.places.every(p=>!('id'in p)&&!('score'in p)&&!('provider'in p)))
})
test('full hit avoids browser; short/failing/disabled cache falls back, source identity stays Maps',async()=>{
 const all=Array.from({length:150},(_,i)=>place(i))
 const h=harness(result(all),all);assert.equal((await h.run()).length,150);assert.equal(h.inner.calls.length,0)
 for(const response of [null,{enabled:false}]){
  const f=harness(response,all);assert.equal((await f.run()).length,150);assert.equal(f.inner.calls.length,1);assert.equal(f.posts.length,0)
 }
 for(const message of ['429','503','timeout']){
  const f=harness(null,all);f.deps.lookup=async()=>{throw new Error(message)};assert.equal((await f.run()).length,150)
 }
 const off=harness(result(all),all);off.deps.enabled=false;off.deps.lookup=()=>{throw new Error('must not call')};assert.equal((await off.run()).length,150)
})
test('own identities, aliases, shared domains, multi-keyword caps and immutable contributions',async()=>{
 const identities=new IdentitySet([place(1)])
 assert.ok(identities.has(place(9,{phone:place(1).phone})));assert.ok(identities.has(place(9,{website:'https://www.dentist1.com/team'})))
 assert.ok(identities.has({placeRef:'0x1:0x'+BigInt(100001).toString(16)}))
 assert.equal(new IdentitySet([{website:'https://facebook.com/a'}]).has({website:'https://facebook.com/b'}),false)
 assert.ok(identities.hashes().placeRefs.every(h=>/^[a-f0-9]{64}$/.test(h)))
 const q={...query,keywords:['dentist','dental clinic'],maxResultsPerKeyword:3,maxResultsTotal:5}
 const h=harness(result([place(1),place(2)],q),[place(1),place(2),place(3),place(4),place(5),place(6)],[place(1)],q)
 const rows=await h.run();assert.equal(rows.length,5);assert.ok(rows.every(p=>p.placeRef!==place(1).placeRef))
 assert.equal(h.events.filter(p=>p.lead&&p.keywordIndex===0).length,3)
 const original=h.posts[0].body.places[0].name;rows.find(p=>p.placeRef===h.posts[0].body.places[0].placeRef).name='PRIVATE EDIT'
 assert.equal(h.posts[0].body.places[0].name,original)
})
test('cancel during paced cache stops promptly; fresh enrichment stays separate from renderer',async()=>{
 const c=new AbortController(),h=harness(result([place(1)]),[])
 h.deps.sleep=async()=>{c.abort();throw new DOMException('Cancelled','AbortError')}
 await assert.rejects(h.run(c.signal),e=>e.name==='AbortError');assert.equal(h.events.filter(e=>e.lead).length,0)
 const enriched=place(1,{enrichment:{emails:[{value:'hello@dentist1.com',source:'https://dentist1.com',score:80}],phones:[],socials:[],address:'',enrichedAt:new Date().toISOString()}})
 const f=harness(result([enriched],query,true),[]);const rows=await f.run();assert.equal(rows.length,1);assert.equal(f.inner.calls.length,0);assert.equal(f.deps.seeds.size,1)
 assert.equal('enrichment' in rows[0],false);assert.equal(rows[0].provider,'chromium-maps')
})
test('200 randomized owned/cache/live overlap seeds never duplicate or overcount',async()=>{
 for(let seed=1;seed<=200;seed++){
  let state=seed;const rand=()=>((state=Math.imul(state,1664525)+1013904223>>>0)/4294967296)
  const all=Array.from({length:100},(_,i)=>place(i)),own=all.filter(()=>rand()<.25),cached=all.filter(()=>rand()<.5),live=all.filter(()=>rand()<.85)
  const target=1+Math.floor(rand()*60),q={...query,maxResultsPerKeyword:target,maxResultsTotal:target}
  const h=harness(result(cached,q),live,own,q),out=await h.run(),owned=new IdentitySet(own),seen=new IdentitySet()
  for(const lead of out){assert.equal(owned.has(lead),false);assert.equal(seen.has(lead),false);seen.add(lead)}
  assert.ok(out.length<=target)
  const available=new IdentitySet(own);let count=0
  for(const p of [...cached,...live])if(!available.has(p)){available.add(p);count++}
  assert.equal(out.length,Math.min(target,count),'seed '+seed)
 }
})
test('client and server strict cache keys match',async()=>{
 const server=await import('../billing-server/lead-cache-key.mjs')
 for(const k of ['dentist',' ＤＥＮＴＩＳＴ ','développement','dentists','dentist lahore'])
  for(const l of ['Lahore','Lahore, Pakistan','lahore  ','LHR','کراچی'])assert.equal(cacheKeyFor(k,l,'pk','en'),server.cacheKeyFor(k,l,'pk','en'))
})
