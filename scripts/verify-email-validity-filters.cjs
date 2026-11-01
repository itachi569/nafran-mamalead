const { _electron } = require('playwright')
const { DatabaseSync } = require('node:sqlite')
const { mkdtempSync } = require('node:fs')
const { join } = require('node:path')
const { tmpdir } = require('node:os')
const assert = require('node:assert/strict')

const APP = process.cwd()
const env = { ...process.env, LEADSNAP_TEST_HOOKS: '1' }
delete env.VITE_DEV_SERVER_URL

async function launch(userData) {
  const app=await _electron.launch(process.env.NAFRAN_TEST_PACKAGED === '1'
    ? {executablePath:join(APP,'release/win-unpacked/MamaLead.exe'),args:[`--user-data-dir=${userData}`],env,timeout:60_000}
    : { args: ['.', `--user-data-dir=${userData}`], cwd: APP, env, timeout: 60_000 })
  await app.evaluate(({app,ipcMain})=>{
    const req=process.getBuiltinModule('module').createRequire(app.getAppPath()+'/package.json')
    req('./dist-electron/billing/client.js').requireActiveLicense=async()=>{}
    ipcMain.removeHandler('billing:status');ipcMain.handle('billing:status',()=>({connected:true,coreLicenseActive:true,lifetime:{active:true},license:{active:true,kind:'lifetime'}}))
  })
  return app
}

async function main() {
  const userData = join(mkdtempSync(join(tmpdir(), 'leadsnap-validity-filter-')), 'userdata')
  let app = await launch(userData)
  let contacts
  try {
    const page = await app.firstWindow()
    await page.waitForSelector('[data-view="dashboard"]', { timeout: 30_000 })
    const seeded = await page.evaluate(async () => {
      const imported = await window.desktop.local.imports.websites([
        'https://invalid.qa-mamalead.com', 'https://unknown.qa-mamalead.com', 'https://risky.qa-mamalead.com', 'https://unchecked.qa-mamalead.com', 'https://empty.qa-mamalead.com',
      ], {enqueue:false})
      const add = (leadId, value, source = 'filter-test') => window.desktop.local.contacts.upsert({ leadId, kind: 'email', value, source })
      return {
        imported,
        invalid: (await add(imported.leadIds[0], 'invalid@alpha.qa-mamalead.com')).id,
        unknown: (await add(imported.leadIds[1], 'unknown@alpha.qa-mamalead.com', 'https://unknown.qa-mamalead.com/contact')).id,
        risky: (await add(imported.leadIds[2], 'risky@beta.qa-mamalead.com')).id,
        unchecked: (await add(imported.leadIds[3], 'unchecked@gamma.qa-mamalead.com')).id,
      }
    })
    assert.equal(seeded.imported.added, 5)
    contacts = seeded
  } finally {
    await app.close()
  }

  const db = new DatabaseSync(join(userData, 'leads.db'))
  try {
    const update = db.prepare("update lead_contacts set validation_status = ?, validation_provider = 'apify' where id = ?")
    update.run('invalid', contacts.invalid)
    update.run('unknown', contacts.unknown)
    update.run('risky', contacts.risky)
  } finally {
    db.close()
  }

  app = await launch(userData)
  try {
    const page = await app.firstWindow()
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.waitForSelector('[data-view="email"]', { timeout: 30_000 })
    await page.click('[data-view="email"]')
    const rows = page.locator('[data-flist="email"] [data-row="1"]')
    const addresses = page.locator('[data-flist="email"] [data-email-address]')
    const filter = page.locator('select[aria-label="Filter rows"]').first()
    const waitRows = count => page.waitForFunction(count => document.querySelectorAll('[data-flist="email"] [data-row="1"]').length === count, count)
    await page.waitForFunction(() => document.querySelectorAll('[data-flist="email"] [data-row="1"]').length === 5)
    assert.equal(await addresses.count(), 4)

    await filter.selectOption('invalid')
    await waitRows(1)
    assert.equal(await addresses.innerText(), 'invalid@alpha.qa-mamalead.com')
    assert.equal(await page.locator('[data-fq="email"]').inputValue(), '')
    assert.equal(await page.locator('select[aria-label="Filter rows"]').first().inputValue(), 'invalid')
    assert.match(await page.locator('[data-flistcard="email"]').innerText(), /Showing 1 of 5 leads/)

    await filter.selectOption('unknown')
    await page.waitForFunction(() => document.querySelector('[data-email-address]')?.textContent === 'unknown@alpha.qa-mamalead.com')
    assert.equal(await rows.count(), 1)
    assert.equal(await addresses.getAttribute('title'), 'Published on Contact page')

    await filter.selectOption('all')
    await waitRows(5)
    assert.equal(await addresses.count(), 4)

    await page.locator('[data-fq="email"]').fill('no-such-business')
    await waitRows(0)
    await filter.selectOption('risky')
    assert.equal(await rows.count(), 0, 'Changing the filter must still respect the typed search')
    await page.locator('[data-fq="email"]').fill('')
    await waitRows(1)
    assert.equal(await rows.count(), 1)
    assert.equal(await addresses.innerText(), 'risky@beta.qa-mamalead.com')

    await filter.selectOption('unchecked')
    await page.waitForFunction(() => document.querySelector('[data-email-address]')?.textContent === 'unchecked@gamma.qa-mamalead.com')
    assert.equal(await rows.count(), 1)

    await filter.selectOption('valid')
    await waitRows(0)
    assert.match(await page.locator('[data-flist="email"]').innerText(), /No valid email addresses found/)
    assert.equal(await page.locator('select[aria-label="Filter rows"]').first().inputValue(), 'valid')
    assert.deepEqual(errors, [])
    console.log('PASS  Email validity dropdown, address-level filtering, source evidence, search intersection, All reset, and empty state')
  } finally {
    await app.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
