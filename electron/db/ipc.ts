// The IPC surface for the local database.
//
// One channel per operation, all of them thin: the main process owns the database and the
// renderer never sees SQL. Every call resolves to a result envelope instead of rejecting, so a
// database problem surfaces as a message the page can show rather than an unhandled rejection.
import { ipcMain, BrowserWindow, type IpcMainInvokeEvent } from 'electron'
import { isUsableEmail } from '../enrichment/website'
import { writeExport } from '../export/writer'
import { LocalDatabase } from './local-db'
import { Repository } from './repository'

export interface LocalError {
  error: string
}

export type LocalResult<T> = T | LocalError

/** Names of the invokable operations, used to type the preload bridge. */
export const LOCAL_CHANNELS = [
  'db:workspace',
  'db:usage',
  'db:stats',
  'db:dashboard',
  'db:leads:list',
  'db:leads:get',
  'db:leads:summary',
  'db:leads:bookmark',
  'db:leads:needing',
  'db:phones:ledger',
  'db:phones:summary',
  'db:runs:list',
  'db:runs:counts',
  'db:contacts:list',
  'db:contacts:upsert',
  'db:contacts:update',
  'db:contacts:delete',
  'db:contacts:prune',
  'db:social:list',
  'db:social:upsert',
  'db:social:update',
  'db:social:delete',
  'db:people:list',
  'db:people:ledger',
  'db:people:funnel',
  'db:people:candidates',
  'db:people:candidateTotals',
  'db:people:buildSuggestions',
  'db:people:confirm',
  'db:people:dismiss',
  'db:people:restore',
  'db:people:add',
  'db:people:delete',
  'db:lists:list',
  'db:lists:create',
  'db:lists:delete',
  'db:lists:add',
  'db:lists:remove',
  'db:lists:members',
  'db:jobs:queue',
  'db:jobs:cancel',
  'db:jobs:totals',
  'db:jobs:status',
  'db:jobs:usage',
  'db:jobs:covered',
  'db:imports:list',
  'db:imports:ledger',
  'db:imports:websites',
  'db:imports:social',
  'db:search:history',
  'db:search:record',
  'db:activity:list',
  'db:activity:count',
  'db:activity:log',
  'db:activity:clear',
  'db:imports:preview',
  'db:exports:list',
  'db:exports:record',
  'db:exports:write',
  'db:coverage:email',
  'db:coverage:social',
] as const

export type LocalChannel = (typeof LOCAL_CHANNELS)[number]

interface Handler {
  (repository: Repository, workspaceId: string, payload: any, event: IpcMainInvokeEvent): unknown
}

/**
 * Registers every handler. Each one receives the repository, the workspace id and the payload
 * the renderer sent, and either returns a value or throws — a throw becomes an error envelope.
 */
export function registerLocalDatabase(
  db: LocalDatabase,
  repository: Repository,
  /** Called with the leads a fresh import created, so the worker can be woken. */
  onImported?: (leadIds: string[]) => void,
  /** Main-process authorization for paid database operations. */
  authorize?: (channel: LocalChannel, payload: unknown) => Promise<void>,
): void {
  const workspace = db.ensureWorkspace()

  const handlers: Record<LocalChannel, Handler> = {
    // The workspace's own row, plus what the page states about the store: where the file is on this
    // machine and how big it is. Sent from here because the renderer has no filesystem of its own.
    'db:workspace': () => ({
      ...workspace,
      usage: db.usage(workspace.id),
      subscription: db.subscription(workspace.id),
      members: db.query<{ user_id: string; role: string; created_at: string }>(
        'select user_id, role, created_at from workspace_members where workspace_id = ? order by created_at, user_id',
        [workspace.id],
      ),
      store: db.storeInfo(),
    }),
    'db:usage': () => db.usage(workspace.id),
    'db:stats': () => repository.leadSummary(workspace.id),
    'db:dashboard': () => repository.dashboard(workspace.id),

    'db:leads:list': (_repo, _workspace, payload: { limit?: number; offset?: number; filter?: 'all' | 'phone' | 'email' | 'social' | 'missing'; search?: string; runId?: string } = {}) =>
      repository.listLeads(workspace.id, payload),
    'db:leads:get': (_repo, _workspace, payload: { id: string }) => repository.getLead(workspace.id, payload.id),
    'db:leads:summary': () => repository.leadSummary(workspace.id),
    'db:leads:bookmark': (_repo, _workspace, payload: { id: string; bookmarked: boolean }) => {
      repository.setBookmarked(workspace.id, payload.id, payload.bookmarked)
      return { ok: true }
    },
    'db:leads:needing': (_repo, _workspace, payload: { kind: 'email' | 'phone' | 'social'; limit?: number }) =>
      repository.leadsNeedingContact(workspace.id, payload.kind, payload.limit),
    'db:phones:ledger': (_repo, _workspace, payload: { limit?: number } = {}) => repository.phoneLedger(workspace.id, payload.limit),
    'db:phones:summary': () => repository.phoneSummary(workspace.id),

    'db:runs:list': (_repo, _workspace, payload: { limit?: number } = {}) => repository.listRuns(workspace.id, payload.limit),
    'db:runs:counts': () => repository.runCounts(workspace.id),

    'db:contacts:list': (_repo, _workspace, payload: { kind: 'email' | 'phone' | 'social'; leadIds?: string[] }) =>
      repository.listContacts(workspace.id, payload.kind, payload.leadIds),
    'db:contacts:upsert': (_repo, _workspace, payload: { leadId: string; kind: 'email' | 'phone' | 'social'; value: string; source?: string; verified?: boolean; score?: number | null }) =>
      repository.upsertContact(payload),
    'db:contacts:update': (_repo, _workspace, payload: { id: string; patch: { value?: string; verified?: boolean; score?: number | null } }) => {
      repository.updateContact(payload.id, payload.patch)
      return { ok: true }
    },
    'db:contacts:delete': (_repo, _workspace, payload: { id: string }) => {
      repository.deleteContact(payload.id)
      return { ok: true }
    },
    'db:contacts:prune': () => repository.pruneNoisyContacts(isUsableEmail),
    'db:social:list': (_repo, _workspace, payload: { leadIds?: string[] } = {}) =>
      repository.listSocialProfiles(workspace.id, payload.leadIds),
    'db:social:upsert': (_repo, _workspace, payload: { leadId: string; platform: string; handle?: string; profileUrl?: string; followers?: number | null; verified?: boolean; source?: string }) =>
      repository.upsertSocialProfile({ ...payload, workspaceId: workspace.id }),
    'db:social:update': (_repo, _workspace, payload: { id: string; patch: { handle?: string; profileUrl?: string; followers?: number | null; verified?: boolean } }) => {
      repository.updateSocialProfile(payload.id, payload.patch)
      return { ok: true }
    },
    'db:social:delete': (_repo, _workspace, payload: { id: string }) => {
      repository.deleteSocialProfile(payload.id)
      return { ok: true }
    },

    'db:people:list': (_repo, _workspace, payload: { leadIds?: string[] } = {}) =>
      repository.listDecisionMakers(workspace.id, payload.leadIds),
    'db:people:ledger': () => repository.decisionMakerLedger(workspace.id),
    'db:people:funnel': () => repository.decisionMakerFunnel(workspace.id),
    'db:people:candidates': (_repo, _workspace, payload: { includeDismissed?: boolean } = {}) =>
      repository.listCandidates(workspace.id, payload.includeDismissed),
    'db:people:candidateTotals': () => repository.candidateTotals(workspace.id),
    'db:people:buildSuggestions': () => repository.buildSuggestions(workspace.id),
    'db:people:confirm': (_repo, _workspace, payload: { id: string }) => repository.confirmCandidate(workspace.id, payload.id),
    'db:people:dismiss': (_repo, _workspace, payload: { id: string }) => repository.dismissCandidate(workspace.id, payload.id),
    'db:people:restore': (_repo, _workspace, payload: { id: string }) => repository.restoreCandidate(workspace.id, payload.id),
    'db:people:add': (_repo, _workspace, payload: { leadId: string; fullName: string; title?: string; email?: string; phone?: string; linkedinUrl?: string }) =>
      repository.addDecisionMaker({ ...payload, workspaceId: workspace.id }),
    'db:people:delete': (_repo, _workspace, payload: { id: string }) => {
      repository.deleteDecisionMaker(payload.id)
      return { ok: true }
    },

    'db:lists:list': () => repository.listLists(workspace.id),
    'db:lists:create': (_repo, _workspace, payload: { name: string }) => repository.createList(workspace.id, payload.name),
    'db:lists:delete': (_repo, _workspace, payload: { id: string }) => {
      repository.deleteList(payload.id)
      return { ok: true }
    },
    'db:lists:add': (_repo, _workspace, payload: { listId: string; leadIds: string[] }) =>
      repository.addLeadsToList(payload.listId, payload.leadIds),
    'db:lists:remove': (_repo, _workspace, payload: { listId: string; leadId: string }) => {
      repository.removeLeadFromList(payload.listId, payload.leadId)
      return { ok: true }
    },
    'db:lists:members': (_repo, _workspace, payload: { listId: string }) => repository.listMembers(payload.listId),

    'db:jobs:queue': (_repo, _workspace, payload: { kind: 'email' | 'phone' | 'social' | 'decision-maker' | 'website'; leadIds: string[] }) =>
      repository.queueJob(workspace.id, payload.kind, payload.leadIds),
    'db:jobs:cancel': (_repo, _workspace, payload: { jobId: string }) => {
      repository.cancelJob(payload.jobId)
      return { cancelled: true }
    },
    'db:jobs:totals': () => repository.jobTotals(workspace.id),
    'db:jobs:status': (_repo, _workspace, payload: { jobId: string }) => repository.jobStatus(workspace.id, payload.jobId),
    'db:jobs:usage': () => repository.lookupUsage(workspace.id),
    'db:jobs:covered': (_repo, _workspace, payload: { kind: string; statuses: string[] }) =>
      Array.from(repository.coveredLeads(workspace.id, payload.kind, payload.statuses)),

    'db:imports:list': (_repo, _workspace, payload: { limit?: number } = {}) => repository.listImports(workspace.id, Math.min(5000, Math.max(1, payload.limit ?? 20))),
    'db:imports:ledger': () => repository.importLedger(workspace.id),
    // What has been searched on a page, so the search box can offer it back. Keeping it in the
    // database rather than the window is what makes it survive a restart.
    'db:search:history': (_repo, _workspace, payload: { scope?: string; limit?: number }) =>
      repository.listSearchHistory(workspace.id, payload?.scope ?? 'social', payload?.limit ?? 8),
    'db:search:record': (_repo, _workspace, payload: { scope?: string; term: string; results?: number | null }) => {
      repository.saveSearchTerm(workspace.id, payload?.term ?? '', payload?.scope ?? 'social', payload?.results ?? null)
      return { saved: true }
    },

    // The history panel: the log it lists, the count its badge shows, and clearing it.
    'db:activity:list': (_repo, _workspace, payload: { scope?: string; only?: 'all' | 'searches' | 'activity'; limit?: number }) =>
      repository.listActivity(workspace.id, payload ?? {}),
    'db:activity:count': (_repo, _workspace, payload: { scope?: string }) =>
      repository.countActivity(workspace.id, payload?.scope ?? 'social'),
    'db:activity:log': (_repo, _workspace, payload: { kind: 'search' | 'import' | 'refresh' | 'action'; title?: string; detail?: string; items?: string[]; hits?: number | null; runTerm?: string; scope?: string }) => {
      repository.logActivity(workspace.id, payload)
      return { logged: true }
    },
    'db:activity:clear': (_repo, _workspace, payload: { scope?: string }) => {
      repository.clearActivity(workspace.id, payload?.scope ?? 'social')
      return { cleared: true }
    },
    // The import box's live preview: what each pasted line would become, before anything is written.
    'db:imports:preview': (_repo, _workspace, payload: { input: string[] | string; platform?: string }) => {
      const lines = Array.isArray(payload.input) ? payload.input : String(payload.input ?? '').split(/\r?\n/)
      return repository.previewSocialImport(workspace.id, lines, payload.platform ?? '')
    },
    'db:imports:websites': (_repo, _workspace, payload: { input: string[] | string }) => {
      const lines = Array.isArray(payload.input) ? payload.input : String(payload.input ?? '').split(/\r?\n/)
      const result = repository.importWebsites(workspace.id, lines)
      // A fresh import is exactly the work the enrichment worker exists for.
      void onImported?.(result.leadIds)
      return result
    },
    // Social profiles arrive already found: the paste is the profile, so nothing is crawled and no
    // enrichment is queued. Each URL is attached to the lead it names.
    'db:imports:social': (_repo, _workspace, payload: { input: string[] | string; platform?: string }) => {
      const lines = Array.isArray(payload.input) ? payload.input : String(payload.input ?? '').split(/\r?\n/)
      return repository.importSocialProfiles(workspace.id, lines, payload.platform ?? '')
    },
    'db:exports:list': () => repository.listExports(workspace.id),    'db:exports:record': (_repo, _workspace, payload: { kind: string; scope: string; rowCount: number; columns: string[]; fileName: string; path: string }) =>
      repository.recordExport({ ...payload, workspaceId: workspace.id }),
    // The only handler that reaches the file system, so it is the only one that needs the window
    // its save dialog should hang off.
    'db:exports:write': (repo, current, payload: { kind: 'leads' | 'runs' | 'invoices' | 'profiles'; limit: number; delimiter: string; columns: string[]; fileName: string; format?: 'csv' | 'xlsx' | 'pdf'; leadIds?: string[]; leadFilter?: 'all' | 'phone' | 'email' | 'social' | 'missing'; search?: string; runId?: string }, event) =>
      writeExport(BrowserWindow.fromWebContents(event.sender), repo, current, payload),

    'db:coverage:email': () => ({ totals: repository.emailCoverage(workspace.id), bands: repository.emailConfidence(workspace.id) }),
    'db:coverage:social': () => repository.socialCoverage(workspace.id),
  }

  for (const channel of LOCAL_CHANNELS) {
    ipcMain.handle(channel, async (event, payload: any) => {
      try {
        await authorize?.(channel, payload)
        // Success is the bare value and failure is { error }, which is unambiguous because no
        // handler ever returns an object with only an `error` key.
        return await handlers[channel](repository, workspace.id, payload, event)
      } catch (error) {
        return { error: error instanceof Error ? error.message : String(error) }
      }
    })
  }
}
