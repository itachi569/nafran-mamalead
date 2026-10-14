import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { chromium } from 'playwright'

const site = resolve(import.meta.dirname, '../website')
let macArm64 = false
let macX64 = false
const server = createServer((request, response) => {
  const path = new URL(request.url, 'http://127.0.0.1').pathname
  if (path === '/v1/download-options') {
    response.writeHead(200, { 'content-type': 'application/json' })
    response.end(JSON.stringify({ windows: true, macArm64, macX64 }))
    return
  }
  const file = path === '/' ? 'index.html' : path.slice(1)
  if (!/^(?:index\.html|sales\.js|support\.js|fonts\/[\w.-]+|img\/[\w./-]+|lottie\/[\w./-]+)$/.test(file)) {
    response.writeHead(404).end()
    return
  }
  try {
    let body = readFileSync(join(site, file))
    if (file === 'index.html') {
      const origin = `http://127.0.0.1:${server.address().port}`
      body = Buffer.from(body.toString().replace('<script src="./sales.js"', `<script src="./sales.js" data-billing-api="${origin}"`))
    }
    const type = file.endsWith('.js') ? 'text/javascript' : file.endsWith('.html') ? 'text/html' : 'application/octet-stream'
    response.writeHead(200, { 'content-type': type }).end(body)
  } catch {
    response.writeHead(404).end()
  }
})
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
let browser
try {
  browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()
  page.on('pageerror', (error) => console.error('PAGE ERROR', error.message))
  const origin = `http://127.0.0.1:${server.address().port}`
  const optionsResponse = page.waitForResponse((response) => response.url().endsWith('/v1/download-options'))
  await page.goto(`${origin}/#download`)
  assert.deepEqual(await (await optionsResponse).json(), { windows: true, macArm64: false, macX64: false })
  const windows = page.locator('[data-public-download="windows"]')
  const arm = page.locator('[data-public-download="mac-arm64"]')
  const intel = page.locator('[data-public-download="mac-x64"]')
  await arm.waitFor()
  assert.match(await windows.getAttribute('href'), /platform=windows$/)
  assert.equal(await arm.getAttribute('aria-disabled'), 'true')
  assert.equal(await intel.getAttribute('aria-disabled'), 'true')
  console.log('PASS  Windows link works while absent Mac installers stay disabled')

  macArm64 = true
  macX64 = true
  const enabledResponse = page.waitForResponse((response) => response.url().endsWith('/v1/download-options'))
  await page.reload()
  assert.deepEqual(await (await enabledResponse).json(), { windows: true, macArm64: true, macX64: true })
  await page.waitForFunction(() => document.querySelector('[data-public-download="mac-x64"]')?.getAttribute('href')?.includes('platform=mac-x64'))
  assert.match(await arm.getAttribute('href'), /platform=mac-arm64$/)
  assert.match(await intel.getAttribute('href'), /platform=mac-x64$/)
  assert.equal(await arm.getAttribute('aria-disabled'), null)
  assert.equal(await intel.getAttribute('aria-disabled'), null)
  console.log('PASS  website enables the matching Apple Silicon and Intel links when installers exist')
} finally {
  if (browser) await browser.close()
  await new Promise((resolve) => server.close(resolve))
}
