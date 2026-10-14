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
let legacyDecisionStatus = false
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
      lifetime: { amount: 3000, currency: 'usd', interval: null, active: active && kind === 'lifetime' },
      trial: { active: active && kind === 'trial' && Date.parse(trialExpiresAt) > Date.now(), expiresAt: trialExpiresAt },
      decisionMaker: legacyDecisionStatus
        ? { amount: 0, currency: 'usd', interval: null, active, status: 'included', includedPeople: 1000 }
        : { amount: 300, currency: 'usd', interval: 'month', active: active && kind === 'lifetime' && decisionSubscribed, status: decisionSubscribed ? 'active' : 'not_subscribed', includedPeople: 0, monthlyLimit: 1000, monthlyUsed: 0, monthlyRemaining: 1000, renewsAt: null },
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
    check(`no license blocks ${action}`, /Activate an active 1-day trial or lifetime/.test(await failure(page, action)))
  }
  const activation = await page.evaluate((licenseKey) => window.desktop.billing.activate(licenseKey), key)
  check('valid activation unlocks this installation', activation.active === true)
  const allowed = await page.evaluate(() => window.desktop.enrichment.start())
  check('active license allows enrichment to start', allowed.started === true)
  const imported = await page.evaluate(() => window.desktop.local.imports.websites([]))
  check('active license allows website import', imported.added === 0)
  check('$30 lifetime key alone does not unlock Decision Makers', /\$3\/month subscription/.test(await failure(page, 'decision')))
  legacyDecisionStatus = true
  check('old included status cannot bypass the monthly subscription', /\$3\/month subscription/.test(await failure(page, 'decision')))
  legacyDecisionStatus = false
  decisionSubscribed = true
  check('the Decision Makers subscription unlocks its action', /DataForSEO key/.test(await failure(page, 'decision')))
  kind = 'trial'
  trialExpiresAt = new Date(Date.now() + 60_000).toISOString()
  check('1-day trial unlocks enrichment', (await page.evaluate(() => window.desktop.enrichment.start())).started === true)
  check('1-day trial does not include the monthly Decision Makers plan', /\$3\/month subscription/.test(await failure(page, 'decision')))
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
  check('packaged app contains the separate $3 monthly plan', renderer.includes('1,000 leads each month') && renderer.includes('$3/month'))
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
