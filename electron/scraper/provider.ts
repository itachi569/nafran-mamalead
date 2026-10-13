import type { Lead, ProviderId, RunProgress, RunStatus, ScrapeQuery } from './types'

export type ProgressSink = (progress: Partial<RunProgress> & { message: string; lead?: Lead }) => void

export interface ScraperProvider {
  readonly id: ProviderId
  readonly label: string
  readonly requiresBrowser: boolean
  run(query: ScrapeQuery, sink: ProgressSink, signal: AbortSignal): Promise<Lead[]>
}

export class ScraperBlockedError extends Error {
  readonly hint: string
  constructor(message: string, hint: string) {
    super(message)
    this.name = 'ScraperBlockedError'
    this.hint = hint
  }
}

export class ScraperUnavailableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ScraperUnavailableError'
  }
}

export function leadId(name: string, address: string, placeRef: string): string {
  const seed = `${name}|${address}|${placeRef}`.toLowerCase().replace(/\s+/g, ' ').trim()
  let hash = 2166136261
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return `lead_${(hash >>> 0).toString(36)}`
}

export function statusFromError(error: unknown): RunStatus {
  if (error instanceof Error && (error.name === 'AbortError' || /aborted/i.test(error.message))) return 'cancelled'
  return 'failed'
}
