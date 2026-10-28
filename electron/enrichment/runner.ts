// Processes queued enrichment jobs.
//
// A job names a kind of contact and a set of leads. The runner takes them one at a time, reads
// each lead's own website, and writes what it finds into the local database, so the Email Finder
// and Social Profiles pages fill in without anybody pasting an address by hand.
//
// It is deliberately sequential and paced: this is other people's websites, and a desktop app
// hammering them in parallel would be both rude and more likely to be blocked.
import type { LocalDatabase } from '../db/local-db'
import { LicenseAccessError } from '../billing/client'
import { type Repository } from '../db/repository'
import { locationForLead, queryForOwner, queryForOwnerEmail, searchEmails, searchOwnerCandidates } from './dataforseo'
import type { ExtractedEmail } from './email-extractor'
import { WebsiteEnricher, isUsablePerson } from './website'
import { DEFAULT_LOOKUP_FIELDS, emptyLookupRow, lookupOptions, lookupRowFromFindings } from './website-lookup'
import { findBusinessOwners, findOwnerEmail, type OwnerEmailSource } from './owner-search'
import {ownerIdentityKey,isBusinessOwner,ownerEmail} from './owner-contact'
import {compareEmailContacts} from '../email-ranking'

export type JobKind = 'email' | 'phone' | 'social' | 'decision-maker' | 'website' | 'deep'

const JOB_KINDS: JobKind[] = ['email', 'phone', 'social', 'decision-maker', 'website', 'deep']

export interface EnrichmentProgress {
  jobId: string
  kind: JobKind
  status: 'running' | 'done' | 'failed' | 'cancelled' | 'idle'
  processed: number
  total: number
  found: number
  failed: number
  leadName: string
  message: string
  at: string
}

export interface EnrichmentOptions {
  onProgress?: (progress: EnrichmentProgress) => void
  authorize?: (kind: JobKind, fresh: boolean) => Promise<void>
  consumeDecisionLead?: (leadId: string) => Promise<void>
  /**
   * The DataForSEO credential, handed over by the window for as long as this worker lives.
   *
   * It is a function rather than a value because the key can be changed while the app is open, and
   * a deep pass should use the key the user has now rather than the one read at launch. Nothing here
   * writes it: the main process holds it in memory only, so there is no file of it to leak.
   */
  deepKey?: () => string
}

// Keep a small gap between sites so a multi-lead pass stays polite without adding a visible pause
// after every fast server-side lookup. A single finder read is bounded by the HTTP timeout above;
// this gap only applies between rows in the same batch.
const PACE_MS = 120

/**
 * Browser navigation has its own timeout and cannot always observe an AbortSignal immediately.
 * Race it with the queue signal so a foreground finder request can take over without waiting for
 * an older background page to finish loading.
 */
async function waitForAbort<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) throw new DOMException('Enrichment cancelled', 'AbortError')
  let onAbort: (() => void) | undefined
  const aborted = new Promise<never>((_, reject) => {
    onAbort = () => reject(new DOMException('Enrichment cancelled', 'AbortError'))
    signal.addEventListener('abort', onAbort, { once: true })
  })
  try {
    return await Promise.race([operation, aborted])
  } finally {
    if (onAbort) signal.removeEventListener('abort', onAbort)
  }
}

/** The host of a lead's website, bare, so it can be compared with an address or a result URL. */
function websiteHost(website: string): string {
  return website
    .trim()
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, '')
    .replace(/^www\./, '')
    .split(/[/?#]/)[0]
}

/**
 * Whether a search hit is about this business.
 *
 * A top-10 for one company also quotes other people. An address counts when the result names the
 * business, or when the address itself is on the business's domain. A result that does neither is
 * left out, the way an address for a different executive is left out of a search for one person.
 * A business whose name is too short to recognise is given the benefit of the doubt.
 */
function aboutThisLead(email: ExtractedEmail, lead: { name: string; website: string }): boolean {
  const haystack = `${email.context} ${email.source} ${email.url}`.toLowerCase()
  const host = websiteHost(lead.website)
  if (host && (email.value.endsWith(`@${host}`) || email.value.endsWith(`.${host}`) || haystack.includes(host))) return true
  const words = lead.name
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 3)
  if (!words.length) return true
  return words.some((word) => haystack.includes(word))
}

/** Keeps a named person tied to the company searched, rather than a similarly named result. */
function aboutThisOwner(owner: { source: string; url: string }, lead: { name: string; website: string }): boolean {
  const haystack = `${owner.source} ${owner.url}`.toLowerCase()
  const host = websiteHost(lead.website)
  if (host && haystack.includes(host)) return true
  const words = lead.name
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 3)
  // Some directory snippets omit the company name but still carry a valid person/title claim. The
  // search itself was company-scoped, so a lead with no useful words gets the benefit of the doubt.
  return !words.length || words.some((word) => haystack.includes(word))
}

export class EnrichmentRunner {
  private readonly enricher = new WebsiteEnricher()
  private controller: AbortController | null = null
  private looping = false
  private foregroundJobId = ''
  private activeProgress: EnrichmentProgress | null = null
  private stoppedJobId = ''

  constructor(
    private readonly db: LocalDatabase,
    private readonly repository: Repository,
    private readonly options: EnrichmentOptions = {},
  ) {}

  get busy(): boolean {
    return this.controller !== null
  }

  /** Leads waiting in the queue, so the UI can say how much work is outstanding. */
  pending(): number {
    return this.repository.jobTotals(this.db.ensureWorkspace().id).queued
  }

  /**
   * Processes jobs until the queue is empty. Safe to call when one is already running, and safe
   * to call after every scrape: an empty queue makes it a no-op.
   */
  async drain(): Promise<void> {
    if (this.looping) return
    this.looping = true
    const controller = new AbortController()
    this.controller = controller

    try {
      for (;;) {
        if (controller.signal.aborted) break
        const job = this.repository.nextQueuedJob(this.foregroundJobId)
        if (!job) break
        if (job.id === this.foregroundJobId) this.foregroundJobId = ''
        this.stoppedJobId = ''
        try {
          const kind = (JOB_KINDS.includes(job.kind as JobKind) ? job.kind : 'website') as JobKind
          let total = 0
          try { total = new Set(JSON.parse(job.lead_ids) as string[]).size } catch { /* runJob reports malformed input */ }
          this.emit({jobId:job.id,kind,status:'running',processed:0,total,found:0,failed:0,leadName:'',message:'Preparing website scan…'})
          await waitForAbort(Promise.resolve(this.options.authorize?.(kind, true)), controller.signal)
          await this.runJob(job, controller.signal)
        } catch (error) {
          if (error instanceof Error && error.name === 'AbortError') {
            // Stop/prioritize can interrupt a page read. Keep that job durable instead of leaving
            // it permanently "running" after the worker has moved on.
            const cancelled = this.stoppedJobId === job.id || this.repository.jobStatus(job.workspace_id,job.id)?.status === 'cancelled'
            if (cancelled) {
              this.repository.cancelJob(job.id)
              this.emit({...this.currentProgress(job.id,job.kind as JobKind),status:'cancelled',message:'Scan stopped. Completed results are saved.'})
            } else this.repository.requeueJob(job.id)
            break
          }
          const progress = this.currentProgress(job.id,job.kind as JobKind)
          if (error instanceof LicenseAccessError) {
            this.repository.markJob(job.id,'failed',progress.found,error.message)
            this.emit({...progress,status:'failed',message:error.message})
            break
          }
          this.repository.markJob(job.id, 'failed', progress.found, error instanceof Error ? error.message : String(error))
          this.emit({...progress,status:'failed',message:error instanceof Error ? error.message : String(error)})
        }
      }
    } catch (error) {
      if (!(error instanceof Error && error.name === 'AbortError')) {
        this.emit({
          jobId: '',
          kind: 'website',
          status: 'failed',
          processed: 0,
          total: 0,
          found: 0,
          leadName: '',
          message: error instanceof Error ? error.message : String(error),
        })
      }
    } finally {
      await this.enricher.close()
      this.controller = null
      this.looping = false
      this.activeProgress = null
      this.emit({
        jobId: '',
        kind: 'website',
        status: 'idle',
        processed: 0,
        total: 0,
        found: 0,
        leadName: '',
        message: 'Enrichment finished',
      })
    }
  }

  stop(jobId = ''): void {
    const active = this.activeProgress
    const target = jobId || active?.jobId || ''
    if (target) this.repository.cancelJob(target)
    if (jobId && active?.jobId !== jobId) return
    this.stoppedJobId = target
    this.controller?.abort()
    void this.enricher.close()
  }

  /**
   * Gives a website import the foreground turn. A long background cascade is abortable between
   * pages, so requeue it and let the queue's one-site priority select the URL the user just pasted.
   */
  async prioritize(jobId = ''): Promise<void> {
    if (jobId) this.foregroundJobId = jobId
    if (!this.looping) {
      await this.drain()
      return
    }
    this.controller?.abort()
    void this.enricher.close()
    while (this.looping) await new Promise((resolve) => setTimeout(resolve, 25))
    await this.drain()
  }

  private async runJob(
    job: { id: string; workspace_id: string; kind: string; lead_ids: string; options?: string },
    signal: AbortSignal,
  ): Promise<void> {
    const kind = (JOB_KINDS.includes(job.kind as JobKind) ? job.kind : 'website') as JobKind
    const lookup = lookupOptions(job.options)
    const isLookup = kind === 'website' && lookup.source === 'website-lookup'
    const fields = lookup.fields ?? DEFAULT_LOOKUP_FIELDS
    let leadIds: string[] = []
    try {
      const parsed: unknown = JSON.parse(job.lead_ids)
      if (!Array.isArray(parsed)) throw new Error('Invalid lead list')
      leadIds = [...new Set(parsed.filter((id): id is string => typeof id === 'string' && Boolean(id.trim())))]
    } catch {
      this.repository.markJob(job.id, 'failed', 0, 'The job carried no usable lead list.')
      this.emit({jobId:job.id,kind,status:'failed',processed:0,total:0,found:0,failed:0,leadName:'',message:'The job carried no usable lead list.'})
      return
    }

    this.repository.markJob(job.id, 'running')
    let found = 0
    let processed = 0
    let failed = 0
    let searchFailure: string | null = null

    // The deep pass is a search per lead rather than a read of its own site, so it does not need a
    // website and it does not use the browser. It runs through the same queue, which is what makes
    // one progress bar and one Stop button cover every kind of pass.
    if (kind === 'deep') {
      await this.runDeepJob(job, leadIds, signal, (count) => {
        found = count
      }, (count) => {
        processed = count
      })
      return
    }

    for (const leadId of leadIds) {
      if (signal.aborted) throw new DOMException('Enrichment cancelled', 'AbortError')
      await waitForAbort(Promise.resolve(this.options.authorize?.(kind, false)),signal)
      const lead = this.repository.getLead(job.workspace_id, leadId)
      if (!lead || (!lead.website && kind !== 'decision-maker')) {
        processed += 1
        failed += 1
        searchFailure = 'Some saved businesses have no website to scan.'
        this.emit({jobId:job.id,kind,status:'running',processed,total:leadIds.length,found,failed,leadName:lead?.name || '',message:'Skipped a business without a website.'})
        continue
      }

      let siteFailure: string | null = null
      try {

      if (isLookup) this.repository.saveWebsiteLookupRow(job.id,{...emptyLookupRow(lead),status:'running'})
      this.emit({
        jobId: job.id,
        kind,
        status: 'running',
        processed,
        total: leadIds.length,
        found,
        failed,
        leadName: lead.name,
        message: lead.website ? `Reading ${lead.name}…` : `Searching public sources for ${lead.name} by business name and location…`,
      })
      if (kind === 'decision-maker') await waitForAbort(Promise.resolve(this.options.consumeDecisionLead?.(leadId)),signal)

      const inspect = kind === 'social'
        ? this.enricher.inspectSocialFast(lead.website, signal)
        : kind === 'decision-maker'
          ? lead.website ? this.enricher.inspectPeople(lead.website, signal) : Promise.resolve({emails:[],phones:[],socials:[],addresses:[],people:[],pagesRead:[],error:null} as import('./website').WebsiteFindings)
        : kind === 'phone'
          ? this.enricher.inspectPhoneFast(lead.website, signal)
        : kind === 'email'
          ? this.enricher.inspectContactFast(lead.website, signal,true)
          : this.enricher.inspectContactFast(lead.website, signal)
      const findings = await waitForAbort(inspect, signal)
      if ((kind === 'email' || (isLookup && fields.email)) && !findings.emails.length && !signal.aborted) {
        this.emit({jobId:job.id,kind,status:'running',processed,total:leadIds.length,found,leadName:lead.name,message:`Checking the website's displayed contact pages for ${lead.name}…`})
        const renderedSignal=AbortSignal.any([signal,AbortSignal.timeout(35_000)])
        const closeRendered=()=>{void this.enricher.close()}
        renderedSignal.addEventListener('abort',closeRendered,{once:true})
        try {
          const contact=findings.pagesRead.find(url=>/\/(?:contact(?:-us)?|support|help)(?:\/|\.[a-z]+$|$)/i.test(url)) || lead.website
          const displayed=await waitForAbort(this.enricher.inspect(contact,renderedSignal),renderedSignal)
          if (!displayed.error) {
            findings.error=null;findings.emails=displayed.emails
            if (isLookup) { findings.phones.push(...displayed.phones); findings.socials.push(...displayed.socials); findings.addresses=[...(findings.addresses ?? []),...(displayed.addresses ?? [])]; findings.businessName ||= displayed.businessName }
            findings.pagesRead=[...new Set([...findings.pagesRead,...displayed.pagesRead])]
          } else if (isLookup) findings.error=displayed.error; else siteFailure=displayed.error
        } catch (error) {
          if (signal.aborted)throw new DOMException('Enrichment cancelled','AbortError')
          if (isLookup) findings.error='The displayed contact pages could not finish loading. Retry this website.'
          else siteFailure='The displayed contact pages could not finish loading. Retry this website.'
        } finally { renderedSignal.removeEventListener('abort',closeRendered);await this.enricher.close() }
      }
      // Social scans deliberately stay on the bounded HTTP path. Falling back to Chromium after a
      // 403/timeout brings back the long modal that this foreground pass is meant to avoid; the
      // result is still durable and the user can retry a site that does not expose server HTML.
      if (signal.aborted) throw new DOMException('Enrichment cancelled', 'AbortError')
      findings.emails.sort((a,b)=>compareEmailContacts({...a,source:a.page},{...b,source:b.page}))
      findings.emails=findings.emails.slice(0,1)
      if (isLookup) this.repository.saveWebsiteLookupRow(job.id,lookupRowFromFindings(lead,findings,fields))
      if(kind==='decision-maker' && !findings.people.length){
        this.emit({jobId:job.id,kind,status:'running',processed,total:leadIds.length,found,leadName:lead.name,message:`Looking for ${lead.name}'s owner on public sources…`})
        const discovery=await waitForAbort(findBusinessOwners(lead,{key:this.options.deepKey?.(),signal,searchWeb:(query,abort)=>this.enricher.searchPublicWeb(query,abort)}),signal)
        findings.people.push(...discovery.people)
        if(discovery.people.length)findings.error=null
        else if(discovery.error)siteFailure=`Public owner search could not finish: ${discovery.error}`
      }
      if (findings.error) {
        processed += 1
        failed += 1
        searchFailure = findings.error
        this.emit({jobId:job.id,kind,status:'running',processed,total:leadIds.length,found,failed,leadName:lead.name,message:findings.error})
        continue
      }

      if (kind === 'decision-maker') {
        // Cofounders often publish contact details on the same pages. Share only this scan's
        // in-flight reads; each person's identity/email evidence is still checked separately.
        const pageCache:import('./owner-search').OwnerPageCache=new Map()
        await Promise.all(findings.people.filter(person=>!person.email).slice(0,3).map(async owner=>{
          this.emit({jobId:job.id,kind,status:'running',processed,total:leadIds.length,found,leadName:lead.name,message:`Searching public sources for ${owner.fullName}'s email…`})
          const knownSources=this.db.query<OwnerEmailSource & {title:string}>(`select d.full_name as fullName,d.title,d.email,d.source,l.website from decision_makers d join leads l on l.id=d.lead_id where d.workspace_id=? and d.lead_id<>? and d.email<>''`,[job.workspace_id,leadId]).filter(person=>isBusinessOwner(person.title) && ownerIdentityKey(person.fullName)===ownerIdentityKey(owner.fullName) && ownerEmail(person.fullName,person.email))
          const match=await waitForAbort(findOwnerEmail(lead,owner,{key:this.options.deepKey?.(),signal,knownSources,scannedPages:findings.pagesRead,pageCache,searchWeb:(query,abort)=>this.enricher.searchPublicWeb(query,abort)}),signal)
          if (match.email) { owner.email=match.email;owner.evidence=match.source }
          else if (match.error) siteFailure=`Public email search for ${owner.fullName} could not finish: ${match.error}`
        }))
      }

      if (kind !== 'decision-maker' && (kind !== 'website' || fields.address)) this.repository.fillLeadAddress(leadId, findings.addresses ?? [])
      // Email and website jobs both fill addresses; social fills profiles; phone fills numbers.
      if (kind === 'email' || (kind === 'website' && fields.email)) {
        this.repository.replaceMainEmail(leadId,findings.emails[0])
        found+=findings.emails.length
      }

      if (kind === 'phone') this.repository.replaceScannedPhones(leadId,findings.phones,findings.pagesRead)
      if (kind === 'phone' || (kind === 'website' && fields.phone)) {
        for (const phone of findings.phones) {
          // Preserve the primary Maps number while storing every published website number.
          this.repository.upsertContact({ leadId, kind: 'phone', value: phone.value, source: phone.page || 'website', verified: false, score: phone.score })
          found += 1
        }
      }

      if (kind === 'social' || (kind === 'website' && fields.social)) {
        for (const social of findings.socials) {
          this.repository.upsertSocialProfile({
            workspaceId: job.workspace_id,
            leadId,
            platform: social.platform,
            handle: social.handle,
            profileUrl: social.profileUrl,
            source: social.page || lead.website || 'website',
          })
          found += 1
        }
      }

      if (kind === 'decision-maker') {
        if (!siteFailure) this.repository.pruneNoisyPeople(isUsablePerson,leadId)
        // A corrected current-owner scan must also remove an older schema-only result from
        // this business. Never replace every saved person simply because a partial crawl
        // missed them; only the specific names superseded by current visible evidence qualify.
        const currentOwners=new Set(findings.people.map(person=>ownerIdentityKey(person.fullName)))
        const superseded=new Set((findings.supersededOwnerNames ?? []).map(ownerIdentityKey).filter(name=>!currentOwners.has(name)))
        if(superseded.size){
          const previous=this.db.query<{id:string;full_name:string}>('select id,full_name from decision_makers where workspace_id=? and lead_id=?',[job.workspace_id,leadId])
          for(const person of previous)if(superseded.has(ownerIdentityKey(person.full_name)))this.db.run('delete from decision_makers where id=? and workspace_id=? and lead_id=?',[person.id,job.workspace_id,leadId])
        }
        for (const person of findings.people) {
          this.repository.addDecisionMaker({
            workspaceId: job.workspace_id,
            leadId,
            fullName: person.fullName,
            title: person.title,
            email: person.email,
            replaceEmail: !siteFailure,
            phone: person.phone,
            linkedinUrl: person.linkedinUrl,
            // An interrupted email check must not relabel a retained mailbox with a new bio URL.
            source: siteFailure && !person.email ? '' : person.evidence || 'website',
          })
          found += kind === 'decision-maker' ? (person.email ? 1 : 0) : 1
        }

      }

      if (isLookup) this.repository.fillPublishedBusiness(leadId,findings.businessName || '',fields.phone ? findings.phones[0]?.value || '' : '')

      processed += 1
      if (siteFailure) { failed += 1; searchFailure = siteFailure }
      // The site has now been read, whatever came back. The finder pages show the leads that are
      // covered so far, so this is written before the next lead is started rather than at the end.
      this.repository.markLeadScanned(leadId)
      this.emit({
        jobId: job.id,
        kind,
        status: 'running',
        processed,
        total: leadIds.length,
        found,
        failed,
        leadName: lead.name,
        message: kind === 'phone' ? `${lead.name} · ${findings.phones.length} published phone number${findings.phones.length===1?'':'s'}` : kind === 'decision-maker' ? `${lead.name} · ${findings.people.filter(person=>person.email).length} published owner emails` : found
          ? `${lead.name} · ${findings.emails.length} address${findings.emails.length === 1 ? '' : 'es'}, ${findings.socials.length} social`
          : `${lead.name} · nothing published`,
      })

      } catch (error) {
        if (signal.aborted) throw new DOMException('Enrichment cancelled','AbortError')
        if (error instanceof LicenseAccessError) throw error
        processed += 1
        failed += 1
        searchFailure = error instanceof Error ? error.message : String(error)
        if (isLookup) this.repository.saveWebsiteLookupRow(job.id,{...emptyLookupRow(lead),status:'failed',error:searchFailure})
        this.emit({jobId:job.id,kind,status:'running',processed,total:leadIds.length,found,failed,leadName:lead.name,message:`Could not finish ${lead.name}: ${searchFailure}`})
      }
      // Other people's servers: leave a gap between them, with an immediate Stop response.
      if (processed < leadIds.length) await waitForAbort(new Promise(resolve=>setTimeout(resolve,PACE_MS)),signal)
    }

    if (signal.aborted) throw new DOMException('Enrichment cancelled','AbortError')
    this.repository.markJob(job.id, searchFailure ? 'failed' : 'done', found, searchFailure)
    this.emit({
      jobId: job.id,
      kind,
      status: searchFailure ? 'failed' : 'done',
      processed,
      total: leadIds.length,
      found,
      failed,
      leadName: '',
      message: searchFailure ? `Scan finished · ${processed} of ${leadIds.length} websites checked; ${failed} could not finish. ${searchFailure}` : `Enrichment finished · ${found} ${kind === 'decision-maker' ? 'owner emails' : 'details'} found across ${processed} leads`,
    })
  }

  /**
   * The deep pass: one search per lead, and what the results say about its people.
   *
   * What comes back is filed as a suggestion rather than as a contact. A search snippet is somebody
   * else's claim — a directory page, a forum, an AI answer — and the app's own rule is that only a
   * site naming a person, a named mailbox or a LinkedIn profile is a decision maker. A hit from a
   * snippet is a lead to check, which is what the page's "Suggestions to review" are for.
   */
  private async runDeepJob(
    job: { id: string; workspace_id: string },
    leadIds: string[],
    signal: AbortSignal,
    setFound: (count: number) => void,
    setProcessed: (count: number) => void,
  ): Promise<void> {
    const key = this.options.deepKey?.() ?? ''
    if (!key) throw new Error('Add a DataForSEO key in Settings → Account before running a deep pass.')
    let found = 0
    let processed = 0
    let spent = 0
    let failure: string | null = null

    for (const leadId of leadIds) {
      if (signal.aborted) throw new DOMException('Enrichment cancelled', 'AbortError')
      await waitForAbort(Promise.resolve(this.options.authorize?.('deep', false)),signal)
      const lead = this.repository.getLead(job.workspace_id, leadId)
      if (!lead) {
        processed += 1
        continue
      }
      await waitForAbort(Promise.resolve(this.options.consumeDecisionLead?.(leadId)),signal)

      this.emit({
        jobId: job.id,
        kind: 'deep',
        status: 'running',
        processed,
        total: leadIds.length,
        found,
        leadName: lead.name,
        message: `Searching for ${lead.name}…`,
      })

      // Step one names a founder/owner from the top ten Google results. Only after a person is
      // named do we spend the follow-up search for that person's mailbox.
      const where = locationForLead(lead)
      // DataForSEO's standard queue can legitimately take longer than its first minute during a
      // multi-lead pass. Keep polling for the same 90-second window used by the live API check so
      // a slow task is not reported as queued while the rest of the batch continues.
      const ownerResult = await waitForAbort(searchOwnerCandidates(key, queryForOwner(lead), where, { waitMs: 90_000, signal }),signal)
      spent += ownerResult.cost
      if (ownerResult.error && !failure) failure = ownerResult.error

      const owners = ownerResult.owners.filter((owner) => aboutThisOwner(owner, lead)).slice(0, 3)
      for (const owner of owners) {
        if (signal.aborted) throw new DOMException('Enrichment cancelled', 'AbortError')
        const emailResult = await waitForAbort(searchEmails(key, queryForOwnerEmail(lead, owner), where, { waitMs: 90_000, signal }),signal)
        spent += emailResult.cost
        if (emailResult.error && !failure) failure = emailResult.error
        // An address in the same results as the business is not automatically the business's.
        // The page has to mention the business, or the address has to be on its own domain.
        const email = emailResult.emails.find((candidate) => aboutThisLead(candidate, lead))
        const emailEvidence = email
          ? ` ${email.value} — unverified, from ${email.url || 'a search snippet'}${email.obfuscated ? ', written obfuscated' : ''}. ${email.source}`
          : ' No owner mailbox was published in the top 10 results.'
        const created = this.repository.suggestPerson({
          workspaceId: job.workspace_id,
          leadId,
          fullName: owner.fullName,
          title: owner.title || 'Founder / owner',
          source: 'email',
          evidence: `${owner.title || 'Founder / owner'} found in ${owner.url || 'a Google result'}: ${owner.source}.${emailEvidence}`,
          email: email?.value,
        })
        if (created.created) found += 1
      }

      processed += 1
      setFound(found)
      setProcessed(processed)
      this.emit({
        jobId: job.id,
        kind: 'deep',
        status: 'running',
        processed,
        total: leadIds.length,
        found,
        leadName: lead.name,
        message: owners.length
          ? `${lead.name} · ${owners.length} owner${owners.length === 1 ? '' : 's'} found; email search complete`
          : `${lead.name} · no founder or owner found in the top 10`,
      })

      // Searches are paid for and rate-limited: a gap keeps a long pass inside both.
      await new Promise((resolve) => setTimeout(resolve, PACE_MS))
    }

    this.repository.markJob(job.id, failure && !found ? 'failed' : 'done', found, failure)
    this.emit({
      jobId: job.id,
      kind: 'deep',
      status: failure && !found ? 'failed' : 'done',
      processed,
      total: leadIds.length,
      found,
      leadName: '',
      message: failure
        ? `Deep pass stopped · ${failure}`
        : `Deep pass finished · ${found} suggestion${found === 1 ? '' : 's'} across ${processed} lead${processed === 1 ? '' : 's'} · $${spent.toFixed(4)}`,
    })
  }

  private currentProgress(jobId: string, kind: JobKind): Omit<EnrichmentProgress,'at'> {
    return this.activeProgress?.jobId === jobId ? this.activeProgress : {jobId,kind,status:'running',processed:0,total:0,found:0,failed:0,leadName:'',message:''}
  }

  private emit(progress: Omit<EnrichmentProgress, 'at' | 'failed'> & {failed?:number}): void {
    const complete: EnrichmentProgress = {...progress,failed:progress.failed ?? (this.activeProgress?.jobId===progress.jobId ? this.activeProgress.failed : 0),at:new Date().toISOString()}
    if (progress.jobId) {
      this.activeProgress = complete
      this.repository.saveJobProgress(progress.jobId,complete)
    }
    this.options.onProgress?.(complete)
  }
}
