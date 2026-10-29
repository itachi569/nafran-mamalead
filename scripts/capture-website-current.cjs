// Isolated illustrative capture; never uses customer data or performs a purchase.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{createRequire}=require('node:module');
const root=path.resolve(__dirname,'..'),{_electron}=createRequire(path.join(root,'package.json'))('playwright'),out=path.join(root,'website/img/app/v1.4.18');fs.mkdirSync(out,{recursive:true});
(async()=>{
 const env={...process.env,APPDATA:fs.mkdtempSync(path.join(os.tmpdir(),'mamalead-site-private-'))};delete env.ELECTRON_RUN_AS_NODE;delete env.VITE_DEV_SERVER_URL;
 const app=await _electron.launch({executablePath:path.join(root,'release/owner-lookup/win-unpacked/MamaLead.exe'),args:['--user-data-dir='+fs.mkdtempSync(path.join(os.tmpdir(),'mamalead-site-latest-'))],env,timeout:60000});
 try{
  await app.evaluate(({app,ipcMain})=>{
   const path=process.getBuiltinModule('path'),req=process.getBuiltinModule('module').createRequire(path.join(app.getAppPath(),'package.json')),{db,repository}=req('./dist-electron/db/index.js').openDatabase(),ws=db.ensureWorkspace().id,{LOCAL_CHANNELS,registerLocalDatabase}=req('./dist-electron/db/ipc.js');
   for(const channel of LOCAL_CHANNELS)ipcMain.removeHandler(channel);registerLocalDatabase(db,repository,undefined,async()=>{});
   const names=['Cedar Dental','Maple Dental Studio','Willow Smile Clinic','Oak Dental Care','Birch Family Dental','Elm Dental Studio','Aspen Dental Care','Juniper Smile Clinic'];
   for(let run=0;run<3;run++){const end=new Date(Date.now()-run*86400000);repository.saveRun(ws,{runId:'sample-map-'+run,provider:'chromium-maps',status:'done',keywords:['dentists'],location:run===0?'Manchester':run===1?'Liverpool':'London',maxResultsPerKeyword:8,detail:true,startedAt:new Date(+end-67000).toISOString(),finishedAt:end.toISOString(),durationMs:67000,error:null,leads:names.map((name,i)=>({name:run?name+' '+['Central','North'][run-1]:name,category:'Dental clinic',address:`${12+i} Sample Street, ${run===0?'Manchester':run===1?'Liverpool':'London'}`,area:run===0?'Manchester':run===1?'Liverpool':'London',phone:i%4?'+44 161 496 00'+String(i+run*8).padStart(2,'0'):'',website:'https://'+name.toLowerCase().replace(/[^a-z]/g,'')+(run||'')+'.example',rating:4.2+(i%4)/5,reviewCount:27+i*13,placeRef:'fictional-'+run+'-'+i,latitude:53.48+i*.002,longitude:-2.24,keyword:'dentists'}))})}
   const leads=repository.listLeads(ws,{limit:100}).rows;
   for(const [i,lead] of leads.entries()){
    if(i%4!==0)repository.upsertContact({leadId:lead.id,kind:'email',value:'hello@'+new URL(lead.website).hostname,source:lead.website+'/contact-us',score:90});
    if(i%3!==0)repository.upsertSocialProfile({workspaceId:ws,leadId:lead.id,platform:'instagram',handle:'sampleclinic'+i,profileUrl:'https://instagram.com/sampleclinic'+i,source:'website'});
    if(i%2!==0)repository.upsertSocialProfile({workspaceId:ws,leadId:lead.id,platform:'facebook',handle:'sampleclinic'+i,profileUrl:'https://facebook.com/sampleclinic'+i,source:'website'});
    if(i%4===0)repository.upsertContact({leadId:lead.id,kind:'phone',value:'+44 161 496 00'+String(i).padStart(2,'0'),source:lead.website+'/contact-us',score:95});
    if(i%6===0)repository.addDecisionMaker({workspaceId:ws,leadId:lead.id,fullName:['Alex Morgan','Sam Taylor','Jordan Ellis','Casey Reed'][i/6],title:'Founder',emailEvidence:i===0?'search-index':'page',email:['alex','sam','jordan','casey'][i/6]+'@'+new URL(lead.website).hostname,source:lead.website+'/about'});
    db.run('update leads set last_scanned_at = ? where id = ?',[new Date().toISOString(),lead.id]);
   }
   const list=repository.createList(ws,'Manchester dental shortlist');repository.addLeadsToList(list.id,leads.slice(0,8).map(lead=>lead.id));
   const lookup=repository.startWebsiteLookup(ws,leads.slice(0,3).map(lead=>lead.website),{email:true,phone:true,social:true,address:true});
   for(const lead of leads.slice(0,3))repository.saveWebsiteLookupRow(lookup.jobId,{leadId:lead.id,businessName:lead.name,website:lead.website,status:'done',emails:[{value:'hello@'+new URL(lead.website).hostname,source:lead.website+'/contact-us'}],phones:[{value:lead.phone||'+441614960000',source:lead.website+'/contact-us'}],socials:[{platform:'facebook',url:'https://facebook.com/sampleclinic'}],address:lead.address,sources:[lead.website,lead.website+'/contact-us'],error:''});repository.markJob(lookup.jobId,'done',3);
   const override=(channel,fn)=>{ipcMain.removeHandler(channel);ipcMain.handle(channel,fn)};
   override('billing:status',()=>({connected:true,configured:true,mode:'live',coreLicenseActive:true,license:{active:true,kind:'lifetime',maxDevices:2,devicesUsed:1},lifetime:{active:true,amount:1000000,currency:'pkr',interval:null},decisionMaker:{active:true,status:'paid',monthlyLimit:1000,monthlyRemaining:840,monthlyUsed:160,renewsAt:new Date(Date.now()+25*86400000).toISOString(),amount:100000,currency:'pkr'}}));
   override('billing:invoices',()=>({invoices:[]}));override('notifications:show',()=>({shown:true}));
   req('./dist-electron/billing/client.js').billingAssistChat=async()=>({text:'Decision Makers mein scan ke baad Download PDF ya Download Excel choose karein. File mein owner email aur source bhi save hoga.',model:'illustrative-capture'});
   const updater=req('electron-updater').autoUpdater;
   updater.checkForUpdates=async()=>{updater.emit('checking-for-update');updater.emit('update-not-available',{version:'1.4.18'});return null};
   global.fetch=async()=>{throw Error('Network disabled in fictional screenshot workspace')};
  });
  const page=await app.firstWindow(),errors=[];page.on('pageerror',error=>errors.push(error.message));await page.setViewportSize({width:1440,height:960});
  await page.evaluate(()=>{localStorage.setItem('ls-theme','light');localStorage.setItem('mamalead.planWelcomeDismissed','1');localStorage.setItem('nafran.notifications',JSON.stringify([{id:'sample-scan',title:'Maps scrape complete',body:'8 leads captured near Manchester.',at:new Date().toISOString(),level:'success',unread:true,runId:'sample-map-0',kind:'scrape',chips:['8 leads'],action:{type:'view',view:'maps',runId:'sample-map-0',focus:'results'},actionLabel:'Review leads'},{id:'sample-import',title:'Phone scan finished',body:'Published phone results are ready to review.',at:new Date().toISOString(),level:'success',unread:true,kind:'import',action:{type:'view',view:'phone'},actionLabel:'Open Phone Finder'}]))});await page.reload();
  await page.locator('[data-view="dashboard"]').waitFor({timeout:60000});
  const welcome=page.getByRole('button',{name:'Dismiss trial and Lifetime notice'});if(await welcome.count())await welcome.click();
  if(process.env.CAPTURE_REPORTS_ONLY==='1'){
   await page.setViewportSize({width:1440,height:1200});
   await page.locator('[data-reports-card]').first().click();await page.locator('[data-report-stat]').first().waitFor();
   await page.getByRole('dialog',{name:'Insights / Reports',exact:true}).screenshot({path:path.join(out,'reports.png')});
   if(errors.length)throw Error(errors.join('; '));
   fs.writeFileSync(path.join(out,'capture-reports.json'),JSON.stringify({version:await app.evaluate(({app})=>app.getVersion()),packaged:true,workspace:'Isolated fictional sample data; not customer records',capturedAt:new Date().toISOString(),file:'reports.png',rendererErrors:errors},null,2));
   console.log('Captured Insights / Reports');return;
  }
  const shot=async name=>{await page.evaluate(()=>window.scrollTo(0,0));await page.waitForTimeout(500);await page.screenshot({path:path.join(out,name+'.png')});console.log('Captured '+name)};
  for(const [view,file] of [['dashboard','dashboard-light'],['maps','maps-light'],['social','social'],['email','email'],['phone','phone'],['website','website'],['leads','leads'],['lists','lists'],['runs','runs'],['settings','settings']]){await page.locator(`[data-view="${view}"]`).click();await shot(file)}
  await page.locator('[data-stab="acct"]').click();await shot('settings-account');
  await page.locator('#app-updates').scrollIntoViewIfNeeded();
  await page.locator('#app-updates').getByRole('switch').click();
  await page.evaluate(()=>window.desktop.updates.check());await page.waitForTimeout(250);
  await page.locator('#app-updates').screenshot({path:path.join(out,'app-updates.png')});
  await page.locator('[data-view="dm"]').click();await page.getByRole('searchbox',{name:'Search saved decision makers'}).fill('Founder');await page.locator('[data-owner-results] tbody tr').first().waitFor();await shot('dm');
  await page.locator('[data-owner-results]').screenshot({path:path.join(out,'owner-evidence.png')});
  await page.locator('[data-assist="1"]').click();await page.locator('[data-chatinput]').fill('owner emails PDF ya Excel m kasy save karun?');await page.locator('[data-chatinput]').press('Enter');
  await page.locator('[data-assist-destination="dm"]').last().waitFor();await page.locator('[data-chat-panel]').screenshot({path:path.join(out,'assist.png')});
  await page.locator('[data-assist-destination="dm"]').last().click();
  await page.locator('[data-view="phone"]').click();await page.getByRole('searchbox',{name:'Search saved phone numbers'}).fill('Cedar');await shot('live-search');
  await page.getByRole('button',{name:'Import websites',exact:true}).click();await page.locator('[data-impmodal] textarea').fill('https://cedardental.example\nhttps://mapledentalstudio.example\nhttps://willowsmileclinic.example');await page.locator('[data-impmodal] section').screenshot({path:path.join(out,'import-websites.png')});await page.getByRole('button',{name:'Cancel',exact:true}).click();
  await page.locator('[data-view="maps"]').click();await page.locator('.ms-open').click();await page.locator('.ms-panel').waitFor();await shot('saved-searches');await page.keyboard.press('Escape');
  await page.locator('[data-notifications-button]').click();await page.locator('[data-notifications-panel]').screenshot({path:path.join(out,'notifications.png')});await page.keyboard.press('Escape');
  if(errors.length)throw Error(errors.join('; '));
  fs.writeFileSync(path.join(out,'capture.json'),JSON.stringify({version:await app.evaluate(({app})=>app.getVersion()),packaged:true,workspace:'Fictional sample data, not customer records',size:{width:1440,height:960},capturedAt:new Date().toISOString(),files:fs.readdirSync(out).filter(file=>file.endsWith('.png'))},null,2));
 }finally{await app.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
