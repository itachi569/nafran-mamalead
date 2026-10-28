// Reads and writes for the pages, kept in one place so the IPC layer stays thin and the
// renderer never sees SQL.
//
// The shapes returned here are the ones the renderer's service layers consume, so the hooks
// above them did not change when the storage moved to this machine.
import { randomUUID } from 'node:crypto'
import { currentPeriod, nowIso, type LocalDatabase } from './local-db'
import { emptyLookupRow, readWebsiteLookup, lookupFields, type WebsiteLookupFields, type WebsiteLookupRow } from '../enrichment/website-lookup'
import { isBusinessOwner, ownerEmail, ownerIdentityKey } from '../enrichment/owner-contact'
import { canonicalSocialProfile, socialPlatformOf, socialProfileIdentity } from '../social-profile'
import {compareEmailContacts} from '../email-ranking'

// ---------------------------------------------------------------- scraper

export interface RunSummaryInput {
  runId?: string
  provider: string
  status: 'done' | 'failed' | 'cancelled'
  keywords: string[]
  location: string
  maxResultsPerKeyword: number
  detail: boolean
  durationMs: number
  startedAt: string
  finishedAt: string
  error: string | null
  leads: LeadInput[]
}

export interface LeadInput {
  name: string
  category?: string
  address?: string
  area?: string
  postcode?: string
  phone?: string
  website?: string
  rating?: number | null
  reviewCount?: number | null
  latitude?: number | null
  longitude?: number | null
  placeRef?: string
  mapsUrl?: string
  query?: string
  keyword?: string
  provider?: string
  score?: number
  capturedAt?: string
}

export interface StoredLead {
  id: string
  run_id: string | null
  name: string
  category: string
  address: string
  area: string
  postcode: string
  phone: string
  website: string
  rating: number | null
  review_count: number | null
  latitude: number | null
  longitude: number | null
  place_ref: string
  maps_url: string
  query: string
  keyword: string
  provider: string
  score: number
  bookmarked: number
  captured_at: string
  /** When a finder last read this lead's own site; null means it has not been read yet. */
  last_scanned_at: string | null
  /** Derived: the lead has at least one email address on file. */
  has_email?: number
  /** Derived: the lead has at least one social profile on file. */
  has_social?: number
}

export interface StoredRun {
  saved?: number
  id: string
  provider: string
  status: string
  keywords: string
  location: string
  max_results: number
  found: number
  error: string | null
  started_at: string
  finished_at: string | null
  duration_ms: number | null
}

/** One row of the phone ledger: a lead and the line, if any, that reaches it. */
export interface PhoneRow {
  id: string
  index: string
  name: string
  phone: string
  areaCode: string
  area: string
  address: string
  hasNumber: boolean
  lineType: 'reception' | 'direct' | 'mobile' | 'missing'
}

export interface PhoneSummary {
  total: number
  reachable: number
  reception: number
  direct: number
  mobile: number
  missing: number
  canBackfill: number
  noWebsite: number
  areas: { code: string; count: number }[]
}

/** A lead created by a website import, with what the enrichment pass has filled in so far. */
export interface ImportedLead {
  enrichment_status: string | null
  last_scanned_at: string | null
  id: string
  name: string
  website: string
  phone: string
  captured_at: string
  has_email: number
  has_social: number
}

export interface DecisionMakerRow {  id: string
  source: string
  lead_id: string
  full_name: string
  title: string
  email: string
  phone: string
  linkedin_url: string
  created_at: string
  lead_name: string
  lead_website: string
  lead_area: string
  lead_address: string
  lead_phone: string
  business_emails: string
  business_phones: string
  published_socials: string
}

/** How many leads got as far as a social page, and how many produced a person. */
export interface DecisionMakerFunnel {
  total: number
  withWebsite: number
  withLinkedin: number
  matched: number
  named: number
  missing: number
}

/** A suggested person, still awaiting confirmation. */
export interface CandidateRow {
  id: string
  lead_id: string
  full_name: string
  title: string
  source: 'email' | 'linkedin' | 'page' | 'schema'
  evidence: string
  email: string
  linkedin_url: string
  status: string
  created_at: string
  lead_name: string
}

/**
 * The person's name inside a LinkedIn profile URL, when there is one.
 *
 * A profile slug is the person's own name followed by whatever they do:
 * `/in/dr-rabia-hayat-dermatologist-in-lahore-158a68221` is Dr Rabia Hayat. Anything that reads
 * as a role, a place or LinkedIn's own id is dropped, and a slug left with no name returns null
 * so the lead is suggested as a page to read rather than as a person.
 */
export function personNameFromLinkedIn(url: string): string | null {
  const slug = url.match(/\/in\/([^/?#]+)/i)?.[1]
  if (!slug) return null

  const parts = slug
    .toLowerCase()
    .split('-')
    .filter(Boolean)
    // LinkedIn appends a hex id; a trailing run of digits and letters is not a name.
    .filter((part) => !/^[0-9a-f]{6,}$/.test(part) && !/^\d+$/.test(part))

  const stop =
    /^(dr|drr|mr|mrs|ms|miss|prof|professor|dermatologist|physiotherapist|physiotherapy|therapist|therapy|dentist|dental|doctor|specialist|consultant|manager|director|owner|founder|clinic|care|health|home|service|services|in|at|and|the|of|for|company|group|centre|center|lahore|karachi|islamabad|manchester|london|uk|pk|scotland|england)$/
  const name = []
  for (const part of parts) {
    // Honorifics are kept, because they are how the person is addressed.
    if (/^(dr|prof|professor)$/.test(part)) {
      name.push(part === 'professor' ? 'Professor' : part === 'prof' ? 'Prof' : 'Dr')
      continue
    }
    if (stop.test(part)) break
    if (!/^[a-z]{2,}$/.test(part)) break
    name.push(part)
    if (name.filter((entry) => !/^(Dr|Prof|Professor)$/.test(entry)).length >= 2) break
  }

  const words = name.filter((entry) => !/^(Dr|Prof|Professor)$/.test(entry))
  if (!words.length || words.length > 2) return null
  const formatted = name.map((part) => (/^(Dr|Prof|Professor)$/.test(part) ? part : part.charAt(0).toUpperCase() + part.slice(1)))
  return formatted.join(' ')
}

/** Mailboxes that belong to a role rather than to a person. */
const ROLE_MAILBOX =
  /^(info|hello|hi|contact|enquiries|enquiry|admin|office|reception|team|support|help|bookings|booking|sales|mail|email|clinic|practice|care|accounts|billing|noreply|no-reply|donotreply|webmaster|postmaster|jobs|careers|press|marketing|hr)$/

/**
 * Words that turn a local part into a desk rather than a person. "reception.arndaledental" is two
 * words, but neither of them is somebody's name.
 */
const WORKPLACE_WORD =
  /^(reception|frontdesk|front|desk|office|admin|support|help|hello|info|contact|enquiries|enquiry|team|booking|bookings|appointments|sales|billing|accounts|clinic|dental|dentist|practice|surgery|health|medical|care|group|partners|associates|management|manchester|london|leeds|birmingham|glasgow|bristol|rehab|therapy|therapies|wellness|aesthetics|beauty|skin|hair|laser|spa|centre|center|studio|consulting|solutions|services|company|ltd|limited|rec|noreply)$/

/**
 * The person's name inside an email address, when there is one.
 *
 * `ruth.ellery@clinic.co.uk` says Ruth Ellery works there; `info@` says nothing, and
 * `reception.arndaledental@` is a desk. Only shapes that clearly name somebody are accepted,
 * because this is a suggestion rather than a fact.
 */
export function personNameFromEmail(address: string, options?: { allowPublicMailbox?: boolean }): string | null {
  const [rawLocal = '', domain = ''] = address.toLowerCase().split('@')
  if (!rawLocal || ROLE_MAILBOX.test(rawLocal)) return null
  // A website pass only trusts the business's own domain: a gmail address on a page does not say
  // the person works there. A search snippet is already somebody else's claim, so the deep pass
  // asks for public mailboxes too and leaves the judgement to the person confirming it.
  const publicMailbox = /(gmail|yahoo|hotmail|outlook|icloud|aol|live|msn)\./.test(domain)
  if (!domain || (publicMailbox && !options?.allowPublicMailbox)) return null

  const parts = rawLocal.split(/[._-]/).filter(Boolean)
  if (!parts.length || parts.length > 2) return null
  const usable = parts.every((part) => /^[a-z]{2,}$/.test(part) && !WORKPLACE_WORD.test(part))
  if (!usable) return null
  return parts.map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ')
}

/**
 * Reduces whatever was pasted to a bare host: a full URL, a bare domain and a line with a path
 * all become the same thing, so a list can be pasted in any shape.
 */
export function normaliseDomain(raw: string): string {
  const trimmed = raw.trim().toLowerCase()
  if (!trimmed || trimmed.startsWith('#')) return ''
  const withoutScheme = trimmed.replace(/^[a-z]+:\/\//, '')
  const host = withoutScheme.split(/[/?#]/)[0].replace(/^www\./, '')
  // A host needs a dot and a plausible ending; anything else is not a website.
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(host)) return ''
  return host
}

/** A UK mobile begins 07, however the number is written. */
function isMobile(value: string): boolean {  const digits = value.replace(/[^\d+]/g, '')
  return /^(\+447|07)/.test(digits)
}

/** One social profile read out of a pasted line. */
export interface SocialUrl {
  platform: string
  handle: string
  profileUrl: string
}

/**
 * The host that belongs to each platform, and the order to test them in.
 *
 * Instagram's short links live on `instagr.am`, so a paste of what the share button copies still
 * lands on the right platform rather than being reported as something this app does not store.
 */
const SOCIAL_PLATFORMS = ['instagram', 'facebook', 'linkedin', 'tiktok', 'youtube', 'x', 'other']

/** The canonical profile URL for a handle, which is what the page links to. */
export function socialProfileUrl(platform: string, handle: string): string {
  switch (platform) {
    case 'instagram':
      return `https://www.instagram.com/${handle}`
    case 'facebook':
      return `https://www.facebook.com/${handle}`
    case 'linkedin':
      return `https://www.linkedin.com/company/${handle}`
    case 'tiktok':
      return `https://www.tiktok.com/@${handle}`
    case 'youtube':
      return `https://www.youtube.com/@${handle}`
    case 'x':
      return `https://x.com/${handle}`
    default:
      return ''
  }
}

/**
 * Reads a pasted line as a social profile.
 *
 * The paste decides the platform from the host whenever it can. When it cannot — a bare `@handle`,
 * or a link this app has no host for — the platform comes from the dropdown that sits beside the
 * paste box, and a line that neither names nor implies a platform is skipped rather than guessed at.
 */
export function parseSocialUrl(raw: string, fallbackPlatform = ''): SocialUrl | null {
  const trimmed=raw.trim()
  if(!trimmed||trimmed.startsWith('#'))return null
  const fallback=SOCIAL_PLATFORMS.includes(fallbackPlatform)?fallbackPlatform:''
  if(!/[/.]/.test(trimmed)||trimmed.startsWith('@')){
    const handle=trimmed.replace(/^@/,'').trim()
    return handle&&fallback&&fallback!=='other'?canonicalSocialProfile(socialProfileUrl(fallback,handle)):null
  }
  const profile=canonicalSocialProfile(trimmed)
  if(profile)return profile
  // An explicitly selected Other profile may use a service we do not recognize. Known
  // platform content endpoints still cannot be disguised as a profile via the dropdown.
  try{const url=new URL(/^[a-z]+:\/\//i.test(trimmed)?trimmed:'https://'+trimmed)
    return fallback==='other'&&!socialPlatformOf(url.href)&&/^https?:$/.test(url.protocol)?{platform:'other',handle:url.host+url.pathname,profileUrl:url.href}:null
  }catch{return null}
}

/** Treat pasted and previously saved forms of the same profile URL as one profile. */
function socialProfileKey(platform: string, profileUrl: string): string {
  const strict=canonicalSocialProfile(profileUrl)
  if(strict)return socialProfileIdentity(strict)
  const parsed = parseSocialUrl(profileUrl, platform)
  const canonical = parsed?.platform === platform ? parsed.profileUrl : profileUrl.trim()
  return `${platform}|${canonical.replace(/\/+$/, '').toLowerCase()}`
}

/** The form a handle and a lead name are compared in: case and punctuation cannot decide a match. */
function matchKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/[^a-z0-9]/g, '')
}

/**
 * Which lead a social handle belongs to.
 *
 * A handle is short and a business name is long — `acmedental` against "Acme Dental Studio" — so an
 * exact comparison is not enough to recognise the same business. A handle that a lead's name or
 * domain begins with is that lead, and the longest such match wins so "acmedentalstudio" is not
 * claimed by a lead called "Acme". The five-character floor is what stops short, common names
 * matching everything: `dental` alone is not evidence of anything.
 *
 * A campaign tag is not part of the name: `haslawuae` matches a lead whose key begins with `haslaw`
 * once the extra three characters are allowed for, which is what the two-character tail in the
 * lookup below is for. That is a guess, so an exact lead always wins over it — the index is checked
 * first, and only if nothing is exact is a near match looked for.
 */
function bestLeadFor(handle: string, leads: { id: string; keys: string[] }[], index?: Map<string, string>): string | null {
  if (!handle) return null
  const exact = index?.get(handle)
  if (exact) return exact

  let best = 0
  let found: string | null = null
  for (const lead of leads) {
    for (const key of lead.keys) {
      const score = key === handle ? Number.MAX_SAFE_INTEGER : key.startsWith(handle) && handle.length >= 5 ? handle.length : 0
      if (score > best) {
        best = score
        found = lead.id
      }
    }
  }
  if (found) return found

  for (let length = handle.length - 1; length >= 5; length -= 1) {
    const near = index?.get(handle.slice(0, length))
    if (near) return near
  }
  return null
}

/** Every lead key, so an exact match is a lookup rather than a walk over four hundred leads. */
function buildLeadIndex(leads: { id: string; keys: string[] }[]): Map<string, string> {
  const index = new Map<string, string>()
  for (const lead of leads) {
    for (const key of lead.keys) if (!index.has(key)) index.set(key, lead.id)
  }
  return index
}

/**
 * A business name out of a social handle, for a URL that matched no lead on file.
 *
 * `acme-dental` and `AcmeDental` both read as "Acme Dental", and a handle that is plainly a person
 * or a tag — `john_doe_92`, `reels` — is left alone rather than dressed up as a company.
 */
export function readableNameFromHandle(handle: string): string {
  const raw = String(handle ?? '').trim()
  if (!raw || /^https?:/i.test(raw) || raw.includes('/')) return ''
  // A dot is not part of a business name, and a handle of punctuation alone names nothing.
  const cleaned = raw
    .replace(/^@+/, '')
    .replace(/[._-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (cleaned.replace(/[^a-z0-9]/gi, '').length < 3) return ''
  return cleaned
    // A run-together handle is the common case: split it on a lower-to-upper boundary first.
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(' ')
    .map((word) => (CONNECTORS.has(word.toLowerCase()) ? word.toLowerCase() : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()))
    .map((word, index) => (index === 0 ? word.charAt(0).toUpperCase() + word.slice(1) : word))
    .join(' ')
    .trim()
}

/** The words that stay lowercase inside a name: "Acme Dental **and** Skin". */
const CONNECTORS = new Set(['and', 'of', 'the', 'for', 'at', 'in', 'on', 'to'])

/** The platform's name, for the rare paste that names no business of its own. */
const PLATFORM_LABELS: Record<string, string> = {
  instagram: 'Instagram',
  facebook: 'Facebook',
  linkedin: 'LinkedIn',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  x: 'X',
  other: 'Social',
}

/** The two letters a platform is shown by in the import preview, as the reference draws them. */
const PLATFORM_TAGS: Record<string, string> = {
  instagram: 'ig',
  facebook: 'f',
  linkedin: 'in',
  tiktok: 'tt',
  youtube: 'yt',
  x: 'x',
  other: '??',
}

/** A JSON column read back as an array, whatever an older row happens to hold. */
function safeJsonArray(value: string | null): string[] {
  if (!value) return []
  try {
    const parsed: unknown = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.filter((entry): entry is string => typeof entry === 'string') : []
  } catch {
    return []
  }
}
/**
 * The dialling code a number belongs to: the UK area code, or a plain marker for a mobile.
 * Numbers from abroad keep their country and city prefix so the page can still group them.
 */
function areaCodeOf(value: string): string {
  const digits = value.replace(/[^\d+]/g, '')
  if (!digits) return ''
  if (/^(\+447|07)/.test(digits)) return '07 mobile'
  if (/^\+44/.test(digits)) {
    const rest = digits.slice(3)
    // UK geographic codes are four digits after the country code for the big cities, five else.
    return rest.startsWith('1') ? `0${rest.slice(0, 3)}` : `0${rest.slice(0, 4)}`
  }
  if (digits.startsWith('0')) return digits.slice(0, 4)
  // Anything else is an international number: keep the country and the first digits of the city.
  return digits.slice(0, 5)
}

/** The figures the dashboard reports, all derived from the tables it summarises. */
export interface DashboardTotals {
  total: number
  withWebsite: number
  withPhone: number
  withEmail: number
  withSocial: number
  withContact: number
  decisionMakers: number
  decisionMakerPeople: number
  enriched: number
  exportReady: number
  noEmail: number
  noPhone: number
  quality: number
  qualityLabel: string
  platforms: { platform: string; leads: number }[]
  categories: { category: string; count: number }[]
}

/** Contact completeness, mirroring the worker's scoring so stored and shown scores agree. */
export function scoreLead(lead: LeadInput): number {
  let score = 40
  if (lead.website) score += 20
  if (lead.phone) score += 20
  if (lead.rating !== null && lead.rating !== undefined) score += 10
  if ((lead.reviewCount ?? 0) > 50) score += 10
  return score
}

export class Repository {
  constructor(private readonly db: LocalDatabase) {}

  // ---------------------------------------------------------------- plan

  /** The workspace's plan usage for the current period. */
  usage(workspaceId: string): { scrapes_used: number; scrape_limit: number; lookups_used: number; lookup_limit: number; period: string } {
    return this.db.usage(workspaceId)
  }

  /** The plan itself, which the billing pages and the invoice statement read. */
  subscription(workspaceId: string): { plan: string; status: string; seats: number; renews_on: string | null } | null {
    return this.db.subscription(workspaceId)
  }

  // ---------------------------------------------------------------- runs

  /**
   * Stores a finished run and its leads. Returns how many leads were newly inserted: a business
   * already on file is skipped rather than duplicated, keyed on Google's place reference.
   */
  saveRun(workspaceId: string, summary: RunSummaryInput): { runId: string; saved: number } {
    return this.db.transaction(() => {
      const runId = summary.runId ?? randomUUID()
      this.db.run(
        `insert into scrape_runs
           (id, workspace_id, provider, status, keywords, location, max_results, detail, found, error, started_at, finished_at, duration_ms)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          runId,
          workspaceId,
          summary.provider,
          summary.status,
          JSON.stringify(summary.keywords),
          summary.location,
          summary.maxResultsPerKeyword,
          summary.detail ? 1 : 0,
          summary.leads.length,
          summary.error,
          summary.startedAt,
          summary.finishedAt,
          summary.durationMs,
        ],
      )

      let saved = 0
      const insert = this.db.prepare(
        `insert into leads
           (id, workspace_id, run_id, name, category, address, area, postcode, phone, website,
            rating, review_count, latitude, longitude, place_ref, maps_url, query, keyword,
            provider, score, captured_at)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         on conflict do nothing`,
      )
      const known = this.db.prepare(
        `select id, phone, website from leads where workspace_id = ? and place_ref <> '' and place_ref = ?`,
      )
      const linkRun = this.db.prepare('insert or ignore into scrape_run_leads (run_id, lead_id) values (?, ?)')

      for (const lead of summary.leads) {
        if (!lead.name) continue
        const capturedAt = lead.capturedAt ?? nowIso()
        const score = lead.score ?? scoreLead(lead)
        const leadId = randomUUID()
        const changes = insert.run(
          leadId,
          workspaceId,
          runId,
          lead.name,
          lead.category ?? '',
          lead.address ?? '',
          lead.area ?? '',
          lead.postcode ?? '',
          lead.phone ?? '',
          lead.website ?? '',
          lead.rating ?? null,
          lead.reviewCount ?? null,
          lead.latitude ?? null,
          lead.longitude ?? null,
          lead.placeRef ?? '',
          lead.mapsUrl ?? '',
          lead.query ?? '',
          lead.keyword ?? '',
          lead.provider ?? summary.provider,
          score,
          capturedAt,
        )
        if (changes > 0) {
          linkRun.run(runId, leadId)
          saved += 1
          continue
        }
        // Already on file. Fill in contact details a previous run did not capture, which is how
        // a re-run improves an existing row instead of ignoring it.
        const existing = known.get<{ id: string; phone: string; website: string }>(workspaceId, lead.placeRef ?? '')
        if (!existing) continue
        linkRun.run(runId, existing.id)
        if (!existing.phone && lead.phone) {
          this.db.run('update leads set phone = ? where id = ?', [lead.phone, existing.id])
        }
        if (!existing.website && lead.website) {
          this.db.run('update leads set website = ? where id = ?', [lead.website, existing.id])
        }
      }

      // Every call here reports a finished run, so it counts against the plan.
      this.db.run(
        `insert into usage_counters (workspace_id, period, scrapes_used) values (?, ?, 1)
         on conflict (workspace_id, period) do update set scrapes_used = scrapes_used + 1`,
        [workspaceId, currentPeriod()],
      )

      return { runId, saved }
    })
  }

  listRuns(workspaceId: string, limit = 50): StoredRun[] {
    return this.db.query<StoredRun>(
      `select sr.id, sr.provider, sr.status, sr.keywords, sr.location, sr.max_results, sr.found, sr.error, sr.started_at, sr.finished_at, sr.duration_ms,
              (select count(*) from scrape_run_leads rl where rl.run_id = sr.id) as saved
       from scrape_runs sr where sr.workspace_id = ? order by sr.started_at desc limit ?`,
      [workspaceId, limit],
    )
  }

  runCounts(workspaceId: string): { runs: number; clean: number; places: number; medianMs: number } {
    const totals = this.db.one<{ runs: number; clean: number; places: number }>(
      `select count(*) as runs,
              count(case when status = 'done' then 1 end) as clean,
              coalesce(sum(found), 0) as places
       from scrape_runs where workspace_id = ?`,
      [workspaceId],
    ) ?? { runs: 0, clean: 0, places: 0 }
    const durations = this.db
      .query<{ duration_ms: number }>(
        `select duration_ms from scrape_runs where workspace_id = ? and duration_ms is not null order by duration_ms`,
        [workspaceId],
      )
      .map((row) => row.duration_ms)
    const middle = Math.floor(durations.length / 2)
    const medianMs = durations.length
      ? durations.length % 2
        ? durations[middle]
        : Math.round((durations[middle - 1] + durations[middle]) / 2)
      : 0
    return { ...totals, medianMs }
  }

  // ---------------------------------------------------------------- leads

  /**
   * The lead ledger. `has_email` and `has_social` are derived here with sub-selects so one query
   * answers everything the page's rows, filter chips and summary card need.
   */
  listLeads(workspaceId: string, options: { limit?: number; offset?: number; filter?: 'all' | 'phone' | 'email' | 'social' | 'missing'; search?: string; runId?: string } = {}): { rows: StoredLead[]; total: number } {
    const limit = Math.min(1000, Math.max(1, options.limit ?? 200))
    const offset = Math.max(0, options.offset ?? 0)
    const where = ['l.workspace_id = ?']
    const params: unknown[] = [workspaceId]
    if (options.runId) {
      where.push('exists (select 1 from scrape_run_leads rl where rl.lead_id = l.id and rl.run_id = ?)')
      params.push(options.runId)
    }
    const search = options.search?.trim().toLowerCase()
    if (search) {
      where.push("(instr(lower(l.name), ?) > 0 or instr(lower(l.website), ?) > 0 or instr(lower(l.address), ?) > 0 or instr(lower(l.area), ?) > 0 or instr(lower(l.phone), ?) > 0)")
      params.push(search, search, search, search, search)
    }
    const hasEmail = "exists (select 1 from lead_contacts c where c.lead_id = l.id and c.kind = 'email')"
    const hasSocial = 'exists (select 1 from social_profiles s where s.lead_id = l.id)'
    if (options.filter === 'phone') where.push("l.phone <> ''")
    if (options.filter === 'email') where.push(hasEmail)
    if (options.filter === 'social') where.push(hasSocial)
    if (options.filter === 'missing') where.push(`l.phone = '' and not ${hasEmail} and not ${hasSocial}`)
    const predicate = where.join(' and ')
    const rows = this.db.query<StoredLead>(
      `select l.*,
              case when ${hasEmail} then 1 else 0 end as has_email,
              case when ${hasSocial} then 1 else 0 end as has_social
       from leads l
       where ${predicate}
       order by l.captured_at desc, l.id desc
       limit ? offset ?`,
      [...params, limit, offset],
    )
    const total = this.db.one<{ n: number }>(`select count(*) as n from leads l where ${predicate}`, params)?.n ?? 0
    return { rows, total }
  }

  leadSummary(workspaceId: string): {
    total: number
    withPhone: number
    withWebsite: number
    withEmail: number
    withSocial: number
    noContact: number
    byProvider: { provider: string; count: number }[]
  } {
    const total = this.db.one<{ n: number }>('select count(*) as n from leads where workspace_id = ?', [workspaceId])?.n ?? 0
    const counts = (sql: string) => this.db.one<{ n: number }>(sql, [workspaceId])?.n ?? 0
    return {
      total,
      withPhone: counts("select count(*) as n from leads where workspace_id = ? and phone <> ''"),
      withWebsite: counts("select count(*) as n from leads where workspace_id = ? and website <> ''"),
      withEmail: counts(
        "select count(distinct lead_id) as n from lead_contacts where workspace_id = ? and kind = 'email'",
      ),
      withSocial: counts('select count(distinct lead_id) as n from social_profiles where workspace_id = ?'),
      noContact: counts(`select count(*) as n from leads l where l.workspace_id = ? and l.phone = ''
        and not exists (select 1 from lead_contacts c where c.lead_id = l.id and c.kind = 'email')
        and not exists (select 1 from social_profiles s where s.lead_id = l.id)`),
      byProvider: this.db.query<{ provider: string; count: number }>(
        'select provider, count(*) as count from leads where workspace_id = ? group by provider order by count desc',
        [workspaceId],
      ),
    }
  }

  getLead(workspaceId: string, id: string): StoredLead | null {
    return this.db.one<StoredLead>('select * from leads where workspace_id = ? and id = ?', [workspaceId, id])
  }

  /**
   * Records that a lead's own site has now been read.
   *
   * The Email, Phone and Decision Makers pages report what a scan has covered, and "has this been
   * read" outlives the pass that read it — a scan finished yesterday still counts — so it is kept
   * on the lead rather than in the page's memory.
   */
  fillLeadAddress(leadId: string, addresses: string[]): void {
    const address=Array.from(new Set(addresses)).join(' | ')
    if(address) this.db.run("update leads set address = ? where id = ? and (address is null or trim(address) = '')", [address, leadId])
  }

  fillPublishedBusiness(leadId: string, name: string, phone: string): void {
    const lead=this.db.one<{name:string;website:string}>('select name,website from leads where id = ?',[leadId])
    if (name && lead && (!lead.name.trim() || lead.name.toLowerCase()===normaliseDomain(lead.website))) this.db.run('update leads set name = ? where id = ?',[name,leadId])
    if (phone) this.db.run("update leads set phone = ? where id = ? and trim(phone) = ''",[phone,leadId])
  }

  markLeadScanned(leadId: string): void {
    this.db.run('update leads set last_scanned_at = ? where id = ?', [nowIso(), leadId])
  }

  /**
   * Everything the dashboard states in one round trip: the four headline figures, the coverage
   * rings, the platform mix, the top categories and the counts behind "needs attention".
   *
   * All of it is derived here rather than in the page, so the dashboard cannot disagree with the
   * tables it summarises.
   */
  dashboard(workspaceId: string, days: 7 | 30 | null = null): DashboardTotals {
    const cutoff = days === null ? null : new Date(Date.now() - days * 86_400_000).toISOString()
    const scope = `l.workspace_id = ?${cutoff ? ' and l.captured_at >= ?' : ''}`
    const args = cutoff ? [workspaceId, cutoff] : [workspaceId]
    const count = (sql: string) => this.db.one<{ n: number }>(sql, args)?.n ?? 0
    const total = count(`select count(*) as n from leads l where ${scope}`)

    const withWebsite = count(`select count(*) as n from leads l where ${scope} and l.website <> ''`)
    const withPhone = count(`select count(*) as n from leads l where ${scope} and
      (l.phone <> '' or exists (select 1 from lead_contacts c where c.lead_id=l.id and c.kind='phone'))`)
    const withEmail = count(`select count(*) as n from leads l where ${scope}
      and exists (select 1 from lead_contacts c where c.lead_id = l.id and c.kind = 'email')`)
    const withSocial = count(`select count(*) as n from leads l where ${scope}
      and exists (select 1 from social_profiles s where s.lead_id = l.id)`)
    const withContact = count(`select count(*) as n from leads l where ${scope}
      and (l.phone <> '' or exists (select 1 from lead_contacts c where c.lead_id = l.id)
        or exists (select 1 from social_profiles s where s.lead_id = l.id))`)
    const decisionMakers = count(`select count(*) as n from leads l where ${scope}
      and exists (select 1 from decision_makers d where d.lead_id = l.id)`)
    const decisionMakerPeople = count(`select count(*) as n from decision_makers d
      join leads l on l.id = d.lead_id where ${scope} and trim(d.full_name) <> ''`)

    // "Enriched" is a lead with more than the Maps listing: a website plus something found on it.
    const enriched = count(
      `select count(*) as n from leads l where ${scope} and l.website <> ''
         and (exists (select 1 from lead_contacts c where c.lead_id = l.id)
           or exists (select 1 from social_profiles s where s.lead_id = l.id))`,
    )
    const exportReady = count(
      `select count(*) as n from leads l where ${scope}
         and l.name <> ''
         and (l.phone <> '' or exists (select 1 from lead_contacts c where c.lead_id = l.id))`,
    )

    // Data quality is the share of the fields the app can actually fill.
    const filled = this.db.one<{ filled: number }>(
      `select coalesce(sum(
          (case when l.name <> '' then 1 else 0 end) +
          (case when l.website <> '' then 1 else 0 end) +
          (case when l.phone <> '' then 1 else 0 end) +
          (case when l.address <> '' then 1 else 0 end) +
          (case when l.category <> '' then 1 else 0 end) +
          (case when l.rating is not null then 1 else 0 end) +
          (case when exists (select 1 from lead_contacts c where c.lead_id = l.id and c.kind = 'email') then 1 else 0 end) +
          (case when exists (select 1 from social_profiles s where s.lead_id = l.id) then 1 else 0 end)
        ), 0) as filled
       from leads l where ${scope}`,
      args,
    )?.filled ?? 0

    const platforms = this.db.query<{ platform: string; leads: number }>(
      `select s.platform, count(distinct s.lead_id) as leads
       from social_profiles s join leads l on l.id = s.lead_id
       where ${scope} group by s.platform order by leads desc`,
      args,
    )
    const categories = this.db.query<{ category: string; count: number }>(
      `select l.category, count(*) as count from leads l
       where ${scope} and l.category <> '' group by l.category order by count desc limit 6`,
      args,
    )

    return {
      total,
      withWebsite,
      withPhone,
      withEmail,
      withSocial,
      withContact,
      decisionMakers,
      decisionMakerPeople,
      enriched,
      exportReady,
      noEmail: Math.max(0, withWebsite - withEmail),
      noPhone: Math.max(0, total - withPhone),
      // Eight fields per lead, so the score is a percentage of everything that could be filled.
      quality: total ? Math.round((filled / (total * 8)) * 100) : 0,
      qualityLabel: total === 0 ? 'No data' : filled / (total * 8) >= 0.75 ? 'Good' : filled / (total * 8) >= 0.5 ? 'Fair' : 'Thin',
      platforms,
      categories,
    }
  }

  setBookmarked(workspaceId: string, id: string, bookmarked: boolean): void {
    this.db.run('update leads set bookmarked = ? where workspace_id = ? and id = ?', [bookmarked ? 1 : 0, workspaceId, id])
  }

  leadsNeedingContact(workspaceId: string, kind: 'email' | 'phone' | 'social', limit = 200): StoredLead[] {    const clause =
      kind === 'social'
        ? 'not exists (select 1 from social_profiles s where s.lead_id = l.id)'
        : `not exists (select 1 from lead_contacts c where c.lead_id = l.id and c.kind = '${kind}')`
    return this.db.query<StoredLead>(
      `select l.* from leads l
       where l.workspace_id = ?
         and l.website <> ''
         and ${clause}
       order by l.score desc
       limit ?`,
      [workspaceId, limit],
    )
  }

  // ---------------------------------------------------------------- phone finder

  /**
   * Every lead's phone, with the kind of line and the area code worked out.
   *
   * The number a Maps listing publishes is the main switchboard, so it reads as a reception
   * line; a second number found on the lead's own website is a direct line. A lead with no
   * number at all still gets a row, because the page's job is to show the gaps too.
   */
  phoneLedger(workspaceId: string, limit = 200, offset = 0): PhoneRow[] {
    const leads = this.db.query<{
      id: string
      name: string
      phone: string
      area: string
      address: string
      website: string
      captured_at: string
      last_scanned_at: string | null
    }>(
      `select id, name, phone, area, address, website, captured_at, last_scanned_at
       from leads where workspace_id = ? order by captured_at desc, id limit ? offset ?`,
      [workspaceId, Math.min(500, Math.max(1, limit)),Math.max(0,offset)],
    )
    if (!leads.length) return []

    const extras = this.db.query<{ lead_id: string; value: string; source: string; score: number | null }>(
      `select lead_id, value, source, score from lead_contacts
       where workspace_id = ? and kind = 'phone' and lead_id in (${leads.map(()=>'?').join(',')}) order by coalesce(score,0) desc, created_at`,
      [workspaceId,...leads.map(lead=>lead.id)],
    )
    const byLead = new Map<string, { value: string; source: string; score: number | null }[]>()
    for (const row of extras) {
      const list = byLead.get(row.lead_id) ?? []
      list.push({ value: row.value, source: row.source, score: row.score })
      byLead.set(row.lead_id, list)
    }

    return leads.map((lead, index) => {
      const onFile = byLead.get(lead.id) ?? []
      const best=onFile.find(entry=>(entry.score??0)>=50)
      const numbers = [best?.value,lead.phone, ...onFile.map((entry) => entry.value)].filter((value):value is string=>Boolean(value))
      const shown = numbers[0] ?? ''
      const found=onFile.map(entry=>({value:entry.value,page:entry.source}))
      if(lead.phone && !found.some(entry=>entry.value.replace(/\D/g,'')===lead.phone.replace(/\D/g,'')))found.push({value:lead.phone,page:'Saved Maps number'})
      return {
        id: lead.id,
        index: String(offset + index + 1).padStart(3, '0'),
        name: lead.name,
        phone: shown,
        mainSource: best?.source ?? '',
        areaCode: areaCodeOf(shown),
        area: lead.area,
        address: lead.address,
        website: lead.website,
        // A number the listing gave is the switchboard; one read from the site is a direct line.
        lineType: !shown ? 'missing' : isMobile(shown) ? 'mobile' : lead.phone ? 'reception' : 'direct',
        hasNumber: Boolean(shown),
        lastScannedAt: lead.last_scanned_at,
        found,
      }
    })
  }

  /** Totals for the phone page: how many lines there are, of what kind, and where they dial to. */
  phoneSummary(workspaceId: string): PhoneSummary {
    // A compact projection covers the full workspace; the visible phone book stays paged.
    const rows = this.db.query<{ phone: string; website: string; found_phone: string | null; found_score: number | null }>(
      `select l.phone, l.website,
              (select c.value from lead_contacts c where c.lead_id = l.id and c.kind = 'phone'
               order by coalesce(c.score,0) desc, c.created_at, c.id limit 1) as found_phone,
              (select max(c.score) from lead_contacts c where c.lead_id=l.id and c.kind='phone') as found_score
       from leads l where l.workspace_id = ?`,
      [workspaceId],
    )
    const byArea = new Map<string, number>()
    let reception = 0
    let direct = 0
    let mobile = 0
    let missing = 0
    let canBackfill = 0
    for (const row of rows) {
      const number = (row.found_score??0)>=50 ? row.found_phone || row.phone : row.phone || row.found_phone || ''
      if (!number) {
        missing += 1
        if (row.website) canBackfill += 1
        continue
      }
      if (isMobile(number)) mobile += 1
      else if (row.phone) reception += 1
      else direct += 1
      const areaCode = areaCodeOf(number)
      if (areaCode) byArea.set(areaCode, (byArea.get(areaCode) ?? 0) + 1)
    }
    return {
      total: rows.length,
      reachable: rows.length - missing,
      reception,
      direct,
      mobile,
      missing,
      canBackfill,
      noWebsite: missing - canBackfill,
      areas: Array.from(byArea, ([code, count]) => ({ code, count })).sort((a, b) => b.count - a.count),
    }
  }

  // ---------------------------------------------------------------- decision makers

  /**
   * Named contacts, each with the lead it belongs to. A lead can carry several, so the lead is
   * joined in rather than looked up per row.
   */
  decisionMakerLedger(workspaceId: string): DecisionMakerRow[] {
    return this.db.query<DecisionMakerRow>(
        `select d.id, d.lead_id, d.full_name, d.title, d.email, d.phone, d.linkedin_url, d.source, d.created_at,
              l.name as lead_name, l.website as lead_website, l.area as lead_area, l.last_scanned_at,
              l.address as lead_address, l.phone as lead_phone,
              coalesce((select group_concat(c.value, char(10)) from lead_contacts c where c.lead_id=l.id and c.kind='email'), '') as business_emails,
              coalesce((select group_concat(c.value, char(10)) from lead_contacts c where c.lead_id=l.id and c.kind='phone'), '') as business_phones,
              coalesce((select group_concat(s.profile_url, char(10)) from social_profiles s where s.lead_id=l.id), '') as published_socials
       from decision_makers d
       join leads l on l.id = d.lead_id
       where d.workspace_id = ?
       order by d.created_at desc`,
      [workspaceId],
    ).filter(person=>isBusinessOwner(person.title)).map(person=>({...person,email:ownerEmail(person.full_name,person.email)}))
  }

  /**
   * The funnel behind the decision-maker page: how many leads have a website at all, how many
   * of those publish a LinkedIn company page, and how many ended with a named person.
   */
  decisionMakerFunnel(workspaceId: string): DecisionMakerFunnel {
    const total = this.db.one<{ n: number }>('select count(*) as n from leads where workspace_id = ?', [workspaceId])?.n ?? 0
    const withWebsite =
      this.db.one<{ n: number }>("select count(*) as n from leads where workspace_id = ? and website <> ''", [workspaceId])?.n ?? 0
    const withLinkedin =
      this.db.one<{ n: number }>(
        `select count(distinct lead_id) as n from social_profiles
         where workspace_id = ? and platform = 'linkedin'`,
        [workspaceId],
      )?.n ?? 0
    const matched =
      this.db.one<{ n: number }>('select count(distinct lead_id) as n from decision_makers where workspace_id = ?', [workspaceId])?.n ?? 0
    const named =
      this.db.one<{ n: number }>('select count(*) as n from decision_makers where workspace_id = ?', [workspaceId])?.n ?? 0

    return { total, withWebsite, withLinkedin, matched, named, missing: Math.max(0, total - matched) }
  }

  listContacts(workspaceId: string, kind: 'email' | 'phone' | 'social', leadIds?: string[]): Record<string, unknown>[] {
    if (leadIds && !leadIds.length) return []
    const filter = leadIds ? `and lead_id in (${leadIds.map(() => '?').join(',')})` : ''
    return this.db.query(
      `select * from lead_contacts where workspace_id = ? and kind = '${kind}' ${filter} order by created_at desc`,
      leadIds ? [workspaceId, ...leadIds] : [workspaceId],
    )
  }

  /**
   * Stores an address, phone number or social handle. Re-adding the same value for the same lead
   * updates what is on file instead of creating a second row.
   */
  upsertContact(input: {
    leadId: string
    kind: 'email' | 'phone' | 'social'
    value: string
    source?: string
    verified?: boolean
    score?: number | null
  }): { id: string } {
    if(input.kind==='email')return this.db.transaction(()=>{
      const incoming={value:input.value.trim().toLowerCase(),source:input.source??'manual',score:input.score??null}
      if(!incoming.value)throw new Error('A contact value is required.')
      const old=this.db.query<{id:string;value:string;source:string;score:number|null}>("select id,value,source,score from lead_contacts where lead_id=? and kind='email'",[input.leadId]).filter(row=>row.value.toLowerCase()!==incoming.value).sort(compareEmailContacts)
      const winner=old[0]&&compareEmailContacts(old[0],incoming)<0?{id:old[0].id}:this.writeContact({...input,value:incoming.value})
      this.retainMainEmail(input.leadId,winner.id)
      return winner
    })
    return this.writeContact(input)
  }

  private writeContact(input:{leadId:string;kind:'email'|'phone'|'social';value:string;source?:string;verified?:boolean;score?:number|null}):{id:string}{
    const value = input.value.trim()
    if (!value) throw new Error('A contact value is required.')
    const score=input.score==null||!Number.isFinite(input.score)?null:Math.max(0,Math.min(100,Math.round(input.score)))

    const existing = this.db.one<{ id: string;validation_status:string|null;verified:number;score:number|null }>(
      'select id,validation_status,verified,score from lead_contacts where lead_id = ? and kind = ? and value = ?',
      [input.leadId, input.kind, value],
    )
    const at = nowIso()
    if (existing) {
      this.db.run('update lead_contacts set source = ?, verified = ?, score = ?, checked_at = ? where id = ?', [
        input.source ?? 'manual',
        input.kind==='email'&&existing.validation_status?existing.verified:input.verified ? 1 : 0,
        input.kind==='email'&&existing.validation_status?existing.score:score,
        at,
        existing.id,
      ])
      return { id: existing.id }
    }

    const id = randomUUID()
    const lead = this.db.one<{ workspace_id: string }>('select workspace_id from leads where id = ?', [input.leadId])
    this.db.run(
      `insert into lead_contacts (id, lead_id, workspace_id, kind, value, source, verified, score, checked_at, created_at)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, input.leadId, lead?.workspace_id ?? '', input.kind, value, input.source ?? 'manual', input.verified ? 1 : 0, score, at, at],
    )
    return { id }
  }

  /** Keep one active business mailbox. Replaced/legacy alternatives remain recoverable locally. */
  private retainMainEmail(leadId:string,preferredId?:string|null):{removed:number;id:string|null}{
    const rows=this.db.query<Record<string,unknown>&{id:string;workspace_id:string;lead_id:string;value:string;source:string;score:number|null}>("select * from lead_contacts where lead_id=? and kind='email'",[leadId]).sort(compareEmailContacts)
    const winner=preferredId===null?undefined:rows.find(row=>row.id===preferredId)??rows[0]
    let removed=0
    for(const row of rows)if(row.id!==winner?.id){
      this.db.run('insert into email_contact_archive (id,workspace_id,lead_id,contact_id,original_json,archived_at) values (?,?,?,?,?,?)',[randomUUID(),row.workspace_id,row.lead_id,row.id,JSON.stringify(row),nowIso()])
      this.db.run('delete from lead_contacts where id=?',[row.id]);removed++
    }
    return {removed,id:winner?.id??null}
  }

  /** A successful new website scan replaces the previous main mailbox, without inventing one. */
  replaceMainEmail(leadId:string,email?:{value:string;page:string;score:number}):void {
    this.db.transaction(()=>{
      const saved=email?this.writeContact({leadId,kind:'email',value:email.value.trim().toLowerCase(),source:email.page,score:email.score,verified:false}):null
      this.retainMainEmail(leadId,saved?.id??null)
    })
  }

  collapseBusinessEmails():{removed:number}{
    return this.db.transaction(()=>{
      let removed=0
      for(const row of this.db.query<{lead_id:string}>("select lead_id from lead_contacts where kind='email' group by lead_id having count(*)>1"))removed+=this.retainMainEmail(row.lead_id).removed
      return {removed}
    })
  }

  replaceScannedPhones(leadId: string, phones: {value:string;page:string}[], pages: string[]): void {
    if(!pages.length)return
    const pageKey=(value:string)=>{try{const url=new URL(value);return url.hostname.replace(/^www\./i,'')+url.pathname.replace(/\/$/,'')}catch{return value}}
    const covered=new Set(pages.map(pageKey)),current=new Set(phones.map(item=>item.value.replace(/\D/g,'')))
    const old=this.db.query<{id:string;value:string;source:string}>("select id,value,source from lead_contacts where lead_id = ? and kind = 'phone'",[leadId])
    for(const phone of old)if((phone.source==='website'||covered.has(pageKey(phone.source)))&&!current.has(phone.value.replace(/\D/g,'')))this.db.run('delete from lead_contacts where id = ?',[phone.id])
  }

  updateContact(id: string, patch: { value?: string; verified?: boolean; score?: number | null }): void {
    const fields: string[] = ['checked_at = ?']
    const params: unknown[] = [nowIso()]
    if (patch.value !== undefined) {
      fields.push('value = ?')
      params.push(patch.value)
    }
    if (patch.verified !== undefined) {
      fields.push('verified = ?')
      params.push(patch.verified ? 1 : 0)
    }
    if (patch.score !== undefined) {
      fields.push('score = ?')
      params.push(patch.score==null||!Number.isFinite(patch.score)?null:Math.max(0,Math.min(100,Math.round(patch.score))))
    }
    params.push(id)
    this.db.run(`update lead_contacts set ${fields.join(', ')} where id = ?`, params)
  }

  /** Stores the provider's answer separately from the page where the address was discovered. */
  updateEmailValidation(
    id: string,
    result: {
      status: 'valid' | 'invalid' | 'risky' | 'unknown'
      verified: boolean
      score: number | null
      message: string
      provider: 'apify' | 'leadsangel' | 'mailverifier'
    },
  ): void {
    const at = nowIso()
    const score=result.score==null||!Number.isFinite(result.score)?null:Math.max(0,Math.min(100,Math.round(result.score)))
    this.db.run(
      `update lead_contacts
       set verified = ?, score = ?, checked_at = ?, validation_status = ?, validation_provider = ?,
           validation_message = ?, validated_at = ?
       where id = ? and kind = 'email'`,
      [result.verified ? 1 : 0, score, at, result.status, result.provider, result.message.slice(0, 500), at, id],
    )
  }

  deleteContact(id: string): void {
    this.db.run('delete from lead_contacts where id = ?', [id])
  }

  /**
   * Removes stored email addresses a page's footer or a form widget produced rather than the
   * business. The worker refuses them now, and this clears any that were stored before it did.
   */
  pruneNoisyContacts(isUsable: (value: string) => boolean): { removed: number } {
    const rows = this.db.query<{ id: string; value: string }>("select id, value from lead_contacts where kind = 'email'")
    let removed = 0
    for (const row of rows) {
      if (isUsable(row.value)) continue
      this.db.run('delete from lead_contacts where id = ?', [row.id])
      removed += 1
    }
    return { removed }
  }

  // ---------------------------------------------------------------- social profiles

  listSocialProfiles(workspaceId: string, leadIds?: string[]): Record<string, unknown>[] {
    if (leadIds && !leadIds.length) return []
    const filter = leadIds ? `and lead_id in (${leadIds.map(() => '?').join(',')})` : ''
    return this.db.query(
      `select * from social_profiles where workspace_id = ? ${filter} order by discovered_at desc`,
      leadIds ? [workspaceId, ...leadIds] : [workspaceId],
    )
  }

  /** Profile export rows with their business details, limited to the leads on the current page. */
  profileExportRows(workspaceId: string, leadIds: string[]): Record<string, unknown>[] {
    if (!leadIds.length) return []
    const placeholders = leadIds.map(() => '?').join(',')
    return this.db.query(
      `select s.*, l.name, l.website
       from social_profiles s
       join leads l on l.id = s.lead_id and l.workspace_id = s.workspace_id
       where s.workspace_id = ? and s.lead_id in (${placeholders})
       order by l.name collate nocase, s.platform, s.profile_url`,
      [workspaceId, ...leadIds],
    )
  }

  upsertSocialProfile(input: {
    workspaceId: string
    leadId: string
    platform: string
    handle?: string
    profileUrl?: string
    followers?: number | null
    verified?: boolean
    source?: string
  }): { id: string } {
    const canonical=canonicalSocialProfile(input.profileUrl || socialProfileUrl(input.platform,input.handle || ''))
    if(input.platform!=='other'&&(!canonical||canonical.platform!==input.platform))throw new Error('Use a direct social account or channel URL, not a post, video, share or login link.')
    if(canonical)input={...input,profileUrl:canonical.profileUrl,handle:canonical.handle}
    const at = nowIso()
    const existing = this.db.query<{id:string;profile_url:string}>(
      'select id,profile_url from social_profiles where lead_id = ? and platform = ?',
      [input.leadId,input.platform],
    ).find(row=>socialProfileKey(input.platform,row.profile_url)===socialProfileKey(input.platform,input.profileUrl??''))
    if (existing) {
      this.db.run(
        'update social_profiles set handle = ?, followers = ?, verified = ?, checked_at = ?, updated_at = ? where id = ?',
        [input.handle ?? '', input.followers ?? null, input.verified ? 1 : 0, at, at, existing.id],
      )
      return { id: existing.id }
    }
    const id = randomUUID()
    this.db.run(
      `insert into social_profiles
         (id, workspace_id, lead_id, platform, handle, profile_url, followers, verified, source, discovered_at, checked_at, updated_at)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        input.workspaceId,
        input.leadId,
        input.platform,
        input.handle ?? '',
        input.profileUrl ?? '',
        input.followers ?? null,
        input.verified ? 1 : 0,
        input.source ?? 'website',
        at,
        at,
        at,
      ],
    )
    return { id }
  }

  updateSocialProfile(
    id: string,
    patch: { handle?: string; profileUrl?: string; followers?: number | null; verified?: boolean },
  ): void {
    if(patch.profileUrl!==undefined){
      const row=this.db.one<{platform:string}>('select platform from social_profiles where id=?',[id])
      const canonical=canonicalSocialProfile(patch.profileUrl)
      if(row&&row.platform!=='other'&&(!canonical||canonical.platform!==row.platform))throw new Error('Use a direct social account or channel URL.')
      if(canonical)patch={...patch,profileUrl:canonical.profileUrl,handle:canonical.handle}
    }
    const fields: string[] = ['checked_at = ?', 'updated_at = ?']
    const params: unknown[] = [nowIso(), nowIso()]
    if (patch.handle !== undefined) {
      fields.push('handle = ?')
      params.push(patch.handle)
    }
    if (patch.profileUrl !== undefined) {
      fields.push('profile_url = ?')
      params.push(patch.profileUrl)
    }
    if (patch.followers !== undefined) {
      fields.push('followers = ?')
      params.push(patch.followers)
    }
    if (patch.verified !== undefined) {
      fields.push('verified = ?')
      params.push(patch.verified ? 1 : 0)
    }
    params.push(id)
    this.db.run(`update social_profiles set ${fields.join(', ')} where id = ?`, params)
  }

  deleteSocialProfile(id: string): void {
    this.db.run('delete from social_profiles where id = ?', [id])
  }

  /** Repair old platform-page crawls; every changed row is archived before mutation. */
  repairSocialProfiles(): {removed:number;normalized:number;added:number} {
    return this.db.transaction(()=>{
      const rows=this.db.query<Record<string,unknown>&{id:string;lead_id:string;workspace_id:string;platform:string;profile_url:string;source:string;website:string}>('select s.*,l.website from social_profiles s join leads l on l.id=s.lead_id order by s.discovered_at,s.id')
      const groups=new Map<string,{row:typeof rows[number];url:NonNullable<ReturnType<typeof canonicalSocialProfile>>}[]>()
      const report={removed:0,normalized:0,added:0}
      const archive=(row:typeof rows[number],reason:string)=>this.db.run('insert into social_profile_repairs (id,workspace_id,lead_id,profile_id,reason,original_json,repaired_at) values (?,?,?,?,?,?,?)',[randomUUID(),row.workspace_id,row.lead_id,row.id,reason,JSON.stringify(row),nowIso()])
      for(const row of rows){
        if(row.platform==='other')continue
        const profile=canonicalSocialProfile(row.profile_url),own=canonicalSocialProfile(row.website)
        const corporate=profile&&/^(?:youtube(?:creators|music|gaming|insider|tv)?|teamyoutube|facebook|instagram|meta|tiktok|twitter)$/i.test(profile.handle)
        const feed=row.source==='website'&&own&&profile&&socialProfileIdentity(own)!==socialProfileIdentity(profile)&&(own.platform===profile.platform||corporate)
        if(!profile||profile.platform!==row.platform||feed){archive(row,feed?'legacy platform feed, not the supplied account':'not a direct social profile');this.db.run('delete from social_profiles where id=?',[row.id]);report.removed++;continue}
        const key=row.lead_id+'|'+socialProfileIdentity(profile),list=groups.get(key)??[];list.push({row,url:profile});groups.set(key,list)
      }
      for(const list of groups.values()){
        const winner=list.find(item=>item.row.profile_url===item.url.profileUrl)??list[0]
        for(const item of list)if(item!==winner){archive(item.row,'duplicate profile URL variant');this.db.run('delete from social_profiles where id=?',[item.row.id]);report.removed++}
        if(winner.row.profile_url!==winner.url.profileUrl||winner.row.handle!==winner.url.handle){archive(winner.row,'canonical profile URL');this.db.run('update social_profiles set profile_url=?,handle=?,updated_at=? where id=?',[winner.url.profileUrl,winner.url.handle,nowIso(),winner.row.id]);report.normalized++}
      }
      for(const lead of this.db.query<{id:string;workspace_id:string;website:string}>('select id,workspace_id,website from leads where website <> ?',[''])){
        const own=canonicalSocialProfile(lead.website);if(!own)continue
        if(!this.db.one('select id from social_profiles where lead_id=? and platform=? and profile_url=?',[lead.id,own.platform,own.profileUrl])){this.upsertSocialProfile({workspaceId:lead.workspace_id,leadId:lead.id,...own,source:lead.website});report.added++}
      }
      return report
    })
  }

  // ---------------------------------------------------------------- decision makers

  listDecisionMakers(workspaceId: string, leadIds?: string[]): Record<string, unknown>[] {
    if (leadIds && !leadIds.length) return []
    const filter = leadIds ? `and lead_id in (${leadIds.map(() => '?').join(',')})` : ''
    return this.db.query(
      `select * from decision_makers where workspace_id = ? ${filter} order by created_at desc`,
      leadIds ? [workspaceId, ...leadIds] : [workspaceId],
    )
  }

  addDecisionMaker(input: {
    workspaceId: string
    leadId: string
    fullName: string
    title?: string
    email?: string
    phone?: string
    linkedinUrl?: string
    source?: string
    replaceEmail?: boolean
  }): { id: string } {
    const lead = this.db.one<{ workspace_id: string }>('select workspace_id from leads where id = ?', [input.leadId])
    const workspaceId = lead?.workspace_id ?? input.workspaceId
    const fullName = input.fullName.trim().replace(/\s+/g, ' ')
    const existing = this.db.one<{ id: string }>(
      'select id from decision_makers where workspace_id = ? and lead_id = ? and lower(trim(full_name)) = lower(?) limit 1',
      [workspaceId, input.leadId, fullName],
    ) ?? this.db.query<{id:string;full_name:string}>('select id,full_name from decision_makers where workspace_id=? and lead_id=?',[workspaceId,input.leadId]).find(person=>Boolean(ownerIdentityKey(fullName)) && ownerIdentityKey(person.full_name)===ownerIdentityKey(fullName))
    if (existing) {
      // Re-scans enrich the same contact without duplicating it or erasing published details.
      this.db.run(
        `update decision_makers set full_name = ?, title = coalesce(nullif(?, ''), title),
         email = case when ? then ? else coalesce(nullif(?, ''), email) end, phone = coalesce(nullif(?, ''), phone),
         linkedin_url = coalesce(nullif(?, ''), linkedin_url), source = coalesce(nullif(?, ''), source)
         where id = ?`,
        [fullName, input.title ?? '', input.replaceEmail ? 1 : 0, input.email ?? '', input.email ?? '', input.phone ?? '', input.linkedinUrl ?? '', input.source ?? '', existing.id],
      )
      return { id: existing.id }
    }
    const id = randomUUID()
    this.db.run(
      `insert into decision_makers (id, lead_id, workspace_id, full_name, title, email, phone, linkedin_url, source, created_at)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        input.leadId,
        workspaceId,
        fullName,
        input.title ?? '',
        input.email ?? '',
        input.phone ?? '',
        input.linkedinUrl ?? '',
        input.source ?? 'website',
        nowIso(),
      ],
    )
    return { id }
  }

  deleteDecisionMaker(id: string): void {
    this.db.run('delete from decision_makers where id = ?', [id])
  }

  /**
   * Removes named contacts whose name reads as a button or a service rather than a person. The
   * worker refuses them now, and this clears any stored before it did.
   */
  pruneNoisyPeople(isUsable: (name: string, title: string) => boolean, leadId?: string): { removed: number } {
    const rows = this.db.query<{ id: string; full_name: string; title: string }>(
      'select id, full_name, title from decision_makers' + (leadId ? ' where lead_id=?' : ''), leadId ? [leadId] : [],
    )
    let removed = 0
    for (const row of rows) {
      if (isUsable(row.full_name, row.title)) continue
      this.db.run('delete from decision_makers where id = ?', [row.id])
      removed += 1
    }
    return { removed }
  }

  // ---------------------------------------------------------------- decision maker suggestions

  /**
   * Drops suggestions that are not people. An earlier pass turned every LinkedIn URL on a site
   * into a suggestion, so company pages were offered as if they were a named contact — the
   * evidence is a `/company/` URL, and the "name" is the page's slug. A suggestion has to be a
   * person, so anything whose evidence points at a company page is removed once.
   */
  pruneNoisyCandidates(isUsable: (name: string, title: string) => boolean, workspaceId: string): { removed: number } {
    const rows = this.db.query<{ id: string; full_name: string; title: string; evidence: string }>(
      `select id, full_name, title, evidence from decision_maker_candidates
       where workspace_id = ? and status <> 'confirmed'`,
      [workspaceId],
    )
    let removed = 0
    for (const row of rows) {
      const isCompanyPage = /linkedin\.com\/company\//i.test(row.evidence ?? '')
      if (!isCompanyPage && isUsable(row.full_name, row.title)) continue
      this.db.run('delete from decision_maker_candidates where id = ?', [row.id])
      removed += 1
    }
    return { removed }
  }

  /**
   * Records a suggestion. A name already suggested for the same lead from the same source is
   * left alone; a name the user dismissed stays dismissed.
   */
  suggestPerson(input: {
    workspaceId: string
    leadId: string
    fullName: string
    title?: string
    source: 'email' | 'linkedin' | 'page' | 'schema'
    evidence?: string
    email?: string
    linkedinUrl?: string
  }): { id: string; created: boolean } {
    const name = input.fullName.replace(/\s+/g, ' ').trim()
    if (!name) return { id: '', created: false }
    const existing = this.db.one<{ id: string }>(
      'select id from decision_maker_candidates where lead_id = ? and full_name = ? and source = ?',
      [input.leadId, name, input.source],
    )
    if (existing) return { id: existing.id, created: false }

    const id = randomUUID()
    this.db.run(
      `insert into decision_maker_candidates
         (id, workspace_id, lead_id, full_name, title, source, evidence, email, linkedin_url, status, created_at)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, 'suggested', ?)`,
      [
        id,
        input.workspaceId,
        input.leadId,
        name,
        input.title ?? '',
        input.source,
        input.evidence ?? '',
        input.email ?? '',
        input.linkedinUrl ?? '',
        nowIso(),
      ],
    )
    return { id, created: true }
  }

  /**
   * Builds suggestions from what is already on file, without visiting a single page: an address
   * whose local part is a person's name, and a lead carrying a LinkedIn company page.
   */
  buildSuggestions(workspaceId: string): { suggested: number } {
    let suggested = 0
    const leads = this.db.query<{ id: string; name: string; website: string }>(
      "select id, name, website from leads where workspace_id = ? and website <> ''",
      [workspaceId],
    )

    for (const lead of leads) {
      const emails = this.db.query<{ value: string; score: number | null }>(
        "select value, score from lead_contacts where lead_id = ? and kind = 'email'",
        [lead.id],
      )
      for (const row of emails) {
        const name = personNameFromEmail(row.value)
        if (!name) continue
        const result = this.suggestPerson({
          workspaceId,
          leadId: lead.id,
          fullName: name,
          source: 'email',
          evidence: `derived from ${row.value}`,
          email: row.value,
        })
        if (result.created) suggested += 1
      }

      // A LinkedIn profile URL carries the person's name in its slug, which is far better
      // evidence than the business name. Only profiles ("/in/") name a person; a company page
      // ("/company/") names the business and is recorded as somewhere to look instead.
      const profiles = this.db.query<{ profile_url: string }>(
        "select profile_url from social_profiles where lead_id = ? and platform = 'linkedin'",
        [lead.id],
      )
      for (const profile of profiles) {
        // Only a profile page names a person. A company page is somewhere to look, so it is
        // recorded with the business name and a note rather than passed off as a contact.
        const fromProfile = personNameFromLinkedIn(profile.profile_url)
        const isProfile = /\/in\//i.test(profile.profile_url)
        const result = this.suggestPerson({
          workspaceId,
          leadId: lead.id,
          fullName: fromProfile ?? lead.name,
          title: fromProfile ? '' : 'Read the LinkedIn page',
          source: 'linkedin',
          evidence: profile.profile_url,
          linkedinUrl: isProfile ? profile.profile_url : '',
        })
        if (result.created) suggested += 1
      }
    }
    return { suggested }
  }

  /** Suggestions still awaiting a decision, newest first, with the lead they belong to. */
  listCandidates(workspaceId: string, includeDismissed = false): CandidateRow[] {
    const filter = includeDismissed ? '' : "and c.status = 'suggested'"
    return this.db.query<CandidateRow>(
      `select c.id, c.lead_id, c.full_name, c.title, c.source, c.evidence, c.email, c.linkedin_url,
              c.status, c.created_at, l.name as lead_name
       from decision_maker_candidates c
       join leads l on l.id = c.lead_id
       where c.workspace_id = ? ${filter}
       order by c.created_at desc
       limit 200`,
      [workspaceId],
    )
  }

  candidateTotals(workspaceId: string): { suggested: number; dismissed: number } {
    const rows = this.db.query<{ status: string; n: number }>(
      'select status, count(*) as n from decision_maker_candidates where workspace_id = ? group by status',
      [workspaceId],
    )
    const totals = { suggested: 0, dismissed: 0 }
    for (const row of rows) {
      if (row.status === 'suggested') totals.suggested = row.n
      if (row.status === 'dismissed') totals.dismissed = row.n
    }
    return totals
  }

  /** Promotes a suggestion to a confirmed person, which is the only way a row gets in there. */
  confirmCandidate(workspaceId: string, id: string): { confirmed: boolean } {
    const candidate = this.db.one<CandidateRow>(
      'select * from decision_maker_candidates where workspace_id = ? and id = ?',
      [workspaceId, id],
    )
    if (!candidate) return { confirmed: false }
    this.addDecisionMaker({
      workspaceId,
      leadId: candidate.lead_id,
      fullName: candidate.full_name,
      title: candidate.title,
      email: candidate.email,
      linkedinUrl: candidate.linkedin_url,
      // The confirmation is the user's, so the source says so rather than claiming the site said it.
      source: `confirmed from ${candidate.source}`,
    })
    this.db.run('delete from decision_maker_candidates where id = ?', [id])
    return { confirmed: true }
  }

  dismissCandidate(workspaceId: string, id: string): { dismissed: boolean } {
    const result = this.db.prepare(
      "update decision_maker_candidates set status = 'dismissed' where workspace_id = ? and id = ?",
    ).run(workspaceId, id)
    return { dismissed: result > 0 }
  }

  /**
   * Puts a dismissed suggestion back in the queue.
   *
   * A confirmation deletes its candidate, so it cannot be undone from that side; a dismissal only
   * changes the status, which is why this one can be. The card says as much by offering Undo only
   * on the dismissed outcome.
   */
  restoreCandidate(workspaceId: string, id: string): { restored: boolean } {
    const result = this.db.prepare(
      "update decision_maker_candidates set status = 'suggested' where workspace_id = ? and id = ?",
    ).run(workspaceId, id)
    return { restored: result > 0 }
  }

  // ---------------------------------------------------------------- lists

  listLists(workspaceId: string): { id: string; name: string; created_at: string; members: number; updated_at: string | null; initials: string }[] {
    return this.db.query(
      `select l.id,
              l.name,
              l.created_at,
              (select count(*) from list_items i where i.list_id = l.id) as members,
              (select max(i.added_at) from list_items i where i.list_id = l.id) as updated_at,
              coalesce((
                select group_concat(ini, '')
                from (
                  select (select substr(trim(ld.name), 1, 1) from leads ld where ld.id = i2.lead_id) as ini
                  from list_items i2 where i2.list_id = l.id limit 3
                )
              ), '') as initials
       from lists l
       where l.workspace_id = ?
       order by l.created_at desc`,
      [workspaceId],
    )
  }

  createList(workspaceId: string, name: string): { id: string } {
    const trimmed = name.trim()
    if (!trimmed) throw new Error('A list name is required.')
    const existing = this.db.one<{ id: string }>('select id from lists where workspace_id = ? and name = ?', [
      workspaceId,
      trimmed,
    ])
    if (existing) return { id: existing.id }
    const id = randomUUID()
    this.db.run('insert into lists (id, workspace_id, name, created_at) values (?, ?, ?, ?)', [
      id,
      workspaceId,
      trimmed,
      nowIso(),
    ])
    return { id }
  }

  deleteList(id: string): void {
    this.db.run('delete from lists where id = ?', [id])
  }

  /** Adds leads to a list. A lead already in the list is left alone rather than duplicated. */
  addLeadsToList(listId: string, leadIds: string[]): { added: number; skipped: number } {
    return this.db.transaction(() => {
      const list = this.db.one<{ workspace_id: string }>('select workspace_id from lists where id = ?', [listId])
      if (!list) throw new Error('That list no longer exists.')
      let added = 0
      const insert = this.db.prepare(
        'insert into list_items (list_id, lead_id, workspace_id, added_at) values (?, ?, ?, ?) on conflict do nothing',
      )
      for (const leadId of leadIds) {
        added += insert.run(listId, leadId, list.workspace_id, nowIso())
      }
      return { added, skipped: leadIds.length - added }
    })
  }

  removeLeadFromList(listId: string, leadId: string): void {
    this.db.run('delete from list_items where list_id = ? and lead_id = ?', [listId, leadId])
  }

  listMembers(listId: string): string[] {
    return this.db.query<{ lead_id: string }>('select lead_id from list_items where list_id = ?', [listId]).map((row) => row.lead_id)
  }

  listIdsForLead(leadId: string): string[] {
    return this.db.query<{ list_id: string }>('select list_id from list_items where lead_id = ?', [leadId]).map((row) => row.list_id)
  }

  listTotals(workspaceId: string): { lists: number; leads: number } {
    return (
      this.db.one<{ lists: number; leads: number }>(
        `select (select count(*) from lists where workspace_id = ?) as lists,
                (select count(distinct lead_id) from list_items where workspace_id = ?) as leads`,
        [workspaceId, workspaceId],
      ) ?? { lists: 0, leads: 0 }
    )
  }

  // ---------------------------------------------------------------- enrichment jobs

  queueJob(workspaceId: string, kind: 'email' | 'phone' | 'social' | 'decision-maker' | 'website' | 'deep', leadIds: string[], options: Record<string, unknown> = {}): { jobId: string; queued: number } {
    leadIds = [...new Set(leadIds.filter(id => typeof id === 'string' && id.trim()))]
    if (!leadIds.length) return { jobId: '', queued: 0 }
    const id = randomUUID()
    this.db.run(
      'insert into enrichment_jobs (id, workspace_id, kind, lead_ids, options, status, created_at) values (?, ?, ?, ?, ?, ?, ?)',
      [id, workspaceId, kind, JSON.stringify(leadIds), JSON.stringify(options), 'queued', nowIso()],
    )
    return { jobId: id, queued: leadIds.length }
  }

  /** Leads covered by a finished pass, which the pages read as "already looked at". */
  coveredLeads(workspaceId: string, kind: string, statuses: string[]): Set<string> {
    const marks = statuses.map(() => '?').join(',')
    const rows = this.db.query<{ lead_ids: string }>(
      `select lead_ids from enrichment_jobs where workspace_id = ? and kind = ? and status in (${marks})`,
      [workspaceId, kind, ...statuses],
    )
    const covered = new Set<string>()
    for (const row of rows) {
      try {
        for (const id of JSON.parse(row.lead_ids) as string[]) covered.add(id)
      } catch {
        // A malformed payload should not take the page down.
      }
    }
    return covered
  }

  nextQueuedJob(foregroundJobId = ''): { id: string; workspace_id: string; kind: string; lead_ids: string; options: string } | null {
    return this.db.one(
      // A one-site import is an explicit foreground action. Let its social pass run before an
      // old 50-lead cascade, otherwise the import modal can sit on "Scanning" while background
      // work from an earlier session spends minutes ahead of the URL the user just entered.
      `select id, workspace_id, kind, lead_ids, options
       from enrichment_jobs
       where status = 'queued'
       order by
         case when id = ? then -1 else 0 end,
         case when json_array_length(lead_ids) <= 1 then 0 else 1 end,
         case when kind = 'social' then 0 when kind = 'website' then 1 else 2 end,
         created_at desc
       limit 1`,
      [foregroundJobId],
    )
  }

  /**
   * A process can close while a worker is reading a site. Those rows are durable, but "running"
   * no longer means anything after the worker is gone. Put them back in the queue on the next
   * launch so a fresh import is never held behind a job that cannot make progress.
   */
  requeueInterruptedJobs(workspaceId: string): number {
    return this.db.prepare(
      `update enrichment_jobs
       set status = 'queued', started_at = null, finished_at = null, error = null
       where workspace_id = ? and status = 'running'`,
    ).run(workspaceId)
  }

  /** Puts one aborted job back in the durable queue so a foreground scan can take the turn first. */
  requeueJob(id: string): void {
    this.db.run(
      `update enrichment_jobs
       set status = 'queued', started_at = null, finished_at = null, error = null
       where id = ? and status = 'running'`,
      [id],
    )
  }

  /** Marks a queued or active foreground job as cancelled so it will not be picked up later. */
  cancelJob(id: string): void {
    this.db.run(
      `update enrichment_jobs
       set status = 'failed', error = 'Cancelled by user', finished_at = ?
       where id = ? and status in ('queued', 'running')`,
      [nowIso(), id],
    )
  }

  /** Persist actual completed-site progress so polling/reopening does not invent a scan percentage. */
  saveJobProgress(id: string, progress: { processed: number; total: number; found: number; failed: number; leadName: string; message: string; at: string }): void {
    this.db.run("update enrichment_jobs set options = json_set(case when json_valid(options) then options else '{}' end, '$.progress', json(?)), found = ? where id = ?", [JSON.stringify(progress), progress.found, id])
  }

  markJob(id: string, status: 'running' | 'done' | 'failed', found = 0, error: string | null = null): void {
    const finished = status === 'running' ? null : nowIso()
    this.db.run(
      'update enrichment_jobs set status = ?, found = ?, error = ?, started_at = coalesce(started_at, ?), finished_at = ? where id = ?',
      [status, found, error, nowIso(), finished, id],
    )
  }

  jobTotals(workspaceId: string): { queued: number; running: number; done: number; failed: number } {
    const rows = this.db.query<{ status: string; n: number }>(
      'select status, count(*) as n from enrichment_jobs where workspace_id = ? group by status',
      [workspaceId],
    )
    const totals = { queued: 0, running: 0, done: 0, failed: 0 }
    for (const row of rows) {
      if (row.status in totals) totals[row.status as keyof typeof totals] = row.n
    }
    return totals
  }

  /** The state of one queued pass, so a page can wait for its own scan rather than the whole queue. */
  jobStatus(workspaceId: string, jobId: string): { status: 'queued' | 'running' | 'done' | 'failed' | 'cancelled'; processed: number; total: number; found: number; failed: number; leadName: string; message: string; at: string } | null {
    const row = this.db.one<{ status: 'queued' | 'running' | 'done' | 'failed'; lead_ids: string; options: string; found: number; error: string | null; finished_at: string | null }>(
      'select status, lead_ids, options, found, error, finished_at from enrichment_jobs where workspace_id = ? and id = ?',
      [workspaceId, jobId],
    )
    if (!row) return null
    let total = 0
    let progress: Partial<{ processed: number; total: number; found: number; failed: number; leadName: string; message: string; at: string }> = {}
    try { total = new Set(JSON.parse(row.lead_ids) as string[]).size } catch { /* malformed jobs are reported by the worker */ }
    try { progress = JSON.parse(row.options || '{}').progress || {} } catch { /* older jobs have no progress */ }
    return { status: row.error === 'Cancelled by user' ? 'cancelled' : row.status, total, processed: Math.min(total, Math.max(0, Number(progress.processed ?? (row.status === 'done' ? total : 0)) || 0)), found: row.found || 0, failed: Number(progress.failed) || 0, leadName: progress.leadName || '', message: row.error === 'Cancelled by user' ? 'Scan stopped. Completed results are saved.' : row.error || progress.message || '', at: progress.at || row.finished_at || '' }
  }

  /**
   * How many leads each kind of enrichment pass has actually covered, which is what the billing
   * page's lookup meters report. It is the same number the pages use to decide what is pending.
   *
   * The meters sit under "Usage this cycle", so the count is this cycle's — a job from three months
   * ago is not this month's usage, and counting it would push a meter past an allowance that was
   * never spent. The cycle is the calendar month, which is what the page's own range states.
   */
  lookupUsage(workspaceId: string): Record<string, number> {
    const now = new Date()
    const cycleStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
    const rows = this.db.query<{ kind: string; n: number }>(
      `select kind, coalesce(sum(json_array_length(lead_ids)), 0) as n
       from enrichment_jobs
       where workspace_id = ? and status in ('done', 'running') and created_at >= ?
       group by kind`,
      [workspaceId, cycleStart],
    )
    const used: Record<string, number> = {}
    for (const row of rows) used[row.kind] = row.n
    return used
  }

  startWebsiteLookup(workspaceId: string, input: string[], selected: WebsiteLookupFields) {
    const fields = lookupFields(selected)
    const domains = [...new Set(input.map(normaliseDomain).filter(Boolean))]
    if (!domains.length) throw new Error('Add at least one valid website URL.')
    if (domains.length > 500) throw new Error('Scan up to 500 unique websites at a time. Split this list into smaller batches.')
    const active = this.db.one<{ id: string }>("select id from enrichment_jobs where workspace_id = ? and kind = 'website' and status in ('queued','running') and json_extract(options, '$.source') = 'website-lookup'", [workspaceId])
    if (active) throw new Error('A Website Lookup is already running. Wait for it to finish before starting another.')
    const imported = this.importWebsites(workspaceId, domains, false)
    return this.db.transaction(() => {
      const {jobId} = this.queueJob(workspaceId, 'website', imported.leadIds, {source:'website-lookup',fields,added:imported.added,reused:imported.skipped})
      for (const [position,id] of imported.leadIds.entries()) {
        const lead = this.getLead(workspaceId,id)!
        this.db.run('insert into website_lookup_rows (job_id,lead_id,position,data) values (?,?,?,?)',[jobId,id,position,JSON.stringify(emptyLookupRow(lead))])
      }
      return readWebsiteLookup(this.db,workspaceId,jobId)!
    })
  }

  websiteLookupSession(workspaceId: string, jobId?: string) { return readWebsiteLookup(this.db,workspaceId,jobId) }

  saveWebsiteLookupRow(jobId: string, row: WebsiteLookupRow): void {
    this.db.run('update website_lookup_rows set data = ?, status = ?, error = ? where job_id = ? and lead_id = ?', [JSON.stringify(row),row.status,row.error,jobId,row.leadId])
  }

  // ---------------------------------------------------------------- exports

  recordExport(input: {
    workspaceId: string
    kind: string
    scope: string
    rowCount: number
    columns: string[]
    fileName: string
    path: string
  }): { id: string } {
    const id = randomUUID()
    this.db.run(
      `insert into exports (id, workspace_id, kind, scope, row_count, columns, file_name, path, created_at)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        input.workspaceId,
        input.kind,
        input.scope,
        input.rowCount,
        JSON.stringify(input.columns),
        input.fileName,
        input.path,
        nowIso(),
      ],
    )
    return { id }
  }

  listExports(workspaceId: string, limit = 50): Record<string, unknown>[] {
    return this.db.query('select * from exports where workspace_id = ? order by created_at desc limit ?', [
      workspaceId,
      limit,
    ])
  }

  // ---------------------------------------------------------------- website import

  /**
   * Turns a pasted list of domains into leads.
   *
   * A domain becomes a lead named after its host, which is enough for the enrichment worker to
   * find the business's real name, address and contacts from the site itself. Domains already on
   * file are skipped rather than duplicated, so re-importing a list is harmless.
   */
  importWebsites(workspaceId: string, input: string[], enqueue = true): { batchId: string; added: number; skipped: number; leadIds: string[] } {
    return this.db.transaction(() => {
      const seen = new Set<string>()
      const domains: string[] = []
      for (const raw of input) {
        const host = normaliseDomain(raw)
        if (!host || seen.has(host)) continue
        seen.add(host)
        domains.push(host)
      }

      const existing = new Map(
        this.db
          .query<{ id: string; host: string }>(
            `select id, lower(replace(replace(replace(website, 'https://', ''), 'http://', ''), 'www.', '')) as host
             from leads where workspace_id = ? and website <> ''`,
            [workspaceId],
          )
          .map((row) => [row.host.split('/')[0], row.id] as const)
          .filter(([host]) => Boolean(host)),
      )

      const batchId = randomUUID()
      const leadIds: string[] = []
      const addedLeadIds: string[] = []
      const insert = this.db.prepare(
        `insert into leads (id, workspace_id, name, website, provider, score, captured_at)
         values (?, ?, ?, ?, 'import', 40, ?)`,
      )

      let skipped = 0
      for (const host of domains) {
        const existingId = existing.get(host)
        if (existingId) {
          skipped += 1
          // A re-scan still needs the lead in the result. It is the URL the user just entered,
          // even though it did not create a new database row.
          leadIds.push(existingId)
          continue
        }
        const id = randomUUID()
        insert.run(id, workspaceId, host, `https://${host}`, nowIso())
        leadIds.push(id)
        addedLeadIds.push(id)
      }

      this.db.run(
        `insert into import_batches (id, workspace_id, kind, source_count, added, skipped, created_at)
         values (?, ?, 'websites', ?, ?, ?, ?)`,
        [batchId, workspaceId, domains.length, addedLeadIds.length, skipped, nowIso()],
      )

      if (addedLeadIds.length && enqueue) {
        this.db.run(
          `insert into enrichment_jobs (id, workspace_id, kind, lead_ids, status, created_at)
           values (?, ?, 'website', ?, 'queued', ?)`,
          [randomUUID(), workspaceId, JSON.stringify(addedLeadIds), nowIso()],
        )
        this.db.run(
          `insert into usage_counters (workspace_id, period, lookups_used) values (?, ?, ?)
           on conflict (workspace_id, period) do update set lookups_used = lookups_used + excluded.lookups_used`,
          [workspaceId, currentPeriod(), addedLeadIds.length],
        )
      }

      return { batchId, added: addedLeadIds.length, skipped, leadIds }
    })
  }

  /**
   * Turns a pasted list of social profile URLs into profiles on the leads they belong to.
   *
   * Nothing is crawled: the paste already holds the profile, so the only work is deciding which
   * lead it belongs to. A handle that reads like a lead's name or domain is attached to that lead.
   *
   * A URL that matches no lead still has to be usable — it is a profile the user went and found, and
   * dropping it would mean the paste did nothing — so it gets a lead of its own, named after the
   * handle. That lead is enriched like any other, so the business behind the account fills itself in
   * afterwards, and until then the row carries the profile the paste named.
   */
  importSocialProfiles(
    workspaceId: string,
    input: string[],
    fallbackPlatform = '',
  ): { batchId: string; added: number; matched: number; created: number; skipped: number; unmatched: string[]; leadIds: string[] } {
    const parsed: SocialUrl[] = []
    const seen = new Set<string>()
    for (const raw of input) {
      const url = parseSocialUrl(raw, fallbackPlatform)
      if (!url) continue
      // One profile per line however it was written: the same URL twice is one profile.
      const key = socialProfileKey(url.platform, url.profileUrl)
      if (seen.has(key)) continue
      seen.add(key)
      parsed.push(url)
    }

    return this.db.transaction(() => {
      const leads = this.db.query<{ id: string; name: string; website: string }>(
        'select id, name, website from leads where workspace_id = ?',
        [workspaceId],
      )
      const leadKeys = leads.map((lead) => ({
        id: lead.id,
        keys: [matchKey(lead.name), matchKey(normaliseDomain(lead.website))].filter((key) => key.length >= 4),
      }))
      const leadIndex = buildLeadIndex(leadKeys)
      const knownProfiles = new Map<string, string>()
      for (const profile of this.db.query<{ lead_id: string; platform: string; profile_url: string }>(
        'select lead_id, platform, profile_url from social_profiles where workspace_id = ?',
        [workspaceId],
      )) {
        const key = socialProfileKey(profile.platform, profile.profile_url)
        if (!knownProfiles.has(key)) knownProfiles.set(key, profile.lead_id)
      }

      const batchId = randomUUID()
      const unmatched: string[] = []
      let added = 0
      let matched = 0
      let created = 0
      let skipped = 0
      /**
       * The leads this paste landed on, in the order the URLs were given.
       *
       * The page narrows its table to exactly these after an import — "the URLs just imported" is
       * what the coverage card promises — and a URL is reported whether it was filed, already on
       * file or filed against a lead that had to be created, because the user pasted it either way.
       */
      const leadIds: string[] = []

      for (const url of parsed) {
        const profileKey = socialProfileKey(url.platform, url.profileUrl)
        const existingLeadId = knownProfiles.get(profileKey)
        const target = existingLeadId ?? bestLeadFor(matchKey(url.handle), leadKeys, leadIndex)
        let leadId = target
        if (!leadId) {
          // A shared post has no business name of its own, so the platform names the lead: the
          // profile the user pasted is still shown, which is the whole point of importing it.
          const name = readableNameFromHandle(url.handle) || `${PLATFORM_LABELS[url.platform] ?? 'Social'} post`
          leadId = randomUUID()
          this.db.run(
            `insert into leads (id, workspace_id, name, website, provider, score, captured_at)
             values (?, ?, ?, '', 'import', 40, ?)`,
            [leadId, workspaceId, name, nowIso()],
          )
          // The newest lead is a candidate for the URLs still to come in this same paste.
          const keys = [matchKey(name)]
          leadKeys.push({ id: leadId, keys })
          created += 1
        }

        if (!leadIds.includes(leadId)) leadIds.push(leadId)
        if (existingLeadId) {
          skipped += 1
          continue
        }
        const at = nowIso()
        this.db.run(
          `insert into social_profiles
             (id, workspace_id, lead_id, platform, handle, profile_url, followers, verified, source, discovered_at, checked_at, updated_at)
           values (?, ?, ?, ?, ?, ?, null, 0, 'import', ?, ?, ?)`,
          [randomUUID(), workspaceId, leadId, url.platform, url.handle, url.profileUrl, at, at, at],
        )
        knownProfiles.set(profileKey, leadId)
        added += 1
        if (target) matched += 1
      }

      this.db.run(
        `insert into import_batches (id, workspace_id, kind, source_count, added, skipped, created_at)
         values (?, ?, 'social', ?, ?, ?, ?)`,
        [batchId, workspaceId, parsed.length, added, skipped + unmatched.length, nowIso()],
      )

      // The history panel shows the import as one entry, with the URLs it read.
      if (parsed.length) {
        const parts = [`${added} profile${added === 1 ? '' : 's'} attached`]
        if (created) parts.push(`${created} new lead${created === 1 ? '' : 's'}`)
        if (skipped + unmatched.length) parts.push(`${skipped + unmatched.length} skipped`)
        this.logActivity(workspaceId, {
          kind: 'import',
          title: `${parsed.length} profile URL${parsed.length === 1 ? '' : 's'} imported`,
          detail: parts.join(' · '),
          items: parsed.map((url) => url.profileUrl),
          hits: added,
        })
      }

      return { batchId, added, matched, created, skipped, unmatched, leadIds }
    })
  }

  listImports(workspaceId: string, limit = 20): Record<string, unknown>[] {
    return this.db.query('select * from import_batches where workspace_id = ? order by created_at desc limit ?', [
      workspaceId,
      limit,
    ])
  }

  // ---------------------------------------------------------------- search history

  /**
   * What has been searched, most recent first.
   *
   * A term is stored once per page and moves to the top when it is searched again, so the list is
   * the terms in the order they were last wanted rather than a log of every keystroke's search.
   */
  listSearchHistory(workspaceId: string, scope = 'social', limit = 8): { term: string; results: number | null; searchedAt: string }[] {
    return this.db
      .query<{ term: string; results: number | null; searched_at: string }>(
        'select term, results, searched_at from search_history where workspace_id = ? and scope = ? order by searched_at desc limit ?',
        [workspaceId, scope, Math.max(1, Math.min(50, limit))],
      )
      .map((row) => ({ term: row.term, results: row.results, searchedAt: row.searched_at }))
  }

  saveSearchTerm(workspaceId: string, term: string, scope = 'social', results?: number | null): void {
    const trimmed = term.trim().slice(0, 120)
    // One character is not a search worth offering back, and a blank one is not a search at all.
    if (trimmed.length < 2) return
    const existing = this.db.one<{ id: string }>(
      'select id from search_history where workspace_id = ? and scope = ? and term = ?',
      [workspaceId, scope, trimmed],
    )
    const at = nowIso()
    if (existing) {
      this.db.run('update search_history set searched_at = ?, results = coalesce(?, results) where id = ?', [
        at,
        results ?? null,
        existing.id,
      ])
      return
    }
    this.db.run(
      'insert into search_history (id, workspace_id, scope, term, results, searched_at) values (?, ?, ?, ?, ?, ?)',
      [randomUUID(), workspaceId, scope, trimmed, results ?? null, at],
    )
  }

  // ---------------------------------------------------------------- the history panel

  /**
   * Writes one entry into the history panel's log.
   *
   * A search that repeats the last one updates nothing and adds nothing: the panel is a list of
   * what was done, and typing the same term twice is one thing done. An import always adds, because
   * two imports of different URLs are two imports whatever they produced.
   */
  logActivity(
    workspaceId: string,
    entry: {
      kind: 'search' | 'import' | 'refresh' | 'action'
      title?: string
      detail?: string
      items?: string[]
      hits?: number | null
      runTerm?: string
      scope?: string
    },
  ): void {
    const scope = entry.scope ?? 'social'
    const items = (entry.items ?? []).filter(Boolean).slice(0, 50)
    if (entry.kind === 'search') {
      const term = (entry.runTerm ?? entry.title ?? '').trim()
      if (term.length < 2) return
      const last = this.db.one<{ id: string; title: string }>(
        'select id, title from activity_log where workspace_id = ? and scope = ? order by created_at desc limit 1',
        [workspaceId, scope],
      )
      if (last && last.title.toLowerCase() === term.toLowerCase()) {
        this.db.run('update activity_log set hits = ?, created_at = ? where id = ?', [
          entry.hits ?? null,
          nowIso(),
          last.id,
        ])
        return
      }
    }
    this.db.run(
      `insert into activity_log (id, workspace_id, scope, kind, title, detail, items, hits, run_term, created_at)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        randomUUID(),
        workspaceId,
        scope,
        entry.kind,
        (entry.title ?? '').slice(0, 160),
        (entry.detail ?? '').slice(0, 200),
        JSON.stringify(items),
        entry.hits ?? null,
        (entry.runTerm ?? '').slice(0, 120),
        nowIso(),
      ],
    )
  }

  /** The log, newest first. `only` narrows it the way the panel's tabs do. */
  listActivity(
    workspaceId: string,
    options: { scope?: string; only?: 'all' | 'searches' | 'activity'; limit?: number } = {},
  ): { id: string; kind: string; title: string; detail: string; items: string[]; hits: number | null; runTerm: string; createdAt: string }[] {
    const scope = options.scope ?? 'social'
    const only = options.only ?? 'all'
    const clause = only === 'searches' ? "and kind = 'search'" : only === 'activity' ? "and kind <> 'search'" : ''
    return this.db
      .query<{
        id: string
        kind: string
        title: string
        detail: string
        items: string
        hits: number | null
        run_term: string
        created_at: string
      }>(
        `select id, kind, title, detail, items, hits, run_term, created_at
           from activity_log where workspace_id = ? and scope = ? ${clause}
          order by created_at desc limit ?`,
        [workspaceId, scope, Math.max(1, Math.min(200, options.limit ?? 50))],
      )
      .map((row) => ({
        id: row.id,
        kind: row.kind,
        title: row.title,
        detail: row.detail,
        items: safeJsonArray(row.items),
        hits: row.hits,
        runTerm: row.run_term,
        createdAt: row.created_at,
      }))
  }

  /** How many entries the panel's badge shows. */
  countActivity(workspaceId: string, scope = 'social'): number {
    return (
      this.db.one<{ n: number }>('select count(*) as n from activity_log where workspace_id = ? and scope = ?', [
        workspaceId,
        scope,
      ])?.n ?? 0
    )
  }

  clearActivity(workspaceId: string, scope = 'social'): void {
    this.db.run('delete from activity_log where workspace_id = ? and scope = ?', [workspaceId, scope])
    this.db.run('delete from search_history where workspace_id = ? and scope = ?', [workspaceId, scope])
  }

  /**
   * What the import box would do, without doing it.
   *
   * The modal shows each pasted line and what it will become — attached to a lead already on file,
   * a new lead of its own, a duplicate of another line, or a line that names no platform — and this
   * is that same judgement made before anything is written. It is the import's own matcher, so the
   * preview cannot drift from what the import goes on to do.
   */
  previewSocialImport(
    workspaceId: string,
    input: string[],
    fallbackPlatform = '',
  ): { tag: string; handle: string; detail: string; result: string; tone: 'match' | 'new' | 'skip' | 'warn'; kind: 'match' | 'new' | 'skip'; url: string }[] {
    const leads = this.db.query<{ id: string; name: string; website: string }>(
      'select id, name, website from leads where workspace_id = ?',
      [workspaceId],
    )
    const leadKeys = leads.map((lead) => ({
      id: lead.id,
      keys: [matchKey(lead.name), matchKey(normaliseDomain(lead.website))].filter((key) => key.length >= 4),
    }))
    const leadIndex = buildLeadIndex(leadKeys)
    const nameById = new Map(leads.map((lead) => [lead.id, lead.name]))
    const knownProfiles = new Map<string, string>()
    for (const profile of this.db.query<{ lead_id: string; platform: string; profile_url: string }>(
      'select lead_id, platform, profile_url from social_profiles where workspace_id = ?',
      [workspaceId],
    )) {
      const key = socialProfileKey(profile.platform, profile.profile_url)
      if (!knownProfiles.has(key)) knownProfiles.set(key, profile.lead_id)
    }
    const seen = new Set<string>()

    return input
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => {
        const url = parseSocialUrl(line, fallbackPlatform)
        const label = PLATFORM_LABELS[url?.platform ?? ''] ?? '?'
        const tag = PLATFORM_TAGS[url?.platform ?? ''] ?? '?'
        if (!url) {
          return { tag: '?', handle: line, detail: 'No platform named in this line', result: 'Pick a platform', tone: 'warn' as const, kind: 'skip' as const, url: '' }
        }
        const key = socialProfileKey(url.platform, url.profileUrl)
        if (seen.has(key)) {
          return { tag, handle: `@${url.handle}`, detail: `${label} · same URL appears earlier in the list`, result: 'Duplicate', tone: 'skip' as const, kind: 'skip' as const, url: url.profileUrl }
        }
        seen.add(key)
        const existingLeadId = knownProfiles.get(key)
        if (existingLeadId) {
          return {
            tag,
            handle: `@${url.handle}`,
            detail: `${label} · already on ${nameById.get(existingLeadId) ?? 'a lead'}`,
            result: 'Already on file',
            tone: 'skip' as const,
            kind: 'skip' as const,
            url: url.profileUrl,
          }
        }
        const leadId = bestLeadFor(matchKey(url.handle), leadKeys, leadIndex)
        if (leadId) {
          return {
            tag,
            handle: `@${url.handle}`,
            detail: `${label} · attaches to ${nameById.get(leadId) ?? 'a lead'}`,
            result: 'Matched',
            tone: 'match' as const,
            kind: 'match' as const,
            url: url.profileUrl,
          }
        }
        const name = readableNameFromHandle(url.handle) || `${label} post`
        return {
          tag,
          handle: `@${url.handle}`,
          detail: `${label} · becomes a new lead named ${name}`,
          result: 'New lead',
          tone: 'new' as const,
          kind: 'new' as const,
          url: url.profileUrl,
        }
      })
  }
  /** The batches and the leads they created, which is what the Website Lookup page reports. */
  importLedger(workspaceId: string): { batches: Record<string, unknown>[]; leads: ImportedLead[] } {
    const batches = this.listImports(workspaceId)
    const leads = this.db.query<ImportedLead>(
      `select l.id, l.name, l.website, l.phone, l.captured_at, l.last_scanned_at,
                (select j.status from enrichment_jobs j where j.workspace_id=l.workspace_id and j.kind='website' and exists (select 1 from json_each(j.lead_ids) ids where ids.value=l.id) order by j.created_at desc, j.rowid desc limit 1) as enrichment_status,
              case when exists (select 1 from lead_contacts c where c.lead_id = l.id and c.kind = 'email') then 1 else 0 end as has_email,
              case when exists (select 1 from social_profiles s where s.lead_id = l.id) then 1 else 0 end as has_social
       from leads l
       where l.workspace_id = ? and l.provider = 'import' and l.website <> ''
       order by l.captured_at desc
       limit 50`,
      [workspaceId],
    )
    return { batches, leads }
  }

  // ---------------------------------------------------------------- coverage

  emailCoverage(workspaceId: string): Record<string, number> | null {
    return this.db.one('select * from email_coverage where workspace_id = ?', [workspaceId])
  }

  emailConfidence(workspaceId: string): { band_from: number; count: number }[] {
    return this.db.query('select band_from, count from email_confidence where workspace_id = ?', [workspaceId])
  }

  socialCoverage(workspaceId: string): { platform: string; profiles: number; leads: number }[] {
    return this.db.query('select platform, profiles, leads from social_coverage where workspace_id = ?', [workspaceId])
  }
}
