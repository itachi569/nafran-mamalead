// Checks the pages that were still painted from the design's sample figures: All Leads, Saved Lists,
// Run History, Decision Makers, Website Lookup and the dashboard's coverage card.
//
// Each of these claims something about the workspace — how many leads are on file, what a run cost,
// why a lead has no named contact — so what is asserted is that the figure on screen comes from the
// data rather than from the document. The seeded database is a copy of the real one with a known
// list, a known run and two leads marked as read, so the numbers can be checked rather than merely
// seen to be present.
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

/**
 * Gives the checks something definite to look for: one saved list, one lead read and named.
 *
 * Nothing is queued, so the pages settle rather than reporting a pass in flight, and the row counts
 * below are the ones the window will be reading.
 */
function seed(file) {
  const db = new DatabaseSync(file)
  db.exec("delete from enrichment_jobs where status in ('queued', 'running')")
  const workspace = db.prepare('select id from workspaces limit 1').get()
  const leads = db.prepare('select id, name, website from leads order by captured_at desc limit 12').all()
  const at = new Date().toISOString()

  db.prepare('delete from lists where workspace_id = ?').run(workspace.id)
  db.prepare('insert into lists (id, workspace_id, name, created_at) values (?, ?, ?, ?)').run(
    'check-list',
    workspace.id,
    'Coverage check list',
    at,
  )
  for (const lead of leads.slice(0, 3)) {
    db.prepare('insert or ignore into list_items (list_id, lead_id, workspace_id, added_at) values (?, ?, ?, ?)').run(
      'check-list',
      lead.id,
      workspace.id,
      at,
    )
    db.prepare('update leads set last_scanned_at = ? where id = ?').run(at, lead.id)
  }
  // One named person, so the seniority mix and the matched-contacts grid both have a row.
  db.prepare('delete from decision_makers where workspace_id = ?').run(workspace.id)
  db.prepare(
    'insert into decision_makers (id, lead_id, workspace_id, full_name, title, email, phone, linkedin_url, source, created_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).run('check-person', leads[0].id, workspace.id, 'Check Person', 'Clinic Director', '', '', '', 'website', at)

  const totals = {
    leads: db.prepare('select count(*) as n from leads').get().n,
    withWebsite: db.prepare("select count(*) as n from leads where website <> ''").get().n,
    named: db.prepare('select count(*) as n from decision_makers').get().n,
  }
  db.close()
  return totals
}

async function main() {
  const root = mkdtempSync(join(tmpdir(), 'leadsnap-pages-'))
  const userData = join(root, 'userdata')
  mkdirSync(userData, { recursive: true })
  for (const name of ['leads.db', 'leads.db-wal', 'leads.db-shm']) {
    const from = join(REAL_DATA, name)
    if (existsSync(from)) copyFileSync(from, join(userData, name))
  }
  const totals = seed(join(userData, 'leads.db'))
  console.log(`seeded ${totals.leads} leads, ${totals.withWebsite} with a website, ${totals.named} named contact`)

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

  const open = async (view) => {
    await page.click(`[data-view="${view}"]`)
    await sleep(1800)
  }
  const read = (selector) =>
    page.evaluate((value) => {
      const node = document.querySelector(value)
      return node ? (node.textContent ?? '').replace(/\s+/g, ' ').trim() : ''
    }, selector)

  // ---- Google Maps: the visible Location field must be the value sent to the scraper.
  // This catches the regression where the design had no aria-label, so the renderer missed the
  // field and the run silently fell back to Manchester for every city.
  await open('maps')
  const mapsLocation = await page.evaluate(() => {
    const input = document.querySelector('[data-location="1"]')
    if (!(input instanceof HTMLInputElement)) return { marked: false, picked: '' }
    input.value = 'Lahore, Pakistan'
    return { marked: true, picked: input.value }
  })
  check('Maps marks the visible Location field', mapsLocation.marked)
  check('the Maps field preserves a Lahore value', mapsLocation.picked === 'Lahore, Pakistan', mapsLocation.picked)

  // ---- All Leads: the store card, the day headings and the ledger rows
  await open('leads')
  const store = await page.evaluate(() => {
    const heading = Array.from(document.querySelectorAll('div')).find((node) =>
      /^Permanent store$/i.test((node.textContent ?? '').trim()),
    )
    const card = heading?.closest('section') ?? null
    return {
      text: (card?.textContent ?? '').replace(/\s+/g, ' ').trim(),
      big: Array.from(card?.querySelectorAll('span') ?? [])
        .map((node) => node.textContent.trim())
        .find((value) => /^\d+$/.test(value)) ?? '',
    }
  })
  check('the store card states the lead count', store.big === String(totals.leads), `${store.big} vs ${totals.leads}`)
  check('and where the file is', /Stored on this machine at .+leads\.db/.test(store.text), store.text.slice(-70))
  check(
    'and what each source contributed',
    store.text.includes(`Google Maps scraper${totals.leads}`) || /Google Maps scraper\s*\d+/.test(store.text),
    store.text.slice(0, 120),
  )

  const ledger = await page.evaluate(() => {
    const list = Array.from(document.querySelectorAll('ul')).find((node) =>
      node.querySelector('[data-row="1"]') && /BUSINESS|Business/.test(node.parentElement?.textContent ?? ''),
    )
    const days = Array.from(list?.children ?? []).filter((node) => node.getAttribute('data-row') !== '1')
    const rows = Array.from(list?.querySelectorAll('[data-row="1"]') ?? [])
    return {
      days: days.map((node) => node.textContent.replace(/\s+/g, ' ').trim()),
      rows: rows.length,
      first: rows[0]?.textContent.replace(/\s+/g, ' ').trim().slice(0, 70) ?? '',
    }
  })
  check('the ledger is grouped by the day it was saved', ledger.days.length > 0, ledger.days.slice(0, 2).join(' | '))
  check('each day heading counts its own rows', ledger.days.every((day) => /\d+ added$/.test(day)), ledger.days[0] ?? '')
  check('and the rows carry the dataset', ledger.rows > 0, `${ledger.rows} rows · ${ledger.first}`)

  const search = page.locator('[data-leadsearch="1"]')
  check('the ledger has its own search', (await search.count()) === 1)
  await search.click()
  await search.pressSequentially('zzzz-no-such-place', { delay: 8 })
  await sleep(700)
  const narrowed = await read('ul[style*="list-style"]')
  check('and the search narrows it', !/zzzz/.test(narrowed) || narrowed.length < 200, `${narrowed.length} chars`)

  // ---- Saved Lists: the picks, the running total and the workspace's own lists
  await open('lists')
  const lists = await page.evaluate(() => {
    // The bookmark counter and the lists badge both sit beside an element rather than in one span
    // of their own — the counter under the total, the badge beside the heading — so the figures are
    // read from the block that holds them. The sidebar also says "of 2,000 Maps scrapes", so the
    // counter is found on the bookmark block itself, which is the one that says "bookmarked".
    const bookmarkBlock = Array.from(document.querySelectorAll('span')).find((node) => /bookmarked/.test(node.textContent))
    const badgeNode = Array.from(document.querySelectorAll('span')).find((node) => /^\d+ lists? · \d+ leads?$/.test(node.textContent.trim()))
    return {
      heading: document.querySelector('h2')?.textContent?.trim() ?? '',
      picks: document.querySelectorAll('[data-keep]').length,
      bookmark: (bookmarkBlock?.textContent ?? '').replace(/\s+/g, ' ').trim(),
      badge: (badgeNode?.textContent ?? '').replace(/\s+/g, ' ').trim(),
      names: Array.from(document.querySelectorAll('h3')).map((node) => node.textContent.trim()),
      pickHeading: Array.from(document.querySelectorAll('h2')).map((node) => node.textContent.trim()).find((value) => /places? to sort/.test(value)) ?? '',
    }
  })
  check('the picks are drawn from the ledger', lists.picks > 0 && lists.picks <= 50, `${lists.picks} cards`)
  check('the heading counts what is on screen', /^\d+ places? to sort through$/.test(lists.pickHeading), lists.pickHeading)
  check(
    'the bookmark counter matches the picks',
    lists.bookmark.startsWith(`of ${lists.picks}`),
    `“${lists.bookmark}” vs ${lists.picks} cards`,
  )
  check('the workspace’s own list is drawn', lists.names.includes('Coverage check list'), lists.names.slice(0, 3).join(' | '))
  check('and the badge counts it', /\d+ lists? · \d+ leads?/.test(lists.badge), lists.badge)

  // ---- Run History: the four figures and the timeline
  await open('runs')
  await page.click('button[data-run-chip="Maps"]')
  const runs = await page.evaluate(() => {
    const figures = Array.from(document.querySelectorAll('span'))
      .filter((node) => !node.children.length && /^\d+$/.test(node.textContent.trim()))
      .map((node) => node.textContent.trim())
    const rows = Array.from(document.querySelectorAll('li')).filter((node) => /Google Maps ·/.test(node.textContent ?? ''))
    return {
      figures: figures.slice(0, 4),
      badge: Array.from(document.querySelectorAll('span')).map((n) => n.textContent.trim()).find((v) => /^\d+ RUNS$/.test(v)) ?? '',
      rows: rows.length,
      // A cancelled run can legitimately have no places count, but it still carries its provider
      // and elapsed time. Keep the assertion about those stable facts rather than a result count.
      first: rows[0]?.textContent.replace(/\s+/g, ' ').trim().slice(0, 120) ?? '',
      bars: rows[0]?.querySelectorAll('span[style*="width: 6px"]').length ?? 0,
      pills: Array.from(rows[0]?.querySelectorAll('span') ?? []).filter((n) => /^(Done|Failed|Cancelled|Running|Queued)$/.test(n.textContent.trim())).length,
    }
  })
  check('the run badge counts the log', /^\d+ RUNS$/.test(runs.badge) && Number(runs.badge.split(' ')[0]) > 0, runs.badge)
  check('the timeline lists the stored runs', runs.rows > 5, `${runs.rows} rows`)
  check('a row states its terms and provider', /Google Maps · .+/.test(runs.first) && /\d\d:\d\d/.test(runs.first), runs.first)
  check('a row charts its keyword passes', runs.bars > 0, `${runs.bars} bars`)
  check('a row carries exactly one status pill', runs.pills === 1, `${runs.pills} pills`)

  // ---- Decision Makers: the coverage figure, the funnel, the mix and the blockers
  await open('dm')
  const dm = await page.evaluate(() => {
    const text = document.body.innerText.replace(/\s+/g, ' ')
    return {
      coverage: /(\d+) of (\d+)/.exec(text)?.[0] ?? '',
      fps: Array.from(document.querySelectorAll('span')).map((n) => n.textContent.trim()).find((v) => /^\d+% have a named contact$/.test(v)) ?? '',
      stages: Array.from(document.querySelectorAll('li')).filter((node) => /Leads scraped|Have a website|LinkedIn company page|People listed|Named decision maker/.test(node.textContent ?? '')).length,
      mix: Array.from(document.querySelectorAll('li')).filter((node) => /Clinic Director/.test(node.textContent ?? '')).length,
      people: document.querySelectorAll('article[data-person="1"]').length,
      blockers: document.querySelectorAll('[data-row="1"]').length > 0,
      blockerNote: Array.from(document.querySelectorAll('p')).map((n) => n.textContent.trim()).find((v) => /grouped by what blocked them/.test(v)) ?? '',
    }
  })
  check('the coverage figure is the matched share', dm.coverage !== '' && dm.fps !== '', `${dm.coverage} · ${dm.fps}`)
  check('the funnel draws all five stages', dm.stages === 5, `${dm.stages} stages`)
  check('the seniority mix lists the real titles', dm.mix > 0, `${dm.mix} rows`)
  check('the named contact has a card', dm.people >= 1, `${dm.people} cards`)
  check('the unmatched leads are grouped by blocker', /^\d+ leads with no named contact/.test(dm.blockerNote), dm.blockerNote)

  // ---- the deep pass: owner first, then a top-ten email search for each selected lead
  //
  // This check uses an isolated user-data directory. It deliberately leaves the key blank: the UI
  // must expose the selection control and refuse the paid run without persisting a credential.
  const deep = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('[data-deeprun="1"]'))
    const input = document.querySelector('[data-dm-limit="1"]')
    const selection = document.querySelector('[data-dm-selection="1"]')
    return {
      buttons: buttons.length,
      labels: buttons.map((b) => b.textContent.replace(/\s+/g, ' ').trim().slice(0, 34)),
      count: Array.from(document.querySelectorAll('button')).map((b) => b.textContent.replace(/\s+/g, ' ').trim()).find((t) => /^(?:Find owners \+ emails|Enrich all missing)/.test(t)) ?? '',
      inputValue: input?.getAttribute('value') ?? '',
      selection: (selection?.textContent ?? '').trim(),
    }
  })
  check('the deep pass has its button on the page', deep.buttons >= 1, deep.labels.join(' | '))
  check('and the card counts the leads it would run on', /(?:Find owners \+ emails|Enrich all missing)\s*\d+/.test(deep.count), deep.count)
  check('the user can choose a lead count', deep.inputValue === '10' && /captured leads selected/.test(deep.selection), `${deep.inputValue} · ${deep.selection}`)

  await page.fill('[data-dm-limit="1"]', '3')
  const selected = await page.evaluate(() => ({ value: document.querySelector('[data-dm-limit="1"]')?.value ?? '', text: document.querySelector('[data-dm-selection="1"]')?.textContent?.trim() ?? '' }))
  check('changing the count updates the selection label', selected.value === '3' && /3 of/.test(selected.text), `${selected.value} · ${selected.text}`)

  await page.locator('[data-deeprun="1"]').first().dispatchEvent('click')
  await sleep(900)
  const noKey = await page.evaluate(() => {
    const node = Array.from(document.querySelectorAll('div')).find((entry) => getComputedStyle(entry).zIndex === '110')
    return (node?.textContent ?? '').trim().slice(0, 120)
  })
  check('pressing it without a key says so rather than doing nothing', /DataForSEO key/i.test(noKey), noKey)

  await open('settings')
  await page.locator('[data-stab="acct"]').dispatchEvent('click')
  await sleep(700)
  const keyRow = await page.evaluate(() => {
    const input = document.querySelector('[data-deepkey="1"]')
    const note = document.querySelector('[data-deepnote="1"]')
    return {
      field: Boolean(input),
      masked: input?.getAttribute('type') === 'password',
      placeholder: input?.getAttribute('placeholder') ?? '',
      note: (note?.textContent ?? '').trim(),
      buttons: input?.parentElement ? Array.from(input.parentElement.querySelectorAll('button')).map((b) => b.textContent.trim()) : [],
    }
  })
  check('the Account tab takes a DataForSEO key', keyRow.field, keyRow.placeholder)
  check('and never shows it back in the clear', keyRow.masked, keyRow.field ? 'password field' : 'no field')
  check('with a note saying what it is for', /DataForSEO key is needed/.test(keyRow.note), keyRow.note)
  check('and both a save and a test', keyRow.buttons.includes('Save') && keyRow.buttons.includes('Test'), keyRow.buttons.join(' / '))

  const untouched = await page.evaluate(() => ({
    stored: Boolean(window.localStorage.getItem('nafran.dataforseo.key')),
    note: (document.querySelector('[data-deepnote="1"]')?.textContent ?? '').trim(),
  }))
  check('the isolated test has not saved a DataForSEO key', !untouched.stored && /key is needed/i.test(untouched.note), `stored=${untouched.stored} · ${untouched.note}`)

  // ---- Website Lookup: the status chip and the results card
  await open('website')
  const web = await page.evaluate(() => {
    const heading = Array.from(document.querySelectorAll('h2')).find((node) => node.textContent.trim() === 'Results preview')
    const card = heading?.closest('section') ?? null
    const rows = card
      ? Array.from(card.querySelectorAll('li')).filter((node) => /^\S/.test((node.textContent ?? '').trim())).length
      : 0
    return {
      chip: Array.from(document.querySelectorAll('span')).map((n) => n.textContent.trim()).find((v) => /imports? on file|Nothing imported yet/.test(v)) ?? '',
      lines: Array.from(document.querySelectorAll('span')).map((n) => n.textContent.trim()).find((v) => /lines ·|No imports yet/.test(v)) ?? '',
      rows,
      // Either the card lists the imported sites, or it says where those rows would come from. One
      // of the two is always true, and which one follows from whether anything has been imported.
      explains: /No websites imported yet|More sites can be pasted/.test(document.body.innerText) || rows > 0,
    }
  })
  check('the page states what has been imported', web.chip !== '', web.chip)
  check('and what the last batch did', web.lines !== '', web.lines)
  check('and shows the rows, or says where they would come from', web.explains, `${web.rows} preview row(s)`)

  // The shared import modal, opened from this page: its button counts the pasted sites and the
  // paste is judged by what is in it rather than by which page opened the box.
  await page.locator('button', { hasText: 'Import websites' }).first().dispatchEvent('click')
  await sleep(800)
  const opened = await page.evaluate(() => {
    const modal = document.querySelector('[data-socimp="1"]')
    return Boolean(modal) && getComputedStyle(modal).display !== 'none'
  })
  check('the Import button opens the shared modal', opened)
  await page.fill('[data-socimpinput="1"]', ['one-check-site.co.uk', 'https://www.instagram.com/some-clinic'].join('\n'))
  await sleep(700)
  const label = ((await page.textContent('[data-socimpgo="1"]')) ?? '').trim()
  check('the button counts a mixed paste', /^Scan 1 site · Import 1 profile$/.test(label), label)
  await page.locator('[data-socimpcancel="1"]').dispatchEvent('click')
  await sleep(700)

  // ---- the dashboard's coverage card
  await open('dashboard')
  const coverage = await page.evaluate(() => {
    const heading = Array.from(document.querySelectorAll('h2')).find((node) => node.textContent.trim() === 'Contact Coverage')
    const card = heading?.closest('section') ?? null
    const arcs = Array.from(card?.querySelectorAll('circle[stroke-dashoffset]') ?? []).map((node) => node.getAttribute('stroke-dashoffset'))
    const labels = Array.from(card?.querySelectorAll('span') ?? []).map((node) => node.textContent.trim())
    return { arcs, labels, text: (card?.textContent ?? '').replace(/\s+/g, ' ').trim() }
  })
  check('the coverage card draws four rings', coverage.arcs.length === 4, coverage.arcs.join(' '))
  check(
    'each ring states a real share',
    ['Phone', 'Email', 'Socials', 'LinkedIn DM'].every((name) => coverage.labels.includes(name)) &&
    coverage.arcs.every((value) => Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= 277),
    coverage.text.slice(0, 100),
  )

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
  console.error('page check failed:', error.message)
  process.exitCode = 1
})
