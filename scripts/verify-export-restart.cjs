// Verifies a real Electron CSV download and that both the lead and export history survive a
// complete app restart. The user-data directory and output file are throwaway.
const { _electron } = require('playwright')
const { existsSync, mkdirSync, mkdtempSync, readFileSync } = require('node:fs')
const { join } = require('node:path')
const { tmpdir } = require('node:os')

const APP = process.cwd()
const packagedExecutable = process.env.LEADSNAP_PACKAGED_EXECUTABLE
const results = []
function check(name, ok, detail = '') {
  results.push(ok)
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` · ${detail}` : ''}`)
}

async function launch(userData) {
  const options = {
    args: packagedExecutable ? [`--user-data-dir=${userData}`] : ['.', `--user-data-dir=${userData}`],
    cwd: APP,
    env: { ...process.env, LEADSNAP_TEST_HOOKS: '1' },
    timeout: 60000,
  }
  if (packagedExecutable) options.executablePath = packagedExecutable
  const app = await _electron.launch(options)
  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  await page.waitForSelector('[data-view="dashboard"]', { timeout: 30000 })
  return { app, page }
}

async function main() {
  const root = mkdtempSync(join(tmpdir(), 'leadsnap-export-restart-'))
  const userData = join(root, 'userdata')
  const exportPath = join(root, 'leads-export.csv')
  mkdirSync(userData, { recursive: true })

  const first = await launch(userData)
  const { app, page } = first

  // Answer the native save dialog from the Electron main process, so the shipped UI path writes a
  // real file instead of only checking that the modal opens.
  await app.evaluate(({ dialog }, path) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: path })
  }, exportPath)

  const imported = await page.evaluate(async () => window.desktop.local.imports.websites(['restart-persistence.example']))
  check('a lead is written before restart', imported.added === 1, `${imported.added} added`)
  await page.waitForTimeout(500)
  const before = await page.evaluate(async () => {
    const leads = await window.desktop.local.leads.list({ limit: 20 })
    return { total: leads.total, id: leads.rows[0]?.id ?? '' }
  })
  check('the lead is readable before restart', before.total === 1 && Boolean(before.id), JSON.stringify(before))

  await page.click('[data-view="leads"]')
  await page.waitForTimeout(700)
  await page.getByRole('button', { name: 'Export all' }).click()
  const modal = page.locator('section').filter({ hasText: 'What to export' }).last()
  check('CSV export modal opens', await modal.isVisible())
  await modal.getByRole('button', { name: 'Download' }).click()
  await page.waitForTimeout(900)

  check('CSV file is written', existsSync(exportPath))
  const csv = existsSync(exportPath) ? readFileSync(exportPath, 'utf8') : ''
  check('CSV contains the selected header', /^Business name,Domain,Phone/.test(csv), csv.split('\n')[0] || '(empty)')
  check('CSV contains the imported lead', /restart-persistence\.example/.test(csv), csv.slice(0, 180))
  const exportsBefore = await page.evaluate(() => window.desktop.local.exports.list())
  check('export history records the download', exportsBefore.length === 1 && exportsBefore[0].file_name === 'leads-export.csv', JSON.stringify(exportsBefore[0] ?? {}))
  await app.close()

  const second = await launch(userData)
  const after = await second.page.evaluate(async () => {
    const leads = await window.desktop.local.leads.list({ limit: 20 })
    const exports = await window.desktop.local.exports.list()
    return { total: leads.total, domain: leads.rows[0]?.website ?? '', exports: exports.length, file: exports[0]?.file_name ?? '' }
  })
  check('lead persists after app restart', after.total === 1 && /restart-persistence\.example/.test(after.domain), JSON.stringify(after))
  check('export history persists after app restart', after.exports === 1 && after.file === 'leads-export.csv', JSON.stringify(after))
  await second.app.close()

  const failed = results.filter((ok) => !ok).length
  console.log(`export/restart checks: ${results.length - failed}/${results.length} passed`)
  if (failed) process.exitCode = 1
}

main().catch((error) => {
  console.error('export/restart verification failed:', error.message)
  process.exitCode = 1
})
