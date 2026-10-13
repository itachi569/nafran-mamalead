// What the Phone Finder's coverage rings count.
//
// The rings report where the numbers on file came from and what kind of line each one is, which is
// exactly what the phone ledger already works out per row. Reading it here rather than in the page
// keeps the arithmetic beside the data it comes from, and lets the scan recompute the rings from
// the rows it just re-read.
import type { PhoneRow } from '../types/desktop'

export interface PhoneRing {
  name: string
  count: number
}

/**
 * The four counts behind the coverage card.
 *
 * "Reachable" is any row with a number at all, which is the figure the page's own summary calls
 * reachable; the other three are the kinds of line. A lead with no number yet is a lead the next
 * pass can still fill, so it is not counted as covered.
 */
export function phoneRings(rows: PhoneRow[]): PhoneRing[] {
  return [
    { name: 'Reachable', count: rows.filter((row) => row.hasNumber).length },
    { name: 'Reception', count: rows.filter((row) => row.lineType === 'reception').length },
    { name: 'Direct line', count: rows.filter((row) => row.lineType === 'direct').length },
    { name: 'Mobile', count: rows.filter((row) => row.lineType === 'mobile').length },
  ]
}
