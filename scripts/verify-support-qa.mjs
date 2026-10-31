// ML-91..98: fixture-only tests, no external mail or database.
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {mkdtempSync,readFileSync,writeFileSync,existsSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {randomUUID} from 'node:crypto'
import * as server from '../billing-server/support-contract.mjs'
import {createNeonSupportStore} from '../billing-server/support-store.mjs'
const require=createRequire(import.meta.url)
const desktop=require('../dist-electron/support-data.js')
const cache=require('../dist-electron/support-cache.js')
const {buildSupportMeta}=require('../dist-electron/support-meta.js')
const ordinary='I re-installed the app and store-locations broke. Pre-activation failed.'
const contact=ordinary+' Please use ali@gmail.com; licence bought with x@y.com. C:\\Users\\Ali Khan\\report.txt'
const secrets=['sk_live_'+'A'.repeat(24),'rk_test_'+'B'.repeat(24),'re_'+'C'.repeat(24),'apify_api_'+'D'.repeat(24),'csk-'+'E'.repeat(24),'NF-ABCD-EFGH-IJKL-MNOP-QRST-UVWX','Bearer '+ 'X'.repeat(32),'https://example.test/help?token=private#code']
const token43='abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ'
const mixedToken='x7Rk2vNm8Qa4Tz9Ls5Wy3Bc6Hd0Ef1Gp2Ju8Ko4Pn6M'
const genericSecrets=[token43,mixedToken,'_'+mixedToken.slice(1,-1)+'-','sk-proj-'+mixedToken,'sk-'+mixedToken]
const benignLong='pneumonoultramicroscopicsilicovolcanoconiosis'
const contactContexts=[mixedToken+'@example.test','https://example.test/'+mixedToken,'C:\\Users\\Ali Khan\\'+mixedToken+'.txt','/home/ali/'+mixedToken+'.csv',benignLong,'SupportInstallationTroubleshootingInstructions']
for(const implementation of [desktop,server]){
 assert.equal(implementation.scrubSupportMessage(contact),contact)
 assert.equal(implementation.scrubSupportText(ordinary),ordinary)
 for(const secret of secrets)assert.notEqual(implementation.scrubSupportMessage(secret),secret)
 const diagnostics=implementation.scrubSupportText(contact)
 assert.ok(!diagnostics.includes('ali@gmail.com')&&!diagnostics.includes('Ali Khan'))
 assert.match(diagnostics,/re-installed/)
 for(const secret of genericSecrets){
  assert.equal(implementation.scrubSupportMessage('my token '+secret),'my token [redacted]')
  assert.equal(implementation.scrubSupportMessage('Value: '+secret),'Value: [redacted]')
 }
 assert.equal(implementation.scrubSupportMessage('token="'+benignLong+'"'),'token="[redacted]"')
 for(const text of contactContexts)assert.equal(implementation.scrubSupportMessage(text),text)
 assert.equal(implementation.scrubSupportMessage('Use '+mixedToken+'@example.test; token '+token43),'Use '+mixedToken+'@example.test; token [redacted]')
}
const value=server.validateSupport({clientMessageId:randomUUID(),name:'',email:'reply@example.test',category:'licence',subject:'Purchase with x@y.com',message:contact+' '+secrets.join(' '),page:'settings:acct',diagnostics:false})
assert.equal(value.subject,'Purchase with x@y.com');assert.ok(value.message.startsWith(contact))
for(const key of secrets.slice(0,7))assert.ok(!value.message.includes(key))
const tokenPayload=server.validateSupport({clientMessageId:randomUUID(),name:'',email:'reply@example.test',category:'bug',subject:'my token '+token43,message:'Please check '+genericSecrets.join(' '),page:'settings:acct',diagnostics:false})
assert.equal(tokenPayload.subject,'my token [redacted]')
for(const token of genericSecrets)assert.ok(!tokenPayload.message.includes(token))
const meta=buildSupportMeta({app:{version:'1.4.25'},diagnostics:true,lastErrors:[{at:new Date().toISOString(),text:contact}],counts:{leads:0,runs:0}})
assert.ok(!JSON.stringify(meta).includes('ali@gmail.com'))
assert.equal(desktop.formatSupportWait(1),'1 second')
assert.equal(desktop.formatSupportWait(2),'2 seconds')
assert.equal(desktop.formatSupportWait(60),'1 min')
assert.equal(desktop.formatSupportWait(80),'1 min 20 s')
assert.equal(desktop.formatSupportWait(3600),'60 min')
assert.equal(desktop.SUPPORT_EMAIL_FALLBACK,server.SUPPORT_EMAIL,'backend and offline default agree')
const dir=mkdtempSync(join(tmpdir(),'mamalead-support-qa-'))
cache.writeSupportConfig(dir,{configured:true,email:'help@example.test',slaText:'Support hours',replyEmail:'private@example.test',token:'never-save'})
assert.deepEqual(cache.readSupportConfig(dir),{configured:false,email:'help@example.test',slaText:'Support hours'})
const saved=readFileSync(join(dir,'support-config.json'),'utf8');assert.ok(!saved.includes('private')&&!saved.includes('never-save'))
cache.writeSupportConfig(dir,{email:'bad\r\naddress',slaText:''})
assert.equal(cache.readSupportConfig(dir).email,'help@example.test')
writeFileSync(join(dir,'support-retry.json'),'{}');cache.clearSupportRetry(dir);assert.equal(existsSync(join(dir,'support-retry.json')),false)
// Neon response contracts: no insert and no matching row is NOT a rate limit.
let limited=false
const sql=()=>Promise.resolve([])
sql.query=async text=>text.startsWith('select count(*)')?[{n:limited?30:0,oldest:new Date().toISOString()}]:[]
sql.transaction=async(_queries,options)=>{assert.equal(options.isolationLevel,'ReadCommitted');return [[],[],[]]}
const neon=createNeonSupportStore(sql),row={id:'ML-S-NEON01',client_message_id:randomUUID(),installation_id:'test-installation',message_hash:'fixture-hash',email:'a@example.test',meta:{},created_at:new Date().toISOString()}
await assert.rejects(neon.reserveSupportMessage(row),e=>e.status===409&&!e.retryAfterSeconds)
limited=true;assert.ok((await neon.reserveSupportMessage(row)).retryAfterSeconds>0)
console.log('PASS ML-91/92/98 scrubbers and secret-safe contact details, metadata isolation, ML-94 cooldown, ML-96 Neon conflict and ML-97 persistent contact config')
