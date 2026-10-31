import type { LocalDatabase } from '../db/local-db'
import type { WebsiteFindings } from './website'
import {compareEmailContacts} from '../email-ranking'

export interface WebsiteLookupFields { email: boolean; phone: boolean; social: boolean; address: boolean }
export interface WebsiteLookupRow {
  leadId: string
  businessName: string
  website: string
  status: 'queued' | 'running' | 'done' | 'failed'
  emails: { value: string; source: string }[]
  phones: { value: string; source: string }[]
  socials: { platform: string; url: string }[]
  address: string
  sources: string[]
  error: string
}
export interface WebsiteLookupSession {
  jobId: string
  status: 'queued' | 'running' | 'done' | 'failed'
  startedAt: string
  fields: WebsiteLookupFields
  added: number
  reused: number
  invalidCount?: number
  discardedSamples?: string[]
  mergedCount?: number
  failedImports?: number
  discarded: number
  message: string
  rows: WebsiteLookupRow[]
}
export const DEFAULT_LOOKUP_FIELDS: WebsiteLookupFields = { email: true, phone: true, social: true, address: true }

export function lookupFields(value: unknown): WebsiteLookupFields {
  const input = value as Partial<WebsiteLookupFields> | undefined
  const fields = input ? { email: input.email === true, phone: input.phone === true, social: input.social === true, address: input.address === true } : { ...DEFAULT_LOOKUP_FIELDS }
  if (!Object.values(fields).some(Boolean)) throw new Error('Select at least one detail to find.')
  return fields
}

export function lookupOptions(raw?: string): { invalidCount?: number; discardedSamples?: string[]; mergedCount?: number; source?: string; fields?: WebsiteLookupFields; added?: number; reused?: number; discarded?: number; batchId?: string; addedLeadIds?: string[]; failedImportRows?: {position:number;row:WebsiteLookupRow}[] } {
  try { return JSON.parse(raw || '{}') } catch { return {} }
}

export function emptyLookupRow(lead: { id: string; name: string; website: string }): WebsiteLookupRow {
  return { leadId: lead.id, businessName: lead.name, website: lead.website, status: 'queued', emails: [], phones: [], socials: [], address: '', sources: [], error: '' }
}

/** A session keeps its own snapshot, so another saved business never appears in its results/export. */
export function readWebsiteLookup(db: LocalDatabase, workspaceId: string, jobId?: string): WebsiteLookupSession | null {
  const job = db.one<{ id: string; status: WebsiteLookupSession['status']; options: string; created_at: string; error: string | null }>(
    `select id, status, options, created_at, error from enrichment_jobs
     where workspace_id = ? and kind = 'website' and json_extract(options, '$.source') = 'website-lookup'
     ${jobId ? 'and id = ?' : ''} order by created_at desc, rowid desc limit 1`, jobId ? [workspaceId, jobId] : [workspaceId],
  )
  if (!job) return null
  const options = lookupOptions(job.options)
  const savedRows = db.query<{ position:number; data: string; status: WebsiteLookupRow['status']; error: string }>(
    'select position, data, status, error from website_lookup_rows where job_id = ? order by position', [job.id],
  ).map(saved => {
    const data=JSON.parse(saved.data) as WebsiteLookupRow
    return {position:saved.position,row:{...data,emails:[...data.emails].sort((a,b)=>compareEmailContacts(a,b)).slice(0,1),status:saved.status,error:saved.error}}
  })
  const rows = [...savedRows,...(options.failedImportRows ?? [])].sort((a,b)=>a.position-b.position).map(saved=>saved.row)
  if (job.status === 'failed') for (const row of rows) {
    if (row.status === 'queued' || row.status === 'running') { row.status = 'failed'; row.error = job.error || 'The scan stopped before this website was completed.' }
  }
  return { jobId: job.id, status: job.status, startedAt: job.created_at, fields: lookupFields(options.fields), added: options.added ?? 0, reused: options.reused ?? 0, invalidCount:options.invalidCount ?? 0, discardedSamples:options.discardedSamples ?? [], mergedCount:options.mergedCount ?? 0, failedImports:options.discarded ?? options.failedImportRows?.length ?? 0, discarded: (options.invalidCount ?? 0)+(options.discarded ?? options.failedImportRows?.length ?? 0), message: job.error ?? '', rows }
}

/** Only selected public business fields are included. Owner records/credits are never involved. */
export function lookupRowFromFindings(lead: { id: string; name: string; website: string }, findings: WebsiteFindings, fields: WebsiteLookupFields): WebsiteLookupRow {
  return {
    ...emptyLookupRow(lead), businessName: findings.businessName || lead.name,
    status: findings.error ? 'failed' : 'done', error: findings.error ?? '',
    emails: fields.email ? [...findings.emails].sort((a,b)=>compareEmailContacts({...a,source:a.page},{...b,source:b.page})).slice(0,1).map(item => ({ value: item.value, source: item.page })) : [],
    phones: fields.phone ? findings.phones.map(item => ({ value: item.value, source: item.page })) : [],
    socials: fields.social ? Array.from(new Map(findings.socials.map(item => [item.profileUrl, { platform: item.platform, url: item.profileUrl }])).values()) : [],
    address: fields.address ? [...new Set(findings.addresses ?? [])].join(' | ') : '',
    sources: [...new Set(findings.pagesRead)],
  }
}
