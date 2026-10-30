// Isolated Electron regressions: real file IPC and renderer; no live scraping or payments.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os')
const {_electron}=require('playwright'),ExcelJS=require('exceljs')
async function main(){
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'mamalead-part2-ui-')),out=path.resolve('screenshots/qa-part2');fs.mkdirSync(out,{recursive:true})
 const workbook=new ExcelJS.Workbook(),sheet=workbook.addWorksheet('Leads');sheet.addRow(['MamaLead']);sheet.addRow(['Business name','Domain']);sheet.addRow(['Example','münchen.de']);sheet.addRow(['Shop','example.org']);await workbook.xlsx.writeFile(path.join(temp,'leads.xlsx'))
 fs.writeFileSync(path.join(temp,'binary.csv'),Buffer.from([80,75,3,4,0,0]));fs.writeFileSync(path.join(temp,'empty.csv'),'');fs.writeFileSync(path.join(temp,'no-websites.csv'),'name,phone\nClinic,123')
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;delete env.VITE_DEV_SERVER_URL
 const packaged=process.argv.includes('--packaged'),app=await _electron.launch({...(packaged?{executablePath:path.resolve('release/win-unpacked/MamaLead.exe')}:{cwd:process.cwd()}),args:[...(packaged?[]:['.']),'--user-data-dir='+path.join(temp,'profile')],env,timeout:60000})
 try{
  const page=await app.firstWindow(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(15000);await page.locator('[data-view="dashboard"]').waitFor()
  await app.evaluate(({ipcMain,dialog},temp)=>{
   globalThis.__qa2={file:'',runs:[],imports:[],trials:0,active:true}
   dialog.showOpenDialog=async()=>({canceled:false,filePaths:[temp+'/'+__qa2.file]})
   const override=(name,fn)=>{ipcMain.removeHandler(name);ipcMain.handle(name,fn)}
   override('notifications:show',()=>({shown:false}))
   override('billing:status',()=>({configured:true,connected:true,mode:'test',coreLicenseActive:__qa2.active,license:{active:__qa2.active,kind:__qa2.active?'lifetime':null},lifetime:{active:__qa2.active,amount:1000000,currency:'pkr'},mapsLeads:{used:0,remaining:null,limit:null},trial:{active:false}}))
   override('billing:invoices',()=>[]);override('billing:request-trial',()=>{__qa2.trials++;return {emailSent:true}})
   override('updates:status',()=>({enabled:false,state:'disabled',autoDownload:false,message:'Updates are unavailable in this build.'}))
   override('scraper:start',(_e,r)=>{__qa2.runs.push({mode:'guest',request:r});throw Error('QA stopped before opening a browser')})
   override('scraper:runWithGoogle',(_e,r)=>{__qa2.runs.push({mode:'google',request:r});throw Error('QA stopped before opening a browser')})
   override('db:imports:websites',(_e,r)=>{__qa2.imports.push(r.input);return {batchId:'qa',added:0,skipped:r.input.length,leadIds:[]}})
  },temp)
  await page.reload();await page.locator('[data-view="email"]').click()
  const openImport=async()=>{await page.getByRole('button',{name:'Import websites',exact:true}).click();await page.getByRole('dialog',{name:'Import websites',exact:true}).waitFor()}
  await openImport();await page.locator('[data-src="file"]').click()
  const choose=async name=>{await app.evaluate((_,name)=>{__qa2.file=name},name);await page.locator('.website-file-picker').click()}
  await choose('leads.xlsx');await page.locator('.wi-file-copy strong').filter({hasText:'leads.xlsx'}).waitFor();assert.match(await page.locator('.wi-summary').innerText(),/2 unique websites/)
  await choose('binary.csv');await page.locator('.wi-error').waitFor();assert.match(await page.locator('.wi-error').innerText(),/not a text|original .xlsx/);assert.ok(await page.locator('[data-importgo]').isDisabled());assert.equal(await page.locator('[data-src="file"]').getAttribute('aria-selected'),'true')
  await choose('empty.csv');assert.match(await page.locator('.wi-error').innerText(),/empty/)
  await choose('no-websites.csv');assert.match(await page.locator('.wi-error').innerText(),/Columns found: name, phone/);assert.equal(await page.getByRole('combobox',{name:'Website column'}).count(),1)
  // Drag/drop takes the same native decoder path, including binary rejection.
  await page.locator('.wi-file').evaluate(el=>{const d=new DataTransfer();d.items.add(new File([new Uint8Array([80,75,3,4,0])],'bad.csv'));el.dispatchEvent(new DragEvent('drop',{bubbles:true,dataTransfer:d}))})
  await page.waitForFunction(()=>document.querySelector('.wi-error')?.textContent.includes('not a text'));assert.ok(await page.locator('[data-importgo]').isDisabled())
  await page.locator('[data-src="paste"]').click();await page.locator('[data-imptext]').fill(Array.from({length:650},(_,i)=>`site${i}.example.org`).join('\n'))
  assert.equal(await page.locator('[data-importgo]').innerText(),'Scan first 500');assert.match(await page.locator('.wi-batch-notice').innerText(),/150 over/)
  await page.screenshot({path:path.join(out,'import-650.png')});await page.locator('[data-importgo]').click();await page.waitForFunction(()=>!document.querySelector('[data-impmodal]'))
  assert.equal(await app.evaluate(()=>__qa2.imports.at(-1).length),500);await openImport();assert.equal((await page.locator('[data-imptext]').inputValue()).split('\n').length,150);await page.getByRole('button',{name:'Close import dialog'}).click()
  console.log('PASS native and drop binary rejection, empty/column errors, Excel import, 500-site dispatch and retained 150-site next batch')
  await page.locator('[data-view="maps"]').click();await page.locator('[data-location]').fill('Lahore, Pakistan');await page.locator('[data-bulk]').click();await page.locator('[data-bulk-keywords-input]').fill('1. dentist\n2) plumber\n3 - cafe');await page.locator('[data-bulk-keywords-replace]').click()
  await page.locator('[data-bulk]').click();await page.locator('[data-bulk-keywords-input]').fill(Array.from({length:20},(_,i)=>'keyword '+i).join('\n')+'\n'+'a'.repeat(81));assert.match(await page.locator('[data-bulk-keywords-modal]').innerText(),/3 current \+ 5 new = 8; 15 over/);assert.match(await page.locator('[data-bulk-keywords-modal]').innerText(),/exceeds? 80 characters/);assert.doesNotMatch(await page.locator('[data-bulk-keywords-modal]').innerText(),/Add to current: Add to current:/);await page.screenshot({path:path.join(out,'keyword-counts.png')});await page.locator('[data-bulk-keywords-add]').click();assert.equal(await page.locator('[data-kw]').count(),8)
  await page.reload();await page.locator('[data-view="maps"]').click();assert.equal(await page.locator('[data-location]').inputValue(),'Lahore, Pakistan');assert.equal(await page.locator('[data-kw]').count(),8)
  await page.locator('[data-runbtn]').click();await page.getByRole('button',{name:'Continue without sign-in',exact:true}).click();await page.waitForFunction(()=>document.querySelector('[data-runbtn]')?.getAttribute('data-state')==='idle');assert.equal(await app.evaluate(()=>__qa2.runs.length),1)
  await page.locator('[data-runbtn]').click();await page.waitForFunction(()=>document.querySelector('[data-runbtn]')?.getAttribute('data-state')==='idle');assert.equal(await app.evaluate(()=>__qa2.runs.length),2);assert.equal(await page.getByRole('button',{name:'Continue without sign-in',exact:true}).count(),0)
  await page.locator('[data-maps-session] button').click();await page.getByRole('button',{name:/Sign in with Google|Continue with Google/}).click();await page.waitForFunction(()=>document.querySelector('[data-runbtn]')?.getAttribute('data-state')==='idle');assert.equal(await app.evaluate(()=>__qa2.runs.at(-1).mode),'google')
  await page.reload();await page.locator('[data-view="maps"]').click();await page.locator('[data-runbtn]').click();await page.waitForFunction(()=>document.querySelector('[data-runbtn]')?.getAttribute('data-state')==='idle');assert.equal(await app.evaluate(()=>__qa2.runs.at(-1).mode),'google');await page.screenshot({path:path.join(out,'maps-remembered.png')})
  console.log('PASS keyword prefix/limit/merged preview, draft reload, first-run choice, remembered guest/Google mode and explicit change')
  await page.locator('[data-view="settings"]').click();await page.locator('[data-stab="acct"]').click();await page.locator('#app-updates').waitFor();assert.ok(await page.locator('.app-updates-action').isDisabled());assert.doesNotMatch(await page.locator('#app-updates').innerText(),/every 4 hours|notified about new releases/)
  await page.locator('[data-stab="plan"]').click();assert.equal(await page.locator('#trial-section').count(),0)
  await app.evaluate(()=>{__qa2.active=false});await page.reload();await page.locator('[data-view="maps"]').click();await page.getByRole('button',{name:'Activate / Start trial',exact:true}).click();await page.getByRole('button',{name:'Get my 1-day trial',exact:true}).click()
  for(const email of ['plain','two@@example.com','me@example','bad space@example.com']){await page.locator('#desktop-trial-email').fill(email);await page.getByRole('button',{name:'Send trial key',exact:true}).click();assert.equal(await page.locator('#desktop-trial-email').getAttribute('aria-invalid'),'true');assert.ok(await page.getByText('Enter a valid email address for your trial key.',{exact:true}).isVisible())}
  assert.equal(await app.evaluate(()=>__qa2.trials),0);await page.screenshot({path:path.join(out,'trial-inline-error.png')});assert.deepEqual(errors,[])
  console.log('PASS disabled updater controls, Lifetime trial hidden, consistent inline invalid-email feedback without IPC; no renderer errors')
 }finally{await app.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1})
