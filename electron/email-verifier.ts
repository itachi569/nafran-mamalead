const SINGLE_VERIFY_URL = 'https://api.mailverifier-io.com/SingleMailVerify/'
const APIFY_API_URL = 'https://api.apify.com/v2/actors'
export const DEFAULT_APIFY_EMAIL_ACTOR = 'apivault_labs/email-deliverability-checker'

export type EmailValidityStatus = 'valid' | 'invalid' | 'risky' | 'unknown'
export type EmailValidityProvider = 'apify' | 'leadsangel' | 'mailverifier'

export type EmailValidityResult = {
  email: string
  status: EmailValidityStatus
  verified: boolean
  score: number | null
  message: string
  provider: EmailValidityProvider
}

export type EmailVerificationBatchProgress = {
  total: number
  checked: number
  failed: number
  pending: number
  retries: number
  batchSize: number
}

export class EmailVerificationError extends Error {
  constructor(message: string, readonly retryable: boolean) {
    super(message)
    this.name = 'EmailVerificationError'
  }
}

type MailVerifierPayload = {
  status?: unknown
  message?: unknown
  response?: unknown
}

type UnknownRecord = Record<string, unknown>

function cleanMessage(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  if (value === null || value === undefined) return ''
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function asRecord(value: unknown): UnknownRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as UnknownRecord : {}
}

function validAddress(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

function invalidFormat(email: string, provider: EmailValidityProvider): EmailValidityResult {
  return {
    email,
    status: 'invalid',
    verified: false,
    score: 0,
    message: 'The address format is invalid.',
    provider,
  }
}

/**
 * Converts MailVerifier's human-readable response into the small set of states the Email Finder
 * can store and filter. Invalid is checked before valid because the word contains "valid".
 */
export function parseMailVerifierResponse(email: string, payload: MailVerifierPayload): EmailValidityResult {
  const response = cleanMessage(payload.response)
  const fallback = cleanMessage(payload.message)
  const message = response || fallback || 'MailVerifier did not return a verification result.'
  const normalized = message.toLowerCase()

  if (/\binvalid\b|not[ -]?valid|undeliverable|does not exist|bad mailbox|hard bounce/.test(normalized)) {
    return { email, status: 'invalid', verified: false, score: 0, message, provider: 'mailverifier' }
  }
  if (/\brisk(?:y)?\b|catch[ -]?all|accept[ -]?all|disposable|spam trap|role[ -]?based|greylist/.test(normalized)) {
    return { email, status: 'risky', verified: false, score: 35, message, provider: 'mailverifier' }
  }
  if (/\bvalid\b|ok to send|deliverable/.test(normalized)) {
    return { email, status: 'valid', verified: true, score: 95, message, provider: 'mailverifier' }
  }
  return { email, status: 'unknown', verified: false, score: null, message, provider: 'mailverifier' }
}

function numberScore(record: UnknownRecord): number | null {
  for (const key of ['deliverabilityScore', 'score', 'confidence']) {
    const value = Number(record[key])
    if (!Number.isFinite(value)) continue
    const percentage = key === 'confidence' && value >= 0 && value <= 1 ? value * 100 : value
    return Math.max(0, Math.min(100, Math.round(percentage)))
  }
  return null
}

/** Normalises the actor's rich result into the four states used by Email Finder. */
export function parseApifyEmailResult(email: string, value: unknown): EmailValidityResult {
  const record = asRecord(value)
  const nestedCsv = asRecord(record._csv)
  const source = Object.keys(record).length ? { ...nestedCsv, ...record } : nestedCsv
  const status = cleanMessage(source.status).toLowerCase().replace(/[ _-]+/g, '_')
  const mailboxStatus = cleanMessage(source.mailboxStatus).toLowerCase().replace(/[ _-]+/g, '_')
  const reasons = Array.isArray(source.reasons)
    ? source.reasons.map(cleanMessage).filter(Boolean)
    : []
  const message = reasons.join('; ') || cleanMessage(source.reason) || cleanMessage(source.message)
    || (mailboxStatus ? `Mailbox status: ${mailboxStatus.replace(/_/g, ' ')}` : '')
    || (status ? `Email status: ${status.replace(/_/g, ' ')}` : 'Apify did not return a verification result.')
  const score = numberScore(source)

  let result: EmailValidityStatus = 'unknown'
  if (['valid', 'deliverable', 'accepted', 'found'].includes(status)) result = 'valid'
  else if (['invalid', 'undeliverable', 'rejected', 'not_found', 'no_mx'].includes(status)) result = 'invalid'
  else if (['risky', 'catch_all', 'catch_all_guess', 'disposable', 'role_based'].includes(status)) result = 'risky'
  else if (mailboxStatus === 'accepted' || source.mailboxExists === true) result = 'valid'
  else if (['rejected', 'no_mx'].includes(mailboxStatus) || source.mailboxExists === false || source.syntaxValid === false || source.hasMx === false) result = 'invalid'
  else if (['catch_all', 'disposable'].includes(mailboxStatus) || source.disposable === true) result = 'risky'

  return {
    email,
    status: result,
    verified: result === 'valid',
    score: score ?? (result === 'valid' ? 95 : result === 'invalid' ? 0 : result === 'risky' ? 35 : null),
    message,
    provider: 'apify',
  }
}

function actorEndpoint(actorId: string): string {
  const normalized = actorId.trim().replace(/^\/+|\/+$/g, '').replace('/', '~')
  if (!normalized || !/^[a-z0-9_.-]+~[a-z0-9_.-]+$/i.test(normalized)) {
    throw new EmailVerificationError('The configured Apify email verifier Actor ID is invalid.', false)
  }
  return `${APIFY_API_URL}/${normalized}/run-sync-get-dataset-items?timeout=90`
}

/**
 * Verifies a batch in one Apify Actor run. The token remains in Electron's main process and is
 * sent in the Authorization header, so it never appears in a URL, renderer request, or log.
 */
export async function verifyEmailAddressesWithApify(
  apiToken: string,
  emails: string[],
  actorId = DEFAULT_APIFY_EMAIL_ACTOR,
  signal?: AbortSignal,
): Promise<EmailValidityResult[]> {
  const token = apiToken.trim()
  if (!token) throw new Error('Apify is not configured on this machine.')

  const unique = Array.from(new Set(emails.map((email) => email.trim().toLowerCase()).filter(Boolean)))
  const invalid = unique.filter((email) => !validAddress(email)).map((email) => invalidFormat(email, 'apify'))
  const pending = unique.filter(validAddress)
  if (!pending.length) return invalid
  const endpoint = actorEndpoint(actorId)

  let response: Response
  let text: string
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        emails: pending,
        people: [],
        records: [],
        checkMx: true,
        verifyMailbox: true,
        resolveCatchAll: true,
        deepCheck: false,
        greylistRetries: 0,
        mailboxConcurrency: 0,
        cacheDays: 30,
        deduplicate: true,
        onlyValid: false,
        onlyDeliverable: false,
        exportFormat: 'default',
      }),
      signal: AbortSignal.any([AbortSignal.timeout(100_000), ...(signal ? [signal] : [])]),
    })
    text = await response.text()
  } catch (error) {
    if (signal?.aborted) throw signal.reason ?? new DOMException('Cancelled', 'AbortError')
    const failure = error as Error
    if (failure.name === 'TimeoutError') throw new EmailVerificationError('Apify email verification timed out.', true)
    throw new EmailVerificationError('Apify email verification could not be reached.', true)
  }

  let payload: unknown
  try {
    payload = text ? JSON.parse(text) : []
  } catch {
    throw new EmailVerificationError(`Apify returned an unreadable response (${response.status}).`, response.status >= 500)
  }
  if (!response.ok) {
    const errorRecord = asRecord(asRecord(payload).error)
    const note = cleanMessage(errorRecord.message) || cleanMessage(asRecord(payload).message)
      || `Apify rejected the request (${response.status}).`
    const retryable = response.status === 408 || response.status === 429 || response.status >= 500
      || /timed[ -]?out|timeout/i.test(note)
    throw new EmailVerificationError(note.slice(0, 240), retryable)
  }
  const runStatus = cleanMessage(asRecord(payload).status).toUpperCase()
  if (runStatus === 'TIMED-OUT' || runStatus === 'TIMED_OUT') {
    throw new EmailVerificationError('Apify Actor run timed out.', true)
  }

  const records = Array.isArray(payload) ? payload : Array.isArray(asRecord(payload).items) ? asRecord(payload).items as unknown[] : []
  const byEmail = new Map<string, unknown>()
  for (const row of records) {
    const record = asRecord(row)
    const address = cleanMessage(record.email || record.normalizedEmail || record.inputEmail || record.foundEmail).toLowerCase()
    if (address && pending.includes(address)) byEmail.set(address, row)
  }

  const results = pending.flatMap((email) => {
    const row = byEmail.get(email)
    return row ? [parseApifyEmailResult(email, row)] : []
  })
  return [...invalid, ...results]
}

/** Retries transient actor failures, then halves a failed batch down to individual addresses. */
export async function runEmailVerificationBatches(
  emails: string[],
  verifyBatch: (batch: string[], signal: AbortSignal) => Promise<EmailValidityResult[]>,
  options: {
    signal: AbortSignal
    onResult: (result: EmailValidityResult) => void
    onProgress: (progress: EmailVerificationBatchProgress) => void
    batchSize?: number
    retryDelayMs?: number
  },
): Promise<{ failed: string[]; retries: number; cancelled: boolean }> {
  const unique = Array.from(new Set(emails.map((email) => email.trim().toLowerCase()).filter(Boolean)))
  const size = Math.max(1, Math.min(20, Math.floor(options.batchSize ?? 10)))
  const queue: { emails: string[]; attempts: number }[] = []
  for (let index = 0; index < unique.length; index += size) queue.push({ emails: unique.slice(index, index + size), attempts: 0 })
  const failed: string[] = []
  let checked = 0
  let retries = 0
  let currentSize = 0
  const requeue = (item: { emails: string[]; attempts: number }) => {
    if (item.attempts < 1) {
      queue.push({ emails: item.emails, attempts: item.attempts + 1 })
    } else if (item.emails.length > 1) {
      const middle = Math.ceil(item.emails.length / 2)
      queue.push({ emails: item.emails.slice(0, middle), attempts: 0 })
      queue.push({ emails: item.emails.slice(middle), attempts: 0 })
    } else {
      failed.push(item.emails[0])
    }
    retries += 1
  }
  const emit = () => options.onProgress({
    total: unique.length,
    checked,
    failed: failed.length,
    pending: queue.reduce((count, item) => count + item.emails.length, 0) + currentSize,
    retries,
    batchSize: currentSize,
  })
  emit()
  while (queue.length && !options.signal.aborted) {
    const item = queue.shift()!
    currentSize = item.emails.length
    emit()
    let results: EmailValidityResult[]
    try {
      results = await verifyBatch(item.emails, options.signal)
    } catch (error) {
      if (options.signal.aborted) break
      if (error instanceof EmailVerificationError && !error.retryable) throw error
      requeue(item)
      if (options.retryDelayMs !== 0 && queue.length && !options.signal.aborted) {
        await new Promise((resolve) => setTimeout(resolve, options.retryDelayMs ?? 400))
      }
      currentSize = 0
      emit()
      continue
    }
    if (options.signal.aborted) break
    const returned = new Set<string>()
    for (const result of results) {
      const address = result.email.trim().toLowerCase()
      if (!item.emails.includes(address) || returned.has(address)) continue
      options.onResult(result)
      returned.add(address)
      checked += 1
    }
    const missing = item.emails.filter((address) => !returned.has(address))
    if (missing.length) requeue({ emails: missing, attempts: item.attempts })
    currentSize = 0
    emit()
  }
  currentSize = 0
  emit()
  return { failed, retries, cancelled: options.signal.aborted }
}

/** Verifies one address with the legacy fallback provider. */
export async function verifyEmailAddress(apiKey: string, email: string): Promise<EmailValidityResult> {
  const key = apiKey.trim()
  const address = email.trim()
  if (!key) throw new Error('MailVerifier is not configured on this machine.')
  if (!validAddress(address)) return invalidFormat(address, 'mailverifier')

  const body = new FormData()
  body.set('emailid', address)
  let response: Response
  try {
    response = await fetch(SINGLE_VERIFY_URL, {
      method: 'POST',
      headers: { api_key: key, accept: 'application/json' },
      body,
      signal: AbortSignal.timeout(25_000),
    })
  } catch (error) {
    const failure = error as Error & { cause?: { code?: string } }
    if (failure.name === 'TimeoutError') throw new Error('MailVerifier timed out.')
    if (failure.cause?.code === 'CERT_HAS_EXPIRED') {
      throw new Error('MailVerifier is temporarily unavailable because its API security certificate has expired.')
    }
    if (failure.cause?.code === 'ERR_TLS_CERT_ALTNAME_INVALID' || failure.cause?.code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE') {
      throw new Error('MailVerifier is temporarily unavailable because its API security certificate is invalid.')
    }
    throw new Error('MailVerifier could not be reached.')
  }

  const text = await response.text()
  let payload: MailVerifierPayload
  try {
    payload = JSON.parse(text) as MailVerifierPayload
  } catch {
    throw new Error(`MailVerifier returned an unreadable response (${response.status}).`)
  }
  const providerStatus = Number(payload.status ?? response.status)
  if (!response.ok || (Number.isFinite(providerStatus) && providerStatus >= 400)) {
    const note = cleanMessage(payload.message) || `MailVerifier rejected the request (${response.status}).`
    throw new Error(note.slice(0, 240))
  }
  return parseMailVerifierResponse(address, payload)
}
