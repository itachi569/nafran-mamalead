// Verifies the Email Finder page: it renders the reference pipeline, confidence mix and address
// rows in offline demo mode, the Refresh action is wired, and the port matches the original
// document.
const { chromium, _electron } = require('playwright')
const path = require('node:path')

const OUT = process.env.COMMANDCODE_SCRATCHPAD || '.'
const REFERENCE = path.join(process.cwd(), 'reference.html')

const results = []
function check(name, ok, detail = '') {
  results.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` · ${detail}` : ''}`)
}

// Both documents carry the same markup, so one reader describes each of them.
function readEmailPage() {
  const text = (node) => (node?.textContent ?? '').replace(/\s+/g, ' ').trim()
  const background = (node) => (node ? getComputedStyle(node).backgroundColor : '')
  const find = (value) => {
    const target = Array.from(document.querySelectorAll('p, div, span')).find((node) => text(node) === value)
    return target ?? null
  }

  const cascade = document.querySelector('[data-cascade]')
  const steps = Array.from(cascade.children).map((step) => {
    const parts = Array.from(step.querySelector('div').children)
    return {
      count: text(parts[0]),
      label: text(parts[1]),
      note: text(parts[2]),
      width: parts[3].querySelector('span').style.width,
      arrow: Boolean(step.querySelector('span[aria-hidden="true"]')),
    }
  })

  const histogram = document.querySelector('span[title^="score "]').parentElement
  const buckets = Array.from(histogram.children).map((bar) => ({
    title: bar.getAttribute('title'),
    height: bar.querySelector('span').style.height,
    color: background(bar.querySelector('span')),
  }))

  const chipRow = Array.from(document.querySelectorAll('span')).find((node) => node.querySelector('strong') && /^(High|Domain|Low|Not verified)\b/.test(text(node)))
  const chips = Array.from(chipRow.parentElement.children).map((chip) => ({
    label: text(chip).replace(/\s+\d+$/, ''),
    count: text(chip.querySelector('strong')),
    color: background(chip.querySelector('span')),
  }))

  const head = document.querySelector('[data-mailhead]')
  const list = head.parentElement.querySelector('ul')
  const rows = Array.from(list.children)
    .filter((node) => node.tagName === 'LI')
    .map((row) => {
      const cells = Array.from(row.children)
      const chip = cells[5].children[0]
      const meter = Array.from(cells[5].children).find((node) => node !== chip)
      const status = cells[6]
      return {
        index: text(cells[1]),
        name: text(cells[2]),
        domain: text(cells[3]),
        primary: text(cells[4]),
        chip: text(chip),
        chipColor: background(chip),
        bars: meter ? Array.from(meter.children).map(background) : [],
        status: text(status),
        statusWeight: status ? getComputedStyle(status).fontWeight : '',
      }
    })

  return {
    title: text(document.querySelector('h1')),
    cascadeNote: document.querySelector('[data-cascade]').parentElement.querySelector('p').textContent.trim(),
    badge: text(document.querySelector('[data-cascade]').parentElement.querySelector('span strong')),
    steps,
    mixNote: text(find('Deliverability score of all 53 extracted addresses.')),
    buckets,
    chips,
    tiles: Array.from(document.querySelectorAll('div')).filter((node) => /^\d+ leads$/.test(text(node)) || /^\d+(\.\d+)? emails$/.test(text(node))).map(text),
    bulkNote: text(find('75 leads still have no address on file.')),
    bulk: ['Find & verify needed', 'Advanced SMTP check', 'Deep search missing'].map((label) => {
      const button = Array.from(document.querySelectorAll('button')).find((node) => text(node).startsWith(label))
      return text(button).slice(label.length).trim()
    }),
    sweepNote: text(find('Showing 10 of 128 leads.')),
    rows,
  }
}

async function openReference(browser) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await page.goto(`file://${REFERENCE.replace(/\\/g, '/')}`)
  await page.waitForSelector('[data-view="email"]', { timeout: 30000 })
  await page.evaluate(() => document.getElementById('__bundler_thumbnail')?.remove())
  await page.click('[data-view="email"]')
  await page.waitForTimeout(900)
  await page.screenshot({ path: path.join(OUT, 'ref-email-finder.png') })
  return page
}

async function main() {
  const browser = await chromium.launch()
  const referencePage = await openReference(browser)
  const reference = await referencePage.evaluate(readEmailPage)
  await browser.close()
  console.log('reference:', JSON.stringify({ title: reference.title, rows: reference.rows.length, buckets: reference.buckets.length }))

  const app = await _electron.launch({ args: ['.'], cwd: process.cwd() })
  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0].setContentSize(1440, 900)
  })
  await page.waitForSelector('[data-view="email"]', { timeout: 30000 })

  const consoleErrors = []
  page.on('pageerror', (error) => consoleErrors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })

  await page.click('[data-view="email"]')
  await page.waitForTimeout(1200)

  const port = await page.evaluate(readEmailPage)
  check('page renders', port.title === 'Email Finder', port.title)

  for (const key of Object.keys(reference)) {
    if (key === 'title') continue
    const same = JSON.stringify(reference[key]) === JSON.stringify(port[key])
    let detail = ''
    if (!same) {
      const expected = Array.isArray(reference[key]) ? reference[key] : [reference[key]]
      const actual = Array.isArray(port[key]) ? port[key] : [port[key]]
      const firstDiff = expected.findIndex((entry, index) => JSON.stringify(entry) !== JSON.stringify(actual[index]))
      detail = `#${firstDiff} reference ${JSON.stringify(expected[firstDiff])} | port ${JSON.stringify(actual[firstDiff])}`
    }
    check(`${key} matches the reference`, same, detail)
  }

  check('no state row while demo data is shown', !port.rows.some((row) => /Loading|Could not load|No leads yet/.test(row.name + row.status)))

  await page.screenshot({ path: path.join(OUT, 'port-email-finder.png') })

  // The Refresh button is bound to the real load path rather than the demo toast.
  await page.click('button:has-text("Refresh")')
  await page.waitForTimeout(1200)
  const afterRefresh = await page.evaluate(readEmailPage)
  check('refresh reloads the page data', JSON.stringify(afterRefresh.rows) === JSON.stringify(reference.rows), `${afterRefresh.rows.length} rows after refresh`)
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
