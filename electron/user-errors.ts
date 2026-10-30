/** Errors crossing IPC must be useful to customers, without Electron or browser internals. */
export function userError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error ?? '')
  const message = raw.replace(/^Error invoking remote method '[^']+':\s*/i, '').replace(/^Error:\s*/i, '').trim()
  if (/executable doesn't exist|playwright install|browser.*(?:not installed|missing)|chromium.*not found/i.test(message)) return 'The scan browser is missing. Install the latest MamaLead release, then restart the app and retry the scan.'
  if (/secure storage|keyring|keychain|safestorage|encryption.*unavailable/i.test(message)) return 'Secure storage is unavailable. Unlock your operating system keychain and restart MamaLead. On Linux, enable a Secret Service keyring (GNOME Keyring or KWallet). Your key has not been stored in plain text.'
  if (/already.*(?:device|machine)|bound to|different (?:device|machine)/i.test(message)) return 'This key is already activated on another device. Contact support to request a device transfer.'
  if (/(?:license|licence|trial|activation key).*expired|expired.*(?:license|licence|trial|activation key)/i.test(message)) return 'This license has expired. Open Settings & Billing to review your access.'
  if (/fetch failed|failed to fetch|econnrefused|enotfound|network|socket hang up/i.test(message)) return 'Could not connect to the service. Check your internet connection and retry. If it continues, contact support.'
  if (/timeout|timed out/i.test(message)) return 'The request took too long. Please retry; completed results are saved.'
  return message || 'The action could not finish. Please retry.'
}
