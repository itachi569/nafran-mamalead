// Isolated integration checks. No customer data, mailbox service, checkout or outgoing email.
const assert=require('node:assert/strict'),{mkdtempSync,mkdirSync}=require('node:fs'),{tmpdir}=require('node:os'),{join,resolve}=require('node:path')
const {_electron}=require('playwright')
async function main(){
 const out=resolve('screenshots/qa-1.4.23/ui');mkdirSync(out,{recursive:true})
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;delete env.VITE_DEV_SERVER_URL
 const packaged=process.argv.includes('--packaged')
 const app=await _electron.launch({...(packaged?{executablePath:process.env.MAMALEAD_TEST_EXE}:{cwd:process.cwd()}),args:[...(packaged?[]:['.']),'--user-data-dir='+mkdtempSync(join(tmpdir(),'mamalead-qa1423-ui-'))],env,timeout:60000})
 try{
  const page=await app.firstWindow(),errors=[];page.on('pageerror',e=>errors.push(e.message))
  await page.locator('#nafran-license-key').waitFor()
  await page.screenshot({path:join(out,'fresh-install-account.png')})
  console.log('PASS fresh download/install launch opens Account and the activation field')
  await app.evaluate(async({app,ipcMain})=>{
   const path=process.getBuiltinModule('path'),req=process.getBuiltinModule('module').createRequire(path.join(app.getAppPath(),'package.json'))
   req('./dist-electron/billing/client.js').requireActiveLicense=async()=>{}
   const {db,repository:repo}=req('./dist-electron/db/index.js').openDatabase(),ws=db.ensureWorkspace().id
   globalThis.__qa={db,repo,ws,prechecks:[],cancel:false}
   ipcMain.removeHandler('billing:status');ipcMain.handle('billing:status',()=>({configured:true,connected:true,mode:'test',coreLicenseActive:true,license:{active:true,kind:'lifetime',last4:'ABCD'},lifetime:{active:true},mapsLeads:{used:0,remaining:null,limit:null},trial:{active:false}}))
   ipcMain.removeHandler('billing:invoices');ipcMain.handle('billing:invoices',()=>[])
   const {WebsiteEnricher}=req('./dist-electron/enrichment/website.js')
   WebsiteEnricher.prototype.inspectContactFast=async url=>({emails:[],phones:[],socials:[],people:[],pagesRead:[],error:'Fixture website could not be read — retry '+(++__qa.attempt)})
   __qa.attempt=0
   const first=repo.startWebsiteLookup(ws,['retry-1423.test'],{email:false,phone:false,social:true,address:false})
   const {EnrichmentRunner}=req('./dist-electron/enrichment/runner.js');await new EnrichmentRunner(db,repo).drain()
   __qa.firstJob=first.jobId
   const precheck=req('./dist-electron/email-precheck.js'),realPrecheck=precheck.precheckEmail
   precheck.precheckEmail=async(email,signal)=>{
    __qa.prechecks.push(email)
    if(__qa.cancel)return new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}))
    return realPrecheck(email,signal,{cancel(){},async resolveMx(){return []},async resolve4(){return []},async resolve6(){return []}})
   }
   const ids=repo.importWebsites(ws,['scope-a1423.test','scope-b1423.test','scope-out1423.test'],false).leadIds;__qa.ids=ids
   for(const [index,value] of ['person@gmial.com','hello@dead-dns1423.test','hello@outside1423.test'].entries())repo.upsertContact({leadId:ids[index],kind:'email',value,source:'manual'})
  })
  await page.reload();await page.locator('[data-view="website"]').click()
  await page.getByRole('button',{name:'Retry failed',exact:true}).waitFor()
  assert.match(await page.locator('.wl-progress').innerText(),/0 new · 0 saved websites reused · 1 not saved/)
  await page.getByRole('button',{name:'Retry failed',exact:true}).click()
  await page.locator('.wl-row-error').filter({hasText:'retry 2'}).waitFor({timeout:30000})
  const jobs=await app.evaluate(()=>({first:__qa.firstJob,latest:__qa.repo.websiteLookupSession(__qa.ws).jobId}));assert.notEqual(jobs.first,jobs.latest)
  assert.match(await page.locator('.wl-progress').innerText(),/1 error\b/)
  assert.match(await page.locator('.wl-progress').innerText(),/1 unreadable website not saved/)
  await page.screenshot({path:join(out,'failed-retry-visible.png')})
  await page.reload();await page.locator('[data-view="website"]').click()
  await page.locator('.wl-row-error').filter({hasText:'retry 2'}).waitFor()
  console.log('PASS retry creates a new scan, shows the failure/discarded count, and survives refresh')
  const ids=await app.evaluate(()=>__qa.ids)
  const checked=await page.evaluate(ids=>window.desktop.emailValidity.verify({leadIds:ids.slice(0,2)}),ids)
  assert.equal(checked.checked,2);assert.equal(checked.invalid,1);assert.equal(checked.risky,1)
  const contacts=await app.evaluate(()=>__qa.repo.listContacts(__qa.ws,'email',__qa.ids))
  assert.equal(contacts.find(c=>c.value==='person@gmial.com').validation_status,'risky')
  assert.equal(contacts.find(c=>c.value==='hello@dead-dns1423.test').validation_status,'invalid')
  assert.equal(contacts.find(c=>c.value==='hello@outside1423.test').validation_status,null)
  assert.equal((await app.evaluate(()=>__qa.prechecks)).length,2)
  await page.locator('[data-view="email"]').click()
  await page.locator('[data-email-address="person@gmial.com"]').waitFor()
  const typoRow=page.locator('[data-row]').filter({has:page.locator('[data-email-address="person@gmial.com"]')})
  await typoRow.getByText('Verification details',{exact:true}).click()
  await typoRow.getByText(/Did you mean person@gmail.com/).waitFor()
  await page.screenshot({path:join(out,'local-email-verdict.png')})
  console.log('PASS real validity IPC checks only the chosen import, persists local risky/invalid results, leaves other emails untouched')
  await app.evaluate(()=>{const c=__qa.repo.listContacts(__qa.ws,'email',[__qa.ids[2]])[0];__qa.repo.updateEmailValidation(c.id,{status:'unknown',verified:false,score:null,message:'DNS temporarily unavailable',provider:'local'})})
  assert.equal((await page.evaluate(id=>window.desktop.emailValidity.verify({leadIds:[id]}),ids[2])).checked,1,'a local Unknown can be checked again without a provider-specific recheck')
  await app.evaluate(()=>{__qa.cancel=true})
  const stopped=page.evaluate(id=>window.desktop.emailValidity.verify({leadIds:[id],force:true}),ids[0])
  await page.waitForFunction(async()=> (await window.desktop.emailValidity.status()).progress.state==='running')
  await page.evaluate(()=>window.desktop.emailValidity.cancel())
  assert.equal((await stopped).cancelled,true)
  assert.equal((await page.evaluate(()=>window.desktop.emailValidity.status())).progress.state,'cancelled')
  assert.deepEqual(errors,[])
  console.log('PASS stop during DNS checks returns Cancelled, no renderer errors')
 }finally{await app.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1})
