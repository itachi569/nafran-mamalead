import {test} from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {loadTurnstileConfig} from '../billing-server/turnstile-config.mjs'
import {webSupportConfig} from '../billing-server/support.mjs'
test('private Turnstile file loads only allowed keys; explicit environment wins; public response hides secret',()=>{
 const dir=mkdtempSync(join(tmpdir(),'ml-turnstile-')),file=join(dir,'fixture.env')
 try{
  writeFileSync(file,'TURNSTILE_SITE_KEY="site-test"\nTURNSTILE_SECRET_KEY=secret-test\nRESEND_API_KEY=not-allowed\nTURNSTILE_HOSTNAMES=mamalead.com\n')
  const env=loadTurnstileConfig({TURNSTILE_CONFIG_FILE:file})
  assert.equal(env.TURNSTILE_SITE_KEY,'site-test');assert.equal(env.TURNSTILE_SECRET_KEY,'secret-test');assert.equal(env.RESEND_API_KEY,undefined)
  assert.equal(loadTurnstileConfig({TURNSTILE_SITE_KEY:'explicit'},file).TURNSTILE_SITE_KEY,'explicit')
  const publicConfig=webSupportConfig(env,{reserveSupportMessage(){}})
  assert.equal(publicConfig.configured,true);assert.ok(!JSON.stringify(publicConfig).includes('secret-test'))
  assert.deepEqual(loadTurnstileConfig({},join(dir,'missing.env')), {})
  assert.throws(()=>loadTurnstileConfig({TURNSTILE_CONFIG_FILE:join(dir,'missing.env')}),/Cannot read the private/)
 }finally{rmSync(dir,{recursive:true,force:true})}
})
