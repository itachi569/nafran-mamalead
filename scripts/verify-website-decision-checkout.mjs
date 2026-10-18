import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { chromium } from 'playwright'

const site = resolve(import.meta.dirname, '../website')
const server = createServer((request, response) => {
  const file = new URL(request.url, 'http://127.0.0.1').pathname.slice(1) || 'index.html'
  if (!/^(?:index\.html|sales\.js|support\.js|fonts\/[\w.-]+|img\/[\w./-]+|lottie\/[\w./-]+)$/.test(file)) {
    response.writeHead(404).end()
    return
  }
  try {
    response.writeHead(200, { 'content-type': file.endsWith('.js') ? 'text/javascript' : file.endsWith('.html') ? 'text/html' : 'application/octet-stream' })
    response.end(readFileSync(join(site, file)))
  } catch { response.writeHead(404).end() }
})
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
let browser
try {
  browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()
  await page.route('https://api.mamalead.com/v1/download-options', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ windows: true, macArm64: false, macX64: false }) }))
  await page.goto(`http://127.0.0.1:${server.address().port}/#pricing`)
  const handoff = page.locator('[data-decision-handoff="1"]')
  await page.locator('[data-decision-handoff="1"][data-dc-tpl]').waitFor()
  assert.equal(await handoff.getAttribute('href'), 'mamalead://subscribe/decision-makers')
  assert.match(await handoff.innerText(), /Subscribe · Rs 1,000/)
  const pricing = await page.locator('#pricing').innerText()
  assert.match(pricing, /1,000 searches or 30 days, whichever comes first/)
  assert.match(pricing, /There is no automatic renewal/)
  assert.match(pricing, /no key is emailed/)
  assert.match(pricing, /Download app to start trial/)
  assert.match(pricing, /Download app to buy Lifetime/)
  assert.match(pricing, /Already installed\? Subscribe opens the app and takes you straight to Stripe payment/)
  await page.evaluate(() => document.querySelector('[data-decision-handoff="1"]').addEventListener('click', (event) => event.preventDefault(), { capture: true }))
  await page.route('https://api.mamalead.com/v1/download?platform=windows', (route) => route.fulfill({ status: 200, headers: { 'content-disposition': 'attachment; filename="MamaLead-test.exe"' }, body: 'MZ' }))
  const downloadRequest = page.waitForRequest('https://api.mamalead.com/v1/download?platform=windows', { timeout: 10_000 })
  await handoff.click()
  await downloadRequest
  assert.match(page.url(), /#download$/)
  if (process.env.NAFRAN_CAPTURE_SITE_PREVIEW === '1') {
    await page.setViewportSize({ width: 1440, height: 1100 })
    await page.locator('#pricing').scrollIntoViewIfNeeded()
    await page.waitForTimeout(1250)
    await page.screenshot({ path: join(tmpdir(), 'mamalead-pricing-preview.png') })
  }
  await page.setViewportSize({ width: 390, height: 844 })
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false)
  const macPage = await browser.newPage({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 Chrome/130.0 Safari/537.36' })
  await macPage.route('https://api.mamalead.com/v1/download-options', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ windows: true, macArm64: true, macX64: true }) }))
  await macPage.goto(`http://127.0.0.1:${server.address().port}/#download`)
  await macPage.waitForFunction(() => ['mac-arm64', 'mac-x64'].every((platform) => {
    const link = document.querySelector(`[data-public-download="${platform}"]`)
    return link?.href.includes(`/v1/download?platform=${platform}`) && link.textContent.includes('Mac test build')
  }))
  assert.match(await macPage.locator('[data-mac-download-status]').innerText(), /unsigned test builds/)
  await macPage.close()
  console.log('PASS  website Subscribe opens the app or falls back to installer download, with manual Decision Makers pass rules')
} finally {
  if (browser) await browser.close()
  await new Promise((resolve) => server.close(resolve))
}
