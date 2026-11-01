import {test} from 'node:test'
import assert from 'node:assert/strict'
import {supportClientIp} from '../billing-server/client-ip.mjs'
import {createBillingServer} from '../billing-server/server.mjs'
import {mkdtempSync,rmSync} from 'node:fs'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {randomUUID} from 'node:crypto'
const config={SUPPORT_CLIENT_IP_HEADER:'cf-connecting-ip'}
const request=(peer,ip,xff='198.51.100.7')=>({socket:{remoteAddress:peer},headers:{'cf-connecting-ip':ip,'x-forwarded-for':xff}})
test('ML129 only trusted Cloudflare/tunnel peers supply canonical client IPs; XFF cannot override them',()=>{
 for(const peer of ['127.0.0.1','::1','::ffff:127.0.0.1','104.16.0.2','2606:4700::1'])assert.equal(supportClientIp(request(peer,'192.0.2.8'),config),'192.0.2.8')
 assert.equal(supportClientIp(request('198.51.100.4','192.0.2.8'),config),'198.51.100.4')
 assert.equal(supportClientIp(request('127.0.0.1','192.0.2.8')),'127.0.0.1')
 for(const bad of ['',undefined,'not an IP','192.0.2.8, 192.0.2.9',['192.0.2.8'],'192.0.2.8:80'])assert.equal(supportClientIp(request('127.0.0.1',bad),config),'127.0.0.1')
 assert.equal(supportClientIp(request('127.0.0.1','2001:0db8:0:0:0:0:0:1'),config),'2001:db8::1')
 assert.equal(supportClientIp(request('127.0.0.1','::ffff:192.0.2.8'),config),'192.0.2.8')
 assert.equal(supportClientIp(request('127.0.0.1','192.0.2.8'),{SUPPORT_TRUST_PROXY:'1'}),'192.0.2.8')
})
test('ML129 real HTTP handler uses one rate-limit bucket despite spoofed XFF, and distinct clients stay separate',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'ml-ip-')),verified=[]
 const api=createBillingServer({env:{...config,STRIPE_SECRET_KEY:'sk_test_fixture',STRIPE_PRICE_LIFETIME:'price_fixture',BILLING_DB_PATH:join(dir,'billing.db'),TURNSTILE_SITE_KEY:'fixture-site',TURNSTILE_SECRET_KEY:'fixture-secret',SUPPORT_IP_SALT:'fixture-salt',RESEND_API_KEY:'fixture-mail',EMAIL_FROM:'qa@example.test',SUPPORT_INBOX:'support@example.test'},fetch:async(url,options)=>{
  if(url.endsWith('/siteverify')){verified.push(JSON.parse(options.body).remoteip);return Response.json({success:true,hostname:'mamalead.com',action:'mamalead_support'})}
  assert.equal(url,'https://api.resend.com/emails');return Response.json({id:'fixture'})
 }})
 try{
  await new Promise(r=>api.server.listen(0,'127.0.0.1',r))
  const send=(xff,ip,n)=>fetch('http://127.0.0.1:'+api.server.address().port+'/v1/support/web',{method:'POST',headers:{'content-type':'application/json','cf-connecting-ip':ip,'x-forwarded-for':xff},body:JSON.stringify({clientMessageId:randomUUID(),email:`qa${n}@example.test`,name:'QA',category:'bug',subject:'Proxy test',message:'Isolated test message '+n,turnstileToken:'fixture-token'})})
  assert.equal((await send('198.51.100.1','192.0.2.8',1)).status,200)
  assert.equal((await send('198.51.100.2','192.0.2.8',2)).status,429)
  assert.equal((await send('198.51.100.3','192.0.2.9',3)).status,200)
  assert.ok(verified.includes('192.0.2.8')&&verified.includes('192.0.2.9'));assert.ok(verified.every(ip=>!ip.startsWith('198.51.100.')))
 }finally{await new Promise(r=>api.server.close(r));api.close();rmSync(dir,{recursive:true,force:true})}
})
