// The scan behind the three finder pages.
//
// Email Finder and Phone Finder share one shape in the design: a pinned bar with
// a search box, a state filter, an action, Import, Refresh and History; then — once the action has
// been run — a coverage card whose rings fill as the pass reports, and a results card that lists
// only the sites the scan has reached, with Show all leads to go back to the whole list.
//
// The three differ in what they look for and nothing else, so the state, the rings and the rows
// are built here once and the page supplies its own data. Nothing is invented: the rings count
// what is on file, the rows come from the page's own list, and a site counts as scanned when the
// enrichment pass has actually read it (`leads.last_scanned_at`).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { localDb } from '../lib/local'
import { savedSearchScore, searchSavedRows } from './saved-search'
import type { EnrichmentJobStatus } from '../types/desktop'

export type FinderKind = 'email' | 'phone'

/** One address, number or name a scan turned up, with the page it came off. */
export interface FinderItem {
  /** The detail itself — the address, the number, the person. */
  t: string
  /** Where it was read from, printed underneath. */
  k: string
}

/** One site the scan has reached, as the results panel and the page's own table both read it. */
export type FinderRow = FinderRowOf<FinderSourceRow>

/** A coverage ring: what share of the scanned sites carries this detail. */
export interface FinderRing {
  name: string
  pct: number
  leads: string
  off: string
}

/** One row of the page's own list, before the scan narrows it. */
export interface FinderSourceRow {
  /** The lead the row belongs to, so the action can ask for exactly the rows on the page. */
  leadId: string
  domain: string
  /** Additional published fields searched with the domain and result items. */
  searchText?: string
  searchFields?: string[]
  /** Whether a finder has read this lead's site. */
  scanned: boolean
  /** What was found there, each item labelled with the page it came off. */
  items: FinderItem[]
  /** The page's own status for the row, used when no scan has run. */
  statusLabel: string
  /** Optional per-item validity states used by Email Finder's state filter. */
  validityStatuses?: ('valid' | 'invalid' | 'risky' | 'unknown' | 'unchecked')[]
}

/**
 * A row of the page's own list, plus whatever else that page's table prints for it.
 *
 * The list under the bar is the page's real table — the address rows, the phone book, the named
 * contacts — so its own columns have to survive the scan. `Row` is that page's row and the scan
 * spreads it onto each row it hands back, which is why the table keeps working while the bar above
 * it narrows what it holds.
 */
export type FinderRowOf<Row> = Row & {
  lookupOutcome?: NonNullable<EnrichmentJobStatus['outcomes']>[string]
  domain: string
  scanning: boolean
  scanLabel: string
  items: FinderItem[]
  none: boolean
  pill: 'done' | 'scanning' | 'pending'
  status: string
  /** True when the scan found this page's detail on the site. */
  onThisSite: boolean
}

export interface FinderScan<Row = FinderSourceRow> {
  q: string
  filter: string
  /** Applies a summary-chip filter to the whole list, clearing any search or scan scope. */
  showFilter: (value: string) => void
  onInput: (event: React.InputEvent<HTMLInputElement>) => void
  onKey: (event: React.KeyboardEvent<HTMLInputElement>) => void
  onBlur: (event: React.FocusEvent<HTMLInputElement>) => void
  onState: (event: React.ChangeEvent<HTMLSelectElement>) => void
  act: () => void
  actLabel: string
  refresh: () => void
  openHist: () => void
  closeHist: () => void
  histOpen: boolean
  hist: { q: string; n: string; run: () => void }[]
  clearHistory: () => void
  /** The count on the History button. */
  count: string
  /** The line beside the recent chips, e.g. "10 rows on screen". */
  rowsCount: string
  /** Lead IDs from the import or action currently shown in the result cards. */
  selectedLeadIds: string[] | null
  /** Start a scan for exactly the URLs just imported on this page. */
  scanImported: (leadIds: string[]) => void
  scanOn: boolean
  scanning: boolean
  scanDone: boolean
  scanSub: string
  scanBadge: string
  scanLabel: string
  progress: { total: number; processed: number; remaining: number; failed: number; found: number; percent: number; current: string; message: string }
  stopping: boolean
  stopped: boolean
  stop: () => void
  exit: () => void
  reset: () => void
  exportScan: () => void
  rings: FinderRing[]
  rows: FinderRowOf<Row>[]
}

export interface FinderScanSource<Row extends FinderSourceRow = FinderSourceRow> {
  /** Every row the page holds, in view order. */
  rows: Row[]
  historyScope: 'email'|'phone'
  /** An import stays isolated until the user searches the saved workspace. */
  defaultScopeIds?: string[]
  /**
   * `scan` reads each lead's own site; `review` reads what is already on file. The second one
   * touches no server, so it has no pass to watch.
   */
  mode: 'scan' | 'review'
  /** Queues the given leads and reports the exact job that belongs to this scan. */
  queue: (leadIds: string[]) => Promise<{ queued: number; jobId: string }>
  /** Reads one scan job, so another page's queued work cannot hold this result open. */
  jobStatus?: (jobId: string) => Promise<EnrichmentJobStatus | null>
  /** Re-reads the page's data. Rings and rows are read after every refresh. */
  refresh: () => void | Promise<void>
  /** The counts behind the rings, in the order they are drawn. */
  ringSource: (rows: Row[]) => { name: string; count: number }[]
  /** The action button's own words: "Verify all", "Check numbers", "Review suggestions". */
  actionLabel: string
  /** Said while the pass runs. */
  runningLabel: (queued: number) => string
  /** Said once it has finished. */
  doneLabel: (scanned: number) => string
  /** Called when a scan starts, so the page can do its own first step. */
  onStart?: () => void
  /** Runs once after this job succeeds, with only the leads submitted for this pass. */
  onComplete?: (leadIds: string[]) => void
  /** Opens the export dialog on the rows the scan found. */
  onExport: () => void
  /** Results card to bring into view after the pass finishes. */
  resultSelector?: string
  /** Live scan card to reveal once, as soon as a new scan starts. */
  progressSelector?: string
  /** People results can narrow individual contacts as well as their website row. */
  filterItemsOnSearch?: boolean
}

const CIRCUMFERENCE = 276.5
const EMPTY_PROGRESS = { total: 0, processed: 0, failed: 0, found: 0, leadName: '', message: '', outcomes:{} as NonNullable<EnrichmentJobStatus['outcomes']> }

/** Search normalization so "Northern  Spine" finds "Northern Spine & Sports Clinic". */
export function matchesFinderSearch(haystack: string, needle: string): boolean {
  return savedSearchScore([haystack],needle)>0
}
const fieldsOf=(row:FinderSourceRow)=>row.searchFields ?? [row.searchText ?? '',row.domain,...row.items.flatMap(item=>[item.t,item.k])]

/**
 * The scan, its rings and its rows for one finder page.
 *
 * A pass takes real time — the worker reads sites one at a time — so the page cannot simply wait
 * for the answer. It shows the sites as they are reached, filling the rings behind them, and reads
 * the finished figures once the worker reports it has stopped.
 */
export function useFinderScan<Row extends FinderSourceRow>(source: FinderScanSource<Row>): FinderScan<Row> {
  const db=useMemo(()=>localDb(),[])
  const [term, setTerm] = useState('')
  const [filter, setFilter] = useState('all')
  const [histOpen, setHistOpen] = useState(false)
  const [history, setHistory] = useState<{ term: string; results: number }[]>([])
  const [scanOn, setScanOn] = useState(false)
  const [running, setRunning] = useState(false)
  const [queued, setQueued] = useState(0)
  const [jobId, setJobId] = useState('')
  /** The rows this action started with; after completion the page stays on these rows only. */
  const [scopeIds, setScopeIds] = useState<string[] | null>(null)
  const [imported, setImported] = useState(false)
  const [progress, setProgress] = useState(EMPTY_PROGRESS)
  const [stopping, setStopping] = useState(false)
  const [stopped, setStopped] = useState(false)
  const active = useRef(false)
  const stopRequested = useRef(false)
  const generation = useRef(0)
  const completion = useRef<FinderScanSource<Row>['onComplete']>(undefined)
  const visibleCount=useRef(0)
  const historyTimer=useRef<number|undefined>(undefined)
  const [failure, setFailure] = useState('')

  // The source changes identity on every render — it is built from live data — so it is read
  // through a ref and never used as an effect dependency.
  const sourceRef = useRef(source)
  sourceRef.current = source

  useEffect(()=>{let active=true;void db?.search.history(source.historyScope,50).then(items=>{if(active)setHistory(items.map(item=>({term:item.term,results:item.results??0})))}).catch(()=>undefined);return()=>{active=false}},[db,source.historyScope])
  const remember = useCallback((value: string, results = visibleCount.current) => {
    const trimmed = value.trim()
    if (trimmed.length<2) return
    setHistory((current) =>
      [{ term: trimmed, results }, ...current.filter((entry) => entry.term !== trimmed)].slice(0, 50),
    )
    void db?.search.record(trimmed,source.historyScope,results).catch(()=>undefined)
  }, [db,source.historyScope])
  useEffect(()=>{if(term.trim().length<2)return;historyTimer.current=window.setTimeout(()=>remember(term),650);return()=>window.clearTimeout(historyTimer.current)},[term,remember])

  const onInput = useCallback((event: React.InputEvent<HTMLInputElement>) => setTerm(event.currentTarget.value), [])
  const onKey = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key !== 'Enter') return
      event.preventDefault()
      const value = event.currentTarget.value
      setTerm(value)
      remember(value)
    },
    [remember],
  )
  const onBlur = useCallback(
    (event: React.FocusEvent<HTMLInputElement>) => {
      const value = event.currentTarget.value
      setTerm(value)
      remember(value)
    },
    [remember],
  )

  const onState = useCallback((event: React.ChangeEvent<HTMLSelectElement>) => {
    const value = event.currentTarget.value
    if (['all', 'has', 'valid', 'invalid', 'risky', 'unknown', 'unchecked', 'pending', 'nowebsite'].includes(value)) {
      setFilter(value)
      return
    }
    setFilter(
      value === 'Done'
        ? 'done'
        : value === 'Valid'
          ? 'valid'
          : value === 'Invalid'
            ? 'invalid'
            : value === 'Risky'
              ? 'risky'
              : value === 'Unknown'
                ? 'unknown'
                : value === 'Not checked'
                  ? 'unchecked'
        : value === 'Pending'
          ? 'pending'
          : value === 'Has email' || value === 'Reachable' || value === 'Named'
            ? 'has'
            : value === 'Needs verify' || value === 'Missing' || value === 'Awaiting match'
              ? 'missing'
              : value === 'No website'
                ? 'nowebsite'
                : 'all',
    )
  }, [])

  // The action belongs to the rows the person is looking at after the search and state filter,
  // rather than silently queueing every lead in the workspace.
  const actionRows = useMemo(
    () =>
      searchSavedRows(source.rows,term,fieldsOf).filter((row) => {
        if(!term.trim() && source.defaultScopeIds && !source.defaultScopeIds.includes(row.leadId))return false
        // "Review suggestions" is a people list action. Keep the normal toolbar
        // action scoped to rows that already have a named person; an imported
        // website uses scanImported() with its explicit lead ids and is allowed
        // to show the lead while the people pass is still running.
        if (source.mode === 'review' && row.items.length === 0) return false
        if (filter === 'done') return row.scanned
        if (filter === 'valid' || filter === 'invalid' || filter === 'risky' || filter === 'unknown' || filter === 'unchecked') {
          return row.validityStatuses?.includes(filter) ?? false
        }
        if (filter === 'pending') return !row.scanned
        if (filter === 'has') return row.items.length > 0
        if (filter === 'missing') return row.items.length === 0
        if (filter === 'nowebsite') return !row.domain
        return true
      }),
    [filter, source.rows,source.defaultScopeIds, term],
  )

  /**
   * Starts the action: queue the leads the page is showing, then watch the pass until it stops.
   *
   * The queue is the rows on the page rather than every lead in the database: the action sits on the
   * list, so "Verify all" means the rows under it, and a pass over leads the user cannot see would
   * report a figure the page never showed.
   */
  const start = useCallback((leadIds: string[], fromImport: boolean) => {
    if (active.current) return
    const current = sourceRef.current
    completion.current = current.onComplete
    const request = ++generation.current
    setFailure('')
    setScanOn(true)
    setQueued(0)
    setJobId('')
    const uniqueIds = Array.from(new Set(leadIds))
    setProgress({ ...EMPTY_PROGRESS, total: uniqueIds.length })
    stopRequested.current = false
    setStopping(false)
    setStopped(false)
    setScopeIds(uniqueIds)
    setImported(fromImport)
    if (fromImport) { setTerm(''); setFilter('all') }
    if (!fromImport) current.onStart?.()
    if (current.mode === 'review') {
      // Reading suggestions visits nothing, so there is no pass to watch.
      if (!fromImport) {
        setRunning(false)
        return
      }
      // An imported site needs a completed scan before its results can settle.
      setRunning(true)
      active.current = true
      void current.queue(uniqueIds).then(async (result) => {
        if (request !== generation.current) return
        setQueued(result.queued)
        if (result.jobId) {
          setJobId(result.jobId)
          if (stopRequested.current) await window.desktop?.enrichment.stop(result.jobId)
        }
        else {
          await current.refresh()
          if (request !== generation.current) return
          setRunning(false)
          active.current = false
        }
      }).catch(() => { if (request === generation.current) { setFailure('The scan could not start. Check your plan and try again.'); setRunning(false); active.current=false; setStopping(false) } })
      return
    }
    setRunning(true)
    active.current = true
    void current.queue(uniqueIds).then(async (result) => {
      if (request !== generation.current) return
      setQueued(result.queued)
      if (result.jobId) {
        setJobId(result.jobId)
        if (stopRequested.current) await window.desktop?.enrichment.stop(result.jobId)
        return
      }
      // Nothing was queued (for example, every row lacked a website): finish cleanly and leave the
      // scoped rows visible instead of showing a spinner that can never receive a job update.
      await current.refresh()
      if (request !== generation.current) return
      setRunning(false)
      active.current = false
      setStopping(false)
    }).catch(() => { if (request === generation.current) { setFailure('The scan could not start. Try again.'); setRunning(false); active.current=false; setStopping(false) } })
  }, [])

  const act = useCallback(() => start(actionRows.map((row) => row.leadId), false), [actionRows, start])
  const scanImported = useCallback((leadIds: string[]) => start(leadIds, true), [start])

  const stop = useCallback(() => {
    if (!active.current || stopRequested.current) return
    stopRequested.current = true
    setStopping(true)
    if (!jobId) return // The queued job is cancelled as soon as its ID is returned.
    void window.desktop?.enrichment.stop(jobId).catch(() => {
      stopRequested.current=false;setStopping(false)
      setFailure('Could not stop the scan. Please try Stop scan again.')
    })
  }, [jobId])

  // The pass is over when this page's own job is done. Looking at the global queue made an Email
  // scan wait behind an unrelated Phone or website job, and could leave its result card open.
  useEffect(() => {
    if (!running || !jobId) return
    const statusForJob = sourceRef.current.jobStatus
    if (!statusForJob) return
    let cancelled = false
    let timer: number | undefined
    let lastProcessed = -1
    const poll = async (): Promise<void> => {
      try {
        const status = await statusForJob(jobId)
        if (cancelled) return
        if (status) {
          setProgress({ total: status.total, processed: status.processed, failed: status.failed, found: status.found, leadName: status.leadName, message: status.message, outcomes:status.outcomes ?? {} })
          if (status.processed !== lastProcessed) {
            lastProcessed = status.processed
            await sourceRef.current.refresh()
            if (cancelled) return
          }
        }
        if (!status || status.status === 'queued' || status.status === 'running') {
          // Finder jobs are short direct HTTP reads. Polling every two seconds made a finished
          // lookup look slow in the UI, even when the worker had already written its result.
          timer = window.setTimeout(() => void poll(), 450)
          return
        }
        await sourceRef.current.refresh()
        if (cancelled) return
        if (status.status === 'failed') setFailure(status.message || 'Some websites could not be checked. Saved results are shown below; retry the unsuccessful websites.')
        setStopped(status.status === 'cancelled')
        setRunning(false)
        active.current = false
        setStopping(false)
        const finished = completion.current
        completion.current = undefined
        if (status.status === 'done') finished?.(scopeIds ?? [])
      } catch {
        if (!cancelled) timer = window.setTimeout(() => void poll(), 900)
      }
    }
    timer = window.setTimeout(() => void poll(), 300)
    return () => {
      cancelled = true
      if (timer) window.clearTimeout(timer)
    }
  }, [jobId, running, scopeIds])

  const sourceRows = source.rows
  const scannedRows = useMemo(() => sourceRows.filter((row) => row.scanned), [sourceRows])
  const scopedRows = useMemo(() => {
    if (!scopeIds) return scannedRows
    const byId = new Map(sourceRows.map((row) => [row.leadId, row]))
    return scopeIds.map((id) => byId.get(id)).filter((row): row is Row => Boolean(row))
  }, [scopeIds, scannedRows, sourceRows])

  // The filter and the search both narrow the list; the scan narrows it further to the sites it
  // has reached, which is what makes "Show all leads" mean something.
  const visible = useMemo(() => {
    const base = term.trim() ? sourceRows : scanOn ? scopedRows : source.defaultScopeIds ? sourceRows.filter(row=>source.defaultScopeIds!.includes(row.leadId)) : sourceRows
    return searchSavedRows(base,term,fieldsOf).filter((row) => {
      if (filter === 'done') return row.scanned
      if (filter === 'valid' || filter === 'invalid' || filter === 'risky' || filter === 'unknown' || filter === 'unchecked') {
        return row.validityStatuses?.includes(filter) ?? false
      }
      if (filter === 'pending') return !row.scanned
      if (filter === 'has') return row.items.length > 0
      if (filter === 'missing') return row.items.length === 0
      if (filter === 'nowebsite') return !row.domain
      return true
    })
  }, [sourceRows, scopedRows, scanOn,source.defaultScopeIds, term, filter])
  visibleCount.current=visible.length

  // Results are backed by the database; no timer pretends a website has been scanned.
  const revealed = visible

  const rows = useMemo<FinderRowOf<Row>[]>(
    () =>
      revealed.map((row) => {
        const position = scopeIds?.indexOf(row.leadId) ?? -1
        const tracked = scanOn && position >= 0
        const attempted = tracked ? position < progress.processed : row.scanned
        const checking = running && (tracked ? position === progress.processed : !row.scanned)
        return ({
        ...row,
        lookupOutcome: tracked ? progress.outcomes[row.leadId] : undefined,
        domain: row.domain || 'No website',
        scanning: checking,
        scanLabel: checking ? 'Scanning…' : tracked && !attempted ? 'Not scanned yet' : '',
        items: source.filterItemsOnSearch && term
          ? row.items.filter((item) => matchesFinderSearch(`${row.searchText ?? ''} ${row.domain} ${item.t} ${item.k}`, term))
          : row.items,
        none: !running && row.items.length === 0,
        pill: attempted ? 'done' : checking ? 'scanning' : 'pending',
        status: attempted ? 'Done' : checking ? 'Scanning' : tracked ? 'Not scanned yet' : row.statusLabel || 'Pending',
        onThisSite: row.items.length > 0,
      })}),
    [revealed, running, source.filterItemsOnSearch, source.historyScope, term,scopeIds,scanOn,progress.processed,progress.outcomes],
  )

  const scanned = useMemo(
    () => (scanOn ? scopedRows : sourceRows).filter((row) => row.scanned).length,
    [scanOn, scopedRows, sourceRows],
  )

  const rings = useMemo<FinderRing[]>(() => {
    const population = scanOn ? scopedRows : sourceRows
    const counts = source.ringSource(population)
    const denominator = Math.max(1, population.length)
    return counts.map((savedRing) => {
      const ring={...savedRing}
      // A previous saved email must not inflate this new scan's coverage before it is checked.

      const pct = Math.min(100, Math.max(0, Math.round((ring.count / denominator) * 100)))
      const arc = (Math.min(100, pct) / 100) * CIRCUMFERENCE
      return {
        name: ring.name,
        pct,
        leads: `${ring.count} lead${ring.count === 1 ? '' : 's'}`,
        off: String(Math.round(CIRCUMFERENCE - arc)),
      }
    })
  }, [scanOn, scopedRows, sourceRows, source, progress.outcomes])

  const exit = useCallback(() => {
    if (active.current) return
    generation.current += 1
    setFailure('')
    setScanOn(false)
    setRunning(false)
    setProgress(EMPTY_PROGRESS)
    setStopped(false)
    setStopping(false)
    setJobId('')
    setScopeIds(null)
    setImported(false)
  }, [])

  const reset = useCallback(() => {
    exit()
    setTerm('')
    setFilter('all')
    setHistOpen(false)
  }, [exit])

  const showFilter = useCallback((value: string) => {
    exit()
    setTerm('')
    setFilter(value)
  }, [exit])

  // Reveal live progress once at start, then the result rows once at completion.
  // Progress ticks must not pull the user back if they choose to scroll elsewhere.
  useEffect(() => {
    if (!scanOn) return
    const selector = running ? sourceRef.current.progressSelector : sourceRef.current.resultSelector
    if (!selector) return
    const frame = window.requestAnimationFrame(() => {
      const target = document.querySelector<HTMLElement>(selector)
      if (!target) return
      const toolbarHeight = Math.max(0, ...Array.from(document.querySelectorAll<HTMLElement>('[data-socbar]'), (bar) => bar.getBoundingClientRect().height))
      target.style.scrollMarginTop = `${toolbarHeight + 32}px`
      target.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [running, scanOn])

  const hist = useMemo(
    () =>
      history.map((entry) => ({
        q: `“${entry.term}”`,
        n: entry.results ? `${entry.results}` : '',
        run: () => {
          setTerm(entry.term)
          setHistOpen(false)
        },
      })),
    [history],
  )

  return {
    q: term,
    filter,
    showFilter,
    onInput,
    onKey,
    onBlur,
    onState,
    act,
    actLabel: source.actionLabel,
    refresh: () => sourceRef.current.refresh(),
    openHist: () => setHistOpen(true),
    closeHist: () => setHistOpen(false),
    histOpen,
    hist,
    clearHistory:()=>{window.clearTimeout(historyTimer.current);setHistory([]);void db?.activity.clear(source.historyScope).catch(()=>undefined)},
    count: String(history.length),
    rowsCount: `${revealed.length} row${revealed.length === 1 ? '' : 's'} on screen`,
    selectedLeadIds: term.trim() ? visible.map(row=>row.leadId) : scanOn ? scopeIds : null,
    scanImported,
    scanOn,
    scanning: running,
    scanDone: scanOn && !running,
    scanSub: failure || (stopped ? 'Scan stopped. Completed results are saved below.' : running ? source.runningLabel(queued) : source.doneLabel(scanned)),
    scanBadge: failure || (stopped ? 'Scan stopped' : running ? source.runningLabel(queued) : source.doneLabel(scanned)),
    scanLabel: failure || (stopped ? 'Scan stopped. Completed results are saved below.' : running ? source.runningLabel(queued) : source.doneLabel(scanned)),
    progress: { total: progress.total, processed: progress.processed, remaining: Math.max(0, progress.total-progress.processed), failed: progress.failed, found: progress.found, percent: progress.total ? Math.min(100, Math.floor(progress.processed / progress.total * 100)) : 0, current: progress.leadName, message: progress.message },
    stopping,
    stopped,
    stop,
    exit,
    reset,
    exportScan: () => sourceRef.current.onExport(),
    rings,
    rows,
  }
}
