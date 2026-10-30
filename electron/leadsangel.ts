import { randomUUID } from 'node:crypto'
import { readFileSync, statSync } from 'node:fs'
import { strFromU8, unzipSync } from 'fflate'
import { EmailVerificationError, type EmailValidityResult } from './email-verifier'

const API = 'https://license.leadsangel.com/api/smtp/jobs'

export type LeadsAngelCredentials = {
  licenseKey: string
  deviceId: string
  expiresOn: string | null
}

type JsonRecord = Record<string, unknown>

function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {}
}

function string(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

/** Reads data from the supplied ZIP; the shell script is never executed. */
export function readLeadsAngelBundle(path: string): LeadsAngelCredentials {
  if (statSync(path).size > 1_000_000) throw new Error('The LeadsAngel ZIP is unexpectedly large.')
  const files = unzipSync(readFileSync(path), {
    filter: (entry) => ['verify.sh', 'README.txt'].includes(entry.name) && entry.originalSize <= 20_000,
  })
  if (!files['verify.sh'] || !files['README.txt']) throw new Error('The ZIP must contain verify.sh and README.txt.')
  const script = strFromU8(files['verify.sh'])
  const readme = strFromU8(files['README.txt'])
  const licenseKey = /"license_key"\s*:\s*"([^"]+)"/.exec(script)?.[1] ?? ''
  const deviceId = /"device_id"\s*:\s*"([^"]+)"/.exec(script)?.[1] ?? ''
  const expiresOn = /Expires:\s*(\d{4}-\d{2}-\d{2})/i.exec(readme)?.[1] ?? null
  if (!/^[A-Z0-9-]{8,80}$/i.test(licenseKey) || !/^[A-Z0-9-]{8,120}$/i.test(deviceId)) {
    throw new Error('The LeadsAngel ZIP does not contain a usable license and device ID.')
  }
  return { licenseKey, deviceId, expiresOn }
}

/** Only a clear SMTP safe verdict becomes Valid; ambiguous responses stay Unknown. */
export function parseLeadsAngelResult(email: string, value: unknown): EmailValidityResult {
  const data = record(value)
  const status = string(data.status).toLowerCase()
  const reason = string(data.reason).toLowerCase()
  const rawScore = Number(data.score)
  const score = data.score === null || data.score === undefined || !Number.isFinite(rawScore)
    ? null : Math.max(0, Math.min(100, Math.round(rawScore)))
  let verdict: EmailValidityResult['status'] = 'unknown'
  if (status === 'safe' || status === 'valid' || status === 'deliverable') verdict = 'valid'
  else if (status === 'risky' || status === 'catch_all' || status === 'accept_all') verdict = 'risky'
  // Preserve this explicit provider verdict; an inconclusive SMTP 550 stays Unknown.
  else if (status === 'invalid' && reason === 'rcpt_rejected_550') verdict = 'invalid'
  else if ((status === 'unsafe' || status === 'invalid' || status === 'undeliverable')
    && (reason === 'syntax' || /invalid_syntax|no_mx|recipient_rejected|mailbox_not_found|does_not_exist|domain_not_found/.test(reason))) verdict = 'invalid'
  return {
    email: email.trim().toLowerCase(),
    status: verdict,
    verified: verdict === 'valid',
    score,
    message: `LeadsAngel SMTP: ${reason ? reason.replace(/_/g, ' ') : status || 'inconclusive'}`,
    provider: 'leadsangel',
  }
}

async function post(path: string, credentials: LeadsAngelCredentials, extra: JsonRecord, signal: AbortSignal): Promise<JsonRecord> {
  let response: Response
  try {
    response = await fetch(`${API}/${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        license_key: credentials.licenseKey,
        device_id: credentials.deviceId,
        app_version: '1.0.0',
        ...extra,
      }),
      signal: AbortSignal.any([signal, AbortSignal.timeout(25_000)]),
    })
  } catch (error) {
    if (signal.aborted) throw signal.reason ?? new DOMException('Cancelled', 'AbortError')
    throw new EmailVerificationError(
      error instanceof Error && error.name === 'TimeoutError' ? 'LeadsAngel request timed out.' : 'LeadsAngel could not be reached.',
      true,
    )
  }
  let payload: JsonRecord
  try {
    payload = record(await response.json())
  } catch {
    throw new EmailVerificationError(`LeadsAngel returned an unreadable response (${response.status}).`, response.status >= 500)
  }
  if (!response.ok || payload.ok === false) {
    const note = string(payload.reason) || string(payload.error) || `LeadsAngel rejected the request (${response.status}).`
    throw new EmailVerificationError(note.slice(0, 240), response.status === 408 || response.status === 429 || response.status >= 500)
  }
  return payload
}

async function pause(signal: AbortSignal, milliseconds: number): Promise<void> {
  if (signal.aborted) throw signal.reason ?? new DOMException('Cancelled', 'AbortError')
  await new Promise<void>((resolve, reject) => {
    const cancel = () => { clearTimeout(timer); reject(signal.reason ?? new DOMException('Cancelled', 'AbortError')) }
    const timer = setTimeout(() => { signal.removeEventListener('abort', cancel); resolve() }, milliseconds)
    signal.addEventListener('abort', cancel, { once: true })
  })
}

/** Submits a small asynchronous job and polls its status until results are ready. */
export async function verifyEmailAddressesWithLeadsAngel(
  credentials: LeadsAngelCredentials,
  addresses: string[],
  signal: AbortSignal,
  onProgress?: (message: string) => void,
  onResults?: (results:EmailValidityResult[]) => void,
): Promise<EmailValidityResult[]> {
  const unique = Array.from(new Set(addresses.map((address) => address.trim().toLowerCase()).filter(Boolean)))
  if (!unique.length) return []
  const submitted = await post('verify', credentials, {
    client_ref: `nafran-${randomUUID()}`,
    items: unique.map((email, index) => ({ email, ref: String(index) })),
  }, signal)
  const jobId = string(submitted.id)
  if (!/^[a-z0-9-]{8,100}$/i.test(jobId)) throw new EmailVerificationError('LeadsAngel did not return a job ID.', true)
  const deadline = Date.now() + 120_000
  let state = submitted
  const requested=new Set(unique),results=new Map<string,EmailValidityResult>()
  const readResults=async()=>{
    const payload=await post('results',credentials,{job_id:jobId},signal)
    const fresh:EmailValidityResult[]=[]
    for(const item of Array.isArray(payload.items)?payload.items:[]){
      const row=record(item),email=string(row.email).toLowerCase()
      if(!requested.has(email)||results.has(email)||string(row.status).toLowerCase()!=='done')continue
      const result=parseLeadsAngelResult(email,row.result);results.set(email,result);fresh.push(result)
    }
    if(fresh.length)onResults?.(fresh)
  }
  let fetched=0,first=true
  while (!signal.aborted && Date.now() < deadline) {
    const status = string(state.status).toLowerCase()
    if (status === 'completed' || status === 'failed' || status === 'cancelled') break
    onProgress?.(`LeadsAngel job: ${string(state.status) || 'running'} · ${Number(state.succeeded ?? 0)} of ${unique.length} checked…`)
    const succeeded=Number(state.succeeded??0)
    if(onResults&&succeeded>fetched){await readResults();fetched=succeeded}
    if(!first)await pause(signal,1200)
    first=false
    state = await post('status', credentials, { job_id: jobId }, signal)
  }
  if (signal.aborted) throw signal.reason ?? new DOMException('Cancelled', 'AbortError')
  if (Date.now() >= deadline) {
    if(results.size)return [...results.values()]
    throw new EmailVerificationError('LeadsAngel job is still processing. Try again later.', true)
  }
  await readResults()
  if (!results.size && string(state.status).toLowerCase() === 'failed') {
    throw new EmailVerificationError(string(state.error) || 'LeadsAngel could not complete this job.', true)
  }
  return [...results.values()]
}
