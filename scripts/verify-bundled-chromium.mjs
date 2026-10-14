import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { chromium } from 'playwright'

const browsers = process.env.PLAYWRIGHT_BROWSERS_PATH
assert.ok(browsers && existsSync(browsers), 'Packaged Playwright browsers folder is missing.')
const executable = chromium.executablePath()
assert.ok(executable.startsWith(browsers) && existsSync(executable), 'Packaged Chromium executable is missing.')
for (const headless of [true, false]) {
  const browser = await chromium.launch({ headless })
  try {
    const page = await browser.newPage()
    await page.goto('data:text/html,<title>Nafran browser check</title>')
    assert.equal(await page.title(), 'Nafran browser check')
  } finally {
    await browser.close()
  }
}
console.log('PASS  bundled Chromium launches in headless and visible modes')
