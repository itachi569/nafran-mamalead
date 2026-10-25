// Isolated end-to-end audit: real Electron/SQLite/billing code, local fixture websites and AI.
// No customer records, real payment, provider credits or production deployment are used.
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createServer } from 'node:http'
import { _electron as electron } from 'playwright'
import ExcelJS from 'exceljs'
import { PDFDocument } from 'pdf-lib'
import { createBillingServer } from '../billing-server/server.mjs'

const directory = mkdtempSync(join(tmpdir(), 'mamalead-audit-'))
const packaged = process.env.NAFRAN_TEST_PACKAGED === '1'
const sent = [], errors = [], providerRequests = []
const nativeFetch = globalThis.fetch
globalThis.fetch = async (input, init) => {
  if (String(input).startsWith('https://api.cerebras.ai/')) {
    providerRequests.push(JSON.parse(init.body))
    return Response.json({ choices: [{ message: { content: 'Audit AI ready. Import a website to find its published contact details.' } }] })
  }
  return nativeFetch(input, init)
}
const service = createBillingServer({
  env: { STRIPE_SECRET_KEY: 'sk_test_audit', STRIPE_PRICE_LIFETIME: 'price_lifetime', BILLING_DB_PATH: join(directory, 'billing.db'), BILLING_PORT: '0', BILLING_PUBLIC_URL: 'http://127.0.0.1:38747', DOWNLOAD_SIGNING_KEY: 'audit-only-signing-secret-1234567890123', CEREBRAS_API_KEY: 'audit-only-not-a-real-provider-key' },
  fetch: async url => { assert.match(url, /\/prices\/price_lifetime$/); return { ok: true, json: async () => ({ active: true, currency: 'pkr', unit_amount: 1000000, recurring: null }) } },
  sendEmail: async message => { sent.push(message); return true },
})
const fixture = createServer((req, res) => {
  res.setHeader('content-type', 'text/html')
  res.end(`<html><body><h1>Audit Clinic</h1><p>Clifton, Karachi</p><a href="mailto:hello@audit.fixture.test">Email</a><a href="tel:+922112345678">Call</a><a href="https://www.facebook.com/profile.php?id=123456789&amp;ref=footer">Facebook</a><script type="application/ld+json">{"sameAs":["https:\\/\\/instagram.com\\/auditclinic\\/"]}</script></body></html>`)
})
let desktop, page
async function launch() {
  const env = { ...process.env, APPDATA: join(directory, 'appdata'), LEADSNAP_BILLING_API_URL: `http://127.0.0.1:${service.server.address().port}`, LEADSNAP_TEST_HOOKS: '1' }
  delete env.ELECTRON_RUN_AS_NODE; delete env.VITE_DEV_SERVER_URL
  desktop = await electron.launch(packaged
    ? { executablePath: resolve('release/win-unpacked/MamaLead.exe'), args: [`--user-data-dir=${join(directory, 'profile')}`], env, timeout: 60000 }
    : { args: ['.', `--user-data-dir=${join(directory, 'profile')}`], cwd: resolve('.'), env, timeout: 60000 })
  await desktop.evaluate(({ shell }, { billing, website }) => {
    shell.openExternal = async () => {}
    const native = globalThis.fetch
    globalThis.fetch = async (input, init) => {
      const url = new URL(String(input))
      if (url.origin === 'https://api.mamalead.com') return native(billing + url.pathname + url.search, init)
      if (url.hostname.endsWith('.fixture.test')) {
        const response = await native(website + url.pathname, init)
        Object.defineProperty(response, 'url', { value: url.href })
        return response
      }
      if (url.hostname === '127.0.0.1') return native(input, init)
      // Auto-enrichment of offline Maps sample URLs must never call external providers.
      return new Response('Fixture has no further contact information', { status: 404 })
    }
  }, { billing: env.LEADSNAP_BILLING_API_URL, website: `http://127.0.0.1:${fixture.address().port}` })
  page = await desktop.firstWindow()
  page.on('pageerror', error => errors.push(error.message))
  await page.locator('[data-view="dashboard"]').waitFor()
}
async function pages(label) {
  for (const view of ['dashboard', 'maps', 'social', 'email', 'phone', 'dm', 'website', 'leads', 'lists', 'runs', 'settings']) {
    await page.click(`[data-view="${view}"]`)
    await page.waitForTimeout(100)
    assert.ok(await page.locator('section[data-card]').count(), `${view} has content`)
    assert.ok((await page.locator('body').innerText()).length > 300)
  }
  console.log(`PASS ${label}: all 11 app pages render`)
}
try {
  await new Promise(done => service.server.listen(0, '127.0.0.1', done))
  await new Promise(done => fixture.listen(0, '127.0.0.1', done))
  await launch()
  await pages('fresh installation')
  await page.click('[data-theme-btn]')
  await page.waitForFunction(() => document.body.dataset.theme === 'dark')
  await pages('dark theme')
  await page.click('[data-theme-btn]')
  await page.waitForFunction(() => document.body.dataset.theme === 'light')
  console.log('PASS light/dark theme toggles across every page')
  await page.evaluate(() => window.desktop.billing.requestTrial('audit@fixture.test'))
  assert.equal(sent.length, 1)
  await page.evaluate(key => window.desktop.billing.activate(key), sent[0].licenseKey)
  assert.equal((await page.evaluate(() => window.desktop.billing.status())).trial.active, true)
  await page.click('[data-assist="1"]')
  await page.locator('[data-chatinput="1"]').fill('How do I import a website?')
  await page.locator('[data-chatinput="1"]').press('Enter')
  await page.locator('[data-msg="bot"]').filter({ hasText: 'Audit AI ready' }).waitFor({ timeout: 15000 })
  assert.equal(providerRequests.length, 1)
  assert.ok(providerRequests[0].messages.some(message => message.content.includes('serverBilling')))
  await page.getByRole('button', { name: 'Close chat', exact: true }).click()
  console.log('PASS server AI: desktop → authenticated local server → mocked provider → chat answer')

  for (const view of ['social', 'email', 'phone', 'website']) {
    await page.click(`[data-view="${view}"]`)
    if(view==='website') {
      await page.getByLabel('Websites to look up').fill(`${view}.fixture.test`)
      await page.getByRole('button',{name:'Start lookup',exact:true}).click()
    } else {
      await page.getByRole('button', { name: 'Import websites', exact: true }).first().click()
      await page.locator('[data-imptext="1"]').fill(`${view}.fixture.test`)
      await page.locator('[data-socimpgo="1"]').click()
      await page.locator('[data-impmodal="1"]').waitFor({ state: 'hidden' })
    }
    if (view === 'social') {
      await page.locator('[data-soclist] a[data-social-profile-link*="123456789"]').waitFor({ timeout: 30000 })
      await page.locator('[data-soclist] a[data-social-profile-link*="auditclinic"]').waitFor()
    } else if (view !== 'website') {
      const expected = view === 'email' ? 'hello@audit.fixture.test' : '+922112345678'
      await page.locator(`[data-fres="${view}"]`).locator('xpath=ancestor::section[1]').getByText(expected, { exact: false }).first().waitFor({ timeout: 30000 })
    }
    console.log(`PASS ${view} website import and published results`)
  }
  await page.waitForFunction(async () => { const jobs = await window.desktop.local.jobs.totals(); return jobs.queued === 0 && jobs.running === 0 }, null, { timeout: 60000 })
  const stored = await page.evaluate(() => window.desktop.local.leads.list({ limit: 200 }))
  assert.equal(stored.total, 4)
  const duplicate = await page.evaluate(() => window.desktop.local.imports.websites(['social.fixture.test']))
  assert.equal(duplicate.added, 0)
  console.log('PASS duplicate import keeps one stored business')

  const leadId = stored.rows[0].id
  await page.evaluate(id => window.desktop.local.leads.bookmark(id, true), leadId)
  await page.click('[data-view="lists"]')
  assert.equal(await page.getByRole('button', { name: /Manchester Physio|Skin & Derma|Salford & Quays/ }).count(), 0)
  await page.getByLabel('New list name').fill('Audit saved list')
  await page.getByRole('button', { name: /^Save \d+ leads?/ }).first().click()
  await page.getByRole('heading', { name: 'Audit saved list', exact: true }).waitFor()
  const listId = (await page.evaluate(() => window.desktop.local.lists.list())).find(list => list.name === 'Audit saved list').id
  const listMembers = await page.evaluate(id => window.desktop.local.lists.members(id), listId)
  assert.ok(listMembers.length > 0)
  await page.getByRole('button', { name: /^Save \d+ leads?/ }).first().click()
  assert.deepEqual(await page.evaluate(id => window.desktop.local.lists.members(id), listId), listMembers)
  console.log('PASS bookmark, named list created through UI, real destination counts and duplicate-safe saving')

  // Use real trial accounting and runner with the offline provider, across three area keywords.
  await page.evaluate(() => { window.__auditDone = ''; window.desktop.scraper.onDone(summary => { window.__auditDone = summary.runId }) })
  const run = await page.evaluate(() => window.desktop.scraper.start({ provider: 'mock', query: { keywords: ['dentist Clifton', 'clinic DHA', 'dentist Saddar'], location: 'Karachi', maxResultsPerKeyword: 20, maxResultsTotal: 20 } }))
  await page.waitForFunction(id => window.__auditDone === id, run.runId, { timeout: 20000 })
  const last = await page.evaluate(() => window.desktop.scraper.last())
  assert.equal(last.leads.length, 20); assert.equal(last.query.region, 'pk')
  assert.equal((await page.evaluate(() => window.desktop.billing.status())).mapsLeads.used, 20)
  await page.click('[data-view="runs"]')
  assert.ok((await page.evaluate(() => window.desktop.local.runs.list())).length >= 1)
  console.log('PASS Karachi/three-area run captures and charges exactly 20 leads, persists history')

  for (const format of ['csv', 'xlsx', 'pdf']) {
    const file = join(directory, `audit.${format}`)
    await desktop.evaluate(({ dialog }, filePath) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath }) }, file)
    const result = await page.evaluate(format => window.desktop.local.exports.write({ kind: 'leads', limit: 200, delimiter: ',', columns: ['Business name', 'Domain', 'Phone', 'Email'], fileName: 'audit', format }), format)
    assert.equal(result.rows, 24); assert.ok(existsSync(file))
    if (format === 'csv') assert.ok(readFileSync(file, 'utf8').includes('fixture.test'))
    if (format === 'xlsx') { const book = new ExcelJS.Workbook(); await book.xlsx.readFile(file); assert.equal(book.worksheets[0].getCell('A1').value, 'mamalead') }
    if (format === 'pdf') assert.ok((await PDFDocument.load(readFileSync(file))).getPageCount() >= 1)
  }
  console.log('PASS CSV, Excel and PDF contain all 24 stored businesses')
  // Social export UI uses its own format chooser and must preserve results when save is cancelled.
  await page.click('[data-view="social"]')
  const exportButton = page.locator('[data-profcard]').locator('xpath=ancestor::section[1]').getByRole('button', { name: 'Export', exact: true })
  await exportButton.click()
  await desktop.evaluate(({ dialog }) => { globalThis.__auditCancelSeen = false; dialog.showSaveDialog = async () => { globalThis.__auditCancelSeen = true; return { canceled: true } } })
  await page.locator('[data-profile-export="xlsx"]').click()
  for (let i = 0; i < 100 && !await desktop.evaluate(() => globalThis.__auditCancelSeen); i++) await page.waitForTimeout(100)
  assert.equal(await desktop.evaluate(() => globalThis.__auditCancelSeen), true)
  await page.waitForTimeout(200)
  assert.equal(await page.locator('[data-profile-export="xlsx"]').isVisible(), true)
  for (const format of ['xlsx', 'pdf']) {
    const file = join(directory, `social.${format}`)
    await desktop.evaluate(({ dialog }, filePath) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath }) }, file)
    await page.locator(`[data-profile-export="${format}"]`).click()
    for (let i = 0; i < 100 && !existsSync(file); i++) await page.waitForTimeout(100)
    assert.ok(existsSync(file))
    await page.locator('[data-profile-export-backdrop]').waitFor({ state: 'hidden' })
    if (format === 'xlsx') await exportButton.click()
  }
  console.log('PASS Social Profiles Excel/PDF downloads and cancelled-save handling')
  await pages('populated workspace')
  await page.click('[data-view="dashboard"]')
  await page.screenshot({ path: join(directory, 'dashboard.png') })
  await page.click('[data-view="maps"]')
  await page.screenshot({ path: join(directory, 'maps.png') })
  await desktop.close(); desktop = null
  await launch()
  assert.equal((await page.evaluate(() => window.desktop.local.leads.list())).total, 24)
  assert.equal((await page.evaluate(() => window.desktop.local.exports.list())).length, 5)
  assert.deepEqual(await page.evaluate(id => window.desktop.local.lists.members(id), listId), listMembers)
  assert.equal((await page.evaluate(() => window.desktop.billing.status())).trial.active, true)
  console.log('PASS restart retains leads, list, export history and trial activation')
  await page.evaluate(async ({ listId, leadId }) => { await window.desktop.local.lists.removeLead(listId, leadId); await window.desktop.local.lists.remove(listId) }, { listId, leadId })
  assert.ok(!(await page.evaluate(() => window.desktop.local.lists.list())).some(list => list.id === listId))
  if (!packaged) {
    const contacts = await page.evaluate(async leadId => {
      const ids = []
      for (let i = 0; i < 10; i++) ids.push((await window.desktop.local.contacts.upsert({ leadId, kind: 'email', value: `audit${i}@fixture.test`, source: 'test' })).id)
      return ids
    }, leadId)
    await page.click('[data-view="email"]')
    await page.evaluate(() => window.desktop.test.mockSlowEmailValidity())
    await page.evaluate(ids => { window.__verification = window.desktop.emailValidity.verify({ contactIds: ids }) }, contacts)
    for (let i = 0; i < 100 && (await page.evaluate(() => window.desktop.emailValidity.status())).progress.checked < 1; i++) await page.waitForTimeout(50)
    await page.locator('[data-email-validity-cancel="1"]').click()
    const stopped = await page.evaluate(() => window.__verification)
    assert.equal(stopped.cancelled, true)
    assert.ok(stopped.checked > 0 && stopped.checked < 10)
    await page.evaluate(() => window.desktop.test.mockOneEmailValidity())
    const resumed = await page.evaluate(ids => window.desktop.emailValidity.verify({ contactIds: ids }), contacts)
    assert.equal(resumed.checked, 10 - stopped.checked)
    console.log('PASS email verification progress, cancellation, saved partial results and resume')
  }
  service.db.prepare('update trial_licenses set revoked_at = ?').run(new Date().toISOString())
  const revoked = await page.evaluate(() => window.desktop.scraper.start({ provider: 'mock', query: { keywords: ['clinic'], maxResultsTotal: 1 } }).then(() => 'unexpected success').catch(error => error.message))
  assert.match(revoked, /Activate an active 1-day trial or lifetime/)
  console.log('PASS revoked test licence blocks a new scrape')
  assert.deepEqual(errors, [])
  console.log(`PASS ${packaged ? 'packaged' : 'development'} audit: no renderer errors. Artifacts: ${directory}`)
} catch (error) {
  if (page) { console.error((await page.locator('body').innerText()).slice(-2500)); await page.screenshot({ path: join(directory, 'failure.png') }).catch(() => {}) }
  throw error
} finally {
  if (desktop) await desktop.close()
  service.close(); fixture.close(); globalThis.fetch = nativeFetch
}
