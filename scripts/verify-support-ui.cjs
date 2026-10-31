const assert=require('node:assert/strict'),{mkdtempSync,mkdirSync}=require('node:fs'),{tmpdir}=require('node:os'),{join,resolve}=require('node:path'),{_electron}=require('playwright')
async function main(){
 const out=resolve('screenshots/support-1.4.25');mkdirSync(out,{recursive:true})
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;delete env.VITE_DEV_SERVER_URL
 const packaged=process.argv.includes('--packaged'),profile=mkdtempSync(join(tmpdir(),'mamalead-support-ui-'))
 const options={...(packaged?{executablePath:process.env.MAMALEAD_TEST_EXE}:{cwd:process.cwd()}),args:[...(packaged?[]:['.']),'--user-data-dir='+profile],env,timeout:60000}
 let app=await _electron.launch(options)
 const setup=async(offlineConfig=false)=>{
  const page=await app.firstWindow();await page.getByRole('complementary').getByRole('button',{name:'Contact support',exact:true}).waitFor()
  await app.evaluate(({app},offlineConfig)=>{const path=process.getBuiltinModule('path'),req=process.getBuiltinModule('module').createRequire(path.join(app.getAppPath(),'package.json'));globalThis.__support={mode:'success',offlineConfig,payloads:[]};req('./dist-electron/billing/client.js').billingSupportRequest=async(path,body,signal)=>{
   if(path.endsWith('/config')&&__support.offlineConfig)throw new Error('Config offline');if(path.endsWith('/config'))return {configured:true,email:'support@example.test',slaText:''};__support.payloads.push(body)
   if(__support.mode==='conflict')throw Object.assign(new Error('Please retry your message; a new request ID is needed.'),{status:409});if(__support.mode==='offline')throw new Error('Fixture connection unavailable')
   if(__support.mode==='cancel')return new Promise((r,j)=>signal.addEventListener('abort',()=>j(new Error('Cancelled')),{once:true}))
   return {ok:true,ticketId:'ML-S-TEST01'}
  }},offlineConfig)
  await page.setViewportSize({width:1024,height:700});assert.equal(await page.evaluate(()=>window.innerWidth),1024)
  return page
 }
 try{
  let page=await setup();const errors=[];page.on('pageerror',e=>errors.push(e.message))
  await page.getByRole('complementary').getByRole('button',{name:'Contact support',exact:true}).click()
  let dialog=page.getByRole('dialog',{name:'How can we help?'})
  await dialog.getByLabel('Reply email').fill('review@example.test');await dialog.getByLabel('What is this about?').selectOption('bug')
  assert.equal(await dialog.getByLabel('Attach diagnostics').isChecked(),true)
  await dialog.getByLabel('Message',{exact:true}).fill('The support form should keep this draft after restarting.')
  await page.keyboard.press('Escape');assert.equal(await page.getByRole('dialog').count(),0)
  await app.close();app=await _electron.launch(options);page=await setup(true)
  assert.equal(await page.evaluate(async()=>(await window.desktop.support.status()).email),'support@example.test')
  await page.getByRole('complementary').getByRole('button',{name:'Contact support',exact:true}).click();dialog=page.getByRole('dialog',{name:'How can we help?'})
  assert.match(await dialog.getByLabel('Message',{exact:true}).inputValue(),/keep this draft/)
  await page.screenshot({path:join(out,packaged?'packaged-support-form.png':'desktop-support-form.png')})
  await app.evaluate(()=>{__support.mode='offline'})
  await dialog.getByRole('button',{name:'Send message',exact:false}).click();await dialog.getByRole('button',{name:'Retry message'}).waitFor()
  await dialog.getByRole('button',{name:'Copy message & open email'}).waitFor();assert.ok(await page.evaluate(()=>localStorage.getItem('mamalead.supportDraft.v1')))
  const first=await app.evaluate(()=>__support.payloads.at(-1));assert.equal(first.meta.app.isPackaged,packaged);assert.equal(first.meta.license.last4,null);assert.ok(first.meta.counts);assert.equal(first.meta.counts.runs,0);assert.equal(first.meta.counts.leads,0)
  await app.evaluate(()=>{__support.mode='cancel'});await dialog.getByRole('button',{name:'Retry message'}).click();await dialog.getByRole('button',{name:'Cancel send'}).waitFor();await dialog.getByRole('button',{name:'Cancel send'}).click()
  await page.getByRole('complementary').getByRole('button',{name:'Contact support',exact:true}).click();dialog=page.getByRole('dialog',{name:'How can we help?'})
  await app.evaluate(()=>{__support.mode='conflict'})
  await dialog.getByRole('button',{name:'Send message',exact:false}).click();await dialog.getByRole('alert').filter({hasText:'new request ID'}).waitFor()
  assert.equal(await app.evaluate(()=>__support.payloads.at(-1).clientMessageId),first.clientMessageId)
  await app.evaluate(()=>{__support.mode='success'})
  await dialog.getByRole('button',{name:'Send message',exact:false}).click();await page.getByRole('heading',{name:'Message received'}).waitFor()
  const sends=await app.evaluate(()=>__support.payloads);assert.notEqual(sends.at(-1).clientMessageId,first.clientMessageId)
  assert.equal(await page.evaluate(()=>localStorage.getItem('mamalead.supportDraft.v1')),null)
  await page.screenshot({path:join(out,packaged?'packaged-support-success.png':'desktop-support-success.png')})
  await page.getByRole('button',{name:'Done',exact:true}).click();await page.getByRole('complementary').getByRole('button',{name:'Contact support',exact:true}).click()
  await page.getByText(/You can send another message in/).waitFor()
  await page.getByRole('button',{name:'Discard draft'}).click();await page.getByRole('button',{name:'Close contact support'}).click();assert.equal(await page.evaluate(()=>localStorage.getItem('mamalead.supportDraft.v1')),null)
  assert.deepEqual(errors,[]);console.log('PASS '+(packaged?'packaged':'development')+' support: unlicensed entry, draft survives app restart, 1024×700 layout, diagnostics, offline fallback, cancellation, same UUID retry, conflict UUID reset, cached offline address after restart, success, cleared draft and cooldown')
 }finally{await app.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1})
