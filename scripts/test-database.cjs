// Exercises the local database and the repository directly, without launching the app.
//
// The main process uses node:sqlite, which is also present in this Node build, so the whole
// storage layer can be driven from a script: schema, workspace bootstrap, run persistence,
// de-duplication, contacts, lists, jobs and the aggregate views.
//
// Usage: npm run db:test
const { mkdtempSync, rmSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')

const { LocalDatabase } = require('../dist-electron/db/local-db.js')
const { Repository, personNameFromEmail, personNameFromLinkedIn } = require('../dist-electron/db/repository.js')
const { buildExport } = require('../dist-electron/export/writer.js')

const results = []
function check(name, ok, detail = '') {
  results.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` · ${detail}` : ''}`)
}

const dir = mkdtempSync(join(tmpdir(), 'leadmap-db-'))
const file = join(dir, 'leads.db')

const db = new LocalDatabase(file)
const repo = new Repository(db)

// ---------------------------------------------------------------- workspace

const workspace = db.ensureWorkspace()
check('workspace is created on first launch', Boolean(workspace.id), `${workspace.name} · ${workspace.plan}`)
check('creating it twice returns the same one', db.ensureWorkspace().id === workspace.id)

const usage = db.usage(workspace.id)
check('a usage counter is opened for the period', usage.scrapes_used === 0 && usage.scrape_limit === 2000, JSON.stringify(usage))
check('atomic increment reports the new total', db.incrementScrapeUsage(workspace.id) === 1)
check('and accumulates', db.incrementScrapeUsage(workspace.id, 4) === 5)

// ---------------------------------------------------------------- runs and leads

const lead = (name, ref, extra = {}) => ({
  name,
  placeRef: ref,
  address: `${name} Street, Manchester M1 1AA`,
  area: 'Manchester',
  postcode: 'M1 1AA',
  phone: '+44 161 000 0000',
  website: `https://${name.toLowerCase().replace(/[^a-z]/g, '')}.example.com`,
  rating: 4.7,
  reviewCount: 120,
  placeRef: ref,
  mapsUrl: `https://maps.google.com/?cid=${ref}`,
  capturedAt: new Date().toISOString(),
  ...extra,
})

const run = repo.saveRun(workspace.id, {
  provider: 'chromium-maps',
  status: 'done',
  keywords: ['physiotherapy', 'dentist'],
  location: 'Manchester, United Kingdom',
  maxResultsPerKeyword: 20,
  detail: true,
  durationMs: 227000,
  startedAt: new Date().toISOString(),
  finishedAt: new Date().toISOString(),
  error: null,
  leads: [lead('Deansgate Physio', 'ref-1'), lead('Northern Spine', 'ref-2'), lead('Glow Skin', 'ref-3')],
})
check('a run stores its leads', run.saved === 3, `saved ${run.saved}`)

// The same place reference must not be inserted again.
const repeat = repo.saveRun(workspace.id, {
  provider: 'chromium-maps',
  status: 'done',
  keywords: ['physiotherapy'],
  location: 'Manchester, United Kingdom',
  maxResultsPerKeyword: 20,
  detail: true,
  durationMs: 1000,
  startedAt: new Date().toISOString(),
  finishedAt: new Date().toISOString(),
  error: null,
  leads: [lead('Deansgate Physio', 'ref-1'), lead('Chorlton Movement', 'ref-4')],
})
check('a repeat run only adds the places it has not seen', repeat.saved === 1, `saved ${repeat.saved}`)
check('the original run retains all three captured businesses', repo.listLeads(workspace.id, {runId:run.runId}).total === 3)
check('a repeat run includes both existing and new businesses', repo.listLeads(workspace.id, {runId:repeat.runId}).total === 2)
const repeatExport = buildExport(repo, workspace.id, {kind:'leads', runId:repeat.runId, limit:20, delimiter:',', columns:['Business name'], fileName:'repeat.csv'})
check('exporting a repeat run includes its previously saved businesses', repeatExport.rows === 2)

// A re-run should enrich a row that was stored without a phone number.
repo.saveRun(workspace.id, {
  provider: 'chromium-maps',
  status: 'done',
  keywords: ['x'],
  location: 'Manchester',
  maxResultsPerKeyword: 1,
  detail: true,
  durationMs: 100,
  startedAt: new Date().toISOString(),
  finishedAt: new Date().toISOString(),
  error: null,
  leads: [lead('Sparse Clinic', 'ref-5', { phone: '', website: '' })],
})
const enriched = repo.saveRun(workspace.id, {
  provider: 'chromium-maps',
  status: 'done',
  keywords: ['x'],
  location: 'Manchester',
  maxResultsPerKeyword: 1,
  detail: true,
  durationMs: 100,
  startedAt: new Date().toISOString(),
  finishedAt: new Date().toISOString(),
  error: null,
  leads: [lead('Sparse Clinic', 'ref-5')],
})
const sparse = repo
  .listLeads(workspace.id)
  .rows.find((row) => row.place_ref === 'ref-5')
check('a re-run fills in details the first run missed', Boolean(sparse.phone) && enriched.saved === 0, `phone "${sparse.phone}"`)

const ledger = repo.listLeads(workspace.id)
check('the ledger returns every lead', ledger.total === 5, `total ${ledger.total}`)
check('and derives contact flags per row', ledger.rows.every((row) => row.has_email === 0 && row.has_social === 0))

const runs = repo.listRuns(workspace.id)
check('run history is stored', runs.length === 4, `${runs.length} runs`)
check('keywords round-trip through JSON', JSON.parse(runs[runs.length - 1].keywords)[0] === 'physiotherapy')
// Each run keeps the count it reported: 3, then 1, then 1, then 2.
const counts = repo.runCounts(workspace.id)
check('run totals are aggregated', counts.runs === 4 && counts.places === 7, JSON.stringify(counts))
check('a median duration is reported', counts.medianMs > 0, `${counts.medianMs}ms`)

// ---------------------------------------------------------------- contacts

const target = ledger.rows[0]
repo.upsertContact({ leadId: target.id, kind: 'email', value: 'hello@deansgate.test', score: 95, verified: true, source: 'website' })
repo.upsertContact({ leadId: target.id, kind: 'email', value: 'info@deansgate.test', score: 45, source: 'website' })
const again = repo.upsertContact({ leadId: target.id, kind: 'email', value: 'hello@deansgate.test', score: 96, verified: true })
repo.updateEmailValidation(again.id, { status: 'valid', verified: true, score: 96, message: 'Mailbox confirmed', provider: 'mailverifier' })
check('re-adding the same address updates it rather than duplicating', Boolean(again.id))
const emails = repo.listContacts(workspace.id, 'email')
check('one main business address stays active', emails.length === 1, `${emails.length} addresses`)
check('the re-added address kept its identity', emails.filter((row) => row.value === 'hello@deansgate.test').length === 1)
check('and picked up the new score', emails.find((row) => row.value === 'hello@deansgate.test').score === 96)

const afterEmail = repo.listLeads(workspace.id).rows.find((row) => row.id === target.id)
check('the ledger now reports an email for that lead', afterEmail.has_email === 1)

// An empty value must be refused rather than stored.
let refused = false
try {
  repo.upsertContact({ leadId: target.id, kind: 'email', value: '   ' })
} catch {
  refused = true
}
check('an empty contact value is rejected', refused)

// ---------------------------------------------------------------- socials

repo.upsertSocialProfile({
  workspaceId: workspace.id,
  leadId: target.id,
  platform: 'instagram',
  handle: 'deansgatephysio',
  profileUrl: 'https://instagram.com/deansgatephysio',
  followers: 1240,
  verified: true,
})
repo.upsertSocialProfile({
  workspaceId: workspace.id,
  leadId: target.id,
  platform: 'instagram',
  handle: 'deansgatephysio',
  profileUrl: 'https://instagram.com/deansgatephysio',
  followers: 1300,
})
check('a social profile is stored once per platform and url', repo.listSocialProfiles(workspace.id).length === 1)
check('and an update refreshes it', repo.listSocialProfiles(workspace.id)[0].followers === 1300)
check('the ledger now reports socials for that lead', repo.listLeads(workspace.id).rows.find((row) => row.id === target.id).has_social === 1)

const coverage = repo.socialCoverage(workspace.id)
check('the social coverage view groups by platform', coverage.length === 1 && coverage[0].leads === 1, JSON.stringify(coverage))

// ---------------------------------------------------------------- email coverage views

const emailCoverage = repo.emailCoverage(workspace.id)
check('the email coverage view counts leads and the active main address', emailCoverage.leads === 5 && emailCoverage.emails === 1, JSON.stringify(emailCoverage))
check('and separates verified from outstanding', emailCoverage.verified === 1 && emailCoverage.needs_verify === 0)
const confidence = repo.emailConfidence(workspace.id)
check('confidence bands are bucketed to five points', confidence.every((band) => band.band_from % 5 === 0), JSON.stringify(confidence))

// ---------------------------------------------------------------- decision makers

repo.addDecisionMaker({ workspaceId: workspace.id, leadId: target.id, fullName: 'Ruth Ellery', title: 'Clinic Director' })
check('a decision maker is stored against its lead', repo.listDecisionMakers(workspace.id).length === 1)

// ---------------------------------------------------------------- lists

const list = repo.createList(workspace.id, 'Manchester Physio · Tier 1')
check('a list is created', Boolean(list.id))
check('creating it again returns the same one', repo.createList(workspace.id, 'Manchester Physio · Tier 1').id === list.id)

const added = repo.addLeadsToList(list.id, [ledger.rows[0].id, ledger.rows[1].id, ledger.rows[0].id])
check('leads are added once each', added.added === 2 && added.skipped === 1, JSON.stringify(added))
check('the list reports its members', repo.listMembers(list.id).length === 2)
check('and which lists a lead is in', repo.listIdsForLead(ledger.rows[0].id).length === 1)

const lists = repo.listLists(workspace.id)
check('the list carries a member count', lists[0].members === 2, `${lists[0].members} members`)
check('and sample initials for its avatars', lists[0].initials.length === 2, `"${lists[0].initials}"`)
check('list totals are aggregated', JSON.stringify(repo.listTotals(workspace.id)) === JSON.stringify({ lists: 1, leads: 2 }))

repo.removeLeadFromList(list.id, ledger.rows[1].id)
check('a lead can be removed from a list', repo.listMembers(list.id).length === 1)

// Deleting a lead must not leave an orphan in a list. Run on a lead of its own, so the leads the
// export checks below rely on are still on file.
const doomed = repo.saveRun(workspace.id, {
  provider: 'chromium-maps',
  status: 'done',
  keywords: ['x'],
  location: 'Manchester',
  maxResultsPerKeyword: 1,
  detail: true,
  durationMs: 100,
  startedAt: new Date().toISOString(),
  finishedAt: new Date().toISOString(),
  error: null,
  leads: [lead('Doomed Clinic', 'ref-doomed')],
})
const doomedLead = repo.listLeads(workspace.id).rows.find((row) => row.place_ref === 'ref-doomed')
repo.addLeadsToList(list.id, [doomedLead.id])
check('the doomed lead joins the list', repo.listMembers(list.id).length === 2, `${repo.listMembers(list.id).length} members`)
db.run('delete from leads where id = ?', [doomedLead.id])
check('deleting a lead removes it from every list', repo.listMembers(list.id).length === 1)
void doomed

// ---------------------------------------------------------------- jobs

const queued = repo.queueJob(workspace.id, 'email', [target.id])
check('an enrichment job is queued', queued.queued === 1 && Boolean(queued.jobId))
const next = repo.nextQueuedJob()
check('the worker can pick up the next job', next && next.kind === 'email')
repo.markJob(next.id, 'done', 2)
check('a finished job is marked done', repo.jobTotals(workspace.id).done === 1)
check('and its leads read as covered', repo.coveredLeads(workspace.id, 'email', ['done']).has(target.id))

// ---------------------------------------------------------------- exports

repo.recordExport({ workspaceId: workspace.id, kind: 'leads', scope: 'All saved leads', rowCount: 4, columns: ['Business name'], fileName: 'all-leads.csv', path: 'C:/tmp/all-leads.csv' })
check('an export is recorded', repo.listExports(workspace.id).length === 1)

// ---------------------------------------------------------------- export building

const leadCsv = buildExport(repo, workspace.id, {
  kind: 'leads',
  limit: 100,
  delimiter: 'csv',
  columns: ['Business name', 'Domain', 'Phone', 'Email', 'Socials', 'Score', 'Saved date'],
  fileName: 'all-leads.csv',
})
const leadLines = leadCsv.body.trim().split('\n')
check('the leads export has a header and one row per lead', leadCsv.rows === 5 && leadLines.length === 6, `${leadCsv.rows} rows`)
check('the header names the chosen columns', leadLines[0] === 'Business name,Domain,Phone,Email,Socials,Score,Saved date', leadLines[0])
check('an address is written into its column', leadCsv.body.includes('hello@deansgate.test'), 'email column')
check('the lead with a social profile carries it', /instagram/.test(leadCsv.body))

// A cell containing the delimiter must be quoted, or the file will not parse.
repo.upsertContact({ leadId: ledger.rows[1].id, kind: 'email', value: 'a,b@example.test', score: 50 })
const quoted = buildExport(repo, workspace.id, {
  kind: 'leads',
  limit: 100,
  delimiter: 'csv',
  columns: ['Business name', 'Email'],
  fileName: 'quoted.csv',
})
check('a cell containing the delimiter is quoted', quoted.body.includes('"a,b@example.test"'), 'quoting')

// The tab delimiter must switch the separator, not just the file extension.
const tabbed = buildExport(repo, workspace.id, {
  kind: 'leads',
  limit: 100,
  delimiter: 'tsv',
  columns: ['Business name', 'Score'],
  fileName: 'leads.tsv',
})
check('the tab delimiter switches the separator', tabbed.body.split('\n')[0] === 'Business name\tScore', JSON.stringify(tabbed.body.split('\n')[0]))

// Runs carry their keywords back out of JSON and format their duration.
const runCsv = buildExport(repo, workspace.id, {
  kind: 'runs',
  limit: 50,
  delimiter: 'csv',
  columns: ['Started at', 'Keywords', 'Source', 'Places captured', 'Duration', 'Status'],
  fileName: 'runs.csv',
})
check('the run export lists every run', runCsv.rows === 5, `${runCsv.rows} runs`)
check('keywords are written as text rather than JSON', runCsv.body.includes('physiotherapy, dentist'), runCsv.body.split('\n')[1])
check('a duration is written as mm:ss', /\d{2}:\d{2}/.test(runCsv.body), 'duration column')

// Choosing no columns must fail rather than write an empty file.
let noColumns = false
try {
  buildExport(repo, workspace.id, { kind: 'leads', limit: 10, delimiter: 'csv', columns: ['Not a column'], fileName: 'x.csv' })
} catch {
  noColumns = true
}
check('an export with no usable columns is refused', noColumns)

// ---------------------------------------------------------------- decision maker suggestions

console.log('\n--- decision maker suggestions ---')

// A name in an email local part is a suggestion; a role mailbox or a free provider is not.
check('a dotted local part names a person', personNameFromEmail('ruth.ellery@clinic.co.uk') === 'Ruth Ellery', String(personNameFromEmail('ruth.ellery@clinic.co.uk')))
check('a single given name is accepted', personNameFromEmail('anastasia@an-gri.com') === 'Anastasia', String(personNameFromEmail('anastasia@an-gri.com')))
check('an underscored local part is accepted', personNameFromEmail('maria_umer@drmariaumer.com') === 'Maria Umer')
check('a role mailbox is refused', personNameFromEmail('info@clinic.co.uk') === null)
check('reception is refused', personNameFromEmail('reception.arndaledental@portmandentex.com') === null)
check('a free provider is refused', personNameFromEmail('dermics.pk@gmail.com') === null)
check('a public mailbox stays refused unless a search asks for it', personNameFromEmail('ruth.ellery@gmail.com') === null)
check('a search may name a person at a public mailbox', personNameFromEmail('ruth.ellery@gmail.com', { allowPublicMailbox: true }) === 'Ruth Ellery', String(personNameFromEmail('ruth.ellery@gmail.com', { allowPublicMailbox: true })))
check('a hyphenated desk name is refused', personNameFromEmail('manchester-rec@mydentist.co.uk') === null)
check('a brand-shaped local part is refused', personNameFromEmail('drzarqaclinic@gmail.com') === null)

// A LinkedIn profile slug names the person; a company page names the business.
check(
  'a profile slug names the person',
  personNameFromLinkedIn('https://www.linkedin.com/in/dr-rabia-hayat-dermatologist-in-lahore-158a68221') === 'Dr Rabia Hayat',
  String(personNameFromLinkedIn('https://www.linkedin.com/in/dr-rabia-hayat-dermatologist-in-lahore-158a68221')),
)
check(
  'a plain profile slug is accepted',
  personNameFromLinkedIn('https://www.linkedin.com/in/aleem-uddin-3b31a3355') === 'Aleem Uddin',
  String(personNameFromLinkedIn('https://www.linkedin.com/in/aleem-uddin-3b31a3355')),
)
check('a long surname slug is handled', personNameFromLinkedIn('https://www.linkedin.com/in/anastasia-gridnevskaya-b05a67a4') === 'Anastasia Gridnevskaya')
check('a company page names nobody', personNameFromLinkedIn('https://uk.linkedin.com/company/mydentistuk') === null)
check('a company page with a name in it still names nobody', personNameFromLinkedIn('https://www.linkedin.com/company/dr-rizwan-phsiotherapy-home-service') === null)

// The offline pass builds suggestions from rows already on file.
// Use a different business: adding a secondary personal mailbox must not replace
// the already-selected main contact address on the first business.
const suggestionLead = ledger.rows[2]
repo.upsertContact({ leadId: suggestionLead.id, kind: 'email', value: 'ruth.ellery@deansgate.test', source: 'website', score: 86 })
const built = repo.buildSuggestions(workspace.id)
check('suggestions are built from what is on file', built.suggested > 0, `${built.suggested} suggested`)
const candidates = repo.listCandidates(workspace.id)
check('the suggested person appears', candidates.some((c) => c.full_name === 'Ruth Ellery'), candidates.map((c) => c.full_name).join(', '))
check('a suggestion carries its evidence', candidates.every((c) => c.evidence.length > 0), candidates[0]?.evidence ?? '')
check('building twice does not duplicate', repo.buildSuggestions(workspace.id).suggested === 0)
check('candidate totals are reported', repo.candidateTotals(workspace.id).suggested === candidates.length)

// The confirmed table is only ever written to by a confirmation.
const beforeConfirm = repo.listDecisionMakers(workspace.id)
const toConfirm = candidates.find((c) => c.full_name === 'Ruth Ellery')
const confirmed = repo.confirmCandidate(workspace.id, toConfirm.id)
check('a suggestion can be confirmed', confirmed.confirmed)
const afterConfirm = repo.listDecisionMakers(workspace.id)
const alreadyNamed = beforeConfirm.some((row) => row.lead_id === toConfirm.lead_id && row.full_name === toConfirm.full_name)
check('confirming stores the named contact without duplicating an existing person',
  afterConfirm.length === beforeConfirm.length + (alreadyNamed ? 0 : 1) &&
  afterConfirm.some((row) => row.lead_id === toConfirm.lead_id && row.full_name === toConfirm.full_name && row.email === toConfirm.email))
check('and removes it from the suggestions', !repo.listCandidates(workspace.id).some((c) => c.id === toConfirm.id))
check('an inferred name without an owner role is not presented as an owner', !repo.decisionMakerLedger(workspace.id).some(row => row.lead_id === toConfirm.lead_id && row.full_name === toConfirm.full_name))

const toDismiss = repo.listCandidates(workspace.id)[0]
if (toDismiss) {
  repo.dismissCandidate(workspace.id, toDismiss.id)
  check('a suggestion can be dismissed', !repo.listCandidates(workspace.id).some((c) => c.id === toDismiss.id))
  check('a dismissed suggestion is still on record', repo.listCandidates(workspace.id, true).some((c) => c.id === toDismiss.id))
  check('and is not suggested again', repo.buildSuggestions(workspace.id).suggested === 0)
}

// The prune must leave confirmed people alone.
const prunedPeople = repo.pruneNoisyPeople(() => true)
check('a permissive prune removes nothing', prunedPeople.removed === 0)

// ---------------------------------------------------------------- address quality

const { isUsableEmail, scoreEmail, normalisePhone } = require('../dist-electron/enrichment/website.js')

check('a business address is usable', isUsableEmail('enquiries@totalsportsrehab.co.uk'))
check('a footer tracking address is not', !isUsableEmail('mymail@mailservice.com'))
check('a platform address is not', !isUsableEmail('noreply@sentry.io'))
check('an asset filename is not', !isUsableEmail('logo@2x.png'))

// An address on the business's own domain is worth more than one on a free provider.
const ownDomain = scoreEmail('info@deansgatephysio.co.uk', 'deansgatephysio.co.uk')
const freeMail = scoreEmail('deansgatephysio@gmail.com', 'deansgatephysio.co.uk')
check('an address on the business domain outscores a free one', ownDomain > freeMail, `${ownDomain} vs ${freeMail}`)
check('a role address outscores a personal one', scoreEmail('info@x.co.uk', 'x.co.uk') > scoreEmail('dave@x.co.uk', 'x.co.uk'))

check('a local number keeps its published prefix without guessing its country', normalisePhone('021 37297209') === '02137297209')
check('an explicit UK country code is retained', normalisePhone('+44 161 496 0121') === '+44 161 496 0121')

// Anything an earlier version stored from a footer is cleared on the next launch.
repo.upsertContact({ leadId: ledger.rows[1].id, kind: 'email', value: 'mymail@mailservice.com', source: 'website', score: 40 })
const pruned = repo.pruneNoisyContacts(isUsableEmail)
check('a noisy stored address is pruned', pruned.removed >= 1, `${pruned.removed} removed`)
check('and a real one survives', repo.listContacts(workspace.id, 'email').every((row) => isUsableEmail(String(row.value))))

// ---------------------------------------------------------------- durability

db.close()

const reopened = new LocalDatabase(file)
const reopenedRepo = new Repository(reopened)
check('the database reopens with its rows intact', reopenedRepo.listLeads(workspace.id).total === 5, `${reopenedRepo.listLeads(workspace.id).total} leads after reopen`)
check('and keeps its workspace', reopened.ensureWorkspace().id === workspace.id)
check('run memberships survive restarting the database', reopenedRepo.listLeads(workspace.id, {runId:repeat.runId}).total === 2)
reopened.close()

// The Dashboard's date buttons must change the database aggregate, including related contacts.
const periodDb = new LocalDatabase(join(dir, 'period.db'))
const periodRepo = new Repository(periodDb)
const periodWorkspace = periodDb.ensureWorkspace()
for (const [age, name, ref, phone] of [
  [1, 'Today Clinic', 'period-today', '+44 161 000 0000'],
  [15, 'Earlier Clinic', 'period-earlier', ''],
  [45, 'Old Clinic', 'period-old', ''],
]) {
  const at = new Date(Date.now() - age * 86_400_000).toISOString()
  periodRepo.saveRun(periodWorkspace.id, {
    provider: 'chromium-maps', status: 'done', keywords: ['clinic'], location: 'Manchester',
    maxResultsPerKeyword: 1, detail: true, durationMs: 100, startedAt: at, finishedAt: at,
    error: null, leads: [lead(name, ref, { capturedAt: at, phone })],
  })
}
const last7 = periodRepo.dashboard(periodWorkspace.id, 7)
const last30 = periodRepo.dashboard(periodWorkspace.id, 30)
const allTime = periodRepo.dashboard(periodWorkspace.id)
check('dashboard 7 days excludes older leads', last7.total === 1 && last7.withPhone === 1)
check('dashboard 30 days includes recent and earlier leads', last30.total === 2 && last30.withPhone === 1)
check('dashboard all time includes the complete ledger', allTime.total === 3)
periodDb.close()

rmSync(dir, { recursive: true, force: true })

const failed = results.filter((entry) => !entry.ok)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
if (failed.length) {
  console.log('failed:')
  for (const entry of failed) console.log(`  - ${entry.name}`)
  process.exitCode = 1
}
