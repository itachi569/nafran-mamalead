/** Evidence must come from a business name/category, never its address. */
export interface MapsBusiness { name: string; category?: string; lines?: string[] }
export function mapsHasNoResults(text: string): boolean {
  return /Google Maps (?:can't|cannot|couldn't) find|no results (?:found|for)|no matching (?:places|results)|کوئی نتیجہ نہیں|کوئی نتائج نہیں/i.test(text)
}
function words(value: string): string[] {
  return (value.toLowerCase().normalize('NFKD').replace(/\p{M}/gu, '').match(/[\p{L}\p{N}]+/gu) ?? []).map(word =>
    word.endsWith('ies') && word.length > 4 ? word.slice(0, -3) + 'y'
      : word.length > 3 && /s$/.test(word) && !/(ss|us|is)$/.test(word) ? word.slice(0, -1) : word)
}

function contains(haystack: string[], needle: string[]): boolean {
  return needle.length > 0 && haystack.some((_, at) => needle.every((word, index) => haystack[at + index] === word))
}

// Narrow category equivalents, not loosely related industries. IT support, computer shops,
// training centres and marketing agencies are not automatically treated as software houses.
const categoryGroups = [
  ['software house', 'software company', 'software development company', 'software development', 'software developer', 'software firm', 'سافٹ ویئر ہاؤس', 'سافٹ ویئر کمپنی'],
  ['dentist', 'dental clinic', 'dental practice', 'dental surgeon', 'ڈینٹسٹ', 'دانتوں کا ڈاکٹر'],
  ['orthodontist', 'orthodontic clinic'],
  ['lawyer', 'attorney', 'law firm', 'legal practice', 'وکیل'],
  ['physiotherapist', 'physiotherapy', 'physical therapist', 'physical therapy', 'فزیوتھراپسٹ'],
  ['dermatologist', 'skin care doctor', 'skin specialist', 'dermatology clinic'],
  ['doctor', 'physician', 'medical clinic', 'ڈاکٹر'],
  ['plumber', 'plumbing', 'پلمبر'],
  ['electrician', 'electrical installation service'],
  ['accountant', 'accounting firm', 'accounting service'],
  ['real estate agent', 'real estate agency', 'estate agent', 'property dealer'],
  ['car repair', 'auto repair', 'auto mechanic', 'car mechanic'],
  ['restaurant', 'ریسٹورنٹ'],
  ['cafe', 'coffee shop', 'coffeehouse'],
  ['hotel', 'ہوٹل'],
  ['pharmacy', 'drugstore', 'فارمیسی'],
  ['hospital', 'ہسپتال'],
  ['school', 'اسکول'],
  ['gym', 'fitness centre', 'fitness center'],
  ['beauty salon', 'beauty parlour', 'beauty parlor'],
  ['hair salon', 'hairdresser'],
  ['barber', 'barber shop', 'barbershop'],
  ['digital marketing agency', 'internet marketing service'],
  ['web designer', 'web design', 'website designer', 'website design'],
].map(group => group.map(words))

const queryNoise = new Set(['best', 'top', 'the', 'and', 'of', 'a', 'an', 'for', 'near', 'me', 'in'])
const genericCategories = new Set(['business', 'company', 'establishment', 'point of interest'])

/** Feed fallback for the no-details CLI path. Only the category before · is trusted. */
export function mapsCardCategory(lines: string[] = []): string {
  for (const line of lines) {
    const category = line.split('·')[0].trim()
    const standaloneCategory = categoryGroups.some(group => group.some(phrase => phrase.join(' ') === words(category).join(' ')))
    if ((line.includes('·') || standaloneCategory) && category && /\p{L}/u.test(category) && !/[\d,★]/u.test(category)
      && !/^(?:open|closed|closes|opens|no reviews|sponsored)\b/i.test(category)) return category
  }
  return ''
}

/** Every meaningful part of the requested keyword must match this individual business. */
export function mapsBusinessRelevant(keyword: string, location: string, row: MapsBusiness): boolean {
  let query = words(keyword)
  // Remove a trailing location phrase, not isolated words (e.g. York in a company name).
  const place = words(location)
  if (place.length && query.length > place.length && contains(query.slice(-place.length), place)) query = query.slice(0, -place.length)
  query = query.filter(word => !queryNoise.has(word))
  if (!query.length) return false
  const name = words(row.name)
  const category = words(row.category || mapsCardCategory(row.lines))
  const hasCategory = category.length > 0 && !genericCategories.has(category.join(' '))
  for (let at = 0; at < query.length;) {
    let longest: { size: number; alternatives: string[][] } | undefined
    for (const alternatives of categoryGroups) for (const phrase of alternatives) {
      if (phrase.every((word, index) => query[at + index] === word) && (!longest || phrase.length > longest.size)) {
        longest = { size: phrase.length, alternatives }
      }
    }
    if (longest) {
      // A contradictory published category must not be overridden by a keyword in the name.
      if (!longest.alternatives.some(phrase => contains(hasCategory ? category : name, phrase))) return false
      // Learning/selling a service is not providing that service (plumbing supply stores,
      // software development institutes, etc.), unless the user explicitly asked for it.
      if (hasCategory && ['store', 'supplier', 'supply', 'training', 'school', 'institute', 'college', 'course', 'museum']
        .some(word => category.includes(word) && !query.includes(word))) return false
      at += longest.size
    } else {
      // Word boundaries prevent bar matching barber, or IT matching fitness.
      if (!name.includes(query[at]) && !category.includes(query[at])) return false
      at++
    }
  }
  return true
}

export function mapsResultsRelevant(keyword: string, location: string, rows: MapsBusiness[]): boolean {
  return rows.some(row => mapsBusinessRelevant(keyword, location, row))
}
