// Synthetic large workspace; never reads or changes the user's saved data.
const { _electron }=require('playwright');
const {mkdtempSync,mkdirSync,writeFileSync}=require('node:fs');
const {join,resolve}=require('node:path');const {tmpdir}=require('node:os');const assert=require('node:assert/strict');
const {LocalDatabase}=require('../dist-electron/db/local-db.js');
(async()=>{
 const packaged=process.argv.includes('--packaged'),baseline=process.argv.includes('--baseline');
 const dir=mkdtempSync(join(tmpdir(),'mamalead-navigation-')),user=join(dir,'userdata');mkdirSync(user);
 const db=new LocalDatabase(join(user,'leads.db')),w=db.ensureWorkspace();
 const lead=db.prepare('insert into leads(id,workspace_id,name,phone,website,area,provider,captured_at) values(?,?,?,?,?,?,?,?)');
 const email=db.prepare('insert into lead_contacts(id,lead_id,workspace_id,kind,value,created_at) values(?,?,?,?,?,?)');
 const social=db.prepare('insert into social_profiles(id,workspace_id,lead_id,platform,profile_url,discovered_at,updated_at) values(?,?,?,?,?,?,?)');
 const run=db.prepare('insert into scrape_runs(id,workspace_id,status,keywords,location,started_at,finished_at,found) values(?,?,?,?,?,?,?,?)');
 db.transaction(()=>{for(let i=0;i<500;i++){const id='speed-'+i,at=new Date(Date.UTC(2026,9,1,0,i)).toISOString();lead.run(id,w.id,'Speed Clinic '+i,'+442070'+String(i).padStart(4,'0'),'https://clinic-'+i+'.example.test','London','import',at);email.run('e'+i,id,w.id,'email','hello@clinic-'+i+'.example.test',at);social.run('s'+i,w.id,id,'instagram','https://instagram.com/speedclinic'+i,at,at);}for(let i=0;i<200;i++){const at=new Date(Date.UTC(2026,9,1,0,i)).toISOString();run.run('run-'+i,w.id,'done','["clinic"]','London',at,at,20);}});db.close();
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;delete env.VITE_DEV_SERVER_URL;
 const app=await _electron.launch({...(packaged?{executablePath:resolve('release/win-unpacked/MamaLead.exe')}:{args:['.']}),args:[...(packaged?[]:['.']),`--user-data-dir=${user}`,'--disable-renderer-backgrounding','--disable-background-timer-throttling'],cwd:process.cwd(),env,timeout:60000});
 try {
  const p=await app.firstWindow();
  await app.evaluate(({ipcMain,BrowserWindow})=>{ipcMain.removeHandler('billing:status');ipcMain.handle('billing:status',()=>({connected:true,coreLicenseActive:true,lifetime:{active:true},license:{active:true,kind:'lifetime'}}));const w=BrowserWindow.getAllWindows()[0];w.show();w.focus();});
  const errors=[];p.on('pageerror',e=>errors.push(e.message));await p.reload();await p.bringToFront();await p.locator('[data-view="dashboard"]').waitFor();await p.waitForTimeout(1500);
  const samples=[];
  for(let round=0;round<2;round++)for(const view of ['email','phone','social','leads','settings','maps','dashboard']){
   const result=await p.evaluate(async view=>{const start=performance.now();document.querySelector('[data-view="'+view+'"]').click();await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));return{view,ms:Math.round(performance.now()-start),scrollY};},view);samples.push({...result,round});await p.waitForTimeout(200);
  }
  await p.locator('[data-view="email"]').click();await p.getByRole('button',{name:'Import websites',exact:true}).click();await p.locator('[data-impmodal]').waitFor();await p.keyboard.press('Escape');
  await p.locator('[data-theme-btn]').click();await p.waitForFunction(()=>document.body.dataset.theme==='dark');await p.locator('[data-view="phone"]').click();await p.waitForTimeout(200);
  assert.ok(await p.locator('[data-phhead]').isVisible(),'phone table remains laid out in dark mode');
  await p.locator('[data-theme-btn]').click();await p.waitForFunction(()=>document.body.dataset.theme==='light');
  await p.setViewportSize({width:800,height:800});await p.waitForTimeout(200);assert.ok(await p.locator('[data-phhead]').isVisible(),'table remains responsive');
  assert.deepEqual(errors,[]);const sorted=samples.map(x=>x.ms).sort((a,b)=>a-b);const median=sorted[Math.floor(sorted.length/2)],max=sorted.at(-1);
  const report={packaged,baseline,leads:500,savedRuns:200,medianMs:median,maxMs:max,samples,rendererErrors:errors};writeFileSync(resolve('../../outputs/page-navigation-'+(baseline?'before':packaged?'packaged':'after')+'.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
  if(!baseline){assert.ok(median<500,'Median page switch exceeds 500ms');assert.ok(max<1500,'A page switch blocked beyond 1.5 seconds');}
 }finally{await app.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
