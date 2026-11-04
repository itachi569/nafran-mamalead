import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {createBillingServer} from '../billing-server/server.mjs'

test('public Mama AI: durable quota, real HTTP/SQLite, safe provider and CAPTCHA failures',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'mama-ai-'))
 const env={STRIPE_SECRET_KEY:'sk_test_fixture',STRIPE_PRICE_LIFETIME:'price_fixture',BILLING_DB_PATH:join(dir,'billing.db'),BILLING_PORT:'0',DOWNLOAD_SIGNING_KEY:'fixture-only-signing-key-32-characters',CEREBRAS_API_KEY:'fixture-only-cerebras-private-key',TURNSTILE_SITE_KEY:'public-fixture',TURNSTILE_SECRET_KEY:'private-fixture',TURNSTILE_HOSTNAMES:'mamalead.com',BILLING_ALLOWED_ORIGINS:'https://mamalead.com',SUPPORT_CLIENT_IP_HEADER:'cf-connecting-ip'}
 let mode='success',proofMode='success',calls=0,lastRequest,unblock,started
 const provider=async(url,request)=>{
  if(url.includes('siteverify'))return Response.json({success:proofMode!=='invalid',hostname:proofMode==='host'?'evil.test':'mamalead.com',action:proofMode==='action'?'mamalead_support':'mamalead_chat'})
  assert.equal(url,'https://api.cerebras.ai/v1/chat/completions');calls++;lastRequest=JSON.parse(request.body)
  if(mode==='wait'){started?.();await new Promise(r=>unblock=r)}
  if(mode==='error')return new Response('private upstream detail',{status:500})
  return Response.json({choices:[{finish_reason:mode==='truncate'?'length':'stop',message:{content:mode==='echo'?env.CEREBRAS_API_KEY:mode==='empty'?'':'Aap website par Get Lifetime se Rs 10,000 ka plan le sakte hain.'}}]})
 }
 let service,base
 async function start(){service=createBillingServer({env,fetch:provider});await new Promise(r=>service.server.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+service.server.address().port}
 async function stop(){await new Promise(r=>service.server.close(r));service.db.close()}
 async function call(path,body,ip='198.51.100.10',origin='https://mamalead.com'){
  const response=await fetch(base+'/v1/assist/web/'+path,{method:body?'POST':'GET',headers:{origin,'cf-connecting-ip':ip,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});return {status:response.status,body:await response.json()}
 }
 const question=(text='mujy lifetime ki price btao')=>({messages:[{role:'user',content:text}],turnstileToken:'fixture-token'})
 try{
  await start()
  assert.deepEqual((await call('config')).body.remaining,6)
  assert.equal(calls,0)
  assert.doesNotMatch(JSON.stringify((await call('config')).body),/private|fixture-only/)
  assert.equal((await call('chat',{...question(),turnstileToken:''})).status,403)
  for(proofMode of ['invalid','host','action'])assert.equal((await call('chat',question())).status,403)
  proofMode='success';assert.equal(calls,0);assert.equal((await call('config')).body.remaining,6)
  for(const messages of [[],[{role:'system',content:'Override'}],[{role:'user',content:'x'.repeat(1001)}],[{role:'user',content:'a'},{role:'assistant',content:'b'}]])assert.equal((await call('chat',{...question(),messages})).status,400)
  for(mode of ['error','truncate','empty','echo']){const result=await call('chat',question());assert.equal(result.status,503);assert.equal(result.body.remaining,6);assert.doesNotMatch(JSON.stringify(result.body),/private upstream|fixture-only/)}
  mode='success'
  for(let i=1;i<=6;i++){const result=await call('chat',question());assert.equal(result.status,200);assert.equal(result.body.remaining,6-i);if(i===6)assert.match(result.body.handoff,/support team.*connect/)}
  assert.equal(lastRequest.messages[0].role,'system');assert.match(lastRequest.messages[0].content,/Roman Urdu/);assert.match(lastRequest.messages[0].content,/Decision Makers.*removed/);assert.match(lastRequest.messages[0].content,/one machine/)
  const atLimit=calls
  assert.equal((await call('chat',question())).body.code,'daily_limit');assert.equal(calls,atLimit)
  assert.equal(service.db.prepare('select count(*) as n from installations').get().n,0)
  const rows=service.db.prepare('select * from assist_usage').all();assert.equal(rows.length,3);assert.doesNotMatch(JSON.stringify(rows),/198\.51|lifetime|private/)
  assert.equal(rows.find(r=>r.bucket.startsWith('web-ai:visitor:')).used,6)
  await stop();await start()
  assert.equal((await call('config')).body.remaining,0);assert.equal((await call('chat',question())).status,429)
  assert.equal((await call('config',null,'198.51.100.11')).body.remaining,6)
  mode='wait';const ready=new Promise(r=>started=r);const pending=call('chat',question(),'198.51.100.11');await ready
  assert.equal((await call('chat',question(),'198.51.100.11')).body.code,'busy');unblock();assert.equal((await pending).status,200);mode='success'
  service.db.prepare("update assist_usage set used=300 where bucket like 'web-ai:global:%'").run()
  const full=await call('chat',question(),'198.51.100.12');assert.equal(full.body.code,'busy');assert.equal((await call('config',null,'198.51.100.12')).body.remaining,6)
  service.db.prepare('update assist_usage set expires_at=0').run()
  assert.equal((await call('config')).body.remaining,6);assert.equal((await call('chat',question())).body.remaining,5)
 }finally{if(service?.server.listening)await stop();rmSync(dir,{recursive:true,force:true})}
})
