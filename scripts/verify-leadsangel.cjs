const assert = require('node:assert/strict')
const { mkdtempSync, writeFileSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const { zipSync, strToU8 } = require('fflate')
const {
  readLeadsAngelBundle,
  parseLeadsAngelResult,
  verifyEmailAddressesWithLeadsAngel,
} = require('../dist-electron/leadsangel.js')

async function main() {
  const credentials = { licenseKey: 'TEST-LICENSE-123', deviceId: 'TEST-DEVICE-123', expiresOn: '2026-10-31' }
  const archive = zipSync({
    'verify.sh': strToU8(`curl -d '{"license_key":"${credentials.licenseKey}","device_id":"${credentials.deviceId}"}'`),
    'README.txt': strToU8('Expires: 2026-10-31'),
    'ignored.txt': strToU8('No executable files are run during import.'),
  })
  const file = join(mkdtempSync(join(tmpdir(), 'leadsangel-unit-')), 'bundle.zip')
  writeFileSync(file, archive)
  assert.deepEqual(readLeadsAngelBundle(file), credentials)
  assert.equal(parseLeadsAngelResult('A@EXAMPLE.COM', { status: 'safe', score: 92 }).status, 'valid')
  assert.equal(parseLeadsAngelResult('a@example.com', { status: 'unsafe', reason: 'recipient_rejected' }).status, 'invalid')
  assert.equal(parseLeadsAngelResult('a@example.com', { status: 'unsafe', reason: 'smtp_timeout' }).status, 'unknown')

  const originalFetch = global.fetch
  const calls = []
  global.fetch = async (url, options) => {
    const path = new URL(url).pathname.split('/').at(-1)
    const body = JSON.parse(options.body)
    assert.equal(body.license_key, credentials.licenseKey)
    assert.equal(body.device_id, credentials.deviceId)
    calls.push(path)
    const payload = path === 'verify'
      ? { id: 'test-job-12345678', status: 'queued' }
      : path === 'status'
        ? { status: 'completed', succeeded: 2 }
        : { items: [
          { email: 'yes@example.com', status: 'done', result: { status: 'safe', score: 92 } },
          { email: 'no@example.com', status: 'done', result: { status: 'unsafe', reason: 'recipient_rejected' } },
        ] }
    return new Response(JSON.stringify(payload), { status: 200, headers: { 'content-type': 'application/json' } })
  }
  try {
    const results = await verifyEmailAddressesWithLeadsAngel(credentials, ['yes@example.com', 'no@example.com'], new AbortController().signal)
    assert.deepEqual(calls, ['verify', 'status', 'results'])
    assert.deepEqual(results.map((result) => [result.email, result.status]), [
      ['yes@example.com', 'valid'], ['no@example.com', 'invalid'],
    ])
  } finally {
    global.fetch = originalFetch
  }
  console.log('PASS  LeadsAngel ZIP import, verdict mapping, async job polling')

  let polls=0;const streamed=[]
  global.fetch=async(url)=>{
    const path=new URL(url).pathname.split('/').at(-1)
    if(path==='verify')return Response.json({id:'stream-job-12345678',status:'queued'})
    if(path==='status'){polls++;return Response.json({status:polls===1?'running':'completed',succeeded:polls===1?1:2})}
    return Response.json({items:[{email:'yes@example.com',status:'done',result:{status:'safe'}},...(polls>1?[{email:'no@example.com',status:'done',result:{status:'unsafe',reason:'recipient_rejected'}}]:[]),{email:'unrequested@example.com',status:'done',result:{status:'safe'}}]})
  }
  try{
    const result=await verifyEmailAddressesWithLeadsAngel(credentials,['yes@example.com','no@example.com'],new AbortController().signal,undefined,rows=>{streamed.push(...rows.map(row=>({email:row.email,beforeComplete:polls===1})))})
    assert.equal(result.length,2);assert.deepEqual(streamed,[{email:'yes@example.com',beforeComplete:true},{email:'no@example.com',beforeComplete:false}]);assert.equal(polls,2)
    console.log('PASS  partial SMTP results delivered early, deduplicated and scoped to requested addresses')
  }finally{global.fetch=originalFetch}
}

main().catch((error) => { console.error(error); process.exitCode = 1 })
