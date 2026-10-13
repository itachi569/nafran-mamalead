// A one-off look at the app with the real database: screenshots of the pages whose bindings changed.
const { _electron } = require('playwright')
const { mkdtempSync, cpSync, mkdirSync, existsSync } = require('node:fs')
const { join } = require('node:path')
const { tmpdir } = require('node:os')

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const REAL = join(process.env.APPDATA, 'nafran-leads-scraper')

async function main() {
  const root = mkdtempSync(join(tmpdir(), 'leadsnap-shots-'))
  const userData = join(root, 'userdata')
  mkdirSync(userData, { recursive: true })
  for (const file of ['leads.db', 'leads.db-wal', 'leads.db-shm']) {
    const from = join(REAL, file)
    if (existsSync(from)) cpSync(from, join(userData, file))
  }

  const app = await _electron.launch({
    args: ['.', `--user-data-dir=${userData}`],
    cwd: process.cwd(),
    env: { ...process.env, LEADSNAP_TEST_HOOKS: '1' },
    timeout: 90000,
  })
  const page = await app.firstWindow()
  await page.setViewportSize({ width: 1500, height: 1000 })
  await page.waitForSelector('[data-view="dashboard"]', { timeout: 40000 })
  await sleep(4000)

  const shots = [
    ['dashboard', 'dashboard'],
    ['maps', 'maps'],
    ['social', 'social'],
    ['email', 'email'],
    ['phone', 'phone'],
    ['dm', 'dm'],
    ['website', 'website'],
    ['leads', 'leads'],
    ['lists', 'lists'],
    ['runs', 'runs'],
    ['settings', 'settings'],
  ]
  for (const [view, name] of shots) {
    await page.click(`[data-view="${view}"]`)
    await sleep(1800)
    await page.screenshot({ path: 'shots/pages/' + name + '.png' })
    console.log('shot', name)
  }

  // The Maps results card, which is below the fold of that page.
  await page.click('[data-view="maps"]')
  await sleep(1200)
  await page.evaluate(() => {
    const card = Array.from(document.querySelectorAll('h2')).find((node) => node.textContent?.trim() === 'Results')
    card?.scrollIntoView({ block: 'start' })
    window.scrollBy(0, -80)
  })
  await sleep(900)
  await page.screenshot({ path: 'shots/maps-results.png' })
  console.log('shot maps-results')

  // A second Billing shot on the Invoices tab, which no longer lists sample invoices.
  await page.click('[data-view="settings"]')
  await sleep(1200)
  await page.evaluate(() => {
    const tab = Array.from(document.querySelectorAll('button')).find((node) => /^Invoices/.test(node.textContent?.trim() ?? ''))
    if (tab) tab.click()
  })
  await sleep(1000)
  await page.screenshot({ path: 'shots/billing-invoices.png' })
  console.log('shot billing-invoices')

  await app.close()
}

main().catch((error) => {
  console.error('shots failed:', error.message)
  process.exitCode = 1
})
