const assert = require('node:assert/strict')
const fs = require('node:fs')
const {join,resolve} = require('node:path')
const {tmpdir} = require('node:os')
const {_electron} = require('playwright')
const {prepareProfileDirectory} = require('../dist-electron/profile-directory.js')
const root = fs.mkdtempSync(join(tmpdir(),'mamalead-profile-'))
const fixture = name => {
  const base = join(root,name), old = join(base,'nafran-leads-scraper')
  fs.mkdirSync(join(old,'secrets'),{recursive:true})
  fs.writeFileSync(join(old,'leads.db'),'fixture database')
  fs.writeFileSync(join(old,'leads.db-wal'),'fixture wal')
  fs.writeFileSync(join(old,'Local State'),'fixture encryption metadata')
  fs.writeFileSync(join(old,'secrets','billing-installation.enc'),Buffer.from([0,1,2,255]))
  return {base,old,next:join(base,'MamaLead')}
}
async function main(){
  const f=fixture('copy')
  assert.equal(prepareProfileDirectory(f.base,f.old),f.next)
  for(const file of ['leads.db','leads.db-wal','Local State','secrets/billing-installation.enc'])assert.deepEqual(fs.readFileSync(join(f.old,file)),fs.readFileSync(join(f.next,file)))
  fs.writeFileSync(join(f.next,'leads.db'),'newer data')
  assert.equal(prepareProfileDirectory(f.base,f.old),f.next)
  assert.equal(fs.readFileSync(join(f.next,'leads.db'),'utf8'),'newer data')
  const explicit=fixture('explicit')
  assert.equal(prepareProfileDirectory(explicit.base,explicit.old,true),explicit.old)
  assert.equal(fs.existsSync(explicit.next),false)
  assert.equal(prepareProfileDirectory(explicit.base,join(root,'custom')),join(root,'custom'))
  const collision=fixture('collision');fs.mkdirSync(collision.next);fs.writeFileSync(join(collision.next,'customer.txt'),'keep')
  assert.throws(()=>prepareProfileDirectory(collision.base,collision.old),/unrecognised/)
  assert.equal(fs.readFileSync(join(collision.next,'customer.txt'),'utf8'),'keep')
  const blocked=fixture('blocked');fs.symlinkSync(f.old,join(blocked.old,'external'),'junction')
  assert.throws(()=>prepareProfileDirectory(blocked.base,blocked.old),/linked profile/)
  assert.equal(fs.existsSync(blocked.next),false)
  assert.deepEqual(fs.readdirSync(blocked.base),['nafran-leads-scraper'])
  assert.equal(fs.readFileSync(join(blocked.old,'leads.db'),'utf8'),'fixture database')
  console.log('PASS full profile/WAL/secrets copied; original backup retained; custom paths, collisions, failed copy cleanup and repeat launch safe')

  const base=join(root,'electron'),legacy=join(base,'nafran-leads-scraper'),next=join(base,'MamaLead')
  fs.mkdirSync(legacy,{recursive:true})
  const env={...process.env,LEADSNAP_BILLING_API_URL:'http://127.0.0.1:9'}
  delete env.ELECTRON_RUN_AS_NODE;delete env.VITE_DEV_SERVER_URL
  let app=await _electron.launch({cwd:process.cwd(),args:['.','--user-data-dir='+legacy],env,timeout:60000})
  try{
    const page=await app.firstWindow()
    await app.evaluate(({app,safeStorage})=>{
      const fs=process.getBuiltinModule('fs'),path=process.getBuiltinModule('path')
      const req=process.getBuiltinModule('module').createRequire(path.join(app.getAppPath(),'package.json'))
      const {db,repository}=req('./dist-electron/db/index.js').openDatabase()
      repository.importWebsites(db.ensureWorkspace().id,['preserved.fixture.test'],false)
      fs.mkdirSync(path.join(app.getPath('userData'),'secrets'),{recursive:true})
      fs.writeFileSync(path.join(app.getPath('userData'),'secrets','migration-test.enc'),safeStorage.encryptString('fixture-token-not-a-real-license'))
    })
    await page.evaluate(()=>localStorage.setItem('migration-test','saved UI settings'))
  }finally{await app.close()}
  const harness=join(root,'launch.cjs')
  fs.writeFileSync(harness,`const {app}=require('electron');app.setAppPath(${JSON.stringify(process.cwd())});app.setPath('appData',${JSON.stringify(base)});app.setPath('userData',${JSON.stringify(legacy)});app.setPath('sessionData',${JSON.stringify(legacy)});require(${JSON.stringify(resolve('dist-electron/bootstrap.js'))});`)
  app=await _electron.launch({args:[harness],env,timeout:60000})
  try{
    const page=await app.firstWindow()
    const check=await app.evaluate(({app,safeStorage})=>{
      const fs=process.getBuiltinModule('fs'),path=process.getBuiltinModule('path')
      const req=process.getBuiltinModule('module').createRequire(path.join(app.getAppPath(),'package.json'))
      const {db,repository}=req('./dist-electron/db/index.js').openDatabase()
      return {path:app.getPath('userData'),session:app.getPath('sessionData'),lock:app.hasSingleInstanceLock(),leads:repository.listLeads(db.ensureWorkspace().id,{limit:10}).rows.length,secretOK:safeStorage.decryptString(fs.readFileSync(path.join(app.getPath('userData'),'secrets','migration-test.enc')))==='fixture-token-not-a-real-license'}
    })
    assert.equal(check.path,next);assert.equal(check.session,next);assert.equal(check.lock,true);assert.equal(check.leads,1);assert.equal(check.secretOK,true)
    assert.equal(await page.evaluate(()=>localStorage.getItem('migration-test')),'saved UI settings')
    await page.locator('[data-view="settings"]').click();await page.locator('[data-stab="acct"]').click()
    assert.equal(await page.locator('[data-account-data-path]').innerText(),join(next,'leads.db'))
    console.log('PASS Electron migration preserves real SQLite lead, decryptable safeStorage token and localStorage; Account shows MamaLead\\leads.db')
  }finally{await app.close()}
  app=await _electron.launch({args:[harness],env,timeout:60000})
  try{await app.firstWindow();assert.equal(await app.evaluate(({app})=>app.getPath('userData')),next)}finally{await app.close()}
  console.log('PASS migrated app relaunches the same MamaLead profile')
}
main().catch(e=>{console.error(e);process.exitCode=1})
