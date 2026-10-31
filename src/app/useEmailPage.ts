// State for the Email Finder page.
//
// With the local database reachable, which it is whenever the app runs in Electron, the page
// reads the workspace's leads, their addresses and the coverage totals. Outside Electron it falls
// back to the reference sample rows, so the page looks identical either way.
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  createEmailAddress,
  deleteEmailAddress,
  fetchEmailPage,
  fetchLeadsMissingEmails,
  startEmailEnrichment,
  updateEmailAddress,
  type CoverageRing,
  type EmailAddressInput,
  type EmailCoverage,
  type EmailRow,
  type EmailTone,
} from '../lib/email'
import { localDb } from '../lib/local'
import { DEMO_EMAIL_COVERAGE, DEMO_EMAIL_ROWS } from './emailDemo'
import type { EmailValidityProgress } from '../types/desktop'

export interface EmailRowView {
  /** The lead the row belongs to, so the scan can tell whether its site has been read. */
  leadId: string
  index: string
  name: string
  domain: string
  primary: string
  hasExtras: boolean
  extrasLabel: string
  tone: EmailTone
  label: string
  validityStatus: EmailRow['validityStatus']
  statusLabel: string
  isFound: boolean
  isMuted: boolean
  /** Every address on the lead's own site, each labelled with the page it was read from. */
  found: EmailRow['found']
}

export interface EmailPage {
  rows: EmailRowView[]
  coverage: EmailCoverage
  /** Message for the single state row — empty when rows are on screen. */
  state: string
  live: boolean
  loading: boolean
  error: string | null
  verifying: boolean
  validityProgress: EmailValidityProgress
  cancelValidity: () => Promise<void>
  isTone: (tone: EmailTone, want: EmailTone) => boolean
  refresh: () => Promise<void>
  queueEnrichment: () => Promise<{ queued: number }>
  addAddress: (input: EmailAddressInput) => Promise<void>
  editAddress: (id: string, patch: { value?: string; verified?: boolean; score?: number | null }) => Promise<void>
  removeAddress: (id: string) => Promise<void>
  verifyValidity: (leadIds?: string[], force?: boolean) => Promise<EmailValiditySummary>
  recheckUnknownValidity: (leadIds?: string[]) => Promise<EmailValiditySummary>
}

export interface EmailValiditySummary {
  configured: boolean
  provider: 'apify' | 'leadsangel' | 'mailverifier' | 'local'
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
}

const EMPTY_VALIDITY_PROGRESS: EmailValidityProgress = {
  state: 'idle', message: '', total: 0, checked: 0, failed: 0, pending: 0, retries: 0, batchSize: 0,
}

const DEMO_ROWS: EmailRowView[] = DEMO_EMAIL_ROWS.map((row) => ({
  leadId: row.index,
  index: row.index,
  name: row.name,
  domain: row.domain,
  primary: row.primary,
  hasExtras: row.hasExtras,
  extrasLabel: row.extrasLabel,
  tone: row.tone,
  label: row.label,
  validityStatus: null,
  statusLabel: row.statusLabel,
  isFound: row.isFound,
  isMuted: row.isMuted,
  // The sample rows carry one address each, read off the row's own domain front page unless the
  // reference says the lead has none.
  found: row.isFound
    ? [{
        value: row.primary,
        page: 'Homepage',
        publishedOnOwnSite: false,
        score: null,
        validationStatus: null,
        validationLabel: 'Not checked',
        validationMessage: '',
      }]
    : [],
}))

/**
 * The coverage rings with no database behind them.
 *
 * The reference document draws the scan's four rings as loops with nothing in them — the sample
 * page never ran the scan — so the figures that match its rows are supplied here: the ten sample
 * leads, counted by the page their address reads as.
 */
const DEMO_RINGS: CoverageRing[] = [
  { name: 'Homepage', count: 7 },
  { name: 'Contact page', count: 6 },
  { name: 'Team page', count: 2 },
  { name: 'Structured data', count: 1 },
]

const DEMO_COVERAGE: EmailCoverage = {
  ...DEMO_EMAIL_COVERAGE,
  validity: { valid: 0, invalid: 0, risky: 0, unknown: 0, unchecked: DEMO_EMAIL_COVERAGE.extracted },
  rings: DEMO_RINGS,
}

export function useEmailPage(): EmailPage {
  const db = useMemo(() => localDb(), [])
  const [live, setLive] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [verifying, setVerifying] = useState(false)
  const [validityProgress, setValidityProgress] = useState<EmailValidityProgress>(EMPTY_VALIDITY_PROGRESS)
  const [rows, setRows] = useState<EmailRow[]>([])
  const [coverage, setCoverage] = useState<EmailCoverage>(DEMO_COVERAGE)

  const load = useCallback(async () => {
    if (!db) {
      setLive(false)
      setError(null)
      return
    }
    setLoading(true)
    setError(null)
    try {
      // Validity filters describe the whole local database, so the table must carry the whole
      // workspace too. Otherwise a global "Not checked" count could filter to an empty first page.
      const page = await fetchEmailPage(db, { limit: 500 })
      setRows(page.rows)
      setCoverage(page.coverage)
      setLive(true)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The addresses could not be loaded.')
    } finally {
      setLoading(false)
    }
  }, [db])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    const validity = window.desktop?.emailValidity
    if (!validity) return
    let refreshed=0,timer:number|undefined
    const sync = (progress: EmailValidityProgress) => {
      setValidityProgress(progress)
      setVerifying(progress.state === 'running' || progress.state === 'cancelling')
      if(progress.checked>refreshed){refreshed=progress.checked;window.clearTimeout(timer);timer=window.setTimeout(()=>void load(),200)}
      if(progress.state==='running'&&progress.checked===0)refreshed=0
    }
    const unsubscribe = validity.onProgress(sync)
    void validity.status().then((status) => sync(status.progress)).catch(() => undefined)
    return ()=>{unsubscribe();window.clearTimeout(timer)}
  }, [load])

  const viewRows = useMemo<EmailRowView[]>(() => {
    if (!live) return DEMO_ROWS
    return rows.map((row) => {
      const isFound = row.statusLabel.startsWith('Found ')
      return {
        leadId: row.leadId,
        index: row.index,
        name: row.name,
        domain: row.domain,
        primary: row.primary,
        hasExtras: row.hasExtras,
        extrasLabel: row.extrasLabel,
        tone: row.tone,
        label: row.label,
        validityStatus: row.validityStatus,
        statusLabel: row.statusLabel,
        isFound,
        isMuted: !isFound,
        found: row.found,
      }
    })
  }, [live, rows])

  // One row carries the loading, empty and error states: it only exists when there is nothing
  // else to show, so the reference layout is untouched once rows have loaded.
  const state = loading
    ? 'Loading addresses…'
    : error
      ? `Could not load addresses: ${error}`
      : live && !viewRows.length
        ? 'No leads yet — run a Google Maps scrape first, then find addresses here.'
        : ''

  const refresh = useCallback(async () => {
    await load()
  }, [load])

  const isTone = useCallback((tone: EmailTone, want: EmailTone) => tone === want, [])

  const queueEnrichment = useCallback(async () => {
    if (!db) return { queued: 0 }
    const leadIds = await fetchLeadsMissingEmails(db)
    const { queued } = await startEmailEnrichment(db, leadIds)
    await load()
    return { queued }
  }, [db, load])

  const addAddress = useCallback(
    async (input: EmailAddressInput) => {
      if (!db) return
      await createEmailAddress(db, input)
      await load()
    },
    [db, load],
  )

  const editAddress = useCallback(
    async (id: string, patch: { value?: string; verified?: boolean; score?: number | null }) => {
      if (!db) return
      await updateEmailAddress(db, id, patch)
      await load()
    },
    [db, load],
  )

  const removeAddress = useCallback(
    async (id: string) => {
      if (!db) return
      await deleteEmailAddress(db, id)
      await load()
    },
    [db, load],
  )

  const verifyValidity = useCallback(
    async (leadIds?: string[], force = false): Promise<EmailValiditySummary> => {
      if (!window.desktop?.emailValidity) throw new Error('Email validity checks are only available in the Electron app.')
      setVerifying(true)
      try {
        const result = await window.desktop.emailValidity.verify({ leadIds, force })
        await load()
        return result
      } finally {
        setVerifying(false)
      }
    },
    [load],
  )

  const recheckUnknownValidity = useCallback(async (leadIds?:string[]): Promise<EmailValiditySummary> => {
    if (!window.desktop?.emailValidity) throw new Error('Email validity checks are only available in the Electron app.')
    setVerifying(true)
    try {
      const result = await window.desktop.emailValidity.verify({ recheckUnknown: true,leadIds })
      await load()
      return result
    } finally {
      setVerifying(false)
    }
  }, [load])

  const cancelValidity = useCallback(async () => {
    await window.desktop?.emailValidity.cancel()
  }, [])

  return {
    rows: viewRows,
    // The demo coverage is a complete object, so it doubles as the shape when nothing is live.
    coverage: live ? coverage : DEMO_COVERAGE,
    state,
    live,
    loading,
    error,
    verifying,
    validityProgress,
    cancelValidity,
    isTone,
    refresh,
    queueEnrichment,
    addAddress,
    editAddress,
    removeAddress,
    verifyValidity,
    recheckUnknownValidity,
  }
}
