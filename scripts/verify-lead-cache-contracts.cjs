const {test}=require('node:test'),assert=require('node:assert/strict'),{readFileSync}=require('node:fs')
const fixtures=require('./fixtures/lead-cache-keys.json')
test('frozen strict keys and privacy/billing contracts',async()=>{
 const client=require('../dist-electron/scraper/cache-key.js'),server=await import('../billing-server/lead-cache-key.mjs')
 for(const {input,key} of fixtures){assert.equal(client.cacheKeyFor(...input),key);assert.equal(server.cacheKeyFor(...input),key)}
 assert.equal(new Set(fixtures.slice(0,3).map(r=>r.key)).size,1)
 assert.equal(new Set([fixtures[0],...fixtures.slice(3)].map(r=>r.key)).size,fixtures.length-2)
 for(const file of ['electron/scraper/cache-key.ts','billing-server/lead-cache-key.mjs'])assert.doesNotMatch(readFileSync(file,'utf8'),/\b(?:synonym|alias|stem|singular|levenshtein|fuzzy)\b/i)
 assert.match(readFileSync('electron/main.ts','utf8'),/billingSettleMaps\(quota.reservationId, summary.leads.length\)/)
})
test('real cache client enforces 4-second timeout, cancellation and durable retry handoff',async()=>{
 const path=require.resolve('../dist-electron/billing/client.js'),original=require.cache[path]
 let delay=0,mode='ok',calls=0
 require.cache[path]={id:path,filename:path,loaded:true,exports:{leadCacheRequest:(_kind,_body,signal)=>new Promise((resolve,reject)=>{
  calls++;const abort=()=>{clearTimeout(timer);reject(new DOMException('Aborted','AbortError'))}
  const timer=setTimeout(()=>{signal.removeEventListener('abort',abort);mode==='error'?reject(new Error('503')):resolve({enabled:true})},delay)
  signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort()
 })}}
 try{
  const cache=require('../dist-electron/billing/lead-cache-client.js')
  for(const ms of [0,3900,10000]){
   delay=ms;const start=Date.now(),result=await cache.leadCacheLookup({},new AbortController().signal),elapsed=Date.now()-start
   if(ms<4000){assert.equal(result.enabled,true);assert.ok(elapsed>=ms-50)}else{assert.equal(result,null);assert.ok(elapsed>=3900&&elapsed<5500)}
  }
  const aborter=new AbortController();setTimeout(()=>aborter.abort(),30)
  const start=Date.now();assert.equal(await cache.leadCacheLookup({},aborter.signal),null);assert.ok(Date.now()-start<1000)
  delay=0;mode='error';const pending=[{id:'one',kind:'contribute',payload:'{}',attempts:0}],failed=[],done=[]
  const repo={pending:()=>pending.splice(0),failed:(...a)=>failed.push(a),complete:id=>done.push(id)}
  await cache.drainLeadCache(repo);assert.deepEqual(failed,[['one',0]]);assert.deepEqual(done,[])
  pending.push({id:'one',kind:'contribute',payload:'{}',attempts:1});mode='ok'
  await cache.drainLeadCache(repo);assert.deepEqual(done,['one']);assert.ok(calls>=6)
 }finally{if(original)require.cache[path]=original;else delete require.cache[path]}
})
