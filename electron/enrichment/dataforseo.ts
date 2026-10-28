// The deep pass: searching for a business's decision makers and reading the addresses out of the
// results.
//
// The app's own enrichment reads a lead's website, which costs nothing and finds what that site
// publishes. This is the paid half: a Google search through DataForSEO first names the founder or
// owner, then a depth-10 search looks for that person's mailbox. The design calls it "Deep Enrich".
//
// Two things are deliberate here:
//
//   * The credential never reaches this file from the disk. The window holds it — it is the user's,
//     entered in Settings — and hands it over for the length of a run. Nothing in the main process
//     writes it anywhere, so the app cannot leak a key it does not keep.
//
//   * A search result is somebody else's claim, not a fact. What comes back is a list of candidate
//     addresses with the text they were found in, and the app files them as suggestions to confirm.
//     Reading a snippet is not the same as the business telling you who works there.
import { knownLocale } from '../scraper/location'
import { extractEmailsFromResult, extractPeopleFromResult, type ExtractedEmail } from './email-extractor'

const API_ROOT = 'https://api.dataforseo.com/v3'

/** Where the search should look as though it were made from. */
export interface SearchLocation {
  /** DataForSEO's own name for the place, such as "United Kingdom" or "Pakistan". */
  location: string
  /** The Google domain to search, such as google.co.uk or google.com.pk. */
  domain: string
  language: string
}

/**
 * The Google a country is searched on.
 *
 * The key is the same `gl` the Maps worker uses. The value is DataForSEO's location name and the
 * Google domain people in that country actually see, which is what a top-10 snippet is drawn from.
 */
const MARKETS: Record<string, SearchLocation> = {
  uk: { location: 'United Kingdom', domain: 'google.co.uk', language: 'en' },
  pk: { location: 'Pakistan', domain: 'google.com.pk', language: 'en' },
  in: { location: 'India', domain: 'google.co.in', language: 'en' },
  ae: { location: 'United Arab Emirates', domain: 'google.ae', language: 'en' },
  sa: { location: 'Saudi Arabia', domain: 'google.com.sa', language: 'en' },
  bd: { location: 'Bangladesh', domain: 'google.com.bd', language: 'en' },
  us: { location: 'United States', domain: 'google.com', language: 'en' },
  ca: { location: 'Canada', domain: 'google.ca', language: 'en' },
  au: { location: 'Australia', domain: 'google.com.au', language: 'en' },
  ie: { location: 'Ireland', domain: 'google.ie', language: 'en' },
  de: { location: 'Germany', domain: 'google.de', language: 'de' },
  fr: { location: 'France', domain: 'google.fr', language: 'fr' },
  es: { location: 'Spain', domain: 'google.es', language: 'es' },
  it: { location: 'Italy', domain: 'google.it', language: 'it' },
  nl: { location: 'Netherlands', domain: 'google.nl', language: 'nl' },
  tr: { location: 'Turkey', domain: 'google.com.tr', language: 'tr' },
  my: { location: 'Malaysia', domain: 'google.com.my', language: 'en' },
  sg: { location: 'Singapore', domain: 'google.com.sg', language: 'en' },
  za: { location: 'South Africa', domain: 'google.co.za', language: 'en' },
  qa: { location: 'Qatar', domain: 'google.com.qa', language: 'en' },
  kw: { location: 'Kuwait', domain: 'google.com.kw', language: 'en' },
  om: { location: 'Oman', domain: 'google.com.om', language: 'en' },
  bh: { location: 'Bahrain', domain: 'google.com.bh', language: 'en' },
}

/** The defaults: a lead that names no country is searched the way the rest of the app is, in the UK. */
export const DEFAULT_LOCATION: SearchLocation = MARKETS.uk

export interface DeepSearchResult {
  query: string
  emails: ExtractedEmail[]
  /** What the task cost, in US dollars, as DataForSEO reports it. */
  cost: number
  error: string | null
}

/** A founder/owner candidate found in the first, people-focused SERP. */
export interface OwnerCandidate {
  fullName: string
  title: string
  source: string
  url: string
}

export interface OwnerSearchResult {
  query: string
  owners: OwnerCandidate[]
  /** The cost of the owner search plus the follow-up mailbox searches. */
  cost: number
  error: string | null
}

/** What a credential check answers. */
export interface KeyCheck {
  ok: boolean
  /** The balance DataForSEO reports, when the key works. */
  balance: number | null
  /** Why it failed, in words the Settings row can show. */
  note: string
}

/** The task statuses DataForSEO uses while a queued task is still waiting. */
const PENDING_STATUS = new Set([40601, 40602, 40603])
const DEFAULT_WAIT_MS = 90_000
const DEFAULT_QUEUED_RETRIES = 2

type SerpTask = { status_code?: number; cost?: number; result?: unknown[] }

export interface OrganicSearchHit { title: string; description: string; url: string }
const liveResultCache = new Map<string, OrganicSearchHit[]>()
// Live responses are normally much faster, but a 10s cutoff discarded otherwise valid searches
// during provider latency spikes. The caller has a separate end-to-end budget for source checks.
const LIVE_REQUEST_TIMEOUT_MS = 15_000

/** Foreground owner lookups need completed search results, not an abandoned Standard task. */
export async function searchOrganicLive(
  key: string,
  query: string,
  where: SearchLocation = DEFAULT_LOCATION,
  signal?: AbortSignal,
): Promise<{ hits: OrganicSearchHit[]; cost: number; error: string | null }> {
  const empty = { hits: [] as OrganicSearchHit[], cost: 0, error: null as string | null }
  if (!key.trim() || !query.trim()) return { ...empty, error: 'A search credential and query are required.' }
  signal?.throwIfAborted()
  const id = cacheKey(query, where)
  const cached = liveResultCache.get(id)
  if (cached) return { ...empty, hits: cached.map(hit => ({ ...hit })) }
  try {
    const body = await call('/serp/google/organic/live/advanced', key.trim(), {
      method: 'POST', signal,
      body: JSON.stringify([{ keyword: query, location_name: where.location, language_code: where.language,
        se_domain: where.domain, device: 'desktop', depth: 10, load_async_ai_overview: false }]),
    }, LIVE_REQUEST_TIMEOUT_MS) as { tasks?: { status_code?: number; status_message?: string; cost?: number; result?: {items?: unknown[]}[] }[] }
    const task = body.tasks?.[0], cost = task?.cost ?? 0
    if (!task || task.status_code !== 20000) return { ...empty, cost, error: task?.status_message || 'The live search could not finish.' }
    const hits: OrganicSearchHit[] = []
    const visit = (value: unknown): void => {
      if (Array.isArray(value)) { value.forEach(visit); return }
      if (!value || typeof value !== 'object') return
      const item = value as Record<string, unknown>
      if (typeof item.url === 'string' && /^https?:\/\//i.test(item.url) && typeof item.title === 'string') {
        hits.push({ title: item.title, description: String(item.description ?? item.snippet ?? ''), url: item.url })
      }
      if (Array.isArray(item.items)) item.items.forEach(visit)
    }
    visit(task.result)
    const unique = [...new Map(hits.map(hit => [hit.url, hit])).values()].slice(0, 10)
    if (liveResultCache.size >= CACHE_LIMIT) liveResultCache.delete(liveResultCache.keys().next().value!)
    liveResultCache.set(id, unique.map(hit => ({ ...hit })))
    return { hits: unique, cost, error: null }
  } catch (error) {
    // Preserve the caller's reason: an overall deadline is not the user's Stop action.
    signal?.throwIfAborted()
    return { ...empty, error: error instanceof Error && error.name === 'AbortError' ? 'The search provider did not respond within 15 seconds. Retry this website.' : error instanceof Error ? error.message : 'The live search could not finish.' }
  }
}

/**
 * Collects one already-posted task without posting a second paid task when the queue is slow.
 * DataForSEO can legitimately leave a Standard task in one of its pending states for longer than
 * the first polling window. A retry here means another collection window for the same task id,
 * with a short backoff, so a batch does not record a false queued error or double-charge a search.
 */
async function collectTask(
  key: string,
  taskId: string,
  waitMs: number,
  queuedRetries: number,
  signal?: AbortSignal,
): Promise<{ task: SerpTask | null; cost: number; queued: boolean }> {
  let cost = 0
  for (let attempt = 0; attempt <= queuedRetries; attempt += 1) {
    const deadline = Date.now() + waitMs
    while (Date.now() < deadline) {
      signal?.throwIfAborted()
      const got = (await call(`/serp/google/organic/task_get/advanced/${taskId}`, key, { method: 'GET', signal })) as {
        tasks?: SerpTask[]
      }
      const settled = got.tasks?.[0] ?? null
      if (settled?.cost) cost += settled.cost
      const status = settled?.status_code ?? 0
      if (!PENDING_STATUS.has(status)) return { task: settled, cost, queued: false }
      await new Promise((resolve) => setTimeout(resolve, 1500))
    }

    if (attempt < queuedRetries) {
      await new Promise((resolve) => setTimeout(resolve, Math.min(5000, 1500 * 2 ** attempt)))
    }
  }
  return { task: null, cost, queued: true }
}

/**
 * Results already paid for in this process, keyed by the search that bought them.
 *
 * The same business searched twice — a second deep pass, two leads with the same name and town —
 * is the same Google page. Paying for it again does not change the snippets. The cache lives only
 * as long as the app does, and a failed search is never stored, so a rejected key is not remembered
 * as an empty result.
 */
const resultCache = new Map<string, DeepSearchResult>()
const CACHE_LIMIT = 400

function cacheKey(query: string, where: SearchLocation): string {
  return [query.trim().toLowerCase(), where.location, where.domain, where.language, 'desktop'].join('|')
}

/**
 * One request against the API.
 *
 * The credential is a Base64-encoded `login:password` pair, which is exactly what HTTP Basic auth
 * wants in its header, so it is passed through rather than decoded and re-encoded.
 */
async function call(path: string, key: string, init: RequestInit = {}, timeoutMs = 30_000): Promise<unknown> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(`${API_ROOT}${path}`, {
      ...init,
      signal: AbortSignal.any([controller.signal,...(init.signal?[init.signal]:[])]),
      headers: {
        Authorization: `Basic ${key}`,
        'Content-Type': 'application/json',
        ...(init.headers ?? {}),
      },
    })
    const body = (await response.json()) as { status_code?: number; status_message?: string; tasks?: unknown[] }
    if (!response.ok || (body.status_code && body.status_code >= 40000)) {
      throw new Error(body.status_message || `DataForSEO answered ${response.status}.`)
    }
    return body
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Checks a credential without running a search.
 *
 * The user-data endpoint reports the account's balance and costs nothing, which makes it the right
 * thing to press a key against: Settings can say whether the key works and what is left on it
 * before a single search is paid for.
 */
export async function checkKey(key: string): Promise<KeyCheck> {
  const trimmed = key.trim()
  if (!trimmed) return { ok: false, balance: null, note: 'No key saved.' }
  try {
    const body = (await call('/appendix/user_data', trimmed, { method: 'GET' }, 15_000)) as {
      tasks?: { result?: { money?: { balance?: number } }[] }[]
    }
    const balance = body.tasks?.[0]?.result?.[0]?.money?.balance
    return {
      ok: true,
      balance: typeof balance === 'number' ? balance : null,
      note: typeof balance === 'number' ? `Working · $${balance.toFixed(2)} left` : 'Working',
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The key could not be checked.'
    // A rejected credential is the one failure worth naming, because it is the one a person fixes.
    if (/401|403|authoriz|credential/i.test(message)) return { ok: false, balance: null, note: 'Rejected — check the key.' }
    if (/abort/i.test(message)) return { ok: false, balance: null, note: 'No answer — check this machine’s connection.' }
    return { ok: false, balance: null, note: message.slice(0, 90) }
  }
}

/**
 * Searches once and reads the addresses out of the result.
 *
 * The Standard queue is used rather than the Live endpoint because a deep pass runs in the
 * background over many leads: it is half the price, and the half-second or so it takes to come back
 * through the queue is time nobody is waiting on. The task is queued, then collected by id.
 */
export async function searchEmails(
  key: string,
  query: string,
  where: SearchLocation = DEFAULT_LOCATION,
  options: { waitMs?: number; queuedRetries?: number; signal?: AbortSignal } = {},
): Promise<DeepSearchResult> {
  const empty = { query, emails: [], cost: 0 }
  const trimmed = key.trim()
  if (!trimmed) return { ...empty, error: 'No DataForSEO key is saved. Add one in Settings → Account.' }
  if (!query.trim()) return { ...empty, error: 'Nothing to search for.' }

  const cached = resultCache.get(cacheKey(query, where))
  if (cached) return { ...cached, emails: cached.emails.map((email) => ({ ...email })), cost: 0 }

  try {
    const posted = (await call('/serp/google/organic/task_post', trimmed, {
      method: 'POST',
      signal: options.signal,
      body: JSON.stringify([
        {
          keyword: query,
          location_name: where.location,
          language_code: where.language,
          se_domain: where.domain,
          device: 'desktop',
          // Ten results, Standard queue, no AI Overview. That is the low-cost search: the addresses
          // that matter are in the top few, and an overview would charge again for text the
          // extractor already reads when a result happens to carry it.
          depth: 10,
          priority: 1,
          load_async_ai_overview: false,
        },
      ]),
    })) as { tasks?: { id?: string; cost?: number }[] }

    const task = posted.tasks?.[0]
    if (!task?.id) return { ...empty, error: 'DataForSEO accepted the search but returned no task.' }
    const collected = await collectTask(
      trimmed,
      task.id,
      options.waitMs ?? DEFAULT_WAIT_MS,
      options.queuedRetries ?? DEFAULT_QUEUED_RETRIES,
      options.signal,
    )
    const cost = (task.cost ?? 0) + collected.cost
    if (collected.queued) return { query, emails: [], cost, error: 'The search is still queued at DataForSEO.' }
    const status = collected.task?.status_code ?? 0
    // Anything outside the success band is a failed task. Caching it would make the next pass
    // believe the business had simply published nothing.
    if (status < 20000 || status >= 30000) {
      return { query, emails: [], cost, error: 'DataForSEO could not finish the search.' }
    }
    const emails = extractEmailsFromResult(collected.task?.result ?? [], 12)
    const done: DeepSearchResult = { query, emails, cost, error: null }
    remember(cacheKey(query, where), done)
    return done
  } catch (error) {
    return { ...empty, error: error instanceof Error ? error.message : 'The search could not be made.' }
  }
}

/** Searches the top ten Google results for a named founder or owner. */
export async function searchOwnerCandidates(
  key: string,
  query: string,
  where: SearchLocation = DEFAULT_LOCATION,
  options: { waitMs?: number; queuedRetries?: number; signal?: AbortSignal } = {},
): Promise<{ query: string; owners: OwnerCandidate[]; cost: number; error: string | null }> {
  const empty = { query, owners: [], cost: 0, error: null as string | null }
  const trimmed = key.trim()
  if (!trimmed) return { ...empty, error: 'No DataForSEO key is saved. Add one in Settings → Account.' }
  if (!query.trim()) return { ...empty, error: 'Nothing to search for.' }

  try {
    const posted = (await call('/serp/google/organic/task_post', trimmed, {
      method: 'POST',
      signal: options.signal,
      body: JSON.stringify([
        {
          keyword: query,
          location_name: where.location,
          language_code: where.language,
          se_domain: where.domain,
          device: 'desktop',
          depth: 10,
          priority: 1,
          load_async_ai_overview: false,
        },
      ]),
    })) as { tasks?: { id?: string; cost?: number }[] }

    const task = posted.tasks?.[0]
    if (!task?.id) return { ...empty, error: 'DataForSEO accepted the search but returned no task.' }
    const collected = await collectTask(
      trimmed,
      task.id,
      options.waitMs ?? DEFAULT_WAIT_MS,
      options.queuedRetries ?? DEFAULT_QUEUED_RETRIES,
      options.signal,
    )
    const cost = (task.cost ?? 0) + collected.cost
    if (collected.queued) return { ...empty, cost, error: 'The search is still queued at DataForSEO.' }
    const status = collected.task?.status_code ?? 0
    if (status < 20000 || status >= 30000) return { ...empty, cost, error: 'DataForSEO could not finish the search.' }
    const owners = extractPeopleFromResult(collected.task?.result ?? [], 5)
    return { query, owners, cost, error: null }
  } catch (error) {
    return { ...empty, error: error instanceof Error ? error.message : 'The search could not be made.' }
  }
}

/** Keeps a paid result, and forgets the oldest one once the process has remembered enough. */
function remember(key: string, result: DeepSearchResult): void {
  if (resultCache.size >= CACHE_LIMIT) {
    const oldest = resultCache.keys().next().value
    if (oldest) resultCache.delete(oldest)
  }
  resultCache.set(key, result)
}

/**
 * The search a lead is worth.
 *
 * The runbook's own shape is "<who> email address": the business's name, its town when one was
 * captured, and those two words. Nothing is added about a person the lead does not name, so a
 * search that finds nothing means nothing was published.
 */
export function queryForLead(lead: { name: string; area?: string }): string {
  const name = lead.name.trim()
  const place = (lead.area ?? '').trim()
  return place ? `${name} ${place} email address` : `${name} email address`
}

/** The first search in the two-step pass: identify the person before looking for a mailbox. */
export function queryForOwner(lead: { name: string; area?: string }): string {
  const name = lead.name.trim()
  const place = (lead.area ?? '').trim()
  return place ? `${name} founder owner ${place}` : `${name} founder owner`
}

/** The second search is tied to the named person and the company, with ten SERP results. */
export function queryForOwnerEmail(lead: { name: string; area?: string }, owner: { fullName: string }): string {
  const person = owner.fullName.trim()
  const name = lead.name.trim()
  const place = (lead.area ?? '').trim()
  return place ? `${person} ${name} ${place} email address` : `${person} ${name} email address`
}

/**
 * The Google the lead should be searched on.
 *
 * A Lahore clinic is searched as Pakistan on google.com.pk, a Manchester one as the United Kingdom
 * on google.co.uk. The town is trusted first, then the address. A town this app does not know stays
 * on the default rather than being guessed into the wrong country.
 */
export function locationForLead(lead: { area?: string; address?: string }): SearchLocation {
  const known = knownLocale((lead.area ?? '').trim()) ?? knownLocale((lead.address ?? '').trim())
  if (!known) return DEFAULT_LOCATION
  return MARKETS[known.region] ?? { ...DEFAULT_LOCATION, language: known.language }
}
