import type { BrowserContext } from 'playwright'
import { DEFAULT_QUERY, normaliseQuery, type Lead, type ProviderId, type RunProgress, type RunSummary, type ScrapeQuery } from './types'
import { localeFor } from './location'
import { statusFromError, type ScraperProvider } from './provider'

export interface RunHandle {
  runId: string
  stop: () => void
  result: Promise<RunSummary>
}

export interface RunOptions {
  provider?: ProviderId
  query?: Partial<ScrapeQuery>
  onProgress?: (progress: RunProgress) => void
  onLeads?: (leads: Lead[]) => void
  /**
   * A browser the window already has open, to run in instead of launching one.
   *
   * This is what makes connecting Google and scraping one window rather than two: the window that
   * took the sign-in is handed over here and the run carries on in it. The caller keeps ownership,
   * so the run never closes a browser it did not open.
   */
  context?: BrowserContext
  /** An executable the caller resolved for the browser it opened, so the run matches it. */
  executablePath?: string
}

interface Closable {
  close?: () => Promise<void>
}

let counter = 0

function newRunId(): string {
  counter += 1
  return `run_${Date.now().toString(36)}_${counter}`
}

async function resolveProvider(providerId: ProviderId, context?: BrowserContext): Promise<ScraperProvider> {
  if (providerId === 'chromium-maps') {
    const { ChromiumMapsProvider } = await import('./chromium-maps')
    return new ChromiumMapsProvider(context ? { context } : {})
  }
  const { MockProvider } = await import('./mock')
  return new MockProvider()
}

export class ScrapeRunner {
  private controller: AbortController | null = null
  private activeProvider: ScraperProvider | null = null
  private latest: RunSummary | null = null
  /**
   * Work that happens before there is a run to abort.
   *
   * A run started from the window spends its first moments waiting on Google's sign-in page, and
   * during that wait there is no controller and no provider yet. Stop still has to reach it, or the
   * only way out of a sign-in the user has changed their mind about is to force the app closed.
   */
  private readonly gates = new Set<() => void>()

  get busy(): boolean {
    return this.controller !== null
  }

  get last(): RunSummary | null {
    return this.latest
  }

  replaceLast(summary: RunSummary): void {
    if (this.latest?.runId === summary.runId) this.latest = summary
  }

  onStop(listener: () => void): void {
    this.gates.add(listener)
    this.controller?.signal.addEventListener('abort', listener, { once: true })
  }

  offStop(listener: () => void): void {
    this.gates.delete(listener)
  }

  async stop(): Promise<void> {
    for (const listener of Array.from(this.gates)) {
      this.gates.delete(listener)
      try {
        listener()
      } catch {
        // A gate that throws on the way out must not stop the run itself being cancelled.
      }
    }
    this.controller?.abort()
    const provider = this.activeProvider as unknown as Closable | null
    await provider?.close?.().catch(() => undefined)
    this.controller = null
    this.activeProvider = null
  }

  async providers(): Promise<{ id: ProviderId; label: string; requiresBrowser: boolean }[]> {
    const list = await Promise.all([resolveProvider('chromium-maps'), resolveProvider('mock')])
    return list.map((provider) => ({ id: provider.id, label: provider.label, requiresBrowser: provider.requiresBrowser }))
  }

  start(options: RunOptions = {}): RunHandle {
    const runId = newRunId()
    // The window sends keywords, location and a result cap, and nothing about language or region.
    // Those default to the United Kingdom, which meant every search — Lahore, Karachi, anywhere —
    // was sent to Google as `gl=uk` with UK-biased rankings. They follow the location instead,
    // while an explicit request from a caller that does set them still wins.
    const requested = options.query ?? {}
    const locale = localeFor(String(requested.location ?? DEFAULT_QUERY.location))
    // An absent key must not erase a default: the window sends no `language`, and spreading a
    // present-but-undefined value would take the renderer's field with it.
    const given = Object.fromEntries(Object.entries(requested).filter(([, value]) => value !== undefined))
    const query = normaliseQuery({
      ...DEFAULT_QUERY,
      ...locale,
      ...given,
      // The window that opened the browser is the one that knows which program it opened, so an
      // executable handed in with it wins. Nothing else about the query is affected.
      ...(options.executablePath ? { executablePath: options.executablePath } : {}),
    })
    const providerId = options.provider ?? 'mock'
    const startedAt = new Date().toISOString()
    const started = Date.now()
    const controller = new AbortController()
    this.controller = controller

    const emit = (
      status: RunProgress['status'],
      message: string,
      found: number,
      extra: Partial<RunProgress> = {},
    ): void => {
      options.onProgress?.({
        runId,
        status,
        provider: providerId,
        keyword: query.keywords[0] ?? '',
        keywordIndex: 0,
        keywordTotal: query.keywords.length,
        found,
        target: Math.min(query.maxResultsTotal ?? Infinity, query.maxResultsPerKeyword * query.keywords.length),
        message,
        at: new Date().toISOString(),
        ...extra,
      })
    }

    const result = (async (): Promise<RunSummary> => {
      const collected: Lead[] = []
      let error: string | null = null
      let status: RunSummary['status'] = 'done'
      try {
        if (!query.keywords.length) throw new Error('Add at least one keyword before starting a run.')
        const provider = await resolveProvider(providerId, options.context)
        this.activeProvider = provider
        emit('running', `${provider.label} starting · ${query.keywords.length} keyword${query.keywords.length === 1 ? '' : 's'}`, 0)
        const providerLeads = await provider.run(
          query,
          (progress) => {
            if (progress.lead) collected.push(progress.lead)
            options.onProgress?.({
              runId,
              provider: providerId,
              keyword: progress.keyword ?? query.keywords[progress.keywordIndex ?? 0] ?? '',
              keywordIndex: progress.keywordIndex ?? 0,
              keywordTotal: progress.keywordTotal ?? query.keywords.length,
              found: collected.length,
              target: progress.target ?? Math.min(query.maxResultsTotal ?? Infinity, query.maxResultsPerKeyword * query.keywords.length),
              status: progress.status ?? 'running',
              at: new Date().toISOString(),
              message: progress.message,
              // Carried through so the window can pin each place as it lands instead of waiting for
              // the whole run to finish.
              lead: progress.lead,
            })
          },
          controller.signal,
        )
        if (!collected.length) collected.push(...providerLeads)
        options.onLeads?.(collected)
        emit('done', `Finished · ${collected.length} lead${collected.length === 1 ? '' : 's'} captured`, collected.length)
      } catch (caught) {
        status = statusFromError(caught)
        error = caught instanceof Error ? caught.message : String(caught)
        const hint = (caught as { hint?: string }).hint
        if (hint) error = `${error} ${hint}`
        emit(status, error, collected.length)
      } finally {
        this.controller = null
        this.activeProvider = null
      }
      const finishedAt = new Date().toISOString()
      const summary: RunSummary = {
        runId,
        status,
        provider: providerId,
        query,
        leads: collected,
        startedAt,
        finishedAt,
        durationMs: Date.now() - started,
        error,
      }
      this.latest = summary
      return summary
    })()

    return { runId, stop: () => void this.stop(), result }
  }
}
