const assert=require('node:assert/strict'),{_electron}=require('playwright'),fs=require('node:fs'),path=require('node:path'),os=require('node:os')
const root=path.resolve(__dirname,'..'),packaged=process.argv.includes('--packaged'),out=path.resolve(root,'../../outputs/finder-progress-qa');fs.mkdirSync(out,{recursive:true})
async function main(){
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;delete env.VITE_DEV_SERVER_URL
 const executable=require('./electron-test-executable.cjs').electronTestExecutable(packaged)
 const app=await _electron.launch({executablePath:executable,args:[...packaged?[]:[root],'--user-data-dir='+fs.mkdtempSync(path.join(os.tmpdir(),'finder-progress-'))],env,timeout:60000})
 try{
  await app.evaluate(({app,ipcMain,BrowserWindow})=>{
   const path=process.getBuiltinModule('path'),req=process.getBuiltinModule('module').createRequire(path.join(app.getAppPath(),'package.json'))
   const {db,repository:repo}=req('./dist-electron/db/index.js').openDatabase(),ws=db.ensureWorkspace().id
   const {EnrichmentRunner}=req('./dist-electron/enrichment/runner.js'),{WebsiteEnricher}=req('./dist-electron/enrichment/website.js')
   const state={pending:null,calls:[],jobs:[],repo,ws};globalThis.__finderProgress=state
   const inspect=async function(url,signal){
    state.calls.push(url)
    await new Promise((resolve,reject)=>{state.pending=resolve;const stop=()=>{state.pending=null;reject(new DOMException('Aborted','AbortError'))};if(signal.aborted)stop();else signal.addEventListener('abort',stop,{once:true})})
    const host=new URL(url).hostname
    return {emails:[{value:'hello@'+host,page:url,score:95}],phones:[{value:'+442079460123',page:url,score:95}],socials:[{platform:'linkedin',handle:host,profileUrl:'https://www.linkedin.com/company/'+host,page:url}],people:[],addresses:[],pagesRead:[url],error:null}
   }
   WebsiteEnricher.prototype.inspectSocialFast=inspect;WebsiteEnricher.prototype.inspectPhoneFast=inspect;WebsiteEnricher.prototype.inspectContactFast=inspect
   const runner=new EnrichmentRunner(db,repo,{authorize:async()=>{},onProgress:p=>{for(const win of BrowserWindow.getAllWindows())win.webContents.send('enrichment:progress',p)}})
   const override=(channel,handler)=>{ipcMain.removeHandler(channel);ipcMain.handle(channel,handler)}
   override('billing:status',()=>({connected:true,configured:true,coreLicenseActive:true,license:{active:true,kind:'lifetime'},lifetime:{active:true}}))
   override('db:imports:websites',(_,p)=>repo.importWebsites(ws,p.input,false))
   override('db:jobs:queue',(_,p)=>{const job=repo.queueJob(ws,p.kind,p.leadIds);state.jobs.push(job.jobId);return job})
   override('enrichment:prioritize',(_,p)=>{void runner.prioritize(p?.jobId);return {started:true}})
   override('enrichment:stop',(_,p)=>{runner.stop(p?.jobId);return {stopped:true}})
  })
  const page=await app.firstWindow(),errors=[],checks=[];page.on('pageerror',e=>errors.push(e.message));await page.setViewportSize({width:1350,height:900});await page.reload()
  await page.evaluate(()=>{window.__scanScrolls=[];const original=Element.prototype.scrollIntoView;Element.prototype.scrollIntoView=function(options){if(this.matches('[data-finder-progress]'))window.__scanScrolls.push(this.dataset.finderProgress);return original.call(this,options)}})
  async function release(){await app.evaluate(async()=>{const s=globalThis.__finderProgress,end=Date.now()+5000;while(!s.pending && Date.now()<end)await new Promise(r=>setTimeout(r,20));if(!s.pending)throw Error('No pending source');const r=s.pending;s.pending=null;r()})}
  async function start(kind,suffix){await page.locator('[data-view="'+kind+'"]').click();await page.getByRole('button',{name:'Import websites',exact:true}).click();const modal=page.locator('[data-impmodal]');await modal.locator('textarea').fill(`${kind}-${suffix}-one.test\n${kind}-${suffix}-two.test`);await modal.getByRole('button',{name:'Scan 2 sites',exact:true}).click();await modal.waitFor({state:'detached'});const panel=page.locator('[data-finder-progress="'+kind+'"]');await panel.getByRole('button',{name:'Stop scan',exact:false}).waitFor();return panel}
  for(const kind of ['social','email','phone']){
   const panel=await start(kind,'complete'),bar=panel.getByRole('progressbar');assert.equal(await bar.getAttribute('aria-valuenow'),'0');assert.doesNotMatch(await panel.innerText(),/OWNER LOOKUP|Identify the owner|Match a published email/)
   await page.waitForFunction(kind=>window.__scanScrolls.includes(kind),kind)
   const count=await page.evaluate(kind=>window.__scanScrolls.filter(x=>x===kind).length,kind);await page.waitForTimeout(650);assert.equal(await page.evaluate(kind=>window.__scanScrolls.filter(x=>x===kind).length,kind),count)
   await panel.evaluate(el=>el.scrollIntoView({behavior:'instant',block:'start'}))
   assert.ok(await panel.getByRole('button',{name:'Stop scan',exact:false}).evaluate(el=>{const r=el.getBoundingClientRect();return el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))}),'Sticky toolbar hides Stop scan')
   await release();await page.waitForFunction(kind=>document.querySelector(`[data-finder-progress="${kind}"] [role="progressbar"]`)?.getAttribute('aria-valuenow')==='50',kind)
   assert.match(await panel.innerText(),/1 of 2 leads checked/);assert.match(await panel.innerText(),/1 remaining/)
   await panel.screenshot({path:path.join(out,`${packaged?'packaged-':''}${kind}-running.png`),animations:'disabled'})
   await page.evaluate(()=>document.querySelector('[data-theme-btn]').click());await panel.screenshot({path:path.join(out,`${packaged?'packaged-':''}${kind}-dark.png`),animations:'disabled'});await page.evaluate(()=>document.querySelector('[data-theme-btn]').click())
   await page.setViewportSize({width:850,height:800});assert.ok(await panel.evaluate(el=>el.scrollWidth<=el.clientWidth+1));await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await panel.locator('.finder-orbit-outer').evaluate(el=>getComputedStyle(el).animationName),'none');await page.emulateMedia({reducedMotion:'no-preference'});await page.setViewportSize({width:1350,height:900})
   await release();await panel.getByText('Scan complete',{exact:true}).waitFor({timeout:10000});assert.equal(await bar.getAttribute('aria-valuenow'),'100');checks.push(kind+': real 0/50/100 progress, automatic scroll once, animation/light/dark/reduced motion')
   const stopped=await start(kind,'stop');await release();await page.waitForFunction(kind=>document.querySelector(`[data-finder-progress="${kind}"] [role="progressbar"]`)?.getAttribute('aria-valuenow')==='50',kind)
   await stopped.getByRole('button',{name:'Stop scan',exact:false}).click();await stopped.getByText('Scan stopped',{exact:true}).waitFor({timeout:10000});assert.equal(await stopped.getByRole('progressbar').getAttribute('aria-valuenow'),'50')
   const status=await app.evaluate(()=>{const s=globalThis.__finderProgress;return s.repo.jobStatus(s.ws,s.jobs.at(-1))});assert.equal(status.status,'cancelled');assert.equal(status.processed,1);assert.equal(status.total,2)
   if(kind==='social')assert.match(await page.locator('[data-profcard]').locator('xpath=ancestor::section[1]').innerText(),/Not scanned/)
   checks.push(kind+': Stop preserves 1 completed result and 1 unprocessed website')
  }
  assert.deepEqual(errors,[])
  const report={passed:true,packaged,executable,checks};fs.writeFileSync(path.join(out,process.env.MAMALEAD_TEST_EXECUTABLE?'installed.json':packaged?'packaged.json':'source.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2))
 }finally{await app.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1})
