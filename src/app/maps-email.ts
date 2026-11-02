/** Email cells show addresses or email-specific states, never a website-column label. */
export function mapsEmailText(
  row: { found: { value: string }[]; statusLabel: string } | undefined,
  hasWebsite: boolean,
  mapsRunning: boolean,
  loading: boolean,
): string {
  const address = row?.found[0]?.value?.trim()
  if (address) return address
  if (!hasWebsite) return 'No email found'
  if (row?.statusLabel === 'Pending') return 'Finding email…'
  if (row?.statusLabel.startsWith('Failed')) return 'Email scan failed — retry'
  if (row?.statusLabel === 'No email published' || row?.statusLabel === 'No website') return 'No email found'
  if (mapsRunning) return 'Finding email…'
  if (loading) return 'Checking email status…'
  return 'Email not scanned yet'
}
