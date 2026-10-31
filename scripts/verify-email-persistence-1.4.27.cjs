// Runs with isolated customer-free data; website/provider responses are deterministic fixtures.
const assert = require('node:assert/strict')
const {mkdtempSync,mkdirSync} = require('node:fs')
const {tmpdir} = require('node:os')
const {join,resolve} = require('node:path')
const {_electron} = require('playwright')
const userData = mkdtempSync(join(tmpdir(),'mamalead-email1427-'))
const out = resolve('screenshots/qa-1.4.27')
mkdirSync(out,{recursive:true})
const env={...process.env,LEADSNAP_TEST_HOOKS:'1'}
delete env.VITE_DEV_SERVER_URL
delete env.ELECTRON_RUN_AS_NODE
const packaged=process.argv.includes('--packaged')
async function launch(){
  const app=await _electron.launch({
    ...(packaged?{executablePath:process.env.MAMALEAD_TEST_EXE}:{cwd:process.cwd()}),
    args:[...(packaged?[]:['.']),'--user-data-dir='+userData],env,timeout:60000,
  })
  await app.firstWindow({timeout:60000})
  await app.evaluate(({app,ipcMain})=>{
    const req=process.getBuiltinModule('module').createRequire(app.getAppPath()+'/package.json')
    req('./dist-electron/billing/client.js').requireActiveLicense=async()=>{}
    ipcMain.removeHandler('billing:status')
    ipcMain.handle('billing:status',()=>({connected:true,configured:true,coreLicenseActive:true,license:{active:true,kind:'lifetime'},lifetime:{active:true},mapsLeads:{used:0,remaining:null,limit:null}}))
    ipcMain.removeHandler('billing:invoices');ipcMain.handle('billing:invoices',()=>[])
    const {db,repository:repo}=req('./dist-electron/db/index.js').openDatabase()
    globalThis.__qa1427={req,db,repo,ws:db.ensureWorkspace().id}
    const {WebsiteEnricher}=req('./dist-electron/enrichment/website.js')
    WebsiteEnricher.prototype.inspectContactFast=async url=>({
      emails:[{value:'contact@'+new URL(url).hostname,page:url+'/contact',score:80}],
      phones:[],socials:[],people:[],pagesRead:[url+'/contact'],error:null,
    })
  })
  return app
}
async function main(){
  let app=await launch()
  const errors=[]
  let ids
  try{
    ids=await app.evaluate(()=>{
      const {repo,db,ws}=__qa1427
      const old=repo.importWebsites(ws,['old-import.fixture.test','outside-scope.fixture.test'],false)
      db.run("update leads set captured_at='2020-01-01T00:00:00.000Z' where workspace_id=?",[ws])
      repo.importWebsites(ws,Array.from({length:523},(_,i)=>'saved-'+i+'.fixture.test'),false)
      const outside=repo.upsertContact({leadId:old.leadIds[1],kind:'email',value:'outside@outside-scope.fixture.test',source:'https://outside-scope.fixture.test/contact'})
      repo.updateEmailValidation(outside.id,{status:'unknown',verified:false,score:null,provider:'leadsangel',message:'Temporary SMTP error'})
      return {old:old.leadIds[0],outside:old.leadIds[1]}
    })
    const page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.message))
    await page.locator('[data-view="email"]').click()
    await page.getByRole('button',{name:'Import websites',exact:true}).click()
    await page.locator('[data-imptext="1"]').fill('https://old-import.fixture.test\nhttps://new-import.fixture.test')
    await page.locator('[data-importgo="1"]').click()
    await page.locator('[data-email-address="contact@new-import.fixture.test"]').waitFor({timeout:30000})
    await page.locator('[data-email-address="contact@old-import.fixture.test"]').waitFor({timeout:30000})
    await page.waitForFunction(()=>document.querySelector('[data-finder-progress="email"]')?.textContent.includes('100%'))
    assert.equal(await page.locator('[data-flist="email"] [data-row="1"]').count(),2,'completed import remains scoped')
    await app.evaluate(()=>{
      const {repo,ws}=__qa1427
      const leads=repo.listLeads(ws,{limit:1000}).rows.filter(row=>/^(old|new)-import/.test(row.name))
      for(const lead of leads){
        const c=repo.listContacts(ws,'email',[lead.id])[0]
        repo.updateEmailValidation(c.id,{status:'unknown',verified:false,score:null,provider:'leadsangel',message:'LeadsAngel SMTP: rcpt rejected 550'})
      }
    })
    await page.evaluate(()=>window.desktop.test.mockOneEmailValidity())
    await page.locator('[data-flistcard="email"]').getByRole('button',{name:'Check email validity',exact:true}).click()
    await page.waitForFunction(async()=>{
      const s=await window.desktop.emailValidity.status()
      return s.progress.state==='completed' && s.progress.checked===2
    })
    assert.equal(await app.evaluate((_,id)=>__qa1427.repo.listContacts(__qa1427.ws,'email',[id])[0].validation_status,ids.outside),'unknown')
    const saved=await app.evaluate(()=>__qa1427.repo.listLeads(__qa1427.ws,{limit:1000}).rows.filter(row=>/^(old|new)-import/.test(row.name)).map(row=>row.id))
    const cached=await page.evaluate(leadIds=>window.desktop.emailValidity.verify({leadIds}),saved)
    assert.equal(cached.checked,0);assert.equal(cached.skipped,2)
    assert.match((await page.evaluate(()=>window.desktop.emailValidity.status())).progress.message,/No pending emails/)
    const empty=await page.evaluate(()=>window.desktop.emailValidity.verify({leadIds:[]}))
    assert.equal(empty.checked,0)
    assert.match((await page.evaluate(()=>window.desktop.emailValidity.status())).progress.message,/No email addresses found/)
    console.log('PASS normal validity button retries provider Unknown on both imported sites, keeps outside results untouched, skips completed verdicts')
    await page.locator('[data-fq="email"]').fill('no-such-company')
    await page.locator('select[aria-label="Filter rows"]').first().selectOption('invalid')
    await page.locator('[data-view="phone"]').click()
    await page.locator('[data-view="email"]').click()
    await page.waitForFunction(()=>document.querySelectorAll('[data-flist="email"] [data-row="1"]').length===526)
    assert.equal(await page.locator('[data-fq="email"]').inputValue(),'')
    assert.equal(await page.locator('select[aria-label="Filter rows"]').first().inputValue(),'all')
    assert.equal(await page.locator('[data-email-address="contact@old-import.fixture.test"]').count(),1)
    assert.equal(await page.locator('[data-email-address="contact@new-import.fixture.test"]').count(),1)
    await page.locator('[data-fq="email"]').fill('new-import.fixture.test')
    await page.locator('[data-flistcard="email"]').scrollIntoViewIfNeeded()
    await page.screenshot({path:join(out,packaged?'packaged-saved-import.png':'saved-import.png')})
    assert.deepEqual(errors,[])
    console.log('PASS returning to Addresses restores all 526 saved leads including new import and rescanned lead beyond the first 500')
  }finally{await app.close()}
  app=await launch()
  try{
    const page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.message))
    await page.locator('[data-view="email"]').click()
    await page.waitForFunction(()=>document.querySelectorAll('[data-flist="email"] [data-row="1"]').length===526)
    assert.equal(await page.locator('[data-email-address="contact@old-import.fixture.test"]').count(),1)
    assert.equal(await page.locator('[data-email-address="contact@new-import.fixture.test"]').count(),1)
    const state=await app.evaluate(()=>{
      const {repo,ws}=__qa1427
      return repo.listContacts(ws,'email').map(c=>({email:c.value,status:c.validation_status}))
    })
    assert.equal(state.filter(c=>c.status==='valid').length,2)
    assert.equal(state.filter(c=>c.status==='unknown').length,1)
    const duplicate=await page.evaluate(()=>window.desktop.local.imports.websites(['https://new-import.fixture.test'],{enqueue:false}))
    assert.equal(duplicate.added,0)
    assert.deepEqual(errors,[])
    console.log('PASS saved imported emails and validity survive process restart; re-import does not duplicate data; no renderer errors')
  }finally{await app.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1})
