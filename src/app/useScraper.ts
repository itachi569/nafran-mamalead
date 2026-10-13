// Bridge between the ported shell and the Chromium Google Maps worker.
//
// In the desktop app every run is a real run: the worker drives Chromium, streams progress over
// IPC and returns captured leads, which the main process has already written to the local
// database by the time this hears about them. That is why the page can be reloaded, or the app
// restarted, and still show every lead ever captured.
//
// Outside Electron (a plain browser tab) the reference app's own timing is used instead, so the
// interface stays demonstrable without the desktop shell.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { localDb } from '../lib/local'
import type { Lead, StoredLead } from '../types/desktop'

type Phase = 'idle' | 'run'

export interface StartOptions {
  keywords: string[]
  location: string
  maxResultsPerKeyword: number
  headless: boolean
  /** Randomised wait between visiting each place, in milliseconds. */
  minDelayMs?: number
  maxDelayMs?: number
  /** A browser executable to drive instead of the bundled Chromium. */
  executablePath?: string
  /** Start from the profile the Google sign-in window saved, instead of a throwaway one. */
  savedProfile?: boolean
  /**
   * Connect Google before scraping, in the app's own browser.
   *
   * This is the run button's path. The main process checks the saved profile, opens the app's own
   * browser when it holds no account, waits for the user to sign in, and then runs in that same
   * window — so a run never starts from a profile Google has never seen, and never needs a second
   * browser. Outside the desktop app there is nothing to connect, so the flag is ignored.
   */
  requireGoogle?: boolean
  /**
   * Every area the leads on file came from, most recent first. The ledger spans more than one run,
   * so the map's caption names all of them rather than only the area searched last.
   */
  locations?: string[]
}

export interface ScrapeSnapshot {
  running: boolean
  found: number
  /** The database's full lead count; `leads` holds only the recent preview. */
  total: number
  /** Changes after each database refresh, including updates to existing leads. */
  revision: number
  /** What this run set out to collect: keywords × results per keyword. 0 before anything runs. */
  target: number
  leads: Lead[]
  message: string
  error: string | null
  stSocial: Phase
  stEmail: Phase
  stPhone: Phase
  request: StartOptions | null
  durationMs: number
  activityAt: string | null
}

const INITIAL: ScrapeSnapshot = {
  running: false,
  found: 8,
  total: 0,
  revision: 0,
  target: 0,
  leads: [],
  message: '',
  error: null,
  stSocial: 'idle',
  stEmail: 'idle',
  stPhone: 'idle',
  request: null,
  durationMs: 0,
  activityAt: null,
}

const HEADLESS = import.meta.env.VITE_SCRAPER_HEADLESS !== 'false'

/** Headless Chromium is the default; set VITE_SCRAPER_HEADLESS=false to watch the run. */
export const SCRAPER_HEADLESS = HEADLESS

/** A stored lead reads the same as a captured one, which is what the ledger consumes. */
function storedToLead(row: StoredLead): Lead {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    address: row.address,
    area: row.area,
    postcode: row.postcode,
    phone: row.phone,
    website: row.website,
    rating: row.rating,
    reviewCount: row.review_count,
    latitude: row.latitude,
    longitude: row.longitude,
    placeRef: row.place_ref,
    mapsUrl: row.maps_url,
    query: row.query,
    keyword: row.keyword,
    // The row's own provider, not a guess. An imported website is not a Maps capture, and saying
    // it is puts "Maps" beside a lead no scrape ever produced.
    provider: row.provider === 'mock' || row.provider === 'import' ? row.provider : 'chromium-maps',
    capturedAt: row.captured_at,
    lastScannedAt: row.last_scanned_at ?? null,
  }
}

export function useScraper(): {
  snapshot: ScrapeSnapshot
  start: (options: StartOptions) => void
  stop: () => void
  reload: () => Promise<void>
  desktopAvailable: boolean
} {
  const [snapshot, setSnapshot] = useState<ScrapeSnapshot>(INITIAL)
  const timers = useRef<number[]>([])
  const bridge = typeof window === 'undefined' ? undefined : window.desktop
  const db = useMemo(() => localDb(), [])
  const desktopAvailable = Boolean(bridge)

  const clearTimers = useCallback(() => {
    timers.current.forEach((timer) => window.clearTimeout(timer))
    timers.current = []
  }, [])

  /**
   * Loads what is already on file. This is the read that makes the app local-first: the ledger
   * is filled on launch, before any scrape has run in this session.
   */
  const reloadFromDatabase = useCallback(async () => {
    if (!db) return
    try {
      const [firstPage, runs] = await Promise.all([db.leads.list({ limit: 200 }), db.runs.list(50)])
      const leads = firstPage.rows.map(storedToLead)
      // The maps page names the area it is showing. On a fresh launch nothing has run in this
      // session, so without this the plot would be captioned with the reference's city while the
      // pins below it were the last run's real businesses. The most recent run supplies the area,
      // its keywords and its page size, which is what a re-run should start from.
      const last = runs[0]
      // Runs have been started with "Lahore", "Lahore, Pakistan" and "lahore", all of which are one
      // place. The caption reads a clean list, so each area is reduced to its town and de-duped.
      const areas: string[] = []
      for (const run of runs) {
        const town = (run.location || '').split(',')[0].trim()
        if (!town) continue
        const tidy = town.charAt(0).toUpperCase() + town.slice(1)
        if (!areas.some((seen) => seen.toLowerCase() === tidy.toLowerCase())) areas.push(tidy)
      }
      const lastRequest: StartOptions | null = last
        ? {
            keywords: ((): string[] => {
              try {
                const parsed: unknown = JSON.parse(last.keywords || '[]')
                return Array.isArray(parsed) ? parsed.filter((entry): entry is string => typeof entry === 'string') : []
              } catch {
                return []
              }
            })(),
            location: last.location || 'Manchester',
            locations: areas,
            maxResultsPerKeyword: last.max_results || 25,
            headless: HEADLESS,
          }
        : null
      setSnapshot((current) => ({
        ...current,
        leads,
        total: firstPage.total,
        revision: current.revision + 1,
        found: firstPage.total,
        target: firstPage.total,
        message: firstPage.total
          ? `${firstPage.total} lead${firstPage.total === 1 ? '' : 's'} on file`
          : current.message,
        request:
          current.request ??
          lastRequest ?? {
            keywords: [],
            location: 'Manchester',
            maxResultsPerKeyword: 25,
            headless: HEADLESS,
          },
      }))
    } catch {
      // A read failure leaves the session's own results in place rather than clearing them.
    }
  }, [db])

  useEffect(() => {
    if (!bridge) return
    const offProgress = bridge.scraper.onProgress((progress) => {
      setSnapshot((current) => ({
        ...current,
        running: progress.status === 'running',
        found: progress.found,
        // The worker reports the real ceiling for this run, so the counter cannot run past it.
        target: progress.target || current.target,
        // Each captured place arrives with its own update, which is what lets the running panel
        // and the coverage map pin businesses as they land rather than only at the end. The
        // provider can report the same place more than once, so the list is kept unique.
        leads: progress.lead
          ? current.leads.some((lead) => lead.placeRef && lead.placeRef === progress.lead?.placeRef)
            ? current.leads
            : [...current.leads, progress.lead].slice(-200)
          : current.leads,
        message: progress.message,
        activityAt: progress.at,
        error: progress.status === 'failed' || progress.status === 'cancelled' ? progress.message : current.error,
        stSocial: progress.status === 'running' ? 'run' : 'idle',
        stEmail: progress.status === 'running' ? 'run' : 'idle',
        stPhone: progress.status === 'running' ? 'run' : 'idle',
      }))
    })
    const offDone = bridge.scraper.onDone((summary) => {
      setSnapshot((current) => {
        // The summary holds what this session's run captured, but the ledger also holds earlier
        // runs. Merging keeps the map and the tile counts on the whole file while the run's own
        // places take the newer rows; `reloadFromDatabase` below then re-reads the stored view.
        const merged = [
          ...summary.leads,
          ...current.leads.filter(
            (lead) => !summary.leads.some((fresh) => fresh.placeRef && fresh.placeRef === lead.placeRef),
          ),
        ]
        const total = current.total + (summary.stored?.saved ?? 0)
        return {
          ...current,
          running: false,
          total,
          found: total,
          target: total,
          leads: merged.slice(0, 200),
          message: summary.error
            ? summary.error
            : summary.stored
              ? `Finished · ${summary.stored.saved} new of ${summary.leads.length} captured`
              : `Finished · ${summary.leads.length} lead${summary.leads.length === 1 ? '' : 's'} captured`,
          error: summary.storeError ?? summary.error,
          stSocial: 'idle',
          stEmail: 'idle',
          stPhone: 'idle',
          durationMs: summary.durationMs,
          activityAt: summary.finishedAt,
          request: {
            keywords: summary.query.keywords,
            location: summary.query.location,
            // The run just added to the file, so its area joins the ones the map now covers.
            locations: Array.from(
              new Set(
                [summary.query.location, ...(current.request?.locations ?? [])]
                  .map((area) => (area || '').split(',')[0].trim())
                  .filter(Boolean)
                  .map((town) => town.charAt(0).toUpperCase() + town.slice(1))
                  .filter((town, at, all) => all.findIndex((other) => other.toLowerCase() === town.toLowerCase()) === at),
              ),
            ),
            maxResultsPerKeyword: summary.query.maxResultsPerKeyword,
            headless: summary.query.headless,
          },
        }
      })
      // Re-read so the ledger shows the database's view, including leads stored by earlier runs.
      void reloadFromDatabase()
    })
    void bridge.scraper
      .last()
      .then((last) => {
        if (!last) return
        setSnapshot((current) => ({
          ...current,
          leads: current.leads.length ? current.leads : last.leads.slice(0, 200),
          found: current.total || current.found || last.leads.length,
          target: current.total || current.target || last.leads.length,
          durationMs: last.durationMs,
          activityAt: last.finishedAt,
          request: {
            keywords: last.query.keywords,
            location: last.query.location,
            maxResultsPerKeyword: last.query.maxResultsPerKeyword,
            headless: last.query.headless,
          },
        }))
      })
      .catch(() => undefined)
    return () => {
      offProgress()
      offDone()
    }
  }, [bridge, reloadFromDatabase])

  // Fill the ledger from the database on launch.
  useEffect(() => {
    void reloadFromDatabase()
  }, [reloadFromDatabase])

  useEffect(() => clearTimers, [clearTimers])

  const start = useCallback(
    (options: StartOptions) => {
      clearTimers()
      if (bridge) {
        // The gate needs Google, so a run that asked for it starts from the saved profile whether or
        // not the settings switch is on: a run with no account is the run Google turns away.
        const gated = Boolean(options.requireGoogle) && Boolean(bridge.scraper.runWithGoogle)
        setSnapshot((current) => ({
          ...current,
          running: true,
          found: 0,
          target: 0,
          leads: [],
          message: gated ? 'Checking the Google account this app runs with…' : 'Starting the Chromium worker…',
          error: null,
          stSocial: 'run',
          stEmail: 'run',
          stPhone: 'run',
          request: options,
          durationMs: 0,
          activityAt: new Date().toISOString(),
        }))
        const request = {
          provider: 'chromium-maps' as const,
          query: {
            keywords: options.keywords,
            location: options.location,
            maxResultsPerKeyword: options.maxResultsPerKeyword,
            headless: options.headless,
            minDelayMs: options.minDelayMs,
            maxDelayMs: options.maxDelayMs,
            executablePath: options.executablePath,
            savedProfile: options.savedProfile || gated,
          },
        }
        const call = gated ? bridge.scraper.runWithGoogle(request) : bridge.scraper.start(request)
        void call.catch((error: unknown) => {
          setSnapshot((current) => ({
            ...current,
            running: false,
            error: error instanceof Error ? error.message : 'The run could not be started.',
            message: error instanceof Error ? error.message : 'The run could not be started.',
            stSocial: 'idle',
            stEmail: 'idle',
            stPhone: 'idle',
          }))
        })
        return
      }

      const simulated = options.keywords.length * options.maxResultsPerKeyword
      setSnapshot((current) => ({
        ...current,
        running: true,
        found: 0,
        target: simulated,
        error: null,
        request: options,
        stSocial: 'idle',
        stEmail: 'idle',
        stPhone: 'idle',
      }))
      const at = (delay: number, update: Partial<ScrapeSnapshot>) => {
        timers.current.push(window.setTimeout(() => setSnapshot((current) => ({ ...current, ...update })), delay))
      }
      for (let step = 1; step <= 8; step += 1) at(320 + step * 430, { found: step })
      at(700, { stPhone: 'run' })
      at(1150, { stEmail: 'run' })
      at(1600, { stSocial: 'run' })
      at(2900, { stPhone: 'idle' })
      at(3450, { stEmail: 'idle' })
      at(4000, { stSocial: 'idle' })
      at(4300, { running: false })
    },
    [bridge, clearTimers],
  )

  const stop = useCallback(() => {
    clearTimers()
    if (bridge) void bridge.scraper.stop().catch(() => undefined)
    setSnapshot((current) => ({ ...current, running: false, stSocial: 'idle', stEmail: 'idle', stPhone: 'idle' }))
  }, [bridge, clearTimers])

  const reload = useCallback(() => reloadFromDatabase(), [reloadFromDatabase])

  return { snapshot, start, stop, reload, desktopAvailable }
}
