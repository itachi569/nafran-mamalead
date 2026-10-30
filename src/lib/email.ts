// Service layer for the Email Finder page.
//
// Everything here reads and writes the local SQLite database through the preload bridge. An
// address lives in lead_contacts beside phones and socials, so a lead's email state is derived
// rather than stored: the tone comes from its best scoring address, and a lead with none is
// pending, missing or without a website depending on what the pipeline knows about it.
//
// Outside Electron there is no database and the caller falls back to the reference sample rows.
import type { LocalApi, StoredLead } from '../types/desktop'
import {compareEmailContacts} from '../../electron/email-ranking'

type Db = LocalApi
type ContactRow = Record<string, unknown>
export type EmailValidityStatus = 'valid' | 'invalid' | 'risky' | 'unknown'

export interface EmailAddress {
  id: string
  leadId: string
  value: string
  source: string
  /** The page the address was read off, when it was read off a page rather than typed in. */
  page: string
  verified: boolean
  score: number | null
  checkedAt: string | null
  validationStatus: EmailValidityStatus | null
  validationMessage: string
}

/** How an address — or a lead with none — reads on the page. */
export type EmailTone = 'high' | 'domain' | 'low' | 'unverified' | 'no-website' | 'pending'

export interface EmailRow {
  leadId: string
  index: string
  name: string
  domain: string
  /** Best scoring address, or "No email found" when the lead has none. */
  primary: string
  /** Addresses beyond the primary one, shown as "+N". */
  hasExtras: boolean
  extrasLabel: string
  tone: EmailTone
  /** Chip copy: "High · 95", "Not verified", "No website", "Pending". */
  label: string
  /** The Apify result for the primary address. Null means it has not been checked yet. */
  validityStatus: EmailValidityStatus | null
  statusLabel: string
  /**
   * Every address found on the lead's own site, primary first. The finder's "Emails found"
   * panel lists these, each labelled with the page it was read from.
   */
  found: {
    value: string
    page: string
    publishedOnOwnSite: boolean
    score: number | null
    validationStatus: EmailValidityStatus | null
    validationLabel: string
    validationMessage: string
  }[]
}

export interface CascadeStep {
  label: string
  note: string
  count: number
  width: string
  /** The pipeline draws an arrow between steps, but not after the last one. */
  arrow: boolean
}

export interface ConfidenceBucket {
  from: number
  to: number
  count: number
  height: string
  color: string
}

export interface ConfidenceChip {
  label: string
  count: number
  color: string
}

/**
 * A coverage ring: where the addresses on file were actually read from.
 *
 * The design draws four — homepage, contact page, team page and structured data — because that is
 * how a cascade reads a site, and the page can report which one paid off. The counts are addresses
 * rather than leads, so a site that publishes three addresses in its footer is one homepage hit
 * and the ring says so.
 */
export interface CoverageRing {
  name: string
  count: number
}

export interface EmailCoverage {
  /** Verified share of the scraped leads, shown in the cascade badge. */
  badge: string
  /** Leads in the workspace. */
  total: number
  /** Addresses captured, the population the confidence mix describes. */
  extracted: number
  needsVerify: number
  risky: number
  validity: {
    valid: number
    invalid: number
    risky: number
    unknown: number
    unchecked: number
  }
  noAddress: number
  perLead: string
  showing: number
  cascade: CascadeStep[]
  buckets: ConfidenceBucket[]
  chips: ConfidenceChip[]
  /** Where the addresses came off a site, in the order the coverage card draws them. */
  rings: CoverageRing[]
}

export interface EmailPageData {
  rows: EmailRow[]
  total: number
  coverage: EmailCoverage
}

export interface EmailAddressInput {
  leadId: string
  value: string
  source?: string
  verified?: boolean
  score?: number | null
}

const HIGH_FROM = 80
const DOMAIN_FROM = 40
const LOW_FROM = 20

const BUCKET_COLOR = { empty: '#E7E8E5', low: '#C8D5BB', domain: '#8FA382', high: '#1C1C1C' }
const CHIP_COLOR: Record<EmailTone, string> = {
  high: '#1C1C1C',
  domain: '#8FA382',
  low: '#C8D5BB',
  unverified: '#D8DAD6',
  'no-website': '#EDEEEB',
  pending: '#EAEAE8',
}

const TONE_LABEL: Record<EmailTone, string> = {
  high: 'High',
  domain: 'Domain',
  low: 'Low',
  unverified: 'Not verified',
  'no-website': 'No website',
  pending: 'Pending',
}

/** The host of a website, which is what the address rows show as the domain. */
function domainOf(website: string): string {
  if (!website) return ''
  try {
    return new URL(website).host.replace(/^www\./i, '')
  } catch {
    return website.replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0]
  }
}

function isOwnSiteSource(source: string, domain: string): boolean {
  if (!/^https?:\/\//i.test(source) || !domain) return false
  try {
    return new URL(source).hostname.replace(/^www\./i, '').toLowerCase() === domain.toLowerCase()
  } catch {
    return false
  }
}

function toAddress(row: ContactRow): EmailAddress {
  return {
    id: String(row.id),
    leadId: String(row.lead_id),
    value: String(row.value),
    source: String(row.source ?? ''),
    // A row written before the harvester recorded pages holds a bare kind like "website", which
    // is not a page; `pageLabelOf` reads both.
    page: String(row.source ?? ''),
    verified: Number(row.verified ?? 0) === 1,
    score: row.score === null || row.score === undefined ? null : Number(row.score),
    checkedAt: row.checked_at ? String(row.checked_at) : null,
    validationStatus:
      row.validation_status === 'valid' || row.validation_status === 'invalid' || row.validation_status === 'risky' || row.validation_status === 'unknown'
        ? row.validation_status
        : null,
    validationMessage: String(row.validation_message ?? ''),
  }
}

/**
 * The page an address was read from, as the finder names it.
 *
 * The harvester stores the URL it harvested, so the page is read back out of the path. A row that
 * predates that stores only the kind of pass that wrote it, which is reported as is.
 */
export function pageLabelOf(source: string): string {
  if (!source) return 'On file'
  if (!/^https?:\/\//i.test(source)) {
    if (source === 'website') return 'Homepage'
    if (source === 'maps') return 'Google Maps'
    return source.charAt(0).toUpperCase() + source.slice(1)
  }
  try {
    const url = new URL(source)
    const path = url.pathname.replace(/\/+$/, '')
    if (!path) return 'Homepage'
    const slug = path.split('/').filter(Boolean).pop() ?? ''
    if (/contact|reach|enquir|get-in-touch/i.test(slug)) return 'Contact page'
    if (/team|about|staff|people|meet/i.test(slug)) return 'Team page'
    return `${url.host.replace(/^www\./i, '')}${path}`
  } catch {
    return source
  }
}

function validityTone(address: EmailAddress): EmailTone {
  if (address.validationStatus === 'valid') return 'high'
  if (address.validationStatus === 'risky') return 'low'
  return 'unverified'
}

function validityLabel(address: EmailAddress): string {
  if (address.validationStatus === 'valid') return `Valid${address.score === null ? '' : ` · ${address.score}`}`
  if (address.validationStatus === 'invalid') return 'Invalid'
  if (address.validationStatus === 'risky') return `Risky${address.score === null ? '' : ` · ${address.score}`}`
  if (address.validationStatus === 'unknown') return 'Unknown'
  return 'Not checked'
}

function bestOf(addresses: EmailAddress[]): EmailAddress | null {
  if (!addresses.length) return null
  return [...addresses].sort(compareEmailContacts)[0]
}

/**
 * Leads with the addresses captured for them, newest captured first. The tone and the status are
 * derived: a lead with addresses reports how many were found, a lead without a website can never
 * have one, a lead covered by a finished pass reads as no email, and a queued pass reads pending.
 */
export async function fetchEmailRows(
  db: Db,
  options: { limit?: number; offset?: number } = {},
): Promise<{ rows: EmailRow[]; total: number }> {
  const limit = Math.min(500, Math.max(1, options.limit ?? 50))
  const offset = Math.max(0, options.offset ?? 0)

  const { rows: leadRows, total } = await db.leads.list({ limit, offset })
  if (!leadRows.length) return { rows: [], total }

  const leadIds = leadRows.map((lead) => lead.id)
  const [contacts, queued] = await Promise.all([
    db.contacts.list('email', leadIds),
    db.jobs.covered('email', ['queued', 'running']),
  ])

  const pending = new Set(queued)
  const byLead = new Map<string, EmailAddress[]>()
  for (const row of contacts) {
    const address = toAddress(row)
    const list = byLead.get(address.leadId) ?? []
    list.push(address)
    byLead.set(address.leadId, list)
  }

  const rows: EmailRow[] = leadRows.map((lead: StoredLead, position: number) => {
    const addresses = (byLead.get(lead.id) ?? []).sort(compareEmailContacts).slice(0,1)
    const best = bestOf(addresses)
    const domain = domainOf(lead.website)

    let tone: EmailTone
    let statusLabel: string
    if (best) {
      tone = validityTone(best)
      statusLabel = `Found ${addresses.length}`
    } else if (!lead.website) {
      tone = 'no-website'
      statusLabel = 'No website'
    } else if (pending.has(lead.id)) {
      tone = 'pending'
      statusLabel = 'Pending'
    } else {
      tone = 'unverified'
      statusLabel = 'No email'
    }

    const extras = Math.max(0, addresses.length - 1)
    return {
      leadId: lead.id,
      index: String(offset + position + 1).padStart(3, '0'),
      name: lead.name,
      domain: domain || '—',
      primary: best?.value ?? 'No email found',
      hasExtras: extras > 0,
      extrasLabel: `+${extras}`,
      tone,
      label: best ? validityLabel(best) : TONE_LABEL[tone],
      validityStatus: best?.validationStatus ?? null,
      statusLabel,
      found: addresses.map((address) => ({
        value: address.value,
        page: pageLabelOf(address.page),
        publishedOnOwnSite: isOwnSiteSource(address.source, domain),
        score: address.score,
        validationStatus: address.validationStatus,
        validationLabel: validityLabel(address),
        validationMessage: address.validationMessage,
      })),
    }
  })
  return { rows, total }
}

/** The twenty five-point bands behind the confidence mix, drawn against the tallest band. */
function bucketize(bands: Map<number, number>): ConfidenceBucket[] {
  const buckets: ConfidenceBucket[] = []
  for (let from = 0; from < 100; from += 5) {
    const count = bands.get(from) ?? 0
    const shade = !count ? 'empty' : from >= HIGH_FROM ? 'high' : from >= LOW_FROM ? 'domain' : 'low'
    buckets.push({ from, to: from + 5, count, height: '3%', color: BUCKET_COLOR[shade] })
  }
  const largest = Math.max(1, ...buckets.map((bucket) => bucket.count))
  buckets.forEach((bucket) => {
    bucket.height = bucket.count ? `${Math.max(3, Math.round((bucket.count / largest) * 100))}%` : '3%'
  })
  return buckets
}

function share(count: number, total: number): string {
  return String(Math.round((count / Math.max(1, total)) * 100))
}

function bandTotal(bands: Map<number, number>, from: number, to: number): number {
  let total = 0
  bands.forEach((count, band) => {
    if (band >= from && band < to) total += count
  })
  return total
}

/** Workspace totals for the cascade, the confidence mix and the bulk panel. */
export async function fetchEmailCoverage(db: Db, options: { showing?: number } = {}): Promise<EmailCoverage> {
  const { totals, bands } = await db.coverage.email()
  const matched = totals ?? {
    leads: 0,
    with_website: 0,
    leads_with_email: 0,
    emails: 0,
    verified: 0,
    needs_verify: 0,
    risky: 0,
    valid_emails: 0,
    invalid_emails: 0,
    risky_emails: 0,
    unknown_emails: 0,
    unchecked_emails: 0,
  }

  const byBand = new Map<number, number>()
  for (const band of bands) byBand.set(band.band_from, band.count)
  const scored = Array.from(byBand.values()).reduce((sum, count) => sum + count, 0)

  const rings = await countEmailPages(db)

  const cascade: CascadeStep[] = [
    { label: 'Saved leads', note: 'Maps and website imports', count: matched.leads, width: '100%', arrow: true },
    {
      label: 'Website found',
      note: `${share(matched.with_website, matched.leads)}% of scraped`,
      count: matched.with_website,
      width: `${share(matched.with_website, matched.leads)}%`,
      arrow: true,
    },
    {
      label: 'Emails extracted',
      note: `${share(matched.emails, matched.leads)}% of scraped`,
      count: matched.emails,
      width: `${share(matched.emails, matched.leads)}%`,
      arrow: true,
    },
    {
      label: 'Verified',
      note: `${share(matched.verified, matched.leads)}% of scraped`,
      count: matched.verified,
      width: `${share(matched.verified, matched.leads)}%`,
      arrow: false,
    },
  ]

  const chips: ConfidenceChip[] = [
    { label: 'High', count: bandTotal(byBand, HIGH_FROM, 100), color: CHIP_COLOR.high },
    { label: 'Domain', count: bandTotal(byBand, DOMAIN_FROM, HIGH_FROM), color: CHIP_COLOR.domain },
    { label: 'Low', count: bandTotal(byBand, LOW_FROM, DOMAIN_FROM), color: CHIP_COLOR.low },
    { label: 'Not verified', count: Math.max(0, matched.emails - scored), color: CHIP_COLOR.unverified },
  ]

  return {
    badge: `${share(matched.verified, matched.leads)}%`,
    total: matched.leads,
    extracted: matched.emails,
    needsVerify: matched.needs_verify,
    risky: matched.risky,
    validity: {
      valid: matched.valid_emails,
      invalid: matched.invalid_emails,
      risky: matched.risky_emails,
      unknown: matched.unknown_emails,
      unchecked: matched.unchecked_emails,
    },
    noAddress: Math.max(0, matched.leads - matched.leads_with_email),
    perLead: (matched.emails / Math.max(1, matched.leads_with_email)).toFixed(1),
    showing: options.showing ?? 0,
    cascade,
    buckets: bucketize(byBand),
    chips,
    rings,
  }
}

/**
 * Where the addresses came from, as the coverage rings report it.
 *
 * Each ring counts leads, not addresses, because the denominator is the leads a scan has reached:
 * a site that publishes the same address in its header and its footer is one homepage hit, not
 * two. The four names are the design's, and each is a real answer the cascade gives — the site's
 * front page, a contact page followed from it, a team or about page, or the site's structured
 * data. An address that matches none of those is left out rather than guessed at, so the rings
 * never claim more than was found.
 */
async function countEmailPages(db: Db): Promise<CoverageRing[]> {
  const rows = await db.contacts.list('email')
  const seen: Record<string, Set<string>> = {
    Homepage: new Set(),
    'Contact page': new Set(),
    'Team page': new Set(),
    'Structured data': new Set(),
  }
  for (const row of rows) {
    const contact = row as ContactRow
    const label = pageLabelOf(String(contact.source ?? ''))
    if (!(label in seen)) continue
    seen[label].add(String(contact.lead_id))
  }
  return Object.entries(seen).map(([name, leads]) => ({ name, count: leads.size }))
}

export async function fetchEmailPage(db: Db, options: { limit?: number } = {}): Promise<EmailPageData> {
  const first=await fetchEmailRows(db,{limit:options.limit ?? 500})
  const rows=[...first.rows],total=first.total
  while(rows.length<total){const page=await fetchEmailRows(db,{limit:500,offset:rows.length});if(!page.rows.length)break;rows.push(...page.rows)}
  const coverage = await fetchEmailCoverage(db, { showing: rows.length })
  return { rows, total, coverage }
}

/** A cheap shape check, and the reason a bad address never reaches the database. */
function validateAddress(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) throw new Error('An address is required.')
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) throw new Error(`"${trimmed}" does not look like an email address.`)
  return trimmed
}

export async function createEmailAddress(db: Db, input: EmailAddressInput): Promise<{ id: string }> {
  const value = validateAddress(input.value)
  if (input.score !== undefined && input.score !== null && (input.score < 0 || input.score > 100)) {
    throw new Error('A confidence score runs from 0 to 100.')
  }
  return db.contacts.upsert({
    leadId: input.leadId,
    kind: 'email',
    value,
    source: input.source ?? 'manual',
    verified: input.verified ?? false,
    score: input.score ?? null,
  })
}

export async function updateEmailAddress(
  db: Db,
  id: string,
  patch: { value?: string; verified?: boolean; score?: number | null },
): Promise<void> {
  if (patch.value !== undefined) patch = { ...patch, value: validateAddress(patch.value) }
  if (patch.score !== undefined && patch.score !== null && (patch.score < 0 || patch.score > 100)) {
    throw new Error('A confidence score runs from 0 to 100.')
  }
  await db.contacts.update(id, patch)
}

export async function deleteEmailAddress(db: Db, id: string): Promise<void> {
  await db.contacts.remove(id)
}

/**
 * Queues an email pass. The desktop worker does the crawling; this records the work so the
 * queue survives a restart.
 */
export async function startEmailEnrichment(db: Db, leadIds: string[]): Promise<{ jobId: string; queued: number }> {
  return db.jobs.queue('email', leadIds)
}

/** Leads without any address on file, used to size an enrichment pass. */
export async function fetchLeadsMissingEmails(db: Db, limit = 200): Promise<string[]> {
  const { rows } = await fetchEmailRows(db, { limit })
  return rows.filter((row) => !row.statusLabel.startsWith('Found ')).map((row) => row.leadId)
}
