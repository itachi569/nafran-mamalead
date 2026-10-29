// Real packaged IPC, settings persistence and notifications; no installer is downloaded or run.
const assert = require('node:assert/strict')
const { _electron } = require('playwright')
const { mkdtempSync, mkdirSync, readFileSync, writeFileSync } = require('node:fs')
const { resolve, join } = require('node:path')
const { tmpdir } = require('node:os')
const root = resolve(__dirname, '..')
const executablePath = resolve(process.argv[2] || join(root, 'release/auto-update/win-unpacked/MamaLead.exe'))
const directory = mkdtempSync(join(tmpdir(), 'mamalead-auto-update-ui-'))
const output = join(root, 'screenshots/auto-updates')
mkdirSync(output, { recursive: true })
const checks = [], errors = []
let desktop, page
async function until(read, test) {
  const deadline = Date.now() + 15000
  while (Date.now() < deadline) { const value = await read(); if (test(value)) return value; await new Promise(r => setTimeout(r, 70)) }
  throw Error('Expected state was not reached')
}
async function launch() {
  const env = { ...process.env, APPDATA: join(directory, 'appdata') }
  delete env.ELECTRON_RUN_AS_NODE; delete env.VITE_DEV_SERVER_URL
  desktop = await _electron.launch({ executablePath, args: [`--user-data-dir=${join(directory, 'profile')}`], env, timeout: 60000 })
  await desktop.evaluate(({ app }) => {
    const req = process.getBuiltinModule('module').createRequire(app.getAppPath() + '/package.json')
    const updater = req('electron-updater').autoUpdater
    const test = globalThis.__updatesTest = { updater, downloads: 0, installs: 0, userData: app.getPath('userData') }
    updater.checkForUpdates = async () => { updater.emit('checking-for-update'); updater.emit('update-available', { version: '1.4.18' }) }
    updater.downloadUpdate = () => { test.downloads++; updater.emit('download-progress', { percent: 42 }); return new Promise(resolve => { test.finish = resolve }) }
    updater.quitAndInstall = () => { test.installs++ }
  })
  page = await desktop.firstWindow()
  page.on('pageerror', error => errors.push(error.message))
  await page.setViewportSize({ width: 1280, height: 950 })
  await page.locator('[data-view="dashboard"]').waitFor()
  await page.evaluate(() => localStorage.setItem('nafran.notifications.enabled', '0'))
  await page.reload()
  await page.locator('[data-view="settings"]').click()
  await page.locator('[data-stab="acct"]').click()
  await page.locator('#app-updates').scrollIntoViewIfNeeded()
}
async function main() {
  await launch()
  const card = page.locator('#app-updates'), toggle = card.getByRole('switch')
  assert.equal(await toggle.getAttribute('aria-checked'), 'false')
  assert.equal((await page.evaluate(() => window.desktop.updates.status())).enabled, true)
  await page.evaluate(() => window.desktop.updates.check())
  await card.getByRole('button', { name: 'Download update', exact: true }).waitFor()
  assert.equal(await desktop.evaluate(() => globalThis.__updatesTest.downloads), 0)
  checks.push('Packaged feed works; manual mode detects a new release without downloading')
  await toggle.click()
  await until(() => card.getByRole('progressbar').getAttribute('aria-valuenow'), value => value === '42')
  const userData = await desktop.evaluate(() => globalThis.__updatesTest.userData)
  assert.equal(JSON.parse(readFileSync(join(userData, 'app-updates.json'), 'utf8')).autoDownload, true)
  assert.equal(await desktop.evaluate(() => globalThis.__updatesTest.downloads), 1)
  await card.screenshot({ path: join(output, 'downloading.png') })
  checks.push('Opt-in persists on disk, starts one download and displays actual 42% progress')
  await desktop.evaluate(() => { const test = globalThis.__updatesTest; test.updater.emit('update-downloaded', { version: '1.4.18' }); test.finish([]) })
  await card.getByRole('button', { name: 'Restart to install', exact: true }).waitFor()
  assert.equal(await desktop.evaluate(() => globalThis.__updatesTest.installs), 0)
  await card.screenshot({ path: join(output, 'ready-light.png') })
  await page.evaluate(() => document.body.dataset.theme = 'dark')
  await card.screenshot({ path: join(output, 'ready-dark.png') })
  await page.evaluate(() => document.body.dataset.theme = 'light')
  await page.setViewportSize({ width: 820, height: 900 })
  await card.scrollIntoViewIfNeeded()
  assert.equal(await card.evaluate(el => el.scrollWidth <= el.clientWidth + 1), true)
  await card.screenshot({ path: join(output, 'ready-narrow.png') })
  checks.push('Ready state never forces a restart; light/dark and narrow layouts fit')
  await page.locator('[data-view="dashboard"]').click()
  await page.locator('[data-notifications-button]').click()
  const panel = page.locator('[data-notifications-panel]')
  assert.equal(await panel.locator('[data-note]').filter({ hasText: 'New MamaLead update' }).count(), 1)
  const ready = panel.locator('[data-note]').filter({ hasText: 'Update ready' })
  assert.equal(await ready.count(), 1)
  await ready.getByRole('button', { name: 'Open app updates' }).click()
  await until(() => card.boundingBox(), box => box && box.y >= 0 && box.y < 900)
  await card.getByRole('button', { name: 'Restart to install', exact: true }).click()
  assert.equal(await desktop.evaluate(() => globalThis.__updatesTest.installs), 1)
  checks.push('New-release and ready notifications each appear once and open App updates')
  await desktop.close(); desktop = null
  await launch()
  assert.equal(await page.locator('#app-updates').getByRole('switch').getAttribute('aria-checked'), 'true')
  await page.locator('#app-updates').getByRole('switch').click()
  assert.equal(JSON.parse(readFileSync(join(userData, 'app-updates.json'), 'utf8')).autoDownload, false)
  assert.equal(await desktop.evaluate(() => globalThis.__updatesTest.updater.autoInstallOnAppQuit), false)
  checks.push('Preference survives a real app restart; switching off disables automatic installation')
  assert.deepEqual(errors, [])
  writeFileSync(join(output, 'report.json'), JSON.stringify({ passed: true, checks, executablePath, errors }, null, 2))
  console.log(JSON.stringify({ passed: true, checks }, null, 2))
}
main().catch(error => { console.error(error); process.exitCode = 1 }).finally(async () => { if (desktop) await desktop.close() })
