import assert from 'node:assert/strict'
import {mkdtempSync,writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {createBillingServer} from '../billing-server/server.mjs'
import {createLicenseAdminServer} from '../billing-server/admin-licenses.mjs'
import {createSqliteLeadCacheStore} from '../billing-server/lead-cache-store.mjs'
import {cacheKeyFor} from '../billing-server/lead-cache-key.mjs'
const dir=mkdtempSync(join(tmpdir(),'mamalead-cache-api-'))
const service=createBillingServer({env:{BILLING_DB_PATH:join(dir,'billing.db'),STRIPE_SECRET_KEY:'sk_test_fixture',STRIPE_PRICE_LIFETIME:'price_fixture',BILLING_PUBLIC_URL:'http://127.0.0.1',LEAD_CACHE_ENABLED:'1',LEAD_CACHE_SERVE:'1'},fetch:async()=>({ok:true,json:async()=>({id:'price_fixture',currency:'pkr',unit_amount:1000000,active:true,livemode:false,type:'one_time'})})})
await new Promise(r=>service.server.listen(0,'127.0.0.1',r))
const base='http://127.0.0.1:'+service.server.address().port,device='a'.repeat(64)
const call=async(path,body,token,withDevice=true)=>{
 const response=await fetch(base+path,{method:'POST',headers:{'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{}),...(withDevice?{'x-nafran-device-id':device,'x-nafran-device-platform':'Windows x64'}:{})},body:JSON.stringify(body)})
 return {status:response.status,body:await response.json()}
}
let admin
try{
 const token=(await call('/v1/installations',{})).body.token
 assert.ok(token)
 const query={keyword:'dentist',location:'Lahore',region:'pk',language:'en',cacheKey:cacheKeyFor('dentist','Lahore','pk','en')}
 const input={keyVersion:'v1',queries:[query],limitPerQuery:8,runId:'run-http'}
 assert.equal((await call('/v1/lead-cache/lookup',input)).status,401)
 assert.equal((await call('/v1/lead-cache/lookup',input,token)).status,403)
 const id=service.db.prepare('select id from installations').get().id,now=new Date().toISOString()
 service.db.prepare('insert into trial_licenses(id,installation_id,key_hash,key_last4,email,created_at,sent_at,activated_at,expires_at,bound_installation_id) values(?,?,?,?,?,?,?,?,?,?)').run('trial1',id,'fixturehash','TEST','qa@example.test',now,now,now,new Date(Date.now()+86400000).toISOString(),id)
 service.db.prepare('update installations set license_id=? where id=?').run('trial1',id)
 const reservation=await call('/v1/maps/reserve',{requested:8},token)
 assert.equal(reservation.status,200,JSON.stringify(reservation.body))
 input.reservationId=reservation.body.reservationId
 assert.equal((await call('/v1/lead-cache/lookup',input,token,false)).status,403)
 const good=await call('/v1/lead-cache/lookup',input,token)
 assert.equal(good.status,200,JSON.stringify(good.body))
 assert.equal(good.body.enabled,true)
 assert.equal((await call('/v1/lead-cache/lookup',{...input,queries:[{...query,cacheKey:'x'}]},token)).status,400)
 assert.equal((await call('/v1/lead-cache/contribute',{keyVersion:'v1',runId:'forged',query,places:[]},token)).status,403)
 const keyFile=join(dir,'admin-key');writeFileSync(keyFile,'c'.repeat(64))
 admin=createLicenseAdminServer(service.db,{keyFile,cacheStore:createSqliteLeadCacheStore(service.db)})
 await new Promise(r=>admin.listen(0,'127.0.0.1',r))
 const stats='http://127.0.0.1:'+admin.address().port+'/v1/admin/lead-cache/stats'
 assert.equal((await fetch(stats)).status,401)
 assert.equal((await fetch(stats,{headers:{authorization:'Bearer '+token}})).status,401)
 const owner=await fetch(stats,{headers:{authorization:'Bearer '+'c'.repeat(64)}})
 assert.equal(owner.status,200);assert.equal((await owner.json()).lookups,1)
 console.log('PASS actual billing HTTP: installation/device/active-trial guards, quota receipt, strict key, unlicensed rejection, private owner-only statistics')
}finally{
 if(admin)await new Promise(r=>admin.close(r))
 await new Promise(r=>service.server.close(r));service.db.close()
}
