// Owns the process-wide database handle.
//
// The main process opens the file once and every handler shares it. Keeping the handle here
// rather than in main.ts means the scraper, the repository and any future worker all reach the
// same connection instead of opening their own.
import { app } from 'electron'
import { join } from 'node:path'
import { LocalDatabase } from './local-db'
import { Repository } from './repository'

let database: LocalDatabase | null = null
let repository: Repository | null = null

/** Opens the database, creating it on first launch. Safe to call more than once. */
export function openDatabase(): { db: LocalDatabase; repository: Repository } {
  if (database && repository) return { db: database, repository }
  if (!app.isReady()) throw new Error('The database cannot be opened before the app is ready.')

  // userData is the per-user application folder, so the file survives updates and sits where a
  // desktop app is expected to keep its data.
  const file = join(app.getPath('userData'), 'leads.db')
  database = new LocalDatabase(file)
  repository = new Repository(database)
  repository.repairSocialProfiles()
  repository.collapseBusinessEmails()
  return { db: database, repository }
}

export function getRepository(): Repository {
  if (!repository) throw new Error('The database has not been opened yet.')
  return repository
}

export function getDatabase(): LocalDatabase {
  if (!database) throw new Error('The database has not been opened yet.')
  return database
}

export function closeDatabase(): void {
  database?.close()
  database = null
  repository = null
}
