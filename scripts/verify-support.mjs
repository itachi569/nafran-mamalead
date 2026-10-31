// Local fixtures only: no email, payment or production data access.
import assert from 'node:assert/strict'
import {mkdtempSync,writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {randomUUID,createHash} from 'node:crypto'
import {createBillingServer} from '../billing-server/server.mjs'
import {createSqliteSupportStore} from '../billing-server/support-store.mjs'
import {sendSupport,retrySupportDelivery} from '../billing-server/support.mjs'
import {cleanMeta,validateSupport} from '../billing-server/support-contract.mjs'
import {createLicenseAdminServer} from '../billing-server/admin-licenses.mjs'
import {createSqliteAdminStore} from '../admin-dashboard/server/stores.mjs'
import {createAdminHandler} from '../admin-dashboard/server/admin-core.mjs'
import {createAdminSupport} from '../billing-server/admin-support.mjs'
const dir=mkdtempSync(join(tmpdir(),'mamalead-support-')),dbPath=join(dir,'billing.db'),mail=[]
let failMail=false
const fakeFetch=async(url,options)=>{assert.equal(url,'https://api.resend.com/emails');if(failMail)return new Response('{}',{status:500});mail.push({payload:JSON.parse(options.body),key:options.headers['Idempotency-Key']||options.headers['idempotency-key']});return Response.json({id:'mail-'+mail.length})}
const env={STRIPE_SECRET_KEY:'sk_test_localfixture',STRIPE_PRICE_LIFETIME:'price_fixture',BILLING_PUBLIC_URL:'http://127.0.0.1:38747',BILLING_DB_PATH:dbPath,DOWNLOAD_SIGNING_KEY:'local-fixture-salt',RESEND_API_KEY:'local-test-only',EMAIL_FROM:'MamaLead <support@example.test>',SUPPORT_INBOX:'support@example.test',SUPPORT_REPLY_FROM:'MamaLead Help <help@example.test>',SUPPORT_SIGNATURE:'MamaLead Support team',ADMIN_TOKEN_SHA256:createHash('sha256').update('test-owner-credential-only-32chars').digest('hex'),ADMIN_LOG:'0',ADMIN_SESSION_SECRET:'fixture-session-secret-32-characters-minimum'}
const service=createBillingServer({env,fetch:fakeFetch});let reader,writerServer
const payload=(i=0)=>({name:'Test user',email:'user'+i+'@example.test',category:'bug',subject:'Export issue '+i,message:'Please check my export. <script>alert(1)</script> '+i,clientMessageId:randomUUID(),page:'email',diagnostics:false,meta:{app:{version:'1.4.24',platform:'win32'},secret:'should-not-survive'}})
const parse=r=>JSON.parse(r.body)
try {
 await new Promise(r=>service.server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+service.server.address().port
 const call=async(path,p,token)=>{const r=await fetch(base+path,{method:p?'POST':'GET',headers:{'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{})},body:p?JSON.stringify(p):undefined});return {status:r.status,body:await r.json(),headers:r.headers}}
 assert.equal((await call('/v1/support',payload())).status,401)
 const install=(await call('/v1/installations',{})).body;assert.ok(install.token)
 const p=payload(),sent=await call('/v1/support',p,install.token);assert.equal(sent.status,200,JSON.stringify(sent));assert.match(sent.body.ticketId,/^ML-S-[A-Z0-9]{6}$/)
 assert.equal(mail.length,1);assert.equal(mail[0].payload.reply_to,p.email);assert.ok(mail[0].payload.html.includes('&lt;script&gt;'));assert.ok(!mail[0].payload.html.includes('<script>'))
 assert.equal((await call('/v1/support',p,install.token)).body.ticketId,sent.body.ticketId);assert.equal(mail.length,1)
 assert.equal((await call('/v1/support',{...p,clientMessageId:randomUUID()},install.token)).body.duplicate,true)
 const limited=await call('/v1/support',payload(1),install.token);assert.equal(limited.status,429);assert.ok(limited.body.retryAfterSeconds>0)
 const before=service.db.prepare('select count(*) n from billing_support_messages').get().n
 assert.equal((await call('/v1/support',{website:'bot'},install.token)).status,200)
 assert.equal(service.db.prepare('select count(*) n from billing_support_messages').get().n,before)
 assert.equal((await call('/v1/support',{...payload(),message:'https://a.test '.repeat(6)},install.token)).status,400)
 assert.equal((await call('/v1/support',{...payload(),email:'invalid'},install.token)).status,400)
 assert.equal((await call('/v1/support',{...payload(),message:'x'.repeat(40000)},install.token)).status,413)
 assert.equal((await call('/v1/support/config',null,install.token)).body.email,'support@example.test')
 const anotherInstall=(await call('/v1/installations',{})).body
 const conflict=await call('/v1/support',{...p,message:'A different installation replays an existing request id.'},anotherInstall.token)
 assert.equal(conflict.status,409);assert.equal(conflict.body.retryAfterSeconds,undefined)
 const userText='I re-installed the app. Please use ali@gmail.com for pre-activation, not x@y.com. C:\\Users\\Ali\\report.txt'
 const userSent=await call('/v1/support',{...payload(999),message:userText,subject:'Purchase with x@y.com'},anotherInstall.token)
 assert.equal(userSent.status,200)
 const userRow=service.db.prepare('select message,subject from billing_support_messages where id=?').get(userSent.body.ticketId)
 assert.equal(userRow.message,userText);assert.equal(userRow.subject,'Purchase with x@y.com')
 assert.throws(()=>validateSupport({...payload(),clientMessageId:'fake'}))
 const metadata=cleanMeta({app:{version:'1',token:'secret'},lastErrors:[{text:'NF-ABCD-EFGH-IJKL-MNOP-QRST-UVWX Bearer abcdefgh https://example.test/?key=secret C:\\Users\\Someone\\file.txt',at:new Date().toISOString()}],counts:{leads:3,runs:2},leadData:[1]},true)
 const text=JSON.stringify(metadata);assert.ok(!text.includes('secret'));assert.ok(!text.includes('Someone'));assert.ok(!text.includes('ABCD'));assert.ok(!text.includes('leadData'));assert.ok(!text.includes('abcdefgh'));assert.equal(cleanMeta(metadata,false).lastErrors,undefined)
 console.log('PASS authenticated unlicensed send, validation, body cap, honeypot, escaping, privacy, idempotency and rate limit')
 const store=createSqliteSupportStore(service.db),at=Date.now()-3600000
 for(let i=0;i<5;i++)await sendSupport({env,store,installation:{id:'hour-fixture'},input:payload(100+i),ip:'hour-fixture',fetcher:fakeFetch,now:at+i*61000})
 await assert.rejects(sendSupport({env,store,installation:{id:'hour-fixture'},input:payload(106),ip:'hour-fixture',fetcher:fakeFetch,now:at+5*61000}),e=>e.status===429&&e.retryAfterSeconds>60)
 failMail=true
 const queued=await sendSupport({env,store,installation:{id:'offline-fixture'},input:payload(200),fetcher:fakeFetch});assert.equal(queued.emailQueued,true)
 failMail=false
 assert.equal((await retrySupportDelivery({env,store,fetcher:fakeFetch,now:Date.now()+180000})).sent,1)
 const retry=await sendSupport({env,store,installation:{id:'offline-fixture'},input:{...payload(200),clientMessageId:randomUUID()},fetcher:fakeFetch});assert.equal(retry.ticketId,queued.ticketId);assert.equal(retry.emailQueued,false)
 console.log('PASS server hourly cap and persisted failed delivery retry')
 // 30 independently authenticated installs: page two must contain five rows.
 service.db.prepare('delete from billing_support_replies').run();service.db.prepare('delete from billing_support_messages').run()
 const tickets=[]
 for(let i=0;i<30;i++) {const ins=(await call('/v1/installations',{})).body;const row=await call('/v1/support',payload(i),ins.token);assert.equal(row.status,200);tickets.push(row.body.ticketId)}
 reader=await createSqliteAdminStore(dbPath)
 const perform=createAdminSupport(service.db,{env,fetch:fakeFetch})
 const admin=createAdminHandler({env,store:reader,supportWriter:{reply:p=>perform('reply',p),status:p=>perform('status',p),note:p=>perform('note',p),config:()=>perform('config',{})}})
 const adminCall=(path,body,method='GET',auth='Bearer test-owner-credential-only-32chars',csrf='1')=>admin.handle({url:path,method,authorization:auth,csrf,ip:'127.0.0.1',readBody:async()=>JSON.stringify(body||{})})
 const path='/admin/api/support/'+tickets[0]
 assert.equal((await adminCall('/admin/api/support',null,'GET','')).status,401)
 assert.equal((await adminCall(path,{read:true,clientActionId:randomUUID()},'PATCH',undefined,'')).status,403)
 const list=parse(await adminCall('/admin/api/support?page=2'));assert.equal(list.rows.length,5);assert.equal(list.total,30)
 assert.equal(parse(await adminCall('/admin/api/support?category=licence')).total,0)
 assert.equal(parse(await adminCall('/admin/api/support?q='+tickets[0])).total,1)
 assert.equal(parse(await adminCall('/admin/api/support?q=user0%40example.test')).total,1)
 assert.equal(parse(await adminCall('/admin/api/support?from=2099-01-01')).total,0)
 const detail=parse(await adminCall(path));assert.ok(detail.installation?.id);assert.ok(!JSON.stringify(detail).includes('token_hash'));assert.ok(!JSON.stringify(detail).includes('key_hash'));assert.ok(!JSON.stringify(detail).includes('user0@example.test'))
 assert.equal(parse(await adminCall('/admin/api/support/unread')).unread,30,'GET detail has no write side effect')
 assert.equal((await adminCall(path,{read:true,clientActionId:randomUUID()},'PATCH')).status,200)
 assert.equal(parse(await adminCall('/admin/api/support/unread')).unread,29)
 const mailsBefore=mail.length,reply={body:'Thanks. We can help with your export.',closeAfter:true,clientActionId:randomUUID(),actor:'forged-actor',email:'attacker@example.test'}
 const results=await Promise.all([adminCall(path+'/reply',reply,'POST'),adminCall(path+'/reply',reply,'POST')]);assert.ok(results.every(r=>r.status===200),JSON.stringify(results));assert.equal(mail.length,mailsBefore+1)
 assert.equal(mail.at(-1).payload.to[0],'user0@example.test');assert.equal(mail.at(-1).payload.reply_to,env.SUPPORT_INBOX);assert.equal(mail.at(-1).payload.from,env.SUPPORT_REPLY_FROM);assert.match(mail.at(-1).payload.text,/MamaLead Support team/)
 assert.equal(parse(await adminCall(path)).ticket.status,'closed');assert.ok(!JSON.stringify(parse(await adminCall(path))).includes('forged-actor'))
 const note={body:'Internal investigation, not emailed.',clientActionId:randomUUID()};await adminCall(path+'/notes',note,'POST');assert.equal(mail.length,mailsBefore+1)
 failMail=true;const failed={body:'Second reply after investigating.',clientActionId:randomUUID()};assert.equal((await adminCall(path+'/reply',failed,'POST')).status,502)
 failMail=false;assert.equal((await adminCall(path+'/reply',failed,'POST')).status,200);assert.equal(parse(await adminCall(path)).thread.filter(r=>r.clientActionId===failed.clientActionId).length,1)
 const noWriter=createAdminHandler({env,store:reader});const degraded=parse(await noWriter.handle({url:path,method:'GET',authorization:'Bearer test-owner-credential-only-32chars',csrf:'1'}));assert.equal(degraded.canReply,false);assert.ok(degraded.ticket)
 console.log('PASS admin auth/CSRF, pagination, filters, masked detail, read badge, notes, reply idempotency, failure retry and read-only fallback')
 const keyFile=join(dir,'writer-key');writeFileSync(keyFile,'a'.repeat(64));writerServer=createLicenseAdminServer(service.db,{env,fetch:fakeFetch,keyFile});await new Promise(r=>writerServer.listen(0,'127.0.0.1',r))
 assert.equal(writerServer.address().address,'127.0.0.1')
 const writerUrl='http://127.0.0.1:'+writerServer.address().port+'/support/reply'
 assert.equal((await fetch(writerUrl,{method:'POST',body:'{}'})).status,401)
 assert.equal((await fetch(writerUrl,{method:'POST',headers:{authorization:'Bearer '+'a'.repeat(64)},body:'{}'})).status,400)
 const emptyStore={supportCounts:async()=>null,supportList:async()=>null};const oldAdmin=createAdminHandler({env,store:emptyStore});const old=parse(await oldAdmin.handle({url:'/admin/api/support',method:'GET',authorization:'Bearer test-owner-credential-only-32chars'}));assert.equal(old.available,false);assert.match(old.message,/billing-server update/);
 console.log('PASS loopback writer authentication and validation; no real emails sent')
}finally {if(writerServer)await new Promise(r=>writerServer.close(r));reader?.close?.();await new Promise(r=>service.server.close(r));service.db.close()}
