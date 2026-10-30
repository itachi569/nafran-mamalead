/** Shared by import previews and storage: canonicalise IDNs before deduplication. */
export function cleanWebsiteUrl(value: string): string {
  try {
    const url = new URL(/^[a-z][a-z\d+.-]*:/i.test(value.trim()) ? value.trim() : `https://${value.trim()}`)
    if (!websiteDomain(url.href)) return ''
    url.hash = ''
    for (const key of [...url.searchParams.keys()]) if (/^utm_|^(?:gclid|fbclid|msclkid|mc_eid)$/i.test(key)) url.searchParams.delete(key)
    return url.href
  } catch { return '' }
}

export function websiteDomain(value: string): string {
  const input = value.trim()
  if (!input || /[\s@]/u.test(input) || input.startsWith('#')) return ''
  try {
    const url = new URL(/^[a-z][a-z\d+.-]*:/i.test(input) ? input : `https://${input}`)
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return ''
    const host = url.hostname.toLowerCase().replace(/^www\./, '').replace(/\.$/, '')
    const labels = host.split('.')
    if (labels.length < 2 || host.length > 253 || labels.some(label => !/^[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?$/.test(label))) return ''
    if (!/^(?:[a-z]{2,}|xn--[a-z\d-]+)$/.test(labels.at(-1)!)) return ''
    return host
  } catch { return '' }
}
