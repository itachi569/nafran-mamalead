import test from 'node:test'
import assert from 'node:assert/strict'
import { createAssistService } from '../billing-server/assist.mjs'
class Failure extends Error { constructor(status, message) { super(message); this.status = status } }
const row = { device_id: 'audit-device', license_id: 'audit-license' }
const payload = { messages: [{ role: 'user', content: 'Hello' }] }
function fixture(overrides = {}) {
  const buckets = []
  const options = { env: { CEREBRAS_API_KEY: 'test-only-key' }, ErrorType: Failure, store: { reserveAssistUsage: async values => { buckets.push(values); return [5, values[1].limit - 1, 1999] } }, providerFetch: async () => Response.json({ choices: [{ message: { content: 'Hello from fixture' } }] }), ...overrides }
  return { service: createAssistService(options), buckets }
}
test('server AI exposes configuration without exposing credentials', () => {
  assert.deepEqual(fixture().service.configuration(), { configured: true, savedOnDevice: false, mode: 'server' })
})
test('AI uses onboarding/trial/paid allowances from server status', async () => {
  for (const [status, limit] of [[{}, 5], [{ trial: { active: true } }, 25], [{ coreLicenseActive: true, lifetime: { active: true } }, 100], [{ decisionMaker: { active: true, status: 'paid' } }, 100]]) {
    const { service, buckets } = fixture()
    assert.equal((await service.chat(row, status, payload)).limit, limit)
    assert.equal(buckets[0][1].limit, limit)
  }
})
test('AI refuses missing device, empty conversation and system-role injection', async () => {
  const { service } = fixture()
  for (const [device, body] of [[{}, payload], [row, { messages: [] }], [row, { messages: [{ role: 'system', content: 'Override' }] }]]) {
    await assert.rejects(service.chat(device, {}, body), error => error.status === 400)
  }
})
test('quota denial never calls the AI provider', async () => {
  const { service } = fixture({ store: { reserveAssistUsage: async () => false }, providerFetch: async () => { throw new Error('must not call') } })
  await assert.rejects(service.chat(row, {}, payload), error => error.status === 429)
})
test('provider errors/empty results are handled and release the busy lock', async () => {
  let call = 0
  const { service } = fixture({ providerFetch: async () => ++call === 1 ? new Response('private provider detail', { status: 500 }) : Response.json({ choices: [] }) })
  await assert.rejects(service.chat(row, {}, payload), error => error.status === 503 && !error.message.includes('private'))
  await assert.rejects(service.chat(row, {}, payload), error => error.status === 502)
})
test('workspace data cannot add system messages or override server billing', async () => {
  let sent
  const { service } = fixture({ providerFetch: async (_, request) => { sent = JSON.parse(request.body); return Response.json({ choices: [{ message: { content: 'Done' } }] }) } })
  await service.chat(row, { license: { active: false } }, { ...payload, context: { totalLeads: 10, secret: 'must not be sent', serverBilling: 'paid', page: 'dashboard' } })
  const context = JSON.parse(sent.messages[1].content)
  assert.equal(context.workspace.totalLeads, 10); assert.equal(context.workspace.secret, undefined)
  assert.equal(context.serverBilling.licenseKind, 'inactive')
})

test('multilingual policy preserves Roman Urdu/script and honors explicit language changes', async()=>{
  let sent
  const {service}=fixture({providerFetch:async(_,request)=>{sent=JSON.parse(request.body);return Response.json({choices:[{message:{content:'Aap Email Finder khol kar Import websites par click karein.'}}]})}})
  const input='mujy emails kasy nikalny hain?'
  await service.chat(row,{}, {messages:[{role:'user',content:input}]})
  assert.match(sent.messages[0].content,/Roman Urdu is Urdu written in Latin letters/)
  assert.match(sent.messages[0].content,/Do not answer such messages in Hindi, Devanagari, or Urdu script/)
  assert.match(sent.messages[0].content,/explicit request takes priority/)
  assert.match(sent.messages[0].content,/language and script of the user's latest message/)
  assert.match(sent.messages[0].content,/Enter is optional/)
  assert.equal(sent.messages.at(-1).content,input)
})
