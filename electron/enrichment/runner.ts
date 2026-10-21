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
import { personNameFromLinkedIn, type Repository } from '../db/repository'
import { locationForLead, queryForOwner, queryForOwnerEmail, searchEmails, searchOwnerCandidates } from './dataforseo'
import type { ExtractedEmail } from './email-extractor'
import { WebsiteEnricher } from './website'

export type JobKind = 'email' | 'phone' | 'social' | 'decision-maker' | 'website' | 'deep'

const JOB_KINDS: JobKind[] = ['email', 'phone', 'social', 'decision-maker', 'website', 'deep']

export interface EnrichmentProgress {
  jobId: string
  kind: JobKind
  status: 'running' | 'done' | 'failed' | 'idle'
  processed: number
  total: number
  found: number
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
        try {
          const kind = (JOB_KINDS.includes(job.kind as JobKind) ? job.kind : 'website') as JobKind
          await this.options.authorize?.(kind, true)
          await this.runJob(job, controller.signal)
        } catch (error) {
          if (error instanceof Error && error.name === 'AbortError') {
            // Stop/prioritize can interrupt a page read. Keep that job durable instead of leaving
            // it permanently "running" after the worker has moved on.
            this.repository.requeueJob(job.id)
            break
          }
          if (error instanceof LicenseAccessError) {
            this.repository.requeueJob(job.id)
            this.emit({ jobId: job.id, kind: job.kind as JobKind, status: 'failed', processed: 0, total: 0, found: 0, leadName: '', message: error.message })
            break
          }
          throw error
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

  stop(): void {
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
    job: { id: string; workspace_id: string; kind: string; lead_ids: string },
    signal: AbortSignal,
  ): Promise<void> {
    const kind = (JOB_KINDS.includes(job.kind as JobKind) ? job.kind : 'website') as JobKind
    let leadIds: string[] = []
    try {
      leadIds = JSON.parse(job.lead_ids) as string[]
    } catch {
      this.repository.markJob(job.id, 'failed', 0, 'The job carried no usable lead list.')
      return
    }

    this.repository.markJob(job.id, 'running')
    let found = 0
    let processed = 0

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
      await this.options.authorize?.(kind, false)
      const lead = this.repository.getLead(job.workspace_id, leadId)
      if (!lead?.website) {
        processed += 1
        continue
      }
      if (kind === 'decision-maker') await this.options.consumeDecisionLead?.(leadId)

      this.emit({
        jobId: job.id,
        kind,
        status: 'running',
        processed,
        total: leadIds.length,
        found,
        leadName: lead.name,
        message: `Reading ${lead.name}…`,
      })

      const inspect = kind === 'social'
        ? this.enricher.inspectSocialFast(lead.website, signal)
        : kind === 'decision-maker'
          ? this.enricher.inspectPeople(lead.website, signal)
        : kind === 'email' || kind === 'phone'
          ? this.enricher.inspectContactFast(lead.website, signal)
          : this.enricher.inspect(lead.website, signal)
      const findings = await waitForAbort(inspect, signal)
      // Social scans deliberately stay on the bounded HTTP path. Falling back to Chromium after a
      // 403/timeout brings back the long modal that this foreground pass is meant to avoid; the
      // result is still durable and the user can retry a site that does not expose server HTML.
      if (signal.aborted) throw new DOMException('Enrichment cancelled', 'AbortError')
      if (findings.error) {
        processed += 1
        continue
      }

      // Email and website jobs both fill addresses; social fills profiles; phone fills numbers.
      if (kind === 'email' || kind === 'website') {
        for (const email of findings.emails) {
          this.repository.upsertContact({
            leadId,
            kind: 'email',
            value: email.value,
            // The page it was read from, not just "website": the Email Finder's coverage rings
            // report which page of a site each address came off, and only the harvester knows.
            source: email.page || 'website',
            // A mailbox on the business's own domain is verified by construction; anything else
            // is recorded as a lead to check rather than as a fact.
            verified: email.score >= 70 && email.value.endsWith(`@${new URL(lead.website).host.replace(/^www\./i, '')}`),
            score: email.score,
          })
          found += 1
        }
      }

      if (kind === 'phone') {
        for (const phone of findings.phones) {
          // The Maps listing usually wins; only fill a gap.
          if (lead.phone) break
          this.repository.upsertContact({ leadId, kind: 'phone', value: phone.value, source: phone.page || 'website', verified: false })
          found += 1
        }
      }

      if (kind === 'social') {
        for (const social of findings.socials) {
          this.repository.upsertSocialProfile({
            workspaceId: job.workspace_id,
            leadId,
            platform: social.platform,
            handle: social.handle,
            profileUrl: social.profileUrl,
            source: 'website',
          })
          found += 1
        }
      }

      if (kind === 'decision-maker') {
        for (const person of findings.people) {
          this.repository.addDecisionMaker({
            workspaceId: job.workspace_id,
            leadId,
            fullName: person.fullName,
            title: person.title,
            email: person.email,
            phone: person.phone,
            linkedinUrl: person.linkedinUrl,
            source: person.evidence || 'website',
          })
          found += 1
        }

        // A LinkedIn profile found on the site names somebody, but reading a profile URL is not
        // the same as the business confirming a role, so it is suggested rather than asserted.
        for (const social of findings.socials) {
          if (social.platform !== 'linkedin' || !/\/in\//i.test(social.profileUrl)) continue
          const name = personNameFromLinkedIn(social.profileUrl)
          if (!name) continue
          const result = this.repository.suggestPerson({
            workspaceId: job.workspace_id,
            leadId,
            fullName: name,
            source: 'linkedin',
            evidence: social.profileUrl,
            linkedinUrl: social.profileUrl,
          })
          if (result.created) found += 1
        }
      }

      processed += 1
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
        leadName: lead.name,
        message: found
          ? `${lead.name} · ${findings.emails.length} address${findings.emails.length === 1 ? '' : 'es'}, ${findings.socials.length} social`
          : `${lead.name} · nothing published`,
      })

      // Other people's servers: leave a gap between them.
      await new Promise((resolve) => setTimeout(resolve, PACE_MS))
    }

    this.repository.markJob(job.id, 'done', found)
    this.emit({
      jobId: job.id,
      kind,
      status: 'done',
      processed,
      total: leadIds.length,
      found,
      leadName: '',
      message: `Enrichment finished · ${found} detail${found === 1 ? '' : 's'} found across ${processed} lead${processed === 1 ? '' : 's'}`,
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
      await this.options.authorize?.('deep', false)
      const lead = this.repository.getLead(job.workspace_id, leadId)
      if (!lead) {
        processed += 1
        continue
      }
      await this.options.consumeDecisionLead?.(leadId)

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
      const ownerResult = await searchOwnerCandidates(key, queryForOwner(lead), where, { waitMs: 90_000 })
      spent += ownerResult.cost
      if (ownerResult.error && !failure) failure = ownerResult.error

      const owners = ownerResult.owners.filter((owner) => aboutThisOwner(owner, lead)).slice(0, 3)
      for (const owner of owners) {
        if (signal.aborted) throw new DOMException('Enrichment cancelled', 'AbortError')
        const emailResult = await searchEmails(key, queryForOwnerEmail(lead, owner), where, { waitMs: 90_000 })
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

  private emit(progress: Omit<EnrichmentProgress, 'at'>): void {
    this.options.onProgress?.({ ...progress, at: new Date().toISOString() })
  }
}
