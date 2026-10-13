// Checks the Social Profiles page's own controls: the search box, the platform filter, the import
// that turns pasted profile URLs into profiles on the leads they name, and the toolbar that holds
// them at the top of the page while the list scrolls.
//
// It runs on a throwaway copy of the app's data folder, so the real database is untouched, and it
// drives the built renderer the way a user would.
const { _electron } = require('playwright')
const { mkdtempSync, mkdirSync, copyFileSync, existsSync, realpathSync, rmSync } = require('node:fs')
const { basename, join, resolve, sep } = require('node:path')
const { tmpdir } = require('node:os')

const APP = process.cwd()
const REAL_DATA = join(process.env.APPDATA ?? '', 'nafran-leads-scraper')

const results = []
function check(name, ok, detail = '') {
  results.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` · ${detail}` : ''}`)
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function main() {
  const root = mkdtempSync(join(tmpdir(), 'leadsnap-social-'))
  const userData = join(root, 'userdata')
  mkdirSync(userData, { recursive: true })
  // A copy of the real file: the checks need leads to filter and to attach profiles to.
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
  await page.waitForSelector('[data-view="dashboard"]', { timeout: 30000 })

  const list = '[data-soclist="1"]'
  const header = page.locator('p', { hasText: 'Showing' }).first()
  const search = page.locator('[data-socsearch="1"]')
  const rows = page.locator(`${list} [data-row="1"]`)
  const names = () => rows.locator('span').nth(2).allTextContents()
  /**
   * Types into the search box the way a person does.
   *
   * `fill` writes the value straight into the element, which React's own state never hears about,
   * so the box would read one thing while the table showed another. Typing key by key fires the
   * same input events a user does.
   */
  const typeSearch = async (text) => {
    await search.click()
    await search.press('ControlOrMeta+a')
    await search.press('Backspace')
    if (text) await search.pressSequentially(text, { delay: 25 })
    await sleep(700)
  }

  await page.click('[data-view="social"]')
  await sleep(2500)
  console.log('social header:', (await header.textContent()).replace(/\s+/g, ' ').trim())

  // ---- the toolbar: under the page heading, above the data, and holding its place while scrolling
  const order = await page.evaluate(() => {
    const toolbar = document.querySelector('[data-soctoolbar="1"]')
    const view = toolbar.parentElement
    const children = Array.from(view.children)
    const at = children.indexOf(toolbar)
    const rowsAt = children.findIndex((node) => node.querySelector('[data-soclist="1"]'))
    const headingAt = children.findIndex((node) => node.querySelector('h1'))
    return {
      sticky: getComputedStyle(toolbar).position,
      headingBeforeIt: headingAt >= 0 && headingAt < at,
      dataAfterIt: rowsAt < 0 || rowsAt > at,
      after: at,
      rowsAt,
    }
  })
  check('the options sit at the top of the page', order.headingBeforeIt && order.dataAfterIt, `heading, then options (${order.after}), then the list (${order.rowsAt})`)
  check('the toolbar is sticky', order.sticky === 'sticky', order.sticky)

  const beforeScroll = await page.evaluate(() => Math.round(document.querySelector('[data-soctoolbar="1"]').getBoundingClientRect().top))
  await page.evaluate(() => window.scrollTo(0, 1400))
  await sleep(700)
  const afterScroll = await page.evaluate(() => Math.round(document.querySelector('[data-soctoolbar="1"]').getBoundingClientRect().top))
  const searchVisible = await search.isVisible()
  check('it stays pinned while the list scrolls', afterScroll >= 0 && afterScroll < beforeScroll, `top ${beforeScroll} → ${afterScroll}`)
  check('the search box is still usable while scrolled', searchVisible)
  await page.evaluate(() => window.scrollTo(0, 0))
  await sleep(500)

  const allRows = await rows.count()
  check('the page renders rows from the database', allRows > 0, `${allRows} rows`)

  // ---- the search box
  const term = 'physio'
  await typeSearch(term)
  const searched = await rows.count()
  const searchedNames = (await names()).slice(0, 3)
  check(
    'the search narrows the table',
    searched > 0 && searched < allRows && searchedNames.every((name) => new RegExp(term, 'i').test(name)),
    `${searched} of ${allRows} · ${searchedNames.join(' | ')}`,
  )
  const shown = (await header.textContent()).replace(/\s+/g, ' ').trim()
  check('the header follows the search', shown.includes(`Showing ${searched} of`), shown)

  await typeSearch('zzzz-no-such-lead')
  check('a search with no matches says so', (await rows.count()) === 0 && /No lead matches/.test(await page.textContent(list)))

  await typeSearch('')
  check('clearing the search brings every row back', (await rows.count()) === allRows, `${await rows.count()} rows`)

  // ---- the searches made before, offered back under the box
  await typeSearch('physio')
  const recents = page.locator('[data-socrecent="1"]')
  const recentTerms = async () => page.$$eval('[data-socrecent="1"]', (nodes) => nodes.map((node) => node.textContent.trim()))
  for (let attempt = 0; attempt < 12 && (await recents.count()) === 0; attempt += 1) await sleep(250)
  check('a search is remembered once it settles', (await recents.count()) > 0, (await recentTerms()).join(' | '))
  check(
    'the remembered search carries what it produced',
    (await recentTerms()).some((text) => /\d+ leads?/.test(text)),
    (await recentTerms()).join(' | '),
  )

  // The chip for the term just searched, by its own text rather than by position.
  const physioChip = page.locator('[data-socrecent="1"]', { hasText: 'physio' }).first()
  check('the searched term is the one offered back', (await physioChip.count()) === 1, (await recentTerms()).join(' | '))
  // The box is cleared the way a user clears it, so the search really is off before the chip runs.
  await typeSearch('')
  await physioChip.dispatchEvent('click')
  await sleep(1200)
  const afterPick = await rows.count()
  const pickedBox = await search.inputValue()
  check('picking a remembered search runs it again', afterPick > 0 && afterPick < allRows && pickedBox === 'physio', `“${pickedBox}” → ${afterPick} rows`)

  await typeSearch('')
  await sleep(600)

  // ---- the history panel, which the History button opens
  const historyButton = page.locator('[data-shistopen="1"]')
  check('the History button carries what it holds', /[1-9]/.test((await historyButton.textContent()) ?? ''), (await historyButton.textContent())?.trim())
  // Dispatched rather than clicked: opening the panel puts a scrim over the page, and a click that
  // is still being retried while that happens never settles.
  await historyButton.dispatchEvent('click')
  await sleep(700)
  const panel = page.locator('aside[aria-label="Social history"]')
  check('the history panel opens', await panel.isVisible())

  const logRows = page.locator('[data-shrow="1"]')
  const logText = async () =>
    page.$$eval('[data-shrow="1"]', (nodes) => nodes.map((node) => (node.innerText || node.textContent || '').replace(/\s+/g, ' ').trim()))
  check(
    'it lists what was searched',
    (await logRows.count()) > 0 && (await logText()).some((text) => /physio/.test(text) && /Search/.test(text)),
    (await logText())[0]?.slice(0, 70) ?? '(no rows)',
  )

  // The Searches tab keeps searches and the Activity tab keeps everything else.
  const tabCounts = {}
  for (const tab of ['Searches', 'Activity', 'All']) {
    await panel.locator('[data-r]', { hasText: new RegExp(`^${tab}$`) }).first().dispatchEvent('click')
    await sleep(400)
    tabCounts[tab] = await logRows.count()
  }
  check('the tabs narrow the list', tabCounts.Searches > 0 && tabCounts.All >= tabCounts.Searches, JSON.stringify(tabCounts))

  // A search row opens to show the term, and offers to run it again.
  const firstSearchRow = page.locator('[data-shrow="1"]').first()
  await firstSearchRow.dispatchEvent('click')
  await sleep(500)
  const runAgain = page.locator('[data-shist="1"]')
  check('a row opens with the term inside it', (await runAgain.count()) > 0, (await firstSearchRow.textContent())?.replace(/\s+/g, ' ').trim().slice(0, 60))

  await runAgain.first().dispatchEvent('click')
  await sleep(1200)
  const afterRunAgain = await search.inputValue()
  check('"Run again" runs that search', afterRunAgain.length > 1 && !(await panel.isVisible()), `“${afterRunAgain}”`)

  await typeSearch('')
  await sleep(600)

  // ---- the platform filter
  await page.selectOption('[data-socfilter="1"]', { label: 'With socials' })
  await sleep(900)
  const filtered = await rows.count()
  const everyRowHasChips = await page.evaluate(
    (selector) =>
      Array.from(document.querySelectorAll(`${selector} [data-row="1"]`)).every(
        (row) => (row.children[4]?.querySelectorAll('a[data-social-profile-link]').length ?? 0) > 0,
      ),
    list,
  )
  check('"With socials" shows only rows that have profiles', filtered > 0 && filtered < allRows && everyRowHasChips, `${filtered} of ${allRows}`)

  await page.selectOption('[data-socfilter="1"]', { label: 'No website' })
  await sleep(700)
  const noWebsite = await rows.count()
  const everyNoWebsite = await page.evaluate(
    (selector) =>
      Array.from(document.querySelectorAll(`${selector} [data-row="1"]`)).every((row) =>
        /No website found/.test(row.children[3]?.textContent ?? ''),
      ),
    list,
  )
  check('"No website" shows only leads without one', noWebsite > 0 && everyNoWebsite, `${noWebsite} rows`)

  await page.selectOption('[data-socfilter="1"]', { label: 'All' })
  await sleep(800)

  // ---- the import modal, and every way out of it
  const scrimShown = () =>
    page.evaluate(() => {
      const scrim = document.querySelector('[data-socimp="1"]')
      return Boolean(scrim) && getComputedStyle(scrim).display !== 'none'
    })
  const openModal = async () => {
    // Found by its own marker: the updated design paints an icon inside the button, so its text is
    // not exactly "Import profiles" and a text match would miss it.
    await page.locator('[data-socimpopen="1"]').first().dispatchEvent('click')
    await sleep(800)
  }
  const clickReal = async (locator) => {
    const box = await locator.boundingBox()
    if (!box) return false
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
    return true
  }

  await openModal()
  check('the import modal opens', await scrimShown())

  // A website pasted here is a website, not a profile: the button must offer the site scan rather
  // than reporting that there is nothing to import, and pressing it must run that scan.
  await page.fill('[data-socimpinput="1"]', 'example.com')
  await sleep(700)
  const siteLabel = ((await page.textContent('[data-socimpgo="1"]')) ?? '').trim()
  check('a pasted website offers the site scan', /^Scan 1 site$/.test(siteLabel), siteLabel)
  await page.locator('[data-socimpgo="1"]').dispatchEvent('click')
  await sleep(1200)

  // A fast site can finish before the transient progress panel is sampled. In that case the
  // completed result below is the evidence; when the panel is visible, check its contents too.
  const scanPanel = await page.evaluate(() => {
    const scrim = document.querySelector('[data-scanscrim="1"]')
    return {
      open: Boolean(scrim),
      title: (scrim?.querySelector('h2')?.textContent ?? '').trim(),
      note: (scrim?.querySelector('p')?.textContent ?? '').trim(),
      rows: scrim ? scrim.querySelectorAll('li').length : 0,
    }
  })
  console.log('scan panel:', JSON.stringify(scanPanel))
  if (scanPanel.open) {
    check('the scan panel says what it is reading', /Scanning 1 website|Scan complete/.test(scanPanel.title), scanPanel.title)
    check('the scan panel reports progress', /of 1 done ·/.test(scanPanel.note), scanPanel.note)
    check('the scan panel lists the site', scanPanel.rows >= 1, `${scanPanel.rows} row(s)`)
  }
  check('the import modal closed behind it', !(await scrimShown()))

  // The panel closes on its own when the pass is over, and the table is then the sites just scanned.
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const open = await page.evaluate(() => Boolean(document.querySelector('[data-scanscrim="1"]')))
    if (!open) break
    await sleep(500)
  }
  const afterScan = await page.evaluate(() => {
    const list = document.querySelector('[data-soclist="1"]')
    const card = document.querySelector('[data-profcard="1"]')
    const cardTop = card ? Math.round(card.getBoundingClientRect().top) : Number.POSITIVE_INFINITY
    return {
      panel: Boolean(document.querySelector('[data-scanscrim="1"]')),
      rows: list ? list.querySelectorAll('[data-row="1"]').length : 0,
      text: (list?.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 80),
      profileCardInView: cardTop >= 0 && cardTop < window.innerHeight * 0.7,
      cardTop,
    }
  })
  check('the scan panel closes when the pass is over', !afterScan.panel)
  check('and the table holds the site that was scanned', afterScan.rows === 1, `${afterScan.rows} row(s) · ${afterScan.text}`)
  check('and the completed scan brings Profiles into view', afterScan.profileCardInView, `card top ${afterScan.cardTop}px`)

  // Back to the whole list for the checks that follow.
  await page.keyboard.press('Escape')
  await sleep(800)
  await typeSearch('')

  await openModal()
  await page.fill('[data-socimpinput="1"]', ['https://www.instagram.com/haslaw', 'https://www.facebook.com/dylegalconsultants', 'https://www.instagram.com/nobody-knows-this-brand'].join('\n'))
  await sleep(900)
  // The updated design has no separate preview list: the button's own label is what judges the
  // paste before anything is written, and it counts only the lines it will actually file.
  const importLabel = ((await page.textContent('[data-socimpgo="1"]')) ?? '').trim()
  check('the import button says what it will do', /^Import 3 profiles$/.test(importLabel), importLabel)

  // Dispatched rather than clicked: the modal's own buttons sit under a scrim that is still
  // settling, and a click that is retried while that happens never lands. The handler is what
  // matters here, and it is the same one a pointer would run.
  await page.locator('[data-socimpcancel="1"]').dispatchEvent('click')
  await sleep(800)
  check('Cancel closes the modal', !(await scrimShown()))

  await openModal()
  await page.keyboard.press('Escape')
  await sleep(700)
  check('Escape closes the modal', !(await scrimShown()))

  // The count the table starts from is read with the page clear: the modal covers the search box,
  // so anything that works the page has to happen before it opens.
  await typeSearch('')
  const beforeScan = await rows.count()

  await openModal()
  await page.fill('[data-socimpinput="1"]', ['https://www.instagram.com/haslaw', 'https://www.facebook.com/dylegalconsultants', 'https://www.instagram.com/nobody-knows-this-brand'].join('\n'))
  await sleep(700)
  await page.locator('[data-socimpgo="1"]').dispatchEvent('click')
  // The import files the URLs and the coverage card is what reports it: the updated design has no
  // separate overlay, so the card's own bar is the record of the scan. The table is what the scan
  // also changes: it comes down to the URLs just given and lets the rest go.
  for (let attempt = 0; attempt < 40 && (await page.locator('[data-exitscan="1"]').count()) === 0; attempt += 1) await sleep(300)
  const scanState = await page.evaluate(() => ({
    bar: document.querySelectorAll('[data-exitscan="1"]').length,
    scanned: document.querySelectorAll('[data-scanrow]').length,
    label: (document.querySelector('[data-exitscan="1"]')?.parentElement?.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 90),
  }))
  console.log('after the import:', JSON.stringify(scanState))
  check('the coverage card reports the scan', scanState.bar > 0, scanState.label)
  const coverageBar = page.locator('[data-exitscan="1"]')
  check('the coverage card then reports the scan', (await coverageBar.count()) > 0, (await coverageBar.first().textContent())?.trim().slice(0, 60))
  check(
    'the table comes down to the URLs just imported',
    (await rows.count()) === 3,
    `${await rows.count()} of ${beforeScan} rows`,
  )
  await coverageBar.first().scrollIntoViewIfNeeded().catch(() => undefined)
  await sleep(400)
  const barWired = await page.evaluate(() => {
    const bar = document.querySelector('[data-exitscan="1"]')
    if (!bar) return 'no bar'
    const key = Object.keys(bar).find((name) => name.startsWith('__reactProps'))
    return key ? `onClick: ${typeof bar[key].onClick}` : 'no props'
  })
  console.log('coverage bar button:', barWired)
  await coverageBar.first().dispatchEvent('click')
  await sleep(900)
  check('and the bar can be dismissed', !(await page.isVisible('[data-exitscan="1"]')))
  check(
    'and Show all leads puts the whole list back',
    (await rows.count()) === beforeScan,
    `${await rows.count()} of ${beforeScan} rows`,
  )
  // The import is confirmed where it is recorded: the history panel lists it as one entry.
  await page.locator('[data-shistopen="1"]').dispatchEvent('click')
  await sleep(900)
  const logAfterImport = await page.$$eval('[data-shrow="1"]', (rows) =>
    rows.map((row) => (row.innerText || row.textContent || '').replace(/\s+/g, ' ').trim()),
  )
  check(
    'the import is recorded in the history panel',
    logAfterImport.some((text) => /import/i.test(text) && /profile URL/i.test(text)),
    logAfterImport.slice(0, 2).join(' | '),
  )
  await page.locator('[aria-label="Close history"]').dispatchEvent('click')
  await sleep(500)
  check('Import closes the modal too', !(await scrimShown()))

  await typeSearch('HAS Law')
  // A profile link shows the platform's short code and carries its saved URL.
  const chips = await page.evaluate((selector) =>
    Array.from(document.querySelectorAll(`${selector} [data-row="1"] a[data-social-profile-link]`)).map((chip) => chip.getAttribute('href')),
    list,
  )
  check(
    'the imported profile shows on its lead',
    chips.some((url) => /instagram\.com\/haslaw/i.test(url)),
    chips.join(', ') || '(no chips)',
  )

  // ---- a URL that matches no lead at all: it gets a lead of its own, and the profile is on it
  await typeSearch('Nobody Knows This Brand')
  const randomRow = page.locator(`${list} [data-row="1"]`)
  const randomChips = await page.evaluate((selector) =>
    Array.from(document.querySelectorAll(`${selector} [data-row="1"] a[data-social-profile-link]`)).map((chip) => chip.getAttribute('href')),
    list,
  )
  check('a random URL becomes its own lead', (await randomRow.count()) === 1, `${await randomRow.count()} row(s)`)
  check(
    'and that lead carries the profile',
    randomChips.some((url) => /instagram\.com\/nobody-knows-this-brand/i.test(url)),
    randomChips.join(', ') || '(no chips)',
  )

  // Changing the filter after an import must return to the full table before applying it; the
  // imported-only result view would otherwise keep showing rows excluded by the filter.
  await typeSearch('')
  await openModal()
  await page.fill('[data-socimpinput="1"]', 'https://www.instagram.com/filter-exit-smoke-test')
  await sleep(600)
  await page.locator('[data-socimpgo="1"]').dispatchEvent('click')
  for (let attempt = 0; attempt < 30 && (await page.locator('[data-exitscan="1"]').count()) === 0; attempt += 1) await sleep(200)
  check('new import opens its result view', (await page.locator('[data-exitscan="1"]').count()) > 0)
  await page.selectOption('[data-socfilter="1"]', { label: 'Pending' })
  await sleep(700)
  check('changing the filter leaves the imported-only view', (await page.locator('[data-exitscan="1"]').count()) === 0)
  const pendingRows = await rows.count()
  const pendingLinks = await page.locator(`${list} [data-row="1"] a[data-social-profile-link]`).count()
  check('Pending filter has no profile links', pendingRows > 0 && pendingLinks === 0, `${pendingRows} rows · ${pendingLinks} links`)

  // A scan may still have an enrichment browser request winding down. The assertions above are
  // complete once the page has reported the result, so do not let Electron shutdown hold the
  // verification process open indefinitely.
  await Promise.race([app.close(), sleep(3000)])
  try {
    const safeRoot = realpathSync(root)
    if (safeRoot.startsWith(resolve(tmpdir()) + sep) && basename(safeRoot).startsWith('leadsnap-social-')) {
      rmSync(safeRoot, { recursive: true, force: true })
    }
  } catch {
    // A leftover temp folder is not worth failing the checks over.
  }

  const failed = results.filter((result) => !result.ok).length
  console.log('')
  console.log(`${results.length - failed}/${results.length} checks passed`)
  process.exit(failed ? 1 : 0)
}

main().catch((error) => {
  console.error('social page check failed:', error.message)
  process.exit(1)
})
