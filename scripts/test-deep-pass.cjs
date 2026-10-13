// Exercises the email extractor against the shapes a search snippet arrives in.
//
// The deep pass reads addresses out of Google results, and those snippets are written by other
// people: obfuscated against scrapers, wrapped in HTML entities, spaced out with zero-width
// characters, or broken across Markdown. Every case below is one of those shapes, and the point of
// the suite is that a snippet the extractor cannot read is a snippet with no address in it rather
// than a crash.
//
// Usage: npm run deep:test
const { extractEmails, extractEmailsFromResult, extractPeople, extractPeopleFromResult, collectText } = require('../dist-electron/enrichment/email-extractor.js')

const results = []
function check(name, ok, detail = '') {
  results.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` · ${detail}` : ''}`)
}

const values = (text, limit) => extractEmails(text, limit).map((entry) => entry.value)

// ---- the plain case
check(
  'a plainly written address is read',
  values('Contact us at hello@northernspine.co.uk for appointments.').includes('hello@northernspine.co.uk'),
  values('Contact us at hello@northernspine.co.uk for appointments.').join(', '),
)
check(
  'mixed case is folded down',
  values('Reach Dr.Smith@Clinic.CO.UK today').includes('dr.smith@clinic.co.uk'),
  values('Reach Dr.Smith@Clinic.CO.UK today').join(', '),
)
check(
  'plus addressing survives',
  values('bookings+new@deansgatephysio.co.uk').includes('bookings+new@deansgatephysio.co.uk'),
  values('bookings+new@deansgatephysio.co.uk').join(', '),
)

// ---- the obfuscated case
const obfuscated = [
  ['square brackets', 'write to ruth [at] northernspine [dot] co [dot] uk'],
  ['round brackets', 'write to ruth (at) northernspine (dot) co (dot) uk'],
  ['spaced word', 'write to ruth at northernspine dot co dot uk'],
]
for (const [label, text] of obfuscated) {
  const found = values(text)
  check(`${label} obfuscation is undone`, found.includes('ruth@northernspine.co.uk'), found.join(', ') || '(none)')
}

check(
  'an obfuscated address is marked as such',
  extractEmails('ruth [at] northernspine [dot] co [dot] uk')[0]?.obfuscated === true,
  String(extractEmails('ruth [at] northernspine [dot] co [dot] uk')[0]?.obfuscated),
)
check(
  'a plain address is not marked as obfuscated',
  extractEmails('hello@northernspine.co.uk')[0]?.obfuscated === false,
  String(extractEmails('hello@northernspine.co.uk')[0]?.obfuscated),
)

// ---- entities, wide punctuation and invisible characters
check(
  'HTML entities are decoded',
  values('mail: info&#64;rehablab&#46;uk').includes('info@rehablab.uk'),
  values('mail: info&#64;rehablab&#46;uk').join(', '),
)
check(
  'hex entities are decoded',
  values('mail: info&#x40;rehablab&#x2E;uk').includes('info@rehablab.uk'),
  values('mail: info&#x40;rehablab&#x2E;uk').join(', '),
)
check(
  'a malformed entity does not throw',
  Array.isArray(values('broken &#; and &#x; and &#999999999; but also ok@rehablab.uk')),
  values('broken &#; and &#x; and &#999999999; but also ok@rehablab.uk').join(', '),
)
check(
  'full-width punctuation is folded',
  values('メール： info＠rehablab．uk').includes('info@rehablab.uk'),
  values('メール： info＠rehablab．uk').join(', '),
)
check(
  'zero-width characters are ignored',
  values('info\u200B@rehablab\u200D.uk').includes('info@rehablab.uk'),
  values('info\u200B@rehablab\u200D.uk').join(', '),
)
check(
  'markdown backticks are stripped',
  values('`team@chorltonmovement.com` is the address').includes('team@chorltonmovement.com'),
  values('`team@chorltonmovement.com` is the address').join(', '),
)

// ---- what is not an address
check(
  'a masked address is dropped',
  values('contact ****@northernspine.co.uk for details').length === 0,
  values('contact ****@northernspine.co.uk for details').join(', ') || '(none)',
)
check(
  'a placeholder domain is dropped',
  values('name@example.com and you@yourdomain.com').length === 0,
  values('name@example.com and you@yourdomain.com').join(', ') || '(none)',
)
check(
  'a role mailbox is dropped',
  values('noreply@clinic.co.uk and test@clinic.co.uk').length === 0,
  values('noreply@clinic.co.uk and test@clinic.co.uk').join(', ') || '(none)',
)
check(
  'a bare domain is not an address',
  values('visit northernspine.co.uk or rehablab.uk').length === 0,
  values('visit northernspine.co.uk or rehablab.uk').join(', ') || '(none)',
)
check('nothing in, nothing out', values('').length === 0 && values(null).length === 0)

// ---- repeats and limits
check(
  'the same address twice is offered once',
  values('sales@clinic.co.uk then again sales@clinic.co.uk and info@clinic.co.uk').join(',') ===
    'sales@clinic.co.uk,info@clinic.co.uk',
  values('sales@clinic.co.uk then again sales@clinic.co.uk and info@clinic.co.uk').join(', '),
)
check(
  'the limit is respected',
  values('sales@clinic.co.uk info@clinic.co.uk admin@clinic.co.uk', 2).length === 2,
  values('sales@clinic.co.uk info@clinic.co.uk admin@clinic.co.uk', 2).join(', '),
)
check(
  'each address carries the text it was found in',
  /northernspine/i.test(extractEmails('Ask for Ruth at ruth@northernspine.co.uk, the clinic director.')[0]?.source ?? ''),
  extractEmails('Ask for Ruth at ruth@northernspine.co.uk, the clinic director.')[0]?.source ?? '',
)

// ---- nested results, which is how a SERP actually arrives
const serp = {
  tasks: [
    {
      result: [
        {
          keyword: 'Northern Spine email address',
          items: [
            {
              type: 'organic',
              url: 'https://northernspine.co.uk/team',
              title: 'Northern Spine team',
              snippet: 'Contact the clinic director at ruth@northernspine.co.uk',
            },
            {
              type: 'ai_overview',
              references: [{ url: 'https://chorltonmovement.com/contact', text: 'reach the practice manager on marcus@chorltonmovement.com' }],
              items: [{ snippet: 'or admin [at] rehablab [dot] uk' }],
            },
          ],
        },
      ],
    },
  ],
}
const nestedRows = extractEmailsFromResult(serp)
const nested = nestedRows.map((entry) => entry.value)
check('addresses are found inside nested result fields', nested.length === 3, nested.join(', ') || '(none)')
check('including one written obfuscated inside a reference', nested.includes('admin@rehablab.uk'), nested.join(', '))
check('and the top-level snippet comes first', nested[0] === 'ruth@northernspine.co.uk', nested[0] ?? '(none)')
check(
  'an address keeps the URL of the result it was read from',
  nestedRows[0]?.url === 'https://northernspine.co.uk/team',
  nestedRows[0]?.url || '(none)',
)
check(
  'a nested reference keeps its own URL',
  nestedRows.find((entry) => entry.value === 'marcus@chorltonmovement.com')?.url === 'https://chorltonmovement.com/contact',
  nestedRows.find((entry) => entry.value === 'marcus@chorltonmovement.com')?.url || '(none)',
)
check(
  'the search keyword is not treated as the page the address came from',
  !/email address/.test(nestedRows[0]?.context ?? '') && /northernspine\.co\.uk\/team/.test(nestedRows[0]?.context ?? ''),
  nestedRows[0]?.context ?? '',
)

check(
  'a cyclic structure does not hang the walk',
  collectText((() => {
    const node = { snippet: 'hello@northernspine.co.uk' }
    node.self = node
    return node
  })()).length === 1,
)

const ownerSnippet = {
  items: [
    {
      url: 'https://northernspine.co.uk/about',
      title: 'Northern Spine founder Ruth Taylor',
      snippet: 'The clinic was founded by Ruth Taylor. Owner: Marcus Dean is listed on the company profile.',
    },
  ],
}
const owners = extractPeopleFromResult(ownerSnippet)
check('the first pass finds a founder in a SERP result', owners.some((person) => person.fullName === 'Ruth Taylor'), owners.map((person) => person.fullName).join(', '))
check('the owner result keeps its source URL', owners.find((person) => person.fullName === 'Ruth Taylor')?.url === 'https://northernspine.co.uk/about', owners.find((person) => person.fullName === 'Ruth Taylor')?.url || '(none)')
check('a reverse title needs a separator', extractPeople('Northern Spine founder Ruth Taylor').every((person) => person.fullName !== 'Northern Spine'), extractPeople('Northern Spine founder Ruth Taylor').map((person) => person.fullName).join(', '))
check('a sentence that says who the owner is is also read', extractPeople('Ruth Taylor is the owner of Northern Spine').some((person) => person.fullName === 'Ruth Taylor'), extractPeople('Ruth Taylor is the owner of Northern Spine').map((person) => person.fullName).join(', '))

// ---- what a real snippet looks like.
// The search that found these shapes returned "I'm Razi Siddiqui" as a person's name, because the
// name pattern is greedy and a snippet introduces a person inside a sentence.
check(
  'an introduction is not part of the name',
  extractPeople("I'm Razi Siddiqui, CEO of Rex Technologies").every((person) => !/^i/i.test(person.fullName)),
  extractPeople("I'm Razi Siddiqui, CEO of Rex Technologies").map((person) => person.fullName).join(', ') || '(none)',
)
check(
  'and the name inside it is still read',
  extractPeople("I'm Razi Siddiqui, CEO of Rex Technologies").some((person) => person.fullName === 'Razi Siddiqui'),
  extractPeople("I'm Razi Siddiqui, CEO of Rex Technologies").map((person) => person.fullName).join(', ') || '(none)',
)
check(
  'a friendly introduction is read the same way',
  extractPeople("Hi, I'm Ruth Taylor, founder of Northern Spine").some((person) => person.fullName === 'Ruth Taylor'),
  extractPeople("Hi, I'm Ruth Taylor, founder of Northern Spine").map((person) => person.fullName).join(', ') || '(none)',
)
check(
  'one person written two ways is filed once',
  extractPeople('Ruth Taylor, founder. Ruth Taylor founded Northern Spine in 2011.').length === 1,
  extractPeople('Ruth Taylor, founder. Ruth Taylor founded Northern Spine in 2011.').map((person) => person.fullName).join(', '),
)
// A live search returned "Of Rextech Studios" as a person: the title came first and the company
// after it, and the name pattern started one word too late.
check(
  'a company after a title is not a person',
  extractPeople('Muhammad Arshad, Founder & CEO Of Rextech Studios').every((person) => !/^of\b/i.test(person.fullName)),
  extractPeople('Muhammad Arshad, Founder & CEO Of Rextech Studios').map((person) => person.fullName).join(', ') || '(none)',
)
check(
  'the person before that title is still read',
  extractPeople('Muhammad Arshad, Founder & CEO Of Rextech Studios').some((person) => person.fullName === 'Muhammad Arshad'),
  extractPeople('Muhammad Arshad, Founder & CEO Of Rextech Studios').map((person) => person.fullName).join(', ') || '(none)',
)
// The same live search returned "Moeed Shahid Chief Technology" for a person whose job title simply
// follows his name. The name stops where the job starts.
check(
  'a job title is not part of the name',
  extractPeople('Moeed Shahid Chief Technology, Director at Rex Technologies').some((person) => person.fullName === 'Moeed Shahid'),
  extractPeople('Moeed Shahid Chief Technology, Director at Rex Technologies').map((person) => person.fullName).join(', ') || '(none)',
)
check(
  'a surname that reads like a title is left alone',
  extractPeople('Sarah Head, Director of Northern Spine').some((person) => person.fullName === 'Sarah Head'),
  extractPeople('Sarah Head, Director of Northern Spine').map((person) => person.fullName).join(', ') || '(none)',
)

// ---- the query a lead is worth
const { queryForLead, queryForOwner, queryForOwnerEmail, locationForLead } = require('../dist-electron/enrichment/dataforseo.js')
check('a lead with an area is searched with it', queryForLead({ name: 'HAS Law', area: 'Manchester' }) === 'HAS Law Manchester email address', queryForLead({ name: 'HAS Law', area: 'Manchester' }))
check('a lead without one is searched by name', queryForLead({ name: 'HAS Law' }) === 'HAS Law email address', queryForLead({ name: 'HAS Law' }))
check('the first paid search asks for a founder or owner', queryForOwner({ name: 'HAS Law', area: 'Manchester' }) === 'HAS Law founder owner Manchester', queryForOwner({ name: 'HAS Law', area: 'Manchester' }))
check('the second paid search names the owner and company', queryForOwnerEmail({ name: 'HAS Law', area: 'Manchester' }, { fullName: 'Ruth Taylor' }) === 'Ruth Taylor HAS Law Manchester email address', queryForOwnerEmail({ name: 'HAS Law', area: 'Manchester' }, { fullName: 'Ruth Taylor' }))
const lahore = locationForLead({ area: 'Lahore' })
check('Lahore is searched in Pakistan', lahore.location === 'Pakistan' && lahore.domain === 'google.com.pk', `${lahore.location} · ${lahore.domain}`)
const manchester = locationForLead({ area: 'Manchester' })
check('Manchester is searched in the United Kingdom', manchester.location === 'United Kingdom' && manchester.domain === 'google.co.uk', `${manchester.location} · ${manchester.domain}`)
check('an unknown town stays on the default', locationForLead({ area: 'Smallville' }).location === 'United Kingdom', locationForLead({ area: 'Smallville' }).location)
check(
  'the address is used when the town is not a known city',
  locationForLead({ area: 'Gulberg', address: '12 Main Boulevard, Lahore, Pakistan' }).domain === 'google.com.pk',
  locationForLead({ area: 'Gulberg', address: '12 Main Boulevard, Lahore, Pakistan' }).domain,
)

const failed = results.filter((result) => !result.ok).length
console.log('')
console.log(`${results.length - failed}/${results.length} checks passed`)
process.exit(failed ? 1 : 0)
