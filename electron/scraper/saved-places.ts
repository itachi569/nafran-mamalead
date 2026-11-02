/** A per-run snapshot of saved businesses. A shared website/name alone is not a place identity. */
export interface SavedMapsPlace { name?: string; address?: string; placeRef?: string; mapsUrl?: string }

const normalized = (value: string) => value.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()

export function mapsPlaceIdentity(value: string): string {
  let text = value
  try { text = decodeURIComponent(value) } catch { /* An unescaped Maps URL still works. */ }
  const ftid = text.match(/(?:!1s|^)(0x[0-9a-f]+):(0x[0-9a-f]+)/i)
  if (ftid) return `cid:${BigInt(ftid[2]).toString()}`
  const cid = text.match(/(?:[?&](?:cid|ludocid)=|^cid:)(\d+)/i)
  if (cid) return `cid:${cid[1]}`
  const placeId = text.match(/(?:!1s|[?&](?:query_place_id|place_id)=)(ChI[A-Za-z0-9_-]+)/)
  return placeId ? `pid:${placeId[1]}` : ''
}

export class SavedMapsPlaces {
  private readonly identities = new Set<string>()
  private readonly addresses = new Set<string>()
  readonly size: number
  constructor(rows: SavedMapsPlace[] = []) {
    this.size = rows.length
    for (const row of rows) {
      for (const value of [row.placeRef, row.mapsUrl]) {
        if (!value) continue
        const identity = mapsPlaceIdentity(value)
        // Non-URL provider references are also stable, but never use a bare Maps name URL.
        if (identity) this.identities.add(identity)
        else if (value === row.placeRef) this.identities.add(`ref:${value}`)
      }
      if (row.name && row.address) this.addresses.add(`${normalized(row.name)}|${normalized(row.address)}`)
    }
  }
  has(row: SavedMapsPlace): boolean {
    for (const value of [row.placeRef, row.mapsUrl]) {
      if (!value) continue
      const identity = mapsPlaceIdentity(value)
      if (identity && this.identities.has(identity)) return true
      if (value === row.placeRef && this.identities.has(`ref:${value}`)) return true
    }
    return Boolean(row.name && row.address && this.addresses.has(`${normalized(row.name)}|${normalized(row.address)}`))
  }
}
