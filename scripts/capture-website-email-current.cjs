// Isolated illustrative capture; never uses customer data or performs a purchase.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{createRequire}=require('node:module');
const root=path.resolve(__dirname,'..'),{_electron}=createRequire(path.join(root,'package.json'))('playwright'),out=path.join(root,'website/img/app/v1.4.18');
async function until(read,test,timeout=20000){const start=Date.now();while(Date.now()-start<timeout){const value=await read();if(test(value))return value;await new Promise(resolve=>setTimeout(resolve,80))}throw Error('Expected email screenshot state was not reached')}
(async()=>{
 const env={...process.env,APPDATA:fs.mkdtempSync(path.join(os.tmpdir(),'mamalead-site-private-'))};delete env.ELECTRON_RUN_AS_NODE;delete env.VITE_DEV_SERVER_URL;delete env.DATAFORSEO_API_KEY;delete env.DATAFORSEO_API_KEY_FILE;
 const app=await _electron.launch({executablePath:path.join(root,'release/owner-lookup/win-unpacked/MamaLead.exe'),args:['--user-data-dir='+fs.mkdtempSync(path.join(os.tmpdir(),'mamalead-site-email-refresh-'))],env,timeout:60000});
 try{
  await app.evaluate(({app,ipcMain,BrowserWindow})=>{
   const path=process.getBuiltinModule('path'),req=process.getBuiltinModule('module').createRequire(path.join(app.getAppPath(),'package.json')),{db,repository}=req('./dist-electron/db/index.js').openDatabase(),ws=db.ensureWorkspace().id,{LOCAL_CHANNELS,registerLocalDatabase}=req('./dist-electron/db/ipc.js');
   for(const channel of LOCAL_CHANNELS)ipcMain.removeHandler(channel);registerLocalDatabase(db,repository,undefined,async()=>{});
   const names=['Cedar Dental','Maple Dental Studio','Willow Smile Clinic','Oak Dental Care','Elm Dental Studio','Juniper Smile Studio','Birch Family Dental'];
   const end=new Date();repository.saveRun(ws,{runId:'sample-email-overview',provider:'chromium-maps',status:'done',keywords:['dentists'],location:'Manchester',maxResultsPerKeyword:7,detail:true,startedAt:new Date(+end-30000).toISOString(),finishedAt:end.toISOString(),durationMs:30000,error:null,leads:names.map((name,i)=>({name,category:'Dental clinic',address:`${10+i} Example Street, Manchester`,area:'Manchester',phone:'+44 161 496 00'+String(i).padStart(2,'0'),website:'https://'+name.toLowerCase().replace(/[^a-z]/g,'')+'.example',rating:4.5,reviewCount:31+i,placeRef:'site-email-'+i,latitude:53.48+i*.002,longitude:-2.24,keyword:'dentists'}))});
   const leads=repository.listLeads(ws,{limit:100}).rows;
   for(const lead of leads){
    if(lead.name!=='Oak Dental Care')repository.upsertContact({leadId:lead.id,kind:'email',value:'hello@'+new URL(lead.website).hostname,source:lead.website+'/contact-us',score:lead.name.includes('Studio')?null:90});
    db.run('update leads set last_scanned_at = ? where id = ?',[new Date().toISOString(),lead.id]);
    if(!lead.name.includes('Studio')&&lead.name!=='Oak Dental Care')db.run('update lead_contacts set verified=?,score=?,validation_status=?,validation_provider=?,checked_at=? where lead_id=? and kind=?',[lead.name==='Cedar Dental'?0:1,lead.name==='Cedar Dental'?45:98,lead.name==='Cedar Dental'?'unknown':'valid','leadsangel',new Date().toISOString(),lead.id,'email']);
   }
   const state={db,leads,requests:[],cancelled:false,resolve:null,progress:{state:'idle',message:'',total:0,checked:0,failed:0,pending:0,retries:0,batchSize:3}};globalThis.__siteEmailShot=state;
   const override=(channel,fn)=>{ipcMain.removeHandler(channel);ipcMain.handle(channel,fn)};
   override('billing:status',()=>({connected:true,configured:true,mode:'live',coreLicenseActive:true,license:{active:true,kind:'lifetime',maxDevices:2,devicesUsed:1},lifetime:{active:true,amount:1000000,currency:'pkr'},decisionMaker:{active:true,status:'paid',monthlyLimit:1000,monthlyRemaining:1000,monthlyUsed:0,amount:100000,currency:'pkr'}}));
   override('billing:invoices',()=>({invoices:[]}));override('notifications:show',()=>({shown:true}));
   const emit=()=>{for(const win of BrowserWindow.getAllWindows())win.webContents.send('emailValidity:progress',state.progress)};
   override('emailValidity:status',()=>({configured:true,fromEnvironment:false,provider:'leadsangel',leadsAngelConfigured:true,leadsAngelExpiresOn:null,progress:state.progress}));
   override('emailValidity:verify',(_,input)=>{
    state.requests.push(input);const ids=input.leadIds||[];const expected=leads.filter(lead=>lead.name.includes('Studio')).map(lead=>lead.id);
    if(ids.length!==3||expected.some(id=>!ids.includes(id)))throw Error('Validity scope must contain only the three visible Studio businesses');
    const first=ids[0];db.run('update lead_contacts set verified=1,score=98,validation_status=?,validation_provider=?,checked_at=? where lead_id=? and kind=?',['valid','leadsangel',new Date().toISOString(),first,'email']);
    state.progress={state:'running',message:'Checked 1 of 3 emails in the current list. 2 remaining.',total:3,checked:1,failed:0,pending:2,retries:0,batchSize:3};emit();
    return new Promise(resolve=>{state.resolve=resolve});
   });
   override('emailValidity:cancel',()=>{
    state.cancelled=true;state.progress={...state.progress,state:'cancelled',message:'Stopped after 1 of 3 checks. Remaining addresses can be checked later.'};emit();
    state.resolve?.({configured:true,provider:'leadsangel',checked:1,updated:1,valid:1,invalid:0,risky:0,unknown:0,skipped:0,limited:0,failed:0,cancelled:true});return{cancelled:true};
   });
   global.fetch=async()=>{throw Error('Real network is disabled in the email screenshot fixture')};
  });
  const page=await app.firstWindow(),errors=[];page.on('pageerror',error=>errors.push(error.message));await page.setViewportSize({width:1440,height:1040});
  await page.evaluate(()=>{localStorage.setItem('ls-theme','light');localStorage.setItem('mamalead.planWelcomeDismissed','1');localStorage.setItem('nafran.notifications','[]')});await page.reload();await page.locator('[data-view="email"]').click();
  const welcome=page.getByRole('button',{name:'Dismiss trial and Lifetime notice'});if(await welcome.count())await welcome.click();
  await page.getByRole('heading',{name:'The Cascade',exact:true}).waitFor();await page.getByRole('heading',{name:'Confidence Mix',exact:true}).waitFor();
  await until(()=>page.locator('[data-fcount="email"]').innerText(),value=>value.includes('7 rows'));
  await page.evaluate(()=>window.scrollTo(0,0));await page.mouse.move(5,5);await page.waitForTimeout(650);await page.screenshot({path:path.join(out,'email.png')});
  const search=page.getByRole('searchbox',{name:'Search saved emails'});await search.fill('Studio');await until(()=>page.locator('[data-fcount="email"]').innerText(),value=>value.includes('3 rows'));
  await page.locator('[data-email-validity="1"]').first().click();await page.getByRole('button',{name:'Stop checking',exact:true}).waitFor();
  await until(()=>page.locator('[data-email-validity-progress]').innerText(),value=>value.includes('1 of 3'));
  await page.evaluate(()=>window.scrollTo(0,0));await page.mouse.move(5,5);await page.waitForTimeout(650);await page.screenshot({path:path.join(out,'email-validity.png')});
  const progressText=await page.locator('[data-email-validity-progress]').innerText();await page.getByRole('button',{name:'Stop checking',exact:true}).click();await page.getByRole('button',{name:'Stop checking',exact:true}).waitFor({state:'detached'});
  const final=await app.evaluate(()=>{const s=globalThis.__siteEmailShot;return{requestCount:s.requests.length,scopeSize:s.requests[0]?.leadIds?.length,cancelled:s.cancelled,progress:s.progress,remainingUnchecked:s.db.one('select count(*) as count from lead_contacts where kind=? and validation_status is null',['email']).count}});
  if(final.scopeSize!==3||!final.cancelled||final.remainingUnchecked!==2||errors.length)throw Error('Validity screenshot checks failed: '+JSON.stringify({final,errors}));
  const report={version:await app.evaluate(({app})=>app.getVersion()),packaged:true,capturedAt:new Date().toISOString(),theme:'light',viewport:{width:1440,height:1040},data:'Fictional businesses and .example domains; isolated temporary profile',provider:'Simulated LeadsAngel responses; no real mailbox verification',liveNetworkCalls:0,actualBillingCalls:0,savedBusinesses:7,publishedMainEmails:6,validityScope:3,progressText,stopConfirmed:final.cancelled,remainingUnchecked:final.remainingUnchecked,files:['email.png','email-validity.png'],rendererErrors:errors};
  fs.writeFileSync(path.join(out,'capture-email-refresh.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
 }finally{await app.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
