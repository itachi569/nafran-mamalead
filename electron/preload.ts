import { contextBridge, ipcRenderer } from 'electron'
import type { ProviderId, RunProgress, RunSummary, StartRunRequest } from './scraper/types'

type Unsubscribe = () => void

function subscribe<T>(channel: string, listener: (payload: T) => void): Unsubscribe {
  const wrapped = (_event: unknown, payload: T) => listener(payload)
  ipcRenderer.on(channel, wrapped)
  return () => ipcRenderer.off(channel, wrapped)
}

/**
 * The local database, one method per operation.
 *
 * The main process answers with the value itself, or with { error } when the call threw. That
 * envelope is unwrapped here, so the renderer can use try/catch the way it would against any
 * other async API and a database failure arrives as an Error with a readable message.
 */
async function call<T>(channel: string, payload?: unknown): Promise<T> {
  const result = (await ipcRenderer.invoke(channel, payload)) as T | { error: string }
  if (result && typeof result === 'object' && 'error' in result && typeof (result as { error: unknown }).error === 'string') {
    throw new Error((result as { error: string }).error)
  }
  return result as T
}

const local = {
  workspace: () => call('db:workspace'),
  usage: () => call('db:usage'),
  stats: () => call('db:stats'),
  dashboard: (days?: 7 | 30 | null) => call('db:dashboard', { days }),

  leads: {
    list: (payload?: { limit?: number; offset?: number }) => call('db:leads:list', payload ?? {}),
    get: (id: string) => call('db:leads:get', { id }),
    summary: () => call('db:leads:summary'),
    bookmark: (id: string, bookmarked: boolean) => call('db:leads:bookmark', { id, bookmarked }),
    needing: (kind: 'email' | 'phone' | 'social', limit?: number) => call('db:leads:needing', { kind, limit }),
  },

  phones: {
    ledger: (payload?: { limit?: number }) => call('db:phones:ledger', payload ?? {}),
    summary: () => call('db:phones:summary'),
  },

  runs: {
    list: (limit?: number) => call('db:runs:list', { limit }),
    counts: () => call('db:runs:counts'),
  },

  contacts: {
    list: (kind: 'email' | 'phone' | 'social', leadIds?: string[]) => call('db:contacts:list', { kind, leadIds }),
    upsert: (input: {
      leadId: string
      kind: 'email' | 'phone' | 'social'
      value: string
      source?: string
      verified?: boolean
      score?: number | null
    }) => call<{ id: string }>('db:contacts:upsert', input),
    update: (id: string, patch: { value?: string; verified?: boolean; score?: number | null }) =>
      call('db:contacts:update', { id, patch }),
    remove: (id: string) => call('db:contacts:delete', { id }),
  },

  social: {
    list: (leadIds?: string[]) => call('db:social:list', { leadIds }),
    upsert: (input: {
      leadId: string
      platform: string
      handle?: string
      profileUrl?: string
      followers?: number | null
      verified?: boolean
      source?: string
    }) => call<{ id: string }>('db:social:upsert', input),
    update: (
      id: string,
      patch: { handle?: string; profileUrl?: string; followers?: number | null; verified?: boolean },
    ) => call('db:social:update', { id, patch }),
    remove: (id: string) => call('db:social:delete', { id }),
  },

  people: {
    list: (leadIds?: string[]) => call('db:people:list', { leadIds }),
    ledger: () => call('db:people:ledger'),
    funnel: () => call('db:people:funnel'),
    candidates: (includeDismissed?: boolean) => call('db:people:candidates', { includeDismissed }),
    candidateTotals: () => call('db:people:candidateTotals'),
    /** Builds suggestions from what is already on file; no pages are visited. */
    buildSuggestions: () => call<{ suggested: number }>('db:people:buildSuggestions'),
    confirm: (id: string) => call<{ confirmed: boolean }>('db:people:confirm', { id }),
    dismiss: (id: string) => call<{ dismissed: boolean }>('db:people:dismiss', { id }),
    /** Puts a dismissed suggestion back in the queue; a confirmed one cannot be undone. */
    restore: (id: string) => call<{ restored: boolean }>('db:people:restore', { id }),
    add: (input: { leadId: string; fullName: string; title?: string; email?: string; phone?: string; linkedinUrl?: string }) =>
      call<{ id: string }>('db:people:add', input),
    remove: (id: string) => call('db:people:delete', { id }),
  },

  lists: {
    list: () => call('db:lists:list'),
    create: (name: string) => call<{ id: string }>('db:lists:create', { name }),
    remove: (id: string) => call('db:lists:delete', { id }),
    add: (listId: string, leadIds: string[]) => call<{ added: number; skipped: number }>('db:lists:add', { listId, leadIds }),
    removeLead: (listId: string, leadId: string) => call('db:lists:remove', { listId, leadId }),
    members: (listId: string) => call<string[]>('db:lists:members', { listId }),
  },

  jobs: {
    queue: (kind: 'email' | 'phone' | 'social' | 'decision-maker' | 'website', leadIds: string[]) =>
      call<{ jobId: string; queued: number }>('db:jobs:queue', { kind, leadIds }),
    cancel: (jobId: string) => call<{ cancelled: boolean }>('db:jobs:cancel', { jobId }),
    totals: () => call('db:jobs:totals'),
    status: (jobId: string) => call<{ status: 'queued' | 'running' | 'done' | 'failed' } | null>('db:jobs:status', { jobId }),
    usage: () => call('db:jobs:usage'),
    covered: (kind: string, statuses: string[]) => call<string[]>('db:jobs:covered', { kind, statuses }),
  },

  imports: {
    list: (limit?: number) => call('db:imports:list', { limit }),
    ledger: () => call('db:imports:ledger'),
    websites: (input: string[] | string) =>
      call<{ batchId: string; added: number; skipped: number; leadIds: string[] }>('db:imports:websites', { input }),
    /**
     * Pasted social profile URLs, attached to the leads their handles name.
     *
     * Nothing is crawled for these: the paste already holds the profile. `platform` is the
     * dropdown's answer, used for a line that does not say which platform it belongs to.
     */
    social: (input: string[] | string, platform = '') =>
      call<{
        batchId: string
        added: number
        matched: number
        created: number
        skipped: number
        unmatched: string[]
      }>('db:imports:social', { input, platform }),
    /**
     * What the import box would do, without doing it: each pasted line, and whether it attaches to
     * a lead on file, becomes a new one, repeats a line above it, or names no platform at all.
     */
    preview: (input: string[] | string, platform = '') =>
      call<
        { tag: string; handle: string; detail: string; result: string; tone: string; kind: 'match' | 'new' | 'skip'; url: string }[]
      >('db:imports:preview', { input, platform }),
  },

  search: {
    /** What has been searched on this page, most recent first. */
    history: (scope = 'social', limit = 8) => call<{ term: string; results: number | null; searchedAt: string }[]>('db:search:history', { scope, limit }),
    /** Records a search so the box can offer it back later. */
    record: (term: string, scope = 'social', results?: number | null) => call('db:search:record', { term, scope, results }),
  },

  /**
   * The history panel's log: every search, import, refresh and finished pass on a page.
   *
   * `items` is what the entry was about, which the row shows when it is opened; `runTerm` is the
   * search behind a search entry, which is the one thing worth running again.
   */
  activity: {
    list: (options: { scope?: string; only?: 'all' | 'searches' | 'activity'; limit?: number } = {}) =>
      call<
        { id: string; kind: string; title: string; detail: string; items: string[]; hits: number | null; runTerm: string; createdAt: string }[]
      >('db:activity:list', options),
    count: (scope = 'social') => call<number>('db:activity:count', { scope }),
    log: (entry: {
      kind: 'search' | 'import' | 'refresh' | 'action'
      title?: string
      detail?: string
      items?: string[]
      hits?: number | null
      runTerm?: string
      scope?: string
    }) => call('db:activity:log', entry),
    clear: (scope = 'social') => call('db:activity:clear', { scope }),
  },

  exports: {
    list: () => call('db:exports:list'),
    record: (input: { kind: string; scope: string; rowCount: number; columns: string[]; fileName: string; path: string }) =>
      call('db:exports:record', input),
    write: (input: { kind: 'leads' | 'runs' | 'invoices' | 'profiles'; limit: number; delimiter: string; columns: string[]; fileName: string; format?: 'csv' | 'xlsx' | 'pdf'; leadIds?: string[] }) =>
      call<{ path: string; fileName: string; rows: number; columns: number; bytes: number } | null>('db:exports:write', input),
  },

  coverage: {
    email: () => call('db:coverage:email'),
    social: () => call('db:coverage:social'),
  },
}

export interface EnrichmentProgress {
  jobId: string
  kind: 'email' | 'phone' | 'social' | 'decision-maker' | 'website'
  status: 'running' | 'done' | 'failed' | 'idle'
  processed: number
  total: number
  found: number
  leadName: string
  message: string
  at: string
}

const enrichment = {
  status: (): Promise<{ running: boolean; pending: number }> => ipcRenderer.invoke('enrichment:status'),
  start: (): Promise<{ started: boolean }> => ipcRenderer.invoke('enrichment:start'),
  prioritize: (jobId?: string): Promise<{ started: boolean }> => ipcRenderer.invoke('enrichment:prioritize', { jobId }),
  stop: (): Promise<{ stopped: boolean }> => ipcRenderer.invoke('enrichment:stop'),
  onProgress: (listener: (progress: EnrichmentProgress) => void): Unsubscribe =>
    subscribe('enrichment:progress', listener),
}

const desktop = {
  getInfo: (): Promise<{ version: string; platform: string; isPackaged: boolean; electron: string }> =>
    ipcRenderer.invoke('app:info'),
  billing: {
    status: () => call('billing:status'),
    claimDecisionSubscribeHandoff: () => call('billing:claim-decision-subscribe-handoff'),
    onDecisionSubscribeHandoff: (listener: () => void): Unsubscribe => subscribe('billing:decision-subscribe-handoff', listener),
    onDecisionUsage: (listener: (usage: { used: number; remaining: number; renewsAt: string; periodId: string }) => void): Unsubscribe =>
      subscribe('billing:decision-usage', listener),
    requestTrial: (email: string, replaceExisting = false) => call('billing:request-trial', { email, replaceExisting }),
    checkout: (product: 'lifetime' | 'decisionMaker', email: string) => call('billing:checkout', { product, email }),
    activate: (licenseKey: string) => call('billing:activate', licenseKey),
    portal: () => call('billing:portal'),
    invoices: () => call('billing:invoices'),
    openInvoice: (url: string) => call('billing:openInvoice', url),
  },
  assist: {
    status: (): Promise<{ configured: boolean; savedOnDevice: boolean }> => call('assist:status'),
    saveKey: (key: string): Promise<{ configured: boolean; savedOnDevice: boolean }> => call('assist:save-key', key),
    removeKey: (): Promise<{ configured: boolean; savedOnDevice: boolean }> => call('assist:remove-key'),
    test: (): Promise<{ connected: boolean; model: string }> => call('assist:test'),
    chat: (input: {
      messages?: { role: 'user' | 'assistant'; content: string }[]
      context?: Record<string, string | number | boolean | null>
    }): Promise<{ text: string; model: string }> => ipcRenderer.invoke('assist:chat', input),
  },
  emailValidity: {
    status: (): Promise<{
      configured: boolean
      fromEnvironment: boolean
      provider: 'apify' | 'leadsangel' | 'mailverifier' | null
      leadsAngelConfigured: boolean
      leadsAngelExpiresOn: string | null
      progress: {
        state: 'idle' | 'running' | 'cancelling' | 'completed' | 'cancelled' | 'failed'
        message: string
        total: number
        checked: number
        failed: number
        pending: number
        retries: number
        batchSize: number
      }
    }> => ipcRenderer.invoke('emailValidity:status'),
    importLeadsAngelZip: (): Promise<{ configured: boolean; expiresOn: string | null }> =>
      ipcRenderer.invoke('emailValidity:importLeadsAngelZip'),
    removeLeadsAngel: (): Promise<{ configured: boolean; expiresOn: string | null }> =>
      ipcRenderer.invoke('emailValidity:removeLeadsAngel'),
    cancel: (): Promise<{ cancelled: boolean }> => ipcRenderer.invoke('emailValidity:cancel'),
    onProgress: (listener: (progress: {
      state: 'idle' | 'running' | 'cancelling' | 'completed' | 'cancelled' | 'failed'
      message: string
      total: number
      checked: number
      failed: number
      pending: number
      retries: number
      batchSize: number
    }) => void): Unsubscribe => subscribe('emailValidity:progress', listener),
    verify: (input: { leadIds?: string[]; contactIds?: string[]; force?: boolean; recheckUnknown?: boolean } = {}): Promise<{
      configured: boolean
      provider: 'apify' | 'leadsangel' | 'mailverifier'
      checked: number
      updated: number
      valid: number
      invalid: number
      risky: number
      unknown: number
      skipped: number
      limited: number
      failed: number
      cancelled: boolean
    }> => ipcRenderer.invoke('emailValidity:verify', input),
  },
  notifications: {
    show: (title: string, body: string): Promise<{ shown: boolean }> =>
      ipcRenderer.invoke('notifications:show', { title, body }),
  },
  updates: {
    status: (): Promise<{
      state: 'disabled' | 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'not-available' | 'error'
      version: string | null
      percent: number | null
      message: string
    }> => ipcRenderer.invoke('updates:status'),
    check: (): Promise<{
      state: 'disabled' | 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'not-available' | 'error'
      version: string | null
      percent: number | null
      message: string
    }> => ipcRenderer.invoke('updates:check'),
    download: (): Promise<{
      state: 'disabled' | 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'not-available' | 'error'
      version: string | null
      percent: number | null
      message: string
    }> => ipcRenderer.invoke('updates:download'),
    install: (): Promise<{ started: boolean }> => ipcRenderer.invoke('updates:install'),
    onStatus: (listener: (status: {
      state: 'disabled' | 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'not-available' | 'error'
      version: string | null
      percent: number | null
      message: string
    }) => void): Unsubscribe => subscribe('updates:status', listener),
  },
  /**
   * The automated checks' own door into the app.
   *
   * The suites drive the renderer over the DevTools protocol, so this is the only way they can
   * reach the main process at all — and connecting Google is the one thing they cannot do for
   * themselves, because it is a sign-in to a real account. The main process refuses every call
   * unless the app was started with the test flag, so a packaged build answers nothing.
   */
  test: {
    seedGoogleSession: (): Promise<boolean> => ipcRenderer.invoke('app:testHook', 'seedGoogleSession'),
    mockOneEmailValidity: (): Promise<boolean> => ipcRenderer.invoke('app:testHook', 'mockOneEmailValidity'),
    mockUnknownEmailValidity: (): Promise<boolean> => ipcRenderer.invoke('app:testHook', 'mockUnknownEmailValidity'),
    mockSlowEmailValidity: (): Promise<boolean> => ipcRenderer.invoke('app:testHook', 'mockSlowEmailValidity'),
  },
  scraper: {
    providers: (): Promise<{ id: ProviderId; label: string; requiresBrowser: boolean }[]> =>
      ipcRenderer.invoke('scraper:providers'),
    start: (request: StartRunRequest): Promise<{ runId: string }> => ipcRenderer.invoke('scraper:start', request),
    /**
     * Starts a run through the Google gate: the app's own browser connects the account first when
     * it has none, and the run carries on in the window that took the sign-in.
     */
    runWithGoogle: (request: StartRunRequest): Promise<{ runId: string }> =>
      ipcRenderer.invoke('scraper:runWithGoogle', request),
    stop: (): Promise<void> => ipcRenderer.invoke('scraper:stop'),
    last: (): Promise<RunSummary | null> => ipcRenderer.invoke('scraper:last'),
    /** Opens a file dialog for a browser executable. Returns null when nothing was picked. */
    pickBrowser: (): Promise<string | null> => ipcRenderer.invoke('scraper:pickBrowser'),
    /** Opens the window that signs in to Google, and keeps the profile it leaves behind. */
    signInGoogle: (executablePath?: string): Promise<{ signedIn: boolean }> =>
      ipcRenderer.invoke('scraper:signInGoogle', { executablePath }),
    /** Whether a saved Google profile exists, and whether it holds a signed-in account. */
    googleStatus: (): Promise<{ profile: boolean; signedIn: boolean }> =>
      ipcRenderer.invoke('scraper:googleStatus'),
    onProgress: (listener: (progress: RunProgress) => void): Unsubscribe => subscribe('scraper:progress', listener),
    onDone: (listener: (summary: RunSummary) => void): Unsubscribe => subscribe('scraper:done', listener),
  },
  local,
  enrichment,
  /**
   * The deep pass: the paid search for a lead's decision makers.
   *
   * The key belongs to the window, so it is handed over rather than stored: `key` tells the main
   * process which one to use for this session, `check` presses it against the account, and `run`
   * queues one search per lead.
   */
  deep: {
    key: (key: string): Promise<{ saved: boolean; fromEnvironment: boolean }> => ipcRenderer.invoke('deep:key', { key }),
    /** Whether a key is in effect, and whether it came from this machine's environment. */
    status: (): Promise<{ saved: boolean; fromEnvironment: boolean }> => ipcRenderer.invoke('deep:status'),
    check: (key?: string): Promise<{ ok: boolean; balance: number | null; note: string }> =>
      ipcRenderer.invoke('deep:check', { key }),
    run: (leadIds?: string[]): Promise<{ queued: number; error: string | null }> =>
      ipcRenderer.invoke('deep:run', { leadIds }),
  },
}

contextBridge.exposeInMainWorld('desktop', desktop)

export type DesktopApi = typeof desktop
export type LocalApi = typeof local
