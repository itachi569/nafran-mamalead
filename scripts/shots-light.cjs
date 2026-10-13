// Light-mode screenshots of every page, for the landing page.
//
// The app's own database is copied so the numbers on screen are real, and the theme is forced to
// light before anything is captured — the design's default, but the stored preference could be
// either. Each page is written full-height, in the order a landing page would show them.
const { _electron } = require('playwright')
const { mkdtempSync, cpSync, mkdirSync, existsSync } = require('node:fs')
const { join } = require('node:path')
const { tmpdir } = require('node:os')

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const REAL = join(process.env.APPDATA, 'nafran-leads-scraper')
const OUT = 'shots/light'

const PAGES = [
  ['dashboard', '01-dashboard'],
  ['maps', '02-google-maps'],
  ['social', '03-social-profiles'],
  ['email', '04-email-finder'],
  ['phone', '05-phone-finder'],
  ['dm', '06-decision-makers'],
  ['website', '07-website-lookup'],
  ['leads', '08-all-leads'],
  ['lists', '09-saved-lists'],
  ['runs', '10-run-history'],
  ['settings', '11-settings'],
]

async function main() {
  mkdirSync(OUT, { recursive: true })
  const userData = join(mkdtempSync(join(tmpdir(), 'leadsnap-light-')), 'userdata')
  mkdirSync(userData, { recursive: true })
  for (const file of ['leads.db', 'leads.db-wal', 'leads.db-shm']) {
    if (existsSync(join(REAL, file))) cpSync(join(REAL, file), join(userData, file))
  }

  const app = await _electron.launch({
    args: ['.', `--user-data-dir=${userData}`],
    cwd: process.cwd(),
    env: { ...process.env, LEADSNAP_TEST_HOOKS: '1' },
    timeout: 90000,
  })
  const page = await app.firstWindow()
  await page.setViewportSize({ width: 1440, height: 960 })
  await page.waitForSelector('[data-view="dashboard"]', { timeout: 45000 })

  // Light is the app's default, but the preference is stored: set it and prove it took.
  await page.evaluate(() => localStorage.setItem('ls-theme', 'light'))
  await page.reload()
  await page.waitForSelector('[data-view="dashboard"]', { timeout: 45000 })
  await sleep(4000)

  const theme = await page.evaluate(() => document.body.getAttribute('data-theme'))
  console.log('theme:', theme)
  if (theme !== 'light') throw new Error(`expected the light theme, the page reports "${theme}"`)

  for (const [view, name] of PAGES) {
    await page.click(`[data-view="${view}"]`)
    await sleep(1600)
    await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true })
    console.log('shot', name)
  }

  // Two more the landing page will want: the results table, and the invoices tab that states
  // nothing has been billed.
  await page.click('[data-view="maps"]')
  await sleep(1200)
  await page.evaluate(() => {
    const heading = Array.from(document.querySelectorAll('h2')).find((node) => node.textContent?.trim() === 'Results')
    heading?.scrollIntoView({ block: 'start' })
  })
  await sleep(800)
  await page.screenshot({ path: `${OUT}/02b-maps-results.png`, fullPage: true })
  console.log('shot 02b-maps-results')

  await page.click('[data-view="settings"]')
  await sleep(1200)
  await page.evaluate(() => {
    const tab = Array.from(document.querySelectorAll('button')).find((node) => /^Invoices/.test(node.textContent?.trim() ?? ''))
    tab?.click()
  })
  await sleep(900)
  await page.screenshot({ path: `${OUT}/11b-settings-invoices.png`, fullPage: true })
  console.log('shot 11b-settings-invoices')

  await app.close()
}

main().catch((error) => {
  console.error('light screenshots failed:', error.message)
  process.exitCode = 1
})
