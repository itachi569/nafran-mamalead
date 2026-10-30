const {createRequire}=require('node:module'),{resolve,join}=require('node:path'),{mkdtempSync,mkdirSync,writeFileSync}=require('node:fs'),{tmpdir}=require('node:os');
const root=resolve(__dirname,'..'),{_electron}=createRequire(join(root,'package.json'))('playwright');
const sourceMode=!process.argv.includes('--packaged'),out=resolve(root,'screenshots/release-audit/MamaLead-saved-searches');mkdirSync(out,{recursive:true});
async function main(){
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;delete env.VITE_DEV_SERVER_URL;
 const app=await _electron.launch({executablePath:join(root,sourceMode?'node_modules/electron/dist/electron.exe':'release/win-unpacked/MamaLead.exe'),args:[...(sourceMode?[root]:[]),'--user-data-dir='+mkdtempSync(join(tmpdir(),'mamalead-saved-searches-'))],env,timeout:60000});
 try{
  await app.evaluate(({app,ipcMain,dialog,BrowserWindow},{out})=>{
   const path=process.getBuiltinModule('path'),req=process.getBuiltinModule('module').createRequire(path.join(app.getAppPath(),'package.json'));
   const {db,repository}=req('./dist-electron/db/index.js').openDatabase(),ws=db.ensureWorkspace().id;
   const {writeExport,buildExport}=req('./dist-electron/export/writer.js');
   const seed=(id,location,count,date,keyword,status='done')=>{
    const leads=Array.from({length:count},(_,i)=>({name:`${location} Business ${i+1}`,address:`${i+1} Main Road, ${location}, Pakistan`,area:location,phone:`+92300100${String(i).padStart(4,'0')}`,website:`https://${id}-${i}.example.org`,rating:4.5,reviewCount:10,placeRef:`${id}-${i}`}));
    if(id==='bulk')leads.push({...leads[0]});
    return repository.saveRun(ws,{runId:id,provider:'chromium-maps',status,keywords:[keyword],location,maxResultsPerKeyword:2000,detail:true,durationMs:67000,startedAt:date,finishedAt:date,error:status==='failed'?'Google Maps could not finish this search.':null,leads});
   };
   seed('lahore','Lahore',20,'2026-10-27T12:00:00Z','Dentists');seed('karachi','Karachi',3,'2026-10-28T11:00:00Z','Restaurants');seed('bulk','Islamabad',1005,'2026-10-20T12:00:00Z','Clinics');seed('empty','Multan',0,'2026-10-19T12:00:00Z','Cafes','failed');
   for(let i=0;i<54;i++)seed('archive-'+i,'Saved area '+i,0,new Date(Date.UTC(2026,8,1,0,i)).toISOString(),'Archived search');
   globalThis.__savedMaps={db,repository,ws,seed,exports:[]};
   ipcMain.removeHandler('scraper:start');ipcMain.handle('scraper:start',(_,request)=>{globalThis.__savedMaps.liveRequest=request;return{runId:'current-live'}});
   ipcMain.removeHandler('scraper:googleStatus');ipcMain.handle('scraper:googleStatus',()=>({profile:false,signedIn:false}));
   ipcMain.removeHandler('billing:status');ipcMain.handle('billing:status',()=>({connected:true,configured:true,coreLicenseActive:true,license:{active:true,kind:'lifetime'},lifetime:{active:true,amount:1000000,currency:'pkr',interval:null}}));
   dialog.showSaveDialog=async(parent,options)=>({canceled:false,filePath:path.join(out,path.basename(options.defaultPath))});
   ipcMain.removeHandler('db:exports:write');ipcMain.handle('db:exports:write',async(event,payload)=>{
    const csv=buildExport(repository,ws,payload);
    globalThis.__savedMaps.exports.push({payload,rows:csv.rows,body:csv.body});
    return writeExport(BrowserWindow.fromWebContents(event.sender),repository,ws,payload);
   });
  },{out});
  const page=await app.firstWindow();await page.setViewportSize({width:1440,height:1000});await page.reload();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.locator('[data-view="maps"]').waitFor({timeout:60000});await page.locator('[data-view="maps"]').click();
  const open=page.locator('[data-saved-maps-button]'),drawer=page.locator('[data-saved-maps]');
  await open.waitFor();await page.waitForFunction(()=>document.querySelector('[data-saved-maps-button] .ms-open-count')?.textContent==='58');
  if(await page.getByRole('combobox',{name:'Search / Run history',exact:true}).count())throw Error('Old history dropdown still present');
  await open.scrollIntoViewIfNeeded();await open.locator('..').screenshot({path:join(out,'maps-saved-searches-header.png')});
  // Saved-search exports must ignore the current results filter and selection.
  await page.getByRole('searchbox',{name:'Filter leads',exact:true}).fill('not-a-match');
  await open.click();await drawer.getByRole('heading',{name:'Saved searches 58'}).waitFor();
  await drawer.locator('[data-saved-run="lahore"]').waitFor();
  await page.waitForTimeout(450);await drawer.locator('section').screenshot({path:join(out,'saved-searches-list.png')});
  const query=drawer.getByRole('searchbox',{name:'Search saved searches'});
  await query.fill('lahore');if(await drawer.locator('[data-saved-run]').count()!==1)throw Error('City filter failed');
  const lahore=drawer.locator('[data-saved-run="lahore"]');
  if(!(await lahore.innerText()).includes('20 of 2000 leads saved'))throw Error('Saved count incorrect');
  await lahore.getByRole('button',{name:'Export Lahore search'}).click();const exportDialog=page.getByRole('dialog',{name:'Export saved Google Maps search'});
  await exportDialog.waitFor();if(!(await exportDialog.innerText()).includes('Lahore · Dentists · 20 saved businesses'))throw Error('Wrong export summary');
  await exportDialog.getByRole('button',{name:'PDF (.pdf)',exact:true}).click();await exportDialog.waitFor({state:'detached'});
  await lahore.getByRole('button',{name:'Export Lahore search'}).click();await exportDialog.getByRole('button',{name:'Excel (.xlsx)',exact:true}).click();await exportDialog.waitFor({state:'detached'});
  await lahore.getByRole('button',{name:'View results'}).click();await drawer.waitFor({state:'detached'});
  const table=page.locator('[data-maps-results-table]');await table.getByRole('row').nth(20).waitFor();
  if(await table.getByRole('row').count()!==21)throw Error('Wrong saved results scope');
  if((await table.innerText()).includes('Karachi Business'))throw Error('Other city leaked into results');
  if(await page.getByRole('searchbox',{name:'Filter leads',exact:true}).inputValue()!=='')throw Error('Old results filter was not cleared');
  if(!(await page.locator('.maps-active-search').innerText()).includes('Lahore · Dentists'))throw Error('Selected search not labelled');
  await page.screenshot({path:join(out,'lahore-saved-results.png'),animations:'disabled'});
  await open.click();await query.fill('Clinics');const bulk=drawer.locator('[data-saved-run="bulk"]');await bulk.waitFor();
  if(!(await bulk.innerText()).includes('1,005 of 2000 leads saved'))throw Error('Count used duplicates instead of stored leads');
  await bulk.getByRole('button',{name:'Export Islamabad search'}).click();await exportDialog.getByRole('button',{name:'Excel (.xlsx)',exact:true}).click();await exportDialog.waitFor({state:'detached'});
  await bulk.getByRole('button',{name:'View results'}).click();await drawer.waitFor({state:'detached'});
  await page.waitForFunction(()=>document.querySelector('[data-results]')?.textContent.includes('Showing 25 of 1005 results'));
  const exportChecks=await app.evaluate(()=>{
   const t=globalThis.__savedMaps,history=t.repository.listRuns(t.ws,5000);
   if(history.find(run=>run.id==='bulk').saved!==1005)throw Error('Stored count mismatch');
   if(t.exports.length!==3)throw Error('Missing exports');
   for(const entry of t.exports){
    if(entry.payload.runId==='lahore'&&(entry.rows!==20||entry.body.includes('Karachi Business')||entry.body.includes('Islamabad Business')))throw Error('Lahore export contains other searches');
    if(entry.payload.runId==='bulk'&&(entry.rows!==1005||entry.body.includes('Lahore Business')||entry.body.includes('Karachi Business')))throw Error('Large export truncated or mixed');
   }
   return t.exports.map(entry=>({runId:entry.payload.runId,format:entry.payload.format,rows:entry.rows}));
  });
  await open.click();await query.fill('Multan');const empty=drawer.locator('[data-saved-run="empty"]');if(!await empty.getByRole('button',{name:'Export Multan search'}).isDisabled())throw Error('Empty run export enabled');
  await query.fill('no-such-city');await drawer.getByRole('heading',{name:'No matching searches'}).waitFor();await drawer.getByRole('button',{name:'Clear search',exact:true}).click();
  await page.evaluate(()=>document.querySelector('[data-theme-btn]').click());await page.mouse.move(10,10);await page.waitForTimeout(3500);await drawer.locator('section').screenshot({path:join(out,'saved-searches-dark.png')});await page.evaluate(()=>document.querySelector('[data-theme-btn]').click());
  await drawer.getByRole('button',{name:'Close saved searches'}).focus();await page.keyboard.press('Shift+Tab');if(!await drawer.evaluate(el=>el.contains(document.activeElement)))throw Error('Focus escaped history');
  await page.keyboard.press('Escape');await drawer.waitFor({state:'detached'});
  await page.reload();await page.locator('[data-view="maps"]').click();await open.click();await drawer.locator('[data-saved-run="lahore"]').waitFor();if(await drawer.locator('[data-saved-run]').count()!==30)throw Error('Saved searches did not survive reload');await drawer.getByRole('button',{name:/Show more searches/}).click();if(await drawer.locator('[data-saved-run]').count()!==58)throw Error('Older saved searches were hidden');
  await app.evaluate(()=>globalThis.__savedMaps.seed('peshawar','Peshawar',2,'2026-10-29T12:00:00Z','Hotels'));
  await drawer.getByRole('button',{name:'Refresh',exact:true}).click();await drawer.locator('[data-saved-run="peshawar"]').waitFor();
  await drawer.getByRole('button',{name:'Close saved searches'}).click();await open.click();const fresh=drawer.locator('[data-saved-run="peshawar"]');await fresh.waitFor({timeout:8000}).catch(async error=>{console.log(await drawer.innerText());console.log(await app.evaluate(()=>globalThis.__savedMaps.repository.listRuns(globalThis.__savedMaps.ws,5000).map(run=>({id:run.id,location:run.location}))));throw error});await fresh.getByRole('button',{name:'Export Peshawar search'}).click();await exportDialog.waitFor();await page.keyboard.press('Escape');await exportDialog.waitFor({state:'detached'});if(!await drawer.isVisible())throw Error('Export cancel closed saved searches');
  await page.setViewportSize({width:640,height:700});await page.waitForTimeout(400);const box=await drawer.locator('section').boundingBox();if(box.x<0||box.y<0||box.y+box.height>700)throw Error('Small history panel outside viewport');await drawer.locator('section').screenshot({path:join(out,'saved-searches-small.png')});
  await drawer.getByRole('button',{name:'Close saved searches'}).click();await page.setViewportSize({width:1440,height:1000});
  await page.getByRole('searchbox',{name:'Filter leads',exact:true}).fill('old filter that must reset');
  await page.locator('[data-location="1"]').fill('Sialkot');
  await page.getByRole('button',{name:'Run with filters',exact:true}).click();await page.getByRole('button',{name:'Continue without sign-in',exact:true}).click();
  await page.getByRole('button',{name:'Minimize · keep scanning',exact:true}).click();
  const emitLead=async(index)=>app.evaluate(({BrowserWindow},index)=>{
    const lead={id:'live-'+index,name:'Sialkot Live '+index,category:'Dentists',address:index+' Main Road, Sialkot',area:'Sialkot',postcode:'',phone:'+92300123456'+index,website:'https://live'+index+'.example.org',rating:4.5,reviewCount:12,latitude:32.49,longitude:74.54,placeRef:'live-place-'+index,mapsUrl:'https://maps.google.com/?cid=live'+index,query:'Dentists in Sialkot',keyword:'Dentists',provider:'chromium-maps',capturedAt:new Date().toISOString()};
    globalThis.__savedMaps.liveLeads??=[];if(!globalThis.__savedMaps.liveLeads.some(item=>item.id===lead.id))globalThis.__savedMaps.liveLeads.push(lead);
    for(const win of BrowserWindow.getAllWindows())win.webContents.send('scraper:progress',{runId:'current-live',status:'running',provider:'chromium-maps',keyword:'Dentists',keywordIndex:1,keywordTotal:1,found:globalThis.__savedMaps.liveLeads.length,target:20,message:'Scanning Sialkot',at:new Date().toISOString(),lead});
  },index);
  await emitLead(1);await table.getByText('Sialkot Live 1',{exact:true}).waitFor();if(await table.getByRole('row').count()!==2||(await table.innerText()).includes('Peshawar Business'))throw Error('Live results mixed with saved search');
  if(await page.getByRole('searchbox',{name:'Filter leads',exact:true}).inputValue()!=='')throw Error('Current run hidden behind old filter');
  await emitLead(1);await emitLead(2);await table.getByText('Sialkot Live 2',{exact:true}).waitFor();if(await table.getByRole('row').count()!==3)throw Error('Live rows not appended/deduplicated');
  if(!(await page.locator('.maps-active-search').innerText()).includes('Current scan')||!(await page.locator('.maps-active-search').innerText()).includes('Sialkot'))throw Error('Live scan labelled as saved search');
  await page.screenshot({path:join(out,'current-scan-live-results.png')});
  await app.evaluate(({BrowserWindow})=>{
    const t=globalThis.__savedMaps,request=t.liveRequest;const at='2026-10-30T12:00:00Z';
    const summary={runId:'current-live',status:'cancelled',provider:'chromium-maps',query:{...request.query,location:'Sialkot'},leads:t.liveLeads,startedAt:at,finishedAt:at,durationMs:1500,error:null};
    summary.stored=t.repository.saveRun(t.ws,{...summary,keywords:request.query.keywords,location:'Sialkot',maxResultsPerKeyword:20,detail:true});
    for(const win of BrowserWindow.getAllWindows())win.webContents.send('scraper:done',summary);
  });
  await page.waitForFunction(()=>document.querySelector('.maps-active-search')?.textContent.includes('Latest saved search'));
  await open.click();const liveSaved=drawer.locator('[data-saved-run="current-live"]');await liveSaved.waitFor();if(!(await liveSaved.innerText()).includes('2 of 20 leads saved'))throw Error('Completed live scan not saved');
  if(!(await liveSaved.innerText()).includes('Stopped by you'))throw Error('Stopped run looks completed in saved searches');
  await drawer.getByRole('button',{name:'Close saved searches'}).click();
  if(!(await page.locator('body').innerText()).includes('Stopped by you · 2 of 20 results'))throw Error('Stopped run header lacks status and target');
  await page.locator('[data-view="runs"]').click();
  await page.getByText('Stopped by you',{exact:true}).waitFor();
  if(!(await page.locator('body').innerText()).includes('2 of 20 results'))throw Error('Run history lacks captured/target count');
  if(errors.length)throw Error(errors.join('; '));
  const result={packaged:await app.evaluate(({app})=>app.isPackaged),version:await app.evaluate(({app})=>app.getVersion()),exports:exportChecks,checks:['top header saved-search button','old lower dropdown removed','58 persisted searches with older-search pagination','city/keyword filter','per-search PDF/Excel export','exports ignore current result filters','opening the selected city only','filters reset on search switch','actual unique saved counts','1005-row results and full export','empty/error search handling','reload persistence','new saved search refresh','export cancel returns to history','keyboard focus/Escape','dark and small layout','current scan shown live below','new-run filter reset','live row deduplication','live location labels','completed current scan auto-saved']};
  writeFileSync(join(out,sourceMode?'source-check.json':'packaged-check.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
 }finally{await app.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1});
