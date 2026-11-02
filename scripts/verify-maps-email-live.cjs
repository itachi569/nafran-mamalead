// Real renderer + SQLite with isolated fixtures. No customer records or live service calls.
const assert=require('node:assert/strict')
const {mkdtempSync,writeFileSync}=require('node:fs'),{tmpdir}=require('node:os'),{join,resolve}=require('node:path')
const {_electron}=require('playwright')
;(async()=>{
 const directory=mkdtempSync(join(tmpdir(),'mamalead-maps-email-')),packaged=process.argv.includes('--packaged')
 const env={...process.env,LEADSNAP_BILLING_API_URL:'http://127.0.0.1:1'};delete env.ELECTRON_RUN_AS_NODE;delete env.VITE_DEV_SERVER_URL
 const app=await _electron.launch({...(packaged?{executablePath:resolve(process.env.MAMALEAD_TEST_EXE || 'release/win-unpacked/MamaLead.exe')}:{}),args:[...(packaged?[]:['.']),'--user-data-dir='+directory],env,cwd:process.cwd(),timeout:60000})
 try{
  // Wait for the app to register its IPC handlers before replacing test-only responses.
  await app.firstWindow({timeout:60000})
  await app.evaluate(({app,ipcMain,BrowserWindow})=>{
   globalThis.fetch=async()=>new Response('{}',{status:503})
   const req=process.getBuiltinModule('module').createRequire(app.getAppPath()+'/package.json')
   const {db,repository:repo}=req('./dist-electron/db/index.js').openDatabase(),ws=db.ensureWorkspace().id
   const leads=[
    {name:'Same Name',website:'https://first.mamalead-qa.org',placeRef:'first'},
    {name:'Same Name',website:'https://second.mamalead-qa.org',placeRef:'second'},
    {name:'No Website Business',website:'',placeRef:'no-site'},
    {name:'No Published Email',website:'https://empty.mamalead-qa.org',placeRef:'empty'},
    {name:'Failed Email Scan',website:'https://failed.mamalead-qa.org',placeRef:'failed'},
   ].map(row=>({...row,address:row.placeRef+' Lahore',category:'Software company',phone:'+923001234567',area:'Lahore'}))
   const at=new Date().toISOString()
   repo.saveRun(ws,{runId:'email-test',provider:'chromium-maps',status:'done',keywords:['software house'],location:'Lahore',maxResultsPerKeyword:5,detail:true,durationMs:100,startedAt:at,finishedAt:at,error:null,leads})
   const rows=repo.listLeads(ws,{runId:'email-test',limit:20}).rows
   const ids=Object.fromEntries(rows.map(row=>[row.place_ref,row.id]))
   repo.upsertContact({leadId:ids.first,kind:'email',value:'hello@first.mamalead-qa.org',source:'https://first.mamalead-qa.org/contact'})
   const state=globalThis.__mapsEmail={db,repo,ws,ids,pending:[ids.second],outcomes:{[ids.empty]:{status:'not-published'},[ids.failed]:{status:'error',error:'Temporary network failure'}},win:BrowserWindow.getAllWindows()[0]}
   const override=(channel,handler)=>{ipcMain.removeHandler(channel);ipcMain.handle(channel,handler)}
   override('billing:status',()=>({connected:true,configured:true,coreLicenseActive:true,license:{active:true,kind:'lifetime'},lifetime:{active:true}}))
   override('db:jobs:covered',(_,payload)=>payload.kind==='email'?state.pending:[])
   override('db:jobs:outcomes',(_,payload)=>payload.kind==='email'?state.outcomes:{})
   override('enrichment:status',()=>({running:state.pending.length>0,pending:state.pending.length}))
  })
  const page=await app.firstWindow();page.setDefaultTimeout(15000);const errors=[];page.on('pageerror',e=>errors.push(e.message))
  await page.reload();await page.locator('[data-view="maps"]').click()
  const table=page.locator('[data-maps-results-table]'),row=host=>table.locator('tbody tr').filter({hasText:host})
  const emailCell=(host,text)=>row(host).locator('td').nth(4).filter({hasText:text})
  await emailCell('first.mamalead-qa.org','hello@first.mamalead-qa.org').waitFor()
  await emailCell('second.mamalead-qa.org','Finding email…').waitFor()
  assert.ok(!(await row('second.mamalead-qa.org').innerText()).includes('hello@first.mamalead-qa.org'),'same-name businesses must never share an email')
  assert.equal((await row('No Website Business').locator('td').nth(4).innerText()).split('\n').at(-1),'No email found')
  assert.equal((await row('No Website Business').locator('td').nth(2).innerText()),'No website')
  await emailCell('No Published Email','No email found').waitFor()
  await emailCell('Failed Email Scan','Email scan failed — retry').waitFor()
  // Keep the queue busy. A debounce that resets on every event would never refresh this email.
  const started=Date.now()
  await app.evaluate(()=>{
   const s=__mapsEmail
   s.repo.upsertContact({leadId:s.ids.second,kind:'email',value:'contact@second.mamalead-qa.org',source:'https://second.mamalead-qa.org/contact'})
   s.timer=setInterval(()=>s.win.webContents.send('enrichment:progress',{jobId:'fixture',runId:'email-test',kind:'email',status:'running',processed:1,total:2,found:1,failed:0,at:new Date().toISOString(),message:'Finding emails'}),80)
  })
  await emailCell('second.mamalead-qa.org','contact@second.mamalead-qa.org').waitFor({timeout:5000})
  const updateMs=Date.now()-started
  await app.evaluate(()=>{const s=__mapsEmail;clearInterval(s.timer);s.pending=[];s.win.webContents.send('enrichment:progress',{jobId:'fixture',runId:'email-test',kind:'email',status:'done',processed:2,total:2,found:1,failed:0,at:new Date().toISOString()})})
  await page.locator('[data-view="phone"]').click();await page.locator('[data-view="maps"]').click()
  await emailCell('second.mamalead-qa.org','contact@second.mamalead-qa.org').waitFor()
  await page.reload();await page.locator('[data-view="maps"]').click()
  await emailCell('second.mamalead-qa.org','contact@second.mamalead-qa.org').waitFor()
  assert.deepEqual(errors,[])
  const report={packaged,version:await app.evaluate(({app})=>app.getVersion()),emailUpdateMs:updateMs,sameNameIsolation:true,noWebsiteLabel:true,pendingAndFailureStates:true,survivesNavigationAndReload:true,rendererErrors:errors}
  writeFileSync(join(directory,'result.json'),JSON.stringify(report,null,2));console.log('PASS '+JSON.stringify(report));console.log('Evidence: '+directory)
 }finally{await app.close()}
})().catch(e=>{console.error(e);process.exitCode=1})
