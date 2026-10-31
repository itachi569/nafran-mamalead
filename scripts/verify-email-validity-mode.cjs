const assert=require('node:assert/strict'),{mkdtempSync,writeFileSync,mkdirSync}=require('node:fs'),{join,resolve}=require('node:path'),{tmpdir}=require('node:os'),{_electron}=require('playwright'),{zipSync,strToU8}=require('fflate')
;(async()=>{
 const env={...process.env,LEADSNAP_BILLING_API_URL:'http://127.0.0.1:9'}
 for(const name of ['ELECTRON_RUN_AS_NODE','VITE_DEV_SERVER_URL','APIFY_API_TOKEN','APIFY_TOKEN','APIFY_API_TOKEN_FILE','MAILVERIFIER_API_KEY','MAILVERIFIER_API_KEY_FILE'])delete env[name]
 const dir=mkdtempSync(join(tmpdir(),'mamalead-validity-mode-')),archive=join(dir,'fixture.zip')
 writeFileSync(archive,zipSync({'verify.sh':strToU8(`curl -d '{"license_key":"FIXTURE-LICENSE-ONLY","device_id":"FIXTURE-DEVICE-ONLY"}'`),'README.txt':strToU8('Expires: 2031-10-30')}))
 for(const provider of ['local','leadsangel']){
  const packaged=Boolean(process.env.MAMALEAD_TEST_EXE)
  const app=await _electron.launch({...(packaged?{executablePath:process.env.MAMALEAD_TEST_EXE}:{cwd:process.cwd()}),args:[...(packaged?[]:['.']),'--user-data-dir='+join(dir,provider),...(provider==='leadsangel'?['--leadsangel-import-zip='+archive]:[])],env,timeout:60000})
  try{
   const page=await app.firstWindow(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.locator('#nafran-license-key').waitFor()
   await app.evaluate(({app})=>{
    const req=process.getBuiltinModule('module').createRequire(app.getAppPath()+'/package.json')
    // Licence fixture applies only inside this isolated process, not source or saved access.
    req('./dist-electron/billing/client.js').requireActiveLicense=async()=>{}
    globalThis.fetch=async()=>{throw new Error('No external verification requests allowed in this fixture')}
   })
   const status=await page.evaluate(()=>window.desktop.emailValidity.status())
   assert.equal(status.configured,true);assert.equal(status.provider,provider);assert.equal(status.mode,provider==='local'?'dns-only':'provider')
   const verified=await page.evaluate(()=>window.desktop.emailValidity.verify({leadIds:[]}))
   assert.equal(verified.provider,status.provider);assert.equal(verified.checked,0)
   if(provider==='local'){
    await page.locator('[data-email-check-mode="dns"]').waitFor()
    await page.locator('[data-email-check-mode="dns"]').scrollIntoViewIfNeeded()
    const out=resolve('screenshots/qa-1.4.31');mkdirSync(out,{recursive:true});await page.screenshot({path:join(out,'basic-email-check.png')})
    // This also proves the vendored list is present inside a packaged ASAR.
    const result=await app.evaluate(async({app})=>{
     const req=process.getBuiltinModule('module').createRequire(app.getAppPath()+'/package.json')
     return req('./dist-electron/email-precheck.js').precheckEmail('x@sub.mailinator.com')
    });assert.equal(result.status,'risky');assert.match(result.message,/Disposable/)
   }
   assert.deepEqual(errors,[])
   console.log(`PASS ${packaged?'packaged':'source'} ${provider} status matches verification, with ${status.mode} mode; no real email/provider requests`)
  }finally{await app.close()}
 }
})().catch(e=>{console.error(e);process.exitCode=1})
