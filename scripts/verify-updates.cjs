// Verifies the update bridge and Settings card in a development Electron launch. A development
// build must report the feature as disabled rather than contacting a fake feed or throwing.
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
  const root = mkdtempSync(join(tmpdir(), 'leadsnap-updates-'))
  const userData = join(root, 'userdata')
  mkdirSync(userData, { recursive: true })
  const app = await _electron.launch({ args: ['.', `--user-data-dir=${userData}`], cwd: APP, timeout: 60000 })
  try {
    const page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')
    await page.waitForSelector('[data-view="dashboard"]', { timeout: 30000 })

    const status = await page.evaluate(() => window.desktop?.updates?.status())
    check('update status bridge responds', status?.state === 'disabled', JSON.stringify(status))
    const checkResult = await page.evaluate(() => window.desktop?.updates?.check())
    check('development check stays disabled', checkResult?.state === 'disabled', JSON.stringify(checkResult))

    await page.click('[data-view="settings"]')
    await page.click('[data-stab="acct"]')
    await page.waitForTimeout(700)
    const card = page.locator('section').filter({ has: page.getByRole('heading', { name: 'App updates', exact: true }) })
    const cardVisible = await card.isVisible()
    check('settings shows the app updates card', cardVisible)
    if (cardVisible) {
      check('settings explains the disabled development state', /not configured|installed.*app/i.test(await card.innerText()))
      check('unsupported update action is disabled', await card.getByRole('button').isDisabled())
      check('unsupported build makes no automatic-check promise', !/every 4 hours|notified about new releases/i.test(await card.innerText()))
    }
  } finally {
    await app.close()
  }

  const failed = results.filter((ok) => !ok).length
  console.log(`update checks: ${results.length - failed}/${results.length} passed`)
  if (failed) process.exitCode = 1
}

main().catch((error) => {
  console.error('update verification failed:', error.message)
  process.exitCode = 1
})
