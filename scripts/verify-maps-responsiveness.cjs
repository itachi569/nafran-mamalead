// Isolated packaged-app test: synthetic scan traffic, real renderer and SQLite; no live APIs.
const assert=require('node:assert/strict')
const {mkdtempSync,mkdirSync,writeFileSync}=require('node:fs')
const {join,resolve}=require('node:path')
const {tmpdir}=require('node:os')
const {_electron}=require('playwright')
const {LocalDatabase}=require('../dist-electron/db/local-db.js')
;(async()=>{
 const directory=mkdtempSync(join(tmpdir(),'mamalead-maps-responsive-')),user=join(directory,'profile')
 mkdirSync(user)
 const db=new LocalDatabase(join(user,'leads.db')),workspace=db.ensureWorkspace()
 const insert=db.prepare('insert into leads(id,workspace_id,name,category,website,provider,captured_at) values(?,?,?,?,?,?,?)')
 db.transaction(()=>{for(let i=0;i<1000;i++)insert.run('saved-'+i,workspace.id,'Saved Business '+i,'Software company','https://example.test','import',new Date().toISOString())})
 db.close()
 const env={...process.env,LEADSNAP_BILLING_API_URL:'http://127.0.0.1:1'}
 delete env.ELECTRON_RUN_AS_NODE;delete env.VITE_DEV_SERVER_URL
 const packaged=process.argv.includes('--packaged')
 const desktop=await _electron.launch({...(packaged?{executablePath:resolve(process.env.MAMALEAD_TEST_EXE || 'release/win-unpacked/MamaLead.exe')}:{}),
  args:[...(packaged?[]:['.']),`--user-data-dir=${user}`],env,cwd:process.cwd(),timeout:60000})
 try{
  await desktop.firstWindow({timeout:60000})
  await desktop.evaluate(({ipcMain})=>{
   globalThis.fetch=async()=>new Response('{}',{status:503})
   ipcMain.removeHandler('billing:status')
   ipcMain.handle('billing:status',()=>({connected:true,coreLicenseActive:true,lifetime:{active:true},license:{active:true,kind:'lifetime'}}))
   for(const channel of ['scraper:start','scraper:runWithGoogle']) {ipcMain.removeHandler(channel);ipcMain.handle(channel,()=>({runId:'fixture-scan'}))}
  })
  const page=await desktop.firstWindow(),errors=[]
  page.setDefaultTimeout(15000)
  page.on('pageerror',e=>errors.push(e.message))
  await page.evaluate(()=>{
   localStorage.setItem('mamalead.maps.draft',JSON.stringify({keywords:['software house'],location:'Lahore',max:200}))
   localStorage.setItem('ls-scraper-settings',JSON.stringify({sessionMode:'guest',visible:false,windowChoiceVersion:1}))
  })
  await page.reload();await page.locator('[data-view="maps"]').click()
  await page.waitForTimeout(700)
  const packagedFilter=await desktop.evaluate(({app})=>{
   const require=process.getBuiltinModule('module').createRequire(app.getAppPath()+'/package.json')
   const {mapsBusinessRelevant}=require(app.getAppPath()+'/dist-electron/scraper/relevance.js')
   return [mapsBusinessRelevant('software house','Pakistan',{name:'App Studio',category:'Software company'}),mapsBusinessRelevant('software house','Pakistan',{name:'Software House Cafe',category:'Restaurant'})]
  })
  assert.deepEqual(packagedFilter,[true,false],'running executable contains the keyword fix')
  await page.getByRole('button',{name:'Run with filters',exact:true}).click()
  await page.getByRole('button',{name:'Minimize · keep scanning',exact:true}).click()
  await page.evaluate(()=>{window.__progressCheck={count:0,last:0};window.desktop.scraper.onProgress(event=>{window.__progressCheck.count++;window.__progressCheck.last=event.found})})
  await desktop.evaluate(({BrowserWindow})=>{
   const win=BrowserWindow.getAllWindows()[0]
   globalThis.__mapsFixture={win,leads:[],i:0}
   const state=globalThis.__mapsFixture
   state.timer=setInterval(()=>{
    const i=state.i++
    if(i>=200){clearInterval(state.timer);return}
    const lead={id:'new-'+i,name:'Matching Business '+i,category:'Software company',address:i+' Lahore',area:'Lahore',postcode:'',phone:'',website:'https://example.test',rating:4,reviewCount:1,latitude:31.5+i/10000,longitude:74.3,placeRef:'fixture-'+i,mapsUrl:'https://www.google.com/maps/place/'+i,query:'software house in Lahore',keyword:'software house',provider:'chromium-maps',capturedAt:new Date().toISOString()}
    state.leads.push(lead)
    const event={runId:'fixture-scan',status:'running',provider:'chromium-maps',keyword:'software house',keywordIndex:0,keywordTotal:1,found:i+1,target:200,message:'Captured '+(i+1),at:new Date().toISOString(),lead}
    win.webContents.send('scraper:progress',event)
    if(i%10===0)win.webContents.send('scraper:progress',event) // duplicate delivery must not duplicate rows
   },15)
  })
  // Actual window minimisation happens before the live stream finishes.
  const beforeMinimize=await desktop.evaluate(({BrowserWindow})=>{const n=globalThis.__mapsFixture.leads.length;BrowserWindow.getAllWindows()[0].minimize();return n})
  await new Promise(resolve=>setTimeout(resolve,400))
  const afterMinimize=await desktop.evaluate(({BrowserWindow})=>{const n=globalThis.__mapsFixture.leads.length;const win=BrowserWindow.getAllWindows()[0];win.restore();win.focus();return n})
  assert.ok(beforeMinimize<200&&afterMinimize>beforeMinimize,'scan continues while the window is minimised')
  const samples=[]
  const cdp=await page.context().newCDPSession(page)
  await cdp.send('Profiler.enable');await cdp.send('Profiler.start')
  await page.evaluate(()=>{window.__navigationSamples=[];window.__longTasks=[];new PerformanceObserver(list=>window.__longTasks.push(...list.getEntries().map(e=>({start:e.startTime,duration:e.duration})))).observe({entryTypes:['longtask']})})
  for(const view of ['email','maps','phone','maps','social','maps','dashboard','maps']){
   const result=await page.evaluate(async view=>{const start=performance.now();document.querySelector('[data-view="'+view+'"]').click();await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));return{view,ms:Math.round(performance.now()-start)}},view)
   samples.push(result);await page.evaluate(result=>window.__navigationSamples.push({...result,visible:document.visibilityState,focused:document.hasFocus()}),result);await page.waitForTimeout(100)
  }
  const {profile}=await cdp.send('Profiler.stop');writeFileSync(join(directory,'navigation.cpuprofile'),JSON.stringify(profile))
  writeFileSync(join(directory,'navigation.json'),JSON.stringify(samples,null,2))
  await page.waitForFunction(()=>document.querySelector('[data-results]')?.textContent.includes('200 businesses captured'),null,{timeout:15000})
  while(await page.getByRole('button',{name:/^Show (?:all 200|\d+ more)$/,exact:true}).count()) {
   await page.getByRole('button',{name:/^Show (?:all 200|\d+ more)$/,exact:true}).click()
  }
  await page.waitForFunction(()=>document.querySelectorAll('[data-maps-results-table] tbody tr').length===200)
  assert.equal(new Set(await page.locator('[data-maps-results-table] tbody tr').allTextContents()).size,200,'all streamed leads survive batched paints')
  // Queue one final progress event followed immediately by completion: no stale timer may
  // overwrite the final state or bring the running panel back.
  await desktop.evaluate(()=>{
   const {win,leads}=globalThis.__mapsFixture
   win.webContents.send('scraper:progress',{runId:'fixture-scan',status:'running',found:200,target:200,message:'Last update',at:new Date().toISOString()})
   win.webContents.send('scraper:done',{runId:'fixture-scan',status:'done',provider:'chromium-maps',query:{keywords:['software house'],location:'Lahore',maxResultsPerKeyword:200,maxResultsTotal:200},leads,startedAt:new Date().toISOString(),finishedAt:new Date().toISOString(),durationMs:3500,error:null,stored:{saved:200}})
  })
  await page.waitForTimeout(450)
  assert.ok(!(await page.locator('body').innerText()).includes('Scraping…'),'completion cancels pending progress paint')
  await page.locator('[data-view="email"]').click()
  const emailHead=page.locator('[data-mailhead]')
  await emailHead.waitFor()
  const originalSize=await desktop.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].getSize())
  const checkColumns=async()=>{await page.waitForFunction(()=>{const head=document.querySelector('[data-mailhead]'),row=head?.nextElementSibling?.querySelector('[data-rowgrid]');return head&&row&&(head.style.display==='none'?row.style.display==='flex':head.style.gridTemplateColumns!==''&&head.style.gridTemplateColumns===row.style.gridTemplateColumns)})}
  await checkColumns()
  await desktop.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(980,800))
  await page.waitForTimeout(150);await checkColumns()
  await desktop.evaluate(({BrowserWindow},size)=>BrowserWindow.getAllWindows()[0].setSize(...size),originalSize)
  await page.waitForTimeout(150);await checkColumns()
  const wideColumns=await emailHead.evaluate(el=>el.style.gridTemplateColumns)
  await page.locator('[data-theme-btn]').click();await page.waitForTimeout(150)
  assert.equal(await emailHead.evaluate(el=>el.style.gridTemplateColumns),wideColumns,'theme change preserves responsive columns')
  await page.locator('[data-theme-btn]').click()
  assert.deepEqual(errors,[])
  const sorted=samples.map(x=>x.ms).sort((a,b)=>a-b),median=sorted[Math.floor(sorted.length/2)],max=sorted.at(-1)
  assert.ok(median<500,`median navigation ${median}ms`);assert.ok(max<1500,`slowest navigation ${max}ms`)
  const report={packaged,version:await desktop.evaluate(({app})=>app.getVersion()),savedLeads:1000,scanLeads:200,minimizeRestore:true,responsiveLayout:true,leadsDuringMinimize:[beforeMinimize,afterMinimize],medianMs:median,maxMs:max,samples,rendererErrors:errors,keywordFilter:packagedFilter}
  writeFileSync(join(directory,'result.json'),JSON.stringify(report,null,2));console.log('PASS scan responsiveness '+JSON.stringify(report));console.log('Evidence: '+directory)
 }catch(error){
  const page=await desktop.firstWindow().catch(()=>null)
  const diagnostic={error:String(error),samples:page?await page.evaluate(()=>({navigation:window.__navigationSamples,longTasks:window.__longTasks})).catch(()=>null):null,received:page?await page.evaluate(()=>window.__progressCheck).catch(()=>null):null,fixture:await desktop.evaluate(()=>({count:globalThis.__mapsFixture?.i,leads:globalThis.__mapsFixture?.leads?.length})).catch(()=>null),body:page?await page.locator('body').innerText().catch(()=>null):null}
  writeFileSync(join(directory,'failure.json'),JSON.stringify(diagnostic,null,2));console.error('Failure evidence: '+directory);console.error(JSON.stringify(diagnostic));throw error
 }finally{await desktop.close()}
})().catch(e=>{console.error(e);process.exitCode=1})
