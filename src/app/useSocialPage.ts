// State for the Social Profiles page.
//
// With the local database reachable, which it is whenever the app runs in Electron, the page
// reads the workspace's leads, their social profiles and the platform coverage totals. Outside
// Electron it falls back to the reference sample rows, so the page looks identical either way.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  createSocialProfile,
  deleteSocialProfile,
  fetchLeadsMissingSocials,
  fetchSocialPage,
  platformMeta,
  startSocialEnrichment,
  updateSocialProfile,
  type SocialDonut,
  type SocialExtra,
  type SocialProfileInput,
  type SocialRow,
} from '../lib/social'
import { localDb } from '../lib/local'
import { searchSavedRows } from './saved-search'
import { DEMO_SOCIAL_DONUTS, DEMO_SOCIAL_EXTRAS, DEMO_SOCIAL_ROWS } from './socialDemo'

/**
 * What a profile import answers with, as far as the page needs it.
 *
 * The lead ids are the part that matters to the table: after an import it holds the URLs just filed
 * and nothing else, which is what the coverage card promises. The counts are what the toast says.
 */
export interface SocialImportResult {
  batchId: string
  added: number
  matched: number
  created: number
  skipped: number
  unmatched: string[]
  leadIds: string[]
}

export interface SocialRowView {
  /** The lead the row belongs to, so an import can narrow the table to the URLs it was given. */
  leadId: string
  index: string
  name: string
  domain: string
  profiles: { label: string; short: string; handle: string; url: string }[]
  scanError?: string
  isDone: boolean
  isPending: boolean
  noProfiles: boolean
}

/** A search that has been made before, offered back by the search box. */
export interface SocialSearchTerm {
  term: string
  results: number | null
}

/** One entry in the history panel's log. */
export interface SocialHistoryRow {
  kind: 'search' | 'import' | 'refresh' | 'action'
  icon: string
  title: string
  meta: string
  items: { text: string }[]
  /** Whether the row opens at all: a search and an import have something to show inside. */
  canOpen: boolean
  isOpen: boolean
  open: string
  canRun: boolean
}

/** Which slice of the log the panel is showing, matching the reference's own tabs. */
export type SocialHistoryTab = 'All' | 'Searches' | 'Imports'

/** One pasted line, and what the import would make of it. */
export interface ImportPreviewRow {
  tag: string
  handle: string
  detail: string
  result: string
  tone: string
  kind: 'match' | 'new' | 'skip'
}

const HISTORY_ICONS: Record<SocialHistoryRow['kind'], string> = {
  search: '⌕',
  import: '↑',
  refresh: '↻',
  action: '✓',
}

/** "Today, 11:42" — the panel reads a time the way a person would say it. */
function historyStamp(iso: string): string {
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return ''
  const time = `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`
  const today = new Date()
  const sameDay = at.toDateString() === today.toDateString()
  if (sameDay) return `Today, ${time}`
  const yesterday = new Date(today.getTime() - 86_400_000)
  if (at.toDateString() === yesterday.toDateString()) return `Yesterday, ${time}`
  return `${at.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}, ${time}`
}

/** What the Profiles dropdown can narrow the list to, matching the reference's own options. */
export type SocialFilter = 'all' | 'with' | 'pending' | 'nowebsite'

export interface SocialPage {
  rows: SocialRowView[]
  donuts: SocialDonut[]
  extras: SocialExtra[]
  /** Message for the single state row — empty when rows are on screen. */
  state: string
  live: boolean
  loading: boolean
  error: string | null
  /** Leads on file, and how many of them the search and the filter left showing. */
  total: number
  showing: number
  /** Lead ids currently represented by the visible table, after search/filter or an imported scan. */
  visibleLeadIds: string[]
  search: string
  filter: SocialFilter
  setSearch: (value: string) => void
  setFilter: (value: SocialFilter) => void
  /** Searches made before, most recent first, which the box offers back. */
  history: SocialSearchTerm[]
/** Searches the term the user just picked from that list. */
  pickSearch: (term: string) => void
  /** Writes the term that is in the box now, which is what Enter, a comma and leaving it do. */
  commitSearch: () => void
  /** The history panel: what it lists, which tab it is on, and every way to work it. */
  logOpen: boolean
  logTab: SocialHistoryTab
  logCount: number
  logRows: SocialHistoryRow[]
  logFoot: string
  openLog: () => void
  closeLog: () => void
  setLogTab: (tab: SocialHistoryTab) => void
  toggleLogRow: (index: number) => void
  runLogRow: (index: number) => void
  clearLog: () => void
  /** The paste-an-import modal for profile URLs. */
  importOpen: boolean
  openImport: () => void
  closeImport: () => void
  importInput: (value: string) => void
  importPlatform: (value: string) => void
  /** How many usable lines the paste box holds, which is what the modal's pill reports. */
  importCount: number
  /**
   * Attaches the pasted URLs; the message it produces is handed to the app's own toast.
   *
   * It answers with a promise that settles when the import has been written and the page re-read,
   * which is what lets the scan overlay close on the work rather than on a timer.
   */
  importProfiles: (flash: (message: string) => void, lines?: string[]) => Promise<SocialImportResult | null>
  /**
   * What the import would do, line by line, worked out before it is run.
   *
   * The preview is the import's own matcher, so a line that says "attaches to …" is a line that
   * will attach: the modal shows the judgement rather than describing it.
   */
  importPreview: ImportPreviewRow[]
  importBadge: string
  importLabel: string
  importHint: string
  importReady: number
  refresh: () => void
  queueEnrichment: () => Promise<{ queued: number }>
  addProfile: (input: Omit<SocialProfileInput, 'workspaceId'>) => Promise<void>
  editProfile: (id: string, patch: { handle?: string; profileUrl?: string; followers?: number | null; verified?: boolean }) => Promise<void>
  removeProfile: (id: string) => Promise<void>
}

const DEMO_ROWS: SocialRowView[] = DEMO_SOCIAL_ROWS.map((row) => ({
  // The sample rows stand in for leads that do not exist, so they are keyed by their own index.
  leadId: `demo-${row.index}`,
  index: row.index,
  name: row.name,
  domain: row.domain,
  // The sample rows carry a chip and nothing else: there is no stored profile behind them for the
  // search to read, so the handle and the URL are empty.
  profiles: row.profiles.map((profile) => ({ label: profile.label, short: profile.short, handle: '', url: '' })),
  isDone: row.status === 'done',
  isPending: row.status === 'pending',
  noProfiles: row.profiles.length === 0,
}))

/** The five letter form a name and a search term are compared in. */
export function useSocialPage(): SocialPage {
  const db = useMemo(() => localDb(), [])
  const [live, setLive] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [rows, setRows] = useState<SocialRow[]>([])
  const [outcomes,setOutcomes]=useState<Record<string,{status:string;error?:string}>>({})
  const [total, setTotal] = useState(0)
  const [donuts, setDonuts] = useState<SocialDonut[]>(DEMO_SOCIAL_DONUTS)
  const [extras, setExtras] = useState<SocialExtra[]>(DEMO_SOCIAL_EXTRAS)
  const [search, setSearch] = useState('')
  const [history, setHistory] = useState<SocialSearchTerm[]>([])
  // The history panel: the log it lists, the tab it is on, and which row is open.
  const [logOpen, setLogOpen] = useState(false)
  const [logTab, setLogTab] = useState<SocialHistoryTab>('All')
  const [logEntries, setLogEntries] = useState<
    { id: string; kind: 'search' | 'import' | 'refresh' | 'action'; title: string; detail: string; items: string[]; hits: number | null; runTerm: string; createdAt: string }[]
  >([])
  const [logExpanded, setLogExpanded] = useState(-1)
  const [filter, setFilter] = useState<SocialFilter>('all')
  const [importOpen, setImportOpen] = useState(false)
  // The paste box and the platform dropdown are uncontrolled, as the reference markup has them.
  // Their values are read when the import runs, and their state lives here.
  const importText = useRef('')
  const importPlatform = useRef('')
  const [importCount, setImportCount] = useState(0)
  const [importPreview, setImportPreview] = useState<ImportPreviewRow[]>([])
  const importTimer = useRef<number | undefined>(undefined)
  // The search's own timer, and the rows it currently leaves on screen: the count that gets stored
  // with a term has to be the count that term produced.
  const searchTimer = useRef<number | undefined>(undefined)
  /**
   * The term as it stands, for the callbacks that commit it without re-reading the DOM.
   */
  const searchRef = useRef('')
  const filteredRowsRef = useRef<SocialRowView[]>([])
  /** A term whose result count has still to be written down, once the list has re-filtered. */
  const pendingCount = useRef('')

  const load = useCallback(async () => {
    if (!db) {
      setLive(false)
      setError(null)
      return
    }
    setLoading(true)
    setError(null)
    try {
      // The whole file is read, not a page of it: the search and the filter below are what decide
      // which rows are on screen, and they can only be honest about a lead the page has seen.
      const page = await fetchSocialPage(db, { limit: 200 })
      setRows(page.rows)
      setOutcomes(await db.jobs.outcomes('social'))
      setTotal(page.total)
      setDonuts(page.donuts)
      setExtras(page.extras)
      setLive(true)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The social profiles could not be loaded.')
    } finally {
      setLoading(false)
    }
  }, [db])

  useEffect(() => {
    void load()
  }, [load])

  const viewRows = useMemo<SocialRowView[]>(() => {
    if (!live) return DEMO_ROWS
    return rows.map((row) => ({
      leadId: row.leadId,
      index: row.index,
      name: row.name,
      domain: row.domain,
      // The chip is what the table draws; the handle and the URL ride along so the search can read
      // them, because a term copied out of a profile is as good a way in as the business name.
      profiles: row.profiles.map((profile) => ({
        ...platformMeta(profile.platform),
        handle: profile.handle,
        url: profile.profileUrl,
      })),
      scanError: outcomes[row.leadId]?.status==='error' ? outcomes[row.leadId].error || 'Scan failed. Retry this website.' : undefined,
      isDone: outcomes[row.leadId] ? ['found','not-published'].includes(outcomes[row.leadId].status) : row.status === 'done',
      isPending: row.domain !== 'No website found' && (outcomes[row.leadId] ? outcomes[row.leadId].status==='pending' : row.status === 'pending'),
      noProfiles: row.profiles.length === 0,
    }))
  }, [live, rows,outcomes])

  /**
   * What the search and the filter leave on screen.
   *
   * The two read the same row the table draws, so what is filtered out is exactly what the row
   * shows: the name and the domain for the search, and the profile chips and the website note for
   * the dropdown. "Pending" is a row a pass has not covered and no profile has been found for.
   *
   * The search also reads the profiles themselves — a handle or a profile URL — because a term
   * copied out of a profile is as good a way to find its lead as the business name is.
   */
  const filteredRows = useMemo(() => {
    if (!live) return viewRows
    return searchSavedRows(viewRows,search,row=>[row.name,row.domain,...row.profiles.flatMap(profile=>[profile.handle,profile.url])]).filter((row) => {
      if (filter === 'with') return row.profiles.length > 0
      if (filter === 'pending') return row.isPending
      if (filter === 'nowebsite') return row.domain === 'No website found'
      return true
    })
  }, [live, viewRows, search, filter])
  // Kept for the search callbacks, which record how many rows the term left on screen.
  filteredRowsRef.current = filteredRows
  searchRef.current = search

  // One row carries the loading, empty and error states: it only exists when there is nothing
  // else to show, so the reference layout is untouched once rows have loaded.
  const state = loading
    ? 'Loading social profiles…'
    : error
      ? `Could not load social profiles: ${error}`
      : live && !viewRows.length
        ? 'No leads yet — run a Google Maps scrape first, then enrich them here.'
        : live && !filteredRows.length
          ? 'No lead matches this search and filter.'
          : ''

  const refresh = useCallback(() => {
    void load()
  }, [load])

  /**
   * Reads the terms searched before, and writes the one being searched now.
   *
   * The count is stored with the term so the list can say what a search produced last time, which
   * is often the reason for picking it again.
   */
  const readHistory = useCallback(async () => {
    if (!db?.search) return
    try {
      setHistory(await db.search.history('social', 8))
    } catch {
      // A history that cannot be read is not worth reporting: the search itself still works.
    }
  }, [db])

  /**
   * Reads the log the panel lists.
   *
   * The tab decides the filter rather than the read: the panel's badge counts everything, and a tab
   * that only asked the database for its own slice would make the count jump as tabs change.
   */
  const readLog = useCallback(async () => {
    if (!db?.activity) return
    try {
      const entries = await db.activity.list({ scope: 'social', only: 'all', limit: 50 })
      setLogEntries(entries as typeof logEntries)
    } catch {
      // The panel is a record of what was done; failing to read it must not disturb the page.
    }
  }, [db])

  useEffect(() => {
    void readHistory()
    void readLog()
  }, [readHistory, readLog])

  // A term or a paste that was abandoned should not be left holding a timer.
  useEffect(
    () => () => {
      window.clearTimeout(searchTimer.current)
      window.clearTimeout(importTimer.current)
    },
    [],
  )

  /**
   * Escape closes the modal, which is what a dialog is expected to answer to. The backdrop is not
   * wired: the paste box is the only thing in it worth protecting from a stray click.
   */
  useEffect(() => {
    if (!importOpen && !logOpen) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setImportOpen(false)
      setLogOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [importOpen, logOpen])

  const recordSearch = useCallback(
    (term: string, results: number | null) => {
      if (!db?.search) return
      void db.search
        .record(term, 'social', results)
        .then(() => readHistory())
        .catch(() => undefined)
      // The same search is one entry in the panel's log: the database folds a repeat into the row
      // it already has rather than listing the term twice.
      void db.activity
        ?.log({ kind: 'search', title: term, runTerm: term, hits: results, scope: 'social' })
        .then(() => readLog())
        .catch(() => undefined)
    },
    [db, readHistory, readLog],
  )

  /**
   * The search box, as the user types.
   *
   * The term is stored once it is long enough to be worth offering back, and the count it produced
   * is written with it — but only after the typing pauses, so a search that is still being spelled
   * out does not fill the list with half-words.
   */
  const searchTerm = useCallback(
    (value: string) => {
      setSearch(value)
      // The pending write is cancelled first: clearing the box has to cancel the term that was
      // waiting to be stored, or the box would say one thing and the list remember another.
      window.clearTimeout(searchTimer.current)
      const term = value.trim()
      if (term.length < 2) return
      searchTimer.current = window.setTimeout(() => {
        const count = filteredRowsRef.current.length
        recordSearch(term, count)
        // Long enough that a term is not stored while it is still being typed, and short enough
        // that the list has caught up by the time the user looks at it.
      }, 600)
    },
    [recordSearch],
  )

  /**
   * A term picked from the list: the search runs again with exactly that text.
   *
   * What the term produces is written down once the list has re-filtered, not here: at this moment
   * the rows on screen are still the previous search's, which is what would be recorded against it.
   */
  const pickSearch = useCallback((term: string) => {
    setSearch(term)
    pendingCount.current = term
  }, [])

  /**
   * The term that is in the box right now, written down.
   *
   * The design commits on Enter, on a comma and on leaving the box — the moments a person means the
   * search they have typed — rather than on every keystroke, which would fill the list with the
   * halves of words. As with a picked term, the count is recorded after the list has caught up.
   */
  const commitSearch = useCallback(() => {
    const term = searchRef.current.trim()
    if (term.length < 2) return
    pendingCount.current = term
  }, [])

  useEffect(() => {
    const term = pendingCount.current
    if (!term || term !== search) return
    pendingCount.current = ''
    recordSearch(term, filteredRows.length)
  }, [search, filteredRows, recordSearch])

  /**
   * The rows the panel lists, and what each one says.
   *
   * A search reads as the term with what it left on screen; an import reads as how many profiles it
   * attached; a refresh or a finished pass reads as its own line. Everything opens except a line
   * that has nothing inside it, and only a search offers "Run again" — it is the one entry that can
   * be repeated exactly.
   */
  const logRows = useMemo<SocialHistoryRow[]>(() => {
    const visible = logEntries.filter((entry) =>
      logTab === 'All' ? true : logTab === 'Searches' ? entry.kind === 'search' : entry.kind !== 'search',
    )
    return visible.map((entry, index) => {
      const items = entry.kind === 'search' ? [entry.runTerm || entry.title] : entry.items
      const canOpen = items.length > 0
      const meta =
        entry.kind === 'search'
          ? `Search · ${entry.hits ?? 0} lead${(entry.hits ?? 0) === 1 ? '' : 's'} · ${historyStamp(entry.createdAt)}`
          : `${entry.detail ? `${entry.detail} · ` : ''}${historyStamp(entry.createdAt)}`
      return {
        kind: entry.kind,
        icon: HISTORY_ICONS[entry.kind] ?? '·',
        title: entry.kind === 'import' ? entry.title : entry.title || entry.detail,
        meta,
        items: items.map((text) => ({ text })),
        canOpen,
        isOpen: canOpen && logExpanded === index,
        open: canOpen ? (logExpanded === index ? '1' : '0') : 'none',
        canRun: entry.kind === 'search' && Boolean(entry.runTerm),
      }
    })
  }, [logEntries, logTab, logExpanded])

  const logVisible = useMemo(
    () =>
      logEntries.filter((entry) =>
        logTab === 'All' ? true : logTab === 'Searches' ? entry.kind === 'search' : entry.kind !== 'search',
      ),
    [logEntries, logTab],
  )

  const runLogRow = useCallback(
    (index: number) => {
      const entry = logVisible[index]
      if (!entry || entry.kind !== 'search' || !entry.runTerm) return
      setSearch(entry.runTerm)
      setLogOpen(false)
      const count = filteredRowsRef.current.length
      recordSearch(entry.runTerm, count)
    },
    [logVisible, recordSearch],
  )

  const clearLog = useCallback(() => {
    if (!db?.activity) return
    void db.activity
      .clear('social')
      .then(async () => {
        setLogExpanded(-1)
        await Promise.all([readLog(), readHistory()])
      })
      .catch(() => undefined)
  }, [db, readLog, readHistory])

  const openImport = useCallback(() => {
    importText.current = ''
    importPlatform.current = ''
    setImportCount(0)
    setImportPreview([])
    setImportOpen(true)
  }, [])

  const closeImport = useCallback(() => setImportOpen(false), [])

  /**
   * Works out what the paste would do, a beat after the typing stops.
   *
   * The judgement is the database's own — the same matcher the import uses — so a line shown as
   * attaching to a lead is a line that will attach to it. Waiting for the typing to settle keeps a
   * read of every lead on file from happening on each keystroke.
   */
  const previewImport = useCallback(() => {
    if (!db?.imports?.preview) return
    const lines = importText.current
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
    if (!lines.length) {
      setImportPreview([])
      return
    }
    void db.imports
      .preview(lines, importPlatform.current)
      .then((rows) => setImportPreview(rows))
      .catch(() => setImportPreview([]))
  }, [db])

  const importInput = useCallback(
    (value: string) => {
      importText.current = value
      setImportCount(
        value
          .split('\n')
          .map((line) => line.trim())
          .filter((line) => line && !line.startsWith('#')).length,
      )
      window.clearTimeout(importTimer.current)
      importTimer.current = window.setTimeout(previewImport, 350)
    },
    [previewImport],
  )

  const importPlatformChange = useCallback(
    (value: string) => {
      importPlatform.current = value
      previewImport()
    },
    [previewImport],
  )

  /**
   * Attaches the pasted URLs to the leads they name.
   *
   * Nothing is crawled: the paste already holds each profile. What cannot be matched to a lead is
   * reported rather than guessed at — an account filed under the wrong business is worse than one
   * the user is asked about.
   */
  const runImport = useCallback(
    (flash: (message: string) => void, given?: string[]): Promise<SocialImportResult | null> => {
      if (!db) {
        flash('The local database is not available in this window.')
        return Promise.resolve(null)
      }
      // The lines are handed over when the caller has already sorted the paste — the shared modal's
      // button splits it into sites and profiles, and only the profiles are its to file.
      const lines = given ?? importText.current
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
      if (!lines.length) {
        flash('Paste one profile URL per line, then import.')
        return Promise.resolve(null)
      }
      return db.imports
        .social(lines, importPlatform.current)
        .then(async (result) => {
          setImportOpen(false)
          await load()
          await readHistory()
          await readLog()
          const parts = [`${result.added} profile${result.added === 1 ? '' : 's'} attached`]
          // A URL that matched no lead gets one of its own, so the paste always shows something.
          if (result.created) parts.push(`${result.created} new lead${result.created === 1 ? '' : 's'} added`)
          if (result.skipped) parts.push(`${result.skipped} already on file`)
          if (result.unmatched.length) parts.push(`${result.unmatched.length} could not be read`)
          flash(result.added || result.unmatched.length ? `${parts.join(' · ')}.` : `Nothing new — ${parts.join(' · ')}.`)
          // The leads it landed on come back with it: the page narrows its table to exactly those.
          return result
        })
        .catch((caught: unknown) => {
          flash(caught instanceof Error ? caught.message : 'The import could not be read.')
          return null
        })
    },
    [db, load, readHistory, readLog],
  )

  const queueEnrichment = useCallback(async () => {
    if (!db) return { queued: 0 }
    const leadIds = await fetchLeadsMissingSocials(db)
    const { queued } = await startSocialEnrichment(db, leadIds)
    await load()
    return { queued }
  }, [db, load])

  const addProfile = useCallback(
    async (input: Omit<SocialProfileInput, 'workspaceId'>) => {
      if (!db) return
      await createSocialProfile(db, input)
      await load()
    },
    [db, load],
  )

  const editProfile = useCallback(
    async (id: string, patch: { handle?: string; profileUrl?: string; followers?: number | null; verified?: boolean }) => {
      if (!db) return
      await updateSocialProfile(db, id, patch)
      await load()
    },
    [db, load],
  )

  const removeProfile = useCallback(
    async (id: string) => {
      if (!db) return
      await deleteSocialProfile(db, id)
      await load()
    },
    [db, load],
  )

  return {
    rows: filteredRows,
    donuts: live ? donuts : DEMO_SOCIAL_DONUTS,
    extras: live ? extras : DEMO_SOCIAL_EXTRAS,
    state,
    live,
    loading,
    error,
    total: live ? total : DEMO_ROWS.length,
    showing: filteredRows.length,
    visibleLeadIds: filteredRows.map((row) => row.leadId),
    search,
    filter,
    setSearch: searchTerm,
    setFilter,
    commitSearch,
    history,
    pickSearch,
    logOpen,
    logTab,
    logCount: logEntries.length,
    logRows,
    logFoot:
      logVisible.length === 0
        ? 'Nothing here yet'
        : `${logVisible.length} ${logVisible.length === 1 ? 'entry' : 'entries'} · kept on this device`,
    openLog: () => {
      setLogExpanded(-1)
      setLogOpen(true)
    },
    closeLog: () => setLogOpen(false),
    setLogTab: (tab: SocialHistoryTab) => {
      setLogTab(tab)
      setLogExpanded(-1)
    },
    toggleLogRow: (index: number) => setLogExpanded((current) => (current === index ? -1 : index)),
    runLogRow,
    clearLog,
    importOpen,
    openImport,
    closeImport,
    importInput,
    importPlatform: importPlatformChange,
    importCount,
    importProfiles: runImport,
    importPreview,
    importReady: importPreview.filter((row) => row.kind !== 'skip').length,
    importBadge: (() => {
      if (!importPreview.length) return 'Nothing pasted yet'
      const ready = importPreview.filter((row) => row.kind !== 'skip').length
      const skipped = importPreview.length - ready
      return `${ready} ready${skipped ? ` · ${skipped} skipped` : ''}`
    })(),
    importLabel: (() => {
      const ready = importPreview.filter((row) => row.kind !== 'skip').length
      if (!ready) return 'Nothing to import'
      return `Import ${ready} profile${ready === 1 ? '' : 's'}`
    })(),
    importHint: importPreview.length
      ? `${importPreview.filter((row) => row.kind === 'match').length} attached to leads · ${importPreview.filter((row) => row.kind === 'new').length} new leads`
      : 'Each URL is attached to the lead its handle names, or becomes a lead of its own.',
    refresh,
    queueEnrichment,
    addProfile,
    editProfile,
    removeProfile,
  }
}
