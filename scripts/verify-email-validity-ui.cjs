const { _electron } = require('playwright')
const { mkdtempSync } = require('node:fs')
const { join } = require('node:path')
const { tmpdir } = require('node:os')
const assert = require('node:assert/strict')

async function main() {
  const userData = join(mkdtempSync(join(tmpdir(), 'leadsnap-email-validity-')), 'userdata')
  const env = { ...process.env, LEADSNAP_TEST_HOOKS: '1' }
  delete env.VITE_DEV_SERVER_URL
  const app = await _electron.launch({ args: ['.', `--user-data-dir=${userData}`], cwd: process.cwd(), env, timeout: 60_000 })
  try {
    const page = await app.firstWindow()
    const pageErrors = []
    page.on('pageerror', (error) => pageErrors.push(error.message))
    await page.waitForSelector('[data-view="dashboard"]', { timeout: 30_000 })
    const lead = await page.evaluate(() => window.desktop.local.imports.websites(['https://example.com']))
    assert.equal(lead.added, 1)
    const ids = await page.evaluate(async (leadId) => {
      const contacts = []
      for (let index = 0; index < 10; index++) {
        const added = await window.desktop.local.contacts.upsert({
          leadId, kind: 'email', value: `validity-ui-${index}@example.com`, source: 'test',
        })
        contacts.push(added.id)
      }
      return contacts
    }, lead.leadIds[0])
    await page.click('[data-view="email"]')
    await page.locator('[data-email-validity="1"]').first().waitFor({ state: 'visible' })
    await page.evaluate(() => window.desktop.test.mockSlowEmailValidity())
    await page.evaluate(() => {
      window.__emailValidityTestPromise = window.desktop.emailValidity.verify()
    })
    let running
    for (let attempt = 0; attempt < 40; attempt++) {
      running = await page.evaluate(() => window.desktop.emailValidity.status())
      if (running.progress.checked >= 1) break
      await page.waitForTimeout(50)
    }
    assert.ok(running.progress.checked >= 1 && running.progress.checked < 10)
    await page.locator('[data-email-validity-cancel="1"]').waitFor({ state: 'visible' })
    await page.locator('[data-email-validity-cancel="1"]').click()
    const stopped = await page.evaluate(() => window.__emailValidityTestPromise)
    assert.equal(stopped.cancelled, true)
    assert.ok(stopped.checked >= 1 && stopped.checked < 10)
    const afterStop = await page.evaluate(() => window.desktop.emailValidity.status())
    assert.equal(afterStop.progress.state, 'cancelled')
    assert.match(await page.locator('[data-email-validity-progress="1"]').textContent(), /Stopped after/)

    const remaining = await page.evaluate(async (contactIds) => {
      const contacts = await window.desktop.local.contacts.list('email')
      return contacts.filter((row) => contactIds.includes(row.id) && !row.validation_status).map((row) => row.id)
    }, ids)
    assert.equal(remaining.length, 10 - stopped.checked)
    await page.evaluate(() => window.desktop.test.mockOneEmailValidity())
    const resumed = await page.evaluate(() => window.desktop.emailValidity.verify())
    assert.equal(resumed.checked, remaining.length)
    const contacts = await page.evaluate(() => window.desktop.local.contacts.list('email'))
    assert.equal(contacts.filter((row) => ids.includes(row.id) && row.validation_status === 'valid').length, 10)
    assert.deepEqual(pageErrors, [])
    console.log(`PASS  Electron progress/cancel/requeue: ${stopped.checked} checked before cancel, ${resumed.checked} on next pass`)
  } finally {
    await app.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
