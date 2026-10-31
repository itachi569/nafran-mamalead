import assert from 'node:assert/strict'
import {DatabaseSync} from 'node:sqlite'
import {randomUUID} from 'node:crypto'
import {createSqliteSupportStore,supportSchema} from '../billing-server/support-store.mjs'
import {sendWebSupport,webSupportConfig,supportConfig,retrySupportDelivery} from '../billing-server/support.mjs'
const db=new DatabaseSync(':memory:'),store=createSqliteSupportStore(db)
const env={TURNSTILE_SITE_KEY:'fixture-site',TURNSTILE_SECRET_KEY:'fixture-secret',SUPPORT_IP_SALT:'fixture-salt',RESEND_API_KEY:'fixture-mail',EMAIL_FROM:'qa@example.test',SUPPORT_INBOX:'support@example.test'}
let check={success:true,hostname:'mamalead.com',action:'mamalead_support'},calls=0,mail=[]
const fetcher=async(url,options)=>{if(url.endsWith('/siteverify')){calls++;assert.equal(JSON.parse(options.body).secret,env.TURNSTILE_SECRET_KEY);return Response.json(check)}assert.equal(url,'https://api.resend.com/emails');mail.push(JSON.parse(options.body));return Response.json({id:'fixture'})}
const payload=i=>({clientMessageId:randomUUID(),email:`user${i}@example.test`,name:'QA',category:'bug',subject:'Local test',message:`Please check this local fixture number ${i}.`,turnstileToken:'fixture-token'})
const send=(input,extra={})=>sendWebSupport({env,store,input,ip:'192.0.2.1',fetcher,...extra})
try{
 assert.equal(supportConfig({},store).emailConfigured,false)
 assert.equal(webSupportConfig({},store).configured,false)
 assert.ok(!JSON.stringify(webSupportConfig(env,store)).includes('fixture-secret'))
 await assert.rejects(send({...payload(0),turnstileToken:''}),e=>e.status===400);assert.equal(calls,0)
 for(const result of [{success:false},{success:true,hostname:'attacker.test',action:'mamalead_support'},{success:true,hostname:'mamalead.com',action:'login'}]){check=result;await assert.rejects(send(payload(1)),e=>e.status===403)}
 check={success:true,hostname:'mamalead.com',action:'mamalead_support'}
 await assert.rejects(send(payload(2),{env:{...env,TURNSTILE_SECRET_KEY:''}}),e=>e.status===503)
 await assert.rejects(send(payload(2),{fetcher:async()=>{throw new Error('offline')}}),e=>e.status===503)
 const now=Date.now(),first=payload(3),sent=await send(first,{now})
 assert.equal(sent.emailSent,true);assert.equal(sent.receiptSent,true);assert.equal(sent.emailQueued,false);assert.equal(mail.length,2)
 assert.equal((await send(first,{now})).ticketId,sent.ticketId);assert.equal(mail.length,2)
 await assert.rejects(send(payload(4),{now:now+1000}),e=>e.status===429&&e.retryAfterSeconds>0)
 for(let i=1;i<5;i++)await send(payload(i+5),{now:now+i*61000})
 await assert.rejects(send(payload(15),{now:now+5*61000}),e=>e.status===429)
 for(let i=0;i<3;i++)await send({...payload(i+20),email:'same@example.test'},{ip:'192.0.2.'+(i+10),now})
 await assert.rejects(send({...payload(25),email:'same@example.test'},{ip:'192.0.2.20',now}),e=>e.status===429)
 const count=db.prepare('select count(*) n from billing_support_messages').get().n
 await send({website:'spam'});assert.equal(db.prepare('select count(*) n from billing_support_messages').get().n,count)
 const rows=db.prepare('select * from billing_support_messages').all();assert.ok(rows.every(r=>r.source==='website'&&r.installation_id.startsWith('web:')))
 // Alert succeeds while acknowledgment fails: retry only the failed delivery.
 let failReceipt=true,alertCount=0
 const flaky=async(url,options)=>{if(url.endsWith('/siteverify'))return Response.json(check);const p=JSON.parse(options.body);if(p.to[0]===env.SUPPORT_INBOX)alertCount++;else if(failReceipt)return new Response('',{status:503});return Response.json({id:'fixture'})}
 const queued=await send(payload(30),{ip:'192.0.2.30',fetcher:flaky,now})
 assert.equal(queued.emailSent,true);assert.equal(queued.receiptSent,false);assert.equal(queued.emailQueued,true)
 failReceipt=false;assert.equal((await retrySupportDelivery({env,store,fetcher:flaky,now:now+180000})).sent,1);assert.equal(alertCount,1)
 console.log('PASS public CAPTCHA validation/action/hostname, missing config, limits, idempotency, source, acknowledgment retry and honeypot; no network or real emails')
 const legacy=new DatabaseSync(':memory:')
 try{
  legacy.exec(supportSchema[0].replace(", receipt_status text not null default 'legacy', source text not null default 'app'",''))
  legacy.exec("insert into billing_support_messages(id,client_message_id,installation_id,email,category,subject,message,message_hash,email_status,last_activity_at,created_at) values ('ML-S-OLD001','old-id','old-install','old@example.test','other','Old ticket','Old message','old-hash','sent','2020-01-01','2020-01-01')")
  const migrated=createSqliteSupportStore(legacy),old=legacy.prepare('select receipt_status,source from billing_support_messages').get()
  assert.equal(old.receipt_status,'legacy');assert.equal(old.source,'app');assert.deepEqual(await migrated.pendingSupportMessages(new Date().toISOString()),[])
  console.log('PASS old support tickets migrate without emailing old customers again')
 }finally{legacy.close()}
}finally{db.close()}
