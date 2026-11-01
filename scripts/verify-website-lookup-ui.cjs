const {createRequire}=require('node:module');
const {resolve,join}=require('node:path');
const {mkdtempSync,mkdirSync,writeFileSync}=require('node:fs');
const {tmpdir}=require('node:os');
const root=resolve(__dirname,'..');
const {_electron}=createRequire(join(root,'package.json'))('playwright');
const sourceMode=!process.argv.includes('--packaged');
const out=resolve(root,'screenshots/release-audit/MamaLead-website-lookup');mkdirSync(out,{recursive:true});

async function main(){
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;delete env.VITE_DEV_SERVER_URL;
 const app=await _electron.launch({executablePath:join(root,sourceMode?'node_modules/electron/dist/electron.exe':'release/win-unpacked/MamaLead.exe'),args:[...(sourceMode?[root]:[]),'--user-data-dir='+mkdtempSync(join(tmpdir(),'mamalead-lookup-'))],env,timeout:60000});
 try{
  await app.evaluate(({app,ipcMain,BrowserWindow,dialog},{out})=>{
   const fs=process.getBuiltinModule('fs'),path=process.getBuiltinModule('path');
   const req=process.getBuiltinModule('module').createRequire(path.join(app.getAppPath(),'package.json'));
   const {db,repository}=req('./dist-electron/db/index.js').openDatabase(),ws=db.ensureWorkspace().id;
   const {EnrichmentRunner}=req('./dist-electron/enrichment/runner.js');
   const {WebsiteEnricher}=req('./dist-electron/enrichment/website.js');
   const {writeExport,buildExport}=req('./dist-electron/export/writer.js');
   globalThis.__lookupTest={db,repository,ws,started:[],out,buildExport,validityCalls:0};
   // Only reserved fixture hosts are intercepted. No production data/license state is changed.
   const fetchOriginal=globalThis.fetch;
   globalThis.fetch=async(raw,options)=>{
    const url=new URL(typeof raw==='string'?raw:raw.url || String(raw));
    if(!['northstar.test','harbor.test','blocked.test'].includes(url.hostname))return fetchOriginal(raw,options);
    await new Promise(r=>setTimeout(r,35));
    if(url.hostname==='blocked.test')return new Response('Unavailable',{status:503});
    const company=url.hostname==='northstar.test'?'Northstar Studio':'Harbor Dental';
    if(url.pathname==='/robots.txt')return new Response(`Sitemap: https://${url.hostname}/sitemap.xml`);
    if(url.pathname==='/sitemap.xml')return new Response(`<urlset><url><loc>https://${url.hostname}/contact-us</loc></url></urlset>`);
    if(url.pathname==='/contact-us')return new Response(`<html><a href="mailto:sales@${url.hostname}">Sales</a><header><a href="tel:+442079460123">Call us</a></header><address>12 King Street, London, SW1A 1AA, United Kingdom</address></html>`);
    if(url.pathname==='/')return new Response(`<html><head><meta property="og:site_name" content="${company}"></head><body><a href="mailto:hello@${url.hostname}">Email</a><a href="tel:+442079460122">Call</a><a href="https://facebook.com/${url.hostname.split('.')[0]}">Facebook</a><a href="https://linkedin.com/company/${url.hostname.split('.')[0]}">LinkedIn</a><p>Alex Morgan, Founder</p></body></html>`);
    return new Response('',{status:404});
   };
   WebsiteEnricher.prototype.inspect=async()=>({emails:[],phones:[],socials:[],people:[],addresses:[],pagesRead:[],error:'Website unavailable'});
   WebsiteEnricher.prototype.inspectPeople=async()=>{throw Error('Website Lookup must not scan owners')};
   const runner=new EnrichmentRunner(db,repository,{authorize:async()=>{},consumeDecisionLead:async()=>{throw Error('Website Lookup must not consume Decision Makers credits')},onProgress:progress=>{for(const win of BrowserWindow.getAllWindows())win.webContents.send('enrichment:progress',progress)}});
   const override=(channel,handler)=>{ipcMain.removeHandler(channel);ipcMain.handle(channel,handler)};
   override('emailValidity:verify',()=>{__lookupTest.validityCalls++;throw Error('Website Lookup must not trigger email validity')});
   override('billing:status',()=>({connected:true,configured:true,coreLicenseActive:true,license:{active:true,kind:'lifetime'},lifetime:{active:true,amount:1000000,currency:'pkr',interval:null}}));
   override('db:lookup:start',(_,payload)=>{
    const session=repository.startWebsiteLookup(ws,payload.input,payload.fields);globalThis.__lookupTest.started.push({sites:payload.input,fields:payload.fields});
    setTimeout(()=>void runner.prioritize(session.jobId),500);return session;
   });
   override('enrichment:prioritize',()=>({started:true}));
   const csv=path.join(fs.mkdtempSync(path.join(app.getPath('temp'),'lookup-csv-')),'lookup.csv');fs.writeFileSync(csv,'Business,Website\nNorthstar,northstar.test\nHarbor,harbor.test');
   const originalOpen=dialog.showOpenDialog;
   dialog.showOpenDialog=async(parent,options)=>options?.title==='Import websites into MamaLead'?{canceled:false,filePaths:[csv]}:originalOpen(parent,options);
   dialog.showSaveDialog=async(parent,options)=>({canceled:false,filePath:path.join(out,path.basename(options.defaultPath))});
   override('db:exports:write',(event,payload)=>writeExport(BrowserWindow.fromWebContents(event.sender),repository,ws,payload));
   const run={id:'fixture-maps',provider:'chromium-maps',status:'done',keywords:'["Dentists"]',location:'London',max_results:3,found:2,error:null,started_at:'2026-10-28T09:00:00Z',finished_at:'2026-10-28T09:01:00Z',duration_ms:60000};
   override('db:runs:list',()=>[run]);
   override('db:leads:list',(_,query)=>repository.listLeads(ws,query?.runId==='fixture-maps'?{limit:500}:query));
  },{out});
  const page=await app.firstWindow();await page.setViewportSize({width:1440,height:1050});
  await page.evaluate(()=>localStorage.setItem('nafran.email.verifyAfterScan','1'));
  await page.reload();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.locator('[data-view="website"]').waitFor({timeout:60000});await page.locator('[data-view="website"]').click();
  const panel=page.locator('[data-website-lookup]'),input=panel.getByRole('textbox',{name:'Websites to look up'});
  const scrollSnapshots=[];
  async function recordScroll(label){await page.waitForTimeout(650);scrollSnapshots.push(await panel.locator('.wl-results').evaluate((element,label)=>({label,scrollY:window.scrollY,headingTop:element.getBoundingClientRect().top,firstRowBottom:element.querySelector('[data-lookup-row]')?.getBoundingClientRect().bottom,viewport:innerHeight}),label));console.log('SCROLL',JSON.stringify(scrollSnapshots.at(-1)))}
  if(!(await panel.locator('[data-lookup-input-count]').innerText()).startsWith('0 ready'))throw Error('Stale count on empty input');
  const start=panel.getByRole('button',{name:/Start lookup/});if(!await start.isDisabled())throw Error('Empty lookup enabled');
  await input.fill('https://facebook.com/examplebusiness');
  if(!await start.isDisabled())throw Error('All-social input must not start a website scan');
  await panel.getByText(/This is a social website/).waitFor();
  await input.fill('northstar.test\nhttps://www.northstar.test/team\nharbor.test\nblocked.test\nnot a website\nhttps://facebook.com/examplebusiness');
  if(!(await panel.locator('[data-lookup-input-count]').innerText()).includes('3 ready · 1 duplicates · 2 skipped'))throw Error('Input count mismatch');
  await panel.screenshot({animations:'disabled',path:join(out,'website-lookup-setup.png')});
  await start.click();await panel.getByRole('heading',{name:'Reading public website pages'}).waitFor();
  await panel.getByRole('heading',{name:'Scan complete with errors'}).waitFor({timeout:20000}).catch(async error=>{console.log(await panel.innerText());console.log(await app.evaluate(()=>{const t=globalThis.__lookupTest;return t.repository.websiteLookupSession(t.ws)}));throw error});
  if(await panel.locator('[data-lookup-row]').count()!==3)throw Error('Scan results not isolated');
  await recordScroll('URL scan completion');await page.screenshot({animations:'disabled',path:join(out,'auto-scroll-viewport.png')});
  const text=await panel.innerText();for(const value of ['Northstar Studio','Harbor Dental','hello@northstar.test','12 King Street','facebook','linkedin','Retry needed'])if(!text.includes(value))throw Error('Missing result '+value);
  if(text.includes('sales@northstar.test'))throw Error('Secondary email shown instead of one main email');
  if(await input.inputValue()!=='')throw Error('Input did not reset');
  await panel.screenshot({animations:'disabled',path:join(out,'website-lookup-results.png')});
  await panel.getByRole('button',{name:'Export results ↓'}).click();await page.getByRole('button',{name:'Excel (.xlsx)',exact:true}).click();await page.getByRole('dialog',{name:'Export Website Lookup'}).waitFor({state:'detached'});
  await panel.getByRole('button',{name:'Export results ↓'}).click();await page.getByRole('button',{name:'PDF (.pdf)',exact:true}).click();await page.getByRole('dialog',{name:'Export Website Lookup'}).waitFor({state:'detached'});
  const backend=await app.evaluate(()=>{
   const t=globalThis.__lookupTest,s=t.repository.websiteLookupSession(t.ws);
   if(s.rows[0].emails.length!==1)throw Error('More than one email per website');
   if(t.db.one("select max(score) n from lead_contacts where kind='phone'").n!==100)throw Error('Contact-page header score not clamped to 100');
   if(s.rows[0].address!=='12 King Street, London, SW1A 1AA, United Kingdom')throw Error('Address includes unrelated page text: '+s.rows[0].address);
   if(t.db.one('select count(*) as n from decision_makers').n!==0)throw Error('Owner records created');
   if(t.db.one("select count(*) as n from enrichment_jobs where kind in ('deep','decision-maker')").n!==0)throw Error('Owner job queued');
   if(t.db.one('select count(*) as n from enrichment_jobs').n!==1)throw Error('Duplicate automatic enrichment job');
   const csv=t.buildExport(t.repository,t.ws,{kind:'website',lookupJobId:s.jobId,limit:1,leadIds:[s.rows[0].leadId],columns:['Business name','Emails','Phone numbers','Business address','Social links','Sources','Status'],delimiter:',',fileName:'subset'});
   if(csv.rows!==1||csv.body.includes('Harbor Dental'))throw Error('Selected export leaked rows');
   for(const [input,fields] of [[[],s.fields],[Array.from({length:501},(_,i)=>`site${i}.test`),s.fields],[['northstar.test'],{email:false,phone:false,social:false,address:false}]]){
    let rejected=false;try{t.repository.startWebsiteLookup(t.ws,input,fields)}catch{rejected=true}if(!rejected)throw Error('Invalid request accepted');
   }
   return {rows:s.rows.length,failed:s.rows.filter(row=>row.status==='failed').length,emails:s.rows[0].emails.length,phones:s.rows[0].phones.length,sources:s.rows[0].sources,ownerRows:0,ownerJobs:0,selectedExportRows:csv.rows};
  });
  // Existing domains must rescan, while unchecked categories stay out of results and exports.
  for(const label of ['Phone numbers','Social profiles','Business address'])await panel.locator('.wl-option').filter({hasText:label}).getByRole('checkbox').uncheck();
  await panel.getByRole('button',{name:'Import websites',exact:true}).click();const modal=page.locator('[data-impmodal]');
  await modal.getByRole('tab',{name:/Upload a file/}).click();await modal.getByRole('button',{name:'Choose file',exact:true}).click();await modal.getByRole('button',{name:'Scan 2 sites',exact:true}).click();
  await modal.waitFor({state:'detached'});await panel.getByRole('heading',{name:'Scan complete',exact:true}).waitFor({timeout:60000});
  if(await panel.locator('[data-lookup-row]').count()!==2)throw Error('CSV scope mismatch');
  await recordScroll('CSV import completion');
  const emailOnly=await app.evaluate(()=>{const t=globalThis.__lookupTest,s=t.repository.websiteLookupSession(t.ws);if(s.added!==0||s.reused!==2)throw Error('Saved leads not reused');if(s.rows.some(row=>!row.emails.length||row.phones.length||row.socials.length||row.address))throw Error('Unchecked fields were included');return s.jobId});
  if(await panel.getByRole('columnheader',{name:'Phone numbers',exact:true}).count())throw Error('Unchecked column displayed');
  await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));await page.reload();await page.locator('[data-view="website"]').click();await panel.locator('[data-lookup-row]').first().waitFor({timeout:20000});
  await recordScroll('Restored completed scan');
  if(await panel.locator('[data-lookup-row]').count()!==2)throw Error('Session not restored after reload');
  await page.evaluate(()=>document.querySelector('[data-theme-btn]').click());await panel.screenshot({animations:'disabled',path:join(out,'website-lookup-dark.png')});await page.evaluate(()=>document.querySelector('[data-theme-btn]').click());
  // The failed new placeholder was rolled back; only the two real saved websites remain.
  await panel.getByRole('button',{name:'Import websites',exact:true}).click();await modal.getByRole('tab',{name:/From a Maps run/}).click();await modal.locator('[data-runpick]').first().click();await modal.getByRole('button',{name:'Scan 2 sites',exact:true}).click();await modal.waitFor({state:'detached'});await panel.getByRole('heading',{name:'Scan complete',exact:true}).waitFor({timeout:60000});
  if(await app.evaluate(()=>__lookupTest.validityCalls)!==0)throw Error('Website Lookup used Email Finder auto-verification preference');
  if(await panel.getByRole('switch',{name:'Verify found emails',exact:true}).count())throw Error('Email validity toggle remains in Website Lookup');
  if(errors.length)throw Error(errors.join('; '));
  const result={packaged:await app.evaluate(({app})=>app.isPackaged),version:await app.evaluate(({app})=>app.getVersion()),...backend,emailOnlyRescanJob:emailOnly,checks:['current input counts','combined selected-field scan','sitemap contact emails','all published phones','published name/address/socials','per-website status and sources','PDF/Excel exports','selected export scope','500-site and empty/options validation','no owner records/jobs/credits','native CSV import','existing lead rescan without duplicates','unchecked category isolation','session reload recovery','saved Maps run import','dark mode']};
  result.scrollSnapshots=scrollSnapshots;writeFileSync(join(out,sourceMode?'source-check.json':'packaged-check.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
 }finally{await app.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1});
