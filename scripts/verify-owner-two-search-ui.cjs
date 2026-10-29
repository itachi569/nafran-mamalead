const assert=require('node:assert/strict'),{_electron}=require('playwright'),fs=require('node:fs'),path=require('node:path'),os=require('node:os')
const root=path.resolve(__dirname,'..'),packaged=process.argv.includes('--packaged'),out=path.join(root,'screenshots/release-audit/MamaLead-owner-two-search');fs.mkdirSync(out,{recursive:true})
async function main(){
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;delete env.VITE_DEV_SERVER_URL
 const app=await _electron.launch({executablePath:path.join(root,packaged?'release/win-unpacked/MamaLead.exe':'node_modules/electron/dist/electron.exe'),args:[...packaged?[]:[root],'--user-data-dir='+fs.mkdtempSync(path.join(os.tmpdir(),'owner-two-search-ui-'))],env,timeout:60000})
 try{
  await app.evaluate(({app,ipcMain,BrowserWindow,dialog},out)=>{
   const path=process.getBuiltinModule('path'),req=process.getBuiltinModule('module').createRequire(path.join(app.getAppPath(),'package.json'))
   const {db,repository:repo}=req('./dist-electron/db/index.js').openDatabase(),ws=db.ensureWorkspace().id,{EnrichmentRunner}=req('./dist-electron/enrichment/runner.js')
   const state={db,repo,ws,queries:[],jobs:[],exports:[],slow:false,hold:true,resume:null,providerFailed:true};globalThis.__ownerTwo=state
   const original=globalThis.fetch
   globalThis.fetch=async(raw,options)=>{
    const u=new URL(String(raw))
    if(u.hostname==='api.dataforseo.com'){
     const query=JSON.parse(options.body)[0].keyword;state.queries.push(query)
     if(state.hold)await new Promise(resolve=>{state.resume=resolve})
     await new Promise(resolve=>setTimeout(resolve,600))
     if(query.includes('slow-owner.test')){state.slow=true;await new Promise((_,reject)=>{if(options.signal.aborted)reject(new DOMException('Aborted','AbortError'));else options.signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true})})}
     if(query.includes('error-owner.test') && state.providerFailed)return Response.json({tasks:[{status_code:40101,status_message:'Internal SE Server Error.'}]})
     const domain=query.match(/(?:name of |owner of )([\w.-]+\.test)/)[1],page=query.startsWith('name of ')?'/about':'/contact'
     return Response.json({tasks:[{status_code:20000,result:[{items:[{type:'organic',title:'Owner',url:'https://'+domain+page,description:'Published source'}]}]}]})
    }
    if(u.hostname.endsWith('.test'))return new Response(u.pathname==='/about'?'<article><h2>Janet Cole</h2><p>Founder</p></article>':u.hostname==='named-owner.test'?'<p>Janet Cole</p><a href="mailto:janet@named-owner.test">Email Janet</a>':'<p>No email published</p>')
    return original(raw,options)
   }
   const runner=new EnrichmentRunner(db,repo,{authorize:async()=>{},deepKey:()=> 'fixture',onProgress:progress=>{for(const win of BrowserWindow.getAllWindows())win.webContents.send('enrichment:progress',progress)}})
   const override=(channel,handler)=>{ipcMain.removeHandler(channel);ipcMain.handle(channel,handler)}
   override('billing:status',()=>({connected:true,configured:true,coreLicenseActive:true,license:{active:true,kind:'lifetime'},lifetime:{active:true},decisionMaker:{active:true,available:true,status:'active',monthlyLimit:1000,monthlyUsed:0,monthlyRemaining:1000}}))
   override('db:imports:websites',(_,p)=>repo.importWebsites(ws,p.input,false))
   override('db:jobs:queue',(_,p)=>{const job=repo.queueJob(ws,p.kind,p.leadIds);state.jobs.push(job.jobId);return job})
   override('enrichment:prioritize',(_,p)=>{void runner.prioritize(p?.jobId);return {started:true}})
   override('enrichment:stop',(_,p)=>{runner.stop(p?.jobId);return {stopped:true}})
   const ids=repo.importWebsites(ws,['error-owner.test'],false).leadIds;repo.addDecisionMaker({workspaceId:ws,leadId:ids[0],fullName:'Old Owner',title:'Founder',email:'old@error-owner.test',source:'https://error-owner.test/about'})
   dialog.showSaveDialog=async(_,options)=>({canceled:false,filePath:path.join(out,path.basename(options.defaultPath))})
   const {writeExport}=req('./dist-electron/export/writer.js')
   override('db:exports:write',async(event,p)=>{state.exports.push(p);return writeExport(BrowserWindow.fromWebContents(event.sender),repo,ws,p)})
  },out)
  const page=await app.firstWindow(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.setViewportSize({width:1400,height:1000});await page.reload();await page.locator('[data-view="dm"]').click()
  async function scan(value,count){await page.getByRole('button',{name:'Import websites',exact:true}).click();const modal=page.locator('[data-impmodal]');await modal.locator('textarea').fill(value);await modal.getByRole('button',{name:`Scan ${count} ${count===1?'site':'sites'}`,exact:true}).click();await modal.waitFor({state:'detached'})}
  await scan('named-owner.test\nmissing-owner.test\nerror-owner.test',3)
  await page.locator('[data-decision-progress]').getByText(/Search 1 of 2/).waitFor({timeout:15000})
  const panel=page.locator('[data-decision-progress]')
  await panel.screenshot({path:path.join(out,packaged?'packaged-running.png':'source-running.png'),animations:'disabled'})
  assert.notEqual(await page.locator('.dm-orbit-outer').evaluate(el=>getComputedStyle(el).animationName),'none')
  await page.evaluate(()=>document.querySelector('[data-theme-btn]').click())
  await panel.screenshot({path:path.join(out,packaged?'packaged-running-dark.png':'source-running-dark.png'),animations:'disabled'})
  await page.evaluate(()=>document.querySelector('[data-theme-btn]').click())
  await page.setViewportSize({width:800,height:900});await panel.screenshot({path:path.join(out,packaged?'packaged-running-small.png':'source-running-small.png'),animations:'disabled'})
  assert.ok(await panel.evaluate(el=>el.scrollWidth<=el.clientWidth+1),'Loading panel overflows')
  await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await page.locator('.dm-orbit-outer').evaluate(el=>getComputedStyle(el).animationName),'none');await page.emulateMedia({reducedMotion:'no-preference'})
  await page.setViewportSize({width:1400,height:1000});await app.evaluate(()=>{const t=globalThis.__ownerTwo;t.hold=false;t.resume()})
  await page.waitForFunction(()=>document.querySelector('[data-decision-progress] [role="progressbar"]')?.getAttribute('aria-valuenow')==='100',{timeout:30000})
  const result=page.locator('[data-owner-results]');await result.getByRole('link',{name:'janet@named-owner.test',exact:true}).waitFor();const text=await result.innerText();assert.match(text,/Not published/);assert.match(text,/Search failed/);assert.ok(!text.includes('old@error-owner.test'))
  await page.locator('[data-saved-results="dm"]').screenshot({path:path.join(out,packaged?'packaged-results.png':'source-results.png')})
  await page.getByRole('button',{name:'Download PDF',exact:true}).click()
  await page.waitForFunction(()=>!document.querySelector('[data-dm-export-options] button')?.disabled)
  const exported=await app.evaluate(()=>{const t=globalThis.__ownerTwo;return {requests:t.queries.length,exports:t.exports.map(p=>({...p,domains:p.leadIds.map(id=>t.repo.getLead(t.ws,id).website)}))}})
  assert.equal(exported.requests,6);assert.equal(exported.exports.length,1);assert.equal(exported.exports[0].leadIds.length,2);assert.ok(exported.exports[0].domains.every(d=>!d.includes('error-owner')))
  await scan('missing-owner.test\nerror-owner.test',2)
  const retry=panel.getByRole('button',{name:'Retry 1 failed business',exact:true});await retry.waitFor({timeout:20000})
  assert.match(await result.innerText(),/not a rejected API key/)
  const prior=await app.evaluate(()=>{const t=globalThis.__ownerTwo;t.providerFailed=false;return t.queries.length})
  await retry.click();await panel.getByText('Scan complete',{exact:true}).waitFor({timeout:20000})
  const retried=await app.evaluate((_,prior)=>globalThis.__ownerTwo.queries.slice(prior),prior)
  assert.equal(retried.length,2);assert.ok(retried.every(q=>q.includes('error-owner.test')));assert.doesNotMatch(await result.innerText(),/Search failed|old@/)
  await scan('slow-owner.test\nnever-owner.test',2);await app.evaluate(async()=>{const start=Date.now();while(!globalThis.__ownerTwo.slow&&Date.now()-start<15000)await new Promise(r=>setTimeout(r,50));if(!globalThis.__ownerTwo.slow)throw Error('Slow fixture did not start')})
  await page.locator('[data-decision-progress]').getByRole('button',{name:/Stop scan/}).click();await page.getByText('Scan stopped. Completed results are saved below.',{exact:true}).first().waitFor({timeout:10000})
  const final=await app.evaluate(()=>{const t=globalThis.__ownerTwo;return {job:t.repo.jobStatus(t.ws,t.jobs.at(-1)),queries:t.queries}});assert.equal(final.job.status,'cancelled');assert.ok(!final.queries.some(q=>q.includes('never-owner')));assert.match(await result.innerText(),/Not scanned/)
  assert.deepEqual(errors,[]);const report={passed:true,packaged,checks:['exact two-search flow through real Electron queue','animated light/dark and narrow loading panel','reduced-motion preference respected','progress and 100% completion','Not published versus provider error','stale failure excluded from table and PDF export','40101 retry targets only failed businesses and recovers','Stop skips remaining businesses','no renderer errors'],exported};fs.writeFileSync(path.join(out,packaged?'packaged-ui.json':'source-ui.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2))
 }finally{await app.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1})
