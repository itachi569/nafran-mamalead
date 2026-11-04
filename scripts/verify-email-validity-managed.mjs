// Fresh desktop profile -> authenticated billing job -> SMTP provider -> local saved contacts.
// With --live the operator supplies a private LEADSANGEL_CONFIG_FILE; never embed a key here.
import assert from 'node:assert/strict'
import {mkdtempSync,existsSync,writeFileSync,mkdirSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'
import {_electron} from 'playwright'
import {createBillingServer} from '../billing-server/server.mjs'
const dir=mkdtempSync(join(tmpdir(),'mamalead-managed-mailbox-')),sent=[],live=process.argv.includes('--live'),packaged=Boolean(process.env.MAMALEAD_TEST_EXE)
if(live&&!process.env.LEADSANGEL_CONFIG_FILE)throw new Error('Provide the private server config file path for the live test.')
const report={live,packaged,clientContainsProviderCredential:false,realEmailsSent:0,errors:[]},requests=[]
const realFetch=globalThis.fetch
let fixtureEmails=[],fixtureState='completed',fixtureBatches=[]
globalThis.fetch=async(url,options)=>{
 if(String(url).startsWith('https://license.leadsangel.com/')){
  const endpoint=String(url).split('/').at(-1)
  if(live){const response=await realFetch(url,options);requests.push({endpoint,status:response.status});return response}
  if(endpoint==='verify'){fixtureEmails=JSON.parse(options.body).items.map(r=>r.email);fixtureBatches.push([...fixtureEmails]);return Response.json({id:'fixture-job-12345',status:fixtureState})}
  if(endpoint==='status')return Response.json({status:fixtureState,succeeded:fixtureState==='completed'?fixtureEmails.length:0})
  return Response.json({items:fixtureEmails.map((email,i)=>({email,status:'done',result:{status:i===0?'safe':i===1?'invalid':'catch_all',reason:i===0?'recipient_accepted_catch_all_rejected':i===1?'rcpt_rejected_550':'accept_all',score:i===0?92:i===1?5:35}}))})
 }
 return realFetch(url,options)
}
const service=createBillingServer({env:{...(live?{LEADSANGEL_CONFIG_FILE:process.env.LEADSANGEL_CONFIG_FILE}:{LEADSANGEL_LICENSE_KEY:'TEST-LICENSE-ONLY',LEADSANGEL_DEVICE_ID:'TEST-DEVICE-ONLY'}),STRIPE_SECRET_KEY:'sk_test_isolatedqa',STRIPE_PRICE_LIFETIME:'price_qa',BILLING_DB_PATH:join(dir,'billing.db'),BILLING_PUBLIC_URL:'http://127.0.0.1:38747',DOWNLOAD_SIGNING_KEY:'isolated-test-key-20261104-no-real-billing'},fetch:async()=>({ok:true,json:async()=>({active:true,currency:'pkr',unit_amount:1000000,recurring:null})}),sendEmail:async row=>{sent.push(row);return true}})
let app
try{
 await new Promise(resolve=>service.server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${service.server.address().port}`
 const env={...process.env,APPDATA:join(dir,'appdata'),LEADSNAP_BILLING_API_URL:base}
 for(const name of ['LEADSANGEL_CONFIG_FILE','ELECTRON_RUN_AS_NODE','VITE_DEV_SERVER_URL','LEADSNAP_TEST_HOOKS','APIFY_API_TOKEN','APIFY_TOKEN','APIFY_API_TOKEN_FILE','MAILVERIFIER_API_KEY','MAILVERIFIER_API_KEY_FILE'])delete env[name]
 const profile=join(dir,'desktop')
 app=await _electron.launch({...(packaged?{executablePath:process.env.MAMALEAD_TEST_EXE}:{cwd:process.cwd()}),args:[...(packaged?[]:['.']),'--user-data-dir='+profile],env,timeout:60000})
 if(packaged)await app.evaluate((_,base)=>{const real=globalThis.fetch;globalThis.fetch=(url,options)=>real(String(url).startsWith('https://api.mamalead.com/')?base+new URL(url).pathname+new URL(url).search:url,options)},base)
 const page=await app.firstWindow();page.on('pageerror',e=>report.errors.push(e.message));await page.waitForFunction(()=>!!window.desktop?.billing)
 await page.evaluate(()=>window.desktop.billing.requestTrial('managed-fixture@qa-mamalead.com'));await page.evaluate(key=>window.desktop.billing.activate(key),sent[0].licenseKey)
 report.status=await page.evaluate(()=>window.desktop.emailValidity.status());assert.equal(report.status.managed,true);assert.equal(report.status.configured,true);assert.equal(report.status.mode,'provider')
 assert.equal(existsSync(join(profile,'secrets/leadsangel.enc')),false)
 const sites=live?['https://plausible.io','https://www.brewteacompany.co.uk','https://www.topstudyworld.com']:['https://one.business.com','https://two.business.com','https://three.business.com']
 const imported=await page.evaluate(urls=>window.desktop.local.imports.websites(urls,{enqueue:false}),sites)
 if(live){const queued=await page.evaluate(ids=>window.desktop.local.jobs.queue('email',ids),imported.leadIds);await page.evaluate(()=>window.desktop.enrichment.start());for(let i=0;i<120;i++){const job=await page.evaluate(id=>window.desktop.local.jobs.status(id),queued.jobId);if(['done','failed'].includes(job?.status))break;await page.waitForTimeout(1000)}}
 else await app.evaluate(({app},ids)=>{const req=process.getBuiltinModule('module').createRequire(app.getAppPath()+'/package.json'),{repository}=req('./dist-electron/db/index.js').openDatabase();globalThis.__fixtureEmails=ids.map((id,i)=>{const email=['hello@plausible.io','hello@brewteacompany.co.uk','ceo@topstudyworld.com'][i];repository.upsertContact({leadId:id,kind:"email",value:email,source:"https://fixture.example"});return email})},imported.leadIds)
 report.extracted=await page.evaluate(ids=>window.desktop.local.contacts.list('email',ids),imported.leadIds);assert.equal(report.extracted.length,3)
 const started=Date.now();report.summary=await page.evaluate(ids=>window.desktop.emailValidity.verify({leadIds:ids,force:true}),imported.leadIds);report.seconds=Math.round((Date.now()-started)/100)/10
 report.contacts=await page.evaluate(ids=>window.desktop.local.contacts.list('email',ids),imported.leadIds)
 assert.equal(report.summary.checked,3);assert.equal(report.summary.failed,0)
 if(!live){assert.equal(report.summary.valid,1);assert.equal(report.summary.invalid,1);assert.equal(report.summary.risky,1)}
 assert.equal((await page.evaluate(()=>window.desktop.emailValidity.verify({leadIds:[]}))).checked,0)
 if(!live){
  const many=await page.evaluate(urls=>window.desktop.local.imports.websites(urls,{enqueue:false}),Array.from({length:200},(_,i)=>`https://company${i}.qa-mamalead.com`))
  await app.evaluate(({app},ids)=>{const req=process.getBuiltinModule('module').createRequire(app.getAppPath()+'/package.json'),{repository}=req('./dist-electron/db/index.js').openDatabase();ids.forEach((leadId,i)=>repository.upsertContact({leadId,kind:'email',value:`qa-${i}@plausible.io`,source:'https://fixture.example'}))},many.leadIds)
  const before=fixtureBatches.length,pendingMany=page.evaluate(ids=>window.desktop.emailValidity.verify({leadIds:ids}),many.leadIds)
  await page.locator('[data-view="phone"]').click();await page.locator('[data-view="email"]').click()
  report.largeBatch=await pendingMany;assert.equal(report.largeBatch.checked,200);assert.equal(report.largeBatch.failed,0)
  assert.equal(fixtureBatches.length-before,10);assert.ok(fixtureBatches.slice(before).every(batch=>batch.length===20));assert.equal(new Set(fixtureBatches.slice(before).flat()).size,200)
  fixtureState='queued';const pending=page.evaluate(ids=>window.desktop.emailValidity.verify({leadIds:ids,force:true}),imported.leadIds);await page.waitForTimeout(2000);await page.evaluate(()=>window.desktop.emailValidity.cancel());assert.equal((await pending).cancelled,true);report.cancelled=true
 }
 await page.locator('[data-view="email"]').click();await page.waitForTimeout(1200)
 const screenshots=resolve('screenshots/qa-email-managed');mkdirSync(screenshots,{recursive:true});await page.screenshot({path:join(screenshots,live?'live-server-mailbox.png':packaged?'packaged-mailbox.png':'source-mailbox.png')})
 assert.deepEqual(report.errors,[]);report.providerRequests=requests;report.passed=true
 console.log(JSON.stringify({passed:true,live,packaged,summary:report.summary,largeBatch:report.largeBatch,seconds:report.seconds,providerHTTP:requests.map(r=>r.status),credentialInClient:false,cancelled:report.cancelled}))
}catch(error){report.error=error.message;console.error(error);process.exitCode=1}
finally{if(app)await app.close();service.close();globalThis.fetch=realFetch;writeFileSync(join(dir,'report.json'),JSON.stringify(report,null,2));console.log('Evidence: '+join(dir,'report.json'))}
