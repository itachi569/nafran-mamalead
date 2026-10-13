// Captures one screenshot per view from the built app, on a throwaway copy of the real data folder
// so the checks see leads to draw and the real database is left alone.
//
//   node scripts/capture-views.cjs [outDir]
const { _electron } = require('playwright')
const { mkdtempSync, mkdirSync, copyFileSync, existsSync } = require('node:fs')
const { join, resolve } = require('node:path')
const { tmpdir } = require('node:os')

const APP = process.cwd()
const REAL_DATA = join(process.env.APPDATA ?? '', 'nafran-leads-scraper')
const OUT = resolve(process.argv[2] ?? join(APP, '.reference', 'shots'))
const VIEWS = process.env.VIEWS
  ? process.env.VIEWS.split(',')
  : ['dashboard', 'maps', 'social', 'email', 'phone', 'dm', 'website', 'leads', 'lists', 'runs', 'settings']

const sleep = (ms) => new Promise((done) => setTimeout(done, ms))

async function main() {
  mkdirSync(OUT, { recursive: true })
  const userData = join(mkdtempSync(join(tmpdir(), 'leadsnap-shots-')), 'userdata')
  mkdirSync(userData, { recursive: true })
  for (const name of ['leads.db', 'leads.db-wal', 'leads.db-shm']) {
    const from = join(REAL_DATA, name)
    if (existsSync(from)) copyFileSync(from, join(userData, name))
  }

  const app = await _electron.launch({
    args: ['.', `--user-data-dir=${userData}`],
    cwd: APP,
    env: { ...process.env, LEADSNAP_TEST_HOOKS: '1' },
    timeout: 60000,
  })
  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  await app.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0]
    window.setContentSize(1440, 1000)
  })
  await page.waitForSelector('[data-view="dashboard"]', { timeout: 30000 })
  await sleep(2000)

  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })

  for (const view of VIEWS) {
    const nav = page.locator(`[data-view="${view}"]`).first()
    if (await nav.count()) {
      await nav.click({ timeout: 5000 }).catch(() => undefined)
      await sleep(1200)
    }
    const file = join(OUT, `port-${view}.png`)
    await page.screenshot({ path: file })
    const heading = await page.evaluate(() => document.querySelector('h1')?.textContent?.trim() ?? '(no h1)')
    console.log(`  ${view} → ${heading}`)
  }

  if (errors.length) console.log('renderer errors:', errors.slice(0, 6).join(' | '))
  await app.close()
  console.log(`shots in ${OUT}`)
}

main().catch((error) => {
  console.error('capture failed:', error.message)
  process.exitCode = 1
})
