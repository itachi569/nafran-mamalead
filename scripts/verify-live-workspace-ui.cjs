const { _electron } = require('playwright')
const { DatabaseSync } = require('node:sqlite')
const { mkdtempSync } = require('node:fs')
const { join } = require('node:path')
const { tmpdir } = require('node:os')
const assert = require('node:assert/strict')

async function launch(userData) {
  const env = { ...process.env }
  delete env.VITE_DEV_SERVER_URL
  return _electron.launch({ args: ['.', `--user-data-dir=${userData}`], cwd: process.cwd(), env, timeout: 60_000 })
}

async function main() {
  const userData = join(mkdtempSync(join(tmpdir(), 'nafran-live-ui-')), 'userdata')
  let app = await launch(userData)
  try {
    const page = await app.firstWindow()
    await page.waitForSelector('[data-view="dashboard"]')
    await page.click('[data-view="website"]')
    assert.match(await page.locator('[data-website-preview-domain="1"]').textContent(), /Import a website/)
  } finally {
    await app.close()
  }

  const db = new DatabaseSync(join(userData, 'leads.db'))
  try {
    const workspace = db.prepare('select id from workspaces limit 1').get().id
    const at = '2026-10-01T10:00:00.000Z'
    const runs = [
      ['run-one', 'done', '["dentist"]', 'Karachi', 3, null],
      ['run-two', 'failed', '["physio"]', 'Lahore', 0, 'Provider failed'],
      ['run-three', 'cancelled', '["spa"]', 'Islamabad', 1, null],
    ]
    const insertRun = db.prepare('insert into scrape_runs (id,workspace_id,provider,status,keywords,location,max_results,found,error,started_at,finished_at,duration_ms) values (?,?,\'chromium-maps\',?,?,?,?,?,?,?,?,?)')
    runs.forEach((run, index) => insertRun.run(run[0], workspace, run[1], run[2], run[3], 25, run[4], run[5], `2026-10-01T10:0${index}:00.000Z`, `2026-10-01T10:0${index}:10.000Z`, 10000))
    db.prepare('insert into leads (id,workspace_id,name,address,area,phone,website,latitude,longitude,provider,captured_at) values (?,?,?,?,?,?,?,?,?,?,?)')
      .run('lead-import', workspace, 'Karachi Dental Studio', 'Clifton, Karachi', 'Karachi', '+92 21 555 0000', 'https://karachidental.example', 24.8138, 67.0309, 'import', at)
    db.prepare('insert into leads (id,workspace_id,run_id,name,address,area,website,latitude,longitude,provider,captured_at) values (?,?,?,?,?,?,?,?,?,?,?)')
      .run('lead-maps', workspace, 'run-one', 'Karachi Gym', 'Saddar, Karachi', 'Karachi', 'https://gym.example', 24.8607, 67.0011, 'chromium-maps', at)
    db.prepare('insert into lead_contacts (id,lead_id,workspace_id,kind,value,created_at) values (?,?,?,?,?,?)')
      .run('email-one', 'lead-import', workspace, 'email', 'hello@karachidental.example', at)
    db.prepare('insert into import_batches (id,workspace_id,kind,source_count,added,skipped,created_at) values (?,?,?,?,?,?,?)')
      .run('import-one', workspace, 'websites', 1, 1, 0, at)
    const extraLead = db.prepare('insert into leads (id,workspace_id,name,website,provider,captured_at) values (?,?,?,?,?,?)')
    db.exec('begin')
    for (let index = 0; index < 505; index++) extraLead.run(`extra-${index}`, workspace, `Other Business ${index}`, `https://other-${index}.example`, 'chromium-maps', '2026-10-01T09:00:00.000Z')
    extraLead.run('far-page-lead', workspace, 'Far Page Dental', 'https://far-page.example', 'chromium-maps', '2026-10-01T08:00:00.000Z')
    db.exec('commit')
  } finally {
    db.close()
  }

  app = await launch(userData)
  try {
    const page = await app.firstWindow()
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.waitForSelector('[data-view="dashboard"]')
    await page.waitForFunction(() => document.querySelector('[data-global-search="1"]'))
    await page.locator('[data-global-search="1"]').fill('Karachi Dental')
    await page.locator('[data-global-result="lead"]').first().waitFor()
    await page.locator('[data-global-result="lead"]').first().click()
    assert.equal(await page.locator('[data-leadsearch="1"]').inputValue(), 'Karachi Dental Studio')
    await page.locator('[data-global-search="1"]').fill('Far Page Dental')
    await page.locator('[data-global-result="lead"]').first().click()
    assert.equal(await page.locator('[data-leadsearch="1"]').inputValue(), 'Far Page Dental')
    await page.waitForFunction(() => document.body.innerText.includes('Far Page Dental'))

    await page.keyboard.press('Control+k')
    assert.equal(await page.locator('[data-global-search="1"]').evaluate((node) => document.activeElement === node), true)
    await page.locator('[data-global-search="1"]').fill('dentist')
    await page.locator('[data-global-result="run"]').first().click()
    await page.locator('[data-clear-run-focus="1"]').waitFor()
    assert.match(await page.locator('[data-run-chip="All activity"]').textContent(), /4/)
    assert.match(await page.locator('[data-run-chip="Maps"]').textContent(), /3/)
    assert.match(await page.locator('[data-run-chip="Imports"]').textContent(), /1/)
    assert.match(await page.locator('[data-run-chip="Failed"]').textContent(), /1/)
    assert.match(await page.locator('[data-clear-run-focus="1"]').textContent(), /Show all activity/)
    await page.locator('[data-clear-run-focus="1"]').click()
    await page.locator('[data-run-chip="Failed"]').click()
    assert.match(await page.locator('[data-run-chip="Failed"]').getAttribute('data-on'), /1/)
    assert.equal(await page.locator('[data-run-empty="1"]').count(), 0)
    assert.match(await page.locator('[data-run-chip="Maps"]').textContent(), /3/)

    await page.click('[data-view="maps"]')
    const activity = await page.locator('[data-maps-activity="1"]').innerText()
    assert.match(activity, /Karachi|Lahore|Islamabad/)
    assert.doesNotMatch(activity, /14 ok · 3 failed · 1 skipped/)
    const mapText = await page.locator('body').innerText()
    assert.match(mapText, /Pins span about/)
    assert.doesNotMatch(mapText, /12 km radius/)

    await page.click('[data-view="website"]')
    await page.waitForFunction(() => document.querySelector('[data-website-preview-name="1"]')?.textContent === 'Karachi Dental Studio')
    assert.equal(await page.locator('[data-website-preview-domain="1"]').textContent(), 'karachidental.example')
    assert.match(await page.locator('[data-website-recent="1"]').textContent(), /karachidental\.example/)
    assert.deepEqual(errors, [])
    console.log('PASS  Global search, live activity, database run filters, measured pin spread, and saved website preview')
  } finally {
    await app.close()
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1 })
