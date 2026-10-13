// The app's data source.
//
// Everything lives in a SQLite file on this machine, owned by the Electron main process and
// reached over the preload bridge. There is no server, no credentials and no network between a
// page and its rows, which is why reads are instant and the app works offline.
//
// Outside Electron — a plain browser tab during development — there is no bridge, so the pages
// fall back to the reference sample rows and stay demonstrable. `isDemoMode` is how a caller
// asks which of the two it is in.
import type { LocalApi } from '../types/desktop'

const bridge: LocalApi | undefined = typeof window === 'undefined' ? undefined : window.desktop?.local

/** True when the local database is reachable, which it is in every packaged run. */
export const isLocalDataAvailable = Boolean(bridge)

/** True when there is no database behind the page, so it should show the reference sample rows. */
export const isDemoMode = !isLocalDataAvailable

let warned = false

/**
 * The local database, or null outside Electron. Callers treat null as "show the sample rows"
 * rather than as an error, so the interface is identical in both modes.
 */
export function localDb(): LocalApi | null {
  if (bridge) return bridge
  if (!warned && typeof window !== 'undefined') {
    warned = true
    console.info('Local database unavailable — showing the reference sample rows.')
  }
  return null
}

/** The database, or a thrown error. Use where a page cannot function without it. */
export function requireLocalDb(): LocalApi {
  const db = localDb()
  if (!db) throw new Error('The local database is not available in this window.')
  return db
}
