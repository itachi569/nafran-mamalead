// Tests for the two pure functions that decide what a lead looks like and what the CSV holds.
//
// These run without a network call or an API key: `toLead` is where a Google field rename would
// silently empty a column, and `toCsv` is where a comma in an address would split a row in two.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { toLead } from '../src/lib/places.ts'
import { csvFileName, toCsv } from '../src/lib/csv.ts'

test('a full place maps every column', () => {
  const lead = toLead({
    id: 'ChIJabc',
    displayName: { text: 'Reactive Physio' },
    formattedAddress: 'Johar Town, Lahore, 54000, Pakistan',
    addressComponents: [
      { longText: 'Lahore', types: ['locality', 'political'] },
      { longText: '54000', shortText: '54000', types: ['postal_code'] },
    ],
    nationalPhoneNumber: '0333 3214226',
    internationalPhoneNumber: '+92 333 3214226',
    websiteUri: 'https://reactivephysio.pk/',
    rating: 4.9,
    userRatingCount: 213,
    primaryTypeDisplayName: { text: 'Physical therapist' },
    location: { latitude: 31.4690629, longitude: 74.3044994 },
    googleMapsUri: 'https://maps.google.com/?cid=123',
    businessStatus: 'OPERATIONAL',
  })

  assert.equal(lead.name, 'Reactive Physio')
  assert.equal(lead.category, 'Physical therapist')
  assert.equal(lead.town, 'Lahore')
  assert.equal(lead.postcode, '54000')
  // The international form is preferred, because it is the one a dialler can use.
  assert.equal(lead.phone, '+92 333 3214226')
  assert.equal(lead.website, 'https://reactivephysio.pk/')
  assert.equal(lead.rating, 4.9)
  assert.equal(lead.reviewCount, 213)
  assert.equal(lead.latitude, 31.4690629)
})

test('a sparse place leaves blanks rather than inventing values', () => {
  const lead = toLead({ id: 'x', displayName: { text: 'Phone Only Clinic' } })
  assert.equal(lead.name, 'Phone Only Clinic')
  assert.equal(lead.phone, '')
  assert.equal(lead.website, '')
  assert.equal(lead.rating, null)
  assert.equal(lead.reviewCount, null)
  assert.equal(lead.latitude, null)
  assert.equal(lead.town, '')
})

test('the town falls back to postal_town and then the wider area', () => {
  const british = toLead({
    displayName: { text: 'Manchester Massage' },
    addressComponents: [
      { longText: 'Manchester', types: ['postal_town'] },
      { longText: 'M4 5JQ', shortText: 'M4 5JQ', types: ['postal_code'] },
    ],
  })
  assert.equal(british.town, 'Manchester')
  assert.equal(british.postcode, 'M4 5JQ')

  // A place with no locality at all — common outside the UK — falls back to the wider area.
  const wider = toLead({
    displayName: { text: 'Okara Clinic' },
    addressComponents: [{ longText: 'Okara District', types: ['administrative_area_level_2'] }],
  })
  assert.equal(wider.town, 'Okara District')
})

test('a national number is used when there is no international one', () => {
  const lead = toLead({ displayName: { text: 'A' }, nationalPhoneNumber: '(0161) 123 4567' })
  assert.equal(lead.phone, '(0161) 123 4567')
})

test('CSV quoting survives commas, quotes and newlines', () => {
  const csv = toCsv([
    {
      id: '1',
      name: 'Smith, Jones & Co',
      category: 'Dentist',
      address: '12 High Street\nManchester',
      town: 'Manchester',
      postcode: 'M1 1AA',
      phone: '',
      website: '',
      rating: null,
      reviewCount: null,
      latitude: null,
      longitude: null,
      mapsUrl: '',
      status: '',
    },
  ])
  const [header, first] = csv.split('\r\n')
  assert.ok(header?.startsWith('Business name,Category,Address'))
  // A comma and a newline both force quoting; the inner quotes in a name would be doubled.
  assert.ok(first?.startsWith('"Smith, Jones & Co",Dentist,"12 High Street'))
})

test('CSV doubles quotes inside a value', () => {
  const csv = toCsv([
    {
      id: '1',
      name: 'The "Old" Bridge Clinic',
      category: '',
      address: '',
      town: '',
      postcode: '',
      phone: '',
      website: '',
      rating: null,
      reviewCount: null,
      latitude: null,
      longitude: null,
      mapsUrl: '',
      status: '',
    },
  ])
  assert.ok(csv.includes('"The ""Old"" Bridge Clinic"'))
})

test('CSV writes a header even with no rows', () => {
  const csv = toCsv([])
  assert.equal(csv.split('\r\n').filter(Boolean).length, 1)
})

test('the filename slugs the search and stamps the time', () => {
  const name = csvFileName('physiotherapist', 'Lahore, Pakistan', new Date('2026-09-16T18:31:00Z'))
  assert.equal(name, 'physiotherapist-lahore-pakistan-2026-09-16-18-31.csv')
})
