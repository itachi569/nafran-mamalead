// The reference app keeps everything in one component: a state object plus renderVals(), which
// hands the template a flat bag of values and callbacks. This hook is that same component — the
// state, the actions and the values bag — with two deliberate changes:
//
//   1. runScrape() drives the real Chromium worker instead of a timer, and captured leads flow
//      into the same tables the reference filled with sample rows.
//   2. Nothing else changes: labels, counts, copy and behaviour follow the reference so the
//      interface stays identical.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  CandidateRow,
  DashboardTotals,
  DecisionMakerFunnel,
  DecisionMakerRow,
  EnrichmentProgress,
  Lead,
  LeadSummary,
  PhoneRow,
  PhoneSummary,
  StoredLead,
  StoredList,
  StoredRun,
  UpdateStatus,
} from '../types/desktop'
import { bindHover, buildTimeline, layout, mountLottie, releaseDetachedAnimations, scrollChat } from './domEffects'
import {
  CHAT_CHIPS,
  DELIMS,
  DEMO_NOTES,
  EXP_MODES,
  LABELS,
  VIEW_NAMES,
  type LeadRow,
} from './referenceData'
import { localDb } from '../lib/local'
import { describeDeepKey, readDeepKey, storeDeepKey } from './deepKey'
import { pageLabelOf, type EmailTone } from '../lib/email'
import { districtsFor, townOf } from './districts'
import { PACE_LIMITS, paceToMs, readScraperSettings, storeScraperSettings, type ScraperSettings } from './scraperSettings'
import { paintTheme, readStoredTheme, storeTheme } from './theme'
import { useEmailPage } from './useEmailPage'
import { matchesFinderSearch, useFinderScan } from './useFinderScan'
import { SCRAPER_HEADLESS, useScraper, storedToLead } from './useScraper'
import { useSocialPage, type SocialPage } from './useSocialPage'

type SimpleExportSelection = { title: string; summary: string; request: Parameters<NonNullable<ReturnType<typeof localDb>>['exports']['write']>[0] }

const DEFAULT_KEEP = [true, true, true, true, false, false, false, false, false, false]
const VIEWS_WITH_REAL_DATA = ['leads', 'lists', 'runs', 'settings']
const INITIAL_CHAT_MESSAGES: { who: string; text: string }[] = []
/** How many leads one page of the ledger draws before its own "Load 20 more" is offered. */
const LEDGER_PAGE = 200
const MAX_MAP_KEYWORDS = 8
const NOTIFICATIONS_STORAGE_KEY = 'nafran.notifications'
const NOTIFICATIONS_ENABLED_KEY = 'nafran.notifications.enabled'
const LIFETIME_CHECKOUT_PENDING_KEY = 'nafran.billing.lifetimeCheckoutUntil'
const DECISION_CHECKOUT_PENDING_KEY = 'nafran.billing.decisionCheckoutUntil'
const DECISION_100_ALERT_KEY = 'nafran.billing.decision100Alert'
const DECISION_500_ALERT_KEY = 'nafran.billing.decision500Alert'

export type AppNotification = {
  runId?: string
  id: string
  title: string
  body: string
  at: string
  level: 'info' | 'success' | 'error'
  unread: boolean
}

function readStoredNotifications(): AppNotification[] {
  if (typeof window === 'undefined') return []
  try {
    const parsed = JSON.parse(window.localStorage.getItem(NOTIFICATIONS_STORAGE_KEY) ?? '[]') as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item): item is AppNotification => {
      if (!item || typeof item !== 'object') return false
      const value = item as Partial<AppNotification>
      return (
        typeof value.id === 'string' &&
        typeof value.title === 'string' &&
        typeof value.body === 'string' &&
        typeof value.at === 'string' &&
        (value.level === 'info' || value.level === 'success' || value.level === 'error') &&
        typeof value.unread === 'boolean'
      )
    }).slice(0, 20)
  } catch {
    return []
  }
}

function storeNotifications(items: AppNotification[]): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(NOTIFICATIONS_STORAGE_KEY, JSON.stringify(items.slice(0, 20)))
  } catch {
    // Notifications should never make the app fail when local storage is unavailable.
  }
}

function readNotificationsEnabled(): boolean {
  if (typeof window === 'undefined') return true
  try {
    return window.localStorage.getItem(NOTIFICATIONS_ENABLED_KEY) !== '0'
  } catch {
    return true
  }
}

function readPendingLifetimeCheckout(): number {
  if (typeof window === 'undefined') return 0
  try {
    const until = Number(window.localStorage.getItem(LIFETIME_CHECKOUT_PENDING_KEY))
    return Number.isFinite(until) && until > Date.now() && until < Date.now() + 60 * 60 * 1000 ? until : 0
  } catch {
    return 0
  }
}

function readPendingDecisionCheckout(): number {
  if (typeof window === 'undefined') return 0
  try {
    const until = Number(window.localStorage.getItem(DECISION_CHECKOUT_PENDING_KEY))
    return Number.isFinite(until) && until > Date.now() && until < Date.now() + 60 * 60 * 1000 ? until : 0
  } catch { return 0 }
}

/** Cleans a pasted keyword list while preserving the user's order. */
function parseBulkKeywords(raw: string): { terms: string[]; supplied: number; duplicates: number } {
  const supplied = String(raw ?? '')
    .split(/[\r\n,;\t]+/)
    .map((term) => term.replace(/^\s*(?:[-*•]+|\d+[.)])\s*/, '').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
  const seen = new Set<string>()
  const terms = supplied.filter((term) => {
    const key = term.toLocaleLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
  return { terms, supplied: supplied.length, duplicates: supplied.length - terms.length }
}

function notificationTime(at: string): string {
  const date = new Date(at)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

// Contact completeness, in the same spirit as the reference's score column: a lead with a
// website, a phone number, a rating and real review volume is worth contacting first.
function scoreLead(lead: Lead): number {
  let score = 40
  if (lead.website) score += 20
  if (lead.phone) score += 20
  if (lead.rating !== null) score += 10
  if ((lead.reviewCount ?? 0) > 50) score += 10
  return score
}

function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000))
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

function initialsOf(name: string): string {
  return (
    name
      .split(/\s+/)
      .slice(0, 2)
      .map((word) => word.charAt(0).toUpperCase())
      .join('') || '—'
  )
}

/** The delays Run Behaviour offers, as pairs the runner can build a wait from. */
const PACE_CHOICES: { label: string; seconds: number }[] = [
  { label: '1.5 s · quick', seconds: 1.5 },
  { label: '3 s · steady', seconds: 3 },
  { label: '6 s · careful', seconds: 6 },
  { label: '10 s · very gentle', seconds: 10 },
]

/**
 * The browsers the picker offers beside the bundled build.
 *
 * A browser carrying its own brand and version presents better to Google than a build that says it
 * is automation, so Chrome, Edge and Brave are offered by their usual install paths. A machine that
 * has none of them simply shows the bundled entry, and the run uses a program — never a profile.
 */
const BROWSER_PATHS: { label: string; path: string }[] = [
  { label: 'Bundled Chromium', path: '' },
  { label: 'Google Chrome', path: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' },
  { label: 'Google Chrome (x86)', path: 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe' },
  { label: 'Microsoft Edge', path: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe' },
  { label: 'Brave', path: 'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe' },
]

/** "2 Sep" — the form the reference uses in the saved column. */
function shortDate(iso: string): string {  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

/** Measured extent of the pins drawn in the coverage panel, never a claimed scraper limit. */
function pinSpread(leads: Lead[]): string {
  const points = leads.slice(0, 8).filter((lead): lead is Lead & { latitude: number; longitude: number } =>
    Number.isFinite(lead.latitude) && Number.isFinite(lead.longitude))
  if (!points.length) return 'No geolocated pins yet'
  if (points.length === 1) return '1 geolocated pin'
  const centreLat = points.reduce((sum, point) => sum + point.latitude, 0) / points.length
  const centreLng = points.reduce((sum, point) => sum + point.longitude, 0) / points.length
  const radians = (degrees: number) => degrees * Math.PI / 180
  const farthest = Math.max(...points.map((point) => {
    const latDelta = radians(point.latitude - centreLat)
    const lngDelta = radians(point.longitude - centreLng)
    const a = Math.sin(latDelta / 2) ** 2
      + Math.cos(radians(centreLat)) * Math.cos(radians(point.latitude)) * Math.sin(lngDelta / 2) ** 2
    return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  }))
  return farthest < 0.1 ? 'Pins share one location' : `Pins span about ${farthest < 10 ? farthest.toFixed(1) : Math.round(farthest)} km from centre`
}

/** "2 Sep, 09:41" — the form the design uses under a run's own terms. */
function shortDateTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return `${shortDate(iso)}, ${date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`
}

/** The terms a run was given. Stored as JSON, and an unreadable row is one with no terms. */
function termsOfRun(run: { keywords: string }): string {
  try {
    const parsed = JSON.parse(run.keywords) as unknown
    return Array.isArray(parsed) ? parsed.join(', ') : ''
  } catch {
    return ''
  }
}

/** The networks a pasted URL can be a profile on, matching what the profile importer files. */
const PROFILE_HOSTS = [
  'instagram.com',
  'facebook.com',
  'fb.com',
  'linkedin.com',
  'tiktok.com',
  'youtube.com',
  'youtu.be',
  'twitter.com',
  'x.com',
]

/**
 * Whether a pasted line is a social profile rather than a website of its own.
 *
 * One modal serves every page: its stated job is "Import websites", and the Social Profiles page
 * opens that same box. So which import a line belongs to is read from the line itself — a URL on a
 * network the app files profiles for is a profile, anything else is a site. That is what stops a
 * pasted website from landing on the profile importer and being reported as nothing to import.
 *
 * A bare `@handle` is a profile because that is the only thing it can be. A bare word is left to the
 * site importer, which is the component that decides whether a domain is usable.
 */
function isProfileLine(line: string): boolean {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#')) return false
  if (trimmed.startsWith('@')) return true
  if (!/[/.]/.test(trimmed)) return false
  const withScheme = /^[a-z]+:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  try {
    const host = new URL(withScheme).hostname.replace(/^www\./i, '').toLowerCase()
    return PROFILE_HOSTS.some((known) => host === known || host.endsWith(`.${known}`))
  } catch {
    return false
  }
}

/** The lines a paste box holds: one per line, trimmed, with blanks and comments dropped. */
function pastedLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
}

/** Reads a small CSV/TSV export without adding a heavyweight parser to the renderer. */
function csvRows(text: string): string[][] {
  const delimiter = text.split(/\r?\n/, 1)[0]?.includes('\t')
    ? '\t'
    : text.split(/\r?\n/, 1)[0]?.includes(';')
      ? ';'
      : ','
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    const next = text[index + 1]
    if (char === '"') {
      if (quoted && next === '"') {
        cell += '"'
        index += 1
      } else quoted = !quoted
    } else if (char === delimiter && !quoted) {
      row.push(cell.trim())
      cell = ''
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') index += 1
      row.push(cell.trim())
      if (row.some(Boolean)) rows.push(row)
      row = []
      cell = ''
    } else cell += char
  }
  row.push(cell.trim())
  if (row.some(Boolean)) rows.push(row)
  return rows
}

function looksLikeWebsite(value: string): boolean {
  const candidate = value.trim().replace(/^['"]|['"]$/g, '')
  return /^(?:https?:\/\/)?(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:[/:?#].*)?$/i.test(candidate)
}

/** Picks a website/domain column from CSV exports, falling back to the first domain-like column. */
function websiteLinesFromCsv(text: string): string[] {
  const rows = csvRows(text)
  if (!rows.length) return []
  const headerIndex = rows[0].findIndex((value) => /website|domain|url|site/i.test(value))
  const dataStart = headerIndex >= 0 ? 1 : 0
  let column = headerIndex >= 0 ? headerIndex : 0
  if (headerIndex < 0) {
    let best = 0
    let bestScore = 0
    const width = Math.max(...rows.map((row) => row.length))
    for (let candidate = 0; candidate < width; candidate += 1) {
      const score = rows.slice(dataStart).filter((row) => looksLikeWebsite(row[candidate] ?? '')).length
      if (score > bestScore) {
        best = candidate
        bestScore = score
      }
    }
    column = best
  }
  return [...new Set(rows.slice(dataStart).map((row) => (row[column] ?? '').trim()).filter(looksLikeWebsite))]
}

/** Explain the saved account while keeping the guest option available before every run. */
function googleNoteFor(status: { profile: boolean; signedIn: boolean } | null): string {
  if (status?.signedIn) {
    return 'Google account connected. Choose this account or a private guest session before scanning.'
  }
  if (status?.profile) {
    return 'No account signed into the saved profile. You can sign in or continue as a guest.'
  }
  return 'Choose Google sign-in or a private guest session before each run.'
}

/** One reading of a lead, shared by the ledger rows, the filter chips and the summary card. */
interface LedgerLead {
  ini: string
  name: string
  domain: string
  area: string
  saved: string
  score: number
  /** The reference's rating cell: "4.8 ★ 213", or "Not rated". */
  rating: string
  /** The reference's trailing note on a pick card. */
  note: string
  hasPhone: boolean
  hasEmail: boolean
  hasSocial: boolean
  source: 'maps' | 'import' | 'manual'
}

const SOURCE_LABELS: Record<LedgerLead['source'], string> = { maps: 'Maps', import: 'Import', manual: 'Manual' }

/**
 * Dialling code to the place it reaches. Only the codes a UK lead is likely to carry are named;
 * anything else falls back to the code itself, which is still the honest answer.
 */
const AREA_NAMES: Record<string, string> = {
  '0161': 'Manchester',
  '0151': 'Liverpool',
  '01204': 'Bolton',
  '01625': 'Macclesfield',
  '0113': 'Leeds',
  '0114': 'Sheffield',
  '0117': 'Bristol',
  '0121': 'Birmingham',
  '0131': 'Edinburgh',
  '0141': 'Glasgow',
  '0191': 'Newcastle',
  '020': 'London',
  '07 mobile': 'UK mobile',
}

/** The host of a website, which is what the ledger's domain column shows. */
function hostOf(website: string): string {
  if (!website) return 'No website found'
  try {
    return new URL(website).host.replace(/^www\./i, '')
  } catch {
    // A stored value that is not a full URL still reads better with its prefix trimmed.
    return website.replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0] || 'No website found'
  }
}

function leadToLedger(lead: Lead): LedgerLead {
  return {
    ini: initialsOf(lead.name),
    name: lead.name,
    domain: hostOf(lead.website),
    area: lead.area || lead.address || 'Address pending',
    saved: shortDate(lead.capturedAt),
    score: scoreLead(lead),
    rating: lead.rating === null ? 'Not rated' : `${lead.rating} ★ ${lead.reviewCount ?? 0}`,
    note: lead.reviewCount ? `${lead.reviewCount} reviews` : lead.category || 'Captured lead',
    hasPhone: Boolean(lead.phone),
    hasEmail: false,
    hasSocial: false,
    // Where the lead came from: a Maps capture, a pasted website, or one typed in by hand.
    source: lead.provider === 'import' ? 'import' : lead.provider === 'chromium-maps' ? 'maps' : 'manual',
  }
}

function storedToLedger(row: StoredLead): LedgerLead {
  return {
    ini: initialsOf(row.name),
    name: row.name,
    domain: hostOf(row.website),
    area: row.area || row.address || 'Address pending',
    saved: shortDate(row.captured_at),
    score: 40 + (row.website ? 20 : 0) + (row.phone ? 20 : 0) + (row.rating !== null ? 10 : 0) + ((row.review_count ?? 0) > 50 ? 10 : 0),
    rating: row.rating === null ? 'Not rated' : `${row.rating} ★ ${row.review_count ?? 0}`,
    note: row.review_count ? `${row.review_count} reviews` : row.category || 'Captured lead',
    hasPhone: Boolean(row.phone),
    hasEmail: Boolean(row.has_email),
    hasSocial: Boolean(row.has_social),
    source: row.provider === 'import' ? 'import' : row.provider === 'chromium-maps' ? 'maps' : 'manual',
  }
}

/** Offline demo mode paints the reference's own sample rows through the same bindings. */
function pickToLedger(row: LeadRow): LedgerLead {
  return {
    ini: row[0],
    name: row[1],
    domain: row[2],
    area: row[3],
    saved: '',
    score: row[5],
    rating: row[4],
    note: row[9],
    hasPhone: row[6] === 1,
    hasEmail: row[7] === 1,
    hasSocial: row[8] === 1,
    source: 'maps',
  }
}

const LEDGER_FILTERS: [string, (lead: LedgerLead) => boolean][] = [
  ['All', () => true],
  ['Has phone', (lead) => lead.hasPhone],
  ['Has email', (lead) => lead.hasEmail],
  ['Has socials', (lead) => lead.hasSocial],
  ['No contact yet', (lead) => !lead.hasPhone && !lead.hasEmail && !lead.hasSocial],
]
const LEAD_FILTER_KEYS = ['all', 'phone', 'email', 'social', 'missing'] as const

/**
 * Which enrichment pass a button label asks for, or null when it is not an enrichment action.
 *
 * The reference bound these buttons to a toast. They name real work — "Find & verify needed",
 * "Enrich all pending", "Deep enrich all missing" — so the label decides the pass and the worker
 * does the rest.
 */
function enrichmentForLabel(label: string): 'email' | 'phone' | 'social' | 'decision-maker' | null {
  if (/decision maker|decision-maker|named contact/i.test(label)) return 'decision-maker'
  if (/phone|callable|direct line/i.test(label)) return 'phone'
  if (/social|instagram|profile/i.test(label)) return 'social'
  if (/email|address|smtp|verify|search missing|enrich|deep enrich|cascade/i.test(label)) return 'email'
  return null
}

export function useAppValues() {
  const { snapshot, start, stop, reload } = useScraper()
  // Named explicitly: the values object is built from this, and an inferred page type that is only
  // ever read through `V.` gives the generated component nothing to check its bindings against.
  const social: SocialPage = useSocialPage()
  const email = useEmailPage()
  const db = useMemo(() => localDb(), [])

  const [view, setView] = useState('dashboard')
  const [range, setRange] = useState<'7 Days' | '30 Days' | 'All Time'>('30 Days')
  const [maxResults, setMaxResults] = useState(25)
  const [dark, setDark] = useState(readStoredTheme)
  // How the browser behaves during a run. Both survive a restart, because a choice made after
  // being throttled should not have to be made again on the next launch.
  const [scraperSettings, setScraperSettings] = useState<ScraperSettings>(readScraperSettings)
  // What the app's own Google profile holds. The folder belongs to the main process, so the window
  // asks rather than assumes: null until it has an answer, which is why the note has a wording for
  // "not read yet" as well as for "nothing saved".
  const [googleStatus, setGoogleStatus] = useState<{ profile: boolean; signedIn: boolean } | null>(null)
  /**
   * The app's own Google window, shown as a panel rather than left to a browser with no
   * explanation.
   *
   * The sign-in itself happens in the real Chromium window this app opens — a panel inside the
   * interface cannot type a password Google would accept. So the panel says what is happening and
   * what the user has to do, follows the connection as it happens, and reports when it lands.
   */
  const [googlePanel, setGooglePanel] = useState<'closed' | 'open' | 'waiting' | 'connected'>('closed')
  /**
   * The scan that follows an import.
   *
   * "Import websites" reads each site it is given and files the social profiles that site
   * publishes, so the work takes real time and the design gives it a panel of its own: the sites
   * being read, how far it has got, and what it has found so far. When it finishes the table below
   * comes down to those sites — the URLs just given — and everything else waits behind "Show all
   * leads".
   */
  const [scan, setScan] = useState<{
    phase: 'idle' | 'scanning' | 'done' | 'covered'
    /** The social enrichment job created by this website scan, if one was queued. */
    jobId: string
    /** What was pasted, which is what the coverage card counts. */
    urls: string[]
    /** The leads the paste landed on, in the order the URLs were given. */
    leadIds: string[]
    /** Which of those sites the pass has finished reading. */
    scannedIds: string[]
    /** The site being read right now, as the worker names it. */
    activeName: string
    /** How many profiles the pass has filed so far. */
    found: number
    added: number
  }>({
    phase: 'idle',
    jobId: '',
    urls: [],
    leadIds: [],
    scannedIds: [],
    activeName: '',
    found: 0,
    added: 0,
  })
  // Districts added by the split control, if any. Empty means one search per keyword.
  const [districtSearches, setDistrictSearches] = useState<string[]>([])
  const [swWebsite, setSwWebsite] = useState(false)
  const [mapsWebsite, setMapsWebsite] = useState('any')
  const [mapsRunId, setMapsRunId] = useState('latest')
  const [mapsLatestLeads, setMapsLatestLeads] = useState<Lead[]>([])
  const [mapsHistoryLeads, setMapsHistoryLeads] = useState<Lead[] | null>(null)
  const [mapsSelected, setMapsSelected] = useState<string[]>([])
  const [runMinimized, setRunMinimized] = useState(false)
  const [mapsPrompt, setMapsPrompt] = useState<'google' | 'license' | 'stop' | null>(null)
  const [billingJump, setBillingJump] = useState<{ target: 'trial' | 'lifetime' | 'license' } | null>(null)
  const clearBillingJump = useCallback(() => setBillingJump(null), [])
  const [featureBilling, setFeatureBilling] = useState<Awaited<ReturnType<NonNullable<Window['desktop']>['billing']['status']>> | null>(null)
  const showAccessPrompt = useCallback(() => { setReportsOpen(false); setMapsPrompt('license') }, [])
  const featureAccessAllowed = useCallback(() => {
    if (!featureBilling?.connected) return false
    const status = featureBilling
    const core = status.coreLicenseActive ?? Boolean(status.license?.active && status.license.kind !== 'decision')
    const trialValid = status.trial?.active && (!status.trial.expiresAt || Date.parse(status.trial.expiresAt) > Date.now())
    if (core && (status.lifetime?.active || trialValid)) return true
    const decisionKey = status.decisionKeyActive ?? (status.license?.active && status.license.kind === 'decision')
    return view === 'dm' && Boolean(decisionKey && status.decisionMaker?.active && status.decisionMaker.monthlyRemaining > 0 &&
      (!status.decisionMaker.renewsAt || Date.parse(status.decisionMaker.renewsAt) > Date.now()))
  }, [featureBilling, view])
  const [reportsOpen, setReportsOpen] = useState(false)
  const [reportsLoading, setReportsLoading] = useState(false)
  const [reportsError, setReportsError] = useState('')
  const [swPhone, setSwPhone] = useState(false)
  const [chEmails, setChEmails] = useState(true)
  const [chPhones, setChPhones] = useState(true)
  const [chSocial, setChSocial] = useState(true)
  const [chLinkedin, setChLinkedin] = useState(false)
  const [keywords, setKeywords] = useState<string[]>(['physiotherapy', 'skin care doctor', 'sports massage'])
  const [bulkKeywordsOpen, setBulkKeywordsOpen] = useState(false)
  const [bulkKeywordsText, setBulkKeywordsText] = useState('')
  const [stab, setStab] = useState('plan')
  const [lifetimeCheckoutUntil, setLifetimeCheckoutUntil] = useState(readPendingLifetimeCheckout)
  const [licenseNextStep, setLicenseNextStep] = useState('')
  const [swWarn, setSwWarn] = useState(readNotificationsEnabled)
  const [impOpen, setImpOpen] = useState(false)
  const [impCount, setImpCount] = useState(3)
  const [impValue, setImpValue] = useState('')
  // The shared paste box: what is in it, and how many lines that is. The modal's button appears
  // only once there is something to import.
  const impText = useRef('')
  const [impLines, setImpLines] = useState(0)
  /**
   * What the open paste box holds, split by what each line is.
   *
   * The modal's job is websites and the Social Profiles page opens the same box, so how many lines
   * are sites and how many are profiles is what decides the button's words and what it does. Both
   * counts are kept rather than one total, because a paste can hold either or both.
   */
  const [impSites, setImpSites] = useState(0)
  const [impProfiles, setImpProfiles] = useState(0)
  /** Whether the open import modal is the Social Profiles one, which files profile URLs. */
  const socialImportOpen = social.importOpen
  const [expOpen, setExpOpen] = useState(false)
  const [exportSelection, setExportSelection] = useState<SimpleExportSelection | null>(null)
  const [exportBusy, setExportBusy] = useState(false)
  const exportLock = useRef(false)
  const [profileExportOpen, setProfileExportOpen] = useState(false)
  const [expMode, setExpMode] = useState('leads')
  const [expScope, setExpScope] = useState(0)
  const [expCols, setExpCols] = useState(() => EXP_MODES.leads.cols.map((column) => ({ label: column[0], on: column[1] })))
  const [keep, setKeep] = useState<boolean[]>(DEFAULT_KEEP)
  const [listTarget, setListTarget] = useState('')
  const [newListName, setNewListName] = useState('')
  const [leadFilter, setLeadFilter] = useState(0)
  /** What is typed in the ledger's own search box: it narrows the rows beside it. */
  const [leadSearch, setLeadSearch] = useState('')
  /** Where the local database file sits and how large it is, as the store card states it. */
  const [store, setStore] = useState<{ path: string; size: string } | null>(null)
  /** Which blocker the Decision Makers page is filtering its unmatched leads by. */
  const [dmBlocker, setDmBlocker] = useState('All blockers')
  // The DataForSEO key: the saved one, what is typed over it, and what the account last said.
  const [deepKey, setDeepKey] = useState(readDeepKey)
  const [deepKeyDraft, setDeepKeyDraft] = useState('')
  const [deepKeyCheck, setDeepKeyCheck] = useState<{ ok: boolean; balance: number | null; note: string } | null>(null)
  const [deepKeyTesting, setDeepKeyTesting] = useState(false)
  /** True when this machine's environment supplied the key rather than the app's own Settings. */
  const [deepKeyFromEnvironment, setDeepKeyFromEnvironment] = useState(false)
  const [leadsAngelConfigured, setLeadsAngelConfigured] = useState(false)
  const [leadsAngelExpiresOn, setLeadsAngelExpiresOn] = useState<string | null>(null)
  /** Number of captured Maps leads the user wants to send through the owner/email pass. */
  const [deepLeadLimit, setDeepLeadLimit] = useState(10)
  const [runFilter, setRunFilter] = useState(0)
  const [delim, setDelim] = useState(0)
  const [chatOpen, setChatOpen] = useState(false)
  const [chatTyping, setChatTyping] = useState(false)
  const [mailSent, setMailSent] = useState(false)
  const [mailOpen, setMailOpen] = useState(false)
  const [toast, setToast] = useState('')
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [notifications, setNotifications] = useState<AppNotification[]>(readStoredNotifications)
  const [decisionCheckoutUntil, setDecisionCheckoutUntil] = useState(readPendingDecisionCheckout)
  const [decisionPrompt, setDecisionPrompt] = useState('')
  const [decisionAllowance, setDecisionAllowance] = useState<{ used: number; remaining: number; limit: number; renewsAt: string | null; status: string } | null>(null)
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>({
    state: 'disabled',
    version: null,
    percent: null,
    message: 'Auto-updates are not configured for this build.',
  })
  const [msgs, setMsgs] = useState<{ who: string; text: string }[]>(INITIAL_CHAT_MESSAGES)

  const toastTimer = useRef<number | undefined>(undefined)
  const chatMessagesRef = useRef<{ who: string; text: string }[]>(INITIAL_CHAT_MESSAGES)
  const chatPendingRef = useRef(0)
  const assistantContextRef = useRef<Record<string, string | number | boolean | null>>({})
  const decisionAlertPeriods = useRef(new Set<string>())
  const previousScrapeRunning = useRef(snapshot.running)
  const enrichmentWasActive = useRef(false)
  const runScrapeRef = useRef<() => void>(() => undefined)
  // actionClick is bound once to the document, so it reaches the current enricher through a ref.
  // The count it reports is what the finder pages put on their coverage card while a pass runs.
  const queueEnrichmentRef = useRef<(kind: 'email' | 'phone' | 'social' | 'decision-maker') => Promise<number>>(
    async () => 0,
  )
  const runImportRef = useRef<() => Promise<void>>(async () => undefined)
  /** The profile-URL import, handed the lines the shared modal's button decided are profiles. */
  const runSocialImportRef = useRef<(lines: string[]) => void>(() => undefined)
  /** The website scan, handed the lines the button decided are sites to read. */
  const runWebsiteScanRef = useRef<(lines: string[]) => void>(() => undefined)
  /** Changes whenever a scan is replaced or cancelled, so late IPC replies cannot reopen it. */
  const scanToken = useRef(0)
  /** Each finder starts its own pass after Import websites, scoped to the pasted URLs. */
  const runFinderImportRef = useRef<(page: 'email' | 'phone' | 'dm', lines: string[]) => void>(() => undefined)

  // Read the saved profile once on launch: a sign-in made on an earlier run is still a sign-in, and
  // the row that offers one should say so before the user goes looking. A run that connects Google
  // changes the answer, so this is exposed as a refresh rather than only a launch-time read.
  const readGoogleStatus = useCallback(async () => {
    const bridge = typeof window === 'undefined' ? undefined : window.desktop?.scraper
    if (!bridge?.googleStatus) return
    try {
      setGoogleStatus(await bridge.googleStatus())
    } catch {
      // An unreadable profile leaves the last answer in place; the run itself reports any failure.
    }
  }, [])

  useEffect(() => {
    void readGoogleStatus()
  }, [readGoogleStatus])

  // A run that had to connect Google re-reads the saved account here. The note under the run button
  // says whether the next run opens a browser to ask, so it must not go on saying it will after the
  // account is already in — the message the main process sends while starting the run is the signal.
  useEffect(() => {
    if (/google account connected/i.test(snapshot.message)) void readGoogleStatus()
  }, [snapshot.message, readGoogleStatus])

  const flash = useCallback((message: string) => {
    // A revoked/expired key can also be caught by the main-process authorization gate.
    if (/Activate an active 1-day trial or lifetime|Activate a Decision Makers or lifetime key/i.test(message)) {
      setReportsOpen(false)
      setMapsPrompt('license')
      return
    }
    window.clearTimeout(toastTimer.current)
    setToast(message)
    toastTimer.current = window.setTimeout(() => setToast(''), 2800)
  }, [])

  /** Adds to the bell history and, when enabled, asks Electron for an OS-level alert. */
  const notify = useCallback(
    (title: string, body: string, level: AppNotification['level'] = 'info', runId?: string) => {
      const item: AppNotification = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        title,
        body,
        at: new Date().toISOString(),
        level,
        unread: true,
        runId,
      }
      setNotifications((current) => {
        const next = [item, ...current].slice(0, 20)
        storeNotifications(next)
        return next
      })
      if (swWarn) void window.desktop?.notifications?.show(title, body).catch(() => undefined)
    },
    [swWarn],
  )

  const updateDecisionAllowance = useCallback((allowance: { monthlyUsed: number; monthlyRemaining: number; monthlyLimit: number; renewsAt: string | null; periodId?: string | null; status: string } | null) => {
    if (!allowance) { setDecisionAllowance(null); return }
    setDecisionAllowance({ used: allowance.monthlyUsed, remaining: allowance.monthlyRemaining, limit: allowance.monthlyLimit, renewsAt: allowance.renewsAt, status: allowance.status })
    if (allowance.monthlyRemaining <= 0 || allowance.monthlyRemaining > 500 || !allowance.renewsAt) return
    const period = allowance.periodId || allowance.renewsAt
    const threshold = allowance.monthlyRemaining <= 100 ? 100 : 500
    const alertId = `${period}:${threshold}`
    if (decisionAlertPeriods.current.has(alertId)) return
    const storageKey = threshold === 100 ? DECISION_100_ALERT_KEY : DECISION_500_ALERT_KEY
    try {
      if (window.localStorage.getItem(storageKey) === period) return
      window.localStorage.setItem(storageKey, period)
      if (threshold === 100) window.localStorage.setItem(DECISION_500_ALERT_KEY, period)
    } catch { /* Keep the alert for this app session. */ }
    decisionAlertPeriods.current.add(alertId)
    if (threshold === 100) decisionAlertPeriods.current.add(`${period}:500`)
    notify('Decision Makers allowance is low', `${allowance.monthlyRemaining} of ${allowance.monthlyLimit} searches remain in this period.`, 'info')
  }, [notify])

  useEffect(() => {
    const bridge = window.desktop?.billing
    if (!bridge) return
    let cancelled = false
    const refresh = async () => {
      try {
        const status = await bridge.status()
        if (!cancelled && status.connected) updateDecisionAllowance(status.decisionMaker ?? null)
      } catch { /* Keep the last verified allowance until the next connection. */ }
    }
    const onUsage = (usage: { used: number; remaining: number; renewsAt: string; periodId: string }) => {
      updateDecisionAllowance({ monthlyUsed: usage.used, monthlyRemaining: usage.remaining, monthlyLimit: 1000, renewsAt: usage.renewsAt, periodId: usage.periodId, status: 'active' })
    }
    void refresh()
    const unsubscribe = bridge.onDecisionUsage?.(onUsage)
    window.addEventListener('focus', refresh)
    window.addEventListener('nafran:billing-updated', refresh)
    return () => {
      cancelled = true
      unsubscribe?.()
      window.removeEventListener('focus', refresh)
      window.removeEventListener('nafran:billing-updated', refresh)
    }
  }, [updateDecisionAllowance])

  const markNotificationsRead = useCallback(() => {
    setNotifications((current) => {
      const next = current.map((item) => (item.unread ? { ...item, unread: false } : item))
      storeNotifications(next)
      return next
    })
  }, [])

  const markNotificationRead = useCallback((id: string) => {
    setNotifications((current) => {
      const next = current.map((item) => (item.id === id ? { ...item, unread: false } : item))
      storeNotifications(next)
      return next
    })
  }, [])

  const deleteNotification = useCallback((id: string) => {
    setNotifications((current) => {
      const next = current.filter((item) => item.id !== id)
      storeNotifications(next)
      return next
    })
  }, [])

  useEffect(() => {
    const bridge = typeof window === 'undefined' ? undefined : window.desktop?.updates
    if (!bridge) return
    let cancelled = false
    void bridge.status().then((status) => {
      if (!cancelled) setUpdateStatus(status)
    }).catch(() => undefined)
    const unsubscribe = bridge.onStatus((status) => {
      setUpdateStatus(status)
      if (status.state === 'ready') notify('Update ready', status.message, 'success')
      if (status.state === 'error') notify('Update check failed', status.message, 'error')
    })
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [notify])

  const checkForUpdates = useCallback(async () => {
    const bridge = typeof window === 'undefined' ? undefined : window.desktop?.updates
    if (!bridge) {
      setUpdateStatus({ state: 'disabled', version: null, percent: null, message: 'Updates are only available in the desktop app.' })
      return
    }
    setUpdateStatus(await bridge.check())
  }, [])

  const downloadUpdate = useCallback(async () => {
    const bridge = typeof window === 'undefined' ? undefined : window.desktop?.updates
    if (!bridge) return
    setUpdateStatus(await bridge.download())
  }, [])

  const installUpdate = useCallback(async () => {
    const bridge = typeof window === 'undefined' ? undefined : window.desktop?.updates
    if (!bridge) return
    await bridge.install()
  }, [])

  // A finished Maps run is useful even when the window is minimised, so keep the same result in
  // the bell history and the host OS notification centre.
  useEffect(() => {
    const wasRunning = previousScrapeRunning.current
    previousScrapeRunning.current = snapshot.running
    if (!wasRunning || snapshot.running) return
    if (snapshot.error) {
      notify('Maps scrape failed', snapshot.error, 'error')
      return
    }
    notify(
      'Maps scrape complete',
      `${snapshot.found} lead${snapshot.found === 1 ? '' : 's'} captured. Open Maps or Leads to review the results.`,
      'success',
      snapshot.runId,
    )
  }, [notify, snapshot.error, snapshot.found, snapshot.running, snapshot.runId])

  // A worker can fail one job while the rest of the queue continues. Surface that detail without
  // waiting for the final idle notification.
  useEffect(() => {
    const bridge = typeof window === 'undefined' ? undefined : window.desktop?.enrichment
    if (!bridge?.onProgress) return
    return bridge.onProgress((progress) => {
      setEnrichmentActivity((current) => [progress, ...current.filter((item) => item.jobId !== progress.jobId)].slice(0, 8))
      if (progress.status !== 'failed') return
      notify(`${progress.kind} lookup failed`, progress.message || 'The lookup could not be completed.', 'error')
    })
  }, [notify])

  const say = useCallback(async (text: string) => {
    const trimmed = String(text ?? '').trim()
    if (!trimmed) return
    if (!featureAccessAllowed()) { showAccessPrompt(); return }
    const userMessage = { who: 'me', text: trimmed }
    const next = [...chatMessagesRef.current, userMessage]
    chatMessagesRef.current = next
    setMsgs(next)
    setChatTyping(true)
    chatPendingRef.current += 1
    const bridge = typeof window === 'undefined' ? undefined : window.desktop?.assist
    try {
      // Quota answers come directly from the billing server. A language model must never guess a
      // paid allowance or repeat an old local counter when another device has used searches.
      if (/\b(decision\s*makers?|dm\s*searches?)\b/i.test(trimmed) && /\b(kitn\w*|baqi|baki|reh\w*|bach\w*|remaining|left|used|usage|quota|limit)\b/i.test(trimmed)) {
        const status = await window.desktop?.billing?.status()
        const quota = status?.connected ? status.decisionMaker : null
        const romanUrdu = /\b(kitn\w*|baqi|baki|reh\w*|bach\w*|mera|mere|hain)\b/i.test(trimmed)
        const response = !quota
          ? romanUrdu ? 'Abhi billing server se Decision Maker allowance verify nahi ho rahi. Connection check karke dobara poochhein.' : 'I cannot verify your Decision Maker allowance right now. Check the billing connection and try again.'
          : quota.monthlyRemaining > 0
            ? romanUrdu ? `Aap ke ${quota.monthlyRemaining} of ${quota.monthlyLimit} Decision Maker searches baqi hain. Yeh count server se verify hua hai.` : `You have ${quota.monthlyRemaining} of ${quota.monthlyLimit} Decision Maker searches remaining in this period. This count is verified by the server.`
            : romanUrdu ? 'Is period mein 0 Decision Maker searches baqi hain. Settings → Usage mein Rs 1,000 ka naya period khareed kar dobara use karein.' : 'You have 0 Decision Maker searches remaining. Open Settings → Usage to buy the next Rs 1,000 period.'
        if (quota) updateDecisionAllowance(quota)
        const withBot = [...chatMessagesRef.current, { who: 'bot', text: response }]
        chatMessagesRef.current = withBot
        setMsgs(withBot)
        return
      }
      if (!bridge?.chat) throw new Error('MamaLead Assist is available in the MamaLead desktop app with an internet connection.')
      let context = assistantContextRef.current
      if (/decision\s*makers?|dm\s*searches?/i.test(trimmed)) {
        try {
          const status = await window.desktop?.billing?.status()
          if (status?.connected && status.decisionMaker) {
            updateDecisionAllowance(status.decisionMaker)
            context = { ...context, decisionMakerSearchesRemaining: status.decisionMaker.monthlyRemaining, decisionMakerSearchesLimit: status.decisionMaker.monthlyLimit, decisionMakerPeriodEndsAt: status.decisionMaker.renewsAt, decisionMakerAccessStatus: status.decisionMaker.status }
          }
        } catch { /* Other support questions still work when billing is offline. */ }
      }
      const result = await bridge.chat({
        messages: next.slice(-16).map((message) => ({
          role: message.who === 'me' ? ('user' as const) : ('assistant' as const),
          content: message.text,
        })),
        context,
      })
      const response = result.text?.trim() || 'The AI provider returned an empty response.'
      const withBot = [...chatMessagesRef.current, { who: 'bot', text: response }]
      chatMessagesRef.current = withBot
      setMsgs(withBot)
    } catch (error) {
      const message = (error instanceof Error ? error.message : 'MamaLead Assist could not reach the AI provider.')
        .replace(/^Error invoking remote method '[^']+': Error:\s*/i, '')
      const withError = [...chatMessagesRef.current, { who: 'bot', text: message }]
      chatMessagesRef.current = withError
      setMsgs(withError)
    } finally {
      chatPendingRef.current = Math.max(0, chatPendingRef.current - 1)
      if (chatPendingRef.current === 0) setChatTyping(false)
    }
  }, [updateDecisionAllowance, featureAccessAllowed, showAccessPrompt])

  const go = useCallback((next: string) => {
    setView(next)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  const startLifetimeCheckoutWatch = useCallback(() => {
    const until = Date.now() + 60 * 60 * 1000
    try { window.localStorage.setItem(LIFETIME_CHECKOUT_PENDING_KEY, String(until)) } catch { /* Poll for this session. */ }
    setLifetimeCheckoutUntil(until)
  }, [])

  useEffect(() => {
    const bridge = window.desktop?.billing
    if (!bridge?.claimReturnHandoff || !bridge.onReturnHandoff) return
    const returnToBilling = async () => {
      if (!await bridge.claimReturnHandoff()) return
      go('settings')
      // Re-read server state; a protocol link is navigation, never proof of payment.
      const status = await bridge.status().catch(() => null)
      const needsKey = !status?.coreLicenseActive && !status?.decisionKeyActive ||
        Boolean(status?.purchaseEmail && !status.coreLicenseActive) || Boolean(status?.decisionKeyEmail && !status.decisionKeyActive)
      setStab(needsKey ? 'acct' : 'plan')
      if (needsKey) setBillingJump({target:'license'})
      window.dispatchEvent(new Event('nafran:billing-updated'))
    }
    const unsubscribe = bridge.onReturnHandoff(() => { void returnToBilling() })
    void returnToBilling()
    return unsubscribe
  }, [go])

  const startDecisionCheckoutWatch = useCallback(() => {
    const until = Date.now() + 60 * 60 * 1000
    try { window.localStorage.setItem(DECISION_CHECKOUT_PENDING_KEY, String(until)) } catch { /* Poll for this session. */ }
    setDecisionCheckoutUntil(until)
  }, [])

  useEffect(() => {
    const bridge = window.desktop?.billing
    if (!bridge?.claimDecisionSubscribeHandoff || !bridge.onDecisionSubscribeHandoff) return
    let busy = false
    let cancelled = false
    const openFromWebsite = async () => {
      if (busy || cancelled) return
      busy = true
      try {
        const claimed = await bridge.claimDecisionSubscribeHandoff()
        if (!claimed || cancelled) return
        go('settings')
        setStab('plan')
        const result = await bridge.checkout('decisionMaker', '')
        if (!result.opened) throw new Error('Stripe Checkout could not be opened.')
        startDecisionCheckoutWatch()
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Decision Makers payment could not be opened.'
        notify('Decision Makers payment unavailable', message, 'error')
        window.dispatchEvent(new CustomEvent('nafran:billing-error', { detail: message }))
      } finally { busy = false }
    }
    const unsubscribe = bridge.onDecisionSubscribeHandoff(() => { void openFromWebsite() })
    void openFromWebsite()
    return () => { cancelled = true; unsubscribe() }
  }, [go, notify, startDecisionCheckoutWatch])

  useEffect(() => {
    if (!decisionCheckoutUntil) return
    const bridge = window.desktop?.billing
    if (!bridge) return
    let cancelled = false
    let checking = false
    const stopWatch = () => {
      try { window.localStorage.removeItem(DECISION_CHECKOUT_PENDING_KEY) } catch { /* Session state still clears. */ }
      setDecisionCheckoutUntil(0)
    }
    const checkPayment = async () => {
      if (cancelled || checking) return
      if (Date.now() >= decisionCheckoutUntil) { stopWatch(); return }
      checking = true
      try {
        const status = await bridge.status()
        if (cancelled || !status.connected) return
        updateDecisionAllowance(status.decisionMaker ?? null)
        if (status.decisionKeyEmail && !status.decisionKeyActive) {
          stopWatch()
          setLicenseNextStep(`Payment confirmed. Your Decision Makers key was sent to ${status.decisionKeyEmail}. Paste it below to activate this machine.`)
          notify('Decision Makers key sent', `Your key was emailed to ${status.decisionKeyEmail}. Activate it in Settings → Account.`, 'success')
          go('settings')
          setStab('acct')
          return
        }
        if (status.decisionMaker?.active && status.decisionMaker.status !== 'included') {
          stopWatch()
          setDecisionPrompt('')
          const until = status.decisionMaker.renewsAt ? new Date(status.decisionMaker.renewsAt).toLocaleDateString() : 'the end of this paid period'
          notify('Decision Makers are ready', `${status.decisionMaker.monthlyRemaining} of 1,000 searches are available until ${until}.`, 'success')
          window.dispatchEvent(new Event('nafran:billing-updated'))
          window.dispatchEvent(new Event('nafran:decision-payment-confirmed'))
          go('settings')
          setStab('plan')
        }
      } catch { /* Keep checking while Stripe Checkout finishes. */ }
      finally { checking = false }
    }
    const onFocus = () => { void checkPayment() }
    void checkPayment()
    const timer = window.setInterval(() => void checkPayment(), 5000)
    window.addEventListener('focus', onFocus)
    return () => {
      cancelled = true
      window.clearInterval(timer)
      window.removeEventListener('focus', onFocus)
    }
  }, [decisionCheckoutUntil, go, notify, updateDecisionAllowance])

  // Stripe Checkout runs in the user's browser. Only the billing server's paid status can move
  // this app to the licence field; opening Checkout alone must never count as a purchase.
  useEffect(() => {
    if (!lifetimeCheckoutUntil) return
    const bridge = window.desktop?.billing
    if (!bridge) return
    let cancelled = false
    let checking = false
    const stopWatch = () => {
      try { window.localStorage.removeItem(LIFETIME_CHECKOUT_PENDING_KEY) } catch { /* Session state still clears. */ }
      setLifetimeCheckoutUntil(0)
    }
    const checkPayment = async () => {
      if (cancelled || checking) return
      if (Date.now() >= lifetimeCheckoutUntil) { stopWatch(); return }
      checking = true
      try {
        const status = await bridge.status()
        if (!cancelled && status.purchaseError) {
          stopWatch()
          go('settings')
          setStab('plan')
          window.dispatchEvent(new CustomEvent('nafran:billing-error', { detail: status.purchaseError }))
          return
        }
        if (!cancelled && status.connected && status.lifetime?.active) {
          stopWatch()
          setLicenseNextStep(`Payment confirmed. Your lifetime license key was sent to ${status.purchaseEmail ?? 'your email'}. Paste it below to activate this machine.`)
          go('settings')
          setStab('acct')
        }
      } catch {
        // Keep checking while the browser finishes Checkout or the connection recovers.
      } finally {
        checking = false
      }
    }
    const onFocus = () => { void checkPayment() }
    void checkPayment()
    const timer = window.setInterval(() => void checkPayment(), 5000)
    window.addEventListener('focus', onFocus)
    return () => {
      cancelled = true
      window.clearInterval(timer)
      window.removeEventListener('focus', onFocus)
    }
  }, [go, lifetimeCheckoutUntil])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        document.querySelector<HTMLInputElement>('[data-global-search="1"]')?.focus()
        setGlobalOpen(true)
      } else if (event.key === 'Escape') {
        setGlobalOpen(false)
        setNotificationsOpen(false)
      }
    }
    const onPointer = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target : null
      if (!target?.closest('[data-global-search-root="1"]')) setGlobalOpen(false)
      if (!target?.closest('[data-notifications-button="1"], [data-notifications-panel="1"]')) setNotificationsOpen(false)
      if (!target?.closest('[data-assist="1"], [data-chat-panel="1"]')) setChatOpen(false)
    }
    window.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onPointer)
    return () => {
      window.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onPointer)
    }
  }, [])

  /** Ends the local UI session without deleting the workspace database or saved leads. */
  const logout = useCallback(() => {
    setNotificationsOpen(false)
    setChatOpen(false)
    setMailOpen(false)
    go('dashboard')
    flash('Logged out of this local workspace. Your saved data remains on this device.')
  }, [flash, go])

  const addKeyword = useCallback((raw: string) => {
    const parts = String(raw ?? '')
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean)
    if (!parts.length) return
    setKeywords((current) => {
      const next = [...current]
      parts.forEach((part) => {
        if (next.length < MAX_MAP_KEYWORDS && !next.some((existing) => existing.toLowerCase() === part.toLowerCase())) next.push(part)
      })
      return next
    })
  }, [])

  const bulkKeywordPreview = useMemo(() => parseBulkKeywords(bulkKeywordsText), [bulkKeywordsText])

  const closeBulkKeywords = useCallback(() => {
    setBulkKeywordsOpen(false)
    setBulkKeywordsText('')
  }, [])

  const applyBulkKeywords = useCallback(
    (mode: 'replace' | 'add') => {
      const parsed = parseBulkKeywords(bulkKeywordsText)
      if (!parsed.terms.length) {
        flash('Paste at least one keyword first.')
        return
      }
      const next = mode === 'replace' ? [] : [...keywords]
      let applied = 0
      let alreadyPresent = 0
      let overLimit = 0
      for (const term of parsed.terms) {
        if (next.some((existing) => existing.toLocaleLowerCase() === term.toLocaleLowerCase())) {
          alreadyPresent += 1
          continue
        }
        if (next.length >= MAX_MAP_KEYWORDS) {
          overLimit += 1
          continue
        }
        next.push(term)
        applied += 1
      }
      setKeywords(next)
      setBulkKeywordsOpen(false)
      setBulkKeywordsText('')
      window.setTimeout(() => {
        const duplicateNote = parsed.duplicates ? ` ${parsed.duplicates} duplicate${parsed.duplicates === 1 ? '' : 's'} removed.` : ''
        const existingNote = alreadyPresent ? ` ${alreadyPresent} already in the current list.` : ''
        const limitNote = overLimit ? ` ${overLimit} skipped because a run supports ${MAX_MAP_KEYWORDS} keywords.` : ''
        flash(`${mode === 'replace' ? 'Loaded' : 'Added'} ${applied} keyword${applied === 1 ? '' : 's'}.${duplicateNote}${existingNote}${limitNote}`)
      }, 0)
    },
    [bulkKeywordsText, flash, keywords],
  )

  const pasteBulkKeywords = useCallback(async () => {
    try {
      const pasted = await navigator.clipboard.readText()
      if (!pasted.trim()) {
        flash('The clipboard has no keywords to paste.')
        return
      }
      setBulkKeywordsText((current) => (current.trim() ? `${current.trim()}\n${pasted}` : pasted))
    } catch {
      flash('Clipboard access was blocked. Paste the keywords into the box instead.')
    }
  }, [flash])

  const toggleTheme = useCallback(() => {
    setDark((current) => {
      const next = !current
      storeTheme(next)
      return next
    })
  }, [])

  const runScrape = useCallback((useGoogle?: boolean) => {
    if (snapshot.running) return
    // Open the choice immediately using the current UI entitlement. The main process still
    // verifies the licence before either kind of run, including revocations and trial limits.
    if (!featureAccessAllowed()) { setMapsPrompt('license'); return }
    if (typeof useGoogle !== 'boolean') { setMapsPrompt('google'); return }
    setMapsPrompt(null)
    setRunMinimized(false)
    setMapsRunId('latest'); setMapsHistoryLeads(null); setMapsSelected([])
    // The location field is tagged by the generator. Selecting by position was wrong: the
    // keyword input sits above it, so the run searched whatever the keyword box held.
    const locationField = document.querySelector<HTMLInputElement>('[data-location="1"]')
    const location = (locationField?.value ?? '').trim() || 'Manchester'
    // The town alone, without the country the field may also carry: a district search reads
    // "physiotherapy Gulberg", and Google is told the town separately as "in Lahore".
    const town = townOf(location) || location
    const pace = paceToMs(scraperSettings)
    // With districts chosen, each keyword runs once per district. The runner still loops over
    // keywords exactly as before — a split run is a longer keyword list, not a second code path.
    const terms = districtSearches.length
      ? keywords.flatMap((keyword) => districtSearches.map((district) => `${keyword} ${district}`))
      : keywords
    // The run has its own ceiling on how many searches it will make, so a large cross-product is
    // trimmed here rather than silently dropped by the runner.
    const capped = terms.slice(0, 8)
    // Account mode uses the saved Google profile; guest mode uses a private session.
    start({
      keywords: capped,
      location: districtSearches.length ? `${town}` : location,
      maxResultsPerKeyword: maxResults,
      maxResultsTotal: maxResults,
      // The Settings toggle wins; the build-time default only applies until one is chosen.
      headless: !scraperSettings.visible,
      minDelayMs: pace.minDelayMs,
      maxDelayMs: pace.maxDelayMs,
      executablePath: scraperSettings.browserPath,
      savedProfile: useGoogle,
      requireGoogle: useGoogle,
      websiteFilter: mapsWebsite as "any" | "has" | "none",
    })
    // The browser opens for the sign-in only when there is no account on file, so the first note
    // says which of the two this run is about to be. The cap note wins when both apply, because a
    // run that was trimmed is the one thing the user cannot see for themselves.
    if (capped.length < terms.length) {
      flash(`Running the first ${capped.length} of ${terms.length} searches — 8 is the run limit.`)
    } else {
      flash(
        !useGoogle ? 'Starting in a private guest session.' : googleStatus?.signedIn
          ? 'Google account connected — starting the run.'
          : 'Starting — the app’s browser opens for your Google account before the run.',
      )
    }
  }, [snapshot.running, featureAccessAllowed, keywords, maxResults, start, scraperSettings, districtSearches, flash, googleStatus?.signedIn, mapsWebsite])
  runScrapeRef.current = runScrape

  /** Saves a change to how the browser runs, so it survives a restart. */
  const updateScraperSettings = useCallback((patch: Partial<ScraperSettings>) => {
    setScraperSettings((current) => {
      const next: ScraperSettings = { ...current, ...patch }
      // The pair has to stay ordered, or the runner builds a random wait from an inverted range.
      next.paceMaxSeconds = Math.max(next.paceMinSeconds, next.paceMaxSeconds)
      storeScraperSettings(next)
      return next
    })
  }, [])

  const toggleVisible = useCallback(() => {
    setScraperSettings((current) => {
      const next = { ...current, visible: !current.visible, windowChoiceVersion: 1 }
      storeScraperSettings(next)
      flash(
        next.visible
          ? 'The Maps scan will open in a visible browser window.'
          : 'The scan will run in the background. Google sign-in still opens a window when needed.',
      )
      return next
    })
  }, [flash])

  /**
   * Adds one search per district of the city in the Location field.
   *
   * Maps stops serving results for a search at roughly 120 places and that ceiling is per search,
   * not per session. The runner already searches the location once per keyword, so pairing each
   * keyword with each district turns a single capped search into several: "physiotherapist in
   * Lahore" becomes "physiotherapist Gulberg, in Lahore", "physiotherapist DHA, in Lahore" and so
   * on. Nothing about pacing or volume changes — it is the same run, split across smaller areas.
   */
  const splitByDistrict = useCallback(() => {
    const locationField = document.querySelector<HTMLInputElement>('[data-location="1"]')
    const raw = (locationField?.value ?? '').trim() || 'Manchester'
    const area = districtsFor(raw)
    // The location may carry a country ("Lahore, Pakistan"), so the town is the first segment;
    // stripping only that leaves a readable district name for the message.
    const town = townOf(raw)
    const next = area.areas
      .map((entry) => entry.trim())
      .filter((entry) => entry.toLowerCase() !== town)
      .map((entry) => (entry.startsWith(town) ? entry.slice(town.length).trim().replace(/^,/, '').trim() : entry))
      .filter(Boolean)
    if (!next.length) {
      flash('No districts known for that location.')
      return
    }
    setDistrictSearches(next)
    flash(
      `Added ${next.length} district searches — ${next.slice(0, 3).join(', ')}${next.length > 3 ? '…' : ''}. Each runs every keyword.`,
    )
  }, [flash])

  const clearDistricts = useCallback(() => {
    setDistrictSearches([])
    flash('Back to a single search area.')
  }, [flash])

  /**
   * Asks for a browser executable to drive instead of the bundled Chromium.
   *
   * Only the program is chosen; every run still starts a fresh throwaway profile, so no existing
   * browser session is opened. A browser with its own brand and version — Chrome, Edge, Brave —
   * presents better than Playwright's bundled Chromium, which identifies itself as an automation
   * build.
   */
  const pickBrowser = useCallback(async () => {
    const bridge = typeof window === 'undefined' ? undefined : window.desktop?.scraper
    if (!bridge?.pickBrowser) {
      flash('Choosing a browser is only available in the desktop app.')
      return
    }
    try {
      const chosen = await bridge.pickBrowser()
      if (!chosen) return
      updateScraperSettings({ browserPath: chosen })
      flash(`Runs will use ${chosen.split(/[\\/]/).pop() ?? chosen}, with a fresh profile each time.`)
    } catch (error) {
      flash(error instanceof Error ? error.message : 'The browser could not be chosen.')
    }
  }, [flash, updateScraperSettings])

  const clearBrowser = useCallback(() => {
    updateScraperSettings({ browserPath: '' })
    flash('Back to the bundled Chromium.')
  }, [flash, updateScraperSettings])

  /**
   * Keeps the saved profile on.
   *
   * This used to be a switch, and it was the reason a run could start from a profile Google had
   * never seen. Run with filters now always starts from the saved profile — that is where the
   * connected account lives — so switching this off would only make a run contradict the account
   * row above it. It stays as a control and always reports the truth.
   */
  const toggleGoogleProfile = useCallback(() => {
    setScraperSettings((current) => {
      if (current.googleProfile) {
        flash('Runs always start from the connected Google account — that is how this app runs.')
        return current
      }
      const next = { ...current, googleProfile: true }
      storeScraperSettings(next)
      flash('Runs will start from the saved Google profile.')
      return next
    })
  }, [flash])

  /**
   * Opens the one window that can sign in to Google, and waits for the account to be in.
   *
   * The account, the password and the second factor are Google's own page and the user's own
   * business; nothing here types them. What the app takes away is the profile folder that window
   * leaves behind, which is what lets a run start from the account that was chosen in it.
   */
  const signInGoogle = useCallback(async () => {
    const bridge = typeof window === 'undefined' ? undefined : window.desktop?.scraper
    if (!bridge?.signInGoogle) {
      flash('Signing in to Google is only available in the desktop app.')
      return
    }
    // The panel opens first and stays open for the whole connection: it is the app's account of
    // what the window is for, and it reports the outcome when the window is done.
    setGooglePanel(googleStatus?.signedIn ? 'connected' : 'open')
    if (googleStatus?.signedIn) return
    setGooglePanel('waiting')
    flash('Opening Google — choose your profile in the window.')
    try {
      const result = await bridge.signInGoogle(scraperSettings.browserPath)
      if (!result.signedIn) {
        setGooglePanel('open')
        flash('The window was closed before an account was signed in.')
        return
      }
      setGoogleStatus({ profile: true, signedIn: true })
      setGooglePanel('connected')
      // Signing in is the whole point of the profile, so asking for one and then not using it would
      // be a step the user has to remember to take again.
      setScraperSettings((current) => {
        const next = { ...current, googleProfile: true }
        storeScraperSettings(next)
        return next
      })
      flash('Signed in — the window stays open, and Run with filters scrapes in it.')
    } catch (error) {
      setGooglePanel('open')
      flash(error instanceof Error ? error.message : 'The sign-in window could not open.')
    }
  }, [flash, scraperSettings.browserPath, googleStatus?.signedIn])

  /**
   * Clears the Google window panel once the sign-in has landed.
   *
   * The panel is what the app says about the window while the window is doing something. Once the
   * account is in, the panel is only a confirmation, and a confirmation that stays is a modal over
   * the whole app — it was covering the sidebar, so nothing on the page could be clicked. It is
   * given a moment to be read, then it goes; the row on the page says the account is connected.
   */
  useEffect(() => {
    if (googlePanel !== 'connected') return
    const timer = window.setTimeout(() => setGooglePanel((current) => (current === 'connected' ? 'closed' : current)), 2600)
    return () => window.clearTimeout(timer)
  }, [googlePanel])

  /**
   * What the deep pass is working with, read once at launch.
   *
   * A machine that supplies the key through its own environment has it already, so the Settings row
   * says where it came from rather than claiming there is none. A key saved in the app is handed
   * over with it, so a pass started before Settings was ever opened still has one to use.
   */
  useEffect(() => {
    const bridge = typeof window === 'undefined' ? undefined : window.desktop?.deep
    if (!bridge?.status) return
    const saved = readDeepKey()
    if (saved) void bridge.key(saved)
    void bridge
      .status()
      .then((status) => setDeepKeyFromEnvironment(status.fromEnvironment))
      .catch(() => undefined)
  }, [])

  useEffect(() => {
    void window.desktop?.emailValidity?.status().then((status) => {
      setLeadsAngelConfigured(status.leadsAngelConfigured)
      setLeadsAngelExpiresOn(status.leadsAngelExpiresOn)
    }).catch(() => undefined)
  }, [])

  const stopRun = useCallback(() => setMapsPrompt('stop'), [])

  const cancelScan = useCallback(() => {
    const jobId = scan.jobId
    scanToken.current += 1
    if (scan.phase === 'scanning') void window.desktop?.enrichment?.stop()
    if (jobId && db) void db.jobs.cancel(jobId).catch(() => undefined)
    setScan({ phase: 'idle', jobId: '', urls: [], leadIds: [], scannedIds: [], activeName: '', found: 0, added: 0 })
    flash('Scan cancelled.')
  }, [db, flash, scan.jobId, scan.phase])

  const exitScan = useCallback(() => {
    scanToken.current += 1
    setScan({ phase: 'idle', jobId: '', urls: [], leadIds: [], scannedIds: [], activeName: '', found: 0, added: 0 })
  }, [])

  /**
   * Escape closes whatever dialog is open, and calls off a scan that is running.
   *
   * One listener for all of them: the shared import modal, the export modal, the chat panel, the
   * assistant's mail box and the scan panel are all owned here, and a dialog that does not answer to
   * Escape is a dialog the user has to find the way out of. It runs on the window rather than on
   * each dialog because the paste boxes swallow their own keys.
   *
   * Escape uses the same cancellation path as the visible button, so a dismissed pass is also
   * removed from the queue.
   */
  useEffect(() => {
    if (!bulkKeywordsOpen && !impOpen && !expOpen && !profileExportOpen && !chatOpen && !mailOpen && scan.phase !== 'scanning' && scan.phase !== 'done') return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setImpOpen(false)
      closeBulkKeywords()
      setExpOpen(false)
      setProfileExportOpen(false)
      setChatOpen(false)
      setMailOpen(false)
      if (scan.phase !== 'idle') cancelScan()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [cancelScan, closeBulkKeywords, bulkKeywordsOpen, impOpen, expOpen, profileExportOpen, chatOpen, mailOpen, scan.phase])

  const actionClick = useCallback(
    (button: HTMLElement) => {
      const label = button.getAttribute('data-action') ?? 'Action'
      if (button.hasAttribute('data-rerun')) {
        go('maps')
        window.setTimeout(() => runScrapeRef.current(), 420)
        flash('Re-running that scrape with the same filters.')
        return
      }
      const destination = button.getAttribute('data-goto')
      if (destination) {
        go(destination)
        flash(`${label} — opening ${VIEW_NAMES[destination] ?? LABELS[destination] ?? destination}.`)
        return
      }
      // Enrichment actions queue real work instead of only reporting it. The worker reads each
      // lead's own website, so these are the buttons that fill the Email, Social, Phone and
      // Decision Maker pages.
      const enrichmentKind = enrichmentForLabel(label)
      if (enrichmentKind) {
        void queueEnrichmentRef.current(enrichmentKind)
        return
      }
      // The import modal's own button commits the pasted list rather than closing the dialog.
      if (/start lookup/i.test(label)) {
        void runImportRef.current()
        return
      }
      const known = Object.keys(DEMO_NOTES).find((key) => label === key || label.startsWith(key))
      flash(known ? DEMO_NOTES[known] : `${label} is not available yet.`)
    },
    [go, flash],
  )

  // The plan usage and the saved lists come from the database rather than the reference copy, so
  // the sidebar and the Saved Lists page state what is actually true on this machine.
  const [lists, setLists] = useState<StoredList[]>([])
  const [usage, setUsage] = useState<{ used: number; limit: number; daysLeft: number; renewsOn: string } | null>(null)
  const [mapsAllowance, setMapsAllowance] = useState<{ kind: 'trial' | 'lifetime'; used: number; remaining: number } | null>(null)
  const [showPlanWelcome, setShowPlanWelcome] = useState(false)
  const [planWelcomeDismissed, setPlanWelcomeDismissed] = useState(false)
  // The two switches on the billing-preferences card. There is no billing provider to honour them,
  // but they are the user's own settings, so they flip and stay flipped for the session rather than
  // looking like a control that is broken.
  // How many leads are actually on file, as the database reports it. The ledger below is a page of
  // those leads and can be shorter than this, so the two are counted separately.
  const [storedLeadCount, setStoredLeadCount] = useState(0)
  const [workspaceName, setWorkspaceName] = useState('Local workspace')
  const [workspaceMembers, setWorkspaceMembers] = useState<{ user_id: string; role: string; created_at: string }[]>([])
  // How many rows the Maps results table is showing. The page draws the run's own captures rather
  // than a fixed page of them, and "Show all" raises this rather than pretending to.
  const [mapsLimit, setMapsLimit] = useState(25)
  // What is typed in the Maps results filter. The table beside it narrows to the matches.
  const [mapsQuery, setMapsQuery] = useState('')
  // How many blocked leads the Decision Makers page is listing. The page draws forty at a time and
  // its own "Show all" raises that rather than pretending to. The matched contacts are paged the
  // same way, so a workspace with thousands of named people does not draw every card at once.
  const [dmBlockerLimit, setDmBlockerLimit] = useState(40)
  const [dmContactLimit, setDmContactLimit] = useState(40)
  // All Leads owns a database page; only rows the user has requested live in the renderer.
  const [leadPage, setLeadPage] = useState<StoredLead[]>([])
  const [leadPageTotal, setLeadPageTotal] = useState(0)
  const [leadPageLoading, setLeadPageLoading] = useState(false)
  const [leadPageError, setLeadPageError] = useState('')
  const leadPageGeneration = useRef(0)
  const [leadStats, setLeadStats] = useState<LeadSummary | null>(null)
  // How much of the run log the Run History page is drawing, which its own "Older runs" raises.
  const [runsLimit, setRunsLimit] = useState(25)
  // The version this build actually is. The design writes "v1.2.0" in the rail and the status
  // strip, which stopped being true the moment the package moved on.
  const [appVersion, setAppVersion] = useState('')
  useEffect(() => {
    void window.desktop?.getInfo().then((info) => setAppVersion(`v${info.version}`)).catch(() => undefined)
  }, [])
  const [runs, setRuns] = useState<StoredRun[]>([])
  const [runStats, setRunStats] = useState({ runs: 0, clean: 0, places: 0, medianMs: 0 })
  const [dashboard, setDashboard] = useState<DashboardTotals | null>(null)
  const [rangeDashboard, setRangeDashboard] = useState<{ range: typeof range; totals: DashboardTotals } | null>(null)
  const rangeRequest = useRef(0)
  const [phone, setPhone] = useState<{ rows: PhoneRow[]; summary: PhoneSummary | null }>({ rows: [], summary: null })
  const [people, setPeople] = useState<{ rows: DecisionMakerRow[]; funnel: DecisionMakerFunnel | null }>({
    rows: [],
    funnel: null,
  })
  const [suggestions, setSuggestions] = useState<CandidateRow[]>([])
  // Decision Makers starts empty and owns the exact websites in the current import.
  const dmSession = useRef({ generation: 0, leadIds: [] as string[] })
  const [dmSessionLeads, setDmSessionLeads] = useState<StoredLead[]>([])
  const [dmExportBusy, setDmExportBusy] = useState(false)
  const dmExportLock = useRef(false)
  const [imports, setImports] = useState<{
    batches: Record<string, unknown>[]
    websiteBatches: Record<string, unknown>[]
    rows: { domain: string; detail: string; contact: string; status: string }[]
    preview: { domain: string; name: string; address: string; phone: string; email: string; socials: string; person: string } | null
  }>(
    { batches: [], websiteBatches: [], rows: [], preview: null },
  )
  const [enrichmentActivity, setEnrichmentActivity] = useState<EnrichmentProgress[]>([])
  const [globalQuery, setGlobalQuery] = useState('')
  const [globalLeadRows, setGlobalLeadRows] = useState<StoredLead[]>([])
  const [globalOpen, setGlobalOpen] = useState(false)
  const [globalSelection, setGlobalSelection] = useState(0)
  const [focusedRunId, setFocusedRunId] = useState<string | null>(null)
  const [plan, setPlan] = useState<{
    plan: string
    status: string
    seats: number
    renewsOn: string | null
    lookups: Record<string, number>
  }>({ plan: 'free', status: 'none', seats: 1, renewsOn: null, lookups: {} })

  /**
   * The phone ledger and its totals.
   *
   * Its own callback because the Phone Finder's scan re-reads it when a pass finishes, while the
   * rest of the page's lists are read once.
   */
  const refreshPhone = useCallback(async () => {
    if (!db) return
    try {
      const [rows, summary] = await Promise.all([db.phones.ledger({ limit: 200 }), db.phones.summary()])
      setPhone({ rows, summary })
    } catch {
      // Leaving the last good value on screen beats clearing the page on a read failure.
    }
  }, [db])

  const refreshLists = useCallback(async () => {
    if (!db) return
    const request = ++rangeRequest.current
    try {
      const [stored, history, counts, totals, periodTotals] = await Promise.all([
        db.stats(),
        db.runs.list(5000),
        db.runs.counts(),
        db.dashboard(),
        range === 'All Time' ? Promise.resolve(null) : db.dashboard(range === '7 Days' ? 7 : 30),
      ])
      setLists(await db.lists.list())
      setStoredLeadCount(stored.total)
      setLeadStats(stored)
      setRuns(history)
      setRunStats(counts)
      setDashboard(totals)
      if (request === rangeRequest.current) setRangeDashboard(periodTotals ? { range, totals: periodTotals } : null)
      // The Phone Finder and Decision Makers pages read their own tables.
      void refreshPhone()
      // Website Lookup: the batches and the leads they created, read in one call.
      void Promise.all([db.imports.ledger(), db.imports.list(5000)])
        .then(async ([ledger, batches]) => {
          const websiteLeads = ledger.leads.filter((lead) => Boolean(lead.website?.trim()))
          const recent = websiteLeads[0]
          let preview: typeof imports.preview = null
          if (recent) {
            const [lead, emails, socials, people] = await Promise.all([
              db.leads.get(recent.id),
              db.contacts.list('email', [recent.id]),
              db.social.list([recent.id]),
              db.people.list([recent.id]),
            ])
            if (lead) {
              const email = emails.find((item) => typeof item.value === 'string')
              const person = people.find((item) => typeof item.full_name === 'string')
              preview = {
                domain: hostOf(lead.website),
                name: lead.name,
                address: lead.address || '',
                phone: lead.phone || '',
                email: typeof email?.value === 'string' ? email.value : '',
                socials: socials.map((item) => String(item.platform ?? '')).filter(Boolean).join(', '),
                person: person ? `${String(person.full_name)}${person.title ? ` · ${String(person.title)}` : ''}` : '',
              }
            }
          }
          setImports({
            batches,
            websiteBatches: batches.filter((batch) => batch.kind === 'websites'),
            preview,
            rows: websiteLeads.slice(0, 8).map((lead) => {
              const host = lead.website.replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0]
              return {
                domain: host,
                detail: lead.last_scanned_at ? 'Website read' : lead.enrichment_status === 'done' || lead.enrichment_status === 'failed' ? 'Website could not be read' : lead.enrichment_status === 'running' ? 'Reading public pages…' : lead.name === host ? 'Queued for website reading' : lead.name,
                contact:
                  [lead.phone ? 'phone' : '', lead.has_email ? 'email' : '', lead.has_social ? 'socials' : '']
                    .filter(Boolean)
                    .join(' · ') || 'nothing yet',
                status: lead.last_scanned_at ? (lead.has_email || lead.has_social || lead.phone ? 'Found' : 'No public details') : lead.enrichment_status === 'done' || lead.enrichment_status === 'failed' ? 'Retry needed' : lead.enrichment_status === 'running' ? 'Reading' : 'Queued',
              }
            }),
          })
        })
        .catch(() => undefined)
    } catch {
      // Leaving the last good value on screen beats clearing the page on a read failure.
    }
  }, [db, refreshPhone, range])

  const refreshReports = useCallback(async () => {
    setReportsLoading(true)
    setReportsError('')
    try {
      if (!db) throw new Error('Open the desktop app to view your saved reports.')
      const [totals, counts, history] = await Promise.all([db.dashboard(), db.runs.counts(), db.runs.list(5000)])
      setDashboard(totals)
      setRunStats(counts)
      setRuns(history)
    } catch {
      setReportsError('Could not load your saved report. Try refreshing it.')
    } finally {
      setReportsLoading(false)
    }
  }, [db])

  const refreshUsage = useCallback(async () => {
    if (!db) return
    try {
      const [workspace, lookups] = await Promise.all([db.workspace(), db.jobs.usage()])
      const detail = workspace as {
        name?: string
        usage?: { scrapes_used: number; scrape_limit: number }
        subscription?: { plan?: string; status?: string; seats?: number; renews_on?: string | null } | null
        members?: { user_id: string; role: string; created_at: string }[]
        store?: { path: string; size: string }
      }
      setWorkspaceName(detail.name || 'Local workspace')
      setWorkspaceMembers(detail.members ?? [])
      setStore(detail.store ?? null)
      const used = detail.usage?.scrapes_used ?? 0
      const limit = detail.usage?.scrape_limit ?? 2000
      const renews = detail.subscription?.renews_on ?? null
      const days = renews ? Math.max(0, Math.ceil((new Date(renews).getTime() - Date.now()) / 86_400_000)) : 30
      setUsage({
        used,
        limit,
        daysLeft: days,
        renewsOn: renews ? new Date(renews).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—',
      })
      setPlan({
        plan: detail.subscription?.plan ?? 'free',
        status: detail.subscription?.status ?? 'none',
        seats: detail.subscription?.seats ?? 1,
        // The reference shows a date without a year when it is close; keep it simple and exact.
        renewsOn: renews ? new Date(renews).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—',
        lookups,
      })
    } catch {
      // As above: a failure here should not blank the sidebar.
    }
  }, [db])

  const refreshMapsAllowance = useCallback(async () => {
    if (!window.desktop?.billing) return
    try {
      const status = await window.desktop.billing.status()
      setFeatureBilling(status)
      setShowPlanWelcome(!(status.license?.active && (status.license.kind === 'trial' || status.license.kind === 'lifetime')))
      if (!status.connected || !status.license?.active) return setMapsAllowance(null)
      if (status.license.kind === 'lifetime') return setMapsAllowance({ kind: 'lifetime', used: 0, remaining: 0 })
      if (status.license.kind === 'trial' && status.mapsLeads?.limit === 300) {
        return setMapsAllowance({ kind: 'trial', used: status.mapsLeads.used ?? 0, remaining: status.mapsLeads.remaining ?? 0 })
      }
      setMapsAllowance(null)
    } catch { setFeatureBilling(null); setMapsAllowance(null) }
  }, [])

  /**
   * Writes the bookmarked leads into the chosen list. The list is created the first time it is
   * used, and a lead already in it is skipped rather than duplicated.
   *
   * Bookmarking works on ledger indexes, so the write needs the database ids behind those rows —
   * which only exist once leads have actually been scraped.
   */
  const saveToList = useCallback(async () => {
    const existing = lists.find((list) => list.id === listTarget)
    const listName = existing?.name ?? newListName.trim()
    if (!listName) {
      flash('Enter a name for your new list first.')
      return
    }
    const chosen = snapshot.leads.filter((_, index) => keep[index])
    if (!chosen.length) {
      flash('Bookmark a few leads first — nothing selected yet.')
      return
    }
    if (!db) {
      flash('The local database is not available in this window.')
      return
    }
    try {
      const { id } = existing ?? await db.lists.create(listName)
      const { added, skipped } = await db.lists.add(
        id,
        chosen.map((lead) => lead.id),
      )
      await refreshLists()
      setListTarget(id)
      setNewListName('')
      flash(
        added === 0
          ? `${skipped} already in ${listName} — nothing new to add.`
          : `${added} ${added === 1 ? 'lead' : 'leads'} saved into ${listName}${skipped ? ` · ${skipped} already there` : ''}.`,
      )
    } catch (error) {
      flash(error instanceof Error ? error.message : 'The leads could not be saved.')
    }
  }, [db, keep, listTarget, lists, newListName, snapshot.leads, refreshLists, flash])

  const showDecisionPassPrompt = useCallback((message: string) => {
    if (!/decision makers?.*(?:pass|searches|access|subscribe|renew)|(?:pass|searches|subscribe|renew).*decision makers?/i.test(message)) return false
    setDecisionPrompt('Your Decision Makers allowance has ended. Buy the next Rs 1,000 pass to unlock 1,000 searches for 30 days.')
    setView('settings')
    setStab('plan')
    flash('Decision Makers paused. Buy the next 30-day pass in Settings → Usage.')
    return true
  }, [flash])

  /** Queues an enrichment pass over the leads still missing the kind of contact asked for. */
  const queueEnrichment = useCallback(
    async (kind: 'email' | 'phone' | 'social' | 'decision-maker'): Promise<number> => {
      if (!db) {
        flash('The local database is not available in this window.')
        return 0
      }
      const label = {
        email: 'email',
        phone: 'phone',
        social: 'social',
        'decision-maker': 'decision maker',
      }[kind]
      try {
        // A phone or a decision maker is read from the lead's website just like an address is.
        const leads = await db.leads.needing(kind === 'social' ? 'social' : kind === 'phone' ? 'phone' : 'email')
        if (!leads.length) {
          flash(`Every lead with a website already has ${kind === 'decision-maker' ? 'a named contact' : `a ${label} detail`}.`)
          return 0
        }
        const { queued, jobId } = await db.jobs.queue(kind, leads.map((lead) => lead.id))
        // User-started finder work should run immediately and ahead of any background queue.
        void (window.desktop?.enrichment?.prioritize?.(jobId) ?? window.desktop?.enrichment?.start?.())
        flash(`${queued} ${queued === 1 ? 'lead' : 'leads'} queued for ${label} enrichment.`)
        return queued
      } catch (error) {
        const message = error instanceof Error ? error.message : 'The pass could not be queued.'
        if (kind !== 'decision-maker' || !showDecisionPassPrompt(message)) flash(message)
        return 0
      }
    },
    [db, flash, showDecisionPassPrompt],
  )
  queueEnrichmentRef.current = queueEnrichment

  /**
   * Queues a named set of leads for one kind of pass.
   *
   * The finder pages send the rows they are showing rather than asking for every lead that needs the
   * detail: the action sits on the list, so what it does is what the list holds. Leads without a
   * website are dropped — there is nothing to read — and the rest are queued as one job.
   */
  const queueLeads = useCallback(
    async (kind: 'email' | 'phone' | 'decision-maker', leadIds: string[]): Promise<{ queued: number; jobId: string }> => {
      if (!db || !leadIds.length) return { queued: 0, jobId: '' }
      try {
        const result = await db.jobs.queue(kind, leadIds)
        // A finder action is an explicit foreground request. Wake the worker now instead of
        // waiting for the next background tick or an unrelated job to finish.
        await (window.desktop?.enrichment?.prioritize?.(result.jobId) ?? window.desktop?.enrichment?.start?.())
        const label = kind === 'email' ? 'email' : kind === 'phone' ? 'phone' : 'decision maker'
        flash(`${result.queued} ${result.queued === 1 ? 'lead' : 'leads'} queued for ${label} enrichment.`)
        return result
      } catch (error) {
        const message = error instanceof Error ? error.message : 'The pass could not be queued.'
        if (kind !== 'decision-maker' || !showDecisionPassPrompt(message)) flash(message)
        return { queued: 0, jobId: '' }
      }
    },
    [db, flash, showDecisionPassPrompt],
  )

  /** Checks the email addresses currently represented on the Email Finder page. */
  const verifyEmailValidity = useCallback(async () => {
    if (!email.coverage.extracted) {
      flash('No email addresses are available to verify yet.')
      return
    }
    try {
      // No lead filter: each click takes the next unchecked batch from the whole local database,
      // rather than repeatedly checking only the first 50 leads rendered by this page.
      const result = await email.verifyValidity()
      if (result.cancelled) {
        flash(`Email validity stopped after ${result.checked} checks. Remaining addresses are ready for the next pass.`)
        return
      }
      if (!result.checked) {
        flash(result.failed
          ? `${result.failed} addresses could not be checked. They remain in Not checked for the next pass.`
          : result.skipped ? 'Every email on screen already has a validity result.' : 'No unchecked email addresses were found.')
        return
      }
      const parts = [
        `${result.valid} valid`,
        `${result.invalid} invalid`,
        `${result.risky} risky`,
        `${result.unknown} unknown`,
      ]
      const note = `${result.failed ? ` ${result.failed} failed and will be retried on the next pass.` : ''}${result.limited ? ` ${result.limited} more will be checked on the next pass.` : ''}`
      const message = `Email validity complete — ${parts.join(' · ')}.${note}`
      flash(message)
      notify('Email validity complete', `${parts.join(' · ')}.${note}`, 'success')
    } catch (error) {
      flash(error instanceof Error ? error.message : 'Email validity could not be checked.')
    }
  }, [email, flash, notify])

  const recheckUnknownEmailValidity = useCallback(async () => {
    try {
      const result = await email.recheckUnknownValidity()
      if (result.cancelled) {
        flash(`LeadsAngel recheck stopped after ${result.checked} emails.`)
      } else {
        flash(`LeadsAngel recheck: ${result.valid} valid · ${result.invalid} invalid · ${result.risky} risky · ${result.unknown} unknown.${result.limited ? ` ${result.limited} more are ready for the next pass.` : ''}`)
      }
    } catch (error) {
      flash(error instanceof Error ? error.message : 'LeadsAngel recheck could not run.')
    }
  }, [email, flash])

  /**
   * Imports a paste of domains: each becomes a lead named after its host, queued for a pass over
   * its own site. Domains already on file are skipped.
   *
   * It is given its lines rather than reading the box, because the box may also hold profile URLs:
   * the button sorts the paste and hands each import the lines that belong to it.
   */
  const runImportText = useCallback(
    async (lines: string[]) => {
      if (!db) {
        flash('The local database is not available in this window.')
        return
      }
      if (!lines.length) {
        flash('Paste one domain per line, then start the lookup.')
        return
      }
      try {
        const result = await db.imports.websites(lines)
        setImpOpen(false)
        setImpValue('')
        const field = document.querySelector<HTMLTextAreaElement>('[data-imptext="1"]')
        if (field) field.value = ''
        // Every view of the leads is re-read, not just the summary: an import can be started from any
        // page, and the page it was started from is the one whose list has to change.
        await refreshLists()
        email.refresh()
        social.refresh()
        reload()
        flash(
          result.added
            ? `${result.added} site${result.added === 1 ? '' : 's'} imported and queued for enrichment${result.skipped ? ` · ${result.skipped} already on file` : ''}.`
            : `Nothing new — all ${result.skipped} domain${result.skipped === 1 ? ' is' : 's are'} already on file.`,
        )
      } catch (error) {
        flash(error instanceof Error ? error.message : 'The import could not be read.')
      }
    },
    [db, refreshLists, email, social, reload, flash],
  )

  /** The same import, for the callers that only have the box to go on. */
  const runImport = useCallback(async () => {
    const field = document.querySelector<HTMLTextAreaElement>('[data-imptext="1"]')
    await runImportText(pastedLines(field?.value ?? '').filter((line) => !isProfileLine(line)))
  }, [runImportText])
  runImportRef.current = runImport

  /** Opens the shared import dialog with prepared website lines from clipboard or a CSV file. */
  const fillWebsiteImport = useCallback((lines: string[], source: 'clipboard' | 'CSV' | 'selected Maps leads' | 'saved Maps run') => {
    if (!lines.length) {
      flash(source === 'CSV' ? 'No website or domain column was found in that CSV.' : 'The clipboard has no website domains to import.')
      return
    }
    const value = lines.join('\n')
    impText.current = value
    setImpValue(value)
    setImpLines(lines.length)
    setImpSites(lines.length)
    setImpProfiles(0)
    setImpOpen(true)
    flash(`${lines.length} website${lines.length === 1 ? '' : 's'} loaded from ${source}. Review and scan.`)
  }, [flash])

  const pasteWebsiteClipboard = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText()
      fillWebsiteImport(pastedLines(text).filter((line) => !isProfileLine(line)), 'clipboard')
    } catch {
      flash('Clipboard access was blocked. Paste the websites into the import box instead.')
    }
  }, [fillWebsiteImport, flash])

  const uploadWebsiteCsv = useCallback(() => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.csv,.tsv,text/csv,text/tab-separated-values'
    input.addEventListener('change', () => {
      const file = input.files?.[0]
      if (!file) return
      void file.text().then((text) => fillWebsiteImport(websiteLinesFromCsv(text), 'CSV')).catch(() => flash('The CSV could not be read.'))
    }, { once: true })
    input.click()
  }, [fillWebsiteImport, flash])

  /**
   * Scans a paste of websites: each site becomes a lead, then the app reads each one and files the
   * social profiles it publishes.
   *
   * This is what "Import websites" does on the Social Profiles page, and it is a pass over other
   * people's servers rather than a database write, so it takes time and the design gives it a panel
   * of its own. The panel reports each site as the worker reaches it; when the pass is done the
   * table comes down to those sites and the profiles they turned out to carry.
   */
  const runWebsiteScan = useCallback(
    (sites: string[]): void => {
      if (!db || !sites.length) return
      const token = ++scanToken.current
      setScan({ phase: 'scanning', jobId: '', urls: sites, leadIds: [], scannedIds: [], activeName: '', found: 0, added: 0 })
      void (async () => {
        try {
          const result = await db.imports.websites(sites)
          if (scanToken.current !== token) return
          if (!result.leadIds.length) {
            // Keep the modal open so a rejected paste can be corrected immediately instead of
            // making the user reopen Import websites after a silent empty scan.
            setScan((current) => ({ ...current, phase: 'idle', jobId: '' }))
            flash('No valid website URL was found. Paste a domain such as example.com or https://example.com.')
            return
          }
          setImpOpen(false)
          setImpValue('')
          flash(
            result.added
              ? `${result.added} site${result.added === 1 ? '' : 's'} imported — reading each one for its social profiles.`
              : `Nothing new — all ${result.skipped} domain${result.skipped === 1 ? ' is' : 's are'} already on file.`,
          )
          setScan((current) => ({ ...current, leadIds: result.leadIds, added: result.added }))
          const queued = await db.jobs.queue('social', result.leadIds)
          if (scanToken.current !== token) {
            void db.jobs.cancel(queued.jobId)
            return
          }
          setScan((current) => ({ ...current, jobId: queued.jobId }))
          // Both the website import and this foreground social job now exist. Give this scan the
          // first turn so an older background website pass cannot hold the modal open.
          void (window.desktop?.enrichment?.prioritize?.(queued.jobId) ?? window.desktop?.enrichment?.start?.())
          // Refresh the non-social summary in the background; the scan modal does not wait for
          // dashboard/list totals before the foreground social lookup can begin.
          void refreshLists()
        } catch (error) {
          flash(error instanceof Error ? error.message : 'The sites could not be imported.')
          setScan((current) => ({ ...current, phase: 'idle', jobId: '' }))
        }
      })()
    },
    [db, refreshLists, reload, flash],
  )

  /**
   * The pass reports itself as it goes, and the panel follows it site by site.
   *
   * The worker names the lead it is reading before it reads it, so a row becomes "done" when the
   * next name arrives and the row being read is the one showing the spinner. A pass that has
   * stopped — with nothing running and nothing queued — is the end of the scan.
   */
  useEffect(() => {
    if (!db || scan.phase !== 'scanning' || !scan.jobId) return
    const bridge = typeof window === 'undefined' ? undefined : window.desktop?.enrichment
    if (!bridge?.onProgress) return

    let cancelled = false
    let timer: number | undefined

    const unsubscribe = bridge.onProgress((progress) => {
      // The worker also reports progress for older queued cascades. Only the job opened by this
      // import belongs in this modal; otherwise an unrelated 50-lead pass can make a one-site scan
      // show somebody else's found count and active business forever.
      if (cancelled || progress.jobId !== scan.jobId || (progress.kind !== 'social' && progress.kind !== 'website')) return
      if (progress.status === 'running' && progress.leadName) {
        // The name being read now marks everything before it as read.
        setScan((current) => {
          const at = current.leadIds.findIndex((id, index) => index >= current.scannedIds.length && current.activeName === '')
          return {
            ...current,
            activeName: progress.leadName,
            found: progress.found,
            scannedIds: at >= 0 ? current.leadIds.slice(0, at) : current.scannedIds,
          }
        })
        return
      }
      if (progress.status === 'done') {
        // The runner emits this after the durable row is marked done. Finish the foreground panel
        // from the event itself instead of waiting for the next 1.2s status poll.
        social.refresh()
        void reload()
        setScan((current) => ({ ...current, phase: 'done', found: progress.found, activeName: '' }))
      }
    })

    // The worker's last word is silent — it stops rather than announcing that it has — so the queue
    // is what says the pass is over. Only the leads this scan queued are waited for.
    const poll = async (): Promise<void> => {
      try {
        const status = await db.jobs.status(scan.jobId)
        if (cancelled) return
        if (!status || status.status === 'queued' || status.status === 'running') {
          timer = window.setTimeout(() => void poll(), 450)
          return
        }
        social.refresh()
        reload()
        setScan((current) => ({ ...current, phase: 'done', activeName: '' }))
      } catch {
        if (!cancelled) timer = window.setTimeout(() => void poll(), 900)
      }
    }
    timer = window.setTimeout(() => void poll(), 450)

    return () => {
      cancelled = true
      unsubscribe()
      if (timer) window.clearTimeout(timer)
    }
  }, [db, scan.jobId, scan.phase, social, reload])

  /**
   * Files a paste of profile URLs, which needs no pass: the URL already says where the profile is.
   *
   * The lines are handed over rather than read from the box, so the same button serves both imports
   * and each one only receives the lines that are its own.
   */
  const runSocialImport = useCallback(
    (lines: string[]): void => {
      if (!db || !lines.length) return
      const token = ++scanToken.current
      setImpOpen(false)
      setImpValue('')
      setScan({ phase: 'scanning', jobId: '', urls: lines, leadIds: [], scannedIds: [], activeName: '', found: lines.length, added: 0 })
      void social
        .importProfiles(flash, lines)
        .then((result) => {
          if (scanToken.current !== token) return
          // The import answers with the leads it landed on, in the order the URLs were given, so the
          // table can hold exactly those — the URLs just imported — and nothing else.
          setScan((current) => ({
            ...current,
            phase: 'done',
            added: result?.added ?? 0,
            found: result?.added ?? 0,
            leadIds: result?.leadIds ?? [],
            scannedIds: result?.leadIds ?? [],
          }))
        })
        .catch(() => {
          if (scanToken.current === token) setScan((current) => ({ ...current, phase: 'idle' }))
        })
    },
    [db, social, flash],
  )
  runSocialImportRef.current = runSocialImport
  runWebsiteScanRef.current = runWebsiteScan

  // The finished panel stays until it is dismissed, or steps back to the covered bar on its own.
  useEffect(() => {
    if (scan.phase !== 'done') return
    const timer = window.setTimeout(() => setScan((current) => ({ ...current, phase: 'covered' })), 500)
    return () => window.clearTimeout(timer)
  }, [scan.phase])

  // Once the scan has finished, bring the Profiles card into view. The scan overlay is useful
  // while work is running, but its result is the rows below it; leaving the user at the toolbar
  // makes a completed scan look as if it did not file anything.
  useEffect(() => {
    if (scan.phase !== 'done') return
    const frame = window.requestAnimationFrame(() => {
      document.querySelector<HTMLElement>('[data-profcard="1"]')?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [scan.phase])

  /**
   * Builds suggestions from what is already on file and shows them. No page is visited: the
   * addresses and company pages already in the database are enough to propose names, which a
   * person then confirms or dismisses.
   */
  const buildSuggestions = useCallback(async () => {
    if (!db) {
      flash('The local database is not available in this window.')
      return
    }
    try {
      const { suggested } = await db.people.buildSuggestions()
      // The new rows are shown straight away rather than waiting for the next refresh. Decided
      // ones come back too, so a card that was dismissed in this session keeps its Undo.
      setSuggestions(await db.people.candidates(true))
      void refreshLists()
      flash(
        suggested
          ? `${suggested} new name${suggested === 1 ? '' : 's'} suggested. Confirm the ones that are right.`
          : 'Nothing new to suggest from what is on file.',
      )
    } catch (error) {
      flash(error instanceof Error ? error.message : 'Suggestions could not be built.')
    }
  }, [db, refreshLists, flash])

  const confirmSuggestion = useCallback(
    async (id: string) => {
      if (!db) return
      try {
        await db.people.confirm(id)
        setSuggestions(await db.people.candidates(true))
        void refreshLists()
        flash('Added to the named contacts.')
      } catch (error) {
        flash(error instanceof Error ? error.message : 'That suggestion could not be confirmed.')
      }
    },
    [db, refreshLists, flash],
  )

  const dismissSuggestion = useCallback(
    async (id: string) => {
      if (!db) return
      try {
        await db.people.dismiss(id)
        // Dismissed rows are read back as well, because the card that was decided now carries the
        // outcome and the Undo that reverses it.
        setSuggestions(await db.people.candidates(true))
        flash('Dismissed. It will not be suggested again.')
      } catch (error) {
        flash(error instanceof Error ? error.message : 'That suggestion could not be dismissed.')
      }
    },
    [db, refreshLists, flash],
  )

  /** Puts a dismissed suggestion back in the queue. A confirmed one has already become a contact. */
  const restoreSuggestion = useCallback(
    async (id: string) => {
      if (!db) return
      try {
        await db.people.restore(id)
        setSuggestions(await db.people.candidates(true))
        flash('Back in the queue.')
      } catch (error) {
        flash(error instanceof Error ? error.message : 'That suggestion could not be restored.')
      }
    },
    [db, flash],
  )

  useEffect(() => {
    if(!db || snapshot.running)return
    let cancelled=false
    const id=mapsRunId==='latest' ? runs[0]?.id : mapsRunId
    if(!id){setMapsLatestLeads([]);return}
    void db.leads.list({runId:id,limit:1600}).then(result=>{
      if(cancelled)return
      if(mapsRunId==='latest')setMapsLatestLeads(result.rows.map(storedToLead))
      else setMapsHistoryLeads(result.rows.map(storedToLead))
    }).catch(()=>{if(!cancelled)flash('Could not load this saved run. Please try again.')})
    return ()=>{cancelled=true}
  },[db,mapsRunId,runs,snapshot.running,snapshot.revision,flash])
  const mapsDisplayed = snapshot.running ? snapshot.leads : mapsRunId === 'latest' ? mapsLatestLeads : mapsHistoryLeads ?? []
  const mapsWith = (field: 'phone' | 'website' | 'email') => {
    if(field==='email') return mapsDisplayed.filter(lead=>email.rows.some(row=>row.leadId===lead.id && row.found.length)).length
    return mapsDisplayed.filter(lead=>Boolean(lead[field])).length
  }
  const mapsPct = (field: 'phone' | 'website' | 'email') => mapsDisplayed.length ? Math.min(100, Math.round(mapsWith(field) / mapsDisplayed.length * 100)) : 0
  /**
   * A four-segment strip with the leading share filled.
   *
   * The reference draws four segments on each summary tile, so the strip is four — a ten-segment
   * one would read as a different control rather than the one the design drew.
   */
  const bars = (share: number, filled: string) => {
    const on = Math.round(Math.min(1, Math.max(0, share)) * 4)
    // React takes a style object, not a CSS string, so each segment is described as properties.
    return Array.from({ length: 4 }, (_, index) => ({
      style: {
        flex: '1',
        height: '10px',
        borderRadius: '5px',
        background: index < on ? filled : '#E2E5DE',
      },
    }))
  }
  const mapsBars = (field: 'phone' | 'website' | 'email', filled: string) => bars(mapsPct(field) / 100, filled)

  // The Maps results table: the places this workspace holds, narrowed by the page's own filter.
  const mapsMatches = useMemo(() => {
    const needle = mapsQuery.trim().toLowerCase()
    const selected = mapsDisplayed.filter(lead=>mapsWebsite === "any" || (mapsWebsite === "has" ? Boolean(lead.website) : !lead.website))
    if (!needle) return selected
    return selected.filter((lead) =>
      `${lead.name} ${lead.address ?? ''} ${lead.area ?? ''} ${lead.website ?? ''} ${lead.phone ?? ''}`
        .toLowerCase()
        .includes(needle),
    )
  }, [mapsDisplayed, mapsQuery, mapsWebsite])

  // Capture the page's selection when opening the format picker, so later refreshes do not
  // change what the user is about to save.
  function openExport(kind: string, scopeIndex: number) {
    const exportKind = kind === 'runs' || kind === 'invoices' ? kind : 'leads'
    const columns = EXP_MODES[exportKind].cols.filter(column => column[1]).map(column => column[0])
    let count = storedLeadCount
    let title = 'Export leads'
    let description = 'all saved leads'
    let stem = 'saved-leads'
    let leadIds: string[] | undefined
    let leadFilterKey: 'all' | 'phone' | 'email' | 'social' | 'missing' | undefined
    let search: string | undefined
    if (exportKind === 'runs') {
      count = runs.length; title = 'Export run history'; description = 'saved runs'; stem = 'run-history'
    } else if (exportKind === 'invoices') {
      count = 0; title = 'Export invoices'; description = 'Download your paid invoices from Settings & Billing.'; stem = 'invoices'
    } else if (scopeIndex !== 2) {
      if (view === 'maps') {
        const selected = new Set(mapsSelected)
        leadIds = mapsMatches.filter(lead => !selected.size || selected.has(lead.id)).map(lead => lead.id)
        title = 'Export Google Maps leads'; description = selected.size ? 'selected leads' : 'results in the current view'; stem = 'google-maps-leads'
      } else if (view === 'email') {
        leadIds = [...new Set(emailFinder.rows.map(row => row.leadId))]
        title = 'Export email results'; description = 'leads in the current view'; stem = 'email-results'
      } else if (view === 'phone') {
        leadIds = [...new Set(phoneFinder.rows.map(row => row.leadId))]
        title = 'Export phone results'; description = 'leads in the current view'; stem = 'phone-results'
      } else if (scopeIndex === 1) {
        count = leadPageTotal; leadFilterKey = LEAD_FILTER_KEYS[leadFilter]; search = leadSearch.trim()
        description = 'leads matching the current filters'; stem = 'filtered-leads'
      }
      if (leadIds) count = leadIds.length
    }
    setExportSelection({ title, summary: exportKind === 'invoices' ? description : `${count.toLocaleString()} ${description} · choose a file format`, request: {
      kind: exportKind, limit: count, delimiter: 'csv', columns,
      fileName: `${stem}-${new Date().toISOString().slice(0,10)}`,
      ...(leadIds !== undefined ? {leadIds} : {}),
      ...(leadFilterKey ? {leadFilter:leadFilterKey,search} : {}),
    } })
    setExpOpen(true)
  }

  const openProfileExport = useCallback(() => setProfileExportOpen(true), [])
  const closeProfileExport = useCallback(() => setProfileExportOpen(false), [])
  const profileExportLeadIds = scan.phase === 'idle' ? social.visibleLeadIds : scan.leadIds

  /** Writes the Social Profiles page as a simple workbook or PDF, without the lead export options. */
  const runProfileExport = useCallback(
    async (format: 'xlsx' | 'pdf') => {
      if (exportLock.current) return
      if (!db) {
        flash('The local database is not available in this window.')
        return
      }
      exportLock.current = true
      setExportBusy(true)
      try {
        const result = await db.exports.write({
          kind: 'profiles',
          limit: Math.max(1, social.total),
          delimiter: 'csv',
          columns: ['Business name', 'Domain', 'Platform', 'Handle', 'Profile URL', 'Followers', 'Verified', 'Discovered'],
          fileName: `social-profiles.${format}`,
          format,
          leadIds: profileExportLeadIds,
        })
        if (!result) return
        setProfileExportOpen(false)
        flash(`Wrote ${result.rows} profile${result.rows === 1 ? '' : 's'} to ${result.fileName}.`)
      } catch (error) {
        flash(error instanceof Error ? error.message : 'The social profiles export could not be written.')
      } finally { exportLock.current = false; setExportBusy(false) }
    },
    [db, flash, profileExportLeadIds, social.total],
  )

  /** Save exactly the rows described by the compact format picker. */
  const runExport = async (format: 'xlsx' | 'pdf') => {
    if (exportLock.current || !exportSelection) return
    if (!db) { flash('The local database is not available in this window.'); return }
    if (!exportSelection.request.limit) { flash('There are no results to export.'); return }
    exportLock.current = true
    setExportBusy(true)
    try {
      const result = await db.exports.write({ ...exportSelection.request, format, fileName: `${exportSelection.request.fileName}.${format}` })
      if (!result) return
      setExpOpen(false)
      flash(`Saved ${result.rows} row${result.rows === 1 ? '' : 's'} to ${result.path}.`)
      notify('Export saved', result.path, 'success')
    } catch (error) {
      flash(error instanceof Error ? error.message : 'The export could not be written.')
    } finally { exportLock.current = false; setExportBusy(false) }
  }

  // The reference re-ran its DOM pass on every update; React renders the same attributes, so the
  // same queries apply. Re-skinning after the render keeps new rows themed immediately.
  useEffect(() => {
    layout()
    bindHover()
    buildTimeline()
    mountLottie()
    releaseDetachedAnimations()
    paintTheme(dark)
  })

  useEffect(() => {
    const onResize = () => layout()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    const handler = (event: MouseEvent) => {
      const element = event.target as Element | null
      const button = element?.closest?.('[data-action]') as HTMLElement | null
      if (button) actionClick(button)
    }
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [actionClick])

  useEffect(() => {
    scrollChat()
  }, [msgs.length, chatTyping, chatOpen])

  useEffect(
    () => () => {
      window.clearTimeout(toastTimer.current)
    },
    [],
  )

  /** The named contacts and the funnel behind them, read in one call. */
  const refreshPeople = useCallback(async () => {
    if (!db) return
    const session = dmSession.current
    try {
      const [rows, funnel, candidates, sessionLeads] = await Promise.all([
        db.people.ledger(),
        db.people.funnel(),
        // Dismissed suggestions come back too: a decided card shows its outcome and can be undone.
        db.people.candidates(true),
        Promise.all(session.leadIds.map((id) => db.leads.get(id))),
      ])
      setPeople({ rows: rows as DecisionMakerRow[], funnel })
      setSuggestions(candidates)
      if (session.generation === dmSession.current.generation) {
        setDmSessionLeads(sessionLeads.filter((lead): lead is StoredLead => Boolean(lead)))
      }
    } catch {
      // Leaving the last good value on screen beats clearing the page on a read failure.
    }
  }, [db])

  // Reloaded whenever a run finishes, because a run changes both the lead count and the usage.
  useEffect(() => {
    void refreshLists()
    void refreshUsage()
    void refreshMapsAllowance()
  }, [refreshLists, refreshUsage, refreshMapsAllowance, snapshot.running, snapshot.revision])
  useEffect(() => {
    window.addEventListener('nafran:billing-updated', refreshMapsAllowance)
    window.addEventListener('focus', refreshMapsAllowance)
    const timer = window.setInterval(() => void refreshMapsAllowance(), 60000)
    return () => {
      window.removeEventListener('nafran:billing-updated', refreshMapsAllowance)
      window.removeEventListener('focus', refreshMapsAllowance)
      window.clearInterval(timer)
    }
  }, [refreshMapsAllowance])

  // The Decision Makers page reads its funnel from the database, so it has to be filled on the
  // first load as well. Without this the page only ever populated when an enrichment pass
  // happened to finish while the window was open, and showed zeroes the rest of the time.
  useEffect(() => {
    void refreshPeople()
  }, [refreshPeople, snapshot.running, snapshot.revision])

  /**
   * The enrichment worker writes while the window is open, so its results have to be pulled in
   * when it stops. Polling while it runs is cheap: one small IPC call every few seconds, and only
   * while there is work in flight.
   */
  useEffect(() => {
    const bridge = typeof window === 'undefined' ? undefined : window.desktop?.enrichment
    if (!bridge) return
    let cancelled = false
    let timer: number | undefined

    const poll = async (): Promise<void> => {
      try {
        const status = await bridge.status()
        if (cancelled) return
        if (status.running || status.pending > 0) {
          enrichmentWasActive.current = true
          timer = window.setTimeout(() => void poll(), 2500)
          return
        }
        if (enrichmentWasActive.current) {
          enrichmentWasActive.current = false
          notify('Enrichment complete', 'The lookup queue is idle. Finder results are ready to review.', 'success')
        }
        // It has stopped, so whatever it found is now on file.
        await refreshLists()
        await refreshPeople()
      } catch {
        // A failed poll just means no refresh; the next action will reload anyway.
      }
    }

    void poll()
    return () => {
      cancelled = true
      if (timer) window.clearTimeout(timer)
    }
  }, [notify, refreshLists, refreshPeople])

  // A paid deep pass can finish between the queue poll ticks. Refresh its suggestions directly
  // from the completion event so the Decision Makers page shows the saved owner immediately.
  useEffect(() => {
    const bridge = typeof window === 'undefined' ? undefined : window.desktop?.enrichment
    if (!bridge?.onProgress) return
    return bridge.onProgress((progress) => {
      if (progress.kind === 'deep' && (progress.status === 'done' || progress.status === 'failed')) {
        void refreshPeople()
      }
    })
  }, [refreshPeople])

  // Fetch only the first page for All Leads. A search or chip change starts a new query over the
  // whole database; stale responses cannot overwrite a newer query.
  useEffect(() => {
    if (!db || view !== 'leads') return
    const generation = ++leadPageGeneration.current
    setLeadPage([])
    setLeadPageTotal(0)
    setLeadPageError('')
    setLeadPageLoading(true)
    const timer = window.setTimeout(() => {
      void db.leads.list({ limit: LEDGER_PAGE, filter: LEAD_FILTER_KEYS[leadFilter], search: leadSearch.trim() })
        .then((page) => {
          if (generation !== leadPageGeneration.current) return
          setLeadPage(page.rows)
          setLeadPageTotal(page.total)
        })
        .catch((error: unknown) => {
          if (generation === leadPageGeneration.current) setLeadPageError(error instanceof Error ? error.message : 'Could not load leads.')
        })
        .finally(() => {
          if (generation === leadPageGeneration.current) setLeadPageLoading(false)
        })
    }, leadSearch ? 180 : 0)
    return () => {
      window.clearTimeout(timer)
      leadPageGeneration.current += 1
    }
  }, [db, view, leadFilter, leadSearch, snapshot.revision])

  const showMoreLeadRows = useCallback(async () => {
    if (!db || leadPageLoading || leadPage.length >= leadPageTotal) return
    const generation = leadPageGeneration.current
    setLeadPageLoading(true)
    try {
      const page = await db.leads.list({ limit: 20, offset: leadPage.length, filter: LEAD_FILTER_KEYS[leadFilter], search: leadSearch.trim() })
      if (generation !== leadPageGeneration.current) return
      setLeadPage((current) => [...current, ...page.rows])
      setLeadPageTotal(page.total)
      setLeadPageError('')
    } catch (error) {
      if (generation === leadPageGeneration.current) setLeadPageError(error instanceof Error ? error.message : 'Could not load more leads.')
    } finally {
      if (generation === leadPageGeneration.current) setLeadPageLoading(false)
    }
  }, [db, leadPageLoading, leadPage.length, leadPageTotal, leadFilter, leadSearch])

  // Recent leads are kept for Maps and Saved Lists previews; All Leads uses its own database page.
  const ledger = useMemo<LedgerLead[]>(() => snapshot.leads.map(leadToLedger), [snapshot.leads])
  const visibleLedger = useMemo(() => leadPage.map(storedToLedger), [leadPage])
  const ledgerFiltered = useMemo(() => ledger.filter(LEDGER_FILTERS[leadFilter]?.[1] ?? (() => true)), [ledger, leadFilter])
  const ledgerWith = (predicate: (lead: LedgerLead) => boolean) => ledger.filter(predicate).length
  const ledgerShare = (count: number) => (ledger.length ? Math.round((count / ledger.length) * 100) : 0)
  const ledgerWithPhone = ledgerWith((lead) => lead.hasPhone)
  const ledgerWithEmail = ledgerWith((lead) => lead.hasEmail)
  const ledgerWithSocial = ledgerWith((lead) => lead.hasSocial)
  const ledgerFrom = (source: LedgerLead['source']) => ledgerWith((lead) => lead.source === source)

  const kept = ledger.filter((_, index) => keep[index]).length
  const found = snapshot.found
  const keywordCount = keywords.length

  const mode = EXP_MODES[expMode] ?? EXP_MODES.leads
  const scope = mode.scopes[expScope] ?? mode.scopes[0]
  const columnsOn = expCols.filter((column) => column.on).length
  const location = snapshot.request?.location ?? 'Manchester'
  const timeline = useMemo(() => [
    ...runs.map((run) => ({ kind: 'maps' as const, id: run.id, at: run.finished_at || run.started_at, run })),
    ...imports.batches.map((batch) => ({
      kind: 'import' as const,
      id: String(batch.id ?? ''),
      at: String(batch.created_at ?? ''),
      batch,
    })),
  ].sort((left, right) => right.at.localeCompare(left.at)), [runs, imports.batches])
  const filteredTimeline = timeline.filter((entry) => {
    if (focusedRunId && entry.id !== focusedRunId) return false
    if (runFilter === 1) return entry.kind === 'maps'
    if (runFilter === 2) return entry.kind === 'import'
    if (runFilter === 3) return entry.kind === 'maps' && entry.run.status === 'failed'
    return true
  })
  useEffect(() => {
    const search = globalQuery.trim()
    if (!db || !search) {
      setGlobalLeadRows([])
      return
    }
    let cancelled = false
    const timer = window.setTimeout(() => {
      void db.leads.list({ search, limit: 6 }).then((page) => {
        if (!cancelled) setGlobalLeadRows(page.rows)
      }).catch(() => {
        if (!cancelled) setGlobalLeadRows([])
      })
    }, 160)
    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [db, globalQuery, snapshot.revision])
  const globalResults = useMemo(() => {
    const needle = globalQuery.trim().toLowerCase()
    const pages = Object.entries(VIEW_NAMES)
      .filter(([key, label]) => !needle || `${key} ${label} ${key === 'maps' ? 'scraper scrapers scrape' : ''}`.toLowerCase().includes(needle))
      .slice(0, needle ? 4 : 6)
      .map(([target, title]) => ({ key: `page:${target}`, kind: 'Page', title, detail: 'Open page', target, id: '' }))
    if (!needle) return pages
    const leads = globalLeadRows
      .filter((lead) => `${lead.name} ${lead.website} ${lead.address} ${lead.area} ${lead.phone}`.toLowerCase().includes(needle))
      .map((lead) => ({ key: `lead:${lead.id}`, kind: 'Lead', title: lead.name, detail: `${hostOf(lead.website)} · ${lead.area || lead.address || 'Saved lead'}`, target: 'leads', id: lead.id }))
    const matchingRuns = runs
      .filter((run) => `${run.keywords} ${run.location} ${run.status} ${run.provider}`.toLowerCase().includes(needle))
      .slice(0, 4)
      .map((run) => ({ key: `run:${run.id}`, kind: 'Run', title: run.location || 'Maps run', detail: `${run.status} · ${run.found} places · ${shortDate(run.started_at)}`, target: 'runs', id: run.id }))
    const matchingImports = imports.batches
      .filter((batch) => `${batch.kind} import ${batch.source_count ?? ''}`.toLowerCase().includes(needle))
      .slice(0, 3)
      .map((batch) => ({ key: `import:${batch.id}`, kind: 'Import', title: `${String(batch.kind ?? 'Website')} import`, detail: `${Number(batch.added ?? 0)} added · ${shortDate(String(batch.created_at ?? ''))}`, target: 'runs', id: String(batch.id ?? '') }))
    return [...pages, ...leads, ...matchingRuns, ...matchingImports].slice(0, 12)
  }, [globalQuery, globalLeadRows, runs, imports.batches])
  const selectGlobalResult = (result: (typeof globalResults)[number]) => {
    setGlobalOpen(false)
    setGlobalQuery('')
    setGlobalSelection(0)
    if (result.kind === 'Lead') {
      setLeadSearch(result.title)
      setLeadFilter(0)
    }
    if (result.kind === 'Run' || result.kind === 'Import') {
      setRunFilter(0)
      setFocusedRunId(result.id)
      setRunsLimit((current) => Math.max(current, timeline.length))
    }
    go(result.target)
  }
  const mapsActivity = [
    ...(snapshot.running ? [{
      key: 'active-maps', at: snapshot.activityAt || new Date().toISOString(), level: 'LIVE',
      title: snapshot.message || 'Maps scrape running',
      detail: `${snapshot.found} of ${snapshot.target || '—'} places captured`,
    }] : []),
    ...enrichmentActivity.map((item) => ({
      key: `enrichment-${item.jobId}`, at: item.at, level: item.status === 'failed' ? 'WARN' : item.status === 'running' ? 'LIVE' : 'OK',
      title: `${item.kind} lookup ${item.status}${item.leadName ? ` · ${item.leadName}` : ''}`,
      detail: `${item.processed} of ${item.total} processed · ${item.found} found${item.status === 'failed' && item.message ? ` · ${item.message}` : ''}`,
    })),
    ...runs.filter((run) => run.provider === 'chromium-maps').slice(0, 6).map((run) => ({
      key: `run-${run.id}`, at: run.finished_at || run.started_at,
      level: run.status === 'failed' ? 'WARN' : run.status === 'done' ? 'OK' : 'INFO',
      title: `Maps scrape ${run.status}${run.location ? ` · ${run.location}` : ''}`,
      detail: `${run.found} place${run.found === 1 ? '' : 's'} captured${run.error ? ` · ${run.error}` : ''}`,
    })),
  ].sort((left, right) => right.at.localeCompare(left.at)).slice(0, 6).map((item) => ({
    ...item,
    when: new Date(item.at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }),
    // One tone per level, because the panel draws one pill per entry and the stylesheet cannot
    // choose between them.
    isWarn: item.level === 'WARN',
    isLive: item.level === 'LIVE',
    isInfo: item.level === 'INFO',
    isOk: item.level === 'OK',
  }))

  /**
   * The scope counts in the reference data are the design's sample figures. On a lead export the
   * three scopes describe rows this app actually holds, so they are read from the session: the
   * places the last run captured, the rows the ledger is currently showing, and the whole file.
   * Run and invoice exports keep their own numbers, which describe the log rather than leads.
   */
  const exportRun = view === 'maps' && mapsRunId !== 'latest' ? runs.find(run=>run.id===mapsRunId) : runs[0]
  const leadScopeCounts = [exportRun?.found ?? 0, view === 'maps' ? mapsMatches.length : leadPageTotal, storedLeadCount]
  const liveScope = { ...scope, n: expMode === 'leads' ? leadScopeCounts[expScope] ?? scope.n : scope.n }

  // What the local database holds, for copy that names the file's size rather than a sample.
  const onFile = dashboard?.total ?? ledger.length

  // The line under the page title: what is running, what the last run captured, or what is on
  // file when nothing has run in this session.
  const runNote = snapshot.running
    ? snapshot.message || `Scanning ${keywordCount} keywords near ${location} · pass 1 of ${keywordCount}.`
    : snapshot.leads.length
      ? (() => {
          // A restored run may carry no keyword list, so the count falls back to what is set.
          const used = snapshot.request?.keywords.length || keywordCount
          const took = snapshot.durationMs ? ` · finished in ${formatDuration(snapshot.durationMs)}` : ''
          // The count is the last run's own capture, not everything on file: the ledger holds
          // every run this workspace has done, and the line above it describes one of them.
          const captured = runs[0]?.found ?? snapshot.leads.length
          return `${captured} results from ${used} keyword${used === 1 ? '' : 's'} near ${location}${took}.`
        })()
      : `${storedLeadCount} leads on file · run a scrape to add more.`

  /**
   * Whether the run is still getting Google connected rather than scraping.
   *
   * The main process announces both halves of the gate with these two messages, and they are the
   * only progress a run reports before the first page is read. The button reads this so a run that
   * is waiting on the sign-in window does not claim to be scraping.
   */
  const runWaiting =
    snapshot.running && /checking the google account|google is not connected yet/i.test(snapshot.message)

  /**
   * The callbacks the recent-search chips run.
   *
   * Each chip carries its own term, and a term is data rather than a fixed control, so the rows
   * point at a callback by name instead of the value object carrying one action per chip. The map
   * is rebuilt on every render and holds only the terms currently on screen.
   */
  const socialPicks: Record<string, () => void> = {}

  // Other pages use all-time totals. Only the Dashboard uses the selected date window.
  const selectedDashboard = range === 'All Time'
    ? dashboard
    : rangeDashboard?.range === range ? rangeDashboard.totals : null
  const periodDays = range === '7 Days' ? 7 : range === '30 Days' ? 30 : null
  const periodStart = periodDays === null ? -Infinity : Date.now() - periodDays * 86_400_000
  const periodRuns = runs.filter((run) => {
    const started = Date.parse(run.started_at)
    return Number.isFinite(started) && started >= periodStart && started <= Date.now()
  })

  // The coverage rings are drawn by a circumference of 276.5.
  const CIRCUMFERENCE = 276.5
  const share = (count: number) => (dashboard?.total ? Math.round((count / dashboard.total) * 100) : 0)
  const dashShare = (count: number) => (selectedDashboard?.total ? Math.round((count / selectedDashboard.total) * 100) : 0)
  const offset = (pct: number) => String(Math.round(CIRCUMFERENCE * (1 - pct / 100)))
  const dashWithPhone = selectedDashboard?.withPhone ?? 0
  const dashWithEmail = selectedDashboard?.withEmail ?? 0
  const dashWithSocial = selectedDashboard?.withSocial ?? 0
  const dashDm = selectedDashboard?.decisionMakers ?? 0
  const dashEnriched = selectedDashboard?.enriched ?? 0
  const dashExportReady = selectedDashboard?.exportReady ?? 0
  const dashPhonePct = dashShare(dashWithPhone)
  const dashEmailPct = dashShare(dashWithEmail)
  const dashSocialPct = dashShare(dashWithSocial)
  const dashDmPct = dashShare(dashDm)
  const biggestPlatform = selectedDashboard?.platforms[0]
  // Compare a selected window with the equally long preceding window.
  const dashScrapeDelta = (() => {
    if (periodDays === null) return 'All time'
    const now = Date.now()
    const day = 24 * 60 * 60 * 1000
    const currentStart = now - periodDays * day
    const previousStart = now - periodDays * 2 * day
    const current = periodRuns
      .reduce((sum, run) => sum + (run.found ?? 0), 0)
    const previous = runs
      .filter((run) => {
        const at = new Date(run.started_at).getTime()
        return at >= previousStart && at < currentStart
      })
      .reduce((sum, run) => sum + (run.found ?? 0), 0)
    if (!previous) return current ? '+100%' : '—'
    const delta = Math.round(((current - previous) / previous) * 100)
    return `${delta >= 0 ? '+' : ''}${delta}%`
  })()
  const dashVolumeBars = (() => {
    if (!periodRuns.length) return []
    const now = Date.now()
    const first = Math.min(...periodRuns.map((run) => Date.parse(run.started_at)))
    const start = periodDays === null ? first : periodStart
    const bins = Array.from({ length: periodDays ?? 30 }, () => 0)
    for (const run of periodRuns) {
      const index = Math.min(bins.length - 1, Math.floor(((Date.parse(run.started_at) - start) / Math.max(1, now - start)) * bins.length))
      bins[Math.max(0, index)] += run.found ?? 0
    }
    const highest = Math.max(1, ...bins)
    return bins.map((leads) => ({ height: `${leads ? Math.max(6, Math.round((leads / highest) * 100)) : 0}%`, leads }))
  })()
  const dashboardValues = {
    dashVolumeLabel: range === 'All Time' ? 'Leads captured across all time.' : `Leads captured in the last ${periodDays} days.`,
    dashComparisonLabel: periodDays === null ? '' : `vs. previous ${periodDays} days`,
    dashVolumeEmpty: periodRuns.length ? '' : `No Maps runs in ${range.toLowerCase()}.`,
    dashVolumeBars,
    dashCategories: (selectedDashboard?.categories ?? []).map((category) => ({
      label: category.category,
      count: String(category.count),
      width: `${Math.max(6, Math.round((category.count / Math.max(1, selectedDashboard?.categories[0]?.count ?? 1)) * 100))}%`,
    })),
    dashDmOffset: offset(dashDmPct),
    dashDmPct,
    dashEmailOffset: offset(dashEmailPct),
    dashEmailPct,
    dashEnriched,
    dashEnrichedPct: `${dashShare(dashEnriched)}%`,
    dashExportNote: dashExportReady ? 'Ready' : 'Nothing yet',
    dashExportReady,
    // The "Needs Attention" card: one row per gap, each stating how many leads are behind it. A gap
    // with nothing behind it has no row to draw, so each carries its own flag — a number cannot be
    // handed to the template's truthiness test, because 0 is not one of the values it treats as
    // false.
    dashNoEmailOn: selectedDashboard?.noEmail ? '1' : '',
    dashNoPhoneOn: selectedDashboard?.noPhone ? '1' : '',
    dashExportReadyOn: dashExportReady ? '1' : '',
    dashActionCount: (() => {
      const open = [selectedDashboard?.noEmail ?? 0, selectedDashboard?.noPhone ?? 0, dashExportReady].filter((count) => count > 0).length
      return `${open} action${open === 1 ? '' : 's'}`
    })(),
    // The reference's insight line describes the biggest gap; this states the real one.
    dashInsight:
      selectedDashboard && selectedDashboard.total
        ? selectedDashboard.noEmail
          ? `${selectedDashboard.noEmail} of ${selectedDashboard.total} leads have a website but no address on file. A pass over their sites would lift email coverage from ${dashEmailPct}% towards ${dashShare(selectedDashboard.withWebsite)}%.`
          : `Every lead with a website has an address on file.${biggestPlatform ? ` ${biggestPlatform.leads} of ${selectedDashboard.total} carry a ${biggestPlatform.platform} profile.` : ''}`
        : 'Run a Google Maps scrape and this panel reports what was found.',
    dashNoEmail: selectedDashboard?.noEmail ?? 0,
    dashNoPhone: selectedDashboard?.noPhone ?? 0,
    // The three small tiles under the scrape-volume chart. They describe the run log, so they are
    // read from it: what the last seven days brought in, the best single run, and the average.
    dashWeekLeads: (() => {
      const since = Date.now() - 7 * 24 * 60 * 60 * 1000
      const total = runs
        .filter((run) => new Date(run.started_at).getTime() >= since)
        .reduce((sum, run) => sum + (run.found ?? 0), 0)
      return `${total.toLocaleString('en-GB')} leads`
    })(),
    dashBestRun: `${Math.max(0, ...periodRuns.map((run) => run.found ?? 0)).toLocaleString('en-GB')} leads`,
    dashAvgRun: `${periodRuns.length ? (periodRuns.reduce((sum, run) => sum + (run.found ?? 0), 0) / periodRuns.length).toFixed(1) : '0.0'} leads`,
    dashPhoneNote: `${dashPhonePct}%`,
    dashPhoneOffset: offset(dashPhonePct),
    dashPhonePct,
    dashPlatforms: (selectedDashboard?.platforms ?? []).map((platform) => ({
      short: platform.platform.slice(0, 2),
      label: platform.platform.charAt(0).toUpperCase() + platform.platform.slice(1),
      count: String(platform.leads),
      width: `${Math.max(6, Math.round((platform.leads / Math.max(1, selectedDashboard?.platforms[0]?.leads ?? 1)) * 100))}%`,
    })),
    dashQuality: selectedDashboard?.quality ?? 0,
    dashQualityLabel: selectedDashboard?.qualityLabel ?? 'No data',
    /**
     * The Social Platform Coverage chart.
     *
     * The design draws eight columns, tallest first, with a short platform code and a count under
     * each. The shape is the ranking, so the columns keep the drawing and take the platform that
     * belongs in their place: the biggest platform's code and count sit over the tallest column.
     * A workspace with fewer platforms than the drawing leaves the tail columns empty rather than
     * filling them with a name nothing was found for.
     */
    dashPlatformColumns: (() => {
      // The two-letter codes the rest of the app uses for each platform, so the chart reads
      // "IG 226" rather than the first two letters of whatever the database calls it.
      const CODES: Record<string, string> = {
        instagram: 'IG', facebook: 'FB', linkedin: 'LI', youtube: 'YT', tiktok: 'TT', x: 'X', other: 'OT',
      }
      const ranked = (selectedDashboard?.platforms ?? []).map((platform) => ({
        short: CODES[platform.platform.toLowerCase()] ?? platform.platform.slice(0, 2).toUpperCase(),
        count: String(platform.leads),
      }))
      while (ranked.length < 8) ranked.push({ short: '—', count: '0' })
      return ranked.slice(0, 8)
    })(),
    /**
     * The Top Categories list: the business types this workspace actually holds, most common first,
     * with the design's own words for how strong each one is.
     */
    dashCategoryRows: (selectedDashboard?.categories ?? []).slice(0, 6).map((category, index) => ({
      name: category.category,
      count: String(category.count),
      badge: index === 0 ? 'Top' : category.count >= 12 ? 'Strong' : category.count >= 6 ? 'Steady' : 'Thin',
      tone: index === 0 ? 'top' : index <= 2 ? 'strong' : 'steady',
    })),
    dashCategoriesEmpty: (selectedDashboard?.categories ?? []).length
      ? ''
      : 'No business types yet — run a scrape and the categories land here.',
    /**
     * The Run Timeline: one bar per run, oldest to newest, with the axis naming the period it
     * covers. The chips above it are milestones, and a milestone this workspace has not reached has
     * no chip to draw.
     */
    dashTimelineBars: (() => {
      const recent = periodRuns.slice(0, 24).reverse()
      const tallest = Math.max(1, ...recent.map((run) => run.found ?? 0))
      return recent.map((run) => ({ height: `${Math.max(4, Math.round(((run.found ?? 0) / tallest) * 100))}%` }))
    })(),
    dashTimelineAxis: (() => {
      const times = periodRuns.map((run) => new Date(run.started_at).getTime()).filter((time) => Number.isFinite(time))
      if (!times.length) return []
      const from = Math.min(...times)
      const to = Math.max(...times)
      return Array.from({ length: 5 }, (_, index) => ({ label: shortDate(new Date(from + ((to - from) * index) / 4).toISOString()) }))
    })(),
    dashTimelineEmpty: periodRuns.length ? '' : `No Maps runs in ${range.toLowerCase()}.`,
    // Five milestone chips, in the design's order. Each carries its own flag so a milestone this
    // workspace has not reached is simply not drawn.
    dashMile1: (() => {
      const first = periodRuns.length ? periodRuns[periodRuns.length - 1] : null
      return first ? `First Maps scrape · ${shortDate(first.started_at)}` : ''
    })(),
    dashMile1On: periodRuns.length ? '1' : '',
    dashMile2: `${periodRuns.length.toLocaleString('en-GB')} run${periodRuns.length === 1 ? '' : 's'} · ${periodRuns.reduce((sum, run) => sum + (run.found ?? 0), 0).toLocaleString('en-GB')} places captured`,
    dashMile2On: periodRuns.length ? '1' : '',
    dashMile3: `Enriched ↑ ${dashShare(selectedDashboard?.withContact ?? 0)}%`,
    dashMile3On: selectedDashboard?.total ? '1' : '',
    dashMile4: `${dashExportReady.toLocaleString('en-GB')} ready to export`,
    dashMile4On: dashExportReady ? '1' : '',
    dashMile5: `${(selectedDashboard?.total ?? 0).toLocaleString('en-GB')} lead${selectedDashboard?.total === 1 ? '' : 's'} captured`,
    dashMile5On: selectedDashboard?.total ? '1' : '',
    leadsOnFile: `${onFile.toLocaleString('en-GB')} saved leads`,
    dashSocialOffset: offset(dashSocialPct),
    dashSocialPct,
    dashTotal: selectedDashboard?.total ?? 0,
    dashScrapeDelta,
    dashTotalNote: dashScrapeDelta,
    dashWithPhone,
  }

  // Local usage counters supplement the separate Stripe billing status.
  const lookupWidth = (used: number, limit: number) => `${Math.min(100, Math.round((used / Math.max(1, limit)) * 100))}%`
  const usedEmailLookups = plan.lookups.email ?? 0
  const usedPhoneLookups = plan.lookups.phone ?? 0
  const usedSocialLookups = plan.lookups.social ?? 0
  const usedDmLookups = plan.lookups['decision-maker'] ?? 0
  const busiestLookup = Math.max(1, usedEmailLookups, usedPhoneLookups, usedSocialLookups, usedDmLookups)
  const billingValues = {
    // The window the usage counters actually cover: the current calendar month.
    cycleRange: (() => {
      const now = new Date()
      const start = new Date(now.getFullYear(), now.getMonth(), 1)
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 1)
      const format = (date: Date) => date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
      return `${format(start)} – ${format(end)}`
    })(),
    planSummary: 'Maps runs and lookup counts below are tracked on this device this month.',
    usedScrapes: usage?.used ?? 0,
    usedEmailLookups,
    usedPhoneLookups,
    usedSocialLookups,
    usedDmLookups,
    meterScrapes: lookupWidth(usage?.used ?? 0, usage?.limit ?? 2000),
    meterEmail: lookupWidth(usedEmailLookups, busiestLookup),
    meterPhone: lookupWidth(usedPhoneLookups, busiestLookup),
    meterSocial: lookupWidth(usedSocialLookups, busiestLookup),
    meterDm: lookupWidth(usedDmLookups, busiestLookup),
  }

  // Chips count the whole ledger rather than a fixed sample, so the numbers agree with the rows.
  const leadChips = LEDGER_FILTERS.map(([label], index) => ({
    label,
    count: String([
      leadStats?.total ?? storedLeadCount,
      leadStats?.withPhone ?? 0,
      leadStats?.withEmail ?? 0,
      leadStats?.withSocial ?? 0,
      leadStats?.noContact ?? 0,
    ][index]),
    on: leadFilter === index ? '1' : '0',
    pick: () => setLeadFilter(index),
  }))

  /**
   * What a finder page reports about a site: whether it has been read, and what that read found.
   *
   * All three pages ask the same question of different data, so the answer is assembled once here
   * from the leads the window already holds. `lastScannedAt` is written by the enrichment worker
   * as it reads each site, and `reloadLeads` re-reads it when a pass finishes.
   */
  const scannedIds = useMemo(() => {
    const ids = new Set<string>()
    for (const lead of snapshot.leads) if (lead.lastScannedAt) ids.add(lead.id)
    return ids
  }, [snapshot.leads])

  const emailFinder = useFinderScan({
    rows: email.rows.map((row) => ({
      leadId: row.leadId,
      domain: row.domain === '—' ? '' : row.domain,
      searchText: row.name,
      scanned: scannedIds.has(row.leadId),
      items: row.found.map((address) => ({ t: address.value, k: address.page })),
      validityStatuses: row.found.map((address) => address.validationStatus ?? 'unchecked'),
      emailDetails: row.found,
      statusLabel: row.statusLabel,
      // The page's own columns ride along, because the table under the bar is drawn from these rows:
      // index, business, the best address, its tier chip and how many were found.
      index: row.index,
      name: row.name,
      primary: row.primary,
      hasExtras: row.hasExtras,
      extrasLabel: row.extrasLabel,
      tone: row.tone,
      label: row.label,
      validityStatus: row.validityStatus ?? 'unchecked',
      isFound: row.isFound,
      isMuted: row.isMuted,
    })),
    mode: 'scan',
    queue: (leadIds) => queueLeads('email', leadIds),
    jobStatus: (jobId) => db?.jobs.status(jobId) ?? Promise.resolve(null),
    refresh: () => {
      email.refresh()
      reload()
    },
    ringSource: (rows) => ['Homepage','Contact page','Team page','Structured data'].map(name=>({name,count:rows.filter(row=>row.items.some(item=>item.k===name)).length})),
    actionLabel: 'Verify all',
    runningLabel: (queued) =>
      queued ? `Reading ${queued} site${queued === 1 ? '' : 's'} for addresses…` : 'Reading the sites on file for addresses…',
    doneLabel: (scanned) => `${scanned} site${scanned === 1 ? '' : 's'} read. Coverage below counts what each one published.`,
    onExport: () => openExport('leads', 0),
    resultSelector: '[data-flistcard="email"]',
  })

  const emailValidityFilter = emailFinder.filter
  const filteringEmailValidity = ['valid', 'invalid', 'risky', 'unknown', 'unchecked'].includes(emailValidityFilter)
  const emailTableRows = filteringEmailValidity
    ? emailFinder.rows.map((row) => {
      const details = row.emailDetails.filter((address) => (address.validationStatus ?? 'unchecked') === emailValidityFilter)
      if (!details.length) return row
      const tone: EmailTone = emailValidityFilter === 'valid' ? 'high' : emailValidityFilter === 'risky' ? 'low' : 'unverified'
      return {
        ...row,
        emailDetails: details,
        items: row.items.filter((_, index) => row.validityStatuses[index] === emailValidityFilter),
        primary: details[0].value,
        hasExtras: details.length > 1,
        extrasLabel: `+${Math.max(0, details.length - 1)}`,
        tone,
        label: details[0].validationLabel,
        validityStatus: details[0].validationStatus ?? 'unchecked',
        statusLabel: `Found ${details.length}`,
        status: `Found ${details.length}`,
      }
    })
    : emailFinder.rows

  const phoneFinder = useFinderScan({
    rows: phone.rows.map((row) => ({
      leadId: row.id,
      domain: hostOf(row.website),
      searchText: `${row.name} ${row.address} ${row.areaCode} ${row.phone}`,
      hasNumber: row.hasNumber,
      scanned: Boolean(row.lastScannedAt),
      items: row.found.map((number) => ({ t: number.value, k: pageLabelOf(number.page) })),
      // The phone ledger's own words for a row: the kind of line, or that there is none.
      statusLabel: row.hasNumber ? `${row.phone} · ${row.lineType === 'reception' ? 'Reception' : row.lineType === 'mobile' ? 'Mobile' : 'Direct'}` : 'No number',
      // The phone book's own columns, drawn through the finder's rows: the number, the kind of line
      // as the table words it, the dialling code and the address.
      id: row.id,
      index: row.index,
      name: row.name,
      phone: row.hasNumber ? row.phone : 'No number found',
      areaCode: row.areaCode || '—',
      address: row.address || 'Address pending',
      lineType: row.lineType === 'reception' ? 'Reception' : row.lineType === 'direct' ? 'Direct line' : row.lineType === 'mobile' ? 'Mobile' : 'No number',
      isReception: row.lineType === 'reception' ? '1' : '',
      isDirect: row.lineType === 'direct' ? '1' : '',
      isMobile: row.lineType === 'mobile' ? '1' : '',
      isMissing: row.hasNumber ? '' : '1',
    })),
    mode: 'scan',
    queue: (leadIds) => queueLeads('phone', leadIds),
    jobStatus: (jobId) => db?.jobs.status(jobId) ?? Promise.resolve(null),
    refresh: () => {
      void refreshPhone()
      reload()
    },
    ringSource: (rows) => [{name:'Reachable',count:rows.filter(row=>row.hasNumber).length},...['Reception','Direct line','Mobile'].map(name=>({name,count:rows.filter(row=>row.lineType===name).length}))],
    actionLabel: 'Check numbers',
    runningLabel: (queued) =>
      queued ? `Reading ${queued} site${queued === 1 ? '' : 's'} for numbers…` : 'Reading the sites on file for numbers…',
    doneLabel: (scanned) => `${scanned} site${scanned === 1 ? '' : 's'} read. Coverage below counts the lines each one published.`,
    onExport: () => openExport('leads', 0),
    resultSelector: '[data-flistcard="phone"]',
  })

  const dmScope = new Set(dmSession.current.leadIds)
  const dmPeopleRows = people.rows.filter((person) => dmScope.has(person.lead_id))
  const dmSuggestions = suggestions.filter((person) => dmScope.has(person.lead_id) && !dmPeopleRows.some(saved=>saved.lead_id===person.lead_id && saved.full_name.toLowerCase()===person.full_name.toLowerCase()))
  const dmMatchedIds = new Set(dmPeopleRows.map((person) => person.lead_id))
  const dmLinkedinIds = new Set(dmPeopleRows.filter((person) => person.linkedin_url).map((person) => person.lead_id))
  const dmPeople = { rows: dmPeopleRows, funnel: {
    total: dmSessionLeads.length, withWebsite: dmSessionLeads.filter((lead) => lead.website).length,
    withLinkedin: dmLinkedinIds.size, named: dmMatchedIds.size, matched: dmMatchedIds.size,
    missing: dmSessionLeads.length - dmMatchedIds.size,
  } }
  const dmFinder = useFinderScan({
    rows: dmSessionLeads.map((lead) => {
      const named = dmPeopleRows.filter((person) => person.lead_id === lead.id)
      return {
        leadId: lead.id,
        domain: hostOf(lead.website),
        searchText: lead.name,
        scanned: Boolean(lead.last_scanned_at),
        items: named.map((person) => ({ t: person.full_name, k: [person.title || 'Role not stated', person.email, person.phone, person.linkedin_url].filter(Boolean).join(' · ') })),
        statusLabel: named.length ? `${named.length} named` : 'No named contact',
      }
    }),
    mode: 'review',
    queue: async (leadIds) => {
      const result = await queueLeads('decision-maker', leadIds)
      if (leadIds.length && !result.jobId) throw new Error('The Decision Maker scan could not start.')
      return result
    },
    jobStatus: (jobId) => db?.jobs.status(jobId) ?? Promise.resolve(null),
    refresh: refreshPeople,
    ringSource: (rows) => [
      { name: 'Websites', count: rows.length },
      { name: 'Website read', count: rows.filter(row=>row.scanned).length },
      { name: 'LinkedIn found', count: rows.filter(row=>dmLinkedinIds.has(row.leadId)).length },
      { name: 'Person named', count: rows.filter(row=>dmMatchedIds.has(row.leadId)).length },
    ],
    actionLabel: 'Review suggestions',
    runningLabel: () => 'Reading the imported websites for published people and roles…',
    doneLabel: () => `${dmPeopleRows.length} named contact${dmPeopleRows.length === 1 ? '' : 's'} found across ${dmSessionLeads.length} imported website${dmSessionLeads.length === 1 ? '' : 's'}. Unpublished details stay blank.`,
    onStart: () => void buildSuggestions(),
    onExport: () => void runDecisionExport('xlsx'),
    // Bring this import's people and direct export buttons into view after the pass settles.
    resultSelector: '[data-fres="dm"]',
    filterItemsOnSearch: true,
  })

  const dmVisibleLeadIds = new Set(dmFinder.rows.map((row) => row.leadId))
  const dmVisiblePeople = dmPeopleRows.filter((person) => dmVisibleLeadIds.has(person.lead_id) &&
    matchesFinderSearch([person.full_name, person.title, person.lead_name, person.lead_website, person.email, person.phone, person.linkedin_url].filter(Boolean).join(' '), dmFinder.q))

  const runDecisionExport = async (format: 'xlsx' | 'pdf') => {
    if (!db || dmExportLock.current || dmFinder.scanning) return
    const session = { ...dmSession.current, leadIds: [...dmSession.current.leadIds] }
    if (!dmPeopleRows.length || !session.leadIds.length) { flash('Scan websites to find people before exporting.'); return }
    dmExportLock.current = true
    setDmExportBusy(true)
    try {
      const result = await db.exports.write({ kind: 'people', format, limit: dmPeopleRows.length,
        delimiter: 'csv', fileName: `decision-makers.${format}`, leadIds: session.leadIds,
        columns: ['Business name', 'Domain', 'Decision maker', 'Role', 'Email', 'Phone', 'Business emails', 'Business phones', 'Business address', 'Published social links', 'LinkedIn', 'Source', 'Saved date'],
      })
      if (!result || result.rows === 0) return
      if (session.generation === dmSession.current.generation) {
        dmSession.current = { generation: session.generation + 1, leadIds: [] }
        setDmSessionLeads([])
        setDmBlocker('All blockers')
        setDmContactLimit(40)
        dmFinder.reset()
        void refreshPeople()
        void refreshLists()
      }
      flash(`Saved ${result.rows} contact${result.rows === 1 ? '' : 's'} to ${result.fileName}. Ready for the next scan.`)
    } catch (error) { flash(error instanceof Error ? error.message : 'The export could not be saved. Your scan is still available.') }
    finally { dmExportLock.current = false; setDmExportBusy(false) }
  }

  const runFinderImport = useCallback(
    (page: 'email' | 'phone' | 'dm', lines: string[]): void => {
      if (!db || !lines.length) return
      setImpOpen(false)
      setImpValue('')
      const dmGeneration = page === 'dm' ? dmSession.current.generation + 1 : null
      if (dmGeneration !== null) {
        dmSession.current = { generation: dmGeneration, leadIds: [] }
        setDmSessionLeads([])
        setDmContactLimit(40)
        setDmBlockerLimit(40)
        setDmBlocker('All blockers')
        dmFinder.reset()
      }
      void (async () => {
        try {
          const result = await db.imports.websites(lines)
          if (dmGeneration !== null) {
            if (dmGeneration !== dmSession.current.generation) return
            dmSession.current = { generation: dmGeneration, leadIds: [...new Set(result.leadIds)] }
          }
          const field = document.querySelector<HTMLTextAreaElement>('[data-imptext="1"]')
          if (field) field.value = ''
          // Refresh the lead snapshot and the active finder in parallel. The old sequential
          // chain made a one-site lookup wait for five independent database reads before its
          // worker could even start.
          await Promise.all([
            refreshLists(),
            // Refresh workspace previews alongside the explicit imported-site scope.
            reload(),
            page === 'email' ? email.refresh() : Promise.resolve(),
            page === 'phone' ? refreshPhone() : Promise.resolve(),
            page === 'dm' ? refreshPeople() : Promise.resolve(),
          ])
          if (dmGeneration !== null && dmGeneration !== dmSession.current.generation) return
          const finder = page === 'email' ? emailFinder : page === 'phone' ? phoneFinder : dmFinder
          finder.scanImported(result.leadIds)
          flash(`${result.leadIds.length} website${result.leadIds.length === 1 ? '' : 's'} selected for ${page === 'email' ? 'email' : page === 'phone' ? 'phone' : 'decision maker'} lookup.`)
        } catch (error) {
          flash(error instanceof Error ? error.message : 'The sites could not be imported.')
        }
      })()
    },
    [db, refreshLists, reload, email, refreshPhone, refreshPeople, emailFinder, phoneFinder, dmFinder, flash],
  )
  runFinderImportRef.current = runFinderImport

  /**
   * The ledger, grouped by the day each lead was saved.
   *
   * The page says "Newest capture first, grouped by the day it was saved", so the days are the
   * grouping and the rows sit inside them — a heading states its own count rather than leaving the
   * reader to add the rows up. The chip filter and the search both narrow the list before it is
   * grouped, so a heading can never claim a lead the list is not showing.
   */
  const leadDays = useMemo(() => {
    const days = new Map<string, LedgerLead[]>()
    for (const lead of visibleLedger) {
      const list = days.get(lead.saved) ?? []
      list.push(lead)
      days.set(lead.saved, list)
    }
    return Array.from(days, ([label, rows]) => ({
      label,
      count: `${rows.length} added`,
      rows: rows.map((lead) => ({
        ini: lead.ini,
        name: lead.name,
        domain: lead.domain,
        hp: lead.hasPhone ? '1' : '0',
        he: lead.hasEmail ? '1' : '0',
        hs: lead.hasSocial ? '1' : '0',
        source: SOURCE_LABELS[lead.source],
        score: String(lead.score),
        saved: lead.saved,
      })),
    }))
  }, [visibleLedger])

  /**
   * The lead-level answer to "why not this one": what blocked each lead that has no contact.
   *
   * It is built here rather than inside the values object because two keys describe it — the rows
   * themselves and the count the footer states — and the count has to be the rows' own length.
   */
  const dmBlockerRows = (() => {
    const withPeople = new Set(dmPeople.rows.map((person) => person.lead_id))
    const blocked = dmSessionLeads.filter((lead) => !withPeople.has(lead.id))
    return blocked
      .map((lead) => {
        const blocker = !lead.website ? 'No website' : lead.last_scanned_at ? 'No people listed' : 'Pending'
        return {
          name: lead.name,
          domain: hostOf(lead.website) || 'No website found',
          blocker,
          isNoWebsite: blocker === 'No website' ? '1' : '',
          isNoPeople: blocker === 'No people listed' ? '1' : '',
          isPending: blocker === 'Pending' ? '1' : '',
        }
      })
      .filter((row) => dmBlocker === 'All blockers' || row.blocker === dmBlocker)
      .slice(0, dmBlockerLimit)
  })()

  // The main process sends this compact, live workspace snapshot with each AI request. It gives
  // MamaLead Assist useful answers about the current account without exposing the local database or
  // provider credential to the renderer's page.
  assistantContextRef.current = {
    page: view,
    totalLeads: dashboard?.total ?? snapshot.leads.length,
    leadsWithEmail: dashboard?.withEmail ?? ledgerWithEmail,
    leadsWithPhone: dashboard?.withPhone ?? ledgerWithPhone,
    leadsWithSocialProfiles: dashboard?.withSocial ?? ledgerWithSocial,
    namedDecisionMakers: dashboard?.decisionMakerPeople ?? people.rows.length,
    missingDecisionMakers: people.funnel?.missing ?? 0,
    decisionMakerSearchesRemaining: decisionAllowance?.remaining ?? null,
    decisionMakerSearchesLimit: decisionAllowance?.limit ?? null,
    decisionMakerPeriodEndsAt: decisionAllowance?.renewsAt ?? null,
    decisionMakerAccessStatus: decisionAllowance?.status ?? null,
    leadsReadyToExport: dashboard?.exportReady ?? 0,
    mapsRuns: runStats.runs,
    placesCaptured: runStats.places,
    mapsScrapesUsed: usage?.used ?? 0,
    mapsScrapeLimit: usage?.limit ?? 2000,
    activeScan: snapshot.running,
  }

  return {
    featureAccessAllowed,
    showAccessPrompt,
    workspaceName: /^(Nafran Leads|Local workspace)$/i.test(workspaceName) ? "MamaLead" : workspaceName,
    workspaceMembers,
    localTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'System time zone',
    localDataPath: store?.path || 'Local database path unavailable',
    globalQuery,
    globalOpen,
    globalResults: globalResults.map((result, index) => ({
      ...result,
      active: index === globalSelection,
      pick: () => selectGlobalResult(result),
    })),
    onGlobalInput: (event: React.InputEvent<HTMLInputElement>) => {
      setGlobalQuery(event.currentTarget.value)
      setGlobalSelection(0)
      setGlobalOpen(true)
    },
    onGlobalFocus: () => setGlobalOpen(true),
    onGlobalKey: (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setGlobalSelection((index) => Math.min(globalResults.length - 1, index + 1))
      } else if (event.key === 'ArrowUp') {
        event.preventDefault()
        setGlobalSelection((index) => Math.max(0, index - 1))
      } else if (event.key === 'Enter' && globalResults.length) {
        event.preventDefault()
        selectGlobalResult(globalResults[Math.max(0, Math.min(globalSelection, globalResults.length - 1))])
      }
    },
    activeRange: range,
    activeTab: stab,
    activeView: view,
    lifetimeCheckoutPending: lifetimeCheckoutUntil > Date.now(),
    decisionPrompt,
    licenseNextStep,
    startLifetimeCheckoutWatch,
    startDecisionCheckoutWatch,
    clearLicenseNextStep: () => setLicenseNextStep(''),
    chEmails: chEmails ? '1' : '0',
    chLinkedin: chLinkedin ? '1' : '0',
    chPhones: chPhones ? '1' : '0',
    chSocial: chSocial ? '1' : '0',
    chatChips: CHAT_CHIPS.map((label) => ({ label, send: () => say(label) })),
    chatOpen,
    chatTyping,
    closeChat: () => setChatOpen(false),
    closeExp: () => setExpOpen(false),
    closeImp: () => {
      setImpOpen(false)
      setImpValue('')
      social.closeImport()
    },
    decMax: () => setMaxResults((current) => Math.max(5, current - 5)),
    delimChips: DELIMS.map((entry, index) => ({
      label: entry[0],
      count: '',
      on: delim === index ? '1' : '0',
      pick: () => setDelim(index),
    })),
    droppedCount: Math.max(0, storedLeadCount - kept),
    expAllCols: () => setExpCols((current) => current.map((column) => ({ label: column.label, on: true }))),
    expBadge: DELIMS[delim][1].slice(1).toUpperCase(),
    expCols: expCols.map((column, index) => ({
      label: column.label,
      on: column.on ? '1' : '0',
      toggle: () =>
        setExpCols((current) => current.map((entry, position) => (position === index ? { label: entry.label, on: !entry.on } : entry))),
    })),
    expFile: scope.file.replace(/\.csv$/, DELIMS[delim][1]),
    expNote: mode.note,
    expOpen,
    expScopes: mode.scopes.map((entry, index) => ({
      label: entry.label,
      count: (expMode === 'leads' ? leadScopeCounts[index] ?? entry.n : entry.n).toLocaleString('en-GB'),
      on: expScope === index ? '1' : '0',
      pick: () => setExpScope(index),
    })),
    expSize: `≈ ${Math.max(1, Math.round(liveScope.n * columnsOn * 0.021))} KB`,
    expSummary: `${liveScope.n.toLocaleString('en-GB')} rows × ${columnsOn} columns`,
    expTitle: exportSelection?.title ?? 'Export leads',
    simpleExportSummary: exportSelection?.summary ?? '',
    simpleExportEmpty: !exportSelection?.request.limit,
    exportBusy,
    exportExcel: () => void runExport('xlsx'),
    exportPdf: () => void runExport('pdf'),
    emailBadge: email.coverage.badge,
    emailBuckets: email.coverage.buckets,
    emailCascade: email.coverage.cascade,
    emailChips: email.coverage.chips,
    emailExtracted: email.coverage.extracted,
    emailNeedsVerify: email.coverage.needsVerify,
    emailNoAddress: email.coverage.noAddress,
    emailPerLead: email.coverage.perLead,
    emailRisky: email.coverage.risky,
    emailUnknown: email.coverage.validity.unknown,
    emailUnknownVisible: leadsAngelConfigured && email.coverage.validity.unknown > 0,
    emailRows: email.rows,
    emailShowing: emailTableRows.length,
    emailState: email.state || (filteringEmailValidity && !emailTableRows.length
      ? `No ${emailValidityFilter === 'unchecked' ? 'not checked' : emailValidityFilter} email addresses found.`
      : ''),
    emailTotal: email.coverage.total,
    emailValidityBusy: email.verifying ? '1' : '',
    emailValidityLabel: email.validityProgress.state === 'cancelling'
      ? 'Stopping…'
      : email.verifying ? `Checking ${email.validityProgress.checked}/${email.validityProgress.total}…` : 'Email validity',
    emailValidityProgressText: email.validityProgress.message,
    emailValidityProgressState: email.validityProgress.state,
    leadsAngelConfigured,
    emailRecheckProvider: 'LeadsAngel',
    recheckUnknownEmailValidity: () => void recheckUnknownEmailValidity(),
    cancelEmailValidity: () => void email.cancelValidity(),
    emailValidityAllActive: emailValidityFilter === 'all',
    showAllEmailValidity: () => emailFinder.showFilter('all'),
    emailValidityStats: [
      { key: 'valid', label: 'Valid', count: email.coverage.validity.valid, background: '#DCEAD5', color: '#315F2D' },
      { key: 'invalid', label: 'Invalid', count: email.coverage.validity.invalid, background: '#F4D8D5', color: '#9E3F39' },
      { key: 'risky', label: 'Risky', count: email.coverage.validity.risky, background: '#F1E5C5', color: '#8B6417' },
      { key: 'unknown', label: 'Unknown', count: email.coverage.validity.unknown, background: '#E0E3E5', color: '#555D61' },
      { key: 'unchecked', label: 'Not checked', count: email.coverage.validity.unchecked, background: '#EAEAE8', color: '#555956' },
    ].map((item) => ({
      ...item,
      active: emailValidityFilter === item.key,
      pick: () => emailFinder.showFilter(item.key),
    })),
    verifyEmailValidity: () => void verifyEmailValidity(),
    // The next run shares one total cap across all keywords and selected areas.
    foundLabel: snapshot.running
      ? `${found} of ${Math.max(found, snapshot.target || found)} mapped`
      : `0 of ${Math.max(1, maxResults)} mapped`,
    goDashboard: () => go('dashboard'),
    goDm: () => go('dm'),
    goEmail: () => go('email'),
    goLeads: () => go('leads'),
    goLists: () => go('lists'),
    goMaps: () => go('maps'),
    goPhone: () => go('phone'),
    goRuns: () => go('runs'),
    goSettings: () => go('settings'),
    showPlanWelcome: showPlanWelcome && !planWelcomeDismissed,
    dismissPlanWelcome: () => setPlanWelcomeDismissed(true),
    openWelcomeBilling: () => {
      go('settings')
      setStab('plan')
      setPlanWelcomeDismissed(true)
      setBillingJump({target:'trial'})
    },
    goSocial: () => go('social'),
    logout,
    goTabAcct: () => setStab('acct'),
    goTabInv: () => setStab('inv'),
    goTabPay: () => setStab('pay'),
    goTabPlan: () => setStab('plan'),
    goTabTeam: () => setStab('team'),
    goWebsite: () => go('website'),
    bulkKeywordsOpen,
    openBulkKeywords: () => setBulkKeywordsOpen(true),
    closeBulkKeywords,
    bulkKeywordsText,
    onBulkKeywordsInput: (event: React.FormEvent<HTMLTextAreaElement>) => setBulkKeywordsText(event.currentTarget.value),
    pasteBulkKeywords: () => void pasteBulkKeywords(),
    clearBulkKeywords: () => setBulkKeywordsText(''),
    replaceBulkKeywords: () => applyBulkKeywords('replace'),
    addBulkKeywords: () => applyBulkKeywords('add'),
    bulkKeywordHasTerms: bulkKeywordPreview.terms.length > 0,
    bulkKeywordCountLabel: `${bulkKeywordPreview.terms.length} unique keyword${bulkKeywordPreview.terms.length === 1 ? '' : 's'} ready`,
    bulkKeywordDuplicateLabel: bulkKeywordPreview.duplicates
      ? `${bulkKeywordPreview.duplicates} duplicate${bulkKeywordPreview.duplicates === 1 ? '' : 's'} will be removed`
      : 'Duplicates are removed automatically',
    bulkKeywordLimitLabel: bulkKeywordPreview.terms.length > MAX_MAP_KEYWORDS
      ? `Only the first ${MAX_MAP_KEYWORDS} will be used — ${bulkKeywordPreview.terms.length - MAX_MAP_KEYWORDS} over the run limit`
      : `Up to ${MAX_MAP_KEYWORDS} keywords per run`,
    bulkKeywordRows: bulkKeywordPreview.terms.slice(0, MAX_MAP_KEYWORDS).map((label, index) => ({ label, index: index + 1 })),
    impLabel: `${impCount}${impCount === 1 ? ' site ready' : ' sites ready'}`,
    // The modal's Scan button needs the same click handler as the page-level import controls.
    // Keeping it in the values object is what connects the rendered button to the website/social
    // import dispatch below.
    impImport: () => {
      // Read the textarea at click time as well as the ref. This covers native paste/IME input
      // where the browser updates the field before React has delivered its input event.
      const field = document.querySelector<HTMLTextAreaElement>('[data-imptext="1"]')
      const raw = field?.value ?? impText.current
      impText.current = raw
      const lines = pastedLines(raw)
      const profileLines = lines.filter(isProfileLine)
      const siteLines = lines.filter((line) => !isProfileLine(line))
      if (!profileLines.length && !siteLines.length) {
        flash('Paste a website URL first, then choose Scan.')
        return
      }
      if (siteLines.length) {
        if (view === 'email' || view === 'phone' || view === 'dm') runFinderImportRef.current(view, siteLines)
        else runWebsiteScanRef.current(siteLines)
      }
      if (profileLines.length) runSocialImportRef.current(profileLines)
    },
    impOpen,
    incMax: () => setMaxResults((current) => Math.min(200, current + 5)),
    isDashboard: view === 'dashboard',
    isDm: view === 'dm',
    isEmail: view === 'email',
    isLeads: view === 'leads',
    isLists: view === 'lists',
    isMaps: view === 'maps',
    isPhone: view === 'phone',
    isRuns: view === 'runs',
    isSettings: view === 'settings',
    isSocial: view === 'social',
    isStub: Boolean(LABELS[view]) && VIEWS_WITH_REAL_DATA.indexOf(view) < 0,
    isTone: email.isTone,
    isWebsite: view === 'website',
    keepGood: () => setKeep(ledger.map((row) => row.score >= 90)),
    keepNone: () => setKeep(ledger.map(() => false)),
    keptBadge: `${kept} BOOKMARKED`,
    keptCount: kept,
    keywords: keywords.map((label, index) => ({
      label,
      remove: () => setKeywords((current) => current.filter((_, position) => position !== index)),
    })),
    kwCount: `${keywordCount}${keywordCount === 1 ? ' keyword' : ' keywords'}`,
    leadChips,
    // The lead ledger: real captured leads when a run has happened, the reference's sample rows
    // otherwise. Every count below is derived from the same array the rows come from.
    ledgerBadge: String(storedLeadCount),
    ledgerFromImport: ledgerFrom('import'),
    ledgerFromManual: ledgerFrom('manual'),
    ledgerFromMaps: ledgerFrom('maps'),
    ledgerRows: ledgerFiltered.map((row) => ({
      ini: row.ini,
      name: row.name,
      domain: row.domain,
      area: row.area,
      saved: row.saved,
      score: row.score,
      // data-on attributes want '1'/'0' because CSS matches the string, but every one of these
      // also drives an sc-if, and the string '0' is truthy in JavaScript. Conditionals get real
      // booleans; the attribute copies keep the string form.
      band: row.score >= 90 ? 'hi' : row.score >= 75 ? 'mid' : 'low',
      high: row.score >= 90,
      low: row.score < 90,
      hp: row.hasPhone,
      he: row.hasEmail,
      hs: row.hasSocial,
      hpOn: row.hasPhone ? '1' : '0',
      heOn: row.hasEmail ? '1' : '0',
      hsOn: row.hasSocial ? '1' : '0',
      isMaps: row.source === 'maps',
      isImport: row.source === 'import',
      isManual: row.source === 'manual',
      source: SOURCE_LABELS[row.source],
    })),
    ledgerShowing: ledgerFiltered.length,
    ledgerSize: `${Math.max(0.1, ledger.length * 0.033).toFixed(1)} MB`,
    ledgerStore: '~/leads.db',
    // The Maps page shows what this run captured, which is the leads still in the session.
    // The Maps page shows every place this workspace holds, newest first, so the line above the
    // table says that rather than claiming the whole file came from one run.
    mapsCaptured: snapshot.running
      ? `${snapshot.found} ${snapshot.found === 1 ? 'business' : 'businesses'} captured so far.`
      : mapsDisplayed.length
        ? `${mapsDisplayed.length} businesses in the selected search.`
        : 'No places captured yet — run a scrape and they land here.',
    mapsRows: mapsMatches.slice(0, mapsLimit).map((lead) => {
      const row = leadToLedger(lead)
      const found = email.rows.find((entry) => entry.name === lead.name)
      const socials = social.rows.find((entry) => entry.name === lead.name)
      const person = people.rows.find((entry) => entry.lead_name === lead.name)
      // The address cell is drawn over two lines: street first, then town and postcode.
      const segments = (lead.address || '').split(',').map((part) => part.trim()).filter(Boolean)
      const postcodeAt = segments.findIndex((part) => /^[A-Z]{1,2}\d/i.test(part))
      const line1 = segments.slice(0, Math.max(1, postcodeAt < 0 ? segments.length - 1 : postcodeAt)).join(', ')
      const line2 = segments.slice(Math.max(1, postcodeAt < 0 ? segments.length - 1 : postcodeAt)).join(' ')
      return {
        id: lead.id, website: lead.website,
        ini: row.ini,
        name: row.name,
        domain: row.domain,
        address: lead.address || lead.area || 'Address pending',
        addressLine1: line1 || 'Address pending',
        addressLine2: line2 || lead.area || '',
        phone: lead.phone || 'No phone found',
        email: found && found.primary !== 'No email found' ? found.primary : 'No email found',
        rating: lead.rating === null ? 'Not rated' : `${lead.rating} ★`,
        reviews: `${lead.reviewCount ?? 0} reviews`,
        score: row.score,
        band: row.score >= 90 ? 'hi' : row.score >= 75 ? 'mid' : 'low',
        // The score pill keeps the design's two tones: a strong lead is drawn dark, a weaker one in
        // its light green. Both halves of the colour are bound, because a light background with the
        // dark pill's light text would be unreadable.
        scoreBg: row.score >= 90 ? '#1C1C1C' : '#DDE3D6',
        scoreColor: row.score >= 90 ? '#F0F0F0' : '#1C1C1C',
        // The socials cell: one chip per profile the site published, or the design's own "none".
        socials: (socials?.profiles ?? []).map((profile) => ({ short: profile.short })),
        noSocials: !(socials?.profiles ?? []).length,
        // The decision column names the person the match found for this lead, or says there is
        // none. A platform name is not a decision, so it is the people table that answers here.
        decision: person ? person.title || 'Named contact' : 'No DM',
        decisionBg: person ? '#DDE3D6' : '#EAEAE8',
        decisionColor: person ? '#1C1C1C' : '#4A4F4B',
      }
    }),
    mapsShowing: Math.min(mapsMatches.length, mapsLimit),
    mapsTotal: mapsMatches.length,
    mapsState: mapsDisplayed.length
      ? mapsMatches.length
        ? ''
        : `No place matches “${mapsQuery.trim()}”.`
      : 'No places captured yet — run a scrape and every business it finds is listed here.',
    mapsMoreOn: mapsMatches.length > mapsLimit ? '1' : '',
    mapsMoreLabel: `Show all ${mapsMatches.length}`,
    showMoreMaps: () => setMapsLimit((current) => current + 25),
    mapsQueryText: mapsQuery,
    onMapsInput: (event: React.InputEvent<HTMLInputElement>) => setMapsQuery(event.currentTarget.value),
    // The summary strip: how far the run has got, and what share of the places it captured carry a
    // phone number, a website and an address. Every figure is read from the run itself.
    mapsProgress: String(snapshot.running ? snapshot.found : mapsDisplayed.length),
    mapsProgressTotal: String(snapshot.running ? snapshot.target : mapsDisplayed.length),
    mapsProgressBadge: snapshot.running ? 'Running' : mapsDisplayed.length ? 'Done' : 'Not run',
    mapsProgressBars: bars(snapshot.target ? (snapshot.found || 0) / snapshot.target : 0, '#A9BC9B'),
    // The place actually being searched, so the panel and the map name it rather than the
    // reference's own city. A run in flight reports its request; otherwise the last run's.
    runLocation: location,
    // The ledger spans more than one run, and the map plots all of it, so its caption names every
    // area the pins came from rather than only the one searched last.
    mapsAreas: (mapsRunId==='latest' ? runs[0] : runs.find(run=>run.id===mapsRunId))?.location || location,
    mapsRadius: pinSpread(mapsDisplayed),
    mapsRadiusShort: pinSpread(mapsDisplayed),
    mapsActivity,
    mapsActivityEmpty: mapsActivity.length ? '' : 'Nothing has run yet — start a scrape and it is logged here.',
    // How the browser runs, and how the city is being split, for the controls on the Maps page.
    // The `data-on` values are the strings this app's stylesheet matches: `data-sw` switches read
    // "1", while the pin and sweep layers read "y". A boolean satisfies neither, so each control
    // is given the exact token its own rule looks for.
    runVisible: scraperSettings.visible ? '1' : '0',
    runVisibleLabel: scraperSettings.visible ? 'Visible' : 'Headless',
    runVisibleNote: scraperSettings.visible
      ? 'A browser window opens for each run.'
      : 'Runs in the background — faster, more likely to be throttled. Connecting Google still opens the app’s browser once.',
    toggleVisible,
    paceChoice: `${(scraperSettings.paceMinSeconds + scraperSettings.paceMaxSeconds) / 2} s · ${scraperSettings.paceMinSeconds >= 10 ? "very gentle" : scraperSettings.paceMinSeconds >= 6 ? "careful" : scraperSettings.paceMinSeconds >= 3 ? "steady" : "quick"}`,
    paceMin: scraperSettings.paceMinSeconds,
    paceMax: scraperSettings.paceMaxSeconds,
    paceLabel: `${scraperSettings.paceMinSeconds}–${scraperSettings.paceMaxSeconds}s between places`,
    paceSlow: () => updateScraperSettings({ paceMinSeconds: Math.min(PACE_LIMITS.max, scraperSettings.paceMinSeconds + 0.5), paceMaxSeconds: Math.min(PACE_LIMITS.max, scraperSettings.paceMaxSeconds + 0.5) }),
    paceFast: () => updateScraperSettings({ paceMinSeconds: Math.max(PACE_LIMITS.min, scraperSettings.paceMinSeconds - 0.5), paceMaxSeconds: Math.max(PACE_LIMITS.min, scraperSettings.paceMaxSeconds - 0.5) }),
    paceAtFloor: scraperSettings.paceMinSeconds <= PACE_LIMITS.min,
    paceAtCeiling: scraperSettings.paceMaxSeconds >= PACE_LIMITS.max,
    // Which browser program to drive. A path to an executable only — every run gets a new profile.
    browserPath: scraperSettings.browserPath,
    browserLabel: scraperSettings.browserPath
      ? (scraperSettings.browserPath.split(/[\\/]/).pop() ?? scraperSettings.browserPath)
      : 'Bundled Chromium',
    browserChosen: scraperSettings.browserPath ? 'y' : 'n',
    browserNote: scraperSettings.browserPath
      ? 'Pointed at this program. Connecting Google opens this app’s own bundled Chromium, which Google accepts for a sign-in.'
      : 'The app’s own bundled Chromium — its own profile folder, never the browser you browse with.',
    pickBrowser,
    clearBrowser,
    // The shared import modal: a paste box, and a button that only appears once there is something
    // to import. What it imports is read from the paste rather than from the page it was opened on —
    // a social profile URL is filed as a profile, anything else as a site — so pasting a website on
    // the Social Profiles page imports that website rather than reporting nothing to import.
    onImpText: (event: React.InputEvent<HTMLTextAreaElement>) => {
      const value = event.currentTarget.value
      impText.current = value
      setImpValue(value)
      const lines = pastedLines(value)
      const profiles = lines.filter(isProfileLine)
      setImpLines(lines.length)
      setImpSites(lines.length - profiles.length)
      setImpProfiles(profiles.length)
      // The Social page's own preview reads the box as it is typed, so its badge and hint stay in
      // step with what the button is about to do.
      if (social.importOpen) social.importInput(value)
    },
    impHasLines: impLines > 0,
    impValue,
    impScanLabel: (() => {
      const sites = `Scan ${impSites} site${impSites === 1 ? '' : 's'}`
      const profiles = `Import ${impProfiles} profile${impProfiles === 1 ? '' : 's'}`
      if (!impProfiles) return sites
      if (!impSites) return profiles
      // A paste holding both says so, because the button is about to run both imports.
      return `${sites} · ${profiles}`
    })(),
    leadDays,
    leadQuery: leadSearch,
    onLeadInput: (event: React.InputEvent<HTMLInputElement>) => setLeadSearch(event.currentTarget.value),
    leadSearchPlaceholder: `Search ${storedLeadCount} lead${storedLeadCount === 1 ? '' : 's'}…`,
    // The permanent-store card: what the workspace actually holds, and where it came from. The
    // provider split is the database's own count, so the bar and the legend beside it agree.
    storeCount: String(storedLeadCount),
    storeWhere: store ? `Stored on this machine at ${store.path} · ${store.size}` : 'Stored on this machine, in this app’s own data folder.',
    storeSources: (() => {
      const total = Math.max(1, storedLeadCount)
      const counts = new Map<string, number>()
      for (const row of leadStats?.byProvider ?? []) {
        const source = row.provider === 'import' ? 'import' : row.provider === 'chromium-maps' ? 'maps' : 'manual'
        counts.set(source, (counts.get(source) ?? 0) + row.count)
      }
      return (['maps', 'import', 'manual'] as const).map((source) => {
        const count = counts.get(source) ?? 0
        return {
          label: source === 'maps' ? 'Google Maps scraper' : source === 'import' ? 'Website import' : 'Manual entry',
          count: String(count),
          // A share of nothing is nothing: the bar stays empty rather than showing a stub.
          flex: String(Math.max(count ? 1 : 0, Math.round((count / total) * 100))),
        }
      })
    })(),
    // Every figure here comes from the workspace's own aggregate rather than from the rows on
    // screen: this card states what the machine holds, and the visible ledger is one page of it.
    storeOnFile: (() => {
      const total = Math.max(1, dashboard?.total ?? storedLeadCount ?? ledger.length)
      const share = (count: number) => `${Math.round((count / total) * 100)}%`
      return [
        { label: 'Phone numbers', count: dashboard?.withPhone ?? 0, pct: share(dashboard?.withPhone ?? 0) },
        { label: 'Email addresses', count: dashboard?.withEmail ?? 0, pct: share(dashboard?.withEmail ?? 0) },
        { label: 'Social profiles', count: dashboard?.withSocial ?? 0, pct: share(dashboard?.withSocial ?? 0) },
      ]
    })(),
    //
    // The box is uncontrolled in the document — it writes `defaultValue` and reports every keystroke
    // — so the term lives in the hook and each event hands it over. Enter, comma and leaving the
    // box all commit, which is what puts the term in the history.
    socQ: social.search,
    onSocInput: (event: React.InputEvent<HTMLInputElement>) => {
      if (scan.phase === 'done' || scan.phase === 'covered') exitScan()
      social.setSearch(event.currentTarget.value)
    },
    onSocKey: (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key !== 'Enter' && event.key !== ',') return
      event.preventDefault()
      social.setSearch(event.currentTarget.value)
      social.commitSearch()
    },
    onSocBlur: (event: React.FocusEvent<HTMLInputElement>) => {
      social.setSearch(event.currentTarget.value)
      social.commitSearch()
    },
    onSocState: (event: React.ChangeEvent<HTMLSelectElement>) => {
      const value = event.currentTarget.value
      if (scan.phase === 'done' || scan.phase === 'covered') exitScan()
      social.setFilter(value === 'With socials' ? 'with' : value === 'Pending' ? 'pending' : value === 'No website' ? 'nowebsite' : 'all')
    },
    socRefresh: social.refresh,
    // The recent searches the chips read: the term and what it left on screen. A chip is data
    // rather than a fixed control, so the click is looked up by name in the map the object carries.
    socHist: social.history.map((entry) => {
      socialPicks[entry.term] = () => social.pickSearch(entry.term)
      const { run: _named, ...chip } = {
        q: `“${entry.term}”`,
        n: entry.results === null ? '' : `${entry.results} lead${entry.results === 1 ? '' : 's'}`,
        run: `socialPicks[${JSON.stringify(entry.term)}]`,
      }
      return { ...chip, run: socialPicks[entry.term] }
    }),
    covSub: 'Share of the leads on file that carry a profile on each platform.',
    covRings: social.donuts.map((donut) => ({
      name: donut.label,
      pct: donut.pct,
      leads: `${donut.count} leads`,
      off: donut.offset,
    })),
    covBars: social.extras.map((extra) => ({
      tag: extra.short,
      name: extra.label,
      n: String(extra.count),
      w: extra.width,
    })),
    // The scan's own rows, in the order the URLs were given.
    //
    // One list serves both places the design draws it: the scan panel while the pass runs, and the
    // Profiles table underneath, which is why a row carries the table's columns as well as the
    // panel's chips and status. With no scan running the table is the page's own list — every lead
    // the search and filter left — and a scan replaces it with the sites it was given.
    scanRows: (() => {
      if (scan.phase === 'idle') {
        return social.rows.map((row) => ({
          phase: row.isDone ? 'done' : 'pending',
          name: row.name,
          domain: row.domain,
          scanning: '',
          scanLabel: '',
          profiles: row.profiles.map((profile) => ({ tag: profile.short, url: profile.url })),
          chips: row.profiles.map((profile) => ({ t: profile.short, k: profile.label, url: profile.url })),
          none: row.noProfiles ? '1' : '',
          pill: row.isDone ? 'done' : 'pending',
          status: row.isDone ? 'Done' : 'Pending',
        }))
      }
      const total = scan.leadIds.length || scan.urls.length
      const scanned = new Set(scan.scannedIds)
      const activeIndex = scan.activeName
        ? social.rows.findIndex((row) => row.name === scan.activeName && scan.leadIds.includes(row.leadId))
        : -1
      return scan.urls.slice(0, total || scan.urls.length).map((url, index) => {
        const leadId = scan.leadIds[index]
        const row = leadId ? social.rows.find((entry) => entry.leadId === leadId) : undefined
        // Before the worker names a site, its position is all that is known: the one being read is
        // the first that has not been read yet.
        const isActive =
          scan.phase === 'scanning' && (index === activeIndex || (activeIndex < 0 && index === scan.scannedIds.length))
        // A finished scan leaves every row done, whether or not the worker got as far as reporting
        // it: the pass is over, and a row still saying "Waiting" would be a scan that never ends.
        const isDone =
          scan.phase !== 'scanning' ||
          scanned.has(leadId ?? '') ||
          (Boolean(leadId) && !isActive && scan.scannedIds.length > index)
        const host = url.replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/+$/, '')
        return {
          phase: isActive ? 'scanning' : isDone ? 'done' : 'wait',
          name: row?.name ?? host,
          domain: row?.domain || host,
          scanning: isActive ? '1' : '',
          scanLabel: isActive ? 'Scanning…' : '',
          profiles: (row?.profiles ?? []).map((profile) => ({ tag: profile.short, url: profile.url })),
          // The panel's chips carry the platform's label as the tooltip; the table's carry the URL.
          chips: (row?.profiles ?? []).map((profile) => ({ t: profile.short, k: profile.label, url: profile.url })),
          none: !isActive && isDone && row?.noProfiles ? '1' : '',
          pill: isActive ? 'scanning' : isDone ? 'done' : 'pending',
          status: isActive ? 'Scanning' : isDone ? 'Done' : 'Waiting',
        }
      })
    })(),
    // The panel the design draws while a pass runs, in the design's own words: what it is reading,
    // how far it has got, and what it has found so far.
    scanOverlay: scan.phase === 'scanning' || scan.phase === 'done',
    scanCancelVisible: scan.phase === 'scanning' ? '1' : '',
    ovTitle: (() => {
      const total = scan.leadIds.length || scan.urls.length
      if (scan.phase !== 'scanning') return 'Scan complete'
      return `Scanning ${total} website${total === 1 ? '' : 's'}`
    })(),
    ovNote: (() => {
      const total = scan.leadIds.length || scan.urls.length
      const done = scan.phase === 'scanning' ? scan.scannedIds.length : total
      const found = scan.found
      return `${done} of ${total} done · ${found} profile${found === 1 ? '' : 's'} found so far`
    })(),
    ovPct: (() => {
      const total = scan.leadIds.length || scan.urls.length
      if (!total) return '0%'
      // A site being read counts as half, which is what makes the bar move while the pass works.
      const done = scan.scannedIds.length + (scan.phase === 'scanning' && scan.scannedIds.length < total ? 0.5 : 0)
      return `${Math.round((Math.min(total, done) / total) * 100)}%`
    })(),
    exportProfiles: openProfileExport,
    profileExportOpen,
    profileExportSummary: `${profileExportLeadIds.length} visible lead${profileExportLeadIds.length === 1 ? '' : 's'} · saved profile links only`,
    exportProfilesExcel: () => void runProfileExport('xlsx'),
    exportProfilesPdf: () => void runProfileExport('pdf'),
    closeProfileExport,
    googleNote: googleNoteFor(googleStatus),
    toggleGoogleProfile,
    signInGoogle,
    googleProfileOn: '1',
    // Run Behaviour's Google row, the switches and the delay list, as the updated design draws them.
    gAcctOn: googleStatus?.signedIn ? '1' : '0',
    gAcctTitle: googleStatus?.signedIn ? 'Google account connected' : 'No Google account connected',
    gAcctNote: googleStatus?.signedIn
      ? 'Runs start from this account, in this app’s own browser.'
      : 'Choose Google sign-in or a private guest session before each run.',
    gAcctBtn: googleStatus?.signedIn ? 'Replace' : 'Sign in to Google…',
    gAcctAction: () => {
      void signInGoogle()
    },
    swBrowser: scraperSettings.visible ? '1' : '0',
    toggleBrowser: () => toggleVisible(),
    swDistricts: districtSearches.length ? '1' : '0',
    toggleDistricts: () => {
      if (districtSearches.length) clearDistricts()
      else splitByDistrict()
    },
    districtNote: districtSearches.length
      ? `${keywords.length} keyword${keywords.length === 1 ? '' : 's'} × ${districtSearches.length} districts = ${keywords.length * districtSearches.length} searches`
      : 'Each district is its own search, so Maps’ result ceiling applies per area instead of once per city.',
    paceOptions: PACE_CHOICES.map((choice) => ({
      label: choice.label,
      selected: choice.seconds === scraperSettings.paceMinSeconds ? '1' : '0',
      choose: () => updateScraperSettings({ paceMinSeconds: choice.seconds, paceMaxSeconds: choice.seconds + 1 }),
    })),
    // Chrome, Edge and Brave present better to Google than a build that looks like automation, so
    // the picker offers them beside the bundled browser; the path is all the run is told.
    browserOptions: BROWSER_PATHS.map((browser) => ({
      label: browser.label,
      selected: (scraperSettings.browserPath || '') === browser.path ? '1' : '0',
      choose: () => updateScraperSettings({ browserPath: browser.path }),
    })),
    // The pickers are selects, so the choice is read from the option's own words and matched back
    // to the list: the document draws them, this is what makes them mean something.
    onPaceChoice: (event: React.ChangeEvent<HTMLSelectElement>) => {
      const chosen = PACE_CHOICES.find((choice) => choice.label === event.currentTarget.value)
      if (chosen) updateScraperSettings({ paceMinSeconds: chosen.seconds, paceMaxSeconds: chosen.seconds })
    },
    onBrowserChoice: (event: React.ChangeEvent<HTMLSelectElement>) => {
      const chosen = BROWSER_PATHS.find((browser) => browser.label === event.currentTarget.value)
      updateScraperSettings({ browserPath: chosen?.path ?? '' })
    },
    // The Google window panel: what step the sign-in is at, and every way to work it.
    //
    // It is shown only while the sign-in is actually happening, and for a moment after it lands so
    // the confirmation is read. A connected account is a fact rather than a dialog, and a dialog
    // left on screen covers the whole window — including the way out of it.
    gWin: googlePanel !== 'closed',
    gDisplay: googlePanel === 'closed' ? 'none' : 'grid',
    gSigning: googlePanel !== 'connected',
    gDone: googlePanel === 'connected',
    // The two halves of Google's own page, which is what the window asks for first and second.
    gStep: googlePanel === 'waiting' ? '2' : '1',
    gHeading: googlePanel === 'waiting' ? 'Type your password' : 'Choose your account',
    gOpen: () => {
      void signInGoogle()
    },
    gNext: () => {
      void readGoogleStatus().then(() => undefined)
    },
    gCancel: () => setGooglePanel('closed'),
    gOpenLabel: googlePanel === 'waiting' ? 'Bring the window forward' : 'Open Google’s window',
    gFoot:
      googlePanel === 'waiting'
        ? 'Waiting for the account. The run starts the moment it is in — close the window to cancel.'
        : 'This app never sees the password; it keeps only the profile folder the window leaves behind.',
    gDoneNote: 'Runs start from this account, in this app’s own browser.',
    // The field Google's page asks for at each half of the sign-in. It is shown read-only: the
    // typing happens in the window, and this says which box is waiting there.
    gFieldType: googlePanel === 'waiting' ? 'password' : 'email',
    gFieldVal: googlePanel === 'waiting' ? '••••••••' : 'you@gmail.com',
    gNextLabel: googlePanel === 'waiting' ? 'Check the connection' : 'Next',
    districts: districtSearches,
    districtCount: districtSearches.length,
    districtsOn: districtSearches.length ? '1' : '0',
    // The note is a layer, not a switch, so it follows the pin/sweep convention.
    splitNoteOn: districtSearches.length ? 'y' : 'n',
    splitByDistrict,
    clearDistricts,
    splitNote: districtSearches.length
      ? `${keywords.length} keyword${keywords.length === 1 ? '' : 's'} × ${districtSearches.length} districts = ${keywords.length * districtSearches.length} searches`
      : 'Each district is its own search, so Maps\u2019 result ceiling applies per district instead of once per city.',
    // What this run produced, for the tiles under the map. Each bar strip fills in proportion.
    mapsDone: snapshot.total,
    mapsDoneNote: snapshot.total ? 'Done' : 'Nothing yet',
    mapsWithPhone: mapsWith('phone'),
    mapsPhonePct: `${mapsPct('phone')}%`,
    mapsPhonePctNumber: mapsPct('phone'),
    mapsPhoneBars: mapsBars('phone', '#C8D5BB'),
    mapsWithWebsite: mapsWith('website'),
    mapsWebsitePct: `${mapsPct('website')}%`,
    mapsWebsitePctNumber: mapsPct('website'),
    mapsWebsiteBars: mapsBars('website', '#C8D5BB'),
    mapsWithEmail: mapsWith('email'),
    mapsEmailPct: `${mapsPct('email')}%`,
    mapsEmailPctNumber: mapsPct('email'),
    mapsEmailBars: mapsBars('email', '#D5DECB'),
    // The map's pins take the businesses this run captured. Where a lead carries coordinates the
    // pin is plotted from them, so the shape on the map is the searched area itself — Lahore pins
    // land where Lahore is, and Manchester pins where Manchester is. Leads without coordinates
    // (an import, or a listing Google gave no position for) are spread on a fixed grid instead.
    mapsPins: (() => {
      const placed = mapsDisplayed.slice(0, 8)
      const points = placed.filter(
        (lead): lead is typeof lead & { latitude: number; longitude: number } =>
          typeof lead.latitude === 'number' && typeof lead.longitude === 'number',
      )
      const spread = [22, 34, 46, 58, 70, 30, 54, 42]
      const drop = [38, 26, 52, 34, 60, 68, 74, 46]
      let bounds: { minLat: number; maxLat: number; minLng: number; maxLng: number } | null = null
      if (points.length > 1) {
        const lats = points.map((lead) => lead.latitude)
        const lngs = points.map((lead) => lead.longitude)
        bounds = {
          minLat: Math.min(...lats),
          maxLat: Math.max(...lats),
          minLng: Math.min(...lngs),
          maxLng: Math.max(...lngs),
        }
      }
      /** Keeps a pin inside the plot and away from the very edge, where its label would clip. */
      const inset = (share: number) => `${Math.min(92, Math.max(4, Math.round(share * 100)))}%`
      return placed.map((lead, index) => {
        let x = `${spread[index] ?? 50}%`
        let y = `${drop[index] ?? 50}%`
        if (bounds && typeof lead.latitude === 'number' && typeof lead.longitude === 'number') {
          // A single point has no extent to scale against, so it sits at the centre of the plot.
          const lngSpan = bounds.maxLng - bounds.minLng
          const latSpan = bounds.maxLat - bounds.minLat
          const across = lngSpan > 0 ? (lead.longitude - bounds.minLng) / lngSpan : 0.5
          // Latitude grows northwards while the plot grows downwards, so the axis is flipped.
          const down = latSpan > 0 ? 1 - (lead.latitude - bounds.minLat) / latSpan : 0.5
          x = inset(across * 0.84 + 0.08)
          y = inset(down * 0.78 + 0.11)
        }
        const row = leadToLedger(lead)
        return {
          // The stylesheet hides every pin until `data-on="y"`, which is what fades it in as the
          // place lands. Any other truthy value leaves the plot empty.
          on: 'y',
          // The running panel reveals its pins one at a time as places land, which is what the
          // reference's p1…p8 flags did; the map shows every pin it has.
          reveal: index < found ? 'y' : 'n',
          // The reference alternates its pill colours; the map keeps that alternation.
          color: index % 4 === 0 || index % 4 === 3 ? '#1C1C1C' : '#C8D5BB',
          ini: row.ini,
          name: lead.name.length > 22 ? `${lead.name.slice(0, 21)}\u2026` : lead.name,
          x,
          y,
        }
      })
    })(),
    ledgerTotal: storedLeadCount,
    // The All Leads footer counts the rows on screen against everything on file, which is more
    // than one page of them. The rows are read from the grouped list, so the footer and the table
    // cannot disagree about how many leads the page is showing.
    leadsShowing: leadDays.reduce((total, day) => total + day.rows.length, 0),
    leadsOnFileTotal: leadPageTotal,
    leadsResultLabel: leadFilter || leadSearch.trim() ? 'matching leads' : 'saved leads',
    leadsMoreOn: leadPage.length < leadPageTotal ? '1' : '',
    leadsLoading: leadPageLoading,
    leadsLoadError: leadPage.length ? leadPageError : '',
    showMoreLeads: showMoreLeadRows,
    leadsState: leadDays.length
      ? ''
      : leadPageError || (leadPageLoading ? 'Loading leads…' : storedLeadCount
        ? 'No lead matches this filter — clear the search or pick another chip.'
        : 'No leads on file yet — run a scrape or import a website and they will be listed here.'),
    ledgerWithEmail,
    ledgerWithEmailShare: ledgerShare(ledgerWithEmail),
    ledgerWithPhone,
    ledgerWithPhoneShare: ledgerShare(ledgerWithPhone),
    ledgerWithSocial,
    ledgerWithSocialShare: ledgerShare(ledgerWithSocial),
    // The plan usage behind the sidebar meter, and the lists the workspace actually has.
    daysLeft: 'Local usage',
    sidebarLeads: `${(storedLeadCount || ledger.length).toLocaleString('en-GB')} lead${(storedLeadCount || ledger.length) === 1 ? '' : 's'} on file`,
    sidebarDays: mapsAllowance?.kind === 'trial' ? `${mapsAllowance.remaining} leads left` : mapsAllowance?.kind === 'lifetime' ? 'Unlimited' : 'Local usage',
    scrapeUsed: mapsAllowance?.kind === 'trial' ? String(mapsAllowance.used) : mapsAllowance?.kind === 'lifetime' ? '∞' : (usage?.used ?? 0).toLocaleString('en-GB'),
    // The meter is the used share of the allowance, as two segments of one bar. A workspace that
    // has used nothing still shows a bar rather than a gap, so the rail keeps its shape.
    scrapeUsedFlex: String(Math.max(1, Math.round(((mapsAllowance?.used ?? 0) / 300) * 100))),
    scrapeFreeFlex: String(Math.max(1, Math.round(((300 - (mapsAllowance?.used ?? 0)) / 300) * 100))),
    showScrapeMeter: mapsAllowance?.kind === 'trial',
    remainingScrapes: Math.max(0, (usage?.limit ?? 2000) - (usage?.used ?? 0)),
    scrapeLimit: mapsAllowance?.kind === 'trial' ? 'of 300 Maps leads' : mapsAllowance?.kind === 'lifetime' ? 'Maps leads · unlimited' : 'Maps runs this month',
    storedLeadCount: storedLeadCount.toLocaleString('en-GB'),
    listTotals: `${lists.length} ${lists.length === 1 ? 'list' : 'lists'} · ${lists.reduce((sum, list) => sum + list.members, 0)} leads`,
    // The picks are what the last run brought back, which is a page of the ledger rather than the
    // whole workspace: a card each for hundreds of leads would be a scroll nobody finishes.
    pickCount: `${Math.min(ledger.length, 50)} ${Math.min(ledger.length, 50) === 1 ? 'place' : 'places'}`,
    lastRunLine: runs.length
      ? `${termsOfRun(runs[0]) ? `“${termsOfRun(runs[0])}” near ` : 'Near '}${runs[0].location || location} · ${shortDateTime(runs[0].started_at)}`
      : `“${keywords.join(', ')}” near ${location} · nothing run yet`,
    /** The total the bookmark counter is out of: the picks the page is showing. */
    pickTotalLabel: `of ${Math.min(ledger.length, 50)} bookmarked`,
    savedLists: lists.map((list) => ({
      id: list.id,
      name: list.name,
      members: `${list.members} ${list.members === 1 ? 'lead' : 'leads'}`,
      note: list.members
        ? `${list.members} lead${list.members === 1 ? '' : 's'} set aside from the captures, ready to work.`
        : 'Nothing saved into this list yet.',
      updated: list.updated_at ? `Updated ${shortDate(list.updated_at)}` : 'Nothing added yet',
      avatars: list.initials
        .split('')
        .slice(0, 3)
        .map((ini) => ({ ini })),
      // The reference draws six pips; they fill in proportion to how many leads are in the list.
      // A style binding needs an object, not a CSS string, because the template passes it
      // straight to React.
      pips: Array.from({ length: 6 }, (_, index) => ({
        style: {
          flex: '1',
          height: '8px',
          borderRadius: '4px',
          background: index < Math.min(6, list.members) ? '#8FA382' : '#E2E5DE',
        },
      })),
    })),
    queueEmail: () => void queueEnrichment('email'),
    queuePhone: () => void queueEnrichment('phone'),
    queueSocial: () => void queueEnrichment('social'),
    queueDecisionMakers: () => dmFinder.scanImported(dmSession.current.leadIds),
    // The deep pass, which the design prices at one credit per lead: one paid search each, for the
    // people a site does not name. It needs the user's own DataForSEO key, so the button says what
    // is missing rather than quietly doing nothing.
    deepKeySet: deepKey || deepKeyFromEnvironment ? '1' : '0',
    deepKeyLabel: deepKey ? describeDeepKey(deepKey) : deepKeyFromEnvironment ? 'Set by this machine' : 'Not set',
    deepKeyDraft,
    deepKeyNote: deepKeyCheck
      ? deepKeyCheck.note
      : deepKeyFromEnvironment
        ? 'Set by this machine’s environment. Saving one here takes over from it.'
        : deepKey
          ? 'Press Test to check it against the account.'
          : 'A DataForSEO key is needed. Add one here to search for decision makers.',
    onDeepKeyInput: (event: React.InputEvent<HTMLInputElement>) => setDeepKeyDraft(event.currentTarget.value),
    saveDeepKey: () => {
      const saved = storeDeepKey(deepKeyDraft)
      setDeepKey(saved)
      setDeepKeyDraft('')
      flash(saved ? 'DataForSEO key saved on this machine.' : 'DataForSEO key removed.')
    },
    testDeepKey: () => {
      const candidate = deepKeyDraft.trim() || deepKey
      if (!candidate) {
        flash('Enter a DataForSEO key first.')
        return
      }
      setDeepKeyTesting(true)
      void window.desktop?.deep
        ?.check(candidate)
        .then((result) => {
          setDeepKeyCheck(result)
          flash(result.note)
        })
        .catch(() => flash('The key could not be checked.'))
        .finally(() => setDeepKeyTesting(false))
    },
    deepKeyTesting: deepKeyTesting ? '1' : '0',
    leadsAngelLabel: leadsAngelConfigured ? `Ready${leadsAngelExpiresOn ? ` · expires ${leadsAngelExpiresOn}` : ''}` : 'Not imported',
    importLeadsAngelZip: () => {
      void window.desktop?.emailValidity?.importLeadsAngelZip().then((result) => {
        setLeadsAngelConfigured(result.configured)
        setLeadsAngelExpiresOn(result.expiresOn)
        if (result.configured) flash('LeadsAngel SMTP license imported securely.')
      }).catch((error) => flash(error instanceof Error ? error.message : 'LeadsAngel ZIP could not be imported.'))
    },
    removeLeadsAngel: () => {
      void window.desktop?.emailValidity?.removeLeadsAngel().then(() => {
        setLeadsAngelConfigured(false)
        setLeadsAngelExpiresOn(null)
        flash('Saved LeadsAngel license removed.')
      }).catch((error) => flash(error instanceof Error ? error.message : 'LeadsAngel license could not be removed.'))
    },
    dmLeadLimit: Math.min(deepLeadLimit, Math.max(1, dmSessionLeads.length)),
    dmLeadLimitMax: Math.max(1, dmSessionLeads.length),
    dmLeadAvailable: dmSessionLeads.length,
    dmSelectedLabel: dmSessionLeads.length
      ? `${Math.min(deepLeadLimit, dmSessionLeads.length)} of ${dmSessionLeads.length} imported websites selected`
      : 'No captured leads yet',
    onDmLeadLimitInput: (event: React.ChangeEvent<HTMLInputElement>) => {
      const parsed = Number.parseInt(event.currentTarget.value, 10)
      if (!Number.isFinite(parsed)) return
      setDeepLeadLimit(Math.max(1, Math.min(50, parsed)))
    },
    deepRun: () => {
      const bridge = typeof window === 'undefined' ? undefined : window.desktop?.deep
      if (!bridge?.run) {
        flash('The deep pass is only available in the desktop app.')
        return
      }
      if (!deepKey && !deepKeyFromEnvironment) {
        flash('Add a DataForSEO key in Settings → Account before running a deep pass.')
        return
      }
      const selectedLeadIds = dmSessionLeads.slice(0, Math.max(1, Math.min(deepLeadLimit, dmSessionLeads.length))).map((lead) => lead.id)
      if (!selectedLeadIds.length) {
        flash('Import websites into Decision Makers first, then choose how many to enrich.')
        return
      }
      void bridge
        .run(selectedLeadIds)
        .then((result) => {
          if (result.error) {
            if (!showDecisionPassPrompt(result.error)) flash(result.error)
            return
          }
          flash(`${result.queued} selected lead${result.queued === 1 ? '' : 's'} queued — owner search, then top-10 email search.`)
        })
        .catch(() => flash('The deep pass could not be queued.'))
    },
    runImport,
    ...dashboardValues,
    ...billingValues,
    // Phone Finder. Every lead gets a row, including the ones with no number, because the gaps
    // are what the page is for.
    phoneAreas: (phone.summary?.areas ?? []).map((area) => ({
      code: area.code,
      // An international number has no UK place name, so it is labelled by its own prefix.
      label: AREA_NAMES[area.code] ?? (area.code.startsWith('+') ? 'International' : area.code),
      count: String(area.count),
      width: `${Math.max(6, Math.round((area.count / Math.max(1, phone.summary?.areas[0]?.count ?? 1)) * 100))}%`,
    })),
    phoneCallablePct: phone.summary?.total ? Math.round((phone.summary.reachable / phone.summary.total) * 100) : 0,
    phoneCanBackfill: phone.summary?.canBackfill ?? 0,
    phoneDirect: phone.summary?.direct ?? 0,
    phoneDirectWidth: `${phone.summary?.direct || 1}`,
    phoneMissing: phone.summary?.missing ?? 0,
    phoneMissingWidth: `${phone.summary?.missing || 1}`,
    phoneMobile: phone.summary?.mobile ?? 0,
    phoneMobileWidth: `${phone.summary?.mobile || 1}`,
    phoneNoWebsite: phone.summary?.noWebsite ?? 0,
    phoneReachable: phone.summary?.reachable ?? 0,
    phoneReception: phone.summary?.reception ?? 0,
    phoneReceptionWidth: `${phone.summary?.reception || 1}`,
    phoneRows: phone.rows.map((row) => ({
      index: row.index,
      name: row.name,
      phone: row.hasNumber ? row.phone : 'No number found',
      areaCode: row.areaCode,
      address: row.address || 'Address pending',
      isReception: row.lineType === 'reception',
      isDirect: row.lineType === 'direct',
      isMobile: row.lineType === 'mobile',
      isMissing: row.lineType === 'missing',
    })),
    phoneShowing: phone.rows.length,
    phoneTotal: phone.summary?.total ?? phone.rows.length,
    // The Backfill card's line, in the card's own words: how many of the leads with no number can
    // still be filled from a website this app has not read yet.
    phoneBackfillNote: (() => {
      const missing = phone.summary?.missing ?? 0
      const canFill = phone.summary?.canBackfill ?? 0
      if (!missing) return 'Every lead on file has a number or a site that cannot be read for one.'
      return `${canFill} of the ${missing} missing leads have a website to scrape.`
    })(),
    // Decision Makers. The cards are the people actually found, and the funnel counts how many
    // leads reached each step of the match.
    dmMatched: dmPeople.funnel?.matched ?? 0,
    dmNamed: dmPeople.rows.length,
    dmMissing: dmPeople.funnel?.missing ?? 0,
    dmCoveragePct: dmPeople.funnel?.total ? Math.round(((dmPeople.funnel.matched ?? 0) / dmPeople.funnel.total) * 100) : 0,
    // A person can only be named once their company page was read, so the leads with a LinkedIn
    // profile are the population the match works from.
    dmPeopleListed: dmPeople.funnel?.withLinkedin ?? 0,
    dmRows: dmVisiblePeople.slice(0, dmContactLimit).map((person) => ({
      id: person.id, leadId: person.lead_id, email: person.email, phone: person.phone, source: person.source,
      address: person.lead_address,
      businessEmails: (person.business_emails || '').split('\n').filter(value=>value && value!==person.email),
      businessPhones: [...new Set([person.lead_phone, ...(person.business_phones || '').split('\n')].filter(value=>value && value!==person.phone))],
      socialLinks: [...new Set([person.linkedin_url, ...(person.published_socials || '').split('\n')].filter(value=>/^https?:\/\//i.test(value)))],
      ini: initialsOf(person.full_name),
      name: person.full_name,
      title: person.title || 'Role not stated',
      lead: person.lead_name,
      domain: person.lead_website ? hostOf(person.lead_website) : 'No website found',
      // A title that names a role reads as a strong match; anything else is a likely one. The card
      // shows one badge or the other, so both are offered and the template picks.
      isStrong: /director|owner|founder|principal|partner|manager|head of/i.test(person.title) ? '1' : '',
      isLikely: /director|owner|founder|principal|partner|manager|head of/i.test(person.title) ? '' : '1',
      strong: 'Strong',
      likely: 'Likely',
      hasLinkedin: person.linkedin_url ? '1' : '',
      linkedinUrl: person.linkedin_url,
      /** True when the card offers a LinkedIn profile, which is what its button points at. */
      showProfile: person.linkedin_url ? '1' : '',
    })),
    dmTotal: dmPeople.funnel?.total ?? 0,
    dmWithLinkedin: dmPeople.funnel?.withLinkedin ?? 0,
    dmWithWebsite: dmPeople.funnel?.withWebsite ?? 0,
    dmShowingLabel: dmSessionLeads.length ? `${Math.min(dmVisiblePeople.length, dmContactLimit)} of ${dmVisiblePeople.length} matching contacts from the current scan.` : 'Import websites to start a new scan. Earlier searches remain saved in All Leads.',
    dmShowing: dmVisiblePeople.length,
    dmShowAllLabel: `Show all ${dmVisiblePeople.length.toLocaleString('en-GB')}`,
    // Only offered while there are more named contacts than the grid is drawing.
    dmMoreContactsOn: dmVisiblePeople.length > dmContactLimit ? '1' : '',
    showAllDmContacts: () => setDmContactLimit((current) => current + 40),
    // The seniority mix: the roles the named contacts actually carry, most common first. A title
    // the design never listed is still a real title, so it is grouped rather than dropped.
    dmSeniority: (() => {
      const counts = new Map<string, number>()
      for (const person of dmPeople.rows) {
        const title = person.title.trim() || 'Role not stated'
        counts.set(title, (counts.get(title) ?? 0) + 1)
      }
      return Array.from(counts, ([role, count]) => ({ role, count: String(count) }))
        .sort((a, b) => Number(b.count) - Number(a.count))
        .slice(0, 6)
    })(),
    dmSeniorityNote: `Titles across the ${dmPeople.rows.length} match${dmPeople.rows.length === 1 ? '' : 'es'}.`,
    /**
     * The five stages a lead must clear, with what each one cost.
     *
     * The counts are the funnel's own, and the loss at each stage is the difference between it and
     * the stage above — which is why the last one reads as the leads still pending rather than as a
     * number chosen to make the row add up. The bars are each stage's share of the leads scraped.
     */
    dmStages: (() => {
      const total = dmPeople.funnel?.total ?? 0
      const withWebsite = dmPeople.funnel?.withWebsite ?? 0
      const read = dmSessionLeads.filter((lead) => lead.last_scanned_at).length
      const listed = dmPeople.funnel?.named ?? 0
      const matched = dmPeople.funnel?.matched ?? 0
      const share = (count: number) => `${total ? Math.round((count / total) * 100) : 0}%`
      return [
        { count: String(total), label: 'Websites imported', loss: '', width: share(total) },
        { count: String(withWebsite), label: 'Have a website', loss: `−${total - withWebsite} no website`, width: share(withWebsite) },
        { count: String(read), label: 'Websites read', loss: `${Math.max(0, withWebsite - read)} awaiting scan`, width: share(read) },
        { count: String(listed), label: 'Websites with named people', loss: `${Math.max(0, read - listed)} without a published name`, width: share(listed) },
        { count: String(matched), label: 'Named decision maker matched', loss: `−${Math.max(0, listed - matched)} still pending`, width: share(matched) },
      ]
    })(),
    /** The lead-level answer to "why not this one": what blocked each lead that has no contact. */
    dmBlockers: dmBlockerRows,
    dmBlockersShowing: dmBlockerRows.length,
    dmBlockerShowAllLabel: `Show all ${(dmPeople.funnel?.missing ?? 0).toLocaleString('en-GB')}`,
    // Only offered while there is more of the blocked list than the page is drawing.
    dmBlockerMoreOn: (dmPeople.funnel?.missing ?? 0) > dmBlockerRows.length ? '1' : '',
    showAllDmBlockers: () => setDmBlockerLimit((current) => current + 40),
    dmBlockerNote: `${(dmPeople.funnel?.missing ?? 0).toLocaleString('en-GB')} leads with no named contact, grouped by what blocked them.`,
    dmBlockerFilter: (event: React.ChangeEvent<HTMLSelectElement>) => setDmBlocker(event.currentTarget.value),
    // Suggested contacts. These are leads, not facts, so they sit apart from the confirmed people
    // and each one carries the evidence it came from.
    dmSuggestions: dmSuggestions.map((suggestion) => ({
      id: suggestion.id,
      ini: initialsOf(suggestion.full_name),
      name: suggestion.full_name,
      title: suggestion.title || `Suggested from ${suggestion.source === 'email' ? 'an email address' : suggestion.source === 'linkedin' ? 'a company page' : 'the site'}`,
      lead: suggestion.lead_name,
      evidence: suggestion.evidence,
      confirm: () => void confirmSuggestion(suggestion.id),
      dismiss: () => void dismissSuggestion(suggestion.id),
    })),
    // The suggestion cards the new design draws: a decision is offered on a pending card and its
    // outcome on a resolved one, which is what puts Confirm/Dismiss and Undo on different cards.
    dmSugRows: dmSuggestions.map((suggestion) => {
      const state = suggestion.status === 'dismissed' ? 'dismissed' : 'pending'
      return {
        state,
        initials: initialsOf(suggestion.full_name),
        name: suggestion.full_name,
        role: suggestion.title || 'Role not stated',
        lead: suggestion.lead_name,
        source:
          suggestion.evidence ||
          (suggestion.source === 'email'
            ? 'Read from a named address on the site'
            : suggestion.source === 'linkedin'
              ? 'Read from the company’s LinkedIn page'
              : 'Read from the site'),
        pending: state === 'pending' ? '1' : '',
        resolved: state === 'dismissed' ? '1' : '',
        outcome: state === 'dismissed' ? 'Dismissed' : 'Confirmed',
        confirm: () => void confirmSuggestion(suggestion.id),
        dismiss: () => void dismissSuggestion(suggestion.id),
        undo: () => void restoreSuggestion(suggestion.id),
      }
    }),
    // The badge counts what still needs a decision: a card that has been dealt with carries its
    // outcome and an Undo, so counting it as "awaiting review" would be a lie about the list.
    dmSugBadge: (() => {
      const waiting = dmSuggestions.filter((suggestion) => suggestion.status !== 'dismissed').length
      return `${waiting} awaiting review`
    })(),
    dmSugEmpty: dmSuggestions.length ? '0' : '1',
    // The three finder pages: one scan object each, built above from the page's own data.
    fEmail: { ...emailFinder, rows: emailTableRows, count: emailFinder.count, rowsCount: emailFinder.rowsCount },
    fPhone: phoneFinder,
    fDm: dmFinder,
    exportDmExcel: () => void runDecisionExport('xlsx'),
    exportDmPdf: () => void runDecisionExport('pdf'),
    dmExportDisabled: dmExportBusy || dmFinder.scanning || dmPeopleRows.length === 0,
    dmExportBusy,
    dmSuggestionEmpty: dmSuggestions.length === 0 ? '1' : '0',
    dmSuggestionHint: dmSuggestions.length
      ? ''
      : 'Nothing suggested yet. Look for suggestions reads the addresses and company pages already on file, then lists the names it can infer so you can confirm or dismiss each one.',
    dmSuggestionNote: dmSuggestions.length
      ? `${dmSuggestions.length} name${dmSuggestions.length === 1 ? '' : 's'} inferred from what is on file. Confirm one to move it into the named contacts above.`
      : 'Names inferred from addresses and company pages, kept apart from confirmed contacts until you check them.',
    buildSuggestions: () => void buildSuggestions(),
    // Website Lookup. The page reports what the last import did and previews the leads it made.
    startWebsiteLookup: () => void runImportText(pastedLines(impValue)),
    importAdded: String(imports.rows.length),
    importMore: imports.websiteBatches.length ? `${imports.websiteBatches.length} website import${imports.websiteBatches.length === 1 ? '' : 's'} on file` : 'Paste a list to begin',
    importRows: imports.rows,
    websiteRecentDomains: imports.rows.slice(0, 5).map((row) => row.domain),
    websitePreview: imports.preview,
    importStatus: enrichmentActivity.find(item=>item.kind==='website' && item.status==='running')?.message || (imports.websiteBatches.length ? `${imports.websiteBatches.length} website imports on file` : 'Nothing imported yet'),
    importSummary: imports.websiteBatches.length
      ? (() => {
          const latest = imports.websiteBatches[0] as { source_count?: number; added?: number; skipped?: number }
          return `${latest.source_count ?? 0} lines · ${latest.added ?? 0} added · ${latest.skipped ?? 0} duplicates skipped`
        })()
      : 'No imports yet',
    importTally: imports.rows.length
      ? `${imports.rows.filter((row) => /email/.test(row.contact)).length} with email · ${imports.rows.filter((row) => /phone/.test(row.contact)).length} with phone · ${imports.rows.filter((row) => /socials/.test(row.contact)).length} with socials · ${imports.rows.filter((row) => row.status === 'Pending').length} pending`
      : '0 with email · 0 with phone · 0 with socials · 0 pending',
    // The preview card's empty state: it says where the rows would come from, and it goes as soon
    // as there is something to show instead.
    importEmpty: imports.rows.length
      ? 'More sites can be pasted at any time — each one is added to this list.'
      : 'No websites imported yet. Paste a list above and the lookup fills these rows in one pass.',
    importEmptyOn: imports.rows.length ? '' : '1',
    runExport,
    // The run log, newest first. Each row keeps the reference's summary line and status pill. The
    // four tiles each carry a figure, a badge and sometimes a half — a duration is written as
    // minutes and seconds and the clean count as a fraction — so all of them are stated separately
    // rather than as one pre-joined string the page would have to take apart again.
    runCount: String(runStats.runs),
    runCountBadge: 'All time',
    runShowing: Math.min(filteredTimeline.length, runsLimit),
    runTimelineTotal: filteredTimeline.length,
    runEmpty: filteredTimeline.length ? '' : 'No activity matches this filter.',
    runFocused: focusedRunId ? '1' : '',
    clearRunFocus: () => setFocusedRunId(null),
    runsMoreOn: filteredTimeline.length > runsLimit ? '1' : '',
    showMoreRuns: () => setRunsLimit((current) => current + 25),
    runPlaces: runStats.places.toLocaleString('en-GB'),
    runPlacesBadge: `${runs.filter((run) => shortDate(run.started_at) === shortDate(new Date().toISOString())).length} today`,
    // The duration is drawn as its minutes with the seconds beside them, which is how the design
    // writes it, so the two halves are handed over separately.
    runMedian: formatDuration(runStats.medianMs).split(':')[0],
    runMedianHalf: `:${formatDuration(runStats.medianMs).split(':')[1] ?? '00'}`,
    runMedianBadge: 'Median',
    runCleanNum: String(runStats.clean),
    runCleanTotal: `/${runStats.runs}`,
    runCleanBadge: runStats.runs ? `${Math.round((runStats.clean / runStats.runs) * 100)}%` : '—',
    runClean:
      runStats.runs === 0
        ? '—'
        : `${runStats.clean}/${runStats.runs} · ${Math.round((runStats.clean / runStats.runs) * 100)}%`,
    runRows: filteredTimeline.slice(0, runsLimit).map((entry) => {
      if (entry.kind === 'import') {
        const batch = entry.batch
        const source = Number(batch.source_count ?? 0)
        const added = Number(batch.added ?? 0)
        const skipped = Number(batch.skipped ?? 0)
        const socialImport = batch.kind === 'social'
        return {
          when: `${shortDate(entry.at)} ${new Date(entry.at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`,
          keywords: socialImport ? 'Social profile import' : 'Website import',
          summary: `${source} supplied · ${added} added · ${skipped} skipped`,
          isDone: true, isFailed: false, isCancelled: false,
          done: 'Imported', failed: 'Failed', cancelled: 'Cancelled',
          bars: [{ height: `${Math.max(6, Math.round((added / Math.max(1, source)) * 100))}%` }],
          actionLabel: socialImport ? 'Open Social' : 'Open Lookup',
          open: () => go(socialImport ? 'social' : 'website'),
        }
      }
      const run = entry.run
      let keywords: string[] = []
      try {
        keywords = JSON.parse(run.keywords) as string[]
      } catch {
        keywords = []
      }
      const found = run.found ? `${run.found} place${run.found === 1 ? '' : 's'}` : 'no places'
      // The chart beside each row: one bar per keyword pass, drawn against the tallest run on the
      // page so the bars can be compared with one another rather than only within a row.
      const tallest = Math.max(1, ...runs.map((entry) => entry.found ?? 0))
      const perPass = keywords.length ? Math.round((run.found ?? 0) / keywords.length) : (run.found ?? 0)
      const bars = (keywords.length ? keywords : ['']).slice(0, 12).map((_, index) => ({
        height: `${Math.max(6, Math.round(((perPass || 1) / tallest) * 100 * (1 - index * 0.08)))}%`,
      }))
      return {
        when: `${shortDate(run.started_at)} ${new Date(run.started_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`,
        keywords: keywords.length ? keywords.join(', ') : 'No keywords recorded',
        summary: `${run.provider === 'chromium-maps' ? 'Google Maps' : run.provider} · ${run.location || 'no location'} · ${found} · ${formatDuration(run.duration_ms ?? 0)} · ${keywords.length} keyword pass${keywords.length === 1 ? '' : 'es'}${run.error ? ` · ${run.error}` : ''}`,
        isDone: run.status === 'done',
        isFailed: run.status === 'failed',
        isCancelled: run.status === 'cancelled' || run.status === 'running' || run.status === 'queued',
        done: 'Done',
        failed: 'Failed',
        cancelled: run.status === 'running' ? 'Running' : run.status === 'queued' ? 'Queued' : 'Cancelled',
        bars,
        actionLabel: 'Open Maps',
        open: () => go('maps'),
      }
    }),
    listTargets: [...lists.map((list) => ({
      label: list.name,
      count: String(list.members),
      on: listTarget === list.id ? '1' : '0',
      pick: () => setListTarget(list.id),
    })), { label: 'New list', count: '', on: lists.some((list) => list.id === listTarget) ? '0' : '1', pick: () => setListTarget('') }],
    newListVisible: !lists.some((list) => list.id === listTarget),
    newListName,
    onNewListName: (event: React.ChangeEvent<HTMLInputElement>) => setNewListName(event.currentTarget.value),
    liveDot: snapshot.running ? '1' : '0',
    mailNote: mailSent
      ? 'Sent — the transcript and your last run summary are on the way.'
      : 'We reply within a working day. Your run log is attached automatically.',
    mailOpen,
    mailToggleLabel: mailOpen ? 'Hide email option' : 'Rather email us instead?',
    maxResults,
    msgs,
    onChatKey: (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key !== 'Enter') return
      event.preventDefault()
      say(event.currentTarget.value)
      event.currentTarget.value = ''
    },
    onImpInput: (event: React.InputEvent<HTMLTextAreaElement>) => {
      const count = event.currentTarget.value
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean).length
      if (count !== impCount) setImpCount(count)
    },
    onKwBlur: (event: React.FocusEvent<HTMLInputElement>) => {
      if (event.currentTarget.value.trim()) {
        addKeyword(event.currentTarget.value)
        event.currentTarget.value = ''
      }
    },
    onKwKey: (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key !== 'Enter' && event.key !== ',') return
      event.preventDefault()
      addKeyword(event.currentTarget.value)
      event.currentTarget.value = ''
    },
    pasteWebsiteClipboard,
    uploadWebsiteCsv,
    openChat: () => { if (!featureAccessAllowed()) { showAccessPrompt(); return }; setChatOpen(true) },
    openExp: () => openExport('leads', view === 'maps' && (mapsWebsite !== 'any' || mapsQuery.trim()) ? 1 : 0),
    openExpAll: () => openExport('leads', 2),
    openExpInv: () => openExport('invoices', 2),
    openExpRuns: () => openExport('runs', 0),
    openExpView: () => openExport('leads', 1),
    // One modal serves every page that has an Import button, and what it imports follows the page
    // it was opened from: a paste of domains everywhere, a paste of profile URLs on Social
    // Profiles, where the label and the preview then say what each line will become.
    openImp: () => {
      setImpOpen(true)
      setImpCount(3)
      if (view === 'social') social.openImport()
    },
    p1: found >= 1 ? 'y' : 'n',
    p2: found >= 2 ? 'y' : 'n',
    p3: found >= 3 ? 'y' : 'n',
    p4: found >= 4 ? 'y' : 'n',
    p5: found >= 5 ? 'y' : 'n',
    p6: found >= 6 ? 'y' : 'n',
    p7: found >= 7 ? 'y' : 'n',
    p8: found >= 8 ? 'y' : 'n',
    picks: ledger.slice(0, 50).map((row, index) => ({
      ini: row.ini,
      name: row.name,
      domain: row.domain,
      area: row.area,
      rating: row.rating,
      score: String(row.score),
      band: row.score >= 90 ? 'hi' : row.score >= 75 ? 'mid' : 'low',
      hp: row.hasPhone ? '1' : '0',
      he: row.hasEmail ? '1' : '0',
      hs: row.hasSocial ? '1' : '0',
      note: row.note,
      on: keep[index] ? '1' : '0',
      toggle: () =>
        setKeep((current) => {
          const next = [...current]
          next[index] = !next[index]
          return next
        }),
    })),
    runBadge: snapshot.running ? 'RUNNING' : `${runStats.runs} RUNS`,
    runChips: [
      ['All activity', timeline.length],
      ['Maps', runs.length],
      ['Imports', imports.batches.length],
      ['Failed', runs.filter((run) => run.status === 'failed').length],
    ].map(([label, count], index) => ({
      label: String(label),
      count: String(count),
      on: runFilter === index ? '1' : '0',
      pick: () => { setRunFilter(index); setFocusedRunId(null); setRunsLimit(25) },
    })),
    runNote,
    runScrape: () => void runScrape(),
    billingJump,
    clearBillingJump,
    mapsPrompt,
    closeMapsPrompt: () => setMapsPrompt(null),
    confirmStop: () => { setMapsPrompt(null); stop() },
    runGoogle: () => void runScrape(true),
    runGuest: () => void runScrape(false),
    mapsGoogleConnected: Boolean(googleStatus?.signedIn),
    startTrial: () => { setMapsPrompt(null); go('settings'); setStab('plan'); setBillingJump({target:'trial'}) },
    getLifetimeKey: () => { setMapsPrompt(null); go('settings'); setStab('plan'); setBillingJump({target:'lifetime'}) },
    activateExistingKey: () => { setMapsPrompt(null); go('settings'); setStab('acct'); setBillingJump({target:'license'}) },
    runOverlayVisible: snapshot.running && !runMinimized,
    runReturnVisible: (snapshot.running && (runMinimized || view !== 'maps')) || (runMinimized && Boolean(snapshot.request)),
    minimizeRun: () => setRunMinimized(true),
    restoreRun: () => {
      go('maps'); setRunMinimized(false)
      if (!snapshot.running) {
        setMapsRunId('latest'); setMapsHistoryLeads(null)
        window.setTimeout(() => document.querySelector('[data-results]')?.scrollIntoView({behavior:'smooth',block:'start'}), 100)
      }
    },
    mapsWebsite,
    setMapsWebsite,
    mapsRunId,
    mapsRunOptions: runs.map(run=>({id:run.id,label:`${new Date(run.started_at).toLocaleString()} · ${run.location}`})),
    selectMapsRun: (id:string) => {if(id!==mapsRunId){setMapsRunId(id);setMapsHistoryLeads([])}setMapsSelected([])},
    mapsSelected,
    toggleMapsLead: (id:string) => setMapsSelected(ids=>ids.includes(id)?ids.filter(v=>v!==id):[...ids,id]),
    selectAllMaps: () => setMapsSelected(mapsSelected.length===mapsMatches.length ? [] : mapsMatches.map(lead=>lead.id)),
    sendMapsTo: (target:string) => {
      const websites=[...new Set(mapsMatches.filter(lead=>mapsSelected.includes(lead.id)).map(lead=>lead.website).filter(Boolean))]
      if(!websites.length){flash('Select businesses with a website to scan.');return}
      go(target);fillWebsiteImport(websites,'selected Maps leads')
    },
    importSavedRun: async (id:string) => {
      if(!id || !db)return
      const result=await db.leads.list({runId:id,limit:1600})
      const sites=[...new Set(result.rows.map(row=>row.website).filter(Boolean))]
      fillWebsiteImport(sites,'saved Maps run')
      if(!sites.length)flash('This run has no websites to scan.')
    },
    importCsvFile: async (file:File) => {
      try {fillWebsiteImport(websiteLinesFromCsv(await file.text()),'CSV')} catch {flash('The CSV file could not be read.')}
    },
    reportsOpen,
    openReports: () => { setMapsPrompt(null); setReportsOpen(true); void refreshReports() },
    closeReports: () => setReportsOpen(false),
    reportsLoading,
    reportsError,
    refreshReports: () => void refreshReports(),
    reportCounts: [
      {label:'Total saved leads',value:dashboard?.total ?? 0},
      {label:'Decision Makers found',value:dashboard?.decisionMakerPeople ?? 0},
      {label:'Maps searches',value:runStats.runs},
      {label:'Leads with a website',value:dashboard?.withWebsite ?? 0},
      {label:'Leads with email',value:dashboard?.withEmail ?? 0},
      {label:'Leads with phone',value:dashboard?.withPhone ?? 0},
      {label:'Leads with social profiles',value:dashboard?.withSocial ?? 0},
      {label:'Export-ready leads',value:dashboard?.exportReady ?? 0},
    ],
    // The button says which half of a run it is in: the app's browser connecting Google is not
    // scraping yet, and saying so is the difference between "working" and "waiting for you".
    runState: snapshot.running ? (runWaiting ? 'wait' : 'run') : 'idle',
    runWaiting,
    running: snapshot.running,
    saveLabel: kept === 0 ? 'Nothing bookmarked yet' : kept === 1 ? 'Save 1 lead' : `Save ${kept} leads`,
    saveToList,
    sendChat: () => {
      const field = document.querySelector<HTMLInputElement>('[data-chatinput]')
      if (field) {
        say(field.value)
        field.value = ''
      }
    },
    sendMail: () => setMailSent(true),
    set30: () => setRange('30 Days'),
    set7: () => setRange('7 Days'),
    setAll: () => setRange('All Time'),
    sideStatus: snapshot.running ? 'RUNNING' : 'LOCAL',
    appVersion: appVersion || 'v—',
    buildLabel: `BUILD ${appVersion || 'v—'}`,
    updateState: updateStatus.state,
    updateVersion: updateStatus.version ?? '',
    updateMessage: updateStatus.message,
    updatePercent: updateStatus.percent == null ? 0 : updateStatus.percent,
    updateActionLabel:
      updateStatus.state === 'ready'
        ? 'Restart to install'
        : updateStatus.state === 'available'
          ? 'Download update'
        : updateStatus.state === 'downloading'
          ? `Downloading ${updateStatus.percent ?? 0}%`
          : updateStatus.state === 'checking'
            ? 'Checking…'
            : 'Check for updates',
    updateActionDisabled: updateStatus.state === 'checking' || updateStatus.state === 'downloading' ? '1' : '0',
    checkForUpdates,
    downloadUpdate,
    installUpdate,
    runUpdateAction: () => {
      if (updateStatus.state === 'ready') return void installUpdate()
      if (updateStatus.state === 'available') return void downloadUpdate()
      return void checkForUpdates()
    },
    socialDonuts: social.donuts,
    socialExtras: social.extras,
    socialRows: social.rows,
    // The page reads every lead it can and the search and the filter narrow that, so the count is
    // the page's own: what the table shows, and how many leads it was drawn from.
    // The header follows the table: while a scan holds the page to its own URLs, the line above it
    // counts those rather than every lead the search happens to match.
    socialShowing: scan.phase === 'idle' ? social.showing : Math.min(scan.urls.length, scan.leadIds.length || scan.urls.length),
    socialTotal: social.total,
    // The reach card states the share of the whole workspace that carries a profile.
    socialReachPct: dashboard?.total ? Math.round((dashboard.withSocial / dashboard.total) * 100) : 0,
    // The AI Insights line: the design writes a fixed sentence about Instagram and Facebook
    // overlapping on eighteen leads, which is a statement about a workspace it never saw. This one
    // is built from the platform totals the page is drawing above it.
    socialInsight: (() => {
      const ranked = social.donuts
        .map((donut) => ({ label: donut.label, count: Number(donut.count) }))
        .filter((donut) => donut.count > 0)
        .sort((a, b) => b.count - a.count)
      if (!ranked.length) {
        return 'No social profiles on file yet — read a site and every profile it links to is listed here.'
      }
      const [first, second] = ranked
      const noun = (count: number) => `${count} lead${count === 1 ? '' : 's'}`
      if (!second) return `${first.label} is the only platform on file, on ${noun(first.count)}.`
      return `${first.label} leads with ${noun(first.count)}, ahead of ${second.label} on ${noun(second.count)}. A profile is a way in, not a decision maker — the people are on the Decision Makers page.`
    })(),
    socialState: social.state,
    refreshEmail: email.refresh,
    refreshSocial: social.refresh,
    // The search box and the platform filter, and the modal that takes a pasted list of profiles.
    // The box is controlled: a term picked from the recent list has to appear in it, and an
    // uncontrolled box would keep showing what was typed while the table showed something else.
    socialSearch: social.search,
    onSocialSearch: (event: React.InputEvent<HTMLInputElement>) => social.setSearch(event.currentTarget.value),
    onSocialFilter: (event: React.ChangeEvent<HTMLSelectElement>) => {
      const value = event.currentTarget.value
      social.setFilter(
        value === 'with' || value === 'pending' || value === 'nowebsite' ? value : 'all',
      )
    },
    // Searches made before, offered back under the box. Picking one is a call of its own, which is
    // why each term carries a callback rather than the row being one action with a term argument.
    socialHistoryOn: social.history.length ? '1' : '0',
    socialHistoryOff: social.history.length ? '0' : '1',
    socialHistory: social.history.map((entry) => {
      socialPicks[entry.term] = () => social.pickSearch(entry.term)
      const { run: _named, ...chip } = {
        // The term is the chip's text, and the key the click is looked up by.
        term: entry.term,
        label: `“${entry.term}”`,
        count: entry.results === null ? '' : `${entry.results} lead${entry.results === 1 ? '' : 's'}`,
        hasCount: entry.results === null ? '0' : '1',
        run: `socialPicks[${JSON.stringify(entry.term)}]`,
      }
      return { ...chip, run: socialPicks[entry.term] }
    }),
    socialPicks,
    // The history panel: the count on its button, which tab it is on, and the rows it lists.
    shCount: social.logCount,
    shOpen: social.logOpen,
    // The drawer and its scrim are hidden by this as well as by the condition in the markup. React
    // has been seen to leave the node in the document after the state went false, and `display`
    // cannot: whichever way the tree behaves, a closed drawer is not on the screen.
    shDisplay: social.logOpen ? 'flex' : 'none',
    shTitle: 'Social history',
    shSub: 'Every search, import and refresh on Social Profiles, newest first.',
    shTab: social.logTab,
    shAll: () => social.setLogTab('All'),
    shSearch: () => social.setLogTab('Searches'),
    shImport: () => social.setLogTab('Imports'),
    shFoot: social.logFoot,
    openShist: social.openLog,
    closeShist: social.closeLog,
    clearShist: social.clearLog,
    // Each row carries its own two callbacks, which is what the template calls: a row is data, so
    // there is nothing fixed to bind its click to.
    shRows: social.logRows.map((row, index) => {
      return {
        kind: row.kind,
        icon: row.icon,
        title: row.title,
        meta: row.meta,
        items: row.items,
        hasItems: row.items.length ? '1' : '0',
        canRun: row.canRun ? '1' : '0',
        isOpen: row.isOpen,
        open: row.open,
        toggle: () => social.toggleLogRow(index),
        run: () => social.runLogRow(index),
      }
    }),
    // The modal's live preview: what each pasted line will become, decided by the import's own
    // matcher, so the row that says "attaches to …" is the row that will.
    importPreview: social.importPreview.map((row) => ({
      kind: row.kind,
      tag: row.tag,
      handle: row.handle,
      detail: row.detail,
      result: row.result,
    })),
    importBadge: social.importBadge,
    importLabel: social.importLabel,
    importHint: social.importHint,
    // The coverage card's own two states: the spinner while the import is filing, and the bar that
    // reports what landed. The updated design has no separate overlay, so these are what is left.
    covScanning: scan.phase === 'scanning',
    covResult: scan.phase === 'done' || scan.phase === 'covered',
    covBadge: `Filing ${scan.urls.length} profile${scan.urls.length === 1 ? '' : 's'} — coverage fills in with what lands`,
    covResultLabel:
      scan.phase === 'scanning'
        ? `Reading the ${scan.urls.length} URL${scan.urls.length === 1 ? '' : 's'} just imported`
        : `Showing ${scan.leadIds.length || scan.urls.length} of ${social.total} leads — the ${scan.urls.length} URL${scan.urls.length === 1 ? '' : 's'} just imported`,
    cancelScan,
    exitScan,
    stEmail: snapshot.stEmail,
    stPhone: snapshot.stPhone,
    stSocial: snapshot.stSocial,
    stopRun,
    stubTitle: LABELS[view] ?? '',
    swPhone: swPhone ? '1' : '0',
    swWarn: swWarn ? '1' : '0',
    swWebsite: swWebsite ? '1' : '0',
    sweepOn: snapshot.running ? 'y' : 'n',
    tabAcct: stab === 'acct',
    tabInv: stab === 'inv',
    tabPay: stab === 'pay',
    tabPlan: stab === 'plan',
    tabTeam: stab === 'team',
    themeLabel: dark ? 'Switch to light' : 'Switch to dark',
    themeOn: dark ? '1' : '0',
    toast,
    notifications,
    notificationsOpen,
    notify,
    // The generated template treats the string "0" as hidden; keep this binding string-shaped so
    // the badge and Mark all read action disappear immediately when the last item is read.
      unreadNotifications: String(notifications.filter((item) => item.unread).length),
      notificationsEmpty: notifications.length === 0,
      notificationsCountLabel: `${notifications.length} saved · ${notifications.filter((item) => item.unread).length} unread`,
      notificationRows: notifications.map((item) => ({
      ...item,
      unread: item.unread ? '1' : '0',
      when: notificationTime(item.at),
        color: item.level === 'error' ? '#C46D65' : item.level === 'success' ? '#6F8060' : '#A9BC9B',
        open: () => {markNotificationRead(item.id);setNotificationsOpen(false);if(item.runId){if(item.runId!==mapsRunId){setMapsRunId(item.runId);setMapsHistoryLeads([])}setMapsSelected([])}go(/maps|scrape/i.test(item.title)?'maps':/email/i.test(item.title)?'email':/phone/i.test(item.title)?'phone':/decision|people/i.test(item.title)?'dm':/social/i.test(item.title)?'social':'runs')},
        read: () => markNotificationRead(item.id),
        remove: () => deleteNotification(item.id),
      })),
      openNotifications: () => setNotificationsOpen((current) => !current),
      closeNotifications: () => setNotificationsOpen(false),
      markNotificationsRead,
      markNotificationRead,
      deleteNotification,
    togEmails: () => setChEmails((current) => !current),
    togLinkedin: () => setChLinkedin((current) => !current),
    togPhones: () => setChPhones((current) => !current),
    togSocial: () => setChSocial((current) => !current),
    togWarn: () =>
      setSwWarn((current) => {
        const next = !current
        try {
          window.localStorage.setItem(NOTIFICATIONS_ENABLED_KEY, next ? '1' : '0')
        } catch {
          // The visual toggle still works when a browser has disabled local storage.
        }
        return next
      }),
    toggleMail: () => setMailOpen((current) => !current),
    togglePhone: () => setSwPhone((current) => !current),
    toggleTheme,
    toggleWebsite: () => setSwWebsite((current) => !current),
  }
}

export type AppValues = ReturnType<typeof useAppValues>
