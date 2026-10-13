// The app's local database: one SQLite file on this machine, opened by the main process.
//
// Electron ships SQLite in its own Node, so this uses `node:sqlite` and needs no native module,
// no rebuild step and no packaging configuration. Queries are synchronous, which is what makes
// the renderer's reads feel instant: there is no server, no network and no connection pool
// between a page and its rows.
//
// The schema lives in schema.sql beside this file and is safe to run on every launch.
import { DatabaseSync } from 'node:sqlite'
import { randomUUID } from 'node:crypto'
import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

export interface Workspace {
  id: string
  name: string
  plan: 'free' | 'pro' | 'studio'
}

export interface UsageRow {
  scrapes_used: number
  scrape_limit: number
  lookups_used: number
  lookup_limit: number
  period: string
}

/** One prepared statement, run many times. */
export interface PreparedStatement {
  run: (...params: unknown[]) => number
  get: <T>(...params: unknown[]) => T | null
  all: <T>(...params: unknown[]) => T[]
}

const SCHEMA_FILE = join(__dirname, 'schema.sql')

/** The current month, matching the period key the usage counters are grouped by. */
export function currentPeriod(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`
}

export function nowIso(): string {
  return new Date().toISOString()
}

export class LocalDatabase {
  private readonly db: DatabaseSync
  /** Where the file lives, for the page that says the store is on this machine. */
  private readonly file: string

  constructor(file: string) {
    this.file = file
    this.db = new DatabaseSync(file)
    this.db.exec('pragma journal_mode = WAL')
    this.db.exec('pragma foreign_keys = ON')
    this.db.exec('pragma busy_timeout = 5000')
    this.db.exec('pragma synchronous = NORMAL')
    this.migrate()
  }

  /**
   * What the window states about the store: the folder it sits in and how large it is.
   *
   * The file's own size is read from the disk, and the page cannot do that for itself — it has no
   * filesystem — so it is measured here. A size that cannot be read is reported as unknown rather
   * than as zero, because zero would say the store is empty when it is only unreadable.
   */
  storeInfo(): { path: string; size: string } {
    let size = 'size unknown'
    try {
      const bytes = statSync(this.file).size
      size = bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`
    } catch {
      // Left as unknown.
    }
    return { path: this.file, size }
  }

  /** Runs the schema, which is written to be safe on an existing database. */
  private migrate(): void {
    this.db.exec(readFileSync(SCHEMA_FILE, 'utf8'))
    this.addMissingColumns()
    this.widenJobKinds()
    this.db.exec('pragma user_version = 1')
  }

  /**
   * Lets `enrichment_jobs` hold a kind added after the table shipped.
   *
   * The column's list of kinds is a CHECK constraint, and SQLite cannot alter one: the table has to
   * be rebuilt. It is rebuilt here with its own definition, its rows copied across and its indexes
   * put back, and only when the constraint does not already allow the kind — so a database that has
   * been through this is left alone on the next launch.
   *
   * The deep pass is why this exists: it is a pass over the same queue as the others, so it is a
   * kind of job, and adding it must not mean dropping the queue a user already has.
   */
  private widenJobKinds(): void {
    const table = this.db
      .prepare("select sql from sqlite_master where type = 'table' and name = 'enrichment_jobs'")
      .get() as { sql?: string } | undefined
    if (!table?.sql || /'deep'/.test(table.sql)) return

    this.db.exec('pragma foreign_keys = OFF')
    this.db.exec(`
      begin;
      create table enrichment_jobs_new (
        id text primary key,
        workspace_id text not null references workspaces(id) on delete cascade,
        kind text not null check (kind in ('email', 'phone', 'social', 'decision-maker', 'website', 'deep')),
        lead_ids text not null default '[]',
        status text not null default 'queued' check (status in ('queued', 'running', 'done', 'failed')),
        found integer not null default 0,
        error text,
        created_at text not null,
        started_at text,
        finished_at text
      );
      insert into enrichment_jobs_new
        select id, workspace_id, kind, lead_ids, status, found, error, created_at, started_at, finished_at
        from enrichment_jobs;
      drop table enrichment_jobs;
      alter table enrichment_jobs_new rename to enrichment_jobs;
      create index if not exists enrichment_jobs_queue_idx on enrichment_jobs (workspace_id, status, created_at);
      commit;
    `)
    this.db.exec('pragma foreign_keys = ON')
  }

  /**
   * Columns added after a table shipped.
   *
   * `create table if not exists` leaves an existing table alone, so a column added to the schema
   * never reaches a database that already has the table. Each entry here is applied only when the
   * column is absent, which keeps upgrading in place safe.
   */
  private addMissingColumns(): void {
    const additions: [table: string, column: string, definition: string][] = [
      ['leads', 'last_scanned_at', 'text'],
      ['lead_contacts', 'validation_status', "text check (validation_status is null or validation_status in ('valid', 'invalid', 'risky', 'unknown'))"],
      ['lead_contacts', 'validation_provider', 'text'],
      ['lead_contacts', 'validation_message', 'text'],
      ['lead_contacts', 'validated_at', 'text'],
    ]
    for (const [table, column, definition] of additions) {
      const columns = this.db.prepare(`pragma table_info(${table})`).all() as { name: string }[]
      if (columns.some((entry) => entry.name === column)) continue
      this.db.exec(`alter table ${table} add column ${column} ${definition}`)
    }
  }

  close(): void {
    this.db.close()
  }

  // ---------------------------------------------------------------- raw helpers

  query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): T[] {
    return this.db.prepare(sql).all(...(params as never[])) as T[]
  }

  one<T = Record<string, unknown>>(sql: string, params: unknown[] = []): T | null {
    const row = this.db.prepare(sql).get(...(params as never[]))
    return (row as T | undefined) ?? null
  }

  run(sql: string, params: unknown[] = []): void {
    this.db.prepare(sql).run(...(params as never[]))
  }

  /**
   * A statement reused across a loop. Preparing once and running many times is what keeps a
   * scrape of a few hundred leads to a single parse per statement.
   */
  prepare(sql: string): PreparedStatement {
    const statement = this.db.prepare(sql)
    return {
      run: (...params: unknown[]) => Number(statement.run(...(params as never[])).changes),
      get: <T>(...params: unknown[]) => (statement.get(...(params as never[])) as T | undefined) ?? null,
      all: <T>(...params: unknown[]) => statement.all(...(params as never[])) as T[],
    }
  }

  transaction<T>(work: () => T): T {
    this.db.exec('begin')
    try {
      const value = work()
      this.db.exec('commit')
      return value
    } catch (error) {
      this.db.exec('rollback')
      throw error
    }
  }

  // ---------------------------------------------------------------- workspace

  /**
   * The desktop app has one local workspace, created on first launch. Returns the existing one
   * if it is there, so this is safe to call on every startup.
   */
  ensureWorkspace(name = 'Nafran Leads'): Workspace {
    const existing = this.one<Workspace>('select id, name, plan from workspaces order by created_at limit 1')
    if (existing) return existing

    const id = randomUUID()
    const at = nowIso()
    this.transaction(() => {
      this.run('insert into workspaces (id, name, owner_id, plan, created_at) values (?, ?, ?, ?, ?)', [
        id,
        name,
        'local',
        'free',
        at,
      ])
      this.run('insert into workspace_members (workspace_id, user_id, role, created_at) values (?, ?, ?, ?)', [
        id,
        'local',
        'owner',
        at,
      ])
      this.run('insert into usage_counters (workspace_id, period) values (?, ?)', [id, currentPeriod()])
    })
    return { id, name, plan: 'free' }
  }

  usage(workspaceId: string): UsageRow {
    const period = currentPeriod()
    const existing = this.one<UsageRow>(
      'select scrapes_used, scrape_limit, lookups_used, lookup_limit, period from usage_counters where workspace_id = ? and period = ?',
      [workspaceId, period],
    )
    if (existing) return existing
    this.run('insert into usage_counters (workspace_id, period) values (?, ?)', [workspaceId, period])
    return { scrapes_used: 0, scrape_limit: 2000, lookups_used: 0, lookup_limit: 2000, period }
  }

  /**
   * Counts one finished run. A single upsert, so two workers finishing together cannot lose an
   * increment the way a read-then-write would.
   */
  incrementScrapeUsage(workspaceId: string, amount = 1): number {
    const period = currentPeriod()
    this.run(
      `insert into usage_counters (workspace_id, period, scrapes_used) values (?, ?, ?)
       on conflict (workspace_id, period) do update set scrapes_used = scrapes_used + excluded.scrapes_used`,
      [workspaceId, period, Math.max(0, amount)],
    )
    return this.usage(workspaceId).scrapes_used
  }

  incrementLookupUsage(workspaceId: string, amount = 1): number {
    const period = currentPeriod()
    this.run(
      `insert into usage_counters (workspace_id, period, lookups_used) values (?, ?, ?)
       on conflict (workspace_id, period) do update set lookups_used = lookups_used + excluded.lookups_used`,
      [workspaceId, period, Math.max(0, amount)],
    )
    return this.usage(workspaceId).lookups_used
  }

  subscription(workspaceId: string): { plan: string; status: string; seats: number; renews_on: string | null } | null {
    return this.one('select plan, status, seats, renews_on from subscriptions where workspace_id = ? limit 1', [workspaceId])
  }
}
