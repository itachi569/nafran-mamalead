// Actual Chromium provider and isolated SQLite DB. No Google/customer data or paid queries.
const assert=require('node:assert/strict'),{mkdtempSync}=require('node:fs'),{tmpdir}=require('node:os'),{join}=require('node:path')
const {chromium}=require('playwright')
const {ChromiumMapsProvider}=require('../dist-electron/scraper/chromium-maps.js')
const {SavedMapsPlaces,mapsPlaceIdentity}=require('../dist-electron/scraper/saved-places.js')
const {normaliseQuery}=require('../dist-electron/scraper/types.js')
const {LocalDatabase}=require('../dist-electron/db/local-db.js'),{Repository}=require('../dist-electron/db/repository.js')
;(async()=>{
 assert.equal(mapsPlaceIdentity('https://www.google.com/maps/place/Clinic/data=!1s0x123:0x10'), 'cid:16')
 const identity=new SavedMapsPlaces([{name:'Example Clinic',address:'10 Main Road, Lahore',placeRef:'0x123:0x10'}])
 assert.ok(identity.has({mapsUrl:'https://maps.google.com/?cid=16&hl=en'}))
 assert.ok(identity.has({name:'EXAMPLE Clinic',address:'10 Main Road Lahore'}))
 assert.ok(!identity.has({name:'Example Clinic',address:'20 Main Road Lahore'}),'same-name branches are different places')
 assert.ok(!identity.has({name:'Example Clinic'}),'a name alone is not a duplicate')
 const db=new LocalDatabase(join(mkdtempSync(join(tmpdir(),'maps-repeat-')),'leads.db')),repo=new Repository(db),ws=db.ensureWorkspace().id
 const browser=await chromium.launch({headless:true})
 const query=normaliseQuery({keywords:['dentist'],location:'Lahore',maxResultsTotal:200,maxResultsPerKeyword:200,detail:false})
 const at=new Date().toISOString()
 const summary=(runId,leads,status='done')=>({runId,provider:'chromium-maps',status,keywords:['dentist'],location:'Lahore',maxResultsPerKeyword:200,detail:false,startedAt:at,finishedAt:at,durationMs:0,error:null,leads})
 const allNames=new Set()
 try{
  // The DOM replaces each batch: collecting only its final cards would lose the earlier ones.
  for(const [iteration,expected] of [200,200,50,0].entries()) {
   const context=await browser.newContext(),events=[]
   await context.route('**/*',route=>route.fulfill({contentType:'text/html',body:`<main role="main"><div role="feed" style="height:100px;overflow:auto"></div></main><script>
    let count=0; const feed=document.querySelector('[role=feed]');
    function batch(){let html='';for(let i=count;i<Math.min(count+50,450);i++)html+='<div jsaction="card" style="height:40px"><a class="hfpxzc" aria-label="Dental Clinic '+i+'" href="https://www.google.com/maps/place/clinic-'+i+'/data=!1s0x123:0x'+(1000+i).toString(16)+'">Place</a><div class="W4Efsd">Dentist · '+i+' Main Road, Lahore</div></div>';count+=50;feed.innerHTML=html;feed.scrollTop=0;if(count>=450)document.body.insertAdjacentHTML('beforeend',"<p>You've reached the end of the list</p>");}
    feed.addEventListener('scroll',()=>{if(feed.scrollTop>0&&count<450)setTimeout(batch,40)});batch();
   </script>`}))
   const provider=new ChromiumMapsProvider({context,savedPlaces:repo.savedMapsPlaces(ws)})
   provider.pause=async()=>{}
   try{
    const leads=await provider.run(query,event=>{events.push(event);if(event.lead)repo.saveRun(ws,summary('repeat-'+iteration,[event.lead],'running'))},new AbortController().signal)
    assert.equal(leads.length,expected,`scan ${iteration+1} returns only new leads`)
    assert.equal(events.filter(e=>e.lead).length,expected)
    for(const lead of leads){assert.ok(!allNames.has(lead.name),'previously saved business must not be streamed/counted');allNames.add(lead.name)}
    repo.saveRun(ws,summary('repeat-'+iteration,leads))
    assert.equal(repo.listRuns(ws,10).find(run=>run.id==='repeat-'+iteration).found,expected)
    assert.equal(repo.savedMapsPlaces(ws).size,allNames.size,'no duplicate DB records')
    if(iteration)assert.ok(events.some(e=>/already saved/.test(e.collectionNote??'')))
    console.log('PASS repeated same keyword/area: scan '+(iteration+1)+' requested 200, returned '+expected+' new, total DB '+allNames.size)
   }finally{await context.close()}
  }
  assert.equal(allNames.size,450)
  // Legacy records without a Maps ID still skip by name + full address, not website/name alone.
  const context=await browser.newContext()
  await context.route('**/*',route=>route.fulfill({contentType:'text/html',body:`<h1 class="DUwDvf">Dental Clinic 0</h1><button jsaction="category">Dentist</button><button data-item-id="address" aria-label="Address: 0 Main Road, Lahore"></button>`}))
  try{
   const provider=new ChromiumMapsProvider({context,savedPlaces:repo.savedMapsPlaces(ws)})
   assert.equal((await provider.run({...query,detail:true},()=>{},new AbortController().signal)).length,0)
  }finally{await context.close()}
  console.log('PASS repeat-scan identities: ID/URL variants, branches, legacy name/address, no stored data modified')
 }finally{await browser.close();db.close()}
})().catch(error=>{console.error(error);process.exitCode=1})
