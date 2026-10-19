import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { _electron as electron } from 'playwright'

if (process.platform !== 'darwin') throw new Error('This check must run on macOS.')

const release = resolve(import.meta.dirname, '../release')
const appFolder = readdirSync(release, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => join(release, entry.name, 'MamaLead.app'))
  .find(existsSync)
if (!appFolder) throw new Error('The packaged Mac .app was not found.')
const infoPath = join(appFolder, 'Contents', 'Info.plist')
const bundleName = spawnSync('plutil', ['-extract', 'CFBundleName', 'raw', '-o', '-', infoPath], { encoding: 'utf8' })
assert.equal(bundleName.status, 0, bundleName.stderr)
assert.equal(bundleName.stdout.trim(), 'MamaLead')
assert.equal(existsSync(join(appFolder, 'Contents', 'Resources', 'icon.icns')), true)
console.log('PASS  Mac app bundle is named MamaLead and includes its custom icon')
const executablePath = join(appFolder, 'Contents', 'MacOS', 'MamaLead')
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
  const runtime = await desktop.evaluate(({ app }) => ({
    packaged: app.isPackaged,
    browsers: process.env.PLAYWRIGHT_BROWSERS_PATH || '',
  }))
  assert.equal(runtime.packaged, true)
  assert.match(runtime.browsers, /playwright-browsers$/)
  assert.equal(existsSync(runtime.browsers), true)
  const browserCheck = spawnSync(process.execPath, [resolve(import.meta.dirname, 'verify-bundled-chromium.mjs')], {
    cwd: resolve(import.meta.dirname, '..'),
    env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: runtime.browsers },
    encoding: 'utf8', timeout: 60_000,
  })
  if (browserCheck.error) throw browserCheck.error
  assert.equal(browserCheck.status, 0, `${browserCheck.stdout}\n${browserCheck.stderr}`)
  process.stdout.write(browserCheck.stdout)
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
