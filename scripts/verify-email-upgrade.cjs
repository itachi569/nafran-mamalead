const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os')
const {_electron}=require('playwright')
const {LocalDatabase}=require('../dist-electron/db/local-db.js'),{Repository}=require('../dist-electron/db/repository.js')
const {electronTestExecutable}=require('./electron-test-executable.cjs')
const root=path.resolve(__dirname,'..'),packaged=process.argv.includes('--packaged')
async function main(){
  const profile=fs.mkdtempSync(path.join(os.tmpdir(),'mamalead-email-upgrade-'))
  const db=new LocalDatabase(path.join(profile,'leads.db')),repo=new Repository(db),ws=db.ensureWorkspace().id
  const session=repo.startWebsiteLookup(ws,['https://legacyclinic.com'],{email:true,phone:false,social:false,address:false})
  const leadId=session.rows[0].leadId,at='2026-10-20T12:00:00.000Z'
  for(const [id,value,score] of [['old-private','info@gateway.internal',99],['public-alternative','hello@legacyclinic.com',70]]){
    db.run('insert into lead_contacts (id,lead_id,workspace_id,kind,value,source,score,created_at) values (?,?,?,?,?,?,?,?)',[id,leadId,ws,'email',value,'manual',score,at])
  }
  db.run('delete from app_data_migrations where name=?',['private-emails-1.4.34'])
  db.run('insert or ignore into app_data_migrations (name,applied_at) values (?,?)',['private-emails-1.4.33',at])
  db.close()
  const env={...process.env,LEADSNAP_BILLING_API_URL:'http://127.0.0.1:9'}
  delete env.ELECTRON_RUN_AS_NODE;delete env.VITE_DEV_SERVER_URL
  const app=await _electron.launch({executablePath:electronTestExecutable(packaged),args:[...packaged?[]:[root],...(process.platform==='linux'&&process.env.CI?['--no-sandbox']:[]),'--user-data-dir='+profile],env,timeout:60000})
  try{
    await app.firstWindow()
    const result=await app.evaluate(async({app},{ws,leadId})=>{
      await app.whenReady()
      const req=process.getBuiltinModule('module').createRequire(app.getAppPath()+'/package.json')
      const {db,repository}=req('./dist-electron/db/index.js').openDatabase()
      const contacts=repository.listContacts(ws,'email',[leadId])
      let editRejected=false
      try{repository.updateContact('public-alternative',{value:'hello@office.local'})}catch(error){editRejected=/public domain/.test(error.message)}
      return {version:app.getVersion(),emails:contacts.map(row=>row.value),archived:db.one("select count(*) n from data_quality_repairs where row_id='old-private'").n,editRejected}
    },{ws,leadId})
    assert.deepEqual(result.emails,['hello@legacyclinic.com']);assert.equal(result.archived,1);assert.equal(result.editRejected,true)
    console.log(JSON.stringify({packaged,...result,passed:true}))
  }finally{await app.close()}
}
main().catch(error=>{console.error(error);process.exitCode=1})
