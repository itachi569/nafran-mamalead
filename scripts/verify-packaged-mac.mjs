import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { _electron as electron } from 'playwright'

if (process.platform !== 'darwin') throw new Error('This check must run on macOS.')

const release = resolve(import.meta.dirname, '../release')
const appFolder = readdirSync(release, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => join(release, entry.name, 'Nafran Leads Scraper.app'))
  .find(existsSync)
if (!appFolder) throw new Error('The packaged Mac .app was not found.')
const executablePath = join(appFolder, 'Contents', 'MacOS', 'Nafran Leads Scraper')
const directory = mkdtempSync(join(tmpdir(), 'nafran-mac-smoke-'))
let desktop
try {
  desktop = await electron.launch({
    executablePath,
    args: [`--user-data-dir=${join(directory, 'profile')}`],
    timeout: 90_000,
  })
  const page = await desktop.firstWindow()
  await page.locator('[data-view="dashboard"]').first().waitFor({ timeout: 45_000 })
  const runtime = await desktop.evaluate(async ({ app }) => {
    const { existsSync } = require('node:fs')
    const { chromium } = require('playwright')
    const browsers = process.env.PLAYWRIGHT_BROWSERS_PATH || ''
    const executable = chromium.executablePath()
    const browser = await chromium.launch({ headless: true })
    try {
      const browserPage = await browser.newPage()
      await browserPage.goto('data:text/html,<title>Nafran browser check</title>')
      return {
        packaged: app.isPackaged,
        browsers,
        executable,
        exists: existsSync(executable),
        title: await browserPage.title(),
      }
    } finally {
      await browser.close()
    }
  })
  assert.equal(runtime.packaged, true)
  assert.match(runtime.browsers, /playwright-browsers$/)
  assert.equal(runtime.exists, true)
  assert.equal(runtime.title, 'Nafran browser check')
  assert.ok(runtime.executable.startsWith(runtime.browsers))
  console.log('PASS  packaged Mac app launches its bundled Chromium')

  await page.locator('[data-view="settings"]').first().click()
  await page.locator('[data-stab="acct"]').first().click()
  await page.locator('#nafran-license-key').waitFor()
  await page.locator('[data-view="maps"]').first().click()
  console.log('PASS  Mac app opens Settings, licence entry, and Maps')
} finally {
  if (desktop) await desktop.close().catch(() => {})
  rmSync(directory, { recursive: true, force: true })
}
