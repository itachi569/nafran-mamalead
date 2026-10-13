// Native Electron smoke test for the design flow shared by Email Finder, Phone Finder,
// and Decision Makers: import one website on the current page, show the finder coverage/result
// cards, scope the list to that URL, and bring the finder list into view when the pass settles.
const { _electron } = require('playwright')
const { mkdtempSync, mkdirSync, copyFileSync, existsSync, rmSync } = require('node:fs')
const { join } = require('node:path')
const { tmpdir } = require('node:os')
const { DatabaseSync } = require('node:sqlite')

const APP = process.cwd()
const REAL_DATA = join(process.env.APPDATA ?? '', 'nafran-leads-scraper')
const results = []

function check(name, ok, detail = '') {
  results.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` · ${detail}` : ''}`)
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function waitFor(page, predicate, timeout = 60000, step = 500) {
  const until = Date.now() + timeout
  while (Date.now() < until) {
    const value = await predicate()
    if (value) return value
    await sleep(step)
  }
  return null
}

function seed(file) {
  const db = new DatabaseSync(file)
  db.exec("delete from enrichment_jobs where status in ('queued', 'running')")
  db.close()
}

async function importOne(page, view, website) {
  const finderList = `[data-flist="${view}"] [data-row="1"]`
  // Email and Phone render their finder rows in the dashboard list. Decision Makers keeps its
  // existing contacts/blockers dashboard cards; the imported scope is represented by its design
  // result card (the `data-scanrow` rows) instead.
  const scopesMainList = view !== 'dm'
  await page.click(`[data-view="${view}"]`)
  await sleep(1200)
  const before = await page.locator(finderList).count()

  const toolbar = page.locator('[data-socbar="1"]')
  await toolbar.locator('button').filter({ hasText: 'Import websites' }).click()
  await page.waitForSelector('[data-impmodal="1"]', { state: 'visible', timeout: 10000 })
  await page.fill('[data-imptext="1"]', website)
  await page.locator('[data-socimpgo="1"]').click()

  const coverage = await waitFor(page, () => page.locator(`[data-fcov="${view}"]`).count(), 30000)
  check(`${view} import opens its coverage card`, Boolean(coverage))
  check(`${view} import renders its result card`, (await page.locator(`[data-fres="${view}"]`).count()) > 0)

  const scoped = scopesMainList
    ? await waitFor(
        page,
        async () => {
          const count = await page.locator(finderList).count()
          return count === 1 ? count : 0
        },
        30000,
      )
    : null
  const resultRowsReady = await waitFor(
    page,
    async () => {
      const count = await page.evaluate(
        (name) => document.querySelector(`[data-fres="${name}"]`)?.closest('section')?.querySelectorAll('[data-scanrow]').length ?? 0,
        view,
      )
      return count === 1 ? count : 0
    },
    30000,
  )
  const details = await page.evaluate(
    ({ view }) => {
      const resultHeading = document.querySelector(`[data-fres="${view}"]`)
      const resultCard = resultHeading?.closest('section')
      const listCard = document.querySelector(`[data-flistcard="${view}"]`)
      const mainRows = Array.from(document.querySelectorAll(`[data-flist="${view}"] [data-row="1"]`))
      return {
        resultRows: resultCard?.querySelectorAll('[data-scanrow]').length ?? 0,
        resultText: resultCard?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 180) ?? '',
        mainRows: mainRows.length,
        mainText: mainRows.map((row) => row.textContent?.replace(/\s+/g, ' ').trim()).join(' | ').slice(0, 220),
        listTop: listCard?.getBoundingClientRect().top ?? 99999,
        viewport: window.innerHeight,
      }
    },
    { view },
  )
  if (scopesMainList) {
    check(`${view} import scopes the main list to the pasted URL`, scoped === 1, `${before} before, ${scoped ?? 0} during`)
  }
  check(`${view} result lists only the pasted URL`, resultRowsReady === 1 && details.resultRows === 1, `${details.resultRows} result rows · ${details.resultText}`)

  // Wait for the page-specific job to settle. The result card remains open, and the designed
  // landing position is the finder list immediately beneath it.
  const settled = await waitFor(
    page,
    async () => {
      const text = await page.evaluate(
        (name) => document.querySelector(`[data-fcov="${name}"]`)?.closest('section')?.textContent ?? '',
        view,
      )
      return /read\.|found|named so far|nothing named/i.test(text ?? '') && !/Reading|Scanning/i.test(text ?? '')
    },
    90000,
  )
  await sleep(900)
  const after = await page.evaluate(
    ({ view }) => {
      const listCard = document.querySelector(`[data-flistcard="${view}"]`)
      return {
        settledText: document.querySelector(`[data-fcov="${view}"]`)?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 160) ?? '',
        rows: document.querySelectorAll(`[data-flist="${view}"] [data-row="1"]`).length,
        top: listCard?.getBoundingClientRect().top ?? 99999,
        viewport: window.innerHeight,
      }
    },
    { view },
  )
  check(`${view} import finishes its own finder pass`, Boolean(settled), after.settledText)
  check(`${view} import scrolls to the finder list`, after.top < after.viewport * 0.85, `top ${Math.round(after.top)} / viewport ${after.viewport}`)

  await page.locator('[data-exitscan="1"]').first().click()
  await sleep(600)
  check(`${view} Show all leads exits the scoped result`, (await page.locator(`[data-fcov="${view}"]`).count()) === 0)
}

async function main() {
  const root = mkdtempSync(join(tmpdir(), 'leadsnap-finder-import-'))
  const userData = join(root, 'userdata')
  mkdirSync(userData, { recursive: true })
  for (const name of ['leads.db', 'leads.db-wal', 'leads.db-shm']) {
    const from = join(REAL_DATA, name)
    if (existsSync(from)) copyFileSync(from, join(userData, name))
  }
  seed(join(userData, 'leads.db'))

  const app = await _electron.launch({
    args: ['.', `--user-data-dir=${userData}`],
    cwd: APP,
    env: { ...process.env, LEADSNAP_TEST_HOOKS: '1' },
    timeout: 60000,
  })
  const page = await app.firstWindow()
  const rendererErrors = []
  page.on('pageerror', (error) => rendererErrors.push(error.message))
  await page.waitForLoadState('domcontentloaded')
  await page.waitForSelector('[data-view="dashboard"]', { timeout: 30000 })
  await sleep(2200)

  await importOne(page, 'email', 'https://example.com')
  await importOne(page, 'phone', 'https://example.org')
  await importOne(page, 'dm', 'https://example.net')

  check('the Electron renderer reported no errors', rendererErrors.length === 0, rendererErrors.slice(0, 3).join(' | '))
  await app.close()
  try {
    rmSync(root, { recursive: true, force: true })
  } catch {
    // A leftover temp folder is not worth failing the checks over.
  }

  const failed = results.filter((result) => !result.ok).length
  console.log('')
  console.log(`${results.length - failed}/${results.length} checks passed`)
  process.exit(failed ? 1 : 0)
}

main().catch((error) => {
  console.error('finder import check failed:', error.message)
  process.exitCode = 1
})
