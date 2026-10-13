// Checks the scan the three finder pages share: the pinned bar and its controls, the coverage card
// whose rings fill as the pass reports, the results card that lists only the sites the scan reached,
// and "Show all leads" putting the whole list back.
//
// The Email Finder is the page the checks drive, because all three are one implementation: what is
// asserted here is the shape the design gives them. The seeded database is a copy of the real one
// with every lead marked as already read and a handful given addresses, so the figures the rings
// report are known before the window opens.
const { _electron } = require('playwright')
const { mkdtempSync, mkdirSync, copyFileSync, existsSync, rmSync } = require('node:fs')
const { join } = require('node:path')
const { tmpdir } = require('node:os')
const { DatabaseSync } = require('node:sqlite')

const APP = process.cwd()
const REAL_DATA = join(process.env.APPDATA ?? '', 'nafran-leads-scraper')
const SEEDED = 6

const results = []
function check(name, ok, detail = '') {
  results.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` · ${detail}` : ''}`)
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Marks the first leads as read and gives them addresses.
 *
 * A lead counts as scanned when `last_scanned_at` is set, which is what the enrichment worker writes
 * as it reads each site — so seeding it is what a finished pass would have left behind. Nothing is
 * queued: a pass with work to do would keep the card in its "running" state, and the checks need the
 * settled one.
 */
function seed(file) {
  const db = new DatabaseSync(file)
  db.exec("delete from enrichment_jobs where status in ('queued', 'running')")
  const leads = db.prepare('select id, website from leads order by captured_at desc limit ?').all(SEEDED + 2)
  const at = new Date().toISOString()
  leads.forEach((lead, index) => {
    if (index >= SEEDED) return
    db.prepare('update leads set last_scanned_at = ? where id = ?').run(at, lead.id)
    if (index >= 4) return
    db.prepare(
      `insert or ignore into lead_contacts (id, lead_id, workspace_id, kind, value, source, verified, score, created_at)
       select ?, id, workspace_id, 'email', ?, ?, 1, ?, ?
       from leads where id = ?`,
    ).run(
      `scan-seed-${lead.id}`,
      `hello@${(lead.website || 'example.com').replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0]}`,
      index === 0 ? 'https://example.com/' : 'https://example.com/contact',
      index === 0 ? 92 : 55,
      at,
      lead.id,
    )
  })
  db.close()
  return leads.length
}

async function main() {
  const root = mkdtempSync(join(tmpdir(), 'leadsnap-finder-'))
  const userData = join(root, 'userdata')
  mkdirSync(userData, { recursive: true })
  for (const name of ['leads.db', 'leads.db-wal', 'leads.db-shm']) {
    const from = join(REAL_DATA, name)
    if (existsSync(from)) copyFileSync(from, join(userData, name))
  }
  const leadCount = seed(join(userData, 'leads.db'))
  console.log(`seeded ${SEEDED} of ${leadCount} leads as read, 4 with addresses`)

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
  await sleep(2500)

  await page.click('[data-view="email"]')
  await sleep(2000)

  // ---- the pinned bar, which all three pages draw the same way
  const bar = await page.evaluate(() => {
    const input = document.querySelector('[data-fq="email"]')
    const sticky = input ? input.closest('[data-socbar="1"]') : null
    return {
      hasInput: Boolean(input),
      inputBound: input ? input.value !== undefined : false,
      sticky: sticky ? getComputedStyle(sticky).position : '(none)',
      buttons: sticky ? Array.from(sticky.querySelectorAll('button')).map((node) => node.textContent.trim()) : [],
      filter: Boolean(sticky?.querySelector('select')),
    }
  })
  check('the Email Finder has the pinned bar', bar.hasInput && bar.sticky === 'sticky', `position ${bar.sticky}`)
  check(
    'the bar carries its actions',
    ['Verify all', 'Import websites', 'Refresh'].every((label) => bar.buttons.includes(label)) && bar.filter,
    bar.buttons.join(' | ').slice(0, 120),
  )

  // ---- the search and the state filter narrow the list
  const rows = () => page.locator('[data-flist="email"] [data-row="1"]')
  const beforeSearch = await rows().count()
  // Typed rather than filled, the way a person works the box: `fill` writes the value straight into
  // the element, which React's own state never hears about.
  const typeSearch = async (text) => {
    const box = page.locator('[data-fq="email"]')
    await box.click()
    await box.press('ControlOrMeta+a')
    await box.press('Backspace')
    if (text) await box.pressSequentially(text, { delay: 12 })
    await sleep(900)
  }
  await typeSearch('no-such-business-anywhere')
  const afterSearch = await rows().count()
  await typeSearch('')
  check('the search narrows the addresses', afterSearch === 0 && beforeSearch > 0, `${beforeSearch} → ${afterSearch}`)

  await page.selectOption('select[aria-label="Filter rows"]', { label: 'No website' })
  await sleep(700)
  const filtered = await rows().count()
  const everyNoWebsite = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-flist="email"] [data-row="1"]')).every((row) =>
      /No website/.test(row.textContent ?? ''),
    ),
  )
  await page.selectOption('select[aria-label="Filter rows"]', { label: 'All' })
  await sleep(700)
  check('the state filter narrows the addresses', filtered >= 0 && everyNoWebsite, `${filtered} rows`)

  // ---- the scan: the coverage card and the results card
  const coverageOn = () => page.locator('[data-fcov="email"]').count()
  check('no coverage card before the action', (await coverageOn()) === 0)

  await page.locator('[data-fact="fEmail"]').first().click()
  await sleep(1200)
  const during = await page.evaluate(() => ({
    coverage: document.querySelectorAll('[data-fcov="email"]').length,
    results: document.querySelectorAll('[data-fres="email"]').length,
    sub: document.querySelector('[data-fcov="email"]')?.parentElement?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 100) ?? '',
    rowCount: document.querySelectorAll('[data-flist="email"] [data-row="1"]').length,
    shown: document.querySelector('[data-fcount="email"]')?.textContent?.trim() ?? '',
  }))
  console.log('while scanning:', JSON.stringify(during))
  check('the action opens the coverage card', during.coverage > 0, during.sub)
  check('it states what the scan is doing', /scan|read|verif/i.test(during.sub), during.sub)

  // The rings are the four sources the cascade reads a site for, each drawn as a ring. They live in
  // the coverage card, which the heading's own marker names.
  const rings = await page.evaluate(() => {
    const card = document.querySelector('[data-fcov="email"]')?.closest('section')
    return Array.from(card?.querySelectorAll('circle[stroke-dashoffset]') ?? []).map((node) => ({
      offset: node.getAttribute('stroke-dashoffset'),
      dash: node.getAttribute('stroke-dasharray'),
    }))
  })
  check('the coverage card draws one ring per source', rings.length === 4, `${rings.length} rings`)
  check(
    'each ring is an arc of the same circumference',
    rings.every((ring) => ring.dash === '276.5'),
    rings.map((ring) => `${ring.dash}/${ring.offset}`).join(' '),
  )
  const labels = await page.evaluate(() => {
    const card = document.querySelector('[data-fcov="email"]')?.closest('section')
    return Array.from(card?.querySelectorAll('span') ?? []).map((node) => node.textContent.trim())
  })
  check(
    'the rings are named for where an address comes from',
    ['Homepage', 'Contact page', 'Team page', 'Structured data'].every((name) => labels.includes(name)),
    labels.filter((label) => label.length > 2).slice(0, 8).join(' | '),
  )

  // The results card lists only the sites the scan reached, which is fewer than the whole list.
  check('the results card is shown with the coverage card', during.results > 0)
  check(
    'it lists the sites the scan reached',
    during.rowCount > 0 && during.rowCount <= beforeSearch,
    `${during.rowCount} of ${beforeSearch}`,
  )
  check('the count line follows what is on screen', /\d+ rows? on screen/.test(during.shown), during.shown)

  // ---- the scan can be called off, whether or not the pass has finished
  await page.locator('[data-exitscan="1"]').first().click()
  await sleep(900)
  const after = await page.evaluate(() => ({
    coverage: document.querySelectorAll('[data-fcov="email"]').length,
    results: document.querySelectorAll('[data-fres="email"]').length,
    rowCount: document.querySelectorAll('[data-flist="email"] [data-row="1"]').length,
  }))
  check('Show all leads closes the coverage card', after.coverage === 0)
  check('and the results card with it', after.results === 0)
  check('and the whole list is back', after.rowCount === beforeSearch, `${after.rowCount} of ${beforeSearch}`)

  // ---- the same bar is on the other two finder pages
  for (const [view, query, action] of [
    ['phone', 'phone', 'Check numbers'],
    ['dm', 'dm', 'Review suggestions'],
  ]) {
    await page.click(`[data-view="${view}"]`)
    await sleep(1500)
    const shape = await page.evaluate(
      (name) => {
        const input = document.querySelector(`[data-fq="${name}"]`)
        const sticky = input ? input.closest('[data-socbar="1"]') : null
        return {
          sticky: sticky ? getComputedStyle(sticky).position : '(none)',
          buttons: sticky ? Array.from(sticky.querySelectorAll('button')).map((node) => node.textContent.trim()) : [],
        }
      },
      query,
    )
    check(`the ${view} page has the same pinned bar`, shape.sticky === 'sticky')
    check(`and its own action`, shape.buttons.includes(action), shape.buttons.join(' | ').slice(0, 100))
  }

  // ---- the Decision Makers suggestions offer a decision and an undo
  await page.click('[data-view="dm"]')
  await sleep(1500)
  const suggestions = await page.evaluate(() => {
    const heading = document.querySelector('[data-dmsugs="1"]')
    const card = heading?.closest('section')
    return {
      cards: document.querySelectorAll('[data-dmsug]').length,
      states: Array.from(document.querySelectorAll('[data-dmsug]')).map((node) => node.getAttribute('data-dmsug')),
      badge: card?.textContent ?? '',
    }
  })
  console.log('suggestions:', JSON.stringify(suggestions))
  check('the suggestions card reports what is waiting', /awaiting review/.test(suggestions.badge), suggestions.badge.slice(0, 80))
  check(
    'each suggestion is pending or resolved',
    suggestions.cards === 0 || suggestions.states.every((state) => state === 'pending' || state === 'dismissed'),
    suggestions.states.join(', ') || '(none)',
  )

  // Decision Makers is a review pass rather than a website job, so it settles immediately. It
  // still follows the same result behavior: the matched contacts card comes into view and only
  // the rows in that review remain until Show all leads is pressed.
  await page.locator('[data-fact="fDm"]').first().click()
  await sleep(700)
  const dmResult = await page.evaluate(() => {
    const card = document.querySelector('[data-flistcard="dm"]')
    return {
      coverage: Boolean(document.querySelector('[data-fcov="dm"]')),
      inView: Boolean(card) && card.getBoundingClientRect().top < window.innerHeight * 0.75,
      rows: document.querySelectorAll('[data-flist="dm"][data-fpart="contacts"] [data-person="1"]').length,
    }
  })
  check('Decision Makers review opens its coverage result', dmResult.coverage)
  check('Decision Makers review scrolls to its result card', dmResult.inView, `rows ${dmResult.rows}`)
  await page.locator('[data-exitscan="1"]').first().click()
  await sleep(400)

  check('the renderer reported no errors', rendererErrors.length === 0, rendererErrors.slice(0, 3).join(' | '))

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
  console.error('finder check failed:', error.message)
  process.exitCode = 1
})
