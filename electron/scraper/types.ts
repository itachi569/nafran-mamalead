export type RunStatus = 'idle' | 'running' | 'done' | 'failed' | 'cancelled'

export type ProviderId = 'mock' | 'chromium-maps'

export interface ScrapeQuery {
  keywords: string[]
  location: string
  maxResultsPerKeyword: number
  /** Server-approved ceiling for the whole run; null means no plan ceiling. */
  maxResultsTotal?: number | null
  language: string
  region: string
  headless: boolean
  detail: boolean
  minDelayMs: number
  maxDelayMs: number
  /**
   * A browser executable to drive instead of Playwright's bundled Chromium.
   *
   * Empty means the bundled build.
   */
  executablePath: string
  /**
   * Reuse the saved Google profile this app signed in with, instead of a throwaway one.
   *
   * Off is a brand-new profile per run: no account is ever present, so the moment a run meets
   * Google's account chooser there is nothing in it to choose. On keeps those cookies, so the
   * account picked in the sign-in window is still signed in on every later run.
   */
  savedProfile: boolean
  /**
   * Absolute path of the saved profile, resolved by the main process.
   *
   * The window asks for `savedProfile`; only the desktop shell knows where its own profile folder
   * lives. Empty means a throwaway profile.
   */
  profileDir: string
}

export interface Lead {
  id: string
  name: string
  category: string
  address: string
  area: string
  postcode: string
  phone: string
  website: string
  rating: number | null
  reviewCount: number | null
  latitude: number | null
  longitude: number | null
  placeRef: string
  mapsUrl: string
  query: string
  keyword: string
  provider: ProviderId
  capturedAt: string
}

export interface RunProgress {
  runId: string
  status: RunStatus
  provider: ProviderId
  keyword: string
  keywordIndex: number
  keywordTotal: number
  found: number
  target: number
  message: string
  at: string
  /** The place this update just captured, when it captured one. The window plots these live. */
  lead?: Lead
}

export interface RunSummary {
  runId: string
  status: RunStatus
  provider: ProviderId
  query: ScrapeQuery
  leads: Lead[]
  startedAt: string
  finishedAt: string
  durationMs: number
  error: string | null
}

export interface StartRunRequest {
  provider?: ProviderId
  query: Partial<ScrapeQuery>
}

export const DEFAULT_QUERY: ScrapeQuery = {
  keywords: [],
  location: 'Manchester, United Kingdom',
  maxResultsPerKeyword: 20,
  maxResultsTotal: null,
  language: 'en',
  region: 'uk',
  headless: false,
  detail: true,
  minDelayMs: 900,
  maxDelayMs: 2100,
  executablePath: '',
  savedProfile: false,
  profileDir: '',
}

export const HARD_LIMITS = {
  maxKeywords: 8,
  maxResultsPerKeyword: 200,
  minDelayMs: 250,
  maxDelayMs: 10000,
} as const

export function normaliseQuery(input: Partial<ScrapeQuery> = {}): ScrapeQuery {
  const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, Math.round(value)))
  const keywords = (input.keywords ?? DEFAULT_QUERY.keywords)
    .map((k) => String(k).trim())
    .filter(Boolean)
    .slice(0, HARD_LIMITS.maxKeywords)
  return {
    keywords,
    location: String(input.location ?? DEFAULT_QUERY.location).trim() || DEFAULT_QUERY.location,
    maxResultsPerKeyword: clamp(input.maxResultsPerKeyword ?? DEFAULT_QUERY.maxResultsPerKeyword, 1, HARD_LIMITS.maxResultsPerKeyword),
    maxResultsTotal: input.maxResultsTotal == null ? null : clamp(input.maxResultsTotal, 1, HARD_LIMITS.maxKeywords * HARD_LIMITS.maxResultsPerKeyword),
    language: String(input.language ?? DEFAULT_QUERY.language).trim() || DEFAULT_QUERY.language,
    region: String(input.region ?? DEFAULT_QUERY.region).trim() || DEFAULT_QUERY.region,
    headless: Boolean(input.headless ?? DEFAULT_QUERY.headless),
    detail: Boolean(input.detail ?? DEFAULT_QUERY.detail),
    minDelayMs: clamp(input.minDelayMs ?? DEFAULT_QUERY.minDelayMs, HARD_LIMITS.minDelayMs, HARD_LIMITS.maxDelayMs),
    maxDelayMs: clamp(input.maxDelayMs ?? DEFAULT_QUERY.maxDelayMs, HARD_LIMITS.minDelayMs, HARD_LIMITS.maxDelayMs),
    executablePath: String(input.executablePath ?? DEFAULT_QUERY.executablePath).trim(),
    savedProfile: Boolean(input.savedProfile ?? DEFAULT_QUERY.savedProfile),
    // Never taken from the caller: a run only ever opens the profile the main process resolved for
    // it, so a hand-written request cannot point a run at some other folder on the machine.
    profileDir: input.savedProfile ? String(input.profileDir ?? '').trim() : '',
  }
}

export function isAbortError(error: unknown): boolean {
  return error instanceof Error && (error.name === 'AbortError' || /aborted/i.test(error.message))
}
