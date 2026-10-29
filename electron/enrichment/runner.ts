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
import { WebsiteEnricher } from './website'
import { DEFAULT_LOOKUP_FIELDS, emptyLookupRow, lookupOptions, lookupRowFromFindings } from './website-lookup'
import { findOwnerContact } from './owner-search'
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
  outcomes?: Record<string,{status:'found'|'not-published'|'error';searches:number;error?:string}>
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
  ownerSearch?: (query:string,signal:AbortSignal,progress:(message:string)=>void) => Promise<{hits:import('./dataforseo').OrganicSearchHit[];error:string|null}>
  prepareOwnerSearch?: (signal:AbortSignal,progress:(message:string)=>void) => Promise<void>
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

    // Every owner action shares the same two-query ceiling and Stop/progress lifecycle.
    if (kind === 'decision-maker' || kind === 'deep') {
      await this.runOwnerJob(job, leadIds, signal,kind)
      return
    }

    for (const leadId of leadIds) {
      if (signal.aborted) throw new DOMException('Enrichment cancelled', 'AbortError')
      await waitForAbort(Promise.resolve(this.options.authorize?.(kind, false)),signal)
      const lead = this.repository.getLead(job.workspace_id, leadId)
      if (!lead || !lead.website) {
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

      const inspect = kind === 'social'
        ? this.enricher.inspectSocialFast(lead.website, signal)
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
      if (findings.error) {
        processed += 1
        failed += 1
        searchFailure = findings.error
        this.emit({jobId:job.id,kind,status:'running',processed,total:leadIds.length,found,failed,leadName:lead.name,message:findings.error})
        continue
      }

      if (kind !== 'website' || fields.address) this.repository.fillLeadAddress(leadId, findings.addresses ?? [])
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
        message: kind === 'phone' ? `${lead.name} · ${findings.phones.length} published phone number${findings.phones.length===1?'':'s'}` : found
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
      message: searchFailure ? `Scan finished · ${processed} of ${leadIds.length} websites checked; ${failed} could not finish. ${searchFailure}` : `Enrichment finished · ${found} details found across ${processed} leads`,
    })
  }

  /** Shared by every owner entry point; one company consumes one credit, not one per query. */
  private async runOwnerJob(job:{id:string;workspace_id:string},leadIds:string[],signal:AbortSignal,kind:JobKind):Promise<void>{
    let processed=0,found=0,failed=0
    const outcomes:NonNullable<EnrichmentProgress['outcomes']>={}
    const progress=(leadName:string,message:string,status:EnrichmentProgress['status']='running')=>this.emit({jobId:job.id,kind,status,processed,total:leadIds.length,found,failed,leadName,message,outcomes:{...outcomes}})
    // Browser setup and user sign-in happen before any company credit is consumed.
    await waitForAbort(Promise.resolve(this.options.prepareOwnerSearch?.(signal,message=>progress('',message))),signal)
    for(const leadId of leadIds){
      signal.throwIfAborted()
      await waitForAbort(Promise.resolve(this.options.authorize?.(kind,false)),signal)
      const lead=this.repository.getLead(job.workspace_id,leadId)
      if(!lead){processed++;failed++;outcomes[leadId]={status:'error',searches:0,error:'Saved business no longer exists.'};progress('','Skipped a missing business.');continue}
      try{
        await waitForAbort(Promise.resolve(this.options.consumeDecisionLead?.(leadId)),signal)
        const result=await waitForAbort(findOwnerContact(lead,{key:this.options.deepKey?.(),signal,
          // Interactive Google checks have their own deadline. Normal pages still return immediately.
          timeoutMs:this.options.ownerSearch?12*60*1000:undefined,
          search:this.options.ownerSearch?(query,abort)=>this.options.ownerSearch!(query,abort,message=>progress(lead.name,message)):undefined,
          onStep:(step,_query,retrying)=>progress(lead.name,retrying?`Search ${step} of 2 · reconnecting to Google after a temporary error. Retrying this query once…`:step===1?`Search 1 of 2 · finding ${lead.name}'s founder and email…`:`Search 2 of 2 · checking the named owner's email…`)}),signal)
        signal.throwIfAborted()
        if(result.error){failed++;outcomes[leadId]={status:'error',searches:result.searches,error:result.error}}
        else {
          // A successful fresh scan replaces its previous automatically sourced results, so an
          // old email cannot be presented as something the two current searches just found.
          this.db.transaction(()=>{
            this.db.run("delete from decision_makers where workspace_id=? and lead_id=? and (source like 'http%' or source='website')",[job.workspace_id,leadId])
            for(const person of result.people)this.repository.addDecisionMaker({workspaceId:job.workspace_id,leadId,fullName:person.fullName,title:person.title,email:person.email,emailEvidence:person.emailEvidence,replaceEmail:true,phone:'',linkedinUrl:'',source:person.evidence})
          })
          const count=result.people.filter(person=>person.email).length;found+=count
          outcomes[leadId]={status:count?'found':'not-published',searches:result.searches}
          this.repository.markLeadScanned(leadId)
        }
        processed++
        progress(lead.name,result.error?`${lead.name} · ${result.error}`:`${lead.name} · ${outcomes[leadId].status==='found'?'Owner email found':'Not published'} · ${result.searches} search${result.searches===1?'':'es'}`)
        // A closed/blocked browser affects the whole batch. Leave remaining rows unscanned and
        // uncharged rather than repeating the same failure for every business.
        if(this.options.ownerSearch && result.error && /MamaLead Chrome|Google (?:verification|results|sign-in)/i.test(result.error))break
      }catch(error){
        if(signal.aborted)throw new DOMException('Enrichment cancelled','AbortError')
        if(error instanceof LicenseAccessError)throw error
        processed++;failed++;outcomes[leadId]={status:'error',searches:0,error:error instanceof Error?error.message:'Owner search could not finish.'};progress(lead.name,outcomes[leadId].error!)
      }
      if(processed<leadIds.length)await waitForAbort(new Promise(resolve=>setTimeout(resolve,PACE_MS)),signal)
    }
    const error=failed?`${failed} business search${failed===1?'':'es'} could not finish. Retry the rows marked Search failed.`:null
    this.repository.markJob(job.id,error?'failed':'done',found,error)
    progress('',error || `Owner scan finished · ${found} owner emails found across ${processed} leads. Maximum two searches per business.`,error?'failed':'done')
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
