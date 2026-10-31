const assert=require('node:assert/strict'),{mkdtempSync}=require('node:fs'),{join}=require('node:path'),{tmpdir}=require('node:os'),{_electron}=require('playwright')
;(async()=>{
 const env={...process.env,LEADSNAP_BILLING_API_URL:'http://127.0.0.1:9'};delete env.ELECTRON_RUN_AS_NODE;delete env.VITE_DEV_SERVER_URL
 const packaged=Boolean(process.env.MAMALEAD_TEST_EXE)
 const app=await _electron.launch({...(packaged?{executablePath:process.env.MAMALEAD_TEST_EXE}:{cwd:process.cwd()}),args:[...(packaged?[]:['.']),'--user-data-dir='+mkdtempSync(join(tmpdir(),'mamalead-website-access-'))],env,timeout:60000})
 try{
  const page=await app.firstWindow(),errors=[];page.on('pageerror',e=>errors.push(e.message))
  await page.locator('#nafran-license-key').waitFor()
  await app.evaluate(({ipcMain,shell})=>{
   globalThis.__access={active:false,urls:[],expiresAt:new Date(Date.now()+86400000).toISOString()}
   shell.openExternal=async url=>{__access.urls.push(url)}
   ipcMain.removeHandler('billing:status');ipcMain.handle('billing:status',()=>({configured:true,connected:true,coreLicenseActive:__access.active,license:{active:__access.active,kind:'trial',expiresAt:__access.expiresAt},trial:{active:__access.active,expiresAt:__access.expiresAt},lifetime:{active:false}}))
   ipcMain.removeHandler('billing:activate');ipcMain.handle('billing:activate',()=>{__access.active=true;return {active:true,kind:'trial'}})
  })
  await page.getByRole('button',{name:'Refresh billing',exact:true}).click()
  await page.locator('[data-stab="plan"]').click();await page.locator('[data-website-access]').waitFor()
  assert.equal(await page.locator('.billing-stage,[data-trial-form],[data-lifetime-buy]').count(),0)
  assert.doesNotMatch(await page.locator('.settings-content').innerText(),/PKR setup pending|PKR Checkout update pending/)
  await page.getByRole('button',{name:'Get 1-day trial ↗',exact:true}).click()
  await page.getByRole('button',{name:'Get Lifetime ↗',exact:true}).click()
  assert.deepEqual(await app.evaluate(()=>__access.urls),['https://mamalead.com/?action=trial#download','https://mamalead.com/?action=lifetime#pricing'])
  await page.getByRole('button',{name:'I already have a key',exact:true}).click()
  await page.locator('#nafran-license-key').fill('NF'+('-ABCD'.repeat(10)))
  await page.getByRole('button',{name:'Activate',exact:true}).click()
  await page.getByRole('button',{name:'Use a different key',exact:true}).waitFor()
  await page.getByText('1-day trial started',{exact:true}).first().waitFor()
  assert.match(await page.locator('.account-license-description').innerText(),/until/)
  assert.deepEqual(errors,[])
  console.log('PASS '+(packaged?'packaged':'source')+' fresh launch opens key activation, website trial/Lifetime actions, no obsolete billing warning or email form, and trial-start notification after activation')
 }finally{await app.close()}
})().catch(e=>{console.error(e);process.exitCode=1})
