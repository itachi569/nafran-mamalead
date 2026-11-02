// Real Electron renderer, IPC, quota settlement, runner and SQLite. Only external services
// and Maps transport use fixtures; no customer data, licence or Google account is used.
const assert=require('node:assert/strict')
const {mkdtempSync,writeFileSync}=require('node:fs'),{join}=require('node:path'),{tmpdir}=require('node:os')
const {_electron}=require('playwright')
const {electronTestExecutable}=require('./electron-test-executable.cjs')
;(async()=>{
 const dir=mkdtempSync(join(tmpdir(),'mamalead-cache-ui-')),packaged=process.argv.includes('--packaged')
 const env={...process.env,LEADSNAP_BILLING_API_URL:'http://127.0.0.1:1'};delete env.ELECTRON_RUN_AS_NODE;delete env.VITE_DEV_SERVER_URL
 const app=await _electron.launch({executablePath:electronTestExecutable(packaged),args:[...(packaged?[]:['.']),'--user-data-dir='+dir],env,cwd:process.cwd(),timeout:60000})
 try{
  const page=await app.firstWindow({timeout:60000}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(20000)
  await app.evaluate(({app,ipcMain})=>{
   globalThis.fetch=async()=>new Response('{}',{status:503})
   const req=process.getBuiltinModule('module').createRequire(app.getAppPath()+'/package.json')
   const billing=req('./dist-electron/billing/client.js'),cache=req('./dist-electron/billing/lead-cache-client.js')
   const state=globalThis.__cacheQA={settled:[],requested:[],liveCalls:[],mode:'hit'}
   const status={connected:true,configured:true,coreLicenseActive:true,lifetime:{active:true},license:{active:true,kind:'lifetime'}}
   billing.requireActiveLicense=async()=>status;billing.billingStatus=async()=>status
   billing.billingReserveMaps=async n=>{state.requested.push(n);return{allowed:n,reservationId:'fixture-'+state.requested.length}}
   billing.billingSettleMaps=async(id,n)=>{state.settled.push(n);return{accepted:n}}
   billing.billingHeartbeatMaps=async()=>({})
   ipcMain.removeHandler('billing:status');ipcMain.handle('billing:status',()=>status)
   const {EnrichmentRunner}=req('./dist-electron/enrichment/runner.js')
   EnrichmentRunner.prototype.drain=async()=>{};EnrichmentRunner.prototype.prioritize=async()=>{}
   cache.drainLeadCache=async()=>{}
   const {ChromiumMapsProvider}=req('./dist-electron/scraper/chromium-maps.js')
   const {leadId}=req('./dist-electron/scraper/provider.js')
   const make=i=>({id:leadId('Dentist '+i,i+' Lahore',String(100000+i)),name:'Dentist '+i,category:'Dentist',address:i+' Lahore',area:'Lahore',postcode:'',phone:'+923'+String(i).padStart(9,'0'),website:'https://dentist'+i+'.com',rating:4,reviewCount:2,latitude:31.5+i/10000,longitude:74.3,placeRef:String(100000+i),mapsUrl:'https://www.google.com/maps/place/Test?cid='+(100000+i),provider:'chromium-maps',query:'dentist in Lahore',keyword:'dentist',capturedAt:new Date().toISOString()})
   cache.leadCacheLookup=async body=>{
    if(state.mode==='down')throw new Error('Fixture HTTP 503')
    const offset=state.mode==='cancel'?20:0
    return {enabled:true,warmBrowser:false,paceFactor:.5,results:body.queries.map(q=>({cacheKey:q.cacheKey,stale:0,exhausted:false,places:Array.from({length:5},(_,i)=>{
     const p=make(i+offset);return {...p,placeKey:'cid:'+p.placeRef,scrapedAt:new Date().toISOString(),enrichment:{scannedKinds:['email','phone','social'],emails:[{value:'hello@dentist'+(i+offset)+'.com',source:p.website+'/contact',score:80}],phones:[],socials:[],address:'',enrichedAt:new Date().toISOString()}}
    })}))}
   }
   ChromiumMapsProvider.prototype.run=async function(q,sink,signal){
    state.liveCalls.push(q.maxResultsTotal);const leads=[]
    for(let i=0;i<16;i++){
     signal.throwIfAborted();const lead=make(i);if(this.skip?.(lead))continue
     if(leads.length>=q.maxResultsTotal)break
     await new Promise(r=>setTimeout(r,80));leads.push(lead);sink({status:'running',lead,message:'Captured '+leads.length})
    }
    this.lastRunExhausted=leads.length<q.maxResultsTotal;return leads
   }
  })
  await page.evaluate(()=>{
   localStorage.setItem('mamalead.maps.draft',JSON.stringify({keywords:['dentist'],location:'Lahore',max:8}))
   localStorage.setItem('ls-scraper-settings',JSON.stringify({sessionMode:'guest',visible:false,windowChoiceVersion:1}))
  })
  await page.reload();await page.locator('[data-view="maps"]').click()
  await page.evaluate(()=>{window.__cacheEvents=[];window.__cacheDone=[];window.desktop.scraper.onProgress(p=>window.__cacheEvents.push(p));window.desktop.scraper.onDone(p=>window.__cacheDone.push(p))})
  await page.getByRole('button',{name:'Run with filters',exact:true}).click()
  await page.waitForFunction(()=>window.__cacheEvents.some(p=>p.lead),null,{timeout:30000})
  await page.getByRole('button',{name:'Minimize · keep scanning',exact:true}).click()
  await page.waitForFunction(()=>window.__cacheDone.length===1,null,{timeout:30000})
  await page.waitForFunction(()=>document.querySelectorAll('[data-maps-results-table] tbody tr').length===8)
  const first=await page.evaluate(()=>({done:window.__cacheDone[0],events:window.__cacheEvents.filter(p=>p.lead)}))
  assert.equal(first.done.status,'done');assert.equal(first.done.leads.length,8)
  assert.equal(new Set(first.events.map(e=>e.lead.placeRef)).size,8)
  assert.deepEqual(Object.keys(first.events[0]).sort(),Object.keys(first.events.at(-1)).sort(),'cached/live event shapes match')
  assert.ok(first.events.every(p=>p.provider==='chromium-maps'&&!JSON.stringify(p).includes('placeKey')))
  const liveState=await app.evaluate(({app})=>{
   const req=process.getBuiltinModule('module').createRequire(app.getAppPath()+'/package.json'),{db}=req('./dist-electron/db/index.js').openDatabase()
   return {...__cacheQA,runs:db.query('select id,provider,status,cache_hits from scrape_runs'),emails:db.query('select value,validation_status from lead_contacts where kind=\'email\''),outbox:db.query('select kind,payload from lead_cache_outbox')}
  })
  assert.deepEqual(liveState.settled,[8]);assert.deepEqual(liveState.liveCalls,[3]);assert.equal(liveState.runs[0].cache_hits,5)
  assert.equal(liveState.emails.length,5);assert.ok(liveState.emails.every(e=>e.validation_status===null))
  assert.equal(JSON.parse(liveState.outbox.find(r=>r.kind==='contribute').payload).places.length,3)
  // A second run with the cache server down still skips all 8 locally owned places.
  await app.evaluate(()=>{__cacheQA.mode='down'})
  await page.evaluate(()=>window.desktop.scraper.start({query:{keywords:['dentist'],location:'Lahore',maxResultsPerKeyword:8,maxResultsTotal:8,headless:true,detail:false}}))
  await page.waitForFunction(()=>window.__cacheDone.length===2)
  const second=await page.evaluate(()=>window.__cacheDone[1]);assert.equal(second.status,'done');assert.equal(second.leads.length,8)
  assert.ok(second.leads.every(p=>!first.done.leads.some(old=>old.placeRef===p.placeRef)))
  // Stop during a paced cached phase: settle exactly the rows already delivered.
  await app.evaluate(()=>{__cacheQA.mode='cancel'})
  await page.evaluate(()=>window.desktop.scraper.start({query:{keywords:['dentist'],location:'Lahore',maxResultsPerKeyword:8,maxResultsTotal:8,headless:true,detail:false}}))
  await page.waitForFunction(()=>window.__cacheEvents.some(p=>p.lead?.placeRef==='100020'))
  await page.evaluate(()=>window.desktop.scraper.stop())
  await page.waitForFunction(()=>window.__cacheDone.length===3)
  const third=await page.evaluate(()=>window.__cacheDone[2]);assert.equal(third.status,'cancelled');assert.ok(third.leads.length>=1&&third.leads.length<5)
  const final=await app.evaluate(({app})=>({version:app.getVersion(),settled:__cacheQA.settled}))
  assert.deepEqual(final.settled,[8,8,third.leads.length]);assert.deepEqual(errors,[])
  await page.screenshot({path:join(dir,'cache-scan.png')})
  const report={packaged,...final,cacheThenLive:[5,3],fallbackNewLeads:8,cancelledCount:third.leads.length,seededEmailValidity:'not checked',progressParity:true,rendererErrors:errors}
  writeFileSync(join(dir,'result.json'),JSON.stringify(report,null,2));console.log('PASS '+JSON.stringify(report));console.log('Evidence: '+dir)
 }catch(e){const p=await app.firstWindow();writeFileSync(join(dir,'failure.txt'),String(e)+'\n'+await p.locator('body').innerText());console.error('Evidence: '+dir);throw e}
 finally{await app.close()}
})().catch(e=>{console.error(e);process.exitCode=1})
