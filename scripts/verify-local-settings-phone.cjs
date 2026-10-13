// Checks phone figures and Settings against a controlled local workspace.
// Run after `npm run build`.
const { _electron } = require('playwright')
const { mkdtempSync, mkdirSync } = require('node:fs')
const { join } = require('node:path')
const { tmpdir } = require('node:os')
const { LocalDatabase } = require('../dist-electron/db/local-db.js')
const { Repository } = require('../dist-electron/db/repository.js')

const results = []
function check(name, ok, detail = '') {
  results.push(ok)
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` · ${detail}` : ''}`)
}

async function main() {
  const root = mkdtempSync(join(tmpdir(), 'leadsnap-local-ui-'))
  const userData = join(root, 'userdata')
  mkdirSync(userData, { recursive: true })
  const db = new LocalDatabase(join(userData, 'leads.db'))
  const workspace = db.ensureWorkspace()
  db.run('update workspaces set name = ? where id = ?', ['Phone Test Workspace', workspace.id])
  db.run('insert into workspace_members (workspace_id, user_id, role, created_at) values (?, ?, ?, ?)', [workspace.id, 'local-reviewer', 'member', new Date().toISOString()])
  const insert = db.prepare('insert into leads (id, workspace_id, name, phone, website, provider, captured_at) values (?, ?, ?, ?, ?, ?, ?)')
  const at = new Date().toISOString()
  insert.run('phone-reception', workspace.id, 'Reception Clinic', '+44 161 123 4567', 'https://reception.example', 'import', at)
  insert.run('phone-direct', workspace.id, 'Direct Clinic', '', 'https://direct.example', 'import', at)
  insert.run('phone-mobile', workspace.id, 'Mobile Clinic', '+44 7700 900123', 'https://mobile.example', 'import', at)
  insert.run('phone-backfill', workspace.id, 'Backfill Clinic', '', 'https://backfill.example', 'import', at)
  insert.run('phone-no-site', workspace.id, 'No Site Clinic', '', '', 'import', at)
  db.run('insert into lead_contacts (id, lead_id, workspace_id, kind, value, source, created_at) values (?, ?, ?, ?, ?, ?, ?)', ['direct-line', 'phone-direct', workspace.id, 'phone', '+44 161 777 8888', 'website', at])
  const summary = new Repository(db).phoneSummary(workspace.id)
  check('repository counts every phone category', summary.total === 5 && summary.reception === 1 && summary.direct === 1 && summary.mobile === 1 && summary.missing === 2)
  check('repository splits missing leads by website', summary.canBackfill === 1 && summary.noWebsite === 1)
  db.close()

  const app = await _electron.launch({ args: ['.', `--user-data-dir=${userData}`], cwd: process.cwd(), timeout: 60000 })
  try {
    const page = await app.firstWindow()
    await page.waitForSelector('[data-view="phone"]', { timeout: 30000 })
    await page.click('[data-view="phone"]')
    await page.waitForFunction(() => document.querySelector('[data-ladder]')?.textContent?.includes('Direct line'), null, { timeout: 10000 })
    const ladder = await page.locator('[data-ladder="1"]').innerText()
    check('Phone Finder ladder uses stored counts', /1\s*Direct line/.test(ladder) && /1\s*Reception/.test(ladder) && /1\s*Mobile/.test(ladder) && /2\s*No number/.test(ladder), ladder.replace(/\s+/g, ' '))
    const phoneText = await page.locator('body').innerText()
    check('backfill card uses stored counts', /1 of the 2 missing leads have a website/.test(phoneText) && /Backfillable\s*1/.test(phoneText) && /No website\s*1/.test(phoneText))
    const directRow = page.locator('[data-flist="phone"] li', { hasText: 'Direct Clinic' })
    check('website phone is labelled direct', /Direct line/.test(await directRow.innerText()))
    check('mobile and missing rows carry their own labels', /Mobile/.test(await page.locator('[data-flist="phone"] li', { hasText: 'Mobile Clinic' }).innerText()) && /Missing/.test(await page.locator('[data-flist="phone"] li', { hasText: 'No Site Clinic' }).innerText()))

    await page.click('[data-view="settings"]')
    await page.waitForFunction(() => document.body.textContent?.includes('Phone Test Workspace'), null, { timeout: 10000 })
    const settings = await page.locator('body').innerText()
    check('Settings uses the saved workspace name', /Phone Test Workspace/.test(settings))
    check('Settings has no invented prices or next charge', !/£39|£89|£8|£6|Next charge|Upgrade to Studio/.test(settings))
    await page.waitForFunction(() => !/Checking Stripe billing/.test(document.querySelector('[data-billing-status="1"]')?.textContent ?? ''), null, { timeout: 10000 })
    const stripeStatus = await page.evaluate(() => window.desktop.billing.status())
    if (stripeStatus.connected) {
      const billingText = await page.locator('body').innerText()
      check('Settings shows verified Stripe products', /\$30\.00/.test(billingText) && /\$3\.00/.test(billingText) && /Stripe test mode connected/.test(billingText))
    } else {
      check('Settings explains when the billing server is offline', /Billing server|billing server|fetch failed/.test(await page.locator('[data-billing-status="1"]').innerText()))
    }

    await page.click('[data-stab="pay"]')
    check('Payment states the Stripe service status', /Payment methods and subscriptions are managed securely on Stripe|Connect the billing server/.test(await page.locator('body').innerText()))
    await page.click('[data-stab="inv"]')
    check('Invoices state no charges', /No invoices/.test(await page.locator('body').innerText()))

    await page.click('[data-stab="acct"]')
    const account = await page.locator('body').innerText()
    check('Account shows this database path and local time zone', account.includes(userData) && /Time zone/.test(account) && !/Europe\/London|MacBook Pro|iPhone 15/.test(account))
    check('Account has a real update status and action', /App updates/.test(account) && await page.getByRole('button', { name: /Check for updates|Download update|Restart to install/ }).count() === 1)
    await page.click('[data-stab="team"]')
    const members = await page.locator('[data-workspace-members="1"]').innerText()
    check('Members come from local records', /2 recorded members/.test(members) && /Local owner/.test(members) && /local-reviewer/.test(members), members.replace(/\s+/g, ' '))
    check('sample people and invite actions are absent', !/Nafran Iqbal|Sana Malik|Iwan Prys|Invite member|Seat history/.test(members))
  } finally {
    await app.close()
  }
  const failed = results.filter((ok) => !ok).length
  console.log(`Local UI checks: ${results.length - failed}/${results.length} passed`)
  if (failed) process.exitCode = 1
}

main().catch((error) => { console.error('Local UI verification failed:', error); process.exitCode = 1 })
