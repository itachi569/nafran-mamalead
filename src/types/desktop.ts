export type RunStatus = 'idle' | 'running' | 'done' | 'failed' | 'cancelled'
export type ProviderId = 'mock' | 'chromium-maps' | 'import'

export interface ProviderInfo {
  id: ProviderId
  label: string
  requiresBrowser: boolean
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
  /** When a finder last read this lead's own site; null when it never has. */
  lastScannedAt: string | null
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
  /** The place this update just captured, when it captured one. */
  lead?: Lead
}

export interface ScrapeQuery {
  keywords: string[]
  location: string
  maxResultsPerKeyword: number
  /** Total cap across every keyword and area in this run. */
  websiteFilter?: "any" | "has" | "none"
  maxResultsTotal?: number | null
  language: string
  region: string
  headless: boolean
  detail: boolean
  minDelayMs: number
  maxDelayMs: number
  /** A browser executable to drive instead of the bundled Chromium. */
  executablePath: string
  /** Reuse the Google profile this app signed in with, instead of a throwaway one. */
  savedProfile: boolean
  /** Where that profile lives, filled in by the main process. Empty means a throwaway profile. */
  profileDir: string
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
  query?: Partial<ScrapeQuery>
}

/** A lead as the local database stores it, with the contact flags the ledger derives. */
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
  /** When a finder last read this lead's own site; null when it has not been read yet. */
  last_scanned_at: string | null
  has_email: number
  has_social: number
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

export interface UsageSummary {
  scrapes_used: number
  scrape_limit: number
  lookups_used: number
  lookup_limit: number
  period: string
}

export interface LeadSummary {
  total: number
  withPhone: number
  withWebsite: number
  withEmail: number
  withSocial: number
  noContact: number
  byProvider: { provider: string; count: number }[]
}

/** One row of the phone ledger: a lead and the line, if any, that reaches it. */
export interface PhoneRow {
  id: string
  index: string
  name: string
  phone: string
  mainSource?: string
  areaCode: string
  area: string
  address: string
  website: string
  hasNumber: boolean
  lineType: 'reception' | 'direct' | 'mobile' | 'missing'
  /** When a finder last read this lead's own site; null when it never has. */
  lastScannedAt: string | null
  /** Numbers read off the lead's own site, each labelled with the page they came off. */
  found: { value: string; page: string }[]
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

export interface DecisionMakerRow {
  source: string
  email_evidence: 'page' | 'search-index' | 'personal-page'
  id: string
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
  /** When a finder last read this lead's own site; null when it never has. */
  last_scanned_at: string | null
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

export interface DecisionMakerFunnel {
  total: number
  withWebsite: number
  withLinkedin: number
  matched: number
  named: number
  missing: number
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

export interface StoredList {
  id: string
  name: string
  created_at: string
  members: number
  updated_at: string | null
  initials: string
}

/** What the main process reports about the run it just wrote to the database. */
export interface RunStorage {
  runId: string
  saved: number
}

export interface RunSummaryWithStorage extends RunSummary {
  stored?: RunStorage | null
  storeError?: string | null
}

/**
 * The local database as the renderer sees it. Every method rejects with an Error when the main
 * process reports a problem, so callers can use ordinary try/catch.
 */
export interface LocalApi {
  workspace: () => Promise<{
    id: string
    name: string
    plan: string
    usage: UsageSummary
    subscription: unknown
    members: { user_id: string; role: string; created_at: string }[]
    /** Where the local database file sits and how large it is, for the page that states it. */
    store?: { path: string; size: string }
  }>
  usage: () => Promise<UsageSummary>
  stats: () => Promise<LeadSummary>
  dashboard: (days?: 7 | 30 | null) => Promise<DashboardTotals>
  leads: {
    list: (payload?: { limit?: number; offset?: number; filter?: 'all' | 'phone' | 'email' | 'social' | 'missing'; search?: string; runId?: string }) => Promise<{ rows: StoredLead[]; total: number }>
    get: (id: string) => Promise<StoredLead | null>
    summary: () => Promise<LeadSummary>
    bookmark: (id: string, bookmarked: boolean) => Promise<{ ok: boolean }>
    needing: (kind: 'email' | 'phone' | 'social', limit?: number) => Promise<StoredLead[]>
  }
  phones: {
    ledger: (payload?: { limit?: number;offset?:number }) => Promise<PhoneRow[]>
    summary: () => Promise<PhoneSummary>
  }
  runs: {
    list: (limit?: number) => Promise<StoredRun[]>
    counts: () => Promise<{ runs: number; clean: number; places: number; medianMs: number }>
  }
  contacts: {
    list: (kind: 'email' | 'phone' | 'social', leadIds?: string[]) => Promise<Record<string, unknown>[]>
    upsert: (input: {
      leadId: string
      kind: 'email' | 'phone' | 'social'
      value: string
      source?: string
      verified?: boolean
      score?: number | null
    }) => Promise<{ id: string }>
    update: (id: string, patch: { value?: string; verified?: boolean; score?: number | null }) => Promise<unknown>
    remove: (id: string) => Promise<unknown>
  }
  social: {
    list: (leadIds?: string[]) => Promise<Record<string, unknown>[]>
    upsert: (input: {
      leadId: string
      platform: string
      handle?: string
      profileUrl?: string
      followers?: number | null
      verified?: boolean
      source?: string
    }) => Promise<{ id: string }>
    update: (
      id: string,
      patch: { handle?: string; profileUrl?: string; followers?: number | null; verified?: boolean },
    ) => Promise<unknown>
    remove: (id: string) => Promise<unknown>
  }
  people: {
    list: (leadIds?: string[]) => Promise<Record<string, unknown>[]>
    /** Every named contact with the lead it belongs to. */
    ledger: () => Promise<DecisionMakerRow[]>
    /** How many leads reached each step of the match funnel. */
    funnel: () => Promise<DecisionMakerFunnel>
    /** Suggestions awaiting a decision; dismissed ones are excluded unless asked for. */
    candidates: (includeDismissed?: boolean) => Promise<CandidateRow[]>
    candidateTotals: () => Promise<{ suggested: number; dismissed: number }>
    /** Builds suggestions from what is already on file, without visiting any page. */
    buildSuggestions: () => Promise<{ suggested: number }>
    confirm: (id: string) => Promise<{ confirmed: boolean }>
    dismiss: (id: string) => Promise<{ dismissed: boolean }>
    /** Puts a dismissed suggestion back in the queue. */
    restore: (id: string) => Promise<{ restored: boolean }>
    add: (input: {
      leadId: string
      fullName: string
      title?: string
      email?: string
      phone?: string
      linkedinUrl?: string
    }) => Promise<{ id: string }>
    remove: (id: string) => Promise<unknown>
  }
  lists: {
    list: () => Promise<StoredList[]>
    create: (name: string) => Promise<{ id: string }>
    remove: (id: string) => Promise<unknown>
    add: (listId: string, leadIds: string[]) => Promise<{ added: number; skipped: number }>
    removeLead: (listId: string, leadId: string) => Promise<unknown>
    members: (listId: string) => Promise<string[]>
  }
  jobs: {
    queue: (
      kind: 'email' | 'phone' | 'social' | 'decision-maker' | 'website' | 'deep',
      leadIds: string[],
    ) => Promise<{ jobId: string; queued: number }>
    cancel: (jobId: string) => Promise<{ cancelled: boolean }>
    totals: () => Promise<{ queued: number; running: number; done: number; failed: number }>
    status: (jobId: string) => Promise<EnrichmentJobStatus | null>
    /** Leads each kind of enrichment pass has covered, for the billing lookup meters. */
    usage: () => Promise<Record<string, number>>
    covered: (kind: string, statuses: string[]) => Promise<string[]>
  }
  lookup: {
    start: (input: string[], fields: import('../../electron/enrichment/website-lookup').WebsiteLookupFields) => Promise<import('../../electron/enrichment/website-lookup').WebsiteLookupSession>
    get: (jobId?: string) => Promise<import('../../electron/enrichment/website-lookup').WebsiteLookupSession | null>
  }
  imports: {
    list: (limit?: number) => Promise<Record<string, unknown>[]>
    /** The import batches and the leads they created, in one read. */
    ledger: () => Promise<{ batches: Record<string, unknown>[]; leads: ImportedLead[] }>
    /** Turns pasted domains into leads named after their host, queued for a website pass. */
    websites: (input: string[] | string, options?: {enqueue?:boolean}) => Promise<{
      batchId: string
      added: number
      skipped: number
      /** The leads the paste landed on, so the scan can report each site and then narrow to them. */
      leadIds: string[]
    }>
    /**
     * Pasted social profile URLs, attached to the leads their handles name. `platform` is the
     * dropdown's answer, used for a line that does not say which platform it belongs to.
     */
    social: (
      input: string[] | string,
      platform?: string,
    ) => Promise<{
      batchId: string
      added: number
      matched: number
      created: number
      skipped: number
      unmatched: string[]
      /** The leads this paste landed on, so the page can narrow its table to the URLs just given. */
      leadIds: string[]
    }>
    /** What the import box would do, without doing it. */
    preview: (
      input: string[] | string,
      platform?: string,
    ) => Promise<{ tag: string; handle: string; detail: string; result: string; tone: string; kind: 'match' | 'new' | 'skip'; url: string }[]>
  }
  search: {
    /** What has been searched on this page, most recent first. */
    history: (scope?: string, limit?: number) => Promise<{ term: string; results: number | null; searchedAt: string }[]>
    /** Records a search so the box can offer it back later. */
    record: (term: string, scope?: string, results?: number | null) => Promise<unknown>
  }
  /** The history panel's log: searches, imports, refreshes and finished passes. */
  activity: {
    list: (options?: { scope?: string; only?: 'all' | 'searches' | 'activity'; limit?: number }) => Promise<
      { id: string; kind: string; title: string; detail: string; items: string[]; hits: number | null; runTerm: string; createdAt: string }[]
    >
    count: (scope?: string) => Promise<number>
    log: (entry: {
      kind: 'search' | 'import' | 'refresh' | 'action'
      title?: string
      detail?: string
      items?: string[]
      hits?: number | null
      runTerm?: string
      scope?: string
    }) => Promise<unknown>
    clear: (scope?: string) => Promise<unknown>
  }
  exports: {
    list: () => Promise<Record<string, unknown>[]>
    record: (input: {
      kind: string
      scope: string
      rowCount: number
      columns: string[]
      fileName: string
      path: string
    }) => Promise<{ id: string }>
    /** Writes the file and reports where it landed; null when the save dialog is cancelled. */
    write: (input: {
      kind: 'leads' | 'runs' | 'invoices' | 'profiles' | 'people' | 'website'
      lookupJobId?: string
      limit: number
      delimiter: string
      columns: string[]
      fileName: string
      format?: 'csv' | 'xlsx' | 'pdf'
      leadIds?: string[]
      leadFilter?: 'all' | 'phone' | 'email' | 'social' | 'missing'
      search?: string
      runId?: string
    }) => Promise<{ path: string; fileName: string; rows: number; columns: number; bytes: number } | null>
  }
  coverage: {
    email: () => Promise<{ totals: Record<string, number> | null; bands: { band_from: number; count: number }[] }>
    social: () => Promise<{ platform: string; profiles: number; leads: number }[]>
  }
}

/** Progress the enrichment worker reports while it reads lead websites. */
export interface EnrichmentJobStatus {
  outcomes?: Record<string,{status:'found'|'not-published'|'error';searches:number;error?:string}>
  status: 'queued' | 'running' | 'done' | 'failed' | 'cancelled'
  processed: number
  total: number
  found: number
  failed: number
  leadName: string
  message: string
  at: string
}

export interface EnrichmentProgress {
  jobId: string
  kind: 'email' | 'phone' | 'social' | 'decision-maker' | 'website' | 'deep'
  status: 'running' | 'done' | 'failed' | 'cancelled' | 'idle'
  processed: number
  total: number
  found: number
  failed?: number
  leadName: string
  message: string
  at: string
}

export interface EmailValidityProgress {
  state: 'idle' | 'running' | 'cancelling' | 'completed' | 'cancelled' | 'failed'
  message: string
  total: number
  checked: number
  failed: number
  pending: number
  retries: number
  batchSize: number
}

export type OwnerBrowserStatus = {phase:'closed'|'opening'|'ready'|'sign-in'|'connect'|'searching'|'verification'|'error';message:string;open:boolean;savedSession?:boolean}

export interface DesktopApi {
  ownerBrowser: {
    status: () => Promise<OwnerBrowserStatus>
    open: () => Promise<OwnerBrowserStatus>
    connect: () => Promise<OwnerBrowserStatus>
    signIn: () => Promise<OwnerBrowserStatus>
    onStatus: (listener:(status:OwnerBrowserStatus)=>void) => () => void
  }
  chooseWebsiteCsv: () => Promise<{ name: string; content: string; bytes: number } | null>
  billing: {
    status: () => Promise<{
      configured: boolean
      connected: boolean
      mode?: 'test' | 'live'
      message?: string
      purchaseError?: string | null
      purchaseEmail?: string | null
      decisionKeyEmail?: string | null
      coreLicenseActive?: boolean
      decisionKeyActive?: boolean
      lifetime?: { amount: number; currency: string; interval: null; active: boolean }
      trial?: { active: boolean; expiresAt: string | null }
      trialRequest?: { requested: boolean; email: string | null; canChangeEmail: boolean }
      mapsLeads?: { used: number | null; limit: number | null; remaining: number | null }
      decisionMaker?: { amount: number; currency: string; interval: string | null; periodDays?: number; available?: boolean; active: boolean; status: string; ownerKind?: 'decision' | 'lifetime'; includedPeople: number; monthlyLimit: number; monthlyUsed: number; monthlyRemaining: number; renewsAt: string | null; periodId?: string | null }
      hasCustomer?: boolean
      license?: { active: boolean; kind?: 'trial' | 'lifetime' | 'decision'; email?: string; last4?: string; activatedAt?: string | null; expiresAt?: string | null }
    }>
    claimDecisionSubscribeHandoff: () => Promise<boolean>
    claimReturnHandoff: () => Promise<boolean>
    onReturnHandoff: (listener: () => void) => () => void
    onDecisionSubscribeHandoff: (listener: () => void) => () => void
    onDecisionUsage: (listener: (usage: { used: number; remaining: number; renewsAt: string; periodId: string }) => void) => () => void
    requestTrial: (email: string, replaceExisting?: boolean) => Promise<{ emailSent: boolean; message: string }>
    checkout: (product: 'lifetime' | 'decisionMaker', email: string) => Promise<{ opened: boolean }>
    activate: (licenseKey: string) => Promise<{ active: boolean; kind?: 'trial' | 'lifetime' | 'decision'; email?: string; last4?: string; activatedAt?: string | null }>
    portal: () => Promise<{ opened: boolean }>
    invoices: () => Promise<{ id: string; number: string; issued: string; total: number; currency: string; status: string; url: string }[]>
    openInvoice: (url: string) => Promise<{ opened: boolean }>
  }
  getInfo: () => Promise<{ version: string; platform: string; isPackaged: boolean; electron: string }>
  /** AI support chat; the provider credential remains in Electron's main process. */
  assist: {
    status: () => Promise<{ configured: boolean; savedOnDevice: boolean }>
    test: () => Promise<{ connected: boolean; model: string }>
    chat: (input: {
      messages?: { role: 'user' | 'assistant'; content: string }[]
      context?: Record<string, string | number | boolean | null>
    }) => Promise<{ text: string; model: string }>
  }
  /** Email-verifier integration. Provider credentials and network requests stay in the main process. */
  emailValidity: {
    status: () => Promise<{
      configured: boolean
      fromEnvironment: boolean
      provider: 'apify' | 'leadsangel' | 'mailverifier' | null
      leadsAngelConfigured: boolean
      leadsAngelExpiresOn: string | null
      progress: EmailValidityProgress
    }>
    importLeadsAngelZip: () => Promise<{ configured: boolean; expiresOn: string | null }>
    removeLeadsAngel: () => Promise<{ configured: boolean; expiresOn: string | null }>
    cancel: () => Promise<{ cancelled: boolean }>
    onProgress: (listener: (progress: EmailValidityProgress) => void) => () => void
    verify: (input?: { leadIds?: string[]; contactIds?: string[]; force?: boolean; recheckUnknown?: boolean }) => Promise<{
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
    }>
  }
  /** Shows a native notification when the host OS supports desktop notifications. */
  notifications: {
    show: (title: string, body: string, id?: string) => Promise<{ shown: boolean }>
    revealExport: (path:string)=>Promise<{shown:boolean}>
    onOpen: (listener:(id:string)=>void)=>()=>void
    onExportSaved: (listener:(result:{ eventId: string; kind: string; path: string; fileName: string; rows: number; bytes: number })=>void)=>()=>void
    onExportFailed: (listener:(result:{eventId:string;message:string})=>void)=>()=>void
  }
  updates: {
    status: () => Promise<UpdateStatus>
    check: () => Promise<UpdateStatus>
    download: () => Promise<UpdateStatus>
    setAutoDownload: (enabled:boolean) => Promise<UpdateStatus>
    install: () => Promise<{ started: boolean; message?:string }>
    onStatus: (listener: (status: UpdateStatus) => void) => () => void
  }
  /**
   * Hooks the automated suites use, refused unless the app was started with `LEADSNAP_TEST_HOOKS=1`.
   * They exist because a check cannot sign in to a real Google account, and the gate will not scrape
   * without one.
   */
  test: {
    seedGoogleSession: () => Promise<boolean>
    /** Makes the next one-address verification deterministic; refused outside debug test builds. */
    mockOneEmailValidity: () => Promise<boolean>
    mockUnknownEmailValidity: () => Promise<boolean>
    mockSlowEmailValidity: () => Promise<boolean>
  }
  scraper: {
    providers: () => Promise<ProviderInfo[]>
    start: (request: StartRunRequest) => Promise<{ runId: string }>
    /**
     * Starts a run through the Google gate: when the app's own browser holds no signed-in account
     * it opens and asks, and the run continues in the window that took the sign-in.
     */
    runWithGoogle: (request: StartRunRequest) => Promise<{ runId: string }>
    stop: () => Promise<void>
    last: () => Promise<RunSummary | null>
    /** Opens a file dialog for a browser executable. Returns null when nothing was picked. */
    pickBrowser: () => Promise<string | null>
    /** Opens the window that signs in to Google, and keeps the profile it leaves behind. */
    signInGoogle: (executablePath?: string) => Promise<{ signedIn: boolean }>
    /** Whether a saved Google profile exists, and whether it holds a signed-in account. */
    googleStatus: () => Promise<{ profile: boolean; signedIn: boolean }>
    onProgress: (listener: (progress: RunProgress) => void) => () => void
    onDone: (listener: (summary: RunSummaryWithStorage) => void) => () => void
  }
  local: LocalApi
  enrichment: {
    status: () => Promise<{ running: boolean; pending: number }>
    start: () => Promise<{ started: boolean }>
    prioritize: (jobId?: string) => Promise<{ started: boolean }>
    stop: (jobId?: string) => Promise<{ stopped: boolean }>
    onProgress: (listener: (progress: EnrichmentProgress) => void) => () => void
  }
  /**
   * The deep pass: a paid DataForSEO search per lead, for the people a site does not name.
   *
   * The credential is the window's own — entered in Settings and handed over for the session — so
   * the main process never keeps a copy of it.
   */
  deep: {
    /** Tells the main process which key to use for this session. Never written to disk there. */
    key: (key: string) => Promise<{ saved: boolean; fromEnvironment: boolean }>
    /** Whether a key is in effect, and whether this machine's environment supplied it. */
    status: () => Promise<{ saved: boolean; fromEnvironment: boolean }>
    /** Presses a key against the account, which costs nothing, and reports what it says. */
    check: (key?: string) => Promise<{ ok: boolean; balance: number | null; note: string }>
    /** Queues the owner search followed by a depth-10 email search for each supplied lead. */
    run: (leadIds?: string[]) => Promise<{ queued: number; error: string | null }>
  }
}

export type UpdateStatus = {
  state: 'disabled' | 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'not-available' | 'error'
  version: string | null
  percent: number | null
  message: string
  enabled: boolean
  autoDownload: boolean
  lastCheckedAt: string | null
}

declare global {
  interface Window {
    desktop?: DesktopApi
  }
}
