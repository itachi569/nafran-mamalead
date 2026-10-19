// Opens the packaged build itself — not the dev app — on a throwaway profile and photographs two
// pages, so "the new version installs and runs" is something seen rather than assumed.
const { _electron } = require('playwright')
const { mkdtempSync } = require('node:fs')
const { join } = require('node:path')
const { tmpdir } = require('node:os')

const EXE = join(process.cwd(), 'release', 'win-unpacked', 'MamaLead.exe')
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function main() {
  const userData = join(mkdtempSync(join(tmpdir(), 'leadsnap-packaged-')), 'userdata')
  const app = await _electron.launch({
    executablePath: EXE,
    args: [`--user-data-dir=${userData}`],
    timeout: 90000,
  })
  const page = await app.firstWindow()
  await page.setViewportSize({ width: 1500, height: 1000 })
  await page.waitForSelector('[data-view="dashboard"]', { timeout: 45000 })
  await sleep(4000)

  const version = await page.evaluate(() => document.body.innerText.match(/v\d+\.\d+\.\d+/)?.[0] ?? '(none)')
  console.log('page loaded · version shown:', version)
  await page.screenshot({ path: 'shots/packaged-dashboard.png' })

  await page.click('[data-view="leads"]')
  await sleep(1500)
  await page.screenshot({ path: 'shots/packaged-leads.png' })
  console.log('screenshots written')

  await app.close()
}

main().catch((error) => {
  console.error('packaged check failed:', error.message)
  process.exitCode = 1
})
