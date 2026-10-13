// Service layer for the Social Profiles page.
//
// Every read and write goes to the local SQLite database through the preload bridge. The shapes
// returned here are the ones the page already consumed, so the hook above it did not change when
// the storage moved. Outside Electron there is no database, the caller falls back to the
// reference sample rows, and every function here still returns something sane.
import type { LocalApi, StoredLead } from '../types/desktop'

type Db = LocalApi

export type SocialPlatform = 'instagram' | 'facebook' | 'linkedin' | 'tiktok' | 'youtube' | 'x' | 'other'

const PLATFORMS: SocialPlatform[] = ['instagram', 'facebook', 'linkedin', 'tiktok', 'youtube', 'x', 'other']

export interface SocialProfile {
  id: string
  leadId: string
  platform: SocialPlatform
  handle: string
  profileUrl: string
  followers: number | null
  verified: boolean
  source: string
  discoveredAt: string
  checkedAt: string | null
}

export interface SocialRow {
  leadId: string
  index: string
  name: string
  domain: string
  area: string
  status: 'done' | 'pending'
  profiles: SocialProfile[]
}

export interface SocialDonut {
  platform: SocialPlatform
  label: string
  short: string
  count: number
  pct: string
  offset: string
}

export interface SocialExtra {
  platform: SocialPlatform
  label: string
  short: string
  count: number
  width: string
}

export interface SocialPageData {
  rows: SocialRow[]
  total: number
  donuts: SocialDonut[]
  extras: SocialExtra[]
}

export interface SocialProfileInput {
  leadId: string
  platform: SocialPlatform
  handle?: string
  profileUrl?: string
  followers?: number | null
  verified?: boolean
  source?: string
}

const PLATFORM_META: Record<SocialPlatform, { label: string; short: string }> = {
  instagram: { label: 'Instagram', short: 'ig' },
  facebook: { label: 'Facebook', short: 'f' },
  linkedin: { label: 'LinkedIn', short: 'in' },
  tiktok: { label: 'TikTok', short: 'tt' },
  youtube: { label: 'YouTube', short: 'yt' },
  x: { label: 'Twitter / X', short: 'x' },
  other: { label: 'Other', short: '··' },
}

export const DONUT_PLATFORMS: SocialPlatform[] = ['instagram', 'facebook', 'linkedin']
export const EXTRA_PLATFORMS: SocialPlatform[] = ['youtube', 'tiktok', 'x']

/** Chip label and short code used by the profile chips, matching the reference design. */
export function platformMeta(platform: SocialPlatform): { label: string; short: string } {
  return PLATFORM_META[platform] ?? { label: 'Other', short: '··' }
}

const DONUT_CIRCUMFERENCE = 276.5

/** The host of a website, which is what the profile rows show as the domain. */
function domainOf(website: string): string {
  if (!website) return ''
  try {
    return new URL(website).host.replace(/^www\./i, '')
  } catch {
    return website.replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0]
  }
}

function toProfile(row: Record<string, unknown>): SocialProfile {
  return {
    id: String(row.id),
    leadId: String(row.lead_id),
    platform: row.platform as SocialPlatform,
    handle: String(row.handle ?? ''),
    profileUrl: String(row.profile_url ?? ''),
    followers: row.followers === null || row.followers === undefined ? null : Number(row.followers),
    verified: Number(row.verified ?? 0) === 1,
    source: String(row.source ?? ''),
    discoveredAt: String(row.discovered_at ?? ''),
    checkedAt: row.checked_at ? String(row.checked_at) : null,
  }
}

/**
 * Leads with the social profiles found for them. The status is derived rather than stored: a
 * lead is done once it has a profile or a finished pass has covered it, and pending otherwise.
 */
export async function fetchSocialRows(
  db: Db,
  options: { limit?: number; offset?: number } = {},
): Promise<{ rows: SocialRow[]; total: number }> {
  const limit = Math.min(200, Math.max(1, options.limit ?? 50))
  const offset = Math.max(0, options.offset ?? 0)

  const { rows: leadRows, total } = await db.leads.list({ limit, offset })
  if (!leadRows.length) return { rows: [], total }

  const leadIds = leadRows.map((lead) => lead.id)
  const [profiles, covered] = await Promise.all([db.social.list(leadIds), db.jobs.covered('social', ['done'])])

  const done = new Set(covered)
  const byLead = new Map<string, SocialProfile[]>()
  for (const row of profiles) {
    const profile = toProfile(row)
    const list = byLead.get(profile.leadId) ?? []
    list.push(profile)
    byLead.set(profile.leadId, list)
  }

  const rows: SocialRow[] = leadRows.map((lead: StoredLead, position: number) => {
    const found = byLead.get(lead.id) ?? []
    return {
      leadId: lead.id,
      index: String(offset + position + 1).padStart(3, '0'),
      name: lead.name,
      domain: domainOf(lead.website) || 'No website found',
      area: lead.area,
      status: found.length || done.has(lead.id) ? 'done' : 'pending',
      profiles: found,
    }
  })
  return { rows, total }
}

/** Aggregated platform totals for the coverage donuts and the secondary platform list. */
export async function fetchSocialCoverage(
  db: Db,
  totalLeads: number,
): Promise<{ donuts: SocialDonut[]; extras: SocialExtra[] }> {
  const data = await db.coverage.social()
  const counts = new Map<SocialPlatform, number>()
  for (const row of data) counts.set(row.platform as SocialPlatform, row.leads)

  const denominator = Math.max(1, totalLeads)
  const largest = Math.max(1, ...EXTRA_PLATFORMS.map((platform) => counts.get(platform) ?? 0))

  const donuts = DONUT_PLATFORMS.map((platform) => {
    const count = counts.get(platform) ?? 0
    const share = Math.min(1, count / denominator)
    return {
      platform,
      label: PLATFORM_META[platform].label,
      short: PLATFORM_META[platform].short,
      count,
      pct: String(Math.round(share * 100)),
      offset: String(Math.round(DONUT_CIRCUMFERENCE * (1 - share))),
    }
  })

  const extras = EXTRA_PLATFORMS.map((platform) => {
    const count = counts.get(platform) ?? 0
    return {
      platform,
      label: PLATFORM_META[platform].label,
      short: PLATFORM_META[platform].short,
      count,
      width: `${Math.max(count ? 6 : 0, Math.round((count / largest) * 100))}%`,
    }
  })

  return { donuts, extras }
}

export async function fetchSocialPage(db: Db, options: { limit?: number } = {}): Promise<SocialPageData> {
  const { rows, total } = await fetchSocialRows(db, options)
  const { donuts, extras } = await fetchSocialCoverage(db, total)
  return { rows, total, donuts, extras }
}

function validateProfile(input: SocialProfileInput): void {
  if (!PLATFORMS.includes(input.platform)) throw new Error(`"${input.platform}" is not a platform this app stores.`)
  if (!input.handle?.trim() && !input.profileUrl?.trim()) throw new Error('A handle or a profile URL is required.')
  if (input.followers !== undefined && input.followers !== null && input.followers < 0) {
    throw new Error('A follower count cannot be negative.')
  }
}

export async function createSocialProfile(db: Db, input: SocialProfileInput): Promise<{ id: string }> {
  validateProfile(input)
  return db.social.upsert({
    leadId: input.leadId,
    platform: input.platform,
    handle: input.handle ?? '',
    profileUrl: input.profileUrl ?? '',
    followers: input.followers ?? null,
    verified: input.verified ?? false,
    source: input.source ?? 'manual',
  })
}

export async function updateSocialProfile(
  db: Db,
  id: string,
  patch: { handle?: string; profileUrl?: string; followers?: number | null; verified?: boolean },
): Promise<void> {
  if (patch.followers !== undefined && patch.followers !== null && patch.followers < 0) {
    throw new Error('A follower count cannot be negative.')
  }
  await db.social.update(id, patch)
}

export async function deleteSocialProfile(db: Db, id: string): Promise<void> {
  await db.social.remove(id)
}

/**
 * Queues a social enrichment pass. The desktop worker does the crawling; this records the work
 * so the queue survives a restart.
 */
export async function startSocialEnrichment(db: Db, leadIds: string[]): Promise<{ jobId: string; queued: number }> {
  return db.jobs.queue('social', leadIds)
}

/** Leads still missing any social profile, used to size an enrichment pass. */
export async function fetchLeadsMissingSocials(db: Db, limit = 200): Promise<string[]> {
  const { rows } = await fetchSocialRows(db, { limit })
  return rows.filter((row) => row.status === 'pending').map((row) => row.leadId)
}
