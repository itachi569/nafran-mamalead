// Actual provider + Chromium parsing on controlled Google Maps pages. No customer data/network.
const assert=require('node:assert/strict')
const {chromium}=require('playwright')
const {ChromiumMapsProvider}=require('../dist-electron/scraper/chromium-maps.js')
const {normaliseQuery}=require('../dist-electron/scraper/types.js')
const esc=s=>s.replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;')
const card=(row,i)=>`<div jsaction="card"><a class="hfpxzc" aria-label="${esc(row.name)}" href="https://www.google.com/maps/place/${i}">Place</a><div class="W4Efsd">${esc(row.category)} · ${i} Lahore</div></div>`
async function scenario(browser,{rows,cap=20,keywords=['software house'],relevanceKeywords,expected,slow=false,single=false}) {
 const context=await browser.newContext(); const progress=[]; let visits=0
 await context.route('**/*',async route=>{
  const url=new URL(route.request().url()); const index=Number(url.pathname.split('/').at(-1))
  if(url.pathname.startsWith('/maps/place/') || single){
   visits++;const row=rows[single?0:index]
   return route.fulfill({contentType:'text/html',body:`<main role="main"><h1 class="DUwDvf">${esc(row.name)}</h1><button jsaction="category">${esc(row.category)}</button><button data-item-id="address" aria-label="Address: ${index} Lahore"></button></main>`})
  }
  const initial=slow?rows.slice(0,2):rows
  const rest=rows.slice(2).map((row,i)=>card(row,i+2)).join('')
  await route.fulfill({contentType:'text/html',body:`<main role="main"><div role="feed">${initial.map(card).join('')}</div>${slow?`<script>setTimeout(()=>{document.querySelector('[role=feed]').insertAdjacentHTML('beforeend',${JSON.stringify(rest)});document.body.insertAdjacentHTML('beforeend',"<p>You've reached the end of the list</p>")},3400)</script>`:"<p>You've reached the end of the list</p>"}</main>`})
 })
 const provider=new ChromiumMapsProvider({context});provider.pause=async()=>{}
 try{
  const leads=await provider.run(normaliseQuery({keywords,relevanceKeywords,location:'Lahore',maxResultsTotal:cap,maxResultsPerKeyword:cap}),e=>progress.push(e),new AbortController().signal)
  assert.deepEqual(leads.map(x=>x.name),expected)
  assert.deepEqual(progress.filter(x=>x.lead).map(x=>x.lead.name),expected,'only relevant leads streamed for persistence')
  assert.ok(progress.every(x=>(x.found??0)<=cap))
  assert.equal(visits,single?1:expected.length,'irrelevant feed categories and accepted duplicates do not trigger detail requests')
  if(slow) assert.ok(progress.some(x=>/reached the end/.test(x.collectionNote??'')))
  console.log(`PASS provider relevance: ${rows.length} candidates, cap ${cap}, ${leads.length} accepted, ${visits} detail visits${slow?' (delayed feed)':''}${single?' (single place)':''}`)
 }finally{await context.close()}
}
(async()=>{
 const browser=await chromium.launch({headless:true})
 try{
  const bad=Array.from({length:12},(_,i)=>({name:`Unrelated ${i}`,category:['Marketing agency','Computer software store','Website designer'][i%3]}))
  const good=Array.from({length:40},(_,i)=>({name:`Matching Business ${i}`,category:'Software company'}))
  await scenario(browser,{rows:[...bad,...good],cap:20,expected:good.slice(0,20).map(x=>x.name)})
  await scenario(browser,{rows:[...bad,...good.slice(0,10)],cap:200,expected:good.slice(0,10).map(x=>x.name)})
  await scenario(browser,{rows:bad,expected:[]})
  await scenario(browser,{rows:[...bad.slice(0,2),...good.slice(0,5)],expected:good.slice(0,5).map(x=>x.name),slow:true})
  await scenario(browser,{rows:[{name:'Software House Cafe',category:'Restaurant'}],expected:[],single:true})
  await scenario(browser,{rows:good.slice(0,1),expected:[good[0].name],single:true})
  await scenario(browser,{rows:good.slice(0,3),keywords:['software house Gulberg','software house Johar Town'],relevanceKeywords:['software house','software house'],expected:good.slice(0,3).map(x=>x.name)})
  await scenario(browser,{rows:[{name:'Multi Service Business',category:'Marketing agency'}],keywords:['software house','marketing agency'],expected:['Multi Service Business']})
  const context=await browser.newContext(),starts=[]
  await context.route('**/*',async route=>{
   if(route.request().url().includes('/maps/place/')) {
    starts.push(Date.now());await new Promise(resolve=>setTimeout(resolve,600))
    return route.fulfill({contentType:'text/html',body:`<h1 class="DUwDvf">Business ${starts.length}</h1><button jsaction="category">Software company</button>`})
   }
   return route.fulfill({contentType:'text/html',body:`<main role="main"><div role="feed">${good.slice(0,2).map(card).join('')}</div><p>You've reached the end of the list</p></main>`})
  })
  try {
   const provider=new ChromiumMapsProvider({context})
   const leads=await provider.run(normaliseQuery({keywords:['software house'],location:'Lahore',maxResultsTotal:2,minDelayMs:1000,maxDelayMs:1000}),()=>{},new AbortController().signal)
   assert.equal(leads.length,2)
   const spacing=starts[1]-starts[0]
   assert.ok(spacing>=950&&spacing<1500,`page-read time must count toward pacing: ${spacing}ms`)
   console.log(`PASS paced navigation: ${spacing}ms between requests including 600ms page load (no additional full-second wait)`)
  } finally {await context.close()}
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1})
