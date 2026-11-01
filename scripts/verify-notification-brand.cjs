const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm')
const {_electron}=require('playwright')
const root=path.resolve(__dirname,'..'),packaged=process.argv.includes('--packaged')
const packageJson=require('../package.json'),calls=[],paths={userData:'existing-customer-data',sessionData:'existing-browser-sessions'}
// Changing the visible app name must never move existing databases or sign-in data.
const stub={isPackaged:false,getPath:key=>paths[key],setPath:(key,value)=>{paths[key]=value},setName:name=>{calls.push(['name',name]);paths.userData='renamed-data';paths.sessionData='renamed-session'},setAppUserModelId:id=>calls.push(['id',id])}
vm.runInNewContext(fs.readFileSync(path.join(root,'dist-electron/bootstrap.js'),'utf8'),{exports:{},process:{platform:'win32',env:{}},require:name=>name==='electron'?{app:stub}:name==='./main'?(calls.push(['main']),{}):require(name)})
assert.deepEqual(paths,{userData:'existing-customer-data',sessionData:'existing-browser-sessions'})
assert.deepEqual(calls,[['name','MamaLead'],['id',packageJson.build.appId],['main']])
async function main(){
 const userData=fs.mkdtempSync(path.join(os.tmpdir(),'mamalead-notification-'))
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;delete env.VITE_DEV_SERVER_URL
 const executable=require('./electron-test-executable.cjs').electronTestExecutable(packaged)
 const app=await _electron.launch({executablePath:executable,args:[...packaged?[]:[root],'--user-data-dir='+userData],env,timeout:60000})
 try{
  const identity=await app.evaluate(({app,shell,Notification})=>{
   const path=process.getBuiltinModule('path'),fs=process.getBuiltinModule('fs')
   const shortcut=path.join(app.getPath('appData'),'Microsoft/Windows/Start Menu/Programs/MamaLead.lnk')
   const original=Notification.prototype.show
   Notification.prototype.show=function(){
    const notification=this
    globalThis.__brandNotice=new Promise((resolve,reject)=>{
     const timer=setTimeout(()=>reject(Error('Windows did not confirm the notification')),10000)
     notification.once('show',()=>{clearTimeout(timer);resolve({shown:true,title:notification.title})})
     notification.once('failed',(_event,error)=>{clearTimeout(timer);reject(Error(error))})
    })
    return original.call(this)
   }
   return {name:app.getName(),userData:app.getPath('userData'),shortcut:fs.existsSync(shortcut)?shell.readShortcutLink(shortcut):null,logoExists:fs.existsSync(path.join(app.getAppPath(),'dist-electron/export/assets/mamalead-logo.png'))}
  })
  assert.equal(identity.name,'MamaLead');assert.equal(path.resolve(identity.userData),path.resolve(userData));assert.equal(identity.logoExists,true)
  if(identity.shortcut)assert.equal(identity.shortcut.appUserModelId,packageJson.build.appId)
  const page=await app.firstWindow();await page.waitForFunction(()=>Boolean(window.desktop?.notifications))
  const sent=await page.evaluate(()=>window.desktop.notifications.show('MamaLead notification test','Windows notifications now use MamaLead.','notification-brand-test'))
  assert.equal(sent.shown,true)
  const notice=await app.evaluate(()=>globalThis.__brandNotice);assert.equal(notice.shown,true)
  const report={passed:true,packaged,applicationName:identity.name,applicationId:packageJson.build.appId,shortcutIdentityMatches:Boolean(identity.shortcut),existingDataPathsPreserved:true,packagedLogoPresent:identity.logoExists,nativeNotification:notice}
  const out=path.resolve(root,'../../outputs/notification-brand');fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,process.env.MAMALEAD_TEST_EXECUTABLE?'installed.json':packaged?'packaged.json':'source.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2))
  if(process.argv.includes('--hold'))await new Promise(resolve=>setTimeout(resolve,25000))
 }finally{await app.close()}
}
main().catch(error=>{console.error(error);process.exitCode=1})
