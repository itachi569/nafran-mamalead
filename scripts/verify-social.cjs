// Verifies the Social Profiles page: it renders the reference sample rows in offline demo
// mode, the Refresh action is wired, and the port matches the original document.
const { chromium, _electron } = require('playwright')
const path = require('node:path')

const OUT = process.env.COMMANDCODE_SCRATCHPAD || '.'
const REFERENCE = path.join(process.cwd(), 'reference.html')

const results = []
function check(name, ok, detail = '') {
  results.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` · ${detail}` : ''}`)
}

async function captureReference() {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await page.goto(`file://${REFERENCE.replace(/\\/g, '/')}`)
  await page.waitForSelector('[data-view="social"]', { timeout: 30000 })
  await page.evaluate(() => document.getElementById('__bundler_thumbnail')?.remove())
  await page.click('[data-view="social"]')
  await page.waitForTimeout(900)
  await page.screenshot({ path: path.join(OUT, 'ref-social-profiles.png') })
  const summary = await page.evaluate(() => ({
    rows: document.querySelectorAll('[data-soclist] > li').length,
    donuts: document.querySelectorAll('circle[stroke-dashoffset]').length,
    title: document.querySelector('h1')?.textContent?.trim(),
  }))
  await browser.close()
  return summary
}

async function main() {
  const reference = await captureReference()
  console.log('reference:', JSON.stringify(reference))

  const app = await _electron.launch({ args: ['.'], cwd: process.cwd() })
  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0].setContentSize(1440, 900)
  })
  await page.waitForSelector('[data-view="social"]', { timeout: 30000 })

  const consoleErrors = []
  page.on('pageerror', (error) => consoleErrors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })

  await page.click('[data-view="social"]')
  await page.waitForTimeout(1200)

  check('page renders', (await page.textContent('h1')).trim() === 'Social Profiles', (await page.textContent('h1')).trim())

  const port = await page.evaluate(() => ({
    rows: document.querySelectorAll('[data-soclist] > li').length,
    donuts: document.querySelectorAll('circle[stroke-dashoffset]').length,
    stateRows: Array.from(document.querySelectorAll('[data-soclist] > li')).filter((li) => /Loading|Could not load|No leads yet/.test(li.textContent || '')).length,
    firstRow: (document.querySelector('[data-soclist] > li')?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 70),
    chips: document.querySelectorAll('[data-soclist] span[title]').length,
  }))
  check('row count matches the reference', port.rows === reference.rows, `reference ${reference.rows}, port ${port.rows}`)
  check('coverage rings match', port.donuts === reference.donuts, `reference ${reference.donuts}, port ${port.donuts}`)
  check('profile chips rendered', port.chips > 0, `${port.chips} chips`)
  check('no state row while demo data is shown', port.stateRows === 0)
  check('rows show reference content', port.firstRow.startsWith('001'), port.firstRow)

  await page.screenshot({ path: path.join(OUT, 'port-social-profiles.png') })

  // The Refresh button is bound to the real load path rather than the demo toast.
  await page.click('button:has-text("Refresh")')
  await page.waitForTimeout(1200)
  const afterRefresh = await page.evaluate(() => document.querySelectorAll('[data-soclist] > li').length)
  check('refresh reloads the page data', afterRefresh === reference.rows, `${afterRefresh} rows after refresh`)
  check('no console errors', consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | '))

  await app.close()

  const failed = results.filter((entry) => !entry.ok)
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
  if (failed.length) process.exitCode = 1
}

main().catch((error) => {
  console.error('verify failed:', error.message)
  process.exitCode = 1
})
