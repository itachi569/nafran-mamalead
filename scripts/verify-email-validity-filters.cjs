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
  return _electron.launch({ args: ['.', `--user-data-dir=${userData}`], cwd: APP, env, timeout: 60_000 })
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
        'https://example.com', 'https://example.org', 'https://example.net', 'https://iana.org',
      ])
      const add = (leadId, value, source = 'filter-test') => window.desktop.local.contacts.upsert({ leadId, kind: 'email', value, source })
      return {
        imported,
        invalid: (await add(imported.leadIds[0], 'invalid@alpha.test')).id,
        unknown: (await add(imported.leadIds[0], 'unknown@alpha.test', 'https://example.com/contact')).id,
        risky: (await add(imported.leadIds[1], 'risky@beta.test')).id,
        unchecked: (await add(imported.leadIds[2], 'unchecked@gamma.test')).id,
      }
    })
    assert.equal(seeded.imported.added, 4)
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
    const addresses = page.locator('[data-flist="email"] [data-email-validity-status]')
    await page.waitForFunction(() => document.querySelectorAll('[data-flist="email"] [data-row="1"]').length === 4)
    assert.equal(await addresses.count(), 4)

    await page.locator('[data-validity-summary="invalid"]').click()
    assert.equal(await rows.count(), 1)
    assert.deepEqual(await addresses.evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-email-validity-status'))), ['invalid'])
    assert.equal(await page.locator('[data-fq="email"]').inputValue(), '')
    assert.equal(await page.locator('select[aria-label="Filter rows"]').first().inputValue(), 'invalid')
    assert.match(await page.locator('[data-flistcard="email"]').innerText(), /Showing 1 of 4 leads/)

    await page.locator('[data-validity-summary="unknown"]').click()
    assert.equal(await rows.count(), 1)
    assert.deepEqual(await addresses.evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-email-validity-status'))), ['unknown'])
    assert.equal(await page.locator('[data-email-website-evidence="1"]').count(), 1)

    await page.locator('[data-validity-summary="all"]').click()
    assert.equal(await rows.count(), 4)
    assert.equal(await addresses.count(), 4)
    assert.equal(await page.locator('[data-validity-summary="all"]').getAttribute('aria-pressed'), 'true')

    await page.locator('[data-fq="email"]').fill('no-such-business')
    assert.equal(await rows.count(), 0)
    await page.locator('[data-validity-summary="risky"]').click()
    assert.equal(await page.locator('[data-fq="email"]').inputValue(), '')
    assert.equal(await rows.count(), 1)
    assert.deepEqual(await addresses.evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-email-validity-status'))), ['risky'])

    await page.locator('[data-validity-summary="unchecked"]').click()
    assert.equal(await rows.count(), 1)
    assert.deepEqual(await addresses.evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-email-validity-status'))), ['unchecked'])

    await page.locator('[data-validity-summary="valid"]').click()
    assert.equal(await rows.count(), 0)
    assert.match(await page.locator('[data-flist="email"]').innerText(), /No valid email addresses found/)
    assert.equal(await page.locator('select[aria-label="Filter rows"]').first().inputValue(), 'valid')
    assert.deepEqual(errors, [])
    console.log('PASS  Email validity chips, address-level filtering, All reset, dropdown sync, and empty state')
  } finally {
    await app.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
