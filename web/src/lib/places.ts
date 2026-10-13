// The Places API (New) client.
//
// One Text Search call returns everything a lead needs — name, address, phone, website, rating and
// coordinates — so there is no second Place Details call and no second bill. That is deliberate:
// Text Search is billed per request, and Place Details is billed per request *again*, which is the
// usual way a lead-generation bill gets away from you.
//
// Requesting `places.nationalPhoneNumber` and `places.websiteUri` puts the request in the
// Enterprise SKU rather than Pro. Those two fields are the whole point of a lead list, so the
// tier is unavoidable — but it is the reason a field mask must never be widened casually. Every
// field below is stored and shown; nothing is requested "just in case".

const ENDPOINT = 'https://places.googleapis.com/v1/places:searchText'
const DETAILS_ENDPOINT = 'https://places.googleapis.com/v1/places'

/**
 * Exactly the fields this app stores.
 *
 * `places.id` and `places.location` are included because they are needed to identify and place a
 * result, and neither moves the request into a higher tier on its own.
 */
export const FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.addressComponents',
  'places.nationalPhoneNumber',
  'places.internationalPhoneNumber',
  'places.websiteUri',
  'places.rating',
  'places.userRatingCount',
  'places.primaryTypeDisplayName',
  'places.location',
  'places.googleMapsUri',
  'places.businessStatus',
  'nextPageToken',
].join(',')

/** One address component as Google labels it. */
interface AddressComponent {
  longText?: string
  shortText?: string
  types?: string[]
}

/** The shape the Places API returns for the fields above. Everything is optional: Google omits
 *  what a place does not have, so a missing phone is normal rather than an error. */
interface PlacesResponse {
  places?: {
    id?: string
    displayName?: { text?: string }
    formattedAddress?: string
    addressComponents?: AddressComponent[]
    nationalPhoneNumber?: string
    internationalPhoneNumber?: string
    websiteUri?: string
    rating?: number
    userRatingCount?: number
    primaryTypeDisplayName?: { text?: string }
    location?: { latitude?: number; longitude?: number }
    googleMapsUri?: string
    businessStatus?: string
  }[]
  nextPageToken?: string
  error?: { message?: string; status?: string }
}

/** A business, in the shape the rest of the app uses. */
export interface Lead {
  id: string
  name: string
  category: string
  address: string
  town: string
  postcode: string
  phone: string
  website: string
  rating: number | null
  reviewCount: number | null
  latitude: number | null
  longitude: number | null
  mapsUrl: string
  status: string
}

export class PlacesError extends Error {
  // An explicit field rather than a constructor parameter property: Node's strip-only TypeScript
  // mode cannot erase those, and the tests import this module directly.
  readonly kind: 'config' | 'request' | 'quota' | 'denied'

  constructor(message: string, kind: 'config' | 'request' | 'quota' | 'denied') {
    super(message)
    this.name = 'PlacesError'
    this.kind = kind
  }
}

/** The town and postcode inside an address, from the structured components rather than by guessing
 *  at the formatted string — Google already labels which part is which. */
function townAndPostcode(place: NonNullable<PlacesResponse['places']>[number]): {
  town: string
  postcode: string
} {
  const list = place.addressComponents ?? []
  const find = (...types: string[]) =>
    list.find((component) => (component.types ?? []).some((type) => types.includes(type)))
  // `locality` is the town proper; `postal_town` is the British equivalent, and
  // `administrative_area_level_2` is the fallback for a place with neither (common in Pakistan).
  const town = find('locality', 'postal_town', 'administrative_area_level_2')
  const postcode = find('postal_code')
  return {
    town: town?.longText?.trim() ?? '',
    postcode: (postcode?.longText ?? postcode?.shortText ?? '').trim(),
  }
}

/**
 * Turns one API result into a Lead.
 *
 * Exported so it can be tested without a network call: this mapping is where a field rename on
 * Google's side would silently empty a column, and that is worth a test rather than a discovery
 * three weeks later.
 */
export function toLead(place: NonNullable<PlacesResponse['places']>[number]): Lead {
  const { town, postcode } = townAndPostcode(place)
  return {
    id: place.id ?? '',
    name: place.displayName?.text?.trim() ?? '',
    category: place.primaryTypeDisplayName?.text?.trim() ?? '',
    address: place.formattedAddress?.trim() ?? '',
    town,
    postcode,
    // International form is what a dialler needs, and it is already being paid for.
    phone: (place.internationalPhoneNumber ?? place.nationalPhoneNumber ?? '').trim(),
    website: place.websiteUri?.trim() ?? '',
    rating: typeof place.rating === 'number' ? place.rating : null,
    reviewCount: typeof place.userRatingCount === 'number' ? place.userRatingCount : null,
    latitude: typeof place.location?.latitude === 'number' ? place.location.latitude : null,
    longitude: typeof place.location?.longitude === 'number' ? place.location.longitude : null,
    mapsUrl: place.googleMapsUri?.trim() ?? '',
    status: place.businessStatus ?? '',
  }
}

export interface SearchOptions {
  /** What to look for, e.g. "physiotherapist". */
  keyword: string
  /** Where, e.g. "Lahore". */
  location: string
  /** How many results to ask for. The API caps a page at 20. */
  limit?: number
  /** Restrict to a country, so a search for a town name does not match a same-named one abroad. */
  regionCode?: string
}

export interface SearchResult {
  leads: Lead[]
  /** True when Google had more results than were returned, so the UI can say so. */
  truncated: boolean
}

/** The page size Google accepts. Anything larger is rejected. */
const MAX_PAGE_SIZE = 20

/**
 * Runs one Text Search.
 *
 * Throws `PlacesError` with a kind the route turns into a status code, so a missing key reads as a
 * setup problem and a quota problem reads as a quota problem rather than both arriving as "500".
 */
export async function searchPlaces(options: SearchOptions, apiKey: string): Promise<SearchResult> {
  if (!apiKey) {
    throw new PlacesError(
      'No Places API key is configured. Copy .env.example to .env.local and set GOOGLE_MAPS_API_KEY.',
      'config',
    )
  }
  const keyword = options.keyword.trim()
  const location = options.location.trim()
  if (!keyword) throw new PlacesError('A keyword is required.', 'request')

  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, options.limit ?? MAX_PAGE_SIZE))
  const body: Record<string, unknown> = {
    textQuery: location ? `${keyword} in ${location}` : keyword,
    pageSize,
    // English names keep the columns consistent whichever country is searched.
    languageCode: 'en',
  }
  if (options.regionCode) body.regionCode = options.regionCode

  let response: Response
  try {
    response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': FIELD_MASK,
      },
      body: JSON.stringify(body),
      // A search is not worth caching for long, but it must not hang a request either.
      signal: AbortSignal.timeout(15_000),
    })
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    throw new PlacesError(`Could not reach the Places API: ${reason}`, 'request')
  }

  const payload = (await response.json().catch(() => ({}))) as PlacesResponse

  if (!response.ok) {
    const message = payload.error?.message ?? `The Places API returned ${response.status}.`
    if (response.status === 429) throw new PlacesError(`Rate limited by the Places API. ${message}`, 'quota')
    if (response.status === 403) {
      throw new PlacesError(
        `The Places API refused the key. Check that Places API (New) is enabled and the key is not restricted away from it. ${message}`,
        'denied',
      )
    }
    throw new PlacesError(message, 'request')
  }

  const leads = (payload.places ?? []).map(toLead).filter((lead) => lead.name)
  return { leads, truncated: Boolean(payload.nextPageToken) }
}

/** US$ per 1,000 requests for the SKU this field mask bills at (Text Search Enterprise). */
export const PRICE_PER_THOUSAND_USD = 35

/** What one search of `count` results costs, for the estimate shown next to the button. */
export function estimateCost(searches: number): number {
  return (searches / 1000) * PRICE_PER_THOUSAND_USD
}
