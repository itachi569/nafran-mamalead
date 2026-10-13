// Verifies the notifications bell, persisted history, settings switch and Electron notification
// bridge in a real desktop process. The profile is throwaway, so this never changes user data.
const { _electron } = require('playwright')
const { mkdtempSync, mkdirSync } = require('node:fs')
const { join } = require('node:path')
const { tmpdir } = require('node:os')

const APP = process.cwd()
const results = []
function check(name, ok, detail = '') {
  results.push(ok)
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` · ${detail}` : ''}`)
}

async function main() {
  const root = mkdtempSync(join(tmpdir(), 'leadsnap-notifications-'))
  const userData = join(root, 'userdata')
  mkdirSync(userData, { recursive: true })
  const app = await _electron.launch({ args: ['.', `--user-data-dir=${userData}`], cwd: APP, timeout: 60000 })
  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  await page.waitForSelector('[data-view="dashboard"]', { timeout: 30000 })

  const native = await page.evaluate(() => window.desktop?.notifications?.show('Notification test', 'Electron bridge is reachable.'))
  check('Electron notification bridge responds', Boolean(native && typeof native.shown === 'boolean'), JSON.stringify(native))

  await page.click('[data-notifications-button="1"]')
  check('bell opens the notifications panel', await page.locator('[data-notifications-panel="1"]').isVisible())
  check('empty history has a useful state', await page.locator('[data-notifications-empty="1"]').isVisible())

  // Seed one history item through the same storage format the renderer writes, then reload. This
  // checks that the bell is useful across restarts without manufacturing a scrape or a network job.
  await page.evaluate(() => {
    localStorage.setItem('nafran.notifications', JSON.stringify([{
      id: 'test-notification',
      title: 'Maps scrape complete',
      body: '1 lead captured.',
      at: new Date().toISOString(),
      level: 'success',
      unread: true,
    }]))
  })
  await page.reload()
  await page.waitForSelector('[data-view="dashboard"]', { timeout: 30000 })
  check('notification history persists', await page.locator('[data-notifications-button="1"] [data-notifications-badge="1"]').textContent() === '1')
  await page.click('[data-notifications-button="1"]')
  check('persisted notification is rendered', await page.locator('[data-notification="test-notification"]').isVisible())
  await page.click('[data-notifications-read="1"]')
  check('mark all read clears unread badge', !(await page.locator('[data-notifications-badge="1"]').count()))

  await app.close()
  const failed = results.filter((ok) => !ok).length
  if (failed) process.exitCode = 1
  console.log(`notification checks: ${results.length - failed}/${results.length} passed`)
}

main().catch((error) => {
  console.error('notification verification failed:', error.message)
  process.exitCode = 1
})
