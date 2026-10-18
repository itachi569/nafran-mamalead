import { randomBytes } from 'node:crypto'
import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { _electron as electron } from 'playwright'
import { extractFile, listPackage } from '@electron/asar'

const dir = mkdtempSync(join(tmpdir(), 'nafran-license-gate-'))
const token = randomBytes(32).toString('base64url')
const key = 'NF-TEST-LICENSE-FOR-PACKAGED-APP'
let active = false
let decisionSubscribed = false
let includedDecisionStatus = false
let kind = 'lifetime'
let trialExpiresAt = null
let available = true
let localStatusRequests = 0
const server = createServer(async (req, res) => {
  const reply = (status, body) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)) }
  if (req.url === '/v1/installations' && req.method === 'POST') return reply(201, { token })
  if (req.headers.authorization !== `Bearer ${token}`) return reply(401, { error: 'Invalid installation.' })
  if (req.url === '/v1/status' && req.method === 'GET') {
    localStatusRequests += 1
    if (!available) return reply(503, { error: 'Billing server unavailable.' })
    return reply(200, {
      configured: true, connected: true, mode: 'test',
      lifetime: { amount: 1000000, currency: 'pkr', interval: null, active: active && kind === 'lifetime' },
      trial: { active: active && kind === 'trial' && Date.parse(trialExpiresAt) > Date.now(), expiresAt: trialExpiresAt },
      decisionMaker: includedDecisionStatus
        ? { amount: 100000, currency: 'pkr', interval: null, periodDays: 30, active, status: 'included', includedPeople: 0, monthlyLimit: 1000, monthlyUsed: 0, monthlyRemaining: 1000, renewsAt: new Date(Date.now() + 86_400_000).toISOString() }
        : { amount: 100000, currency: 'pkr', interval: null, periodDays: 30, active: active && kind === 'lifetime' && decisionSubscribed, status: decisionSubscribed ? 'paid' : 'not_subscribed', includedPeople: 0, monthlyLimit: 1000, monthlyUsed: 0, monthlyRemaining: 1000, renewsAt: null },
      license: { active: active && (kind === 'lifetime' || Date.parse(trialExpiresAt) > Date.now()), kind, last4: active ? 'TEST' : undefined, expiresAt: kind === 'trial' ? trialExpiresAt : null },
    })
  }
  if (req.url === '/v1/activate' && req.method === 'POST') {
    let raw = ''
    for await (const chunk of req) raw += chunk
    if (JSON.parse(raw).licenseKey !== key) return reply(401, { error: 'Invalid license.' })
    active = true
    return reply(200, { active: true, last4: 'TEST' })
  }
  return reply(404, { error: 'Not found.' })
})

const check = (label, ok) => { if (!ok) throw new Error(`FAIL ${label}`); console.log(`PASS ${label}`) }
const failure = async (page, action) => page.evaluate(async (name) => {
  try {
    if (name === 'scraper') await window.desktop.scraper.start({ provider: 'invalid', query: {} })
    if (name === 'email') await window.desktop.emailValidity.verify({})
    if (name === 'enrichment') await window.desktop.enrichment.start()
    if (name === 'import') await window.desktop.local.imports.websites([])
    if (name === 'export') await window.desktop.local.exports.write({ kind: 'leads', limit: 1, delimiter: ',', columns: [], fileName: 'test.csv' })
    if (name === 'job') await window.desktop.local.jobs.queue('email', [])
    if (name === 'decision') return (await window.desktop.deep.run()).error || ''
    return ''
  } catch (error) { return String(error?.message || error) }
}, action)

let app
let packaged
try {
  await new Promise((ok, fail) => { server.once('error', fail); server.listen(0, '127.0.0.1', ok) })
  const origin = `http://127.0.0.1:${server.address().port}`
  app = await electron.launch({
    cwd: resolve('.'),
    args: ['.', `--user-data-dir=${join(dir, 'source-profile')}`],
    env: { ...process.env, LEADSNAP_BILLING_API_URL: origin, APPDATA: join(dir, 'appdata') },
    timeout: 90000,
  })
  const page = await app.firstWindow()
  await page.locator('[data-view="settings"]').waitFor({ timeout: 45000 })
  for (const action of ['scraper', 'email', 'enrichment', 'import', 'export', 'job', 'decision']) {
    const message = await failure(page, action)
    check(`no license blocks ${action}`, /Activate an active 1-day trial or lifetime/.test(message) || ['import', 'export', 'decision'].includes(action) && /Activate a Decision Makers or lifetime key/.test(message))
  }
  const activation = await page.evaluate((licenseKey) => window.desktop.billing.activate(licenseKey), key)
  check('valid activation unlocks this installation', activation.active === true)
  const allowed = await page.evaluate(() => window.desktop.enrichment.start())
  check('active license allows enrichment to start', allowed.started === true)
  const imported = await page.evaluate(() => window.desktop.local.imports.websites([]))
  check('active license allows website import', imported.added === 0)
  check('lifetime key without an included or paid period does not unlock Decision Makers', /30-day pass/.test(await failure(page, 'decision')))
  includedDecisionStatus = true
  check('the included first month unlocks Decision Makers', /DataForSEO key/.test(await failure(page, 'decision')))
  includedDecisionStatus = false
  decisionSubscribed = true
  check('the paid Decision Makers pass unlocks its action', /DataForSEO key/.test(await failure(page, 'decision')))
  kind = 'trial'
  trialExpiresAt = new Date(Date.now() + 60_000).toISOString()
  check('1-day trial unlocks enrichment', (await page.evaluate(() => window.desktop.enrichment.start())).started === true)
  check('1-day trial does not include Decision Makers passes', /30-day pass/.test(await failure(page, 'decision')))
  trialExpiresAt = new Date(Date.now() - 1_000).toISOString()
  check('expired trial blocks new scraper actions', /Activate an active 1-day trial or lifetime/.test(await failure(page, 'scraper')))
  kind = 'lifetime'
  active = false
  check('revoked purchase blocks a new scrape', /Activate an active 1-day trial or lifetime/.test(await failure(page, 'scraper')))
  check('revoked purchase blocks enrichment', /Activate an active 1-day trial or lifetime/.test(await failure(page, 'enrichment')))
  available = false
  check('billing outage fails closed', /License verification is unavailable/.test(await failure(page, 'import')))
  await page.locator('[data-view="settings"]').click()
  await page.locator('[data-stab="acct"]').click()
  check('account activation remains accessible', await page.locator('#nafran-license-key').isVisible())
  await app.close()
  app = null

  active = true
  available = true
  const before = localStatusRequests
  packaged = await electron.launch({
    executablePath: resolve('release/win-unpacked/Nafran Leads Scraper.exe'),
    args: [`--user-data-dir=${join(dir, 'packaged-profile')}`],
    env: { ...process.env, LEADSNAP_BILLING_API_URL: origin, APPDATA: join(dir, 'packaged-appdata') },
    timeout: 90000,
  })
  const shippedPage = await packaged.firstWindow()
  await shippedPage.locator('[data-view="settings"]').waitFor({ timeout: 45000 })
  const shippedError = await failure(shippedPage, 'enrichment')
  check('packaged app ignores a forged billing URL override', /License verification is unavailable|Activate an active 1-day trial or lifetime/.test(shippedError) && localStatusRequests === before)
  await shippedPage.locator('[data-view="settings"]').click()
  const archive = resolve('release/win-unpacked/resources/app.asar')
  const rendererPath = listPackage(archive).find((entry) => /dist\\assets\\index-[^\\]+\.js$/.test(entry))
  const renderer = rendererPath ? extractFile(archive, rendererPath.slice(1)).toString('utf8') : ''
  check('packaged app contains the separate Rs 1,000 Decision Makers pass', renderer.includes('1,000 searches for 30 days') && renderer.includes('Rs 1,000'))
  console.log('LICENSE_GATE_PASSED')
} finally {
  if (app) await app.close()
  if (packaged) await packaged.close()
  if (server.listening) await new Promise((ok) => server.close(ok))
  const target = realpathSync(dir)
  const parent = realpathSync(tmpdir())
  if (!target.startsWith(parent + sep) || !target.split(sep).at(-1)?.startsWith('nafran-license-gate-')) throw new Error('Unexpected test directory.')
  rmSync(target, { recursive: true, force: true })
}
