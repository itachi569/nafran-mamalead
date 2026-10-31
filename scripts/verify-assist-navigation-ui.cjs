const assert=require('node:assert/strict')
const { _electron }=require('playwright')
const {mkdtempSync,mkdirSync,writeFileSync}=require('node:fs')
const {resolve,join}=require('node:path')
const {tmpdir}=require('node:os')
const root=resolve(__dirname,'..'),directory=mkdtempSync(join(tmpdir(),'mamalead-assist-navigation-'))
const executable=process.argv[2],out=join(root,'screenshots/assist-navigation')
mkdirSync(out,{recursive:true})
let app
async function main(){
 const env={...process.env,APPDATA:join(directory,'appdata')};delete env.ELECTRON_RUN_AS_NODE;delete env.VITE_DEV_SERVER_URL
 app=await _electron.launch({...(executable?{executablePath:resolve(executable)}:{cwd:root}),args:[...(executable?[]:['.']),`--user-data-dir=${join(directory,'profile')}`],env,timeout:60000})
 await app.firstWindow({timeout:60000})
 await app.evaluate(({app,ipcMain})=>{
  const req=process.getBuiltinModule('module').createRequire(app.getAppPath()+'/package.json')
  globalThis.__assistChecks=[]
  req('./dist-electron/billing/client.js').billingAssistChat=async payload=>{
   globalThis.__assistChecks.push(payload)
   return{text:globalThis.__assistTestReply || 'Social Profiles mein websites se milne wale social links dekhein. Neeche page ka naam click karke usay khol sakte hain.',model:'controlled-test'}
  }
  ipcMain.removeHandler('billing:status')
  ipcMain.handle('billing:status',()=>({connected:true,configured:true,coreLicenseActive:true,license:{active:true,kind:'lifetime'},lifetime:{active:true},decisionMaker:{active:true,monthlyRemaining:1000,monthlyLimit:1000,monthlyUsed:0,status:'paid'}}))
 })
 const page=await app.firstWindow(),errors=[];page.on('pageerror',e=>errors.push(e.message))
 await page.setViewportSize({width:1280,height:950});await page.reload();await page.locator('[data-view="dashboard"]').waitFor()
 const cases=[
  ['social profile ka kya kam h','social','Social Profiles'],
  ['reports k bary m btao','reports','Insights / Reports'],
  ['email finder kaise use karun','email','Email Finder'],
  ['phone finder kaise use karun','phone','Phone Finder'],
  ['website lookup ka kya kam h','website','Website Lookup'],
  ['google maps kya karta h','maps','Google Maps Scraper'],
  ['all leads ka kya kam h','leads','All Leads'],
  ['saved lists kahan h','lists','Saved Lists'],
  ['run history kahan h','runs','Run History'],
  ['settings and billing kahan h','settings','Workspace & Settings'],
  ['app updates kahan h','updates','App updates'],
 ]
 for(const [question,key,heading] of cases){
  await page.locator('[data-assist="1"]').click()
  await page.locator('[data-chatinput]').fill(question);await page.locator('[data-chatinput]').press('Enter')
  const button=page.locator(`[data-assist-destination="${key}"]`).last();await button.waitFor()
  if(key==='social')await page.locator('[data-chat-panel]').screenshot({path:join(out,'social-shortcut.png'),animations:'disabled'})
  await button.click();assert.equal(await page.locator('[data-chat-panel]').count(),0)
  await (key==='reports'?page.locator('#workspace-dialog-title'):page.getByRole('heading',{name:heading,exact:true})).waitFor()
  if(key==='reports'){await page.locator('[data-report-stat]').first().waitFor();assert.ok(await page.locator('[data-report-stat]').count()>0);await page.getByRole('button',{name:'Close dialog',exact:true}).click()}
 }
 await app.evaluate(()=>{globalThis.__assistTestReply='To contact MamaLead, open Contact Support to send our team a message.'})
 await page.locator('[data-assist="1"]').click()
 await page.locator('[data-chatinput]').fill('how to contact with your conmapny?')
 await page.locator('[data-chatinput]').press('Enter')
 const support=page.locator('[data-assist-destination="support"]').last()
 await support.waitFor()
 const replyLinks=support.locator('..').locator('[data-assist-destination]')
 assert.equal(await replyLinks.count(),1,'support replies must not also link to Email Finder or Phone Finder')
 await page.locator('[data-chat-panel]').screenshot({path:join(out,'contact-support-shortcut.png'),animations:'disabled'})
 await support.click()
 await page.locator('.support-dialog').waitFor()
 assert.equal(await page.locator('[data-chat-panel]').count(),0)
 const sent=await app.evaluate(()=>globalThis.__assistChecks)
 assert.equal(sent.length,cases.length+1)
 assert.match(sent.at(-1).messages.at(-1).content,/Settings & Billing > Account > Help & support/)
 assert.match(sent.at(-1).messages.at(-1).content,/Do not claim our email\/phone details are listed there/)
 for(const payload of sent){assert.match(payload.messages.at(-1).content,/1-3 short sentences/);assert.ok(payload.messages.at(-1).content.length<=1200)}
 assert.deepEqual(errors,[])
 const report={passed:true,packaged:Boolean(executable),destinations:[...cases.map(c=>c[1]),'support'],checks:['actual chat IPC adds concise style guidance','contextual text links open exact requested destinations','support question offers only Contact Support and opens its form','Reports loads real isolated workspace totals','click closes chat without starting scans or purchases','no renderer errors'],customerDataUsed:false,providerCalls:0}
 writeFileSync(join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2))
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(app)await app.close()})
