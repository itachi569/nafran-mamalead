// Verifies the production credential path without saving the credential in the app profile.
// The test passes only a file path to Electron; the main process reads the secret at startup.
const { _electron } = require('playwright')
const { existsSync, mkdtempSync, rmSync } = require('node:fs')
const { join } = require('node:path')
const { tmpdir } = require('node:os')

const APP = process.cwd()
const SECRET_FILE = process.env.DATAFORSEO_API_KEY_FILE || join(process.env.USERPROFILE || '', 'Downloads', 'key.env')
const checks = []

function check(name, ok, detail = '') {
  checks.push(Boolean(ok))
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` · ${detail}` : ''}`)
}

async function main() {
  if (!existsSync(SECRET_FILE)) {
    throw new Error(`Set DATAFORSEO_API_KEY_FILE to an external secret file before running this check: ${SECRET_FILE}`)
  }

  const root = mkdtempSync(join(tmpdir(), 'nafran-dataforseo-runtime-'))
  let app
  try {
    const env = { ...process.env, DATAFORSEO_API_KEY_FILE: SECRET_FILE }
    // This is a production-style launch, so do not let a dev server URL or test hooks change it.
    delete env.VITE_DEV_SERVER_URL
    delete env.LEADSNAP_TEST_HOOKS

    app = await _electron.launch({ args: ['.', '--user-data-dir=' + root], cwd: APP, env, timeout: 60_000 })
    const page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')
    await page.waitForSelector('[data-view="dashboard"]', { timeout: 30_000 })

    const status = await page.evaluate(() => window.desktop.deep.status())
    check('Electron receives the external credential', status.saved && status.fromEnvironment, JSON.stringify({ saved: status.saved, fromEnvironment: status.fromEnvironment }))

    const stored = await page.evaluate(() => window.localStorage.getItem('nafran.dataforseo.key'))
    check('the renderer does not persist the production credential', !stored)

    await page.click('[data-view="settings"]')
    await page.waitForTimeout(300)
    await page.locator('[data-stab="acct"]').click()
    const accountText = (await page.locator('[data-deepnote="1"]').textContent()) || ''
    check('Account identifies machine runtime configuration', /Set by this machine/i.test(accountText), accountText.trim())

    const result = await page.evaluate(() => window.desktop.deep.check())
    check('the runtime credential passes the zero-cost account check', result.ok, result.note)

    await app.close()
    app = null
  } finally {
    if (app) await app.close().catch(() => undefined)
    rmSync(root, { recursive: true, force: true })
  }

  const failed = checks.filter((ok) => !ok).length
  console.log(`DataForSEO runtime checks: ${checks.length - failed}/${checks.length} passed`)
  if (failed) process.exitCode = 1
}

main().catch((error) => {
  console.error('DataForSEO runtime check failed:', error.message)
  process.exitCode = 1
})
