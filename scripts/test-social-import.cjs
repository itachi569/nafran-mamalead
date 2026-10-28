// Exercises the social URL import without launching the app.
//
// The parser and the import both live in the repository, and the main process uses node:sqlite,
// which is present in this Node build too — so the whole thing can be driven from a script:
// what a pasted line is read as, which lead it lands on, and what it does when there is no lead.
//
// Usage: node scripts/test-social-import.cjs
const { mkdtempSync, realpathSync, rmSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { basename, join, resolve, sep } = require('node:path')

const { LocalDatabase } = require('../dist-electron/db/local-db.js')
const { Repository, parseSocialUrl, readableNameFromHandle } = require('../dist-electron/db/repository.js')

const results = []
function check(name, ok, detail = '') {
  results.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` · ${detail}` : ''}`)
}

// ---------------------------------------------------------------- the parser

const cases = [
  ['https://www.instagram.com/acmedental/', 'instagram', 'acmedental'],
  ['instagram.com/acmedental', 'instagram', 'acmedental'],
  ['https://instagr.am/acmedental', 'instagram', 'acmedental'],
  ['https://www.facebook.com/acmedental', 'facebook', 'acmedental'],
  ['https://m.facebook.com/acmedental', 'facebook', 'acmedental'],
  ['https://fb.me/acmedental', 'facebook', 'acmedental'],
  ['https://www.tiktok.com/@acmedental', 'tiktok', 'acmedental'],
  ['https://www.youtube.com/@acmedental', 'youtube', 'acmedental'],
  ['https://www.youtube.com/channel/UC1234567890', 'youtube', 'UC1234567890'],
  ['https://x.com/acmedental', 'x', 'acmedental'],
  ['https://twitter.com/acmedental', 'x', 'acmedental'],
  ['https://www.linkedin.com/company/acmedental/', 'linkedin', 'acmedental'],
  ['https://www.linkedin.com/in/someone', 'linkedin', 'someone'],
  ['https://www.facebook.com/profile.php?id=100012345', 'facebook', '100012345'],
]

for (const [input, platform, handle] of cases) {
  const parsed = parseSocialUrl(input)
  check(
    `reads ${input.replace(/^https:\/\//, '')}`,
    parsed?.platform === platform && parsed?.handle === handle,
    parsed ? `${parsed.platform} · ${parsed.handle}` : 'not read',
  )
}

check('a bare handle needs the dropdown', parseSocialUrl('@acmedental') === null)
check('...and is read once the dropdown names the platform', parseSocialUrl('@acmedental', 'instagram')?.handle === 'acmedental')
check('a handle with no platform dropdown is skipped', parseSocialUrl('acmedental') === null)
check('a website is not a social profile', parseSocialUrl('https://acmedental.co.uk') === null)
check('a comment line is skipped', parseSocialUrl('# dental clinics') === null)
check('an empty line is skipped', parseSocialUrl('   ') === null)
check('a video short link is not a profile',parseSocialUrl('https://youtu.be/dQw4w9WgXcQ')===null)
check('an Instagram post is not a profile',parseSocialUrl('https://www.instagram.com/p/Cabc123/')===null)

// ---------------------------------------------------------------- the import

const dir = mkdtempSync(join(tmpdir(), 'leadmap-social-'))
const db = new LocalDatabase(join(dir, 'leads.db'))
const repo = new Repository(db)
const workspace = db.ensureWorkspace()

const now = new Date().toISOString()
for (const [id, name, website] of [
  ['lead-acme', 'Acme Dental Studio', 'https://acmedental.co.uk'],
  ['lead-bright', 'Bright Smile Clinic', 'https://brightsmileclinic.com'],
  ['lead-north', 'Northside Physio', ''],
]) {
  db.run('insert into leads (id, workspace_id, name, website, provider, score, captured_at) values (?, ?, ?, ?, ?, ?, ?)', [
    id,
    workspace.id,
    name,
    website,
    'chromium-maps',
    80,
    now,
  ])
}

const websiteAgain = repo.importWebsites(workspace.id, ['https://acmedental.co.uk'])
check(
  'a re-scanned website returns its existing lead',
  websiteAgain.skipped === 1 && websiteAgain.leadIds.includes('lead-acme'),
  JSON.stringify(websiteAgain),
)

const imported = repo.importSocialProfiles(workspace.id, [
  'https://www.instagram.com/acmedental/',
  'https://www.facebook.com/AcmeDentalStudio',
  'https://twitter.com/brightsmileclinic',
  'https://www.instagram.com/someone-else-entirely/',
  'https://www.instagram.com/acmedental/', // the same profile twice
  'not a url at all',
])

check('the profile is attached to the lead its handle names', imported.added === 4, `added ${imported.added}`)
check('a name that differs only in case and punctuation still matches', imported.matched >= 2)
check('the same profile twice is one profile', imported.added === 4, `${imported.added} added from 5 distinct urls`)
check('a URL that matches no lead gets a lead of its own', imported.created === 1 && imported.unmatched.length === 0, JSON.stringify(imported))
check('nothing was left unreadable', imported.unmatched.length === 0, imported.unmatched.join(', '))

const stored = db.query('select lead_id, platform, handle, profile_url, source from social_profiles order by platform')
check('four profiles are stored', stored.length === 4, JSON.stringify(stored.map((row) => `${row.platform}:${row.handle}`)))
check('they are marked as imported', stored.every((row) => row.source === 'import'))
check('the instagram one is on the right lead', stored.some((row) => row.platform === 'instagram' && row.lead_id === 'lead-acme'))
check('the twitter one is on the right lead', stored.some((row) => row.platform === 'x' && row.lead_id === 'lead-bright'))
check(
  'the profile URL is the canonical one',
  stored.some((row) => row.profile_url === 'https://www.instagram.com/acmedental'),
  stored.find((row) => row.platform === 'instagram')?.profile_url,
)

const created = db.one("select name, website, provider from leads where id not in ('lead-acme','lead-bright','lead-north')")
check('the new lead is named after the handle', created?.name === 'Someone Else Entirely', JSON.stringify(created))
check('the new lead is an import, not a scrape', created?.provider === 'import')

const batch = db.one("select kind, source_count, added, skipped from import_batches where kind = 'social'")
check('the batch records what happened', batch?.kind === 'social' && batch.added === 4, JSON.stringify(batch))

const coverage = repo.socialCoverage(workspace.id)
check('the coverage totals see the new profiles', coverage.length === 3 && coverage.find((row) => row.platform === 'instagram')?.profiles === 2, JSON.stringify(coverage))

// A run of the same paste again changes nothing new — the created lead now matches its own URL.
const again = repo.importSocialProfiles(workspace.id, ['https://www.instagram.com/acmedental/'])
check('re-importing the same URL adds nothing', again.added === 0 && again.skipped === 1, JSON.stringify(again))

// The dropdown answers for a line that does not say which platform it is.
const byDropdown = repo.importSocialProfiles(workspace.id, ['@brightsmileclinic'], 'instagram')
check('the dropdown platform is used for a bare handle', byDropdown.added === 1, JSON.stringify(byDropdown))

// A shared post must not inflate the saved account count or create a fictitious company.
const junk = repo.importSocialProfiles(workspace.id, ['https://www.instagram.com/p/Cabc123/'])
const junkLead = db.one("select name from leads where name like '%post%'")
check('a post link creates no social profile or fictitious lead', junk.added === 0 && junk.created === 0 && !junkLead,JSON.stringify(junk))

// Direct platform URLs must keep their existing lead, including links whose path does not name
// the business (Facebook numeric profiles) and saved URLs with a trailing slash.
const linkedin = repo.importSocialProfiles(workspace.id, ['https://www.linkedin.com/company/acmedental/'])
check('a direct LinkedIn company URL attaches to the named lead', linkedin.added === 1 && linkedin.matched === 1 && linkedin.leadIds[0] === 'lead-acme')

const facebookIdUrl = 'https://www.facebook.com/profile.php?id=100012345'
repo.upsertSocialProfile({ workspaceId: workspace.id, leadId: 'lead-north', platform: 'facebook', profileUrl: facebookIdUrl, source: 'website' })
repo.upsertSocialProfile({ workspaceId: workspace.id, leadId: 'lead-north', platform: 'instagram', profileUrl: 'https://www.instagram.com/northsidealias/', source: 'website' })
const leadsBeforeExistingImport = db.one('select count(*) as n from leads where workspace_id = ?', [workspace.id]).n
const existingPreview = repo.previewSocialImport(workspace.id, [facebookIdUrl, 'https://instagram.com/northsidealias'])
check('preview recognises saved direct URLs', existingPreview.every((row) => row.kind === 'skip' && /Northside Physio/.test(row.detail)))
const existingImport = repo.importSocialProfiles(workspace.id, [facebookIdUrl, 'https://instagram.com/northsidealias'])
const leadsAfterExistingImport = db.one('select count(*) as n from leads where workspace_id = ?', [workspace.id]).n
check('existing Facebook ID URL stays on its original lead', existingImport.skipped === 2 && existingImport.leadIds.length === 1 && existingImport.leadIds[0] === 'lead-north', JSON.stringify(existingImport))
check('alternate Instagram URL form does not create another lead', existingImport.created === 0 && leadsAfterExistingImport === leadsBeforeExistingImport)

// ---------------------------------------------------------------- search history

repo.saveSearchTerm(workspace.id, 'HAS Law', 'social', 2)
repo.saveSearchTerm(workspace.id, 'physio', 'social', 5)
repo.saveSearchTerm(workspace.id, 'HAS Law', 'social', 3)

const history = repo.listSearchHistory(workspace.id, 'social', 8)
check('a search is remembered', history.length === 2, JSON.stringify(history))
check('the most recent search is first', history[0].term === 'HAS Law', history.map((entry) => entry.term).join(', '))
check('searching again does not add a second row', history.filter((entry) => entry.term === 'HAS Law').length === 1)
check('the count follows the latest search', history[0].results === 3, String(history[0].results))
check('another page has its own history', repo.listSearchHistory(workspace.id, 'leads', 8).length === 0)

repo.saveSearchTerm(workspace.id, 'x', 'social', 1)
check('a one-character search is not offered back', repo.listSearchHistory(workspace.id, 'social', 8).length === 2)

// ---------------------------------------------------------------- readable names

check('a run-together handle becomes words', readableNameFromHandle('acmedental') === 'Acmedental', readableNameFromHandle('acmedental'))
check('a camel-case handle splits', readableNameFromHandle('AcmeDentalStudio') === 'Acme Dental Studio', readableNameFromHandle('AcmeDentalStudio'))
check('a dashed handle becomes words', readableNameFromHandle('acme-dental') === 'Acme Dental', readableNameFromHandle('acme-dental'))
check('an underscored handle becomes words', readableNameFromHandle('acme_dental') === 'Acme Dental', readableNameFromHandle('acme_dental'))
check('a URL is not a name', readableNameFromHandle('youtube.com/@acme') === '', readableNameFromHandle('youtube.com/@acme'))

console.log('')
const failed = results.filter((result) => !result.ok).length
console.log(`${results.length - failed}/${results.length} checks passed`)
// The database holds its file open, so the folder goes last and a locked file is not a failure.
try {
  db.close?.()
  const safeDir = realpathSync(dir)
  if (safeDir.startsWith(resolve(tmpdir()) + sep) && basename(safeDir).startsWith('leadmap-social-')) {
    rmSync(safeDir, { recursive: true, force: true })
  }
} catch {
  // A leftover temp folder is not worth failing the checks over.
}
process.exit(failed ? 1 : 0)
