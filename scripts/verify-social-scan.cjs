// Focused Electron smoke test for the website scan result: it checks the two user-visible promises
// that are easy to regress — the Profiles card is brought into view, and only the pasted URLs stay
// in the table until the user asks to show all leads.
const { _electron } = require('playwright')
const { DatabaseSync } = require('node:sqlite')
const { mkdtempSync, mkdirSync, copyFileSync, existsSync, rmSync } = require('node:fs')
const { join } = require('node:path')
const { tmpdir } = require('node:os')

const APP = process.cwd()
const REAL_DATA = join(process.env.APPDATA ?? '', 'nafran-leads-scraper')
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const checks = []
function check(name, ok, detail = '') {
  checks.push(ok)
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (detail ? ' · ' + detail : ''))
}

async function main() {
  const root = mkdtempSync(join(tmpdir(), 'leadmap-social-scan-'))
  const userData = join(root, 'userdata')
  mkdirSync(userData, { recursive: true })
  for (const name of ['leads.db', 'leads.db-wal', 'leads.db-shm']) {
    const source = join(REAL_DATA, name)
    if (existsSync(source)) copyFileSync(source, join(userData, name))
  }
  // Keep this smoke test about the submitted scan, not old work left in the user's queue.
  const sqlite = new DatabaseSync(join(userData, 'leads.db'))
  sqlite.exec("update enrichment_jobs set status = 'done' where status in ('queued', 'running')")
  sqlite.close()

  const app = await _electron.launch({
    args: ['.', '--user-data-dir=' + userData],
    cwd: APP,
    env: { ...process.env, LEADSNAP_TEST_HOOKS: '1' },
    timeout: 60000,
  })
  try {
    const page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')
    await page.waitForSelector('[data-view="dashboard"]', { timeout: 30000 })
    await page.click('[data-view="social"]')
    await sleep(1800)

    await page.locator('[data-socimpopen="1"]').first().dispatchEvent('click')
    await sleep(400)
    await page.fill('[data-socimpinput="1"]', 'example.com')
    await sleep(500)
    await page.locator('[data-socimpgo="1"]').dispatchEvent('click')

    for (let attempt = 0; attempt < 120; attempt += 1) {
      if (!(await page.locator('[data-scanscrim="1"]').count())) break
      await sleep(500)
    }
    const scanResult = await page.evaluate(() => {
      const card = document.querySelector('[data-profcard="1"]')
      const list = document.querySelector('[data-soclist="1"]')
      return {
        panelClosed: !document.querySelector('[data-scanscrim="1"]'),
        profilesInView: Boolean(card) && card.getBoundingClientRect().top < window.innerHeight * 0.7,
        rows: list?.querySelectorAll('[data-row="1"]').length ?? 0,
      }
    })
    check('scan closes in Electron', scanResult.panelClosed)
    check('completed scan scrolls to Profiles', scanResult.profilesInView)
    check('scan table contains only the pasted website', scanResult.rows === 1, scanResult.rows + ' row(s)')

    const before = await page.locator('[data-soclist="1"] [data-row="1"]').count()
    await page.locator('[data-exitscan="1"]').dispatchEvent('click')
    await sleep(500)
    await page.locator('[data-socimpopen="1"]').first().dispatchEvent('click')
    await sleep(300)
    await page.fill('[data-socimpinput="1"]', 'https://www.instagram.com/haslaw\nhttps://www.facebook.com/dylegalconsultants')
    await sleep(500)
    await page.locator('[data-socimpgo="1"]').dispatchEvent('click')
    await sleep(1200)
    const imported = await page.locator('[data-soclist="1"] [data-row="1"]').count()
    check('profile import narrows the table to its two URLs', imported === 2, imported + ' rows (before: ' + before + ')')
    await page.locator('[data-exitscan="1"]').dispatchEvent('click')
    await sleep(600)
    check('Show all leads restores the full table', (await page.locator('[data-soclist="1"] [data-row="1"]').count()) > imported)
  } finally {
    await Promise.race([app.close(), sleep(3000)])
    try { rmSync(root, { recursive: true, force: true }) } catch {}
  }

  const failed = checks.filter((value) => !value).length
  console.log((checks.length - failed) + '/' + checks.length + ' checks passed')
  process.exit(failed ? 1 : 0)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
