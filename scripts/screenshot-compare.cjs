// Visual check: renders the original shared document and the ported app side by side and
// writes a screenshot per view into the scratchpad so they can be compared.
const { chromium, _electron } = require('playwright')
const path = require('node:path')

const OUT = process.env.COMMANDCODE_SCRATCHPAD || '.'
const VIEWS = ['dashboard', 'maps', 'social', 'email', 'phone', 'dm', 'website', 'leads', 'lists', 'runs', 'settings']
const REFERENCE = path.join(process.cwd(), 'reference.html')

async function captureViews(page, prefix) {
  for (const view of VIEWS) {
    const nav = page.locator(`[data-view="${view}"]`).first()
    if (await nav.count()) {
      await nav.click({ timeout: 5000 }).catch(() => undefined)
      await page.waitForTimeout(700)
    }
    await page.screenshot({ path: path.join(OUT, `${prefix}-${view}.png`) })
    console.log(`  captured ${prefix}-${view}`)
  }
}

async function captureReference() {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
  await page.goto(`file://${REFERENCE.replace(/\\/g, '/')}`)
  await page.waitForSelector('[data-view="dashboard"]', { timeout: 30000 })
  await page.evaluate(() => {
    document.getElementById('__bundler_thumbnail')?.remove()
    document.getElementById('__bundler_loading')?.remove()
  })
  await page.waitForTimeout(1500)
  await captureViews(page, 'ref')
  await browser.close()
}

async function capturePort() {
  const app = await _electron.launch({ args: ['.'], cwd: process.cwd() })
  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  await app.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0]
    window.setContentSize(1440, 900)
  })
  await page.waitForSelector('[data-view="dashboard"]', { timeout: 30000 })
  await page.waitForTimeout(1200)
  await captureViews(page, 'port')
  await app.close()
}

async function main() {
  console.log('capturing reference…')
  await captureReference()
  console.log('capturing port…')
  await capturePort()
  console.log('done')
}

main().catch((error) => {
  console.error('compare failed:', error.message)
  process.exitCode = 1
})
