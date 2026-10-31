// Exercises database paging and the actual Electron view with a 2,000-lead workspace.
// Run after `npm run build`: node scripts/verify-2000-leads.cjs
const { _electron } = require('playwright')
const { mkdtempSync, mkdirSync } = require('node:fs')
const { join } = require('node:path')
const { tmpdir } = require('node:os')
const { performance } = require('node:perf_hooks')
const { LocalDatabase } = require('../dist-electron/db/local-db.js')
const { Repository } = require('../dist-electron/db/repository.js')
const { buildExport } = require('../dist-electron/export/writer.js')

const results = []
function check(name, ok, detail = '') {
  results.push(ok)
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` · ${detail}` : ''}`)
}

async function main() {
  const root = mkdtempSync(join(tmpdir(), 'leadsnap-2000-'))
  const userData = join(root, 'userdata')
  mkdirSync(userData, { recursive: true })
  const db = new LocalDatabase(join(userData, 'leads.db'))
  const workspace = db.ensureWorkspace()
  const insertLead = db.prepare('insert into leads (id, workspace_id, name, phone, website, area, provider, captured_at) values (?, ?, ?, ?, ?, ?, ?, ?)')
  const insertEmail = db.prepare('insert into lead_contacts (id, lead_id, workspace_id, kind, value, created_at) values (?, ?, ?, ?, ?, ?)')
  const insertSocial = db.prepare('insert into social_profiles (id, workspace_id, lead_id, platform, profile_url, discovered_at, updated_at) values (?, ?, ?, ?, ?, ?, ?)')
  db.transaction(() => {
    for (let number = 1; number <= 2000; number += 1) {
      const id = `scale-${String(number).padStart(4, '0')}`
      const at = new Date(Date.UTC(2026, 0, 1, 0, 0, number)).toISOString()
      insertLead.run(id, workspace.id, `Scale Lead ${String(number).padStart(4, '0')}`, number % 2 === 0 ? `+44 20 ${number}` : '', number % 3 === 0 ? `https://lead-${number}.example.test` : '', 'Manchester', 'chromium-maps', at)
      if (number % 5 === 0) insertEmail.run(`email-${number}`, id, workspace.id, 'email', `hello${number}@example.test`, at)
      if (number % 7 === 0) insertSocial.run(`social-${number}`, workspace.id, id, 'instagram', `https://instagram.com/lead${number}`, at, at)
    }
  })
  const repository = new Repository(db)
  const queryStart = performance.now()
  const first = repository.listLeads(workspace.id, { limit: 200 })
  const last = repository.listLeads(workspace.id, { limit: 20, offset: 1980 })
  const filtered = repository.listLeads(workspace.id, { limit: 200, filter: 'phone' })
  const searched = repository.listLeads(workspace.id, { limit: 20, search: 'Scale Lead 0001' })
  const queryMs = Math.round(performance.now() - queryStart)
  check('database returns a bounded first page and the full count', first.rows.length === 200 && first.total === 2000)
  check('last page reaches the oldest lead', last.rows.length === 20 && last.rows.at(-1)?.name === 'Scale Lead 0001')
  check('filter counts the whole database', filtered.rows.length === 200 && filtered.total === 1000)
  check('search finds a lead beyond the first page', searched.total === 1 && searched.rows[0]?.name === 'Scale Lead 0001')
  check('four database page queries stay responsive', queryMs < 2000, `${queryMs} ms`)
  const phoneSummary = repository.phoneSummary(workspace.id)
  check('Phone Finder totals include leads beyond row 500', phoneSummary.total === 2000 && phoneSummary.reachable === 1000 && phoneSummary.missing === 1000)

  const exportStart = performance.now()
  const exported = buildExport(repository, workspace.id, { kind: 'leads', limit: 2000, delimiter: 'csv', columns: ['Business name'], fileName: 'all-leads.csv' })
  const exportMs = Math.round(performance.now() - exportStart)
  check('all-leads export includes every page', exported.rows === 2000 && exported.body.includes('Scale Lead 0001') && exported.body.includes('Scale Lead 2000'), `${exported.rows} rows · ${exportMs} ms`)
  const phoneExport = buildExport(repository, workspace.id, { kind: 'leads', limit: 1000, delimiter: 'csv', columns: ['Business name'], fileName: 'phone-leads.csv', leadFilter: 'phone' })
  check('filtered export follows database pages', phoneExport.rows === 1000 && phoneExport.body.includes('Scale Lead 2000') && !phoneExport.body.includes('Scale Lead 0001'))
  db.close()

  const launchStart = performance.now()
  const app = await _electron.launch({ args: ['.', `--user-data-dir=${userData}`], cwd: process.cwd(), timeout: 60000 })
  try {
    await app.evaluate(({ipcMain})=>{ipcMain.removeHandler('billing:status');ipcMain.handle('billing:status',()=>({connected:true,coreLicenseActive:true,lifetime:{active:true},license:{active:true,kind:'lifetime'}}))})
    const page = await app.firstWindow()
    await page.reload()
    await app.evaluate(({BrowserWindow})=>{const win=BrowserWindow.getAllWindows()[0];win.show();win.focus()})
    await page.bringToFront()
    await page.waitForSelector('[data-view="dashboard"]', { timeout: 30000 })
    const startupMs = Math.round(performance.now() - launchStart)
    check('2,000-lead app startup stays responsive', startupMs < 20000, `${startupMs} ms`)
    await page.click('[data-view="leads"]')
    await page.waitForFunction(() => document.querySelectorAll('li[data-row="1"]').length === 100, null, { timeout: 10000 })
    check('startup holds only a 100-lead preview', await page.locator('li[data-row="1"]').count() === 100)
    await page.locator('[data-global-search="1"]').fill('Scale Lead 0001')
    await page.locator('[data-global-result="lead"]').first().waitFor({ timeout: 10000 })
    check('global search finds an older database page', /Scale Lead 0001/.test(await page.locator('[data-global-result="lead"]').first().innerText()))
    await page.locator('[data-global-search="1"]').press('ControlOrMeta+a')
    await page.locator('[data-global-search="1"]').press('Backspace')
    await page.click('[data-view="leads"]')
    await page.waitForFunction(() => document.querySelectorAll('li[data-row="1"]').length === 100, null, { timeout: 30000 })
    check('All Leads renders only the first page', await page.locator('li[data-row="1"]').count() === 100)
    check('footer reports the full workspace', /Showing 1–100 of 2000 saved leads/.test(await page.locator('body').innerText()))

    await page.getByRole('button', { name: /Next page/ }).click()
    await page.waitForFunction(() => document.querySelectorAll('li[data-row="1"]').length === 100 && document.body.textContent.includes("Showing 101–200 of 2000"), null, { timeout: 10000 }).catch(async error=>{console.error(JSON.stringify({rows:await page.locator('li[data-row="1"]').count(),body:(await page.locator('body').innerText()).slice(-600)}));throw error})
    check('Next page replaces the bounded database page', await page.locator('li[data-row="1"]').count() === 100)

    await page.locator('[data-leadsearch="1"]').fill('Scale Lead 0001')
    await page.waitForFunction(() => document.querySelectorAll('li[data-row="1"]').length === 1 && document.querySelector('li[data-row="1"]')?.textContent?.includes('Scale Lead 0001'), null, { timeout: 10000 })
    check('UI search reaches an older database page', /Showing 1–1 of 1 matching leads/.test(await page.locator('body').innerText()))

    await page.locator('[data-leadsearch="1"]').press('ControlOrMeta+a')
    await page.locator('[data-leadsearch="1"]').press('Backspace')
    await page.locator('button[data-chip]', { hasText: 'Has phone' }).click()
    await page.waitForFunction(() => document.querySelectorAll('li[data-row="1"]').length === 100 && /Showing 1–100 of 1000 matching leads/.test(document.body.textContent ?? ''), null, { timeout: 10000 })
    check('phone filter counts all 1,000 matches', /Showing 1–100 of 1000 matching leads/.test(await page.locator('body').innerText()))
  } finally {
    await app.close()
  }
  const failed = results.filter((ok) => !ok).length
  console.log(`2,000-lead checks: ${results.length - failed}/${results.length} passed`)
  if (failed) process.exitCode = 1
}

main().catch((error) => { console.error('2,000-lead verification failed:', error); process.exitCode = 1 })
