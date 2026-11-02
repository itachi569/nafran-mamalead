const assert=require('node:assert/strict'),{chromium}=require('playwright')
const {ChromiumMapsProvider}=require('../dist-electron/scraper/chromium-maps.js')
const {CachedMapsProvider}=require('../dist-electron/scraper/cached-maps.js')
const {IdentitySet,cacheKeyFor}=require('../dist-electron/scraper/cache-key.js')
const {normaliseQuery}=require('../dist-electron/scraper/types.js')
;(async()=>{
 const browser=await chromium.launch({headless:true}),context=await browser.newContext(),posts=[],events=[]
 const q=normaliseQuery({keywords:['dentist','dental clinic'],location:'Lahore',region:'pk',language:'en',maxResultsPerKeyword:4,maxResultsTotal:6,headless:false,detail:false})
 await context.route('**/*',r=>r.fulfill({contentType:'text/html',body:`<main role="main"><div role="feed">${Array.from({length:6},(_,i)=>`<div jsaction="card"><a class="hfpxzc" aria-label="Dentist ${i}" href="https://www.google.com/maps/place/Dentist?cid=${100000+i}">Place</a><div class="W4Efsd">Dentist · ${i} Lahore</div></div>`).join('')}</div><p>You've reached the end of the list</p></main>`}))
 try{
  const inner=new ChromiumMapsProvider({context});inner.pause=async()=>{}
  const original=inner.run.bind(inner),limits=[];inner.run=async(query,...args)=>{limits.push(query.maxResultsTotal);return original(query,...args)}
  const places=Array.from({length:2},(_,i)=>({name:'Dentist '+i,category:'Dentist',address:i+' Lahore',area:'Lahore',postcode:'',phone:'',website:'',rating:null,reviewCount:null,latitude:null,longitude:null,placeRef:String(100000+i),mapsUrl:'https://www.google.com/maps/place/Dentist?cid='+(100000+i),placeKey:'cid:'+(100000+i),scrapedAt:new Date().toISOString()}))
  const deps={enabled:true,known:new IdentitySet(),seeds:new Map(),reservationId:null,appVersion:'test',diagnostics:()=>{},sleep:async()=>{},enqueue:(kind,body)=>posts.push(body),lookup:async()=>({enabled:true,warmBrowser:true,results:[{cacheKey:cacheKeyFor('dentist','Lahore','pk','en'),places,stale:0,exhausted:false}]})}
  const provider=new CachedMapsProvider(inner,deps,'real-browser')
  const leads=await provider.run(q,p=>{events.push(p);if(p.lead&&events.filter(e=>e.lead).length===1)assert.ok(context.pages().some(page=>page.url().includes('/maps/search/')),'visible flow prepares Maps before cached results')},new AbortController().signal)
  assert.equal(leads.length,6);assert.equal(new Set(leads.map(p=>p.placeRef)).size,6);assert.deepEqual(limits,[2,2])
  assert.equal(posts.reduce((n,b)=>n+b.places.length,0),4)
  assert.equal(events.filter(p=>p.lead&&p.keywordIndex===0).length,4)
  assert.equal(events.filter(p=>p.lead&&p.keywordIndex===1).length,2)
  assert.equal(context.pages().length>0,true,'adopted browser survives between keyword shortfalls')
  console.log('PASS actual Chromium cache wrapper: warm Maps page, per-keyword shortfalls, skip-before-count, 6 unique results, only 4 live contributions')
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1})
