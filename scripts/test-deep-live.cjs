// A live test of the paid DataForSEO path, against the real API.
//
// The other suites prove the deep pass's own logic with snippets they write themselves. This one
// spends real money on the real service: it checks the credential (free), then runs the two searches
// a deep pass runs for one lead and prints everything that came back, including what it cost.
//
// The key is read from a file rather than passed on the command line, because a command line ends up
// in shell history and in process listings, and this credential is a paid login.
//
//   .secrets/dataforseo.key   — the key alone, nothing else in the file
//
// Usage:
//   node scripts/test-deep-live.cjs                (one lead, about $0.002)
//   node scripts/test-deep-live.cjs --leads 3      (three leads)
//   node scripts/test-deep-live.cjs --lead "HAS Law"   (a named lead)
//
// Nothing is written to the database: this reads leads, searches, and prints.
const { readFileSync, copyFileSync, mkdtempSync, existsSync, rmSync } = require('node:fs')
const { join } = require('node:path')
const { tmpdir } = require('node:os')
const { DatabaseSync } = require('node:sqlite')

const { checkKey, searchOwnerCandidates, searchEmails, queryForOwner, queryForOwnerEmail, locationForLead } = require('../dist-electron/enrichment/dataforseo.js')

const KEY_FILE = join(process.cwd(), '.secrets', 'dataforseo.key')
const REAL_DB = join(process.env.APPDATA ?? '', 'nafran-leads-scraper', 'leads.db')

function readKey() {
  const fromEnv = (process.env.DATAFORSEO_API_KEY ?? '').trim()
  if (fromEnv) return { key: fromEnv, from: 'the DATAFORSEO_API_KEY environment variable' }
  if (!existsSync(KEY_FILE)) return { key: '', from: '' }
  const key = readFileSync(KEY_FILE, 'utf8').trim().replace(/^["']|["']$/g, '')
  return { key, from: '.secrets/dataforseo.key' }
}

/** Never prints the credential: the length is enough to tell two keys apart. */
function mask(key) {
  return `${'*'.repeat(Math.max(0, Math.min(12, key.length - 4)))}${key.slice(-4)} (${key.length} characters)`
}

/**
 * A few real leads out of the live database, so the search is for a business that exists rather
 * than one invented here. The file is copied first: the app may be running against it, and a reader
 * is not worth locking a running app out of its own database for.
 */
function readLeads(limit, wanted) {
  if (!existsSync(REAL_DB)) return []
  const dir = mkdtempSync(join(tmpdir(), 'leadsnap-live-'))
  const copy = join(dir, 'leads.db')
  copyFileSync(REAL_DB, copy)
  for (const suffix of ['-wal', '-shm']) {
    const side = `${REAL_DB}${suffix}`
    if (existsSync(side)) copyFileSync(side, `${copy}${suffix}`)
  }
  const db = new DatabaseSync(copy, { readOnly: true })
  try {
    const rows = wanted
      ? db.prepare('select name, area, address from leads where name like ? limit ?').all(`%${wanted}%`, limit)
      : db.prepare("select name, area, address from leads where website <> '' order by captured_at desc limit ?").all(limit)
    return rows.map((row) => ({ name: String(row.name ?? ''), area: String(row.area ?? ''), address: String(row.address ?? '') }))
  } finally {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  }
}

async function main() {
  const args = process.argv.slice(2)
  const limitArg = args.indexOf('--leads')
  const wantedArg = args.indexOf('--lead')
  const limit = limitArg >= 0 ? Math.max(1, Math.min(10, Number(args[limitArg + 1]) || 1)) : wantedArg >= 0 ? 1 : 1
  const wanted = wantedArg >= 0 ? String(args[wantedArg + 1] ?? '') : ''

  const { key, from } = readKey()
  if (!key) {
    console.log('No key found.')
    console.log(`Put the DataForSEO key in ${KEY_FILE} (that file alone, nothing else) and run this again.`)
    process.exitCode = 1
    return
  }
  console.log(`key: ${mask(key)} — read from ${from}`)
  console.log('')

  // Step one, which costs nothing: does the credential work, and what is on the account?
  const check = await checkKey(key)
  console.log(`1. credential  ${check.ok ? 'OK' : 'FAILED'} · ${check.note}`)
  if (!check.ok) {
    console.log('')
    console.log('Stopping here: a search with this key would only be rejected, and the paid half is not')
    console.log('worth exercising until the free half passes.')
    process.exitCode = 1
    return
  }

  const leads = readLeads(limit, wanted)
  if (!leads.length) {
    console.log('')
    console.log('No lead to search for. Either the database has no leads with a website, or --lead did not match.')
    process.exitCode = 1
    return
  }
  console.log('')

  let spent = 0
  for (const lead of leads) {
    const where = locationForLead(lead)
    const ownerQuery = queryForOwner(lead)
    console.log(`2. ${lead.name}${lead.area ? ` (${lead.area})` : ''}`)
    console.log(`   market: ${where.location} · ${where.domain} · ${where.language}`)
    console.log(`   search: “${ownerQuery}”`)

    const owners = await searchOwnerCandidates(key, ownerQuery, where, { waitMs: 90_000 })
    spent += owners.cost
    if (owners.error) console.log(`   error: ${owners.error}`)
    console.log(`   owners found: ${owners.owners.length}${owners.owners.length ? ` · ${owners.owners.map((owner) => `${owner.fullName} (${owner.title})`).join(', ')}` : ''}`)
    console.log(`   cost: $${owners.cost.toFixed(4)}`)

    const owner = owners.owners[0]
    if (!owner) {
      console.log('   no follow-up search: nobody was named')
      console.log('')
      continue
    }

    const emailQuery = queryForOwnerEmail(lead, owner)
    console.log(`   search: “${emailQuery}”`)
    const emails = await searchEmails(key, emailQuery, where, { waitMs: 90_000 })
    spent += emails.cost
    if (emails.error) console.log(`   error: ${emails.error}`)
    console.log(`   addresses read: ${emails.emails.length}${emails.emails.length ? ` · ${emails.emails.slice(0, 6).map((entry) => entry.value).join(', ')}` : ''}`)
    for (const entry of emails.emails.slice(0, 3)) {
      console.log(`     · ${entry.value} — from ${entry.url || 'a snippet'}${entry.obfuscated ? ' (written obfuscated)' : ''}`)
    }
    console.log(`   cost: $${emails.cost.toFixed(4)}`)
    console.log('')
  }

  console.log(`searches paid for in this run: $${spent.toFixed(4)}`)
  const after = await checkKey(key)
  console.log(`balance now: ${after.note}`)
}

main().catch((error) => {
  console.error('live test failed:', error.message)
  process.exitCode = 1
})
