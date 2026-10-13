// Turning one big search into several small ones.
//
// Google Maps stops serving results for a search at roughly 120 places, and it decides that
// ceiling, not the caller. A single "physiotherapist in Lahore" therefore tops out no matter how
// the scraper is tuned or how long it waits. Every district of that city has its own ceiling,
// though, so running the same keyword per district multiplies what can be collected without
// touching pacing, volume per request, or anything about how the browser presents itself.
//
// The district lists are curated for the cities this app is pointed at, and read from the location
// the user typed. A city that is not listed still gets usable output: a set of local search
// phrasings that split the same area by wording instead of by district.

/** Districts worth searching individually, keyed by the town they belong to. */
const DISTRICTS: Record<string, string[]> = {
  lahore: [
    'Gulberg', 'DHA', 'Johar Town', 'Model Town', 'Bahria Town', 'Iqbal Town',
    'Cantt', 'Faisal Town', 'Township', 'Wapda Town', 'Garden Town', 'Shadman',
  ],
  karachi: [
    'Clifton', 'DHA', 'Gulshan-e-Iqbal', 'PECHS', 'Bahadurabad', 'North Nazimabad',
    'Korangi', 'Malir', 'Saddar', 'Scheme 33', 'Federal B Area', 'Gulistan-e-Johar',
  ],
  islamabad: [
    'F-6', 'F-7', 'F-8', 'F-10', 'F-11', 'G-9', 'G-10', 'G-11', 'G-13', 'E-11',
    'I-8', 'Blue Area', 'Bahria Town',
  ],
  rawalpindi: ['Saddar', 'Bahria Town', 'Chaklala', 'Satellite Town', 'Gulraiz', 'Adiala Road'],
  faisalabad: ['Peoples Colony', 'Gulberg', 'D Ground', 'Madina Town', 'Jaranwala Road', 'Canal Road'],
  multan: ['Cantt', 'Gulgasht Colony', 'Shah Rukn-e-Alam', 'Bosan Road', 'Model Town'],
  peshawar: ['Hayatabad', 'University Town', 'Saddar', 'Kohat Road', 'Charsadda Road'],
  manchester: [
    'City Centre', 'Salford', 'Didsbury', 'Chorlton', 'Withington', 'Fallowfield',
    'Ancoats', 'Northern Quarter', 'Sale', 'Stockport', 'Prestwich', 'Altrincham',
  ],
  london: [
    'Camden', 'Islington', 'Hackney', 'Croydon', 'Ealing', 'Wandsworth', 'Greenwich',
    'Hammersmith', 'Kensington', 'Shoreditch', 'Clapham', 'Stratford',
  ],
  birmingham: ['Edgbaston', 'Harborne', 'Moseley', 'Solihull', 'Erdington', 'Selly Oak'],
  leeds: ['Headingley', 'Chapel Allerton', 'Roundhay', 'Horsforth', 'Morley', 'Otley'],
  bradford: ['Manningham', 'Great Horton', 'Shipley', 'Keighley', 'Thornton', 'Girlington'],
  glasgow: ['Finnieston', 'Shawlands', 'Partick', 'Dennistoun', 'Govanhill', 'Milngavie'],
  dubai: [
    'Deira', 'Bur Dubai', 'Business Bay', 'Jumeirah', 'Al Barsha', 'Dubai Marina',
    'Downtown', 'Karama', 'Silicon Oasis', 'International City',
  ],
  'abu dhabi': ['Corniche', 'Khalifa City', 'Al Ain', 'Yas Island', 'Reem Island', 'Musaffah'],
  riyadh: ['Olaya', 'Malaz', 'Nasim', 'Sulaimaniyah', 'Al Yasmin', 'Al Rawabi'],
  jeddah: ['Al Balad', 'Corniche', 'Al Hamra', 'Al Safa', 'Obhur', 'Al Rawdah'],
  delhi: ['Saket', 'Dwarka', 'Rohini', 'Karol Bagh', 'Lajpat Nagar', 'Vasant Kunj'],
  mumbai: ['Andheri', 'Bandra', 'Powai', 'Borivali', 'Dadar', 'Thane'],
  bangalore: ['Koramangala', 'Indiranagar', 'Whitefield', 'Jayanagar', 'HSR Layout', 'Marathahalli'],
  'new york': ['Manhattan', 'Brooklyn', 'Queens', 'Bronx', 'Staten Island', 'Harlem'],
}

/** Ways to split a search by wording, for a city with no district list. */
const WORDING_SPLITS = ['city centre', 'north', 'south', 'east', 'west', 'suburbs', 'near me']

function normalise(value: string): string {
  return (value ?? '').toLowerCase().replace(/[^a-z\s-]/g, ' ').replace(/\s+/g, ' ').trim()
}

/**
 * The town inside a location string: "Lahore, Pakistan" and "lahore" both give "lahore".
 */
export function townOf(location: string): string {
  return normalise((location ?? '').split(',')[0] ?? '')
}

/**
 * Search locations that split a city into smaller areas.
 *
 * Returns area names — "Gulberg", "DHA" — that the caller appends to the location field, so the
 * resulting searches read "physiotherapist in Lahore Gulberg". Each one is its own search with its
 * own result ceiling.
 */
export function districtsFor(location: string): { areas: string[]; curated: boolean } {
  const town = townOf(location)
  const curated = DISTRICTS[town]
  if (curated) return { areas: curated, curated: true }
  // An unknown city still splits, by phrasing rather than by district.
  return { areas: WORDING_SPLITS, curated: false }
}

/** The location strings a split would run, given what the user typed. */
export function splitLocations(location: string, limit = 12): string[] {
  const town = (location ?? '').trim() || 'Manchester'
  return districtsFor(location).areas.slice(0, limit).map((area) => `${town} ${area}`)
}
