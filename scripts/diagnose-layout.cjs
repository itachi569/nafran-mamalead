// Diagnostic: compares the same elements in the reference document and the ported app so
// layout or visibility differences can be pinpointed instead of guessed at.
const { chromium, _electron } = require('playwright')
const path = require('node:path')

const OUT = process.env.COMMANDCODE_SCRATCHPAD || '.'
const REFERENCE = path.join(process.cwd(), 'reference.html')
const SELECTORS = [
  '[data-view="social"]',
  '[data-view="social"] [data-addon]',
  '[data-view="social"] [data-tail]',
  '[data-view="social"] [data-arrow]',
  '[data-view="dashboard"] [data-arrow]',
  '[data-view="dashboard"] [data-tail]',
  '[data-sidebar]',
  '[data-shell]',
]

const probe = (selectors) =>
  selectors.map((selector) => {
    const element = document.querySelector(selector)
    if (!element) return { selector, missing: true }
    const style = getComputedStyle(element)
    const box = element.getBoundingClientRect()
    return {
      selector,
      display: style.display,
      width: Math.round(box.width * 10) / 10,
      height: Math.round(box.height * 10) / 10,
      visibility: style.visibility,
      overflow: style.overflow,
      text: (element.textContent || '').trim().slice(0, 24),
    }
  })

async function main() {
  const browser = await chromium.launch()
  const referencePage = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await referencePage.goto(`file://${REFERENCE.replace(/\\/g, '/')}`)
  await referencePage.waitForSelector('[data-view="dashboard"]', { timeout: 30000 })
  await referencePage.evaluate(() => document.getElementById('__bundler_thumbnail')?.remove())
  await referencePage.waitForTimeout(800)
  const referenceProbe = await referencePage.evaluate(probe, SELECTORS)
  await referencePage.locator('[data-sidebar]').screenshot({ path: path.join(OUT, 'ref-sidebar.png') })
  await browser.close()

  const app = await _electron.launch({ args: ['.'], cwd: process.cwd() })
  const portPage = await app.firstWindow()
  await portPage.waitForLoadState('domcontentloaded')
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0].setContentSize(1440, 900)
  })
  await portPage.waitForSelector('[data-view="dashboard"]', { timeout: 30000 })
  await portPage.waitForTimeout(800)
  const portProbe = await portPage.evaluate(probe, SELECTORS)
  await portPage.locator('[data-sidebar]').screenshot({ path: path.join(OUT, 'port-sidebar.png') })
  await app.close()

  for (let index = 0; index < SELECTORS.length; index += 1) {
    const a = referenceProbe[index]
    const b = portProbe[index]
    const same = JSON.stringify(a) === JSON.stringify(b)
    console.log(`${same ? 'same  ' : 'DIFF  '} ${SELECTORS[index]}`)
    if (!same) {
      console.log('   reference:', JSON.stringify(a))
      console.log('   port     :', JSON.stringify(b))
    }
  }
}

main().catch((error) => {
  console.error('diagnose failed:', error.message)
  process.exitCode = 1
})
