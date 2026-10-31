import { closeSync, cpSync, existsSync, lstatSync, mkdirSync, openSync, readdirSync, renameSync, rmdirSync, rmSync, writeFileSync } from 'node:fs'
import { basename, join, relative, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'

const marker = '.mamalead-profile.json'
const transient = new Set(['lockfile', 'SingletonLock', 'SingletonCookie', 'SingletonSocket', 'DevToolsActivePort'])

// Called before Chromium/database/secrets are opened, with the legacy Electron
// single-instance lock held. Keep that stable lock location across app upgrades.
export function prepareProfileDirectory(appData: string, current: string, explicitProfile = false): string {
  const legacy = resolve(appData, 'nafran-leads-scraper')
  const target = resolve(appData, 'MamaLead')
  const samePath = (a: string, b: string) => process.platform === 'win32'
    ? resolve(a).toLowerCase() === resolve(b).toLowerCase() : resolve(a) === resolve(b)
  if (explicitProfile || !samePath(current, legacy)) return current
  if (existsSync(target)) {
    // Never merge two profiles or replace an existing customer's database.
    if (existsSync(join(target, marker)) || existsSync(join(target, 'leads.db'))) return target
    if (readdirSync(target).length) throw new Error('The MamaLead folder already contains an unrecognised profile.')
    rmdirSync(target) // Only an empty, direct child; never remove existing customer files.
  }
  const staging = resolve(appData, `MamaLead.migrating-${randomUUID()}`)
  // Both copy and final rename remain direct children of the OS application-data directory.
  if (relative(resolve(appData), staging).includes('..') || relative(resolve(appData), target) !== 'MamaLead') throw new Error('Invalid profile migration path.')
  mkdirSync(staging)
  try {
  if (existsSync(legacy)) {
    cpSync(legacy, staging, { recursive: true, force: false, errorOnExist: true, preserveTimestamps: true,
      filter: source => {
        const entry = basename(source)
        const nested = relative(legacy, source)
        if (transient.has(entry)) {
          // A separately opened Google browser must finish before its profile is copied.
          if (entry === 'lockfile' && nested !== 'lockfile' && existsSync(source)) closeSync(openSync(source, 'r+'))
          if (entry === 'SingletonLock' && lstatSync(source).isSymbolicLink()) throw new Error('Close the MamaLead Google browser before migrating its profile.')
          return false
        }
        if (lstatSync(source).isSymbolicLink()) throw new Error('A linked profile folder needs to be migrated manually.')
        return true
      },
    })
  }
  writeFileSync(join(staging, marker), JSON.stringify({ version: 1, migratedAt: new Date().toISOString() }) + '\n')
  // Publish only a complete copy, including SQLite WAL, Local State, encrypted
  // licences, Google sign-in, localStorage and preferences. Retain the old backup.
  renameSync(staging, target)
  return target
  } catch (error) {
    // This exact, validated staging directory was created by this invocation.
    try { rmSync(staging, { recursive: true, force: true }) } catch { /* Keep the original error and source profile. */ }
    throw error
  }
}
