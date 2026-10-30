import { websiteDomain } from '../../electron/website-domain'
const PROFILE_HOSTS = ['instagram.com', 'facebook.com', 'fb.com', 'linkedin.com', 'tiktok.com', 'youtube.com', 'youtu.be', 'twitter.com', 'x.com']
export const WEBSITE_IMPORT_LIMIT = 500
export function pendingImport(view: string): string { try { return localStorage.getItem(`mamalead.import.remaining.${view}`) || '' } catch { return '' } }
export function savePendingImport(view: string, lines: string[]): void {
  const key = `mamalead.import.remaining.${view}`
  if (lines.length) localStorage.setItem(key, lines.join('\n'))
  else localStorage.removeItem(key)
}

export function isProfileLine(line: string): boolean {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#')) return false
  if (trimmed.startsWith('@')) return true
  if (!/[/.]/.test(trimmed)) return false
  try {
    const host = new URL(/^[a-z]+:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`).hostname.replace(/^www\./i, '').toLowerCase()
    return PROFILE_HOSTS.some(known => host === known || host.endsWith(`.${known}`))
  } catch { return false }
}

export function pastedLines(text: string): string[] {
  return text.split(/\r?\n/).map(line => line.trim()).filter(line => line && !line.startsWith('#'))
}

export type ImportPreviewRow = { value: string; status: 'Ready' | 'Duplicate' | 'Skipped' }

/** Preview and scan dispatch share these exact normalization and deduplication rules. */
function previewLines(lines: string[]) {
  const sites: string[] = [], profiles: string[] = [], rows: ImportPreviewRow[] = []
  const seen = new Set<string>()
  let duplicates = 0, invalid = 0
  for (const line of lines) {
    const profile = isProfileLine(line)
    const host = websiteDomain(line)
    const key = profile ? `profile:${line}` : `site:${host}`
    if (!profile && !host) {
      invalid++
      rows.push({ value: line, status: 'Skipped' })
    } else if (seen.has(key)) {
      duplicates++
      rows.push({ value: line, status: 'Duplicate' })
    } else {
      seen.add(key)
      if (profile) profiles.push(line)
      else sites.push(`https://${host}`)
      rows.push({ value: line, status: 'Ready' })
    }
  }
  return { sites, profiles, rows, duplicates, invalid, skipped: duplicates + invalid }
}

export function importPreview(text: string) { return previewLines(pastedLines(text)) }

/** CSV quoting, escaped quotes and quoted line breaks are retained when detecting columns. */
function csvRows(text: string): string[][] {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? ''
  const delimiter = firstLine.includes('\t') ? '\t' : firstLine.includes(';') ? ';' : ','
  const rows: string[][] = []
  let row: string[] = [], cell = '', quoted = false
  for (let index = 0; index < text.length; index++) {
    const char = text[index], next = text[index + 1]
    if (char === '"') {
      if (quoted && next === '"') { cell += '"'; index++ }
      else quoted = !quoted
    } else if (char === delimiter && !quoted) {
      row.push(cell.trim()); cell = ''
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') index++
      row.push(cell.trim())
      if (row.some(Boolean)) rows.push(row)
      row = []; cell = ''
    } else cell += char
  }
  row.push(cell.trim())
  if (row.some(Boolean)) rows.push(row)
  return rows
}

function looksLikeWebsite(value: string): boolean { return Boolean(websiteDomain(value)) }

function columnLetter(column: number): string {
  let label = ''
  for (let n = column + 1; n > 0; n = Math.floor((n - 1) / 26)) label = String.fromCharCode(65 + (n - 1) % 26) + label
  return label
}

/** Prefer the website/domain column over other URLs, including a social profile column. */
export function websiteListFromCsv(text: string, selectedColumn?: number) {
  if (/[\u0000-\u0008\u000e-\u001f]/u.test(text.slice(0,4096)) || /^PK\u0003\u0004/.test(text)) throw new Error('This file is not a text CSV/TSV.')
  const rows = csvRows(text.replace(/^\uFEFF/, ''))
  if (!rows.length) throw new Error('This file is empty.')
  // Our own Excel exports have branding above the actual column headings.
  const headerRow = rows.findIndex((row,index) => index < 30 && row.some(cell => /^(?:(?:company|business)[ _-])?(?:website|domain|site|url)(?:[ _-](?:url|address))?$/i.test(cell.trim())))
  const first = headerRow >= 0 ? headerRow : 0
  const labels = rows[first].map(value => value.trim().toLowerCase().replace(/[_-]+/g, ' '))
  const websiteHeader = labels.findIndex(value => /^(?:(?:company|business) )?(?:website|domain|site)(?: (?:url|address))?$/.test(value))
  const header = websiteHeader >= 0 ? websiteHeader : labels.findIndex(value => /^(?:url|web address|website link)$/.test(value))
  let column = header >= 0 ? header : 0
  if (header < 0) {
    let bestScore = 0
    const width = rows.reduce((max, row) => Math.max(max, row.length), 0)
    for (let candidate = 0; candidate < width; candidate++) {
      const score = rows.filter(row => looksLikeWebsite(row[candidate] ?? '')).length
      if (score > bestScore) { column = candidate; bestScore = score }
    }
  }
  // Keep duplicates and invalid cells for the preview; only importPreview's accepted lines scan.
  const hasHeader = header >= 0 || (!rows[first].some(looksLikeWebsite) && rows.length > 1 && rows[first].length > 1)
  if (selectedColumn !== undefined && Number.isInteger(selectedColumn) && selectedColumn >= 0 && selectedColumn < rows[first].length) column = selectedColumn
  const values = rows.slice(hasHeader ? first + 1 : first).map(row => (row[column] ?? '').trim())
  const preview = previewLines(values)
  const columns = rows[first].map((label,index) => ({index,label:hasHeader ? label : `Column ${columnLetter(index)}`}))
  return { text: values.join('\n'), column: columnLetter(column), columnIndex:column, label: hasHeader ? rows[first][column] : 'website', rowCount: values.length, preview, columns,
    error: preview.sites.length + preview.profiles.length ? '' : `No website or domain column found. Columns found: ${columns.map(c=>c.label).join(', ')}. Choose a column or upload a list containing website URLs.` }
}
