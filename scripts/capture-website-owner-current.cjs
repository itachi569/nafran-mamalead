// Isolated illustrative capture; never uses customer data or performs a purchase.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{createRequire}=require('node:module');
const root=path.resolve(__dirname,'..'),{_electron}=createRequire(path.join(root,'package.json'))('playwright');
const out=path.join(root,'website/img/app/v1.4.18');
async function until(read,test,timeout=60000){const start=Date.now();while(Date.now()-start<timeout){const value=await read();if(test(value))return value;await new Promise(resolve=>setTimeout(resolve,80))}throw Error('Expected screenshot fixture state was not reached')}
(async()=>{
 const env={...process.env,APPDATA:fs.mkdtempSync(path.join(os.tmpdir(),'mamalead-site-private-'))};delete env.ELECTRON_RUN_AS_NODE;delete env.VITE_DEV_SERVER_URL;delete env.DATAFORSEO_API_KEY;delete env.DATAFORSEO_API_KEY_FILE;
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'mamalead-site-owner-refresh-'));
 const app=await _electron.launch({executablePath:path.join(root,'release/owner-lookup/win-unpacked/MamaLead.exe'),args:['--user-data-dir='+profile],env,timeout:60000});
 try{
  await app.evaluate(({app,ipcMain,BrowserWindow})=>{
   const path=process.getBuiltinModule('path'),req=process.getBuiltinModule('module').createRequire(path.join(app.getAppPath(),'package.json'));
   const {db,repository}=req('./dist-electron/db/index.js').openDatabase(),ws=db.ensureWorkspace().id,{LOCAL_CHANNELS,registerLocalDatabase}=req('./dist-electron/db/ipc.js');
   const {EnrichmentRunner}=req('./dist-electron/enrichment/runner.js'),{WebsiteEnricher}=req('./dist-electron/enrichment/website.js');
   for(const channel of LOCAL_CHANNELS)ipcMain.removeHandler(channel);registerLocalDatabase(db,repository,undefined,async()=>{});req('./dist-electron/billing/client.js').requireActiveLicense=async()=>{};
   const names=['Cedar Dental','Maple Dental Studio','Willow Smile Clinic','Oak Dental Care','Birch Family Dental','Elm Dental Studio','Aspen Dental Care','Juniper Smile Studio','Pine Dental Care','Hazel Dental','Alder Dental Studio','Rowan Smile Clinic','Fern Dental Care','Beech Dental','Laurel Smile Clinic'];
   const owners=['Ava Reed','Mason Cole','Emma Wells','Noah Clark','Olivia Hayes','Liam Brooks','Sophia Baker','Ethan Stone','Mia Taylor','Lucas Hill','Isabella Scott','James Young','Amelia Green','Henry King','Charlotte Adams'];
   const hosts=names.map(name=>name.toLowerCase().replace(/[^a-z]/g,'')+'.example');
   const end=new Date();repository.saveRun(ws,{runId:'website-sample-maps-15',provider:'chromium-maps',status:'done',keywords:['dentists'],location:'Manchester',maxResultsPerKeyword:15,detail:true,startedAt:new Date(+end-67000).toISOString(),finishedAt:end.toISOString(),durationMs:67000,error:null,leads:names.map((name,i)=>({name,category:'Dental clinic',address:`${12+i} Example Street, Manchester`,area:'Manchester',phone:'+44 161 496 00'+String(i).padStart(2,'0'),website:i<13?'https://'+hosts[i]:'',rating:4.2+(i%4)/5,reviewCount:27+i*13,placeRef:'fictional-site-shot-'+i,latitude:53.48+i*.002,longitude:-2.24,keyword:'dentists'}))});
   const state={db,repository,requests:[],progress:[],inspections:0,resume:null,credits:[]};globalThis.__siteOwnerShot=state;
   const override=(channel,fn)=>{ipcMain.removeHandler(channel);ipcMain.handle(channel,fn)};
   override('billing:status',()=>({connected:true,configured:true,mode:'live',coreLicenseActive:true,license:{active:true,kind:'lifetime',maxDevices:2,devicesUsed:1},lifetime:{active:true,amount:1000000,currency:'pkr'},decisionMaker:{active:true,available:true,status:'paid',monthlyLimit:1000,monthlyRemaining:1000-state.credits.length,monthlyUsed:state.credits.length,amount:100000,currency:'pkr'}}));
   override('billing:invoices',()=>({invoices:[]}));override('notifications:show',()=>({shown:true}));
   const runner=new EnrichmentRunner(db,repository,{authorize:async()=>{},consumeDecisionLead:async id=>{state.credits.push(id);if(state.credits.length===7)await new Promise(resolve=>{state.resume=resolve})},deepKey:()=>'',onProgress:progress=>{state.progress.push(progress);for(const win of BrowserWindow.getAllWindows())win.webContents.send('enrichment:progress',progress)}});state.runner=runner;
   override('enrichment:prioritize',(_,payload)=>{void runner.prioritize(payload.jobId);return{started:true}});override('enrichment:start',()=>({started:true}));override('enrichment:stop',(_,payload)=>{runner.stop(payload?.jobId);return{stopped:true}});
   WebsiteEnricher.prototype.searchPublicWeb=async query=>query.includes('Liam Brooks')?[{title:'Liam Brooks — founder of Elm Dental Studio',description:'Liam Brooks founded Elm Dental Studio, elmdentalstudio.example. Published founder contact.',url:'https://founder-studio.example/liam-brooks'}]:[];
   global.fetch=async raw=>{
    const url=new URL(typeof raw==='string'||raw instanceof URL?String(raw):raw.url),host=url.hostname.replace(/^www\./,'');state.requests.push(url.href);
    if(host==='bing.com')return new Response('<rss><channel></channel></rss>',{headers:{'content-type':'application/xml'}});
    if(host==='html.duckduckgo.com')return new Response('<html><body>No sample search results</body></html>',{headers:{'content-type':'text/html'}});
    if(host==='founder-studio.example')return new Response('<html><article><h2>Liam Brooks</h2><p>Founder of Elm Dental Studio, elmdentalstudio.example.</p><a href="mailto:liam.brooks@founder-studio.example">Contact Liam</a></article></html>',{headers:{'content-type':'text/html'}});
    const i=hosts.indexOf(host);if(i<0)throw Error('External network blocked during website capture: '+host);
    if(url.pathname!=='/'&&url.pathname!=='/about')return new Response('Not a fixture page',{status:404});
    const email=i%4===3||i===5?'':owners[i].toLowerCase().replace(' ','.')+'@'+host;
    return new Response(`<html><h1>${names[i]}</h1><article><h2>${owners[i]}</h2><p>Founder</p>${email?`<a href="mailto:${email}">Contact ${owners[i]}</a>`:''}</article></html>`,{headers:{'content-type':'text/html'}});
   };
  });
  const page=await app.firstWindow(),errors=[];page.on('pageerror',error=>errors.push(error.message));await page.setViewportSize({width:1440,height:960});
  await page.evaluate(()=>{localStorage.setItem('ls-theme','light');localStorage.setItem('mamalead.planWelcomeDismissed','1');localStorage.setItem('nafran.notifications','[]')});await page.reload();await page.locator('[data-view="dm"]').click();
  const welcome=page.getByRole('button',{name:'Dismiss trial and Lifetime notice'});if(await welcome.count())await welcome.click();
  await page.getByRole('button',{name:'Import websites',exact:true}).click();const modal=page.locator('[data-impmodal]');await modal.getByRole('tab',{name:/From a Maps run/}).click();await modal.locator('[data-runpick]').filter({hasText:'Manchester'}).click();
  await modal.getByRole('button',{name:'Scan 15 leads',exact:true}).waitFor();const selectionText=await modal.innerText();if(!selectionText.includes('13 with a website')||!selectionText.includes('2 without a website'))throw Error('Selected businesses/website breakdown is wrong');
  await page.mouse.move(5,5);await modal.locator('section').screenshot({path:path.join(out,'dm-saved-leads.png')});
  await modal.getByRole('button',{name:'Scan 15 leads',exact:true}).click();await modal.waitFor({state:'detached'});
  const progress=page.locator('[data-decision-progress]'),bar=progress.getByRole('progressbar');await until(()=>bar.getAttribute('aria-valuenow'),value=>value==='40');
  const websiteRing=page.locator('.dm-coverage-ring').filter({hasText:'With website'});await until(()=>websiteRing.innerText(),value=>/87\s*%/.test(value)&&value.includes('13 leads'));
  const progressText=await progress.innerText();if(!progressText.includes('6 of 15 leads checked')||!progressText.includes('9 remaining')||!await progress.getByRole('button',{name:'Stop scan',exact:true}).isVisible())throw Error('Live screenshot counts or Stop control are wrong');
  await page.evaluate(()=>window.scrollTo(0,0));await page.mouse.move(5,5);await page.screenshot({path:path.join(out,'dm-progress.png')});
  await app.evaluate(()=>globalThis.__siteOwnerShot.resume());await until(()=>bar.getAttribute('aria-valuenow'),value=>value==='100');
  const search=page.getByRole('searchbox',{name:'Search saved decision makers'});await search.fill('Studio');const table=page.locator('[data-owner-results]');await until(()=>table.locator('tbody tr').count(),count=>count===4);await page.evaluate(()=>window.scrollTo(0,0));await page.mouse.move(5,5);await page.waitForTimeout(400);await page.screenshot({path:path.join(out,'dm.png')});
  const tableText=await table.innerText();if(!tableText.includes('Owner email not found')||!tableText.includes('liam.brooks@founder-studio.example'))throw Error('Owner result screenshot must include a sourced external email and an honest missing-email row');
  const state=await app.evaluate(()=>{const s=globalThis.__siteOwnerShot;return{credits:s.credits.length,people:s.db.query('select full_name,email,source from decision_makers'),jobs:s.db.query('select status,found,error from enrichment_jobs'),requests:s.requests,progress:s.progress}});
  if(state.credits!==15||state.jobs.at(-1).status!=='done'||state.people.length!==13||errors.length)throw Error('Capture validation failed: '+JSON.stringify({credits:state.credits,jobs:state.jobs,people:state.people.length,errors}));
  const report={version:await app.evaluate(({app})=>app.getVersion()),packaged:true,capturedAt:new Date().toISOString(),theme:'light',viewport:{width:1440,height:960},data:'Fictional sample businesses and .example domains in a temporary isolated profile; no customer data',liveNetworkCalls:0,actualBillingCalls:0,selectedBusinesses:15,withWebsite:13,withoutWebsite:2,websiteCoveragePercent:87,capturedProgress:{percent:40,processed:6,total:15,remaining:9,stopVisible:true},completed:{processed:15,owners:13,emails:state.people.filter(person=>person.email).length},files:['dm.png','dm-progress.png','dm-saved-leads.png'],rendererErrors:errors};
  fs.writeFileSync(path.join(out,'capture-owner-refresh.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
 }finally{await app.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
