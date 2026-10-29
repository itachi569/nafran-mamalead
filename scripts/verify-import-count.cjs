const {createRequire}=require('node:module');
const {resolve,join}=require('node:path');
const {mkdtempSync,mkdirSync,writeFileSync}=require('node:fs');
const {tmpdir}=require('node:os');
const root=resolve(__dirname,'..');
const {_electron}=createRequire(join(root,'package.json'))('playwright');
const sourceMode=!process.argv.includes('--packaged');
const output=resolve(root,'screenshots/release-audit/MamaLead-decision-progress');mkdirSync(output,{recursive:true});

async function main(){
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;delete env.VITE_DEV_SERVER_URL;
 const app=await _electron.launch({executablePath:join(root,sourceMode?'node_modules/electron/dist/electron.exe':'release/win-unpacked/MamaLead.exe'),args:[...(sourceMode?[root]:[]),'--user-data-dir='+mkdtempSync(join(tmpdir(),'mamalead-current-import-'))],env,timeout:60000});
 const checks=[];
 try{
  await app.evaluate(({ipcMain,dialog,app})=>{
   const fs=process.getBuiltinModule('fs'),path=process.getBuiltinModule('path');
   const fixture=path.join(fs.mkdtempSync(path.join(app.getPath('temp'),'mamalead-count-list-')),'100-websites.csv');
   fs.writeFileSync(fixture,'Business,Website\n'+Array.from({length:100},(_,i)=>`Sample ${i},https://file${i}.example.org`).join('\n'));
   globalThis.__countTest={nativeCalls:0,imports:[]};
   const nativeDialog=dialog.showOpenDialog;
   dialog.showOpenDialog=async(parent,options)=>{
    if(options?.title!=='Import websites into MamaLead')return nativeDialog(parent,options);
    globalThis.__countTest.nativeCalls++;return{canceled:false,filePaths:[fixture]};
   };
   const lead=(i,website)=>({id:'fixture-'+i,name:'Sample '+i,website,address:'',phone:'',rating:null,review_count:0,captured_at:'2026-10-28T00:00:00Z'});
   const runs=['many','empty'].map((id,i)=>({id,provider:'chromium-maps',status:'done',keywords:'["Test businesses"]',location:i?'Empty':'Lahore',max_results:40,found:i?0:20,error:null,started_at:'2026-10-28T09:00:00Z',finished_at:'2026-10-28T09:01:00Z',duration_ms:60000}));
   const handlers={
    'billing:status':()=>({connected:true,configured:true,coreLicenseActive:true,license:{active:true,kind:'lifetime'},lifetime:{active:true},decisionMaker:{active:true,available:true,status:'active',monthlyLimit:1000,monthlyUsed:0,monthlyRemaining:1000}}),
    'db:runs:list':()=>runs,
    'db:leads:list':(_,query)=>query?.runId==='many'?{rows:[...Array.from({length:17},(_,i)=>lead(i,`https://run${i}.example.org`)),lead(17,'https://www.run0.example.org/team'),lead(18,'')],total:19}:{rows:[],total:0},
    'db:imports:websites':(_,payload)=>{const lines=payload.input??payload;globalThis.__countTest.imports.push(lines);return{batchId:'current-count-test',added:lines.length,skipped:0,leadIds:lines.map((_,i)=>'fixture-'+i)}},
    'db:jobs:queue':()=>({queued:31,jobId:'current-count-job'}),
    'db:jobs:status':()=>({status:'done',processed:31,total:31,found:0,failed:0,leadName:'',message:'Scan complete',at:new Date().toISOString()}),
    'enrichment:prioritize':()=>({started:true}),
   };
   for(const[channel,fn]of Object.entries(handlers)){ipcMain.removeHandler(channel);ipcMain.handle(channel,fn)}
  });
  const page=await app.firstWindow();await page.setViewportSize({width:1280,height:900});await page.reload();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.locator('[data-view="dm"]').waitFor({timeout:60000});await page.locator('[data-view="dm"]').click();
  const open=()=>page.getByRole('button',{name:'Import websites',exact:true}).filter({visible:true}).click();
  const modal=page.locator('[data-impmodal="1"]'),scan=modal.locator('[data-importgo]');
  const count=async n=>{await modal.getByRole('button',{name:`Scan ${n} site${n===1?'':'s'}`,exact:true}).waitFor();if(!((await modal.locator('.wi-summary').innerText()).includes(String(n))))throw Error('Footer count differs from scan count')};
  const empty=async()=>{await modal.locator('textarea').waitFor();if(await modal.locator('textarea').inputValue()!==''||!await scan.isDisabled())throw Error('Previous websites/count survived reopening')};
  await open();await empty();checks.push('new Decision Makers import is empty with disabled scan');
  await modal.locator('textarea').fill(Array.from({length:13},(_,i)=>`https://paste${i}.example.org`).join('\n'));await count(13);
  await page.keyboard.press('Escape');await modal.waitFor({state:'detached'});await open();await empty();checks.push('13-site paste is cleared by Escape and clean reopen');
  await modal.locator('textarea').fill(Array.from({length:13},(_,i)=>`https://old${i}.example.org`).join('\n'));await count(13);
  // Window-level shortcuts are also used when a native or app surface has focus.
  await page.evaluate(()=>window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})));
  await modal.waitFor({state:'detached'});await open();await empty();checks.push('window-level Escape cannot leave a hidden 13-site draft');
  const paste31=Array.from({length:31},(_,i)=>`https://paste${i}.example.org`).join('\n');
  await modal.locator('textarea').fill(paste31+'\nhttps://www.paste0.example.org/contact\nnot a website');await count(31);
  if((await modal.locator('.wi-stats strong').allTextContents()).join(',')!=='31,1,1')throw Error('31-site duplicate/invalid count mismatch');checks.push('31 selected domains counted exactly, with duplicates/invalid lines excluded');
  await modal.getByRole('tab',{name:/Upload a file/}).click();if(!await scan.isDisabled())throw Error('Paste websites leaked into empty file source');
  await modal.getByRole('button',{name:'Choose file',exact:true}).click();await count(100);
  if(!(await modal.locator('.wi-file-copy').innerText()).includes('100-websites.csv'))throw Error('Native filename not shown');checks.push('native CSV picker previews all 100 websites without a 13-site cap');
  await modal.getByRole('tab',{name:/Paste links/}).click();await count(31);
  await modal.getByRole('tab',{name:/Upload a file/}).click();await count(100);checks.push('switching Paste/File restores only that source count');
  await modal.getByRole('tab',{name:/From a Maps run/}).click();if(!await scan.isDisabled())throw Error('File websites leaked into unselected Maps source');
  await modal.locator('[data-runpick]').first().click();await modal.getByRole('button',{name:'Scan 19 leads',exact:true}).waitFor();
  if(!(await modal.locator('.wi-hint').innerText()).includes('18 with a website'))throw Error('Saved lead website breakdown not explained');checks.push('saved Decision Maker run retains 19 businesses including duplicate and missing websites');
  await modal.locator('[data-runpick]').nth(1).click();await modal.getByRole('alert').waitFor();if(!await scan.isDisabled())throw Error('Empty Maps run reuses previous source');checks.push('empty Maps run cannot reuse the preceding count');
  await modal.getByRole('tab',{name:/Paste links/}).click();await count(31);await scan.click();await modal.waitFor({state:'detached'});
  const state=await app.evaluate(()=>globalThis.__countTest);
  if(state.nativeCalls!==1||state.imports.length!==1||state.imports[0].length!==31||!state.imports[0].includes('https://paste30.example.org'))throw Error('Submitted scan differs from displayed current source count');checks.push('scan dispatch submits exactly 31 current source URLs, including the final row');
  await page.waitForFunction(()=>document.querySelector('[data-decision-progress] [role="progressbar"]')?.getAttribute('aria-valuenow')==='100');
  await open();await empty();checks.push('completed submission reopens empty without the previous import');
  await modal.locator('section').screenshot({path:join(output,sourceMode?'import-empty-source.png':'import-empty-packaged.png')});
  if(errors.length)throw Error('Renderer errors '+errors.join('; '));checks.push('no renderer errors');
  const result={passed:true,packaged:await app.evaluate(({app})=>app.isPackaged),checks,selectedCounts:[13,31,100,19],published:false};
  writeFileSync(join(output,sourceMode?'source-import-count.json':'packaged-import-count.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
 }finally{await app.close()}
}
main().catch(error=>{console.error(error);process.exitCode=1});
