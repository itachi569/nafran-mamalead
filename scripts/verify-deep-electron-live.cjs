// Live end-to-end check for one paid DataForSEO deep pass through the Electron UI.
//
// The key is typed into an isolated throwaway Electron profile and the real database is copied
// before launch. Nothing is written to the user's live profile or database, and the credential is
// never printed.
const { _electron } = require('playwright')
const { DatabaseSync } = require('node:sqlite')
const { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } = require('node:fs')
const { join } = require('node:path')
const { tmpdir } = require('node:os')

const APP = process.cwd()
const LIVE_DB = join(process.env.APPDATA || '', 'nafran-leads-scraper', 'leads.db')
const KEY_FILE = join(process.env.USERPROFILE || '', 'Downloads', 'key.env')
const LEAD_LIMIT = Math.max(1, Number(process.env.DEEP_LEAD_LIMIT || '1'))
const results = []

function check(name, ok, detail) {
  results.push(ok)
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (detail ? ' · ' + detail : ''))
}

function readKey() {
  if (!existsSync(KEY_FILE)) throw new Error('DataForSEO key file not found: ' + KEY_FILE)
  const line = readFileSync(KEY_FILE, 'utf8').split(/\r?\n/).find((entry) => /^\s*KEY\s*=/.test(entry))
  if (!line) throw new Error('KEY entry not found in key.env')
  const key = line.replace(/^\s*KEY\s*=\s*/, '').trim().replace(/^['"]|['"]$/g, '')
  if (!key) throw new Error('KEY entry is empty')
  return key
}

function copyDatabase(root) {
  if (!existsSync(LIVE_DB)) throw new Error('Live database not found: ' + LIVE_DB)
  const userData = join(root, 'userdata')
  mkdirSync(userData, { recursive: true })
  const target = join(userData, 'leads.db')
  copyFileSync(LIVE_DB, target)
  for (const suffix of ['-wal', '-shm']) {
    const side = LIVE_DB + suffix
    if (existsSync(side)) copyFileSync(side, target + suffix)
  }
  const db = new DatabaseSync(target)
  db.prepare("delete from enrichment_jobs where status in ('queued', 'running')").run()
  db.prepare('delete from decision_maker_candidates').run()
  db.close()
  return userData
}

async function waitForDeepJob(page, maxMs) {
  const deadline = Date.now() + (maxMs || Number(process.env.DEEP_WAIT_MS || '180000'))
  let last = null
  while (Date.now() < deadline) {
    last = await page.evaluate(() => window.desktop && window.desktop.enrichment && window.desktop.enrichment.status())
    if (last && !last.running && last.pending === 0) return last
    await page.waitForTimeout(2000)
  }
  throw new Error('deep pass did not settle: ' + JSON.stringify(last))
}

async function main() {
  const key = readKey()
  const root = mkdtempSync(join(tmpdir(), 'nafran-deep-electron-'))
  const userData = copyDatabase(root)
  let app
  try {
    app = await _electron.launch({ args: ['.', '--user-data-dir=' + userData], cwd: APP, timeout: 60000 })
    const page = await app.firstWindow()
    const child = app.process()
    child?.on('exit', (code, signal) => console.log(`Electron child exited · code=${code ?? 'null'} signal=${signal ?? 'none'}`))
    page.on('close', () => console.log('Electron window closed during deep test'))
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text())
    })
    await page.waitForLoadState('domcontentloaded')
    await page.waitForSelector('[data-view="dashboard"]', { timeout: 30000 })

    await page.click('[data-view="settings"]')
    await page.waitForTimeout(500)
    await page.locator('[data-stab="acct"]').click()
    const keyInput = page.locator('[data-deepkey="1"]')
    check('Account exposes a password field', (await keyInput.getAttribute('type')) === 'password')
    await keyInput.fill(key)
    await page.locator('[data-deeptest="1"]').click()
    await page.waitForFunction(() => /Working|Rejected|No answer|could not/i.test(document.querySelector('[data-deepnote="1"]') ? document.querySelector('[data-deepnote="1"]').textContent || '' : ''), null, { timeout: 30000 })
    const keyNote = ((await page.textContent('[data-deepnote="1"]')) || '').trim()
    check('Account test accepts the credential', /^Working/i.test(keyNote), keyNote.replace(/\$[\d.]+/, '$…'))
    await page.locator('[data-deepsave="1"]').click()
    await page.waitForTimeout(600)
    const stored = await page.evaluate(() => Boolean(window.localStorage.getItem('nafran.dataforseo.key')))
    check('the tested key is saved only in the isolated profile', stored)

    await page.click('[data-view="dm"]')
    await page.waitForTimeout(700)
    const total = await page.locator('[data-dm-limit="1"]').getAttribute('max')
    check('Decision Makers has captured leads to select', Number(total) > 0, (total || '0') + ' available')
    await page.locator('[data-dm-limit="1"]').fill(String(LEAD_LIMIT))
    const selected = await page.textContent('[data-dm-selection="1"]')
    check('the UI selects the requested lead count', new RegExp(`${LEAD_LIMIT} of \\d+ captured lead`).test(selected || ''), (selected || '').trim())
    await page.locator('[data-deeprun="1"]').first().click()
    await page.waitForTimeout(1000)
    const queuedText = await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '))
    check('the paid deep pass is queued from Electron', new RegExp(`${LEAD_LIMIT} selected lead(?:s)? queued|owner search`, 'i').test(queuedText), (queuedText.match(/\d+ selected lead[^.]*\./i) || ['queue message not found'])[0])

    const settled = await waitForDeepJob(page)
    check('the background deep job settles', Boolean(settled && !settled.running && settled.pending === 0), JSON.stringify(settled))
    await page.waitForTimeout(3000)

    const view = await page.evaluate(async (limit) => {
      const candidates = await window.desktop.local.people.candidates(true)
      const leads = await window.desktop.local.leads.list({ limit })
      return {
        candidateCount: candidates.length,
        candidateLeadIds: [...new Set(candidates.map((candidate) => candidate.lead_id))],
        candidate: candidates[0] ? { name: candidates[0].full_name, title: candidates[0].title, lead: candidates[0].lead_name, source: candidates[0].source } : null,
        leadIds: (leads.rows || []).map((lead) => lead.id),
        leadNames: (leads.rows || []).map((lead) => lead.name),
        body: document.body.innerText.replace(/\s+/g, ' '),
      }
    }, LEAD_LIMIT)
    check('decision-maker suggestions are saved', view.candidateCount > 0, JSON.stringify({ count: view.candidateCount, leads: view.candidateLeadIds.length, sample: view.candidate }))
    check('suggestions belong to the selected leads', view.candidateLeadIds.every((id) => view.leadIds.includes(id)), `${view.candidateLeadIds.length} lead(s) with suggestions · ${view.leadNames.join(', ')}`)
    check('the suggestion is visible on Decision Makers', /Suggestions to review/i.test(view.body) && (view.candidate ? view.body.includes(view.candidate.name) : false), view.candidate ? view.candidate.name : 'no candidate')
    check('the renderer reported no errors', errors.length === 0, errors.slice(0, 2).join(' | '))

    await app.close()
    app = null
    const db = new DatabaseSync(join(userData, 'leads.db'), { readOnly: true })
    const job = db.prepare("select kind, status, found, error from enrichment_jobs where kind = 'deep' order by created_at desc limit 1").get()
    const savedCandidates = db.prepare('select lead_id, full_name, title, source, email from decision_maker_candidates order by created_at desc').all()
    db.close()
    check('SQLite records the completed deep job', job && job.kind === 'deep' && job.status === 'done', JSON.stringify(job))
    check('SQLite records no provider warning', Boolean(job && job.error == null), JSON.stringify(job))
    const uniqueSuggestions = new Set(savedCandidates.map((candidate) => `${candidate.lead_id}|${candidate.full_name}|${candidate.source}`))
    check('SQLite records the suggestions', savedCandidates.length > 0 && savedCandidates.every((candidate) => candidate.full_name), JSON.stringify({ count: savedCandidates.length, leads: new Set(savedCandidates.map((candidate) => candidate.lead_id)).size }))
    check('SQLite has no duplicate suggestions', uniqueSuggestions.size === savedCandidates.length, `${uniqueSuggestions.size} unique of ${savedCandidates.length}`)
  } finally {
    if (app) await app.close().catch(() => undefined)
    rmSync(root, { recursive: true, force: true })
  }

  const failed = results.filter((ok) => !ok).length
  console.log('deep Electron checks: ' + (results.length - failed) + '/' + results.length + ' passed')
  if (failed) process.exitCode = 1
}

main().catch((error) => {
  console.error('deep Electron test failed:', error.message)
  process.exitCode = 1
})
