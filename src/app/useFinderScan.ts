// The scan behind the three finder pages.
//
// Email Finder, Phone Finder and Decision Makers share one shape in the design: a pinned bar with
// a search box, a state filter, an action, Import, Refresh and History; then — once the action has
// been run — a coverage card whose rings fill as the pass reports, and a results card that lists
// only the sites the scan has reached, with Show all leads to go back to the whole list.
//
// The three differ in what they look for and nothing else, so the state, the rings and the rows
// are built here once and the page supplies its own data. Nothing is invented: the rings count
// what is on file, the rows come from the page's own list, and a site counts as scanned when the
// enrichment pass has actually read it (`leads.last_scanned_at`).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

export type FinderKind = 'email' | 'phone' | 'decision-maker'

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
  exit: () => void
  reset: () => void
  exportScan: () => void
  rings: FinderRing[]
  rows: FinderRowOf<Row>[]
}

export interface FinderScanSource<Row extends FinderSourceRow = FinderSourceRow> {
  /** Every row the page holds, in view order. */
  rows: Row[]
  /**
   * `scan` reads each lead's own site; `review` reads what is already on file. The second one
   * touches no server, so it has no pass to watch.
   */
  mode: 'scan' | 'review'
  /** Queues the given leads and reports the exact job that belongs to this scan. */
  queue: (leadIds: string[]) => Promise<{ queued: number; jobId: string }>
  /** Reads one scan job, so another page's queued work cannot hold this result open. */
  jobStatus?: (jobId: string) => Promise<{ status: 'queued' | 'running' | 'done' | 'failed' } | null>
  /** Re-reads the page's data. Rings and rows are read after every refresh. */
  refresh: () => void | Promise<void>
  /** The counts behind the rings, in the order they are drawn. */
  ringSource: () => { name: string; count: number }[]
  /** The action button's own words: "Verify all", "Check numbers", "Review suggestions". */
  actionLabel: string
  /** Said while the pass runs. */
  runningLabel: (queued: number) => string
  /** Said once it has finished. */
  doneLabel: (scanned: number) => string
  /** Called when a scan starts, so the page can do its own first step. */
  onStart?: () => void
  /** Opens the export dialog on the rows the scan found. */
  onExport: () => void
  /** Results card to bring into view after the pass finishes. */
  resultSelector?: string
}

const CIRCUMFERENCE = 276.5
const RING_STEP_MS = 260
const ROW_REVEAL_MS = 420

/** Search normalization so "Northern  Spine" finds "Northern Spine & Sports Clinic". */
function matches(haystack: string, needle: string): boolean {
  if (!needle) return true
  const field = haystack.toLowerCase().replace(/[^a-z0-9@.]+/g, ' ')
  const terms = needle.toLowerCase().split(/[^a-z0-9@.]+/).filter(Boolean)
  return terms.every((term) => field.includes(term))
}

/**
 * The scan, its rings and its rows for one finder page.
 *
 * A pass takes real time — the worker reads sites one at a time — so the page cannot simply wait
 * for the answer. It shows the sites as they are reached, filling the rings behind them, and reads
 * the finished figures once the worker reports it has stopped.
 */
export function useFinderScan<Row extends FinderSourceRow>(source: FinderScanSource<Row>): FinderScan<Row> {
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
  const [rowCursor, setRowCursor] = useState(0)
  const [ringFill, setRingFill] = useState(0)
  const timers = useRef<number[]>([])
  const generation = useRef(0)
  const [failure, setFailure] = useState('')

  // The source changes identity on every render — it is built from live data — so it is read
  // through a ref and never used as an effect dependency.
  const sourceRef = useRef(source)
  sourceRef.current = source

  const clearTimers = useCallback(() => {
    timers.current.forEach((timer) => window.clearTimeout(timer))
    timers.current = []
  }, [])

  useEffect(() => clearTimers, [clearTimers])

  const remember = useCallback((value: string, results = 0) => {
    const trimmed = value.trim()
    if (!trimmed) return
    setHistory((current) =>
      [{ term: trimmed, results }, ...current.filter((entry) => entry.term !== trimmed)].slice(0, 8),
    )
  }, [])

  const onInput = useCallback((event: React.InputEvent<HTMLInputElement>) => setTerm(event.currentTarget.value), [])
  const onKey = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key !== 'Enter' && event.key !== ',') return
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
      source.rows.filter((row) => {
        const haystack = `${row.domain} ${row.statusLabel} ${row.items.map((item) => `${item.t} ${item.k}`).join(' ')}`
        if (!matches(haystack, term)) return false
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
    [filter, source.rows, term],
  )

  /**
   * Starts the action: queue the leads the page is showing, then watch the pass until it stops.
   *
   * The queue is the rows on the page rather than every lead in the database: the action sits on the
   * list, so "Verify all" means the rows under it, and a pass over leads the user cannot see would
   * report a figure the page never showed.
   */
  const start = useCallback((leadIds: string[], fromImport: boolean) => {
    const current = sourceRef.current
    const request = ++generation.current
    setFailure('')
    clearTimers()
    setScanOn(true)
    setRowCursor(0)
    setRingFill(0)
    setQueued(0)
    setJobId('')
    const uniqueIds = Array.from(new Set(leadIds))
    setScopeIds(uniqueIds)
    setImported(fromImport)
    if (!fromImport) current.onStart?.()
    if (current.mode === 'review') {
      // Reading suggestions visits nothing, so there is no pass to watch.
      if (!fromImport) {
        setRunning(false)
        return
      }
      // An imported site needs a real people pass before the Decision Makers result can settle.
      setRunning(true)
      void current.queue(uniqueIds).then(async (result) => {
        if (request !== generation.current) return
        setQueued(result.queued)
        if (result.jobId) setJobId(result.jobId)
        else {
          await current.refresh()
          if (request !== generation.current) return
          setRunning(false)
          setRingFill(1)
        }
      }).catch(() => { if (request === generation.current) { setFailure('The scan could not start. Check your plan and try again.'); setRunning(false) } })
      return
    }
    setRunning(true)
    void current.queue(uniqueIds).then(async (result) => {
      if (request !== generation.current) return
      setQueued(result.queued)
      if (result.jobId) {
        setJobId(result.jobId)
        return
      }
      // Nothing was queued (for example, every row lacked a website): finish cleanly and leave the
      // scoped rows visible instead of showing a spinner that can never receive a job update.
      await current.refresh()
      if (request !== generation.current) return
      setRunning(false)
      setRingFill(1)
    }).catch(() => { if (request === generation.current) { setFailure('The scan could not start. Try again.'); setRunning(false) } })
  }, [clearTimers])

  const act = useCallback(() => start(actionRows.map((row) => row.leadId), false), [actionRows, start])
  const scanImported = useCallback((leadIds: string[]) => start(leadIds, true), [start])

  // While a pass runs the rows are revealed one at a time in list order, so the panel fills from
  // the top the way a scan reaches the sites.
  useEffect(() => {
    if (!scanOn || !running) return
    if (rowCursor >= sourceRef.current.rows.length) return
    const timer = window.setTimeout(() => setRowCursor((cursor) => cursor + 1), ROW_REVEAL_MS)
    timers.current.push(timer)
    return () => window.clearTimeout(timer)
  }, [scanOn, running, rowCursor, source.rows.length])

  // The rings fill behind the reveal rather than jumping to their final length.
  useEffect(() => {
    if (!scanOn || !running || ringFill >= 1) return
    const timer = window.setTimeout(() => setRingFill((fill) => Math.min(1, fill + 0.2)), RING_STEP_MS)
    timers.current.push(timer)
    return () => window.clearTimeout(timer)
  }, [scanOn, running, ringFill])

  // A pass that has run this long is not going to report: the worker reads a site in seconds, so a
  // scan still saying it is running after this is stalled. The card stops claiming to work, which
  // puts the way out of the scan back on screen — a spinner with no exit is a page you cannot leave.
  useEffect(() => {
    if (!running) return
    const timer = window.setTimeout(() => { setFailure('The scan is taking longer than expected. Refresh to see saved results.'); setRunning(false) }, Math.max(90_000, queued * 60_000))
    return () => window.clearTimeout(timer)
  }, [running, queued])

  // The pass is over when this page's own job is done. Looking at the global queue made an Email
  // scan wait behind an unrelated Phone or website job, and could leave its result card open.
  useEffect(() => {
    if (!running || !jobId) return
    const statusForJob = sourceRef.current.jobStatus
    if (!statusForJob) return
    let cancelled = false
    let timer: number | undefined
    const poll = async (): Promise<void> => {
      try {
        const status = await statusForJob(jobId)
        if (cancelled) return
        if (!status || status.status === 'queued' || status.status === 'running') {
          // Finder jobs are short direct HTTP reads. Polling every two seconds made a finished
          // lookup look slow in the UI, even when the worker had already written its result.
          timer = window.setTimeout(() => void poll(), 450)
          return
        }
        await sourceRef.current.refresh()
        if (cancelled) return
        if (status.status === 'failed') setFailure('The scan could not finish. Any saved results are shown below; check your connection and plan before retrying.')
        setRunning(false)
        setRingFill(1)
      } catch {
        if (!cancelled) timer = window.setTimeout(() => void poll(), 900)
      }
    }
    timer = window.setTimeout(() => void poll(), 300)
    return () => {
      cancelled = true
      if (timer) window.clearTimeout(timer)
    }
  }, [jobId, running])

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
    const base = scanOn ? scopedRows : sourceRows
    return base.filter((row) => {
      if (imported) return true
      const haystack = `${row.domain} ${row.statusLabel} ${row.items.map((item) => `${item.t} ${item.k}`).join(' ')}`
      if (!matches(haystack, term)) return false
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
  }, [sourceRows, scopedRows, scanOn, imported, term, filter])

  // The reveal: during a pass only the rows the cursor has passed are on screen.
  const revealed = useMemo(() => {
    if (!running) return visible
    return visible.filter((_, index) => index < rowCursor)
  }, [visible, running, rowCursor])

  const rows = useMemo<FinderRowOf<Row>[]>(
    () =>
      revealed.map((row) => ({
        ...row,
        domain: row.domain || 'No website',
        scanning: running && !row.scanned,
        scanLabel: running && !row.scanned ? 'Scanning…' : '',
        items: row.items,
        none: !running && row.items.length === 0,
        pill: row.scanned ? 'done' : running ? 'scanning' : 'pending',
        status: row.scanned ? 'Done' : running ? 'Scanning' : row.statusLabel || 'Pending',
        onThisSite: row.items.length > 0,
      })),
    [revealed, running],
  )

  const scanned = useMemo(
    () => (scanOn ? scopedRows : sourceRows).filter((row) => row.scanned).length,
    [scanOn, scopedRows, sourceRows],
  )

  const rings = useMemo<FinderRing[]>(() => {
    const counts = source.ringSource()
    const denominator = Math.max(1, scanned)
    const fill = running ? ringFill : 1
    return counts.map((ring) => {
      const pct = Math.round((ring.count / denominator) * 100)
      const arc = (Math.min(100, pct) / 100) * CIRCUMFERENCE
      return {
        name: ring.name,
        pct: Math.round(pct * fill),
        leads: `${ring.count} lead${ring.count === 1 ? '' : 's'}`,
        off: String(Math.round(CIRCUMFERENCE - arc * fill)),
      }
    })
  }, [scanned, running, ringFill, source])

  const exit = useCallback(() => {
    generation.current += 1
    setFailure('')
    clearTimers()
    setScanOn(false)
    setRunning(false)
    setRowCursor(0)
    setRingFill(0)
    setJobId('')
    setScopeIds(null)
    setImported(false)
  }, [clearTimers])

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

  // A finished finder action has the same result promise as the website scan: show the rows it
  // just processed without making the user hunt for the card below the toolbar.
  useEffect(() => {
    if (!scanOn || running) return
    const selector = sourceRef.current.resultSelector
    if (!selector) return
    const frame = window.requestAnimationFrame(() => {
      const target = document.querySelector<HTMLElement>(selector)
      if (!target) return
      const toolbarHeight = Math.max(0, ...Array.from(document.querySelectorAll<HTMLElement>('[data-socbar]'), (bar) => bar.getBoundingClientRect().height))
      target.style.scrollMarginTop = `${toolbarHeight + 32}px`
      target.scrollIntoView({ behavior: 'smooth', block: 'start' })
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
    count: String(history.length),
    rowsCount: `${revealed.length} row${revealed.length === 1 ? '' : 's'} on screen`,
    selectedLeadIds: scanOn ? scopeIds : null,
    scanImported,
    scanOn,
    scanning: running,
    scanDone: scanOn && !running,
    scanSub: failure || (running ? source.runningLabel(queued) : source.doneLabel(scanned)),
    scanBadge: failure || (running ? source.runningLabel(queued) : source.doneLabel(scanned)),
    scanLabel: failure || (running ? source.runningLabel(queued) : source.doneLabel(scanned)),
    exit,
    reset,
    exportScan: () => sourceRef.current.onExport(),
    rings,
    rows,
  }
}
