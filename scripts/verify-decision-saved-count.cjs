const {createRequire}=require('node:module'),{resolve,join}=require('node:path'),{mkdtempSync,mkdirSync,writeFileSync}=require('node:fs'),{tmpdir}=require('node:os');
const root=resolve(__dirname,'..'),{_electron}=createRequire(join(root,'package.json'))('playwright'),sourceMode=!process.argv.includes('--packaged'),out=resolve(root,'screenshots/release-audit/MamaLead-decision-progress');mkdirSync(out,{recursive:true});
async function main(){
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;delete env.VITE_DEV_SERVER_URL;
 const app=await _electron.launch({executablePath:require('./electron-test-executable.cjs').electronTestExecutable(!sourceMode),args:[...(sourceMode?[root]:[]),'--user-data-dir='+mkdtempSync(join(tmpdir(),'mamalead-saved-lead-count-'))],env,timeout:60000}),checks=[];
 try{
  await app.evaluate(({ipcMain})=>{
   const make=(group,i,website)=>({id:`${group}-${i}`,name:`${group} business ${i}`,website,address:'Example city',phone:'',rating:null,review_count:0,captured_at:'2026-10-28T00:00:00Z',last_scanned_at:null,enrichment_status:'pending'});
   const fifteen=Array.from({length:15},(_,i)=>make('fifteen',i,i<13?`https://fifteen${i}.example.org`:''));
   const fifty=Array.from({length:50},(_,i)=>make('fifty',i,i<40?`https://shared${Math.floor(i/2)}.example.org`:''));
   const state={queues:[],imports:[],fifteen,fifty};globalThis.__savedLeadCount=state;
   const runs=[{id:'fifty',location:'Karachi',found:50},{id:'fifteen',location:'Lahore',found:15}].map(run=>({...run,provider:'chromium-maps',status:'done',keywords:'["Example businesses"]',max_results:run.found,error:null,started_at:'2026-10-28T09:00:00Z',finished_at:'2026-10-28T09:01:00Z',duration_ms:60000}));
   const handlers={
    'billing:status':()=>({connected:true,configured:true,coreLicenseActive:true,license:{active:true,kind:'lifetime'},lifetime:{active:true},decisionMaker:{active:true,available:true,status:'active',monthlyLimit:1000,monthlyUsed:0,monthlyRemaining:1000}}),
    'db:runs:list':()=>runs,
    'db:leads:list':(_,q)=>{let rows=q?.runId==='fifteen'?fifteen:fifty;const total=rows.length;rows=rows.slice(q?.offset??0,(q?.offset??0)+(q?.limit??100));return{rows,total}},
    'db:leads:get':(_,q)=>[...fifteen,...fifty].find(lead=>lead.id===q.id)??null,
    'db:imports:websites':(_,payload)=>{state.imports.push(payload);throw Error('Saved Decision Maker leads must not be reimported as website URLs')},
    'db:jobs:queue':(_,payload)=>{state.queues.push(payload);return{queued:payload.leadIds.length,jobId:'saved-'+state.queues.length}},
    'db:jobs:status':(_,payload)=>{const job=state.queues[Number(payload.jobId.split('-')[1])-1];return job?{status:'done',total:job.leadIds.length,processed:job.leadIds.length,found:0,failed:0,leadName:'',message:'Scan complete',at:new Date().toISOString()}:null},
    'enrichment:prioritize':()=>({started:true}),
   };
   for(const[channel,handler]of Object.entries(handlers)){ipcMain.removeHandler(channel);ipcMain.handle(channel,handler)}
  });
  const page=await app.firstWindow(),errors=[];page.on('pageerror',error=>errors.push(error.message));await page.setViewportSize({width:1280,height:900});await page.reload();await page.locator('[data-view="dm"]').click();
  const modal=page.locator('[data-impmodal]');const open=()=>page.getByRole('button',{name:'Import websites',exact:true}).click();
  const finish=async(n,queued)=>{await modal.getByRole('button',{name:`Scan ${n} leads`,exact:true}).click();await modal.waitFor({state:'detached'});await page.waitForFunction(n=>{const bar=document.querySelector('[data-decision-progress] [role="progressbar"]');return bar?.getAttribute('aria-valuenow')==='100'&&bar.getAttribute('aria-valuetext').includes(`of ${n}`)},n);const state=await app.evaluate(()=>globalThis.__savedLeadCount);if(state.queues.length!==queued||state.queues.at(-1).leadIds.length!==n||state.imports.length)throw Error('Selected lead IDs were dropped or reimported');return state.queues.at(-1)};
  await open();await modal.getByRole('tab',{name:/From a Maps run/}).click();await modal.locator('[data-runpick]').filter({hasText:'Lahore'}).click();
  await modal.getByRole('button',{name:'Scan 15 leads',exact:true}).waitFor();const fifteenHint=await modal.locator('.wi-hint').innerText();if(!fifteenHint.includes('13 with a website')||!fifteenHint.includes('2 without a website'))throw Error('15-lead website breakdown is wrong');
  await modal.locator('section').screenshot({path:join(out,sourceMode?'saved-15-leads-source.png':'saved-15-leads-packaged.png')});
  const fifteen=await finish(15,1);if(!fifteen.leadIds.includes('fifteen-13')||!fifteen.leadIds.includes('fifteen-14'))throw Error('Missing-website businesses were omitted');checks.push('15 saved businesses show Scan 15 leads, including 13 with websites and 2 without; all 15 IDs queued');
  await open();await modal.getByRole('tab',{name:/From a Maps run/}).click();await modal.locator('[data-runpick]').filter({hasText:'Karachi'}).click();
  await modal.getByRole('button',{name:'Scan 50 leads',exact:true}).waitFor();const fiftyHint=await modal.locator('.wi-hint').innerText();if(!fiftyHint.includes('40 with a website')||!fiftyHint.includes('10 without a website'))throw Error('50-lead website breakdown is wrong');
  await modal.getByRole('tab',{name:/Paste links/}).click();await modal.locator('textarea').fill('https://one.example.org\nhttps://www.one.example.org/contact');await modal.getByRole('button',{name:'Scan 1 site',exact:true}).waitFor();await modal.getByRole('tab',{name:/From a Maps run/}).click();await modal.getByRole('button',{name:'Scan 50 leads',exact:true}).waitFor();checks.push('URL paste still deduplicates websites; switching back restores 50 saved business IDs');
  await modal.locator('section').screenshot({path:join(out,sourceMode?'saved-50-leads-source.png':'saved-50-leads-packaged.png')});
  const fifty=await finish(50,2);if(new Set(fifty.leadIds).size!==50||!fifty.leadIds.includes('fifty-49'))throw Error('Shared/missing websites reduced the50leadselection');checks.push('50 saved businesses remain 50 despite 20 unique websites and 10 missing-website rows');
  await page.locator('[data-view="maps"]').click();await page.getByRole('checkbox',{name:'Select all results',exact:true}).check();await page.getByLabel('Send selected leads to',{exact:true}).selectOption('dm');
  await modal.getByRole('button',{name:'Scan 50 leads',exact:true}).waitFor();if(!(await modal.locator('[data-selected-map-leads]').innerText()).includes('50 selected leads'))throw Error('Selected Maps handoff count is wrong');
  await modal.locator('section').screenshot({path:join(out,sourceMode?'selected-50-leads-source.png':'selected-50-leads-packaged.png')});
  await finish(50,3);checks.push('Maps selected-lead handoff preserves all 50 IDs, including shared and missing websites');
  await page.locator('[data-view="email"]').click();await open();await modal.getByRole('tab',{name:/From a Maps run/}).click();await modal.locator('[data-runpick]').filter({hasText:'Lahore'}).click();await modal.getByRole('button',{name:'Scan 13 sites',exact:true}).waitFor();checks.push('Email Finder remains website-based, using 13 unique websites from the same 15-business run');await modal.getByRole('button',{name:'Cancel',exact:true}).click();
  if(errors.length)throw Error(errors.join('; '));checks.push('no renderer errors and no live provider or billing calls');
  const report={passed:true,packaged:await app.evaluate(({app})=>app.isPackaged),checks,published:false};writeFileSync(join(out,sourceMode?'source-saved-lead-count.json':'packaged-saved-lead-count.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
 }finally{await app.close()}
}
main().catch(error=>{console.error(error);process.exitCode=1});
