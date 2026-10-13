// Drives the Social Profiles export in a real Electron window. Set
// LEADSNAP_PACKAGED_EXECUTABLE to smoke-test the packaged Windows app.
const { _electron } = require('playwright')
const ExcelJS = require('exceljs')
const { PDFDocument } = require('pdf-lib')
const { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync } = require('node:fs')
const { basename, join, resolve, sep } = require('node:path')
const { tmpdir } = require('node:os')

const APP = process.cwd()
const packagedExecutable = process.env.LEADSNAP_PACKAGED_EXECUTABLE
const root = mkdtempSync(join(tmpdir(), 'leadsnap-profile-export-'))
const userData = join(root, 'userdata')
const xlsxPath = join(root, 'social-profiles.xlsx')
const pdfPath = join(root, 'social-profiles.pdf')
const checks = []
mkdirSync(userData, { recursive: true })

function check(name, ok, detail = '') {
  checks.push(ok)
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` · ${detail}` : ''}`)
}

async function waitForFile(path) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (existsSync(path)) return true
    await new Promise((done) => setTimeout(done, 100))
  }
  return false
}

async function main() {
  const options = {
    args: packagedExecutable ? [`--user-data-dir=${userData}`] : ['.', `--user-data-dir=${userData}`],
    cwd: APP,
    env: { ...process.env, LEADSNAP_TEST_HOOKS: '1' },
    timeout: 60000,
  }
  if (packagedExecutable) options.executablePath = packagedExecutable
  const app = await _electron.launch(options)
  try {
    const page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')
    await page.waitForSelector('[data-view="dashboard"]', { timeout: 30000 })

    const seeded = await page.evaluate(async () => {
      const imported = await window.desktop.local.imports.websites(['profile-export.invalid'])
      const id = imported.leadIds[0]
      await window.desktop.local.social.upsert({
        leadId: id,
        platform: 'instagram',
        handle: 'profileexport',
        profileUrl: 'https://www.instagram.com/profileexport',
        source: 'manual',
      })
      return { added: imported.added, id }
    })
    check('test lead and profile saved', seeded.added === 1 && Boolean(seeded.id))

    await page.click('[data-view="social"]')
    await page.locator('[data-socrefresh="1"]').click()
    await page.waitForSelector('[data-soclist="1"] a[data-social-profile-link]', { timeout: 15000 })
    const exportButton = page.locator('[data-profcard="1"]').locator('xpath=ancestor::section[1]').getByRole('button', { name: 'Export', exact: true })

    await exportButton.click()
    await app.evaluate(({ dialog }) => {
      dialog.showSaveDialog = async () => ({ canceled: true })
    })
    await page.locator('[data-profile-export="xlsx"]').click()
    await page.waitForTimeout(250)
    const cancelledHistory = await page.evaluate(() => window.desktop.local.exports.list())
    check('cancelled save keeps modal open and writes no history', await page.locator('[data-profile-export="xlsx"]').isVisible() && cancelledHistory.length === 0)

    await app.evaluate(({ dialog }, path) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: path })
    }, xlsxPath)
    await page.locator('[data-profile-export="xlsx"]').click()
    check('Excel file written', await waitForFile(xlsxPath))
    if (existsSync(xlsxPath)) {
      const workbook = new ExcelJS.Workbook()
      await workbook.xlsx.readFile(xlsxPath)
      const values = JSON.stringify(workbook.worksheets[0]?.getSheetValues() ?? [])
      check('Excel contains the saved profile and business', values.includes('profile-export.invalid') && values.includes('instagram.com/profileexport'))
    }

    await exportButton.click()
    await app.evaluate(({ dialog }, path) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: path })
    }, pdfPath)
    await page.locator('[data-profile-export="pdf"]').click()
    check('PDF file written', await waitForFile(pdfPath))
    if (existsSync(pdfPath)) {
      const bytes = readFileSync(pdfPath)
      const pdf = await PDFDocument.load(bytes)
      check('PDF has a valid header and page', bytes.subarray(0, 5).toString() === '%PDF-' && pdf.getPageCount() >= 1)
    }

    const history = await page.evaluate(() => window.desktop.local.exports.list())
    check('both profile downloads appear in export history', history.length === 2 && history.every((row) => row.kind === 'profiles') && history.some((row) => row.file_name === 'social-profiles.xlsx') && history.some((row) => row.file_name === 'social-profiles.pdf'))
  } finally {
    await Promise.race([app.close(), new Promise((done) => setTimeout(done, 3000))])
    const safeRoot = realpathSync(root)
    if (safeRoot.startsWith(resolve(tmpdir()) + sep) && basename(safeRoot).startsWith('leadsnap-profile-export-')) {
      try { rmSync(safeRoot, { recursive: true, force: true }) } catch {}
    }
  }

  const failed = checks.filter((ok) => !ok).length
  console.log(`profile export checks: ${checks.length - failed}/${checks.length} passed${packagedExecutable ? ' (packaged app)' : ''}`)
  if (failed) process.exitCode = 1
}

main().catch((error) => {
  console.error('profile export verification failed:', error.message)
  process.exitCode = 1
})
