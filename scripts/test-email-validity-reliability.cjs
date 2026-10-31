const test = require('node:test')
const assert = require('node:assert/strict')
const {precheckEmail,isRoleEmail,isDisposableDomain}=require('../dist-electron/email-precheck.js')
test('temporary inboxes and typos are rejected before DNS or paid provider work',async()=>{
 const dns={resolveMx:async()=>{throw new Error('DNS must not be called')},cancel(){}}
 for(const email of ['x@mailinator.com','a@guerrillamail.com','b@10minutemail.com','c@sub.yopmail.com']){
  const r=await precheckEmail(email,undefined,dns);assert.equal(r.status,'risky');assert.match(r.message,/Disposable/);assert.equal(r.provider,'local')
 }
 for(const domain of ['yahooo.com','gmal.com','gmail.co','gmail.con','hotmal.com','outlok.com']){const r=await precheckEmail('a@'+domain,undefined,dns);assert.equal(r.status,'risky');assert.match(r.message,/Did you mean/)}
 assert.equal(isDisposableDomain('mailinator.com.realbusiness.com'),false)
 assert.equal(await precheckEmail('john@gmail.com',undefined,{resolveMx:async()=>[{exchange:'mx.gmail.com',priority:10}],cancel(){}}),null)
})
test('role addresses include regional variants, never ordinary personal names',()=>{
 for(const name of ['dispatch','service','bookings','reservations','orders','marketing','accounts','hr','hello-austin','info.pk'])assert.equal(isRoleEmail(name+'@x.com'),true,name)
 assert.equal(isRoleEmail('john.smith@x.com'),false)
})
const {
  EmailVerificationError,
  runEmailVerificationBatches,
  verifyEmailAddressesWithApify,
} = require('../dist-electron/email-verifier.js')

const result = (email) => ({ email, status: 'valid', verified: true, score: 95, message: 'Accepted', provider: 'apify' })

test('timeout retries the batch, then splits it and saves each address once', async () => {
  const emails = Array.from({ length: 25 }, (_, index) => `person${index}@example.com`)
  const saved = []
  const batches = []
  const outcome = await runEmailVerificationBatches(emails, async (batch) => {
    batches.push(batch)
    if (batch.length === 10 && batch[0] === emails[0]) throw new EmailVerificationError('TIMED-OUT', true)
    return batch.map(result)
  }, {
    signal: new AbortController().signal,
    onResult: (row) => saved.push(row.email),
    onProgress: () => undefined,
    retryDelayMs: 0,
  })
  assert.equal(saved.length, 25)
  assert.equal(new Set(saved).size, 25)
  assert.equal(outcome.failed.length, 0)
  assert.deepEqual(batches.slice(0, 4).map((batch) => batch.length), [10, 10, 5, 10])
  assert.ok(batches.some((batch) => batch.length === 5))
  assert.ok(batches.every((batch) => batch.length <= 10))
})

test('a persistently failed address stays out of results for the next pass', async () => {
  const saved = []
  const emails = ['one@example.com', 'bad@example.com', 'three@example.com']
  const outcome = await runEmailVerificationBatches(emails, async (batch) => {
    if (batch.includes('bad@example.com')) throw new EmailVerificationError('TIMED-OUT', true)
    return batch.map(result)
  }, {
    signal: new AbortController().signal,
    onResult: (row) => saved.push(row.email),
    onProgress: () => undefined,
    retryDelayMs: 0,
  })
  assert.deepEqual(outcome.failed, ['bad@example.com'])
  assert.deepEqual(saved.sort(), ['one@example.com', 'three@example.com'])
})

test('missing actor rows are requeued without rechecking returned rows', async () => {
  const seen = []
  const saved = []
  await runEmailVerificationBatches(['one@example.com', 'two@example.com'], async (batch) => {
    seen.push(batch)
    return seen.length === 1 ? [result('one@example.com')] : batch.map(result)
  }, {
    signal: new AbortController().signal,
    onResult: (row) => saved.push(row.email),
    onProgress: () => undefined,
    retryDelayMs: 0,
  })
  assert.deepEqual(seen, [['one@example.com', 'two@example.com'], ['two@example.com']])
  assert.deepEqual(saved, ['one@example.com', 'two@example.com'])
})

test('cancel aborts the active batch and keeps completed results', async () => {
  const controller = new AbortController()
  const saved = []
  const outcome = await runEmailVerificationBatches(
    ['one@example.com', 'two@example.com', 'three@example.com'],
    async (batch) => {
      if (batch[0] === 'one@example.com') return batch.map(result)
      controller.abort()
      throw new DOMException('Cancelled', 'AbortError')
    },
    {
      signal: controller.signal,
      batchSize: 1,
      onResult: (row) => saved.push(row.email),
      onProgress: () => undefined,
      retryDelayMs: 0,
    },
  )
  assert.equal(outcome.cancelled, true)
  assert.deepEqual(saved, ['one@example.com'])
})

test('actor timeout responses are retryable, authentication failures are not', async () => {
  const originalFetch = global.fetch
  try {
    global.fetch = async () => Response.json({ error: { message: 'Actor run TIMED-OUT' } }, { status: 408 })
    await assert.rejects(
      verifyEmailAddressesWithApify('test-token', ['one@example.com']),
      (error) => error instanceof EmailVerificationError && error.retryable && /TIMED-OUT/.test(error.message),
    )
    global.fetch = async () => Response.json({ error: { message: 'Invalid token' } }, { status: 401 })
    await assert.rejects(
      verifyEmailAddressesWithApify('test-token', ['one@example.com']),
      (error) => error instanceof EmailVerificationError && !error.retryable,
    )
  } finally {
    global.fetch = originalFetch
  }
})

test('invalid actor configuration and database save failures do not trigger retries', async () => {
  await assert.rejects(
    verifyEmailAddressesWithApify('test-token', ['one@example.com'], 'invalid-actor'),
    (error) => error instanceof EmailVerificationError && !error.retryable,
  )
  let calls = 0
  await assert.rejects(
    runEmailVerificationBatches(['one@example.com'], async (batch) => {
      calls += 1
      return batch.map(result)
    }, {
      signal: new AbortController().signal,
      onResult: () => { throw new Error('database unavailable') },
      onProgress: () => undefined,
      retryDelayMs: 0,
    }),
    /database unavailable/,
  )
  assert.equal(calls, 1)
})
