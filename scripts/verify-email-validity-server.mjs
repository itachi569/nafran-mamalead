import assert from 'node:assert/strict'
import {test} from 'node:test'
import {mkdtempSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {createEmailValidityService} from '../billing-server/email-validity.mjs'
import {createBillingServer} from '../billing-server/server.mjs'
import {randomUUID} from 'node:crypto'
class ErrorType extends Error{constructor(status,message){super(message);this.status=status}}
const env={LEADSANGEL_LICENSE_KEY:'TEST-LICENSE-ONLY',LEADSANGEL_DEVICE_ID:'TEST-DEVICE-ONLY'}
const result=(email,status='valid')=>({email,status,verified:status==='valid',score:status==='valid'?92:null,message:'SMTP checked',provider:'leadsangel'})
const store=()=>({reserveAssistUsage:async()=>[1]})
const input=(emails=['yes@public-business.com'])=>({emails,requestId:randomUUID()})
const tick=()=>new Promise(resolve=>setImmediate(resolve))

test('managed verifier: configured status never exposes credentials; no provider means unavailable',()=>{
 const svc=createEmailValidityService({env,store:store(),ErrorType})
 assert.equal(svc.configuration().configured,true);assert.ok(!JSON.stringify(svc.configuration()).includes(env.LEADSANGEL_LICENSE_KEY));svc.close()
 const missing=createEmailValidityService({env:{},store:store(),ErrorType})
 assert.equal(missing.configuration().configured,false);missing.close()
})
test('batch scope, four verdicts, idempotency, ownership and partial results',async()=>{
 let finish,calls=0
 const svc=createEmailValidityService({env,store:store(),ErrorType,verify:async(_,emails,signal,progress,onRows)=>{calls++;onRows([result(emails[0]),result('outside@other-company.com')]);return new Promise(resolve=>{finish=()=>resolve(emails.map((email,i)=>result(email,['valid','invalid','risky','unknown'][i])))})}})
 try{
  const data=input(['yes@business.com','no@business.com','maybe@business.com','unknown@business.com']),job=await svc.start('one',data)
  assert.equal(job.checked,1);assert.equal(job.results[0].email,data.emails[0])
  assert.equal((await svc.start('one',data)).id,job.id);assert.equal(calls,1)
  assert.throws(()=>svc.status('two',job.id),e=>e.status===404)
  assert.throws(()=>svc.cancel('two',job.id),e=>e.status===404)
  await assert.rejects(svc.start('one',input()),e=>e.status===409)
  await assert.rejects(svc.start('one',{...data,emails:['different@business.com']}),e=>e.status===409)
  finish();await tick();assert.deepEqual(svc.status('one',job.id).results.map(r=>r.status),['valid','invalid','risky','unknown'])
  assert.equal(svc.status('one',job.id).state,'completed')
 }finally{svc.close()}
})
test('provider failure keeps partial results, never invents Valid or DNS fallback',async()=>{
 const svc=createEmailValidityService({env,store:store(),ErrorType,verify:async(_,emails,s,p,rows)=>{rows([result(emails[0])]);throw new Error(env.LEADSANGEL_LICENSE_KEY)}})
 try{const job=await svc.start('one',input(['yes@business.com','pending@business.com']));await tick();const state=svc.status('one',job.id);assert.equal(state.state,'failed');assert.equal(state.checked,1);assert.equal(state.failed,1);assert.ok(!JSON.stringify(state).includes(env.LEADSANGEL_LICENSE_KEY))}finally{svc.close()}
})
test('cancel and disconnected client abort work; stale jobs expire',async()=>{
 let time=Date.now(),aborted=false
 const svc=createEmailValidityService({env,store:store(),ErrorType,now:()=>time,verify:async(_,emails,signal)=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>{aborted=true;reject(signal.reason)}))})
 try{const j=await svc.start('one',input());assert.equal(svc.cancel('one',j.id).state,'cancelled');assert.equal(aborted,true);aborted=false;const k=await svc.start('one',input());time+=46000;assert.equal(svc.status('one',k.id).state,'cancelled');assert.equal(aborted,true);time+=600000;assert.throws(()=>svc.status('one',k.id),e=>e.status===404)}finally{svc.close()}
})
test('limits and invalid inputs reject before SMTP submission',async()=>{
 let calls=0
 const svc=createEmailValidityService({env,store:{reserveAssistUsage:async()=>null},ErrorType,verify:async()=>{calls++;return[]}})
 try{await assert.rejects(svc.start('one',input(Array(21).fill('a@business.com'))),e=>e.status===400);await assert.rejects(svc.start('one',input(['bad\r\n@business.com'])),e=>e.status===400);await assert.rejects(svc.start('one',input()),e=>e.status===429);assert.equal(calls,0)}finally{svc.close()}
})
test('HTTP requires installation, device, active licence; expired trial and foreign job blocked',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'mamalead-server-validity-')),sent=[]
 const service=createBillingServer({env:{...env,STRIPE_SECRET_KEY:'sk_test_fixture',STRIPE_PRICE_LIFETIME:'price_fixture',BILLING_DB_PATH:join(dir,'billing.db'),BILLING_PUBLIC_URL:'http://127.0.0.1:38747',DOWNLOAD_SIGNING_KEY:'test-secret-only-not-a-production-key'},fetch:async()=>({ok:true,json:async()=>({active:true,currency:'pkr',unit_amount:1000000,recurring:null})}),sendEmail:async row=>{sent.push(row);return true}})
 const original=globalThis.fetch;let providerCalls=0
 globalThis.fetch=async(url,options)=>{
  if(String(url).startsWith('https://license.leadsangel.com/')){providerCalls++;return Response.json(String(url).endsWith('/verify')?{id:'fixture-job-12345',status:'completed'}:{items:[{email:'yes@business.com',status:'done',result:{status:'safe',reason:'recipient_accepted_catch_all_rejected',score:92}}]})}
  return original(url,options)
 }
 try{
  await new Promise(resolve=>service.server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${service.server.address().port}`
  const send=async(path,method='GET',body,token,device='a'.repeat(64))=>{const res=await fetch(base+path,{method,headers:{'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{}),...(device?{'x-nafran-device-id':device}: {})},body:body?JSON.stringify(body):undefined});return {status:res.status,data:await res.json()}}
  assert.equal((await send('/v1/email-validity/jobs','POST',input())).status,401)
  const token=(await send('/v1/installations','POST',{})).data.token
  assert.equal((await send('/v1/email-validity/status','GET',null,token)).data.configured,true)
  assert.equal((await send('/v1/email-validity/status','GET',null,token,null)).status,403)
  assert.equal((await send('/v1/email-validity/jobs','POST',input(),token)).status,403)
  await send('/v1/trial','POST',{email:'qa@qa-mamalead.com'},token)
  assert.equal((await send('/v1/activate','POST',{licenseKey:sent[0].licenseKey},token)).status,200)
  assert.equal((await send('/v1/email-validity/jobs','POST',input(),token,'b'.repeat(64))).status,403)
  const started=await send('/v1/email-validity/jobs','POST',input(['yes@business.com']),token);assert.equal(started.status,202)
  await tick();const done=await send('/v1/email-validity/jobs/'+started.data.id,'GET',null,token);assert.equal(done.data.results[0].status,'valid');assert.ok(providerCalls>0)
  service.db.prepare('update trial_licenses set expires_at=?').run('2020-01-01T00:00:00.000Z')
  assert.equal((await send('/v1/email-validity/jobs','POST',input(),token)).status,403)
  assert.equal((await send('/v1/email-validity/jobs/'+started.data.id,'GET',null,token)).status,403)
  assert.equal((await send('/v1/email-validity/jobs/'+started.data.id,'DELETE',null,token)).status,200)
 }finally{globalThis.fetch=original;service.close();rmSync(dir,{recursive:true,force:true})}
})
