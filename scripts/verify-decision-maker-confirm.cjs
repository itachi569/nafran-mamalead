// Verifies the actual Decision Makers UI promotes a suggestion into a confirmed contact.
const { _electron } = require('playwright')
const { DatabaseSync } = require('node:sqlite')
const { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync } = require('node:fs')
const { join } = require('node:path')
const { tmpdir } = require('node:os')
const { randomUUID } = require('node:crypto')

const APP = process.cwd()
const LIVE_DB = join(process.env.APPDATA || '', 'nafran-leads-scraper', 'leads.db')
const results = []

function check(name, ok, detail = '') {
  results.push(ok)
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` · ${detail}` : ''}`)
}

function seedDatabase(file) {
  const db = new DatabaseSync(file)
  const workspace = db.prepare('select id from workspaces limit 1').get()
  const lead = db.prepare('select id, name from leads order by captured_at desc limit 1').get()
  if (!workspace || !lead) throw new Error('No workspace or lead available for confirmation check')
  db.prepare('delete from decision_maker_candidates').run()
  db.prepare(
    `insert into decision_maker_candidates
      (id, workspace_id, lead_id, full_name, title, source, evidence, email, linkedin_url, status, created_at)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?, 'suggested', ?)`,
  ).run(randomUUID(), workspace.id, lead.id, 'Nadia Khan', 'Founder', 'email', 'seeded for UI confirmation check', 'nadia.khan@example.test', '', new Date().toISOString())
  db.close()
  return lead
}

async function main() {
  const root = mkdtempSync(join(tmpdir(), 'leadsnap-confirm-'))
  const userData = join(root, 'userdata')
  mkdirSync(userData, { recursive: true })
  for (const name of ['leads.db', 'leads.db-wal', 'leads.db-shm']) {
    const from = LIVE_DB + (name === 'leads.db' ? '' : name.slice('leads.db'.length))
    if (existsSync(from)) copyFileSync(from, join(userData, name))
  }
  const lead = seedDatabase(join(userData, 'leads.db'))
  let app
  try {
    app = await _electron.launch({ args: ['.', `--user-data-dir=${userData}`], cwd: APP, timeout: 60000 })
    const page = await app.firstWindow()
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.waitForLoadState('domcontentloaded')
    await page.waitForSelector('[data-view="dashboard"]', { timeout: 30000 })
    await page.click('[data-view="dm"]')
    await page.waitForTimeout(900)

    const before = await page.evaluate(async () => ({
      candidates: await window.desktop.local.people.candidates(true),
      cards: document.querySelector('h2[data-dmsugs="1"]')?.closest('section')?.querySelectorAll('button').length ?? 0,
    }))
    check('Decision Makers renders a seeded suggestion', before.candidates.some((candidate) => candidate.full_name === 'Nadia Khan') && before.cards >= 1, JSON.stringify({ count: before.candidates.length, cards: before.cards }))

    await page.getByRole('button', { name: 'Confirm' }).first().click()
    await page.waitForTimeout(700)
    const after = await page.evaluate(async (leadId) => ({
      candidates: await window.desktop.local.people.candidates(true),
      people: await window.desktop.local.people.list([leadId]),
      body: document.body.innerText.replace(/\s+/g, ' '),
    }), lead.id)
    check('Confirm removes the suggestion from the review queue', !after.candidates.some((candidate) => candidate.full_name === 'Nadia Khan'), JSON.stringify(after.candidates))
    check('Confirm creates a named Decision Maker', after.people.some((person) => person.full_name === 'Nadia Khan' && /^confirmed from email$/.test(person.source)), JSON.stringify(after.people))
    check('the renderer reported no errors', errors.length === 0, errors.slice(0, 2).join(' | '))
  } finally {
    if (app) await app.close().catch(() => undefined)
    rmSync(root, { recursive: true, force: true })
  }

  const failed = results.filter((ok) => !ok).length
  console.log(`decision-maker confirmation checks: ${results.length - failed}/${results.length} passed`)
  if (failed) process.exitCode = 1
}

main().catch((error) => {
  console.error('decision-maker confirmation check failed:', error.message)
  process.exitCode = 1
})
