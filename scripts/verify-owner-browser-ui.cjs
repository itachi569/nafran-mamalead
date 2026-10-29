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
   const state={queries:[],credits:[],apiCalls:0,holdSearch:true,resume:null,signIns:0};globalThis.__browserQA=state
   billing.billingConsumeDecisionMaker=async id=>{state.credits.push(id);return {used:1,remaining:999,periodId:'fixture'}}
   ipcMain.removeHandler('billing:status');ipcMain.handle('billing:status',()=>({connected:true,configured:true,coreLicenseActive:true,license:{active:true,kind:'lifetime'},lifetime:{active:true},decisionMaker:{active:true,available:true,status:'active',monthlyLimit:1000,monthlyUsed:0,monthlyRemaining:1000}}))
   const {GoogleOwnerBrowser}=req('./dist-electron/enrichment/google-browser.js'),connect=GoogleOwnerBrowser.prototype.connect,signIn=GoogleOwnerBrowser.prototype.signIn
   GoogleOwnerBrowser.prototype.signIn=async function(){state.signIns++;const result=await signIn.call(this);globalThis.__qaBrowser=this;state.manualArgs=this.manual.spawnargs;state.manualControlled=Boolean(this.browser);return result}
   GoogleOwnerBrowser.prototype.connect=async function(showWindow=true){
    if(!this.__fixture){this.__fixture=true
     await this.launch();await this.page.context().addCookies([{name:'SID',value:'isolated-test-only',domain:'.google.com',path:'/',secure:true,expires:Math.floor(Date.now()/1000)+3600}]);await this.close()
    }
    const result=await connect.call(this,showWindow)
    if(!this.__routed){this.__routed=true;await this.page.context().route('https://www.google.com/search?**',async route=>{const q=new URL(route.request().url()).searchParams.get('q');state.queries.push(q);if(state.holdSearch)await new Promise(resolve=>{state.resume=resolve});const host=q.includes('southstar')?'southstar.test':'northstar.test';const page=q.startsWith('"Janet')?(host==='southstar.test' && q.endsWith('email address')?'no-email':'contact'):'about';await route.fulfill({contentType:'text/html',body:`<div><a href="https://${host}/${page}"><h3>${host} company</h3></a><p>Our founder and contact information</p></div>`})})}
    return result
   }
   const fetch=globalThis.fetch;globalThis.fetch=async(url,opts)=>{if(String(url).includes('api.dataforseo.com')){state.apiCalls++;throw Error('Owner scans must not call an API')};if(/^https:\/\/(?:northstar|southstar)\.test/.test(String(url))){const host=new URL(String(url)).hostname,brand=host.startsWith('south')?'Southstar':'Northstar';return new Response(String(url).endsWith('/no-email')?'<p>No email here</p>':String(url).endsWith('/about')?`<article><h2>Janet Cole</h2><p>Founder of ${brand}.</p></article>`:`<p>Janet Cole</p><a href="mailto:janet@${host}">Email Janet</a>`)}return fetch(url,opts)}
  })
  const page=await app.firstWindow(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.reload();await page.locator('[data-view="dm"]').click()
  const card=page.locator('[data-owner-browser]');await card.getByRole('button',{name:'Open Chrome & sign in'}).click();await card.getByRole('button',{name:'Sign-in window is open'}).waitFor({timeout:30000})
  await card.screenshot({path:path.join(out,packaged?'packaged-manual-sign-in.png':'manual-sign-in.png')})
  const manualState=await app.evaluate(()=>({args:globalThis.__browserQA.manualArgs,controlled:globalThis.__browserQA.manualControlled}));assert.equal(manualState.controlled,false);assert.ok(!manualState.args.some(a=>/remote-debugging|AutomationControlled|enable-automation/.test(a)))
  await new Promise(resolve=>setTimeout(resolve,1700));await app.evaluate(async()=>{const child=globalThis.__qaBrowser.manual;const exit=new Promise(resolve=>child.once('exit',resolve));child.kill();await exit})
  await card.getByRole('button',{name:'Connect saved sign-in',exact:true}).click();await card.getByRole('button',{name:'Show Chrome'}).waitFor({timeout:30000})
  await card.screenshot({path:path.join(out,packaged?'packaged-chrome-card.png':'chrome-card.png')})
  await page.setViewportSize({width:1100,height:750})
  await page.evaluate(()=>{window.__scanScrolls=[];const original=Element.prototype.scrollIntoView;Element.prototype.scrollIntoView=function(options){if(this.matches('[data-decision-progress], [data-fres="dm"]'))window.__scanScrolls.push(this.matches('[data-decision-progress]')?'progress':'results');return original.call(this,options)}})
  await page.getByRole('button',{name:'Import websites',exact:true}).click();const modal=page.locator('[data-impmodal]');await modal.locator('textarea').fill('northstar.test');await modal.getByRole('button',{name:'Scan 1 site',exact:true}).click()
  await page.waitForFunction(()=>{const r=document.querySelector('[data-decision-progress]').getBoundingClientRect();return window.__scanScrolls.includes('progress') && r.top>=0 && r.top<innerHeight-100},null,{timeout:5000})
  await page.getByRole('button',{name:'Stop scan',exact:false}).waitFor()
  assert.deepEqual(await page.evaluate(()=>window.__scanScrolls),['progress'],'Must show live progress before results finish')
  await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));await page.waitForTimeout(1100)
  assert.deepEqual(await page.evaluate(()=>window.__scanScrolls),['progress'],'Progress polling must not repeatedly pull the user down')
  await app.evaluate(async()=>{const state=globalThis.__browserQA;const end=Date.now()+10000;while(!state.resume && Date.now()<end)await new Promise(r=>setTimeout(r,20));if(!state.resume)throw Error('Search did not start');state.holdSearch=false;state.resume()})
  try{await page.locator('[data-owner-results]').getByRole('link',{name:'janet@northstar.test',exact:true}).waitFor({timeout:20000})}catch(error){console.log(JSON.stringify({state:await app.evaluate(()=>globalThis.__browserQA),body:(await page.locator('body').innerText()).slice(-8500),errors},null,2));throw error}
  const state=await app.evaluate(()=>globalThis.__browserQA);assert.equal(state.apiCalls,0);assert.equal(state.queries.length,2);assert.equal(state.credits.length,1);assert.equal(state.queries[1],'"Janet Cole" "northstar.test" email address');assert.deepEqual(errors,[])
  await page.waitForFunction(()=>window.__scanScrolls.includes('results'))
  assert.deepEqual(await page.evaluate(()=>window.__scanScrolls),['progress','results'])
  const firstPid=await app.evaluate(()=>globalThis.__qaBrowser.child.pid)
  await page.getByRole('button',{name:'Import websites',exact:true}).click();await modal.locator('textarea').fill('southstar.test');await modal.getByRole('button',{name:'Scan 1 site',exact:true}).click()
  await page.locator('[data-owner-results]').getByRole('link',{name:'janet@southstar.test',exact:true}).waitFor({timeout:20000})
  const repeat=await app.evaluate(()=>({signIns:globalThis.__browserQA.signIns,pid:globalThis.__qaBrowser.child.pid,credits:globalThis.__browserQA.credits.length,queries:globalThis.__browserQA.queries.length}))
  assert.deepEqual(repeat,{signIns:1,pid:firstPid,credits:2,queries:5});assert.match(await card.innerText(),/Google sign-in saved/)
  await page.setViewportSize({width:1050,height:800});await card.scrollIntoViewIfNeeded();assert.ok(await card.evaluate(el=>el.scrollWidth<=el.clientWidth+1))
  await page.evaluate(()=>document.querySelector('[data-theme-btn]').click());await card.screenshot({path:path.join(out,packaged?'packaged-chrome-dark.png':'chrome-dark.png')})
  const report={passed:true,packaged,executable,firstScan:{queries:state.queries,credits:state.credits.length,apiCalls:state.apiCalls},repeat,checks:['manual sign-in launches without debugging or automation','explicit Connect only after sign-in window closes','live progress scrolls into view at scan start, not on every poll','finished scan scrolls to its results','main-process queue uses browser source','third targeted search finds email when the second search misses','second website reuses same Chrome and sign-in','one company credit; zero DataForSEO calls','no renderer errors; responsive light/dark control']};fs.writeFileSync(path.join(out,process.env.MAMALEAD_TEST_EXECUTABLE?'installed.json':packaged?'packaged.json':'source.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2))
 }finally{await app.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1})
