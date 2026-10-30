// Real Electron UI and queue. Fixture billing/data never touch the customer's profile.
// --live additionally reads only the three websites reported in this incident.
import assert from 'node:assert/strict'
import {mkdtempSync} from 'node:fs'
import {join,resolve} from 'node:path'
import {tmpdir} from 'node:os'
import {DatabaseSync} from 'node:sqlite'
import {_electron} from 'playwright'
import {createBillingServer} from '../billing-server/server.mjs'

const directory=mkdtempSync(join(tmpdir(),'mamalead-social-ui-')),sent=[],errors=[]
const live=process.argv.includes('--live'),packaged=process.argv.includes('--packaged')
const service=createBillingServer({
  env:{STRIPE_SECRET_KEY:'sk_test_socialfixture',STRIPE_PRICE_LIFETIME:'price_lifetime',BILLING_DB_PATH:join(directory,'billing.db'),BILLING_PORT:'0',BILLING_PUBLIC_URL:'http://127.0.0.1:38747',DOWNLOAD_SIGNING_KEY:'social-fixture-only-signing-secret-123456789'},
  fetch:async()=>({ok:true,json:async()=>({active:true,currency:'pkr',unit_amount:1000000,recurring:null})}),
  sendEmail:async message=>{sent.push(message);return true},
})
let app,db
try{
  await new Promise(done=>service.server.listen(0,'127.0.0.1',done))
  const env={...process.env,APPDATA:join(directory,'appdata'),LEADSNAP_BILLING_API_URL:`http://127.0.0.1:${service.server.address().port}`,LEADSNAP_TEST_HOOKS:'1'}
  delete env.ELECTRON_RUN_AS_NODE;delete env.VITE_DEV_SERVER_URL
  const args=[`--user-data-dir=${join(directory,'profile')}`]
  app=await _electron.launch(packaged?{executablePath:resolve('release/win-unpacked/MamaLead.exe'),args,env}:{args:['.',...args],cwd:resolve('.'),env})
  await app.evaluate(({shell},{billing,live})=>{
    shell.openExternal=async()=>{}
    const original=globalThis.fetch,attempts=new Map()
    globalThis.socialNetworkErrors=[]
    globalThis.fetch=async(input,init)=>{
      const url=new URL(String(input))
      if(url.origin==='https://api.mamalead.com')return original(billing+url.pathname+url.search,init)
      if(url.hostname==='127.0.0.1')return original(input,init)
      if(live&&['venusaesthetics.pk','corecareaesthetics.pk','nurskinclinic.com'].includes(url.hostname.replace(/^www\./,''))){
        const started=Date.now()
        try{return await original(input,init)}catch(error){globalThis.socialNetworkErrors.push({url:url.href,ms:Date.now()-started,message:error.message,cause:error.cause?.message,code:error.cause?.code,errors:error.cause?.errors?.map(e=>({code:e.code,message:e.message}))});throw error}
      }
      if(url.hostname.endsWith('.fixture.test')){
        const n=Number(url.hostname.match(/^site(\d+)/)?.[1] || '0');attempts.set(n,(attempts.get(n)||0)+1)
        await new Promise((resolve,reject)=>{const timer=setTimeout(resolve,n===0?4200:100);init.signal.addEventListener('abort',()=>{clearTimeout(timer);reject(init.signal.reason)},{once:true})})
        if(n===1&&attempts.get(n)===1)throw new TypeError('fetch failed')
        const denied=n===2&&!globalThis.socialTestAllowRetry
        const response=new Response(denied?'denied':n===3?'<h1>No social profiles published</h1>':`<a href="https://instagram.com/clinic${n}">Instagram</a>`,{status:denied?403:200})
        Object.defineProperty(response,'url',{value:url.href});return response
      }
      return new Response('Not part of this test',{status:404})
    }
  },{billing:env.LEADSNAP_BILLING_API_URL,live})
  const page=await app.firstWindow();page.on('pageerror',error=>errors.push(error.message))
  await page.locator('[data-view="dashboard"]').waitFor()
  await page.evaluate(()=>window.desktop.billing.requestTrial('social-batch@fixture.test'))
  await page.evaluate(key=>window.desktop.billing.activate(key),sent[0].licenseKey)
  await page.reload();await page.locator('[data-view="social"]').click()
  const urls=live?['https://venusaesthetics.pk/locations/lahore/','https://www.corecareaesthetics.pk/','http://nurskinclinic.com/']:Array.from({length:50},(_,i)=>`https://site${i}.fixture.test`)
  await page.getByRole('button',{name:'Import websites',exact:true}).first().click()
  await page.locator('[data-imptext="1"]').fill(urls.join('\n'))
  assert.match(await page.locator('[data-socimpgo="1"]').innerText(),new RegExp(`Scan ${urls.length} sites`))
  const start=Date.now();await page.locator('[data-socimpgo="1"]').click()
  await page.locator('[data-impmodal="1"]').waitFor({state:'hidden'})
  if(!live){
    await page.waitForFunction(()=>document.querySelectorAll('[data-soclist] [data-impst="scanning"]').length>1,null,{timeout:15000})
    await page.waitForFunction(()=>{
      const rows=[...document.querySelectorAll('[data-soclist] [data-row="1"]')]
      return rows[0]?.querySelector('[data-impst="scanning"]') && rows.slice(1).some(row=>row.querySelector('[data-impst="done"]'))
    },null,{timeout:15000})
    console.log('PASS later rows show results while the first slow site is still scanning')
  }
  await page.waitForFunction(()=>{
    const rows=document.querySelectorAll('[data-soclist] [data-row="1"]')
    return rows.length>0 && !document.querySelector('[data-soclist] [data-impst="scanning"], [data-soclist] [data-impst="pending"]')
  },null,{timeout:60000})
  db=new DatabaseSync(join(directory,'profile','leads.db'),{readOnly:true})
  const job=db.prepare("select status,found,options from enrichment_jobs where kind='social' order by created_at desc limit 1").get(),progress=JSON.parse(job.options).progress
  assert.equal(progress.processed,urls.length);assert.equal(Object.keys(progress.outcomes).length,urls.length)
  assert.equal(await page.locator('[data-soclist] [data-row="1"]').count(),urls.length)
  if(!live){
    assert.equal(progress.failed,1);assert.equal(job.found,48)
    assert.equal(await page.locator('[data-soclist] [data-impst="failed"]').count(),1)
    assert.equal(await page.locator('[data-soclist] [data-social-profile-link]').count(),48)
    assert.equal(await page.locator('[data-soclist]').getByText('No profiles published',{exact:true}).count(),1)
  }else{
    console.log(JSON.stringify({networkErrors:await app.evaluate(()=>globalThis.socialNetworkErrors)}))
    assert.equal(progress.failed,0,JSON.stringify(progress))
    assert.ok(await page.locator('[data-social-profile-link*="corecareaesthetics"]').count())
    assert.ok(await page.locator('[data-social-profile-link*="venusaestheticspk"]').count())
    assert.equal(await page.locator('[data-social-profile-link*="ononreklamIar"], [data-social-profile-link*="Haddorfer"]').count(),0)
  }
  const results=db.prepare('select l.website,s.platform,s.profile_url from leads l left join social_profiles s on s.lead_id=l.id order by l.website').all()
  console.log(JSON.stringify({mode:live?'live three reported sites':'50 controlled sites',packaged,elapsedMs:Date.now()-start,processed:progress.processed,failed:progress.failed,found:job.found,...(live?{results}:{})}))
  assert.deepEqual(errors,[])
  await page.locator('[data-soclist]').screenshot({path:join(directory,'social-results.png')})
  if(!live){
    await app.evaluate(()=>{globalThis.socialTestAllowRetry=true})
    await page.getByRole('button',{name:'Retry 1 failed business',exact:true}).click()
    await page.waitForFunction(()=>document.querySelectorAll('[data-soclist] [data-row="1"]').length===1&&Boolean(document.querySelector('[data-social-profile-link*="clinic2"]')),null,{timeout:15000})
    const retry=db.prepare("select lead_ids from enrichment_jobs where kind='social' order by created_at desc limit 1").get()
    assert.equal(JSON.parse(retry.lead_ids).length,1)
    assert.equal(db.prepare('select count(*) n from social_profiles').get().n,49)
    console.log('PASS Retry failed scans only the failed website; 48 earlier profiles remain saved')
  }
  console.log('PASS rendered progress, per-site errors, saved results, no waiting rows; evidence: '+directory)
}finally{
  db?.close();await app?.close();await new Promise(done=>service.server.close(done));service.close()
}
