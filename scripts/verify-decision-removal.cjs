const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os')
const {_electron}=require('playwright')
const root=path.resolve(__dirname,'..'),packaged=process.argv.includes('--packaged')
const out=path.resolve(root,'../../outputs/decision-removal-qa');fs.mkdirSync(out,{recursive:true})
async function main(){
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;delete env.VITE_DEV_SERVER_URL
 const executable=require('./electron-test-executable.cjs').electronTestExecutable(packaged)
 const app=await _electron.launch({executablePath:executable,args:[...packaged?[]:[root],'--user-data-dir='+fs.mkdtempSync(path.join(os.tmpdir(),'mamalead-retired-module-'))],env,timeout:60000})
 const checks=[]
 try{
  checks.push(...await app.evaluate(async({app,ipcMain})=>{
   const path=process.getBuiltinModule('path'),fs=process.getBuiltinModule('fs'),req=process.getBuiltinModule('module').createRequire(path.join(app.getAppPath(),'package.json')),assert=req('node:assert/strict')
   const {LocalDatabase}=req('./dist-electron/db/local-db.js'),{Repository}=req('./dist-electron/db/repository.js'),{EnrichmentRunner}=req('./dist-electron/enrichment/runner.js'),{buildExport,buildFormattedExport}=req('./dist-electron/export/writer.js')
   const db=new LocalDatabase(path.join(app.getPath('userData'),'preservation-test.db')),repo=new Repository(db),ws=db.ensureWorkspace().id,at=new Date().toISOString()
   db.run('insert into leads(id,workspace_id,name,website,provider,captured_at) values(?,?,?,?,?,?)',['saved',ws,'Saved business','https://saved.test','import',at])
   db.run('insert into decision_makers(id,workspace_id,lead_id,full_name,email,title,created_at) values(?,?,?,?,?,?,?)',['old-owner',ws,'saved','Saved Owner','owner@example.test','Founder',at])
   for(const kind of ['decision-maker','deep']){
    assert.throws(()=>repo.queueJob(ws,kind,['saved']),/no longer available/)
    db.run('insert into enrichment_jobs(id,workspace_id,kind,lead_ids,options,status,created_at) values(?,?,?,?,?,?,?)',[kind,ws,kind,'["saved"]','{}','queued',at])
   }
   req('./dist-electron/enrichment/website.js').WebsiteEnricher.prototype.inspectPhoneFast=async url=>({emails:[],phones:[{value:'+442079460123',page:url,score:95}],socials:[],people:[],addresses:[],pagesRead:[url],error:null})
   const authorized=[];const worker=new EnrichmentRunner(db,repo,{authorize:async kind=>{authorized.push(kind)}})
   await worker.drain();assert.deepEqual(authorized,[])
   assert.equal(db.one("select count(*) n from enrichment_jobs where status='failed'").n,2)
   const next=repo.queueJob(ws,'phone',['saved']);await worker.drain();assert.equal(repo.jobStatus(ws,next.jobId).status,'done',JSON.stringify(repo.jobStatus(ws,next.jobId)));assert.ok(authorized.length && authorized.every(kind=>kind==='phone'))
   assert.equal(db.one('select count(*) n from decision_makers').n,1);assert.equal(repo.addDecisionMaker,undefined)
   const request={kind:'leads',limit:10,delimiter:',',columns:['Business name','Domain','Email'],fileName:'leads.csv'}
   assert.throws(()=>buildExport(repo,ws,{...request,kind:'people'}),/no longer available/)
   assert.equal(buildExport(repo,ws,request).rows,1)
   for(const format of ['pdf','xlsx'])assert.ok(await buildFormattedExport(repo,ws,{...request,format}))
   await assert.rejects(()=>req('./dist-electron/billing/client.js').billingCheckout('decisionMaker',''),/no longer available/)
   for(const name of ['owner-search','google-browser','dataforseo','owner-sitemap','owner-story'])assert.equal(fs.existsSync(path.join(app.getAppPath(),'dist-electron/enrichment',name+'.js')),false,name)
   const nav=req('./dist-electron/assist-navigation.js');assert.equal(nav.assistDestinations.dm,undefined);assert.deepEqual(nav.assistShortcuts('find owner email','Decision Makers','dashboard'),[])
   db.close()
   ipcMain.removeHandler('billing:status');ipcMain.handle('billing:status',()=>({connected:true,configured:true,mode:'test',coreLicenseActive:true,license:{active:true,kind:'lifetime'},lifetime:{active:true,currency:'pkr',amount:1000000,interval:null},decisionMaker:{active:true,currency:'pkr',amount:100000,periodDays:30,monthlyLimit:1000,monthlyRemaining:1000}}))
   return ['Retired queue requests rejected; legacy jobs terminate without search/authorization','Next Phone job completes; saved owner records preserved','Owner export/purchase rejected; Leads PDF/Excel still generate','Owner search modules absent from build and Assist navigation']
  }))
  const page=await app.firstWindow(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.setViewportSize({width:1350,height:900});await page.reload()
  await page.evaluate(()=>localStorage.setItem('nafran.notifications',JSON.stringify([
   {id:'saved-owner-note',title:'Owner email scan finished',body:'Previous scan',at:new Date().toISOString(),level:'success',unread:true,action:{type:'view',view:'dm'}},
   {id:'saved-email-note',title:'Email scan finished',body:'Previous email scan',at:new Date().toISOString(),level:'success',unread:true,action:{type:'view',view:'email'}},
  ])));await page.reload()
  await page.locator('[data-view="dashboard"]').waitFor()
  await page.locator('[data-notifications-button]').click()
  assert.equal(await page.locator('[data-note="saved-owner-note"]').count(),0)
  await page.locator('[data-note="saved-email-note"] strong').click()
  assert.equal(await page.locator('[data-note="saved-email-note"]').getAttribute('data-unread'),'no')
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('nafran.notifications')).some(item=>item.id==='saved-owner-note')),true)
  await page.locator('[data-notifications-close]').click()
  checks.push('Legacy owner notifications hidden without deleting history; remaining notifications mark read')
  assert.equal(await page.locator('[data-view="dm"]').count(),0)
  const bridge=await page.evaluate(()=>({ownerBrowser:!!window.desktop.ownerBrowser,deep:!!window.desktop.deep,people:!!window.desktop.local.people}));assert.deepEqual(bridge,{ownerBrowser:false,deep:false,people:false})
  for(const kind of ['decision-maker','deep']){await assert.rejects(()=>page.evaluate(kind=>window.desktop.local.jobs.queue(kind,['legacy']),kind),/no longer available/)}
  for(const view of ['dashboard','maps','social','email','phone','website','leads','lists','runs','settings']){
   await page.locator('[data-view="'+view+'"]').click();await page.waitForTimeout(120)
   const body=await page.locator('body').innerText();assert.doesNotMatch(body,/Decision Makers|Owner emails|LinkedIn DM|1,000 searches for 30 days/)
   assert.ok(body.length>500,'Empty page '+view)
  }
  for(const tab of ['plan','pay','inv','acct']){await page.locator('[data-stab="'+tab+'"]').click();assert.doesNotMatch(await page.locator('body').innerText(),/Decision Makers|owner email|Rs 1,000/)}
  await page.locator('[data-view="email"]').click();await page.getByRole('button',{name:'Import websites',exact:true}).click()
  const modal=page.locator('[data-impmodal]');await modal.locator('textarea').fill(Array.from({length:50},(_,i)=>`https://company${i}.test`).join('\n'));assert.equal(await modal.getByRole('button',{name:'Scan 50 sites',exact:true}).count(),1)
  await modal.getByRole('button',{name:'Cancel',exact:true}).click()
  await page.locator('[data-view="dashboard"]').click();await page.screenshot({path:path.join(out,packaged?'packaged-dashboard.png':'source-dashboard.png')})
  assert.deepEqual(errors,[]);checks.push('All ten remaining pages and Settings render without retired controls','Renderer bridge has no owner APIs; old queue payloads rejected','Shared import counts 50 websites correctly; no renderer errors')
  const report={passed:true,packaged,version:require('../package.json').version,checks};fs.writeFileSync(path.join(out,process.env.MAMALEAD_TEST_EXECUTABLE?'installed.json':packaged?'packaged.json':'source.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2))
 }finally{await app.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1})
