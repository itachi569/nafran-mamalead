const assert=require('node:assert/strict'),{_electron}=require('playwright'),fs=require('node:fs'),path=require('node:path'),os=require('node:os')
const root=path.resolve(__dirname,'..'),packaged=process.argv.includes('--packaged'),out=path.resolve(root,'../../outputs/owner-browser-qa');fs.mkdirSync(out,{recursive:true})
const executable=process.env.MAMALEAD_TEST_EXECUTABLE || path.join(root,packaged?'release/win-unpacked/MamaLead.exe':'node_modules/electron/dist/electron.exe')
async function main(){
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;delete env.VITE_DEV_SERVER_URL
 const app=await _electron.launch({executablePath:executable,args:[...packaged?[]:[root],'--user-data-dir='+fs.mkdtempSync(path.join(os.tmpdir(),'owner-browser-ui-'))],env,timeout:60000})
 try{
  await app.evaluate(({app,ipcMain})=>{
   const path=process.getBuiltinModule('path'),req=process.getBuiltinModule('module').createRequire(path.join(app.getAppPath(),'package.json'))
   const billing=req('./dist-electron/billing/client.js');billing.requireActiveLicense=async()=>{}
   const state={queries:[],credits:[],apiCalls:0};globalThis.__browserQA=state
   billing.billingConsumeDecisionMaker=async id=>{state.credits.push(id);return {used:1,remaining:999,periodId:'fixture'}}
   ipcMain.removeHandler('billing:status');ipcMain.handle('billing:status',()=>({connected:true,configured:true,coreLicenseActive:true,license:{active:true,kind:'lifetime'},lifetime:{active:true},decisionMaker:{active:true,available:true,status:'active',monthlyLimit:1000,monthlyUsed:0,monthlyRemaining:1000}}))
   const {GoogleOwnerBrowser}=req('./dist-electron/enrichment/google-browser.js'),connect=GoogleOwnerBrowser.prototype.connect,signIn=GoogleOwnerBrowser.prototype.signIn
   GoogleOwnerBrowser.prototype.signIn=async function(){const result=await signIn.call(this);globalThis.__qaBrowser=this;state.manualArgs=this.manual.spawnargs;state.manualControlled=Boolean(this.browser);return result}
   GoogleOwnerBrowser.prototype.connect=async function(){
    if(!this.__fixture){this.__fixture=true
     await this.launch();await this.page.context().addCookies([{name:'SID',value:'isolated-test-only',domain:'.google.com',path:'/',secure:true,expires:Math.floor(Date.now()/1000)+3600}]);await this.close()
    }
    const result=await connect.call(this)
    if(!this.__routed){this.__routed=true;await this.page.context().route('https://www.google.com/search?**',async route=>{const q=new URL(route.request().url()).searchParams.get('q');state.queries.push(q);await route.fulfill({contentType:'text/html',body:`<div><a href="https://northstar.test/${q.startsWith('Janet')?'contact':'about'}"><h3>Northstar company</h3></a><p>Our founder and contact information</p></div>`})})}
    return result
   }
   const fetch=globalThis.fetch;globalThis.fetch=async(url,opts)=>{if(String(url).includes('api.dataforseo.com')){state.apiCalls++;throw Error('Owner scans must not call an API')};if(String(url).startsWith('https://northstar.test'))return new Response(String(url).endsWith('/about')?'<article><h2>Janet Cole</h2><p>Founder of Northstar.</p></article>':'<p>Janet Cole</p><a href="mailto:janet@northstar.test">Email Janet</a>');return fetch(url,opts)}
  })
  const page=await app.firstWindow(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.reload();await page.locator('[data-view="dm"]').click()
  const card=page.locator('[data-owner-browser]');await card.getByRole('button',{name:'Open Chrome & sign in'}).click();await card.getByRole('button',{name:'Sign-in window is open'}).waitFor({timeout:30000})
  await card.screenshot({path:path.join(out,packaged?'packaged-manual-sign-in.png':'manual-sign-in.png')})
  const manualState=await app.evaluate(()=>({args:globalThis.__browserQA.manualArgs,controlled:globalThis.__browserQA.manualControlled}));assert.equal(manualState.controlled,false);assert.ok(!manualState.args.some(a=>/remote-debugging|AutomationControlled|enable-automation/.test(a)))
  await new Promise(resolve=>setTimeout(resolve,1700));await app.evaluate(async()=>{const child=globalThis.__qaBrowser.manual;const exit=new Promise(resolve=>child.once('exit',resolve));child.kill();await exit})
  await card.getByRole('button',{name:'Connect saved sign-in',exact:true}).click();await card.getByRole('button',{name:'Show Chrome'}).waitFor({timeout:30000})
  await card.screenshot({path:path.join(out,packaged?'packaged-chrome-card.png':'chrome-card.png')})
  await page.getByRole('button',{name:'Import websites',exact:true}).click();const modal=page.locator('[data-impmodal]');await modal.locator('textarea').fill('northstar.test');await modal.getByRole('button',{name:'Scan 1 site',exact:true}).click()
  try{await page.locator('[data-owner-results]').getByRole('link',{name:'janet@northstar.test',exact:true}).waitFor({timeout:20000})}catch(error){console.log(JSON.stringify({state:await app.evaluate(()=>globalThis.__browserQA),body:(await page.locator('body').innerText()).slice(-8500),errors},null,2));throw error}
  const state=await app.evaluate(()=>globalThis.__browserQA);assert.equal(state.apiCalls,0);assert.equal(state.queries.length,2);assert.equal(state.credits.length,1);assert.equal(state.queries[1],'Janet Cole owner of northstar.test email address');assert.deepEqual(errors,[])
  await page.setViewportSize({width:1050,height:800});await card.scrollIntoViewIfNeeded();assert.ok(await card.evaluate(el=>el.scrollWidth<=el.clientWidth+1))
  await page.evaluate(()=>document.querySelector('[data-theme-btn]').click());await card.screenshot({path:path.join(out,packaged?'packaged-chrome-dark.png':'chrome-dark.png')})
  const report={passed:true,packaged,executable,queries:state.queries,credits:state.credits.length,apiCalls:state.apiCalls,checks:['manual sign-in launches without debugging or automation','explicit Connect only after sign-in window closes','main-process queue uses browser source','two searches produce matching sourced owner email','one company credit; zero DataForSEO calls','no renderer errors; responsive light/dark control']};fs.writeFileSync(path.join(out,process.env.MAMALEAD_TEST_EXECUTABLE?'installed.json':packaged?'packaged.json':'source.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2))
 }finally{await app.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1})
