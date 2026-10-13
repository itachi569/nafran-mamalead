// Verifies the ported app end to end inside Electron: the theme toggle, the chat assistant, a
// real Chromium Google Maps run wired to the Maps screen, and the import/export modals.
const { _electron } = require('playwright')

const results = []
function check(name, ok, detail = '') {
  results.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` · ${detail}` : ''}`)
}

async function main() {
  const app = await _electron.launch({ args: ['.'], cwd: process.cwd() })
  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0].setContentSize(1440, 900)
  })
  await page.waitForSelector('[data-view="dashboard"]', { timeout: 30000 })
  await page.waitForTimeout(1000)

  const shot = process.env.COMMANDCODE_SCRATCHPAD || '.'

  // ---- the reference shell rendered
  check('shell renders', (await page.textContent('h1')).trim() === 'Good Afternoon, Nafran', (await page.textContent('h1')).trim())
  check('sidebar nav present', (await page.$$('[data-view]')).length >= 11, `${(await page.$$('[data-view]')).length} nav items`)

  // ---- dark / light theme toggle
  const before = await page.getAttribute('body', 'data-theme')
  await page.click('[data-theme-btn]')
  await page.waitForTimeout(600)
  const darkTheme = await page.getAttribute('body', 'data-theme')
  const darkSurface = await page.evaluate(() => {
    const card = document.querySelector('[data-account]')
    return card ? getComputedStyle(card).backgroundColor : ''
  })
  check('theme toggles to dark', before === 'light' && darkTheme === 'dark', `${before} → ${darkTheme}`)
  check('dark theme repaints inline colours', !/rgb\(245,\s*245,\s*244\)/.test(darkSurface), darkSurface)
  await page.screenshot({ path: `${shot}/verify-dark.png` })

  await page.click('[data-theme-btn]')
  await page.waitForTimeout(500)
  check('theme toggles back to light', (await page.getAttribute('body', 'data-theme')) === 'light')

  // ---- chat assistant
  await page.click('[data-assist="1"]')
  await page.waitForTimeout(500)
  const chatVisible = await page.isVisible('[data-chatscroll]')
  const beforeCount = (await page.$$('[data-chatscroll] > *')).length
  await page.fill('[data-chatinput]', 'Why are emails missing?')
  await page.press('[data-chatinput]', 'Enter')
  await page.waitForTimeout(1600)
  const afterCount = (await page.$$('[data-chatscroll] > *')).length
  check('chat opens', chatVisible)
  check('chat replies', afterCount > beforeCount, `${beforeCount} → ${afterCount} messages`)
  await page.screenshot({ path: `${shot}/verify-chat.png` })
  await page.click('[aria-label="Close chat"]')
  await page.waitForTimeout(400)

  // ---- real scrape from the Maps screen
  await page.click('[data-view="maps"]')
  await page.waitForTimeout(500)
  for (const chip of await page.$$('[data-kw="1"]')) await chip.click()
  await page.fill('[data-kwinput]', 'dentist')
  await page.press('[data-kwinput]', 'Enter')
  for (let i = 0; i < 4; i += 1) await page.click('[aria-label="Fewer results"]')
  await page.waitForTimeout(300)
  const cap = (await page.textContent('[data-setup] span[style*="font-size:19px"]')).trim()
  check('scrape configured', cap === '5', `cap ${cap}, keywords ${(await page.$$('[data-kw="1"]')).length}`)

  await page.click('[data-runbtn="1"]')
  await page.waitForFunction(() => document.querySelector('[data-runbtn="1"]')?.getAttribute('data-state') === 'run', null, { timeout: 30000 })
  check('run starts from the UI', true)
  await page.waitForTimeout(7000)
  const live = await page.evaluate(() => {
    const header = Array.from(document.querySelectorAll('span')).map((n) => n.textContent || '')
    return {
      side: document.querySelector('[data-account] span span')?.textContent?.trim(),
      scanning: header.find((t) => t.startsWith('Scanning') || t.startsWith('Captured')) || '',
    }
  })
  check('progress streams into the header', live.side === 'RUNNING', `${live.side} · ${live.scanning.slice(0, 60)}`)
  await page.screenshot({ path: `${shot}/verify-running.png` })

  await page.waitForFunction(() => document.querySelector('[data-runbtn="1"]')?.getAttribute('data-state') === 'idle', null, { timeout: 240000 })
  const summaryNote = await page.evaluate(() => {
    const text = Array.from(document.querySelectorAll('span')).map((node) => node.textContent || '')
    return text.find((value) => /results from \d+ keywords/.test(value)) || ''
  })
  check('run finishes and reports results', /results from 1 keywords/.test(summaryNote), summaryNote.slice(0, 80))

  await page.click('[data-view="leads"]')
  await page.waitForTimeout(1200)
  const rows = await page.$$eval('[data-row]', (nodes) =>
    nodes.map((node) => node.textContent.replace(/\s+/g, ' ').trim()).filter((text) => text.length > 40),
  )
  check('captured leads reach the table', rows.length > 0, `${rows.length} rows`)
  const hasRealContact = rows.some((row) => /\+44|\+1|www\.|https/.test(row))
  check('table shows real scraped contact data', hasRealContact, rows[0]?.slice(0, 90) || '')
  await page.screenshot({ path: `${shot}/verify-leads.png` })

  // ---- export and import modals
  await page.click('[data-view="maps"]')
  await page.waitForTimeout(500)
  await page.locator('button:has-text("Export CSV")').first().click()
  await page.waitForTimeout(700)
  const exportOpen = await page.evaluate(() => document.body.innerText.includes('Written straight to disk') || document.body.innerText.includes('Export leads'))
  check('export modal opens', exportOpen)
  await page.screenshot({ path: `${shot}/verify-export.png` })

  await page.keyboard.press('Escape').catch(() => undefined)
  const importTrigger = page.locator('[data-attn="1"]').first()
  if (await importTrigger.count()) {
    await importTrigger.click()
    await page.waitForTimeout(700)
    const importOpen = await page.evaluate(() => Boolean(document.querySelector('textarea')))
    check('import modal opens', importOpen)
    await page.screenshot({ path: `${shot}/verify-import.png` })
  } else {
    check('import modal opens', false, 'no trigger found')
  }

  await app.close()

  const failed = results.filter((entry) => !entry.ok)
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
  if (failed.length) process.exitCode = 1
}

main().catch((error) => {
  console.error('verify failed:', error.message)
  process.exitCode = 1
})
