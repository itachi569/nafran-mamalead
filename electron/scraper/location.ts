// Working out which country a search is aimed at, and which part of an address is the town.
//
// Google's Maps search takes `hl` (interface language) and `gl` (country bias) parameters. The
// reference build left those at United Kingdom for every run, so a search for "physiotherapy in
// Lahore" was sent to Google as a UK-region query: rankings, result mix and place cards all came
// back biased towards a country the user was not searching. Both follow the location now.
//
// The same problem ran through address parsing. The original read a UK postcode and, finding
// none, took the last comma-separated part as the area — which is why non-UK leads were stored
// with `area: "Pakistan"` rather than the city they sit in.

/** Country and country-code → the `gl` Google uses, plus the language that pairs with it. */
const COUNTRIES: { match: RegExp; gl: string; hl: string; country: string }[] = [
  { match: /united kingdom|\bengland\b|\bscotland\b|\bwales\b|northern ireland|\buk\b|\bgb\b/i, gl: 'uk', hl: 'en', country: 'United Kingdom' },
  { match: /pakistan|\bpk\b/i, gl: 'pk', hl: 'en', country: 'Pakistan' },
  { match: /india|\bin\b/i, gl: 'in', hl: 'en', country: 'India' },
  { match: /united arab emirates|\buae\b/i, gl: 'ae', hl: 'en', country: 'United Arab Emirates' },
  { match: /saudi arabia|\bksa\b/i, gl: 'sa', hl: 'en', country: 'Saudi Arabia' },
  { match: /bangladesh|\bbd\b/i, gl: 'bd', hl: 'en', country: 'Bangladesh' },
  { match: /united states|\busa\b|\bus\b/i, gl: 'us', hl: 'en', country: 'United States' },
  { match: /canada|\bca\b/i, gl: 'ca', hl: 'en', country: 'Canada' },
  { match: /australia|\bau\b/i, gl: 'au', hl: 'en', country: 'Australia' },
  { match: /ireland|\bie\b/i, gl: 'ie', hl: 'en', country: 'Ireland' },
  { match: /germany|deutschland|\bde\b/i, gl: 'de', hl: 'de', country: 'Germany' },
  { match: /france|\bfr\b/i, gl: 'fr', hl: 'fr', country: 'France' },
  { match: /spain|españa|\bes\b/i, gl: 'es', hl: 'es', country: 'Spain' },
  { match: /italy|italia|\bit\b/i, gl: 'it', hl: 'it', country: 'Italy' },
  { match: /netherlands|holland|\bnl\b/i, gl: 'nl', hl: 'nl', country: 'Netherlands' },
  { match: /turkey|türkiye|\btr\b/i, gl: 'tr', hl: 'tr', country: 'Turkey' },
  { match: /malaysia|\bmy\b/i, gl: 'my', hl: 'en', country: 'Malaysia' },
  { match: /singapore|\bsg\b/i, gl: 'sg', hl: 'en', country: 'Singapore' },
  { match: /south africa|\bza\b/i, gl: 'za', hl: 'en', country: 'South Africa' },
]

/**
 * Cities that settle the country on their own.
 *
 * A location field holds a town as often as it holds a country — "Lahore" and "Karachi" name no
 * country, so matching only against country names left them on the UK default. Recognising the
 * major towns of the markets this app is used in fixes that, and the same list is what lets an
 * address be read for its town instead of guessed at.
 */
const CITIES: { city: string; gl: string; hl: string }[] = [
  // Pakistan
  { city: 'karachi', gl: 'pk', hl: 'en' }, { city: 'lahore', gl: 'pk', hl: 'en' },
  { city: 'faisalabad', gl: 'pk', hl: 'en' }, { city: 'rawalpindi', gl: 'pk', hl: 'en' },
  { city: 'gujranwala', gl: 'pk', hl: 'en' }, { city: 'peshawar', gl: 'pk', hl: 'en' },
  { city: 'multan', gl: 'pk', hl: 'en' }, { city: 'hyderabad', gl: 'pk', hl: 'en' },
  { city: 'islamabad', gl: 'pk', hl: 'en' }, { city: 'quetta', gl: 'pk', hl: 'en' },
  { city: 'bahawalpur', gl: 'pk', hl: 'en' }, { city: 'sargodha', gl: 'pk', hl: 'en' },
  { city: 'sialkot', gl: 'pk', hl: 'en' }, { city: 'sukkur', gl: 'pk', hl: 'en' },
  { city: 'larkana', gl: 'pk', hl: 'en' }, { city: 'okara', gl: 'pk', hl: 'en' },
  { city: 'sahiwal', gl: 'pk', hl: 'en' }, { city: 'jhang', gl: 'pk', hl: 'en' },
  { city: 'sheikhupura', gl: 'pk', hl: 'en' }, { city: 'gujrat', gl: 'pk', hl: 'en' },
  { city: 'kasur', gl: 'pk', hl: 'en' }, { city: 'rahim yar khan', gl: 'pk', hl: 'en' },
  { city: 'mirpur khas', gl: 'pk', hl: 'en' }, { city: 'abbottabad', gl: 'pk', hl: 'en' },
  { city: 'mardan', gl: 'pk', hl: 'en' }, { city: 'mingora', gl: 'pk', hl: 'en' },
  { city: 'nawabshah', gl: 'pk', hl: 'en' }, { city: 'chiniot', gl: 'pk', hl: 'en' },
  // United Kingdom
  { city: 'manchester', gl: 'uk', hl: 'en' }, { city: 'london', gl: 'uk', hl: 'en' },
  { city: 'birmingham', gl: 'uk', hl: 'en' }, { city: 'leeds', gl: 'uk', hl: 'en' },
  { city: 'liverpool', gl: 'uk', hl: 'en' }, { city: 'sheffield', gl: 'uk', hl: 'en' },
  { city: 'bristol', gl: 'uk', hl: 'en' }, { city: 'newcastle', gl: 'uk', hl: 'en' },
  { city: 'nottingham', gl: 'uk', hl: 'en' }, { city: 'leicester', gl: 'uk', hl: 'en' },
  { city: 'glasgow', gl: 'uk', hl: 'en' }, { city: 'edinburgh', gl: 'uk', hl: 'en' },
  { city: 'cardiff', gl: 'uk', hl: 'en' }, { city: 'belfast', gl: 'uk', hl: 'en' },
  { city: 'bradford', gl: 'uk', hl: 'en' }, { city: 'salford', gl: 'uk', hl: 'en' },
  { city: 'bolton', gl: 'uk', hl: 'en' }, { city: 'stockport', gl: 'uk', hl: 'en' },
  { city: 'oldham', gl: 'uk', hl: 'en' }, { city: 'rochdale', gl: 'uk', hl: 'en' },
  // Gulf, South Asia, and the other markets this app is pointed at
  { city: 'dubai', gl: 'ae', hl: 'en' }, { city: 'abu dhabi', gl: 'ae', hl: 'en' },
  { city: 'sharjah', gl: 'ae', hl: 'en' }, { city: 'ajman', gl: 'ae', hl: 'en' },
  { city: 'riyadh', gl: 'sa', hl: 'en' }, { city: 'jeddah', gl: 'sa', hl: 'en' },
  { city: 'mecca', gl: 'sa', hl: 'en' }, { city: 'medina', gl: 'sa', hl: 'en' },
  { city: 'dammam', gl: 'sa', hl: 'en' }, { city: 'doha', gl: 'qa', hl: 'en' },
  { city: 'kuwait city', gl: 'kw', hl: 'en' }, { city: 'muscat', gl: 'om', hl: 'en' },
  { city: 'manama', gl: 'bh', hl: 'en' }, { city: 'delhi', gl: 'in', hl: 'en' },
  { city: 'new delhi', gl: 'in', hl: 'en' }, { city: 'mumbai', gl: 'in', hl: 'en' },
  { city: 'bangalore', gl: 'in', hl: 'en' }, { city: 'bengaluru', gl: 'in', hl: 'en' },
  { city: 'chennai', gl: 'in', hl: 'en' }, { city: 'kolkata', gl: 'in', hl: 'en' },
  { city: 'dhaka', gl: 'bd', hl: 'en' }, { city: 'chittagong', gl: 'bd', hl: 'en' },
  { city: 'kuala lumpur', gl: 'my', hl: 'en' }, { city: 'singapore', gl: 'sg', hl: 'en' },
  { city: 'new york', gl: 'us', hl: 'en' }, { city: 'los angeles', gl: 'us', hl: 'en' },
  { city: 'chicago', gl: 'us', hl: 'en' }, { city: 'houston', gl: 'us', hl: 'en' },
  { city: 'toronto', gl: 'ca', hl: 'en' }, { city: 'vancouver', gl: 'ca', hl: 'en' },
  { city: 'sydney', gl: 'au', hl: 'en' }, { city: 'melbourne', gl: 'au', hl: 'en' },
  { city: 'dublin', gl: 'ie', hl: 'en' }, { city: 'cape town', gl: 'za', hl: 'en' },
  { city: 'johannesburg', gl: 'za', hl: 'en' },
]

/** The city named in a string, when it names one this app knows. */
function cityIn(value: string): { city: string; gl: string; hl: string } | undefined {
  const haystack = ` ${(value ?? '').toLowerCase().replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim()} `
  // Longest name first, so "new delhi" is not read as "delhi".
  return [...CITIES]
    .sort((a, b) => b.city.length - a.city.length)
    .find((entry) => haystack.includes(` ${entry.city} `))
}

/** Countries written at the end of an address, as the names Google returns them. */
const COUNTRY_TAIL =
  /^(united kingdom|uk|england|scotland|wales|northern ireland|pakistan|india|united arab emirates|uae|saudi arabia|bangladesh|united states|usa|canada|australia|ireland|germany|france|spain|italy|netherlands|turkey|türkiye|malaysia|singapore|south africa)$/i

/** A part that is a building, street, landmark or postal code — never the town itself. */
const NOT_A_TOWN =
  /^(no\.?|shop|street|st\.?|road|rd\.?|avenue|ave\.?|block|sector|phase|floor|building|bldg|near|opposite|opp\.?|behind|plot|house|suite|unit|market|plaza|tower|complex|centre|center|mall|chowk|bazar|bazaar)\b/i

/**
 * The town and postcode inside an address.
 *
 * A UK address keeps the postcode route, which is exact. Everywhere else there is no postcode to
 * anchor on, so the country and postal codes are stripped from the tail and the first remaining
 * part that reads like a place name is taken. The scan walks backwards so the most specific
 * locality wins — "Samanabad Town, Lahore, 54000, Pakistan" resolves to Lahore, not the suburb.
 */
export function parseAddress(address: string): { area: string; postcode: string } {
  const raw = (address ?? '').trim()
  if (!raw) return { area: '', postcode: '' }

  const ukPostcode = raw.match(/\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/i)?.[0]?.toUpperCase() ?? ''
  const parts = raw
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)

  if (ukPostcode) {
    const locality = parts.find((part) => part.toUpperCase().includes(ukPostcode))
    if (locality) {
      return { area: locality.replace(new RegExp(ukPostcode, 'i'), '').replace(/[\s,]+$/, '').trim(), postcode: ukPostcode }
    }
  }

  // Drop the country, anything that is only a postal code, and the street-like parts.
  const candidates: string[] = []
  for (const part of parts) {
    if (COUNTRY_TAIL.test(part)) continue
    if (/^\d{4,6}$/.test(part) || /^\d{5}(-\d{4})?$/.test(part)) continue
    if (NOT_A_TOWN.test(part)) continue
    // A part holding both a street and a number is not a town name.
    if (/^\d+\b/.test(part)) continue
    candidates.push(part)
  }

  // A known city is the reliable answer, and the last one named is the one the address belongs
  // to: "Samanabad Town, Lahore, 54000" is Lahore, not the suburb in front of it.
  const known = candidates.filter((part) => cityIn(part))
  if (known.length) return { area: known[known.length - 1], postcode: ukPostcode }

  // An unknown town: the last two parts are the most specific locality and its district, which
  // reads better than a street ever would. Anything left is better than nothing.
  const area = candidates.length > 1 ? candidates[candidates.length - 2] : candidates[0] ?? ''
  const fallback = parts.filter((part) => !COUNTRY_TAIL.test(part)).pop() ?? ''
  return { area: area || fallback, postcode: ukPostcode }
}

/**
 * The search language and country bias for a location string.
 *
 * A named country wins, then a recognised city, then the reference's own defaults.
 */
export function localeFor(location: string): { region: string; language: string } {
  return knownLocale(location) ?? { region: 'uk', language: 'en' }
}

/**
 * The country a string actually names, or null when it names none.
 *
 * `localeFor` always answers something, because a Maps search needs a bias even for a town this
 * file has never heard of. A paid search is different: guessing the United Kingdom for an unknown
 * town would buy the wrong Google. Callers that can afford to fall back themselves use this.
 */
export function knownLocale(location: string): { region: string; language: string } | null {
  const named = COUNTRIES.find((entry) => entry.match.test(location ?? ''))
  if (named) return { region: named.gl, language: named.hl }
  const city = cityIn(location ?? '')
  if (city) return { region: city.gl, language: city.hl }
  return null
}
