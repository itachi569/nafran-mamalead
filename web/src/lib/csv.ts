// CSV writing, shared by the download button and the tests.
//
// Escaping is the whole job: an address with a comma in it would otherwise split into two columns,
// and a value with a newline would break the row. Every field is quoted when it needs to be, and
// quotes inside a value are doubled, which is what RFC 4180 asks for and what Excel expects.
import type { Lead } from './places'

/** The columns the export writes, in order. */
export const COLUMNS: { key: keyof Lead; label: string }[] = [
  { key: 'name', label: 'Business name' },
  { key: 'category', label: 'Category' },
  { key: 'address', label: 'Address' },
  { key: 'town', label: 'Town' },
  { key: 'postcode', label: 'Postcode' },
  { key: 'phone', label: 'Phone' },
  { key: 'website', label: 'Website' },
  { key: 'rating', label: 'Rating' },
  { key: 'reviewCount', label: 'Reviews' },
  { key: 'latitude', label: 'Latitude' },
  { key: 'longitude', label: 'Longitude' },
  { key: 'mapsUrl', label: 'Google Maps URL' },
]

function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return ''
  const text = String(value)
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/** One row per lead, with a header line. */
export function toCsv(leads: Lead[], columns = COLUMNS): string {
  const header = columns.map((column) => escapeCell(column.label)).join(',')
  const rows = leads.map((lead) => columns.map((column) => escapeCell(lead[column.key])).join(','))
  // A trailing newline keeps the file well-formed for tools that expect one.
  return [header, ...rows].join('\r\n') + '\r\n'
}

/** A filename that says what it holds and when it was made. */
export function csvFileName(keyword: string, location: string, at = new Date()): string {
  const slug = (value: string) =>
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40)
  const stamp = at.toISOString().slice(0, 16).replace(/[:T]/g, '-')
  return [slug(keyword) || 'leads', slug(location), stamp].filter(Boolean).join('-') + '.csv'
}
