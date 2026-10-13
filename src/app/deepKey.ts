// The DataForSEO credential, as the window holds it.
//
// The deep pass searches Google for a business's decision makers, and DataForSEO charges for that
// search, so the app needs an account with them. The key is the user's, it is entered in Settings,
// and it is kept on this machine the way the app's other settings are — in this window's own local
// storage, never in the repository and never sent anywhere except to DataForSEO.
//
// The main process is handed the key for the session and does not write it down, so there is exactly
// one copy of it on disk and it is the user's own.
//
// It is a Base64-encoded `login:password` pair, which is what DataForSEO's dashboard issues and what
// HTTP Basic auth wants in its header. It is not encryption, which is why the field that takes it is
// a password field and why the stored value is never shown back in full.

const KEY_STORAGE = 'nafran.dataforseo.key'

/** The credential as saved, or an empty string when none has been entered. */
export function readDeepKey(): string {
  try {
    return window.localStorage.getItem(KEY_STORAGE)?.trim() ?? ''
  } catch {
    // A window with storage disabled simply has no key: the deep pass says so rather than guessing.
    return ''
  }
}

export function storeDeepKey(value: string): string {
  const trimmed = value.trim()
  try {
    if (trimmed) window.localStorage.setItem(KEY_STORAGE, trimmed)
    else window.localStorage.removeItem(KEY_STORAGE)
  } catch {
    // Nothing to do: the key is still in memory for this session, it just will not survive a restart.
  }
  // The main process is told straight away, so a key entered now is the key the next pass uses.
  void window.desktop?.deep?.key(trimmed)
  return trimmed
}

/**
 * What the Settings row shows: the key's last few characters and whether one is saved at all.
 *
 * A credential on screen is a credential in a screenshot, so the value itself is never rendered —
 * the row says that one is saved and lets the user replace it.
 */
export function describeDeepKey(key: string): string {
  if (!key) return 'Not set'
  return `Saved · ends ${key.slice(-4)}`
}
