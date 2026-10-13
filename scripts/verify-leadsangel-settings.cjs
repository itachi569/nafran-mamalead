const assert = require('node:assert/strict')
const { _electron } = require('playwright')
const { mkdtempSync, readFileSync, writeFileSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const { zipSync, strToU8 } = require('fflate')

async function launch(userData, archive) {
  const env = { ...process.env }
  delete env.VITE_DEV_SERVER_URL
  return _electron.launch({
    args: ['.', `--user-data-dir=${userData}`, ...(archive ? [`--leadsangel-import-zip=${archive}`] : [])],
    cwd: process.cwd(), env, timeout: 60_000,
  })
}

async function main() {
  const directory = mkdtempSync(join(tmpdir(), 'leadsangel-settings-'))
  const userData = join(directory, 'userdata')
  const license = 'TEST-LICENSE-123'
  const archive = join(directory, 'bundle.zip')
  writeFileSync(archive, zipSync({
    'verify.sh': strToU8(`curl -d '{"license_key":"${license}","device_id":"TEST-DEVICE-123"}'`),
    'README.txt': strToU8('Expires: 2026-10-31'),
  }))
  let app = await launch(userData, archive)
  try {
    const page = await app.firstWindow()
    await page.waitForSelector('[data-view="dashboard"]')
    const status = await page.evaluate(() => window.desktop.emailValidity.status())
    assert.equal(status.leadsAngelConfigured, true)
    assert.equal(status.provider, 'leadsangel')
    assert.equal('hunterConfigured' in status, false)
    assert.equal(await page.evaluate(() => 'setHunterKey' in window.desktop.emailValidity || 'testHunterKey' in window.desktop.emailValidity), false)
    assert.equal(status.leadsAngelExpiresOn, '2026-10-31')
    assert.equal(readFileSync(join(userData, 'secrets', 'leadsangel.enc')).includes(Buffer.from(license)), false)
    await page.click('[data-view="settings"]')
    await page.click('[data-stab="acct"]')
    assert.match(await page.locator('[data-leadsangel-status="1"]').textContent(), /Ready/)
    assert.doesNotMatch(await page.locator('body').innerText(), /Hunter/i)
  } finally {
    await app.close()
  }

  app = await launch(userData)
  try {
    const page = await app.firstWindow()
    await page.waitForSelector('[data-view="dashboard"]')
    assert.equal((await page.evaluate(() => window.desktop.emailValidity.status())).leadsAngelConfigured, true)
    await page.click('[data-view="settings"]')
    await page.click('[data-stab="acct"]')
    await page.locator('[data-leadsangel-remove="1"]').click()
    await page.waitForFunction(async () => !(await window.desktop.emailValidity.status()).leadsAngelConfigured)
  } finally {
    await app.close()
  }
  console.log('PASS  LeadsAngel encrypted import, Settings state, persistence, removal')
}

main().catch((error) => { console.error(error); process.exitCode = 1 })
