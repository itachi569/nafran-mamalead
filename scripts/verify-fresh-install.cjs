// What a brand-new install looks like: an empty database, every page opened, and every console
// error and unhandled rejection collected.
//
// The suites all run against a copy of the real data folder, so none of them answers the question a
// new user asks — "I just installed this, does it work?" This one does: a throwaway user-data
// directory with nothing in it, every view visited, and anything the renderer complains about
// printed.
//
// Usage: node scripts/verify-fresh-install.cjs
const { _electron } = require('playwright')
const { mkdtempSync, rmSync } = require('node:fs')
const { join } = require('node:path')
const { tmpdir } = require('node:os')

const APP = process.cwd()
const VIEWS = ['dashboard', 'maps', 'social', 'email', 'phone', 'dm', 'website', 'leads', 'lists', 'runs', 'settings']

const results = []
function check(name, ok, detail = '') {
  results.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` · ${detail}` : ''}`)
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function main() {
  const userData = join(mkdtempSync(join(tmpdir(), 'leadsnap-fresh-')), 'userdata')

  const app = await _electron.launch({
    args: ['.', `--user-data-dir=${userData}`],
    cwd: APP,
    env: { ...process.env, LEADSNAP_TEST_HOOKS: '1' },
    timeout: 60000,
  })
  const page = await app.firstWindow()
  const errors = []
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`)
  })

  await page.waitForLoadState('domcontentloaded')
  await page.waitForSelector('[data-view="dashboard"]', { timeout: 30000 })
  await sleep(2500)
  check('a new install opens', true, 'the window loaded')

  // Every page, on an empty database: a page that only works with data in it is a page a new user
  // sees broken. The dashboard is its own case — its heading is the greeting — so it is asked for
  // the cards it draws instead.
  const seen = []
  const claims = []
  for (const view of VIEWS) {
    await page.click(`[data-view="${view}"]`)
    await sleep(1100)
    const state = await page.evaluate(() => ({
      heading: document.querySelector('h1')?.textContent?.trim() ?? '(no heading)',
      cards: document.querySelectorAll('section[data-card="1"]').length,
      body: document.body.innerText.length,
      text: document.body.innerText.replace(/\s+/g, ' '),
    }))
    seen.push(`${view}:${state.heading}`)
    check(`the ${view} page renders with no data`, state.cards > 0 && state.body > 400, `${state.heading} · ${state.cards} cards`)

    // Nothing on this machine yet, so no page may state a figure that only data could produce. The
    // first release shipped the design's own sample numbers on pages the workspace had never filled:
    // "Showing 8 of 128 saved leads", "18 businesses captured this run", "614 Maps scrapes".
    const invented = [
      /\b(?!0\b)\d[\d,]* (?:leads?|businesses|places|runs|profiles|addresses|numbers)\b/i,
      /Showing \d+ of (?!0\b)\d/i,
      /\bof (?!0\b)\d[\d,]* (?:saved leads|results|leads|runs|named)/i,
    ]
    const found = invented.map((pattern) => state.text.match(pattern)?.[0]).filter(Boolean)
    if (found.length) claims.push(`${view}: ${found.join(', ')}`)
  }
  check('no page claims data this machine does not have', claims.length === 0, claims.slice(0, 4).join(' | '))

  // The rail states what this machine holds, and a fresh install holds nothing. A rail left showing
  // the design's sample figures is the first thing a new user would read and the first thing that
  // would be wrong.
  await page.click('[data-view="dashboard"]')
  await sleep(900)
  const rail = await page.evaluate(() => {
    const text = document.body.innerText.replace(/\s+/g, ' ')
    return {
      used: /(\d[\d,]*) of ([\d,]+) Maps scrapes/.exec(text)?.slice(1) ?? [],
      leads: /(\d[\d,]*) leads? on file/.exec(text)?.slice(1) ?? [],
    }
  })
  check('the rail reports nothing used', rail.used[0] === '0', `${rail.used.join(' of ')} scrapes`)
  check('and nothing on file', rail.leads[0] === '0', `${rail.leads[0]} leads`)

  // The empty states have to say what to do, not just be empty.
  await page.click('[data-view="leads"]')
  await sleep(900)
  const leadsEmpty = await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 400))
  check(
    'All Leads explains an empty database',
    /run|scrape|import/i.test(leadsEmpty),
    leadsEmpty.slice(0, 90),
  )

  await page.click('[data-view="lists"]')
  await sleep(900)
  const listsEmpty = await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '))
  check('Saved Lists survives having no lists', listsEmpty.length > 300, `${listsEmpty.length} chars`)

  await page.click('[data-view="runs"]')
  await sleep(900)
  const runsEmpty = await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '))
  check('Run History survives having run nothing', /0|no runs|Nothing/i.test(runsEmpty), runsEmpty.slice(0, 80))

  // Billing is the page a new install can most easily lie on: its meters, its invoices and its
  // cards were all sample figures in the design.
  await page.click('[data-view="settings"]')
  await sleep(900)
  const billing = await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '))
  const meters = await page.locator('[data-settings="1"]').innerText()
  check('the usage meter states this workspace’s own usage', /0 of 2,000 Maps scrapes/.test(meters), meters.replace(/\s+/g, ' ').slice(0, 130))
  check('and no page carries the design’s sample figures', !/614|742|496|\b210\b|546/.test(billing), billing.slice(0, 100))

  await page.evaluate(() => {
    const tab = Array.from(document.querySelectorAll('button')).find((node) => /^Invoices/.test(node.textContent?.trim() ?? ''))
    if (tab) tab.click()
  })
  await sleep(700)
  const invoices = await page.evaluate(() => (document.querySelector('main') ?? document.body).innerText.replace(/\s+/g, ' '))
  check(
    'and the invoice table claims no charge',
    /No invoices/.test(invoices) && !/INV-\d|£39\.00|Visa/.test(invoices),
    invoices.slice(-160),
  )

  // A write, on an empty database: the first thing a new user does is paste something in.
  await page.click('[data-view="website"]')
  await sleep(900)
  await page.locator('button', { hasText: 'Import websites' }).first().dispatchEvent('click')
  await sleep(800)
  const modal = await page.evaluate(() => Boolean(document.querySelector('[data-socimp="1"]')))
  check('the import modal opens on a new install', modal)
  await page.fill('[data-socimpinput="1"]', 'fresh-install-check.co.uk')
  await sleep(600)
  const label = ((await page.textContent('[data-socimpgo="1"]')) ?? '').trim()
  check('and counts what was pasted', /Scan 1 site/.test(label), label)
  await page.locator('[data-socimpgo="1"]').dispatchEvent('click')
  await sleep(2500)
  const wrote = await page.evaluate(() => {
    const node = Array.from(document.querySelectorAll('div')).find((entry) => getComputedStyle(entry).zIndex === '110')
    return (node?.textContent ?? '').trim().slice(0, 120)
  })
  check('and writes the first lead', /imported|queued/i.test(wrote), wrote)

  await page.click('[data-view="leads"]')
  await sleep(1500)
  const firstLead = await page.evaluate(() => {
    const text = document.body.innerText.replace(/\s+/g, ' ')
    const rows = Array.from(document.querySelectorAll('li[data-row]'))
    return {
      rows: rows.length,
      rowText: (rows[0]?.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 80),
      domain: /fresh-install-check\.co\.uk/i.test(text),
      footer: /Showing \d+ of \d+ saved leads/.exec(text)?.[0] ?? '',
    }
  })
  check(
    'the first lead is on the page',
    firstLead.rows > 0 && firstLead.domain,
    `${firstLead.rows} rows · ${firstLead.footer} · ${firstLead.rowText}`,
  )

  check('the renderer reported no errors', errors.length === 0, errors.slice(0, 3).join(' | '))

  await app.close()
  try {
    rmSync(userData, { recursive: true, force: true })
  } catch {
    // A leftover temp folder is not worth failing the checks over.
  }

  const failed = results.filter((result) => !result.ok).length
  console.log('')
  console.log(`${results.length - failed}/${results.length} checks passed`)
  process.exit(failed ? 1 : 0)
}

main().catch((error) => {
  console.error('fresh install check failed:', error.message)
  process.exitCode = 1
})
