import { userError } from './user-errors'
import { contextBridge, ipcRenderer } from 'electron'
import type { UpdateStatus } from './updates'
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
  try {
  const result = (await ipcRenderer.invoke(channel, payload)) as T | { error: string }
  if (result && typeof result === 'object' && 'error' in result && typeof (result as { error: unknown }).error === 'string') {
    throw new Error((result as { error: string }).error)
  }
  return result as T
  } catch (error) { throw new Error(userError(error)) }
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
    ledger: (payload?: { limit?: number;offset?:number }) => call('db:phones:ledger', payload ?? {}),
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

  lists: {
    list: () => call('db:lists:list'),
    create: (name: string) => call<{ id: string }>('db:lists:create', { name }),
    remove: (id: string) => call('db:lists:delete', { id }),
    add: (listId: string, leadIds: string[]) => call<{ added: number; skipped: number }>('db:lists:add', { listId, leadIds }),
    removeLead: (listId: string, leadId: string) => call('db:lists:remove', { listId, leadId }),
    members: (listId: string) => call<string[]>('db:lists:members', { listId }),
  },

  jobs: {
    queue: (kind: 'email' | 'phone' | 'social' | 'website', leadIds: string[]) =>
      call<{ jobId: string; queued: number }>('db:jobs:queue', { kind, leadIds }),
    cancel: (jobId: string) => call<{ cancelled: boolean }>('db:jobs:cancel', { jobId }),
    totals: () => call('db:jobs:totals'),
    status: (jobId: string) => call<{ status: 'queued' | 'running' | 'done' | 'failed' } | null>('db:jobs:status', { jobId }),
    outcomes: (kind:string) => call('db:jobs:outcomes', {kind}),
    usage: () => call('db:jobs:usage'),
    covered: (kind: string, statuses: string[]) => call<string[]>('db:jobs:covered', { kind, statuses }),
  },

  lookup: {
    start: (input: string[], fields: import('./enrichment/website-lookup').WebsiteLookupFields) => call<import('./enrichment/website-lookup').WebsiteLookupSession>('db:lookup:start', {input,fields}),
    get: (jobId?: string) => call<import('./enrichment/website-lookup').WebsiteLookupSession | null>('db:lookup:get', {jobId}),
  },
  imports: {
    list: (limit?: number) => call('db:imports:list', { limit }),
    ledger: () => call('db:imports:ledger'),
    websites: (input: string[] | string, options?: {enqueue?:boolean}) =>
      call<{ batchId: string; added: number; skipped: number; leadIds: string[] }>('db:imports:websites', { input,enqueue:options?.enqueue }),
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
  kind: 'email' | 'phone' | 'social' | 'website'
  status: 'running' | 'done' | 'failed' | 'cancelled' | 'idle'
  processed: number
  total: number
  found: number
  failed: number
  leadName: string
  message: string
  at: string
}

const enrichment = {
  status: (): Promise<{ running: boolean; pending: number }> => ipcRenderer.invoke('enrichment:status'),
  start: (): Promise<{ started: boolean }> => ipcRenderer.invoke('enrichment:start'),
  prioritize: (jobId?: string): Promise<{ started: boolean }> => ipcRenderer.invoke('enrichment:prioritize', { jobId }),
  stop: (jobId?: string): Promise<{ stopped: boolean }> => ipcRenderer.invoke('enrichment:stop', {jobId}),
  onProgress: (listener: (progress: EnrichmentProgress) => void): Unsubscribe =>
    subscribe('enrichment:progress', listener),
}

const desktop = {

  chooseWebsiteCsv: () => call<{ name: string; content: string; bytes: number } | null>('imports:chooseWebsiteCsv'),
  getInfo: (): Promise<{ version: string; platform: string; isPackaged: boolean; electron: string }> =>
    ipcRenderer.invoke('app:info'),
  billing: {
    status: () => call('billing:status'),
      claimReturnHandoff: () => call('billing:claim-return-handoff'),
      onReturnHandoff: (listener: () => void): Unsubscribe => subscribe('billing:return-handoff', listener),

    requestTrial: (email: string, replaceExisting = false) => call('billing:request-trial', { email, replaceExisting }),
    checkout: (product: 'lifetime', email: string) => call('billing:checkout', { product, email }),
    activate: (licenseKey: string) => call('billing:activate', licenseKey),
    portal: () => call('billing:portal'),
    invoices: () => call('billing:invoices'),
    openInvoice: (url: string) => call('billing:openInvoice', url),
  },
  assist: {
    status: (): Promise<{ configured: boolean; savedOnDevice: boolean }> => call('assist:status'),
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
    show: (title: string, body: string, id?: string): Promise<{ shown: boolean }> => ipcRenderer.invoke('notifications:show',{title,body,id}),
    revealExport: (path: string): Promise<{ shown: boolean }> => ipcRenderer.invoke('notifications:reveal-export',{path}),
    onOpen: (listener:(id:string)=>void):Unsubscribe=>subscribe('notifications:open',listener),
    onExportSaved: (listener:(result:{ eventId: string; kind: string; path: string; fileName: string; rows: number; bytes: number })=>void):Unsubscribe=>subscribe('notifications:export-saved',listener),
    onExportFailed: (listener:(result:{eventId:string;message:string})=>void):Unsubscribe=>subscribe('notifications:export-failed',listener),
  },
  updates: {
    status: (): Promise<UpdateStatus> => ipcRenderer.invoke('updates:status'),
    check: (): Promise<UpdateStatus> => ipcRenderer.invoke('updates:check'),
    download: (): Promise<UpdateStatus> => ipcRenderer.invoke('updates:download'),
    setAutoDownload: (enabled:boolean): Promise<UpdateStatus> => ipcRenderer.invoke('updates:set-auto-download',enabled),
    install: (): Promise<{started:boolean;message?:string}> => ipcRenderer.invoke('updates:install'),
    onStatus: (listener:(status:UpdateStatus)=>void):Unsubscribe => subscribe('updates:status',listener),
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

}

contextBridge.exposeInMainWorld('desktop', desktop)

export type DesktopApi = typeof desktop
export type LocalApi = typeof local
