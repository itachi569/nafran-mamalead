// Reads a lead's own website to find the contact details a Maps listing does not publish.
//
// This is the step that turns a captured business into something worth contacting: a Maps entry
// gives a name and a phone, and the site it links to usually carries an address, sometimes a
// named person, and almost always a social profile. The worker drives one Chromium page through
// the site's home page and up to two contact-ish pages, then reports what it found.
//
// Nothing here writes to the database; it returns findings and the caller decides what to keep.
import { chromium, type Browser } from 'playwright'
import { parse, serialize, type DefaultTreeAdapterMap } from 'parse5'

export interface FoundEmail {
  value: string
  /** Domain match plus how the mailbox is named, 0 to 100. */
  score: number
  /** Where it was read from, for the page's source column. */
  page: string
}

export interface FoundPhone {
  value: string
  page: string
}

export interface FoundSocial {
  platform: 'instagram' | 'facebook' | 'linkedin' | 'tiktok' | 'youtube' | 'x' | 'other'
  handle: string
  profileUrl: string
}

export interface FoundPerson {
  fullName: string
  title: string
  linkedinUrl: string
  /** Where the name came from, shown beside it so a person can be judged rather than trusted. */
  evidence: string
  email?: string
  phone?: string
}

export interface WebsiteFindings {
  addresses?: string[]
  emails: FoundEmail[]
  phones: FoundPhone[]
  socials: FoundSocial[]
  people: FoundPerson[]
  /** Pages actually read, so a run can report what it looked at. */
  pagesRead: string[]
  error: string | null
}

const SOCIAL_HOSTS: [RegExp, FoundSocial['platform']][] = [
  [/(^|\.)instagram\.com$/i, 'instagram'],
  [/(^|\.)facebook\.com$/i, 'facebook'],
  [/(^|\.)linkedin\.com$/i, 'linkedin'],
  [/(^|\.)tiktok\.com$/i, 'tiktok'],
  [/(^|\.)youtube\.com$/i, 'youtube'],
  [/(^|\.)(twitter|x)\.com$/i, 'x'],
]

/**
 * Mailboxes that belong to a platform or a form widget rather than to the business. These turn
 * up in marketing footers and consent scripts, and storing one would put a stranger's address on
 * a lead.
 */
const EMAIL_NOISE =
  /(sentry|wixpress|example|domain\.com|yourdomain|email\.com|sentry\.io|godaddy|squarespace|shopify|wordpress|mailservice|mail-?host|formspree|hubspot|mailchimp|sendgrid|cloudflare|jquery|bootstrap|gstatic|googleapis|schema\.org|w3\.org|protectedemail|no-?reply)/i

/** Roles worth writing to first, in the order a person would try them. */
const ROLE_RANK: [RegExp, number][] = [
  [/^(info|hello|hi|enquiries|enquiry|contact|mail)$/i, 16],
  [/^(admin|office|reception|frontdesk|team|help|support)$/i, 12],
  [/^(bookings|appointments|sales|newbusiness|clinic|practice)$/i, 10],
  [/^(careers|jobs|press|pr|marketing|accounts|billing|payroll|noreply|no-reply|donotreply)$/i, -20],
]

/** Hosts that make a link a profile rather than a page of the site's own. */
function socialFrom(href: string): FoundSocial | null {
  let url: URL
  try {
    url = new URL(href)
  } catch {
    return null
  }
  if (!['http:', 'https:'].includes(url.protocol)) return null
  const host = url.hostname.replace(/^www\./i, '')
  for (const [pattern, platform] of SOCIAL_HOSTS) {
    if (!pattern.test(host)) continue
    // The first path segment is the handle, except for the shapes that put a keyword first.
    const segments = url.pathname.split('/').filter(Boolean)
    const first = segments[0]?.toLowerCase() ?? ''
    // Share widgets, posts, login pages and platform home pages are not business profiles.
    const excluded: Partial<Record<FoundSocial['platform'], string[]>> = {
      facebook: ['sharer', 'sharer.php', 'share.php', 'share', 'dialog', 'plugins', 'login', 'login.php', 'watch', 'reel', 'help'],
      instagram: ['p', 'reel', 'reels', 'stories', 'accounts', 'explore', 'share'],
      linkedin: ['sharing', 'sharearticle', 'feed', 'posts', 'login', 'signup'],
      x: ['intent', 'share', 'search', 'home', 'login', 'i'],
      youtube: ['watch', 'shorts', 'embed', 'playlist', 'results', 'feed'],
      tiktok: ['embed', 'login', 'discover', 'tag'],
    }
    if (!first || excluded[platform]?.includes(first)) return null
    if (platform === 'facebook' && first === 'profile.php') {
      const id = url.searchParams.get('id')
      if (!id || !/^\d+$/.test(id)) return null
      return { platform, handle: id, profileUrl: `${url.origin}${url.pathname}?id=${id}` }
    }
    const handle = segments[0] && !['company', 'in', 'pages', 'profile.php', 'c', 'channel', 'user'].includes(segments[0])
      ? segments[0]
      : (segments[1] ?? '')
    if (!handle) return null
    return { platform, handle, profileUrl: `${url.origin}${url.pathname}`.replace(/\/$/, '') }
  }
  return null
}

/** Basic entity decoding is enough for hrefs and JSON-LD URLs without loading a browser. */
function decodeHtml(value: string): string {
  return value
    .replace(/&#(x[0-9a-f]+|[0-9]+);/gi, (_, code: string) => { const value=parseInt(code.replace(/^x/i,''), /^x/i.test(code)?16:10); return value>0 && value<=0x10ffff ? String.fromCodePoint(value) : '' })
    .replace(/&nbsp;/gi, ' ').replace(/&middot;/gi, '·').replace(/&ndash;/gi, '–').replace(/&mdash;/gi, '—')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#x2f;|&#47;/gi, '/')
}

/** Finds social URLs already present in the server HTML. Most company footers publish these here. */
function socialLinksFromHtml(html: string, baseHref: string): FoundSocial[] {
  const candidates = new Set<string>()
  const add = (raw: string): void => {
    const decoded = decodeHtml(raw.replace(/\\\//g, '/')).trim()
    if (!decoded) return
    try {
      const absolute = new URL(decoded, baseHref).href.replace(/[),.;'"\\]+$/g, '')
      candidates.add(absolute)
    } catch {
      // A script or malformed href is not a profile URL.
    }
  }

  for (const match of html.matchAll(/<a\b[^>]*\bhref\s*=\s*["']([^"']+)["']/gi)) add(match[1])
  // JSON-LD sameAs values and escaped page fragments can carry a profile without an anchor.
  const unescaped = decodeHtml(html.replace(/\\\//g, '/'))
  for (const match of unescaped.matchAll(/https?:\/\/(?:www\.)?(?:instagram\.com|facebook\.com|linkedin\.com|tiktok\.com|youtube\.com|youtu\.be|twitter\.com|x\.com)[^\s"'<>\\]*/gi)) add(match[0])

  const found = new Map<string, FoundSocial>()
  for (const href of candidates) {
    const social = socialFrom(href)
    if (!social) continue
    found.set(`${social.platform}:${social.profileUrl.toLowerCase()}`, social)
  }
  return Array.from(found.values())
}

/** Turns server HTML into enough readable text for mailboxes, numbers and named people. */
function readableHtml(html: string): string {
  return decodeHtml(
    html
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
      .replace(/<\/?(?:h[1-6]|p|div|section|article|li|br|tr)\b[^>]*>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/[^\S\n]+/g, ' ')
      .replace(/ *\n */g, '\n')
      .replace(/\n+/g, '\n'),
  ).trim()
}

/** Keep published physical addresses, including multiple offices. Never infer an address. */
export function addressesFromHtml(html: string): string[] {
  const found = new Set<string>()
  const add = (value: string) => {
    const clean = readableHtml(value).replace(/\s+/g, ' ').replace(/,\s*,/g, ',').trim()
    if (clean.length >= 12 && clean.length <= 450 && !/@|https?:|cookie|copyright/i.test(clean)) found.add(clean)
  }
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) return value.forEach(visit)
    if (!value || typeof value !== 'object') return
    const node = value as Record<string, unknown>
    if (node.streetAddress) add(['streetAddress','addressLocality','addressRegion','postalCode','addressCountry'].map(k => typeof node[k] === 'string' ? node[k] : '').filter(Boolean).join(', '))
    Object.values(node).forEach(visit)
  }
  for (const match of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { visit(JSON.parse(match[1])) } catch { /* Invalid optional structured data. */ }
  }
  for (const match of html.matchAll(/<address\b[^>]*>([\s\S]*?)<\/address>/gi)) add(match[1])
  const lines = readableHtml(html).split('\n').map(v => v.trim()).filter(Boolean)
  for (let i=0; i<lines.length; i++) {
    const line=lines[i]
    if (line.length <= 180 && !/^(?:near|the|a |we |our )/i.test(line) && !/\b(?:has|have|was|were|practised|founded|since|whose|under|before)\b/i.test(line) && /\d/.test(line) && /\b(?:street|road|avenue|lane|floor|suite|building|plaza|block|chambers|tower|clifton|pechs|house|office|sector|dha|gulberg|markaz)\b/i.test(line) && !/phone|fax|tel:|whatsapp|@/i.test(line)) {
      const next=lines[i+1] ?? ''
      add(line + (/karachi|lahore|islamabad|london|pakistan|united kingdom/i.test(next) && next.length<120 && !/@|tel|phone|fax/i.test(next) && !/^(?:\d|(?:no\.?|office|suite|house|plot)\s*\d)/i.test(next) ? ', '+next : ''))
    }
  }
  return uniqueAddresses(Array.from(found))
}

function uniqueAddresses(addresses: string[]): string[] {
  const key=(value:string)=>value.toLowerCase().replace(/[^a-z0-9]/g,'')
  return addresses.filter((value,i)=>!addresses.some((other,j)=>j!==i && key(other).includes(key(value)) && (key(other).length>key(value).length || j<i))).slice(0,12)
}

/** Finds contact details already in the first server response, without starting Chromium. */
function contactFindingsFromHtml(html: string, pageUrl: string): Omit<WebsiteFindings, 'error' | 'pagesRead'> {
  const origin = new URL(pageUrl)
  const siteHost = origin.host.replace(/^www\./i, '')
  const text = readableHtml(html)
  const emails = cleanEmails([
    ...Array.from(html.matchAll(/mailto:([^"'\s?<>]+)/gi), (match) => decodeHtml(match[1])),
    ...(text.match(/[\w.+-]+@[\w-]+\.[\w.-]+/g) ?? []),
  ]).map((value) => ({ value, score: scoreEmail(value, siteHost), page: pageUrl }))

  const phoneValues = new Set<string>()
  for (const match of html.matchAll(/(?:href\s*=\s*["']tel:|\btel:)([^"'<>\s]+)/gi)) phoneValues.add(match[1])
  for (const match of text.matchAll(/(?:\+?\d[\d\s().-]{7,}\d)/g)) phoneValues.add(match[0])
  const phones = Array.from(phoneValues)
    .map((value) => normalisePhone(value))
    .filter((value, index, values) => value.replace(/\D/g, '').length >= 9 && values.indexOf(value) === index)
    .map((value) => ({ value, page: pageUrl }))

  const jsonLd = Array.from(html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi), (match) => decodeHtml(match[1]))
  const structuredContacts = (value: unknown): void => {
    if (Array.isArray(value)) { value.forEach(structuredContacts); return }
    if (!value || typeof value!=='object') return
    const node=value as Record<string,unknown>
    for(const raw of Array.isArray(node.email)?node.email:[node.email]) {
      if(typeof raw!=='string')continue
      const email=cleanEmails([raw.replace(/^mailto:/i,'')])[0]
      if(email && !emails.some(item=>item.value===email))emails.push({value:email,score:scoreEmail(email,siteHost),page:pageUrl})
    }
    for(const raw of Array.isArray(node.telephone)?node.telephone:[node.telephone]) {
      if(typeof raw!=='string')continue
      const phone=normalisePhone(raw)
      if(phone.replace(/\D/g,'').length>=9 && !phones.some(item=>item.value===phone))phones.push({value:phone,page:pageUrl})
    }
    Object.values(node).forEach(structuredContacts)
  }
  for(const block of jsonLd){try{structuredContacts(JSON.parse(block))}catch{/* Ignore invalid optional markup. */}}
  const people = peopleFromJsonLd(jsonLd).map((person) => ({
    fullName: person.fullName,
    title: person.title,
    linkedinUrl: person.linkedinUrl,
    email: person.email,
    phone: person.phone,
    evidence: pageUrl,
  }))
  for (const person of findPeople(text)) {
    if (!people.some((saved) => saved.fullName.toLowerCase() === person.fullName.toLowerCase())) {
      people.push({ ...person, linkedinUrl: '', email: '', phone: '', evidence: pageUrl })
    }
  }

  // Associate a mailbox only when the site explicitly names its owner beside the link.
  // A generic firm mailbox is never assigned to every person in a team.
  for (const match of html.matchAll(/<a\b[^>]*href\s*=\s*["']mailto:([^"'?<>]+)[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const label = readableHtml(match[2]).replace(/\s+/g, ' ').trim()
    const address = cleanEmails([decodeHtml(match[1])])[0]
    if (!address || label.split(/\s+/).length<2 || !isUsablePerson(label, '')) continue
    const person = people.find(saved => saved.fullName.toLowerCase() === label.toLowerCase())
    if (person && !person.email) person.email = address
    else if (!person) people.push({ fullName: label, title: '', email: address, phone: '', linkedinUrl: '', evidence: pageUrl })
  }

  attachPeopleCards(html, pageUrl, people)
  // Person fields may exist only in structured data, outside visible text/mailto links.
  for (const person of people) {
    if (person.email && isUsableEmail(person.email) && !emails.some(item=>item.value===person.email)) emails.push({value:person.email,score:scoreEmail(person.email,siteHost),page:pageUrl})
    if (person.phone && !phones.some(item=>item.value===normalisePhone(person.phone!))) phones.push({value:normalisePhone(person.phone),page:pageUrl})
  }

  return { addresses: addressesFromHtml(html), emails, phones, socials: socialLinksFromHtml(html, pageUrl), people }
}

/**
 * How good an address looks. A mailbox on the business's own domain is worth far more than a
 * free one, and a role address beats a personal one for a first approach.
 */
export function scoreEmail(value: string, siteHost: string): number {
  const [localPart = '', domain = ''] = value.toLowerCase().split('@')
  let score = 40
  if (domain === siteHost) score += 30
  else if (siteHost && domain.endsWith(`.${siteHost.split('.').slice(-2).join('.')}`)) score += 18
  else if (/(gmail|yahoo|hotmail|outlook|icloud|aol|live|msn)\./.test(domain)) score += 2

  for (const [pattern, delta] of ROLE_RANK) {
    if (pattern.test(localPart)) {
      score += delta
      break
    }
  }
  if (/^[a-z]+\.[a-z]+$/.test(localPart)) score += 6
  if (localPart.length > 24) score -= 8
  if (/\d{3,}/.test(localPart)) score -= 10
  return Math.max(0, Math.min(100, score))
}

/** Normalises a UK phone number so the same line cannot be stored twice in two shapes. */
export function normalisePhone(raw: string): string {
  const digits = raw.replace(/[^\d+]/g, '')
  if (digits.startsWith('+44')) return `+44 ${digits.slice(3).replace(/(\d{3})(\d{3})(\d+)/, '$1 $2 $3')}`.trim()
  // A local number could belong to Pakistan, the UK or another country. Keep its prefix.
  return digits
}

/** Words that mark a phrase as a service or a treatment rather than a person's name. */
const SERVICE_WORDS =
  /\b(removal|treatment|treatments|therapy|therapies|surgery|surgical|care|clinic|laser|needling|massage|rehabilitation|rehab|injury|sports|skin|dental|dentistry|implant|implants|aesthetics|wellbeing|wellness|consultation|assessment|screening|whitening|facials?|waxing|products?|services?|prices?|offers?|packages?|booking|bookings|appointment|appointments|request|enquiry|enquiries|schedule|contact|location|opening|hours|reviews?|results?|gallery|blog|news|faqs?|about|home|menu|search|login|register|subscribe|newsletter)\b/i

/**
 * Whether a stored name is a person rather than a button, a heading or a service. Exported so an
 * existing row can be judged by the same rule that decides whether to store one.
 */
export function isUsablePerson(fullName: string, title: string): boolean {
  const name = fullName.trim()
  if (!name || name.length > 40) return false
  if (/[\n\r]/.test(name)) return false
  if (PERSON_NOISE.test(name) || PERSON_NOISE.test(title.trim())) return false
  if (SERVICE_WORDS.test(name)) return false

  const words = name.split(/\s+/)
  if (words.length > 4) return false
  // Each word is capitalised, or a lowercase particle that only appears inside a name.
  return words.every((word, index) => /^\p{Lu}[\p{L}'’.-]*$/u.test(word) || (index > 0 && /^(van|von|de|der|den|la|le|al|bin|ibn|ur|ul|el|mac|mc|da|di)$/.test(word)))
}

function isContactLink(href: string, text: string): boolean {
  return /contact|about|team|staff|our-people|meet|clinic|practice|book/i.test(`${href} ${text}`)
}

/** Attach direct contacts only within one person's own card, never from a shared footer. */
function attachPeopleCards(html: string, pageUrl: string, people: FoundPerson[]): void {
  type Node = DefaultTreeAdapterMap['node']
  type Element = DefaultTreeAdapterMap['element']
  const elements: Element[] = []
  const walk = (node: Node): void => {
    if ('tagName' in node) elements.push(node)
    if ('childNodes' in node) node.childNodes.forEach(walk)
  }
  walk(parse(html))
  const attr = (node: Element, key: string) => node.attrs.find(item=>item.name===key)?.value ?? ''
  const nameOf = (node: Element) => readableHtml(serialize(node)).replace(/\s+/g,' ').trim().replace(/^(?:Dr\.?|Mr\.?|Mrs\.?|Ms\.?)\s+/i,'').replace(/,?\s+(?:Esq\.?|PhD|M\.D\.)$/i,'')
  const headings = elements.filter(node=>/^h[1-4]$/.test(node.tagName) || attr(node,'itemprop')==='name' || /(?:^|\s)(?:nm|name|(?:person|team|member|staff)[_-]name)(?:\s|$)/i.test(attr(node,'class')))
  const isNameHeading = (name: string) => name.split(/\s+/).length>=2 && isUsablePerson(name,'') && name.match(ROLE_ANYWHERE)?.[0]!==name
  for (const heading of headings) {
    const name=nameOf(heading)
    if (!isNameHeading(name)) continue
    let person=people.find(item=>item.fullName.toLowerCase()===name.toLowerCase())
    let parent=heading.parentNode
    for(let depth=0; parent && depth<4; depth++,parent=parent.parentNode) {
      if (!('tagName' in parent) || /^(?:body|html|main|footer|header|nav)$/.test(parent.tagName)) break
      if (!/^(?:div|article|li|section)$/.test(parent.tagName)) continue
      const block=serialize(parent)
      const text=readableHtml(block)
      if(text.length>10000) break
      const otherPerson=people.some(item=>item.fullName.toLowerCase()!==name.toLowerCase() && text.toLowerCase().includes(item.fullName.toLowerCase()))
      const otherHeading=headings.some(item=>item!==heading && isNameHeading(nameOf(item)) && nameOf(item)!==name && (()=>{let ancestor=item.parentNode;while(ancestor){if(ancestor===parent)return true;ancestor='parentNode' in ancestor ? ancestor.parentNode : null}return false})())
      if(otherPerson || otherHeading) break
      const title=text.match(ROLE_ANYWHERE)?.[0] ?? person?.title ?? ''
      if(!person && !title) continue
      if(!person) { person={fullName:name,title,email:'',phone:'',linkedinUrl:'',evidence:pageUrl};people.push(person) }
      if(!person.title || title.length>person.title.length && title.includes(person.title))person.title=title
      const email=cleanEmails(Array.from(block.matchAll(/href\s*=\s*["']mailto:([^"'?<>\s]+)/gi),m=>decodeHtml(m[1]))).find(value=>! /^(?:info|hello|contact|office|admin|support|sales|reception|enquiries)@/i.test(value))
      const tel=block.match(/href\s*=\s*["']tel:([^"'<>]+)/i)?.[1]
      const phone=tel ? normalisePhone(decodeHtml(tel)) : ''
      const linkedin=Array.from(block.matchAll(/href\s*=\s*["']([^"']+)["']/gi),m=>decodeHtml(m[1])).find(url=>/^https?:\/\/(?:[a-z]+\.)?linkedin\.com\/in\//i.test(url))
      if(email && !person.email)person.email=email
      if(phone.replace(/\D/g,'').length>=9 && !person.phone)person.phone=phone
      if(linkedin && !person.linkedinUrl)person.linkedinUrl=linkedin
      if(email || phone || linkedin) break
    }
  }
}

/** Link text and marketing copy that reads like a name beside a role but is neither. */
const PERSON_NOISE =
  /^(read more|learn more|find out|contact us|book now|view profile|see more|hair removal|our team|our people|meet our team|meet the|more info|get in touch|about us|click here|book online|our services|email us|email me|send email|call us|call me|contact details)$/i

/**
 * Finds the first credible "Name — Role" pair on a page.
 *
 * Both halves are limited to a few words, because a page's prose will happily produce a
 * sentence-shaped name if the pattern is allowed to run. Anything that reads as a button, a
 * heading or a service is rejected rather than stored as a person.
 */
function findPerson(text: string): { fullName: string; title: string } | null {
  return findPeople(text)[0] ?? null
}

function findPeople(text: string): { fullName: string; title: string }[] {
  const pattern =
    /([A-Z][a-z]+(?:[^\S\n]+[A-Z][a-z'-]+){1,3})[^\S\n]*(?:[\n·|—–]| - )\s*(CEO|CFO|CTO|COO|CMO|Chief Executive Officer|Managing Director|Co-Founder|Co-founder|Director|Owner|Founder|Practice Manager|Clinic Director|Manager|Principal|Partner|Head of [A-Za-z]+(?:[^\S\n]+[A-Za-z]+){0,2}|Lead [A-Za-z]+(?:[^\S\n]+[A-Za-z]+){0,2}|Therapist|Dentist|Doctor|Dermatologist|Physiotherapist|Chiropractor|Surgeon|Consultant|Specialist|Practitioner)(?![A-Za-z])/g
  const people: { fullName: string; title: string }[] = []
  for (const match of text.matchAll(pattern)) {
    const fullName = match[1].trim()
    const title = match[2].trim()
    if (!isUsablePerson(fullName, title)) continue
    if (!people.some((person) => person.fullName.toLowerCase() === fullName.toLowerCase())) people.push({ fullName, title })
  }
  return people
}

/** The role vocabulary, as a pattern that can be matched anywhere in a block of text. */
const ROLE_ANYWHERE = new RegExp(
  String.raw`\b(CEO|CFO|CTO|COO|CMO|Chief Executive Officer|Managing Director|Managing Partner|Senior Partner|Co-Founder|Director|Owner|Founder|Practice Manager|Clinic Director|Manager|Principal|Partner|Attorney|Lawyer|Barrister|Advocate|Solicitor|Associate|Head of [A-Za-z]+(?:[^\S\n]+[A-Za-z]+){0,2}|Lead [A-Za-z]+(?:[^\S\n]+[A-Za-z]+){0,2}|Therapist|Dentist|Doctor|Dermatologist|Physiotherapist|Chiropractor|Surgeon|Consultant|Specialist|Practitioner)\b`,
)

function cleanEmails(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim().toLowerCase()).filter(isUsableEmail)))
}

/**
 * Whether an address found on a page belongs to the business. Exported so a stored address can
 * be judged by the same rule that decides whether to store it.
 */
export function isUsableEmail(value: string): boolean {
  if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/.test(value)) return false
  if (EMAIL_NOISE.test(value)) return false
  // Obfuscated addresses and asset filenames occasionally look like mailboxes.
  return !/\.(png|jpe?g|gif|svg|webp|css|js)$/i.test(value)
}

const COLLECT = `(() => {
  const text = document.body ? document.body.innerText : ''
  const html = document.documentElement ? document.documentElement.outerHTML : ''
  // Each mailto keeps the text beside it: "Ruth Ellery" next to her address is evidence that
  // the address belongs to a named person, which the address alone is not.
  const mailto = Array.from(document.querySelectorAll('a[href^="mailto:"]')).map((a) => ({
    address: (a.getAttribute('href') || '').replace(/^mailto:/i, '').split('?')[0].trim(),
    label: (a.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 80),
    // The paragraph or card an address sits in usually carries the person's role.
    near: (a.closest('li,article,section,div,footer,address')?.innerText || '').replace(/\\s+/g, ' ').trim().slice(0, 200),
  }))
  const tel = Array.from(document.querySelectorAll('a[href^="tel:"]'))
    .map((a) => (a.getAttribute('href') || '').replace(/^tel:/i, ''))
  const links = Array.from(document.querySelectorAll('a[href]')).map((a) => ({
    href: a.href,
    text: (a.textContent || '').trim().slice(0, 60),
    near: (a.closest('li,article,section,div')?.innerText || '').replace(/\\s+/g, ' ').trim().slice(0, 200),
  }))
  // Structured data is the most reliable source: a Person entry states a name and a job title.
  const jsonLd = Array.from(document.querySelectorAll('script[type="application/ld+json"]'))
    .map((s) => s.textContent || '')
  return { text, html, mailto, tel, links, jsonLd }
})()`

interface HarvestedMailto {
  address: string
  label: string
  near: string
}

interface PageHarvest {
  text: string
  html: string
  mailto: HarvestedMailto[]
  tel: string[]
  links: { href: string; text: string; near: string }[]
  jsonLd: string[]
}

/**
 * Reads people out of schema.org markup, which states a name and a job title as data rather than
 * as prose. Handles the three shapes sites actually publish: a Person node, an Organization whose
 * employee or founder points at one, and a graph of nodes referencing each other by id.
 */
function peopleFromJsonLd(blocks: string[]): { fullName: string; title: string; email: string; phone: string; linkedinUrl: string }[] {
  const found: { fullName: string; title: string; email: string; phone: string; linkedinUrl: string }[] = []
  const seen = new Set<string>()

  const readPerson = (node: Record<string, unknown>): void => {
    const name = typeof node.name === 'string' ? node.name.replace(/\s+/g, ' ').trim().replace(/^(?:Dr\.?|Mr\.?|Mrs\.?|Ms\.?)\s+/i,'') : ''
    const title = typeof node.jobTitle === 'string' ? node.jobTitle.replace(/\s+/g, ' ').trim() : ''
    if (!name || !isUsablePerson(name, title)) return
    const key = name.toLowerCase()
    if (seen.has(key)) return
    seen.add(key)
    found.push({
      fullName: name,
      title,
      email: typeof node.email === 'string' ? node.email.replace(/^mailto:/i, '').trim() : '',
      phone: typeof node.telephone === 'string' ? node.telephone.trim() : '',
      linkedinUrl: (Array.isArray(node.sameAs) ? node.sameAs : [node.sameAs]).find((url): url is string => typeof url === 'string' && /^https?:\/\/(?:www\.)?linkedin\.com\/in\//i.test(url)) ?? '',
    })
  }

  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(visit)
      return
    }
    if (!value || typeof value !== 'object') return
    const node = value as Record<string, unknown>
    const type = node['@type']
    const types = Array.isArray(type) ? type.map(String) : [String(type ?? '')]
    if (types.some((entry) => /^Person$/i.test(entry))) readPerson(node)
    Object.values(node).forEach(value=>{if(value && typeof value==='object')visit(value)})
  }

  for (const block of blocks) {
    try {
      visit(JSON.parse(block))
    } catch {
      // A malformed block is common; the next one may still parse.
    }
  }
  return found
}

export class WebsiteEnricher {
  private browser: Browser | null = null

  /** Follow the site's own team/about links; one credit still covers one website. */
  async inspectPeople(website: string, signal?: AbortSignal): Promise<WebsiteFindings> {
    if (signal?.aborted) throw new DOMException('Enrichment cancelled', 'AbortError')
    const findings: WebsiteFindings = { emails: [], phones: [], socials: [], people: [], pagesRead: [], error: null }
    let origin: URL
    try { origin = new URL(website) } catch { return { ...findings, error: 'Invalid website address.' } }
    const host = origin.hostname.replace(/^www\./i, '')
    const pending = [origin.href]
    const visited = new Set<string>()
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 45_000)
    const onAbort = () => controller.abort()
    signal?.addEventListener('abort', onAbort, { once: true })
    try {
      while (pending.length && visited.size < 12 && !controller.signal.aborted) {
        const url = pending.shift()!
        if (visited.has(url)) continue
        visited.add(url)
        try {
          const response = await fetch(url, { redirect: 'follow', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(8_000)]),
            headers: { accept: 'text/html,application/xhtml+xml', 'user-agent': 'MamaLead contact scanner/1.4' } })
          if (!response.ok) throw new Error(`Website returned HTTP ${response.status}.`)
          const pageUrl = response.url || url
          if (new URL(pageUrl).hostname.replace(/^www\./i, '') !== host) continue
          const html = (await response.text()).slice(0, 2_000_000)
          const found = contactFindingsFromHtml(html, pageUrl)
          findings.pagesRead.push(pageUrl)
          findings.addresses = [...new Set([...(findings.addresses ?? []), ...(found.addresses ?? [])])]
          findings.emails.push(...found.emails)
          findings.phones.push(...found.phones)
          findings.socials.push(...found.socials)
          for (const person of found.people) {
            const existing = findings.people.find((saved) => saved.fullName.toLowerCase() === person.fullName.toLowerCase())
            if (!existing) findings.people.push(person)
            else {
              if ((!existing.email && person.email) || (!existing.phone && person.phone)) existing.evidence=person.evidence
              for (const field of ['title', 'email', 'phone', 'linkedinUrl'] as const) if ((!existing[field] || field==='title' && person.title.includes(existing.title)) && person[field]) existing[field] = person[field]
            }
          }
          const links = Array.from(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi))
            .map((match) => {
              try {
                const target = new URL(decodeHtml(match[1]), pageUrl)
                const label = readableHtml(match[2]).replace(/\s+/g, ' ').trim()
                const pathMatch = /(?:^|[/_-])(?:team|people|leadership|management|staff|lawyers|attorneys|professionals|profile|bio)(?:[/_.-]|$)/i.test(target.pathname)
                const aboutMatch = /(?:^|[/_-])(?:about|contact|locations|offices)(?:[/_.-]|$)/i.test(target.pathname)
                const labelMatch = /^(?:(?:meet|about) (?:our |the )?|our )?(?:team|people|leadership|management|staff|about us|contact us)$/i.test(label)
                const personLink = /team|people|lawyers|attorneys|professionals/i.test(new URL(pageUrl).pathname) && label.split(/\s+/).length>=2 && isUsablePerson(label,'')
                return { target, rank: aboutMatch ? 4 : pathMatch ? 3 : personLink ? 2 : labelMatch ? 1 : 0 }
              } catch { return null }
            }).filter((link): link is { target: URL; rank: number } => Boolean(link?.rank))
            .sort((a, b) => b.rank - a.rank)
          for (const { target } of links) {
            try {
              target.hash = ''
              if (!/^https?:$/.test(target.protocol) || target.hostname.replace(/^www\./i, '') !== host || visited.has(target.href) || pending.includes(target.href)) continue
              if (pending.length + visited.size < 12) pending.push(target.href)
            } catch { /* Ignore malformed links. */ }
          }
        } catch (error) {
          if (signal?.aborted) throw new DOMException('Enrichment cancelled', 'AbortError')
          if (!findings.pagesRead.length) findings.error = error instanceof Error ? error.message : 'Website could not be read.'
        }
      }
      if (findings.pagesRead.length) findings.error = null
      findings.emails=Array.from(new Map(findings.emails.map(item=>[item.value,item])).values())
      findings.phones=Array.from(new Map(findings.phones.map(item=>[item.value,item])).values())
      findings.socials=Array.from(new Map(findings.socials.map(item=>[item.profileUrl,item])).values())
      findings.addresses=uniqueAddresses(findings.addresses ?? [])
    } finally { clearTimeout(timer); signal?.removeEventListener('abort', onAbort) }
    return findings
  }

  private async launch(): Promise<Browser> {
    // Headed runs are slower but far less likely to be served a challenge by a small business
    // site's bot protection, and this is a background job rather than something watched.
    this.browser ??= await chromium.launch({ headless: true })
    return this.browser
  }

  async close(): Promise<void> {
    const browser = this.browser
    this.browser = null
    if (!browser) return
    // A site can leave Chromium waiting on a network request while a foreground import asks to
    // take over. Never let that close hold the queue forever; the next pass gets a fresh browser.
    await Promise.race([
      browser.close().catch(() => undefined),
      new Promise<void>((resolve) => setTimeout(resolve, 1_500)),
    ])
  }

  /**
   * Fast social-only pass. A plain HTTP response avoids Chromium startup and waits for delayed
   * JavaScript footers, which makes an ordinary website resolve in roughly one network round trip.
   * The full browser inspector remains available for sites that refuse a direct response.
   */
  async inspectSocialFast(website: string, signal?: AbortSignal): Promise<WebsiteFindings> {
    const findings: WebsiteFindings = { emails: [], phones: [], socials: [], people: [], pagesRead: [], error: null }
    let origin: URL
    try {
      origin = new URL(website)
    } catch {
      findings.error = `"${website}" is not a usable web address.`
      return findings
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 4_500)
    const onAbort = () => controller.abort()
    signal?.addEventListener('abort', onAbort, { once: true })
    try {
      const response = await fetch(origin.href, {
        redirect: 'follow',
        signal: controller.signal,
        headers: {
          accept: 'text/html,application/xhtml+xml',
          'user-agent': 'MamaLead contact scanner/1.5',
        },
      })
      if (!response.ok) {
        findings.error = `${origin.host} returned HTTP ${response.status}.`
        return findings
      }
      const html = await response.text()
      if (signal?.aborted) throw new DOMException('Enrichment cancelled', 'AbortError')
      const pageUrl = response.url || origin.href
      findings.pagesRead.push(pageUrl)
      findings.socials = socialLinksFromHtml(html, pageUrl)
    } catch (error) {
      if (signal?.aborted) throw new DOMException('Enrichment cancelled', 'AbortError')
      findings.error = error instanceof Error ? error.message : `${origin.host} could not be fetched.`
    } finally {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
    }
    return findings
  }

  /** Fast email, phone and decision-maker pass over the server HTML of a site. */
  async inspectContactFast(website: string, signal?: AbortSignal): Promise<WebsiteFindings> {
    const result: WebsiteFindings = { emails: [], phones: [], socials: [], people: [], addresses: [], pagesRead: [], error: null }
    let origin: URL
    try { origin = new URL(website) } catch { return { ...result, error: 'Enter a valid website URL.' } }
    const combined = AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(45_000)])
    const sameSite = (raw: string): string | null => {
      try { const u = new URL(decodeHtml(raw), origin); u.hash = ''; return /^https?:$/.test(u.protocol) && u.host.replace(/^www\./i,'') === origin.host.replace(/^www\./i,'') ? u.href : null } catch { return null }
    }
    const read = async (url: string): Promise<string> => {
      if (combined.aborted) throw new DOMException('Cancelled', 'AbortError')
      // Validate every redirect before sending a request to its destination.
      for (let redirects=0; redirects<4; redirects++) {
        if (!sameSite(url)) return ''
        const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.any([combined, AbortSignal.timeout(5000)]), headers: { 'user-agent': 'MamaLead contact scanner/1.5' } })
        if (response.status >=300 && response.status <400) { const next=sameSite(new URL(response.headers.get('location') || '',url).href); if (!next) return ''; url=next; continue }
        if (!response.ok || Number(response.headers.get('content-length') ?? 0)>2_000_000) return ''
        const reader=response.body?.getReader(); if (!reader) return ''
        const decoder=new TextDecoder(); let text=''; let bytes=0
        try { while (true) { const chunk=await reader.read(); if(chunk.done)break; bytes+=chunk.value.length; if(bytes>2_000_000)break; text+=decoder.decode(chunk.value,{stream:true}) } } finally { await reader.cancel() }
        return text+decoder.decode()
      }
      return ''
    }
    const queue=[origin.href]; const seen=new Set<string>()
    const append=(raw:string) => { const url=sameSite(raw); if(url && !seen.has(url) && !queue.includes(url) && queue.length<12)queue.push(url) }
    try {
      const robots=await read(new URL('/robots.txt',origin).href).catch(()=>'')
      const maps=Array.from(robots.matchAll(/^Sitemap:\s*(\S+)/gim),m=>m[1])
      if (!maps.length) maps.push(new URL('/sitemap.xml',origin).href, new URL('/sitemap_index.xml',origin).href)
      const visitedMaps=new Set<string>()
      while(maps.length && visitedMaps.size<4 && !combined.aborted){
        const map=sameSite(maps.shift()!); if(!map || visitedMaps.has(map))continue; visitedMaps.add(map)
        const xml=await read(map).catch(()=>'')
        for(const match of xml.matchAll(/<loc>\s*(?:<!\[CDATA\[)?([^<\]]+)/gi)) {
          const url=sameSite(match[1].trim()); if(!url)continue
          if(/contact|reach-us|get-in-touch|locations|offices/i.test(new URL(url).pathname))append(url)
          else if(/sitemapindex/i.test(xml.slice(0,1000)) && /page|sitemap/i.test(url) && maps.length<4) maps.push(url)
        }
      }
      while(queue.length && seen.size<6 && !combined.aborted){
        const url=queue.shift()!; if(seen.has(url))continue; seen.add(url)
        const html=await read(url).catch(()=>''); if(!html)continue
        const found=contactFindingsFromHtml(html,url);result.pagesRead.push(url)
        result.emails.push(...found.emails);result.phones.push(...found.phones);result.socials.push(...found.socials);result.people.push(...found.people);result.addresses!.push(...(found.addresses ?? []))
        for(const link of html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) if(/contact|reach us|get in touch|locations|offices/i.test(link[1]+' '+readableHtml(link[2])))append(new URL(link[1],url).href)
      }
      result.emails=Array.from(new Map(result.emails.map(v=>[v.value,v])).values())
      result.phones=Array.from(new Map(result.phones.map(v=>[v.value,v])).values())
      result.addresses=uniqueAddresses(result.addresses ?? [])
      if(!result.pagesRead.length) result.error='The website could not be read. Try again or check its URL.'
    } finally { if(signal?.aborted)throw new DOMException('Enrichment cancelled','AbortError') }
    return result
  }

  /** Reads one lead's site and reports what it published. */
  async inspect(website: string, signal?: AbortSignal): Promise<WebsiteFindings> {
    const findings: WebsiteFindings = { emails: [], phones: [], socials: [], people: [], pagesRead: [], error: null }
    let origin: URL
    try {
      origin = new URL(website)
    } catch {
      findings.error = `"${website}" is not a usable web address.`
      return findings
    }
    const siteHost = origin.host.replace(/^www\./i, '')

    try {
      const browser = await this.launch()
      const context = await browser.newContext({
        viewport: { width: 1366, height: 900 },
        locale: 'en-GB',
        userAgent:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
      })
      const page = await context.newPage()
      page.setDefaultTimeout(20_000)
      page.setDefaultNavigationTimeout(25_000)

      const emailSet = new Map<string, FoundEmail>()
      const phoneSet = new Map<string, FoundPhone>()
      const socialSet = new Map<string, FoundSocial>()
      const peopleSet = new Map<string, FoundPerson>()

      const harvest = async (url: string): Promise<PageHarvest | null> => {
        if (signal?.aborted) throw new DOMException('Enrichment cancelled', 'AbortError')
        try {
          await page.goto(url, { waitUntil: 'domcontentloaded' })
          // Let late-injected footers and consent-free content settle without waiting for ads.
          await page.waitForTimeout(900)
          let collected = (await page.evaluate(COLLECT)) as PageHarvest

          // A number of WordPress/LiteSpeed sites inject their footer social links from a delayed
          // script. Read once quickly for ordinary sites, then give a page with no social links a
          // short, bounded second chance. This keeps scans fast while preventing a real Facebook,
          // LinkedIn or YouTube link from being reported as "No profiles found" just because it
          // appeared after DOMContentLoaded.
          if (
            !collected.links.some((link) =>
              /(?:instagram|facebook|linkedin|tiktok|youtube|youtu\.be|twitter|x\.com)/i.test(link.href),
            )
          ) {
            await page.waitForTimeout(3_500)
            collected = (await page.evaluate(COLLECT)) as PageHarvest
          }

          findings.pagesRead.push(url)
          return collected
        } catch {
          return null
        }
      }

      const absorb = (data: PageHarvest, url: string): string[] => {
        findings.addresses = [...new Set([...(findings.addresses ?? []), ...addressesFromHtml(data.html)])]
        // Structured people first: they carry a name and a title as data.
        for (const person of peopleFromJsonLd(data.jsonLd)) {
          const key = person.fullName.toLowerCase()
          if (!peopleSet.has(key)) {
            peopleSet.set(key, {
              fullName: person.fullName,
              title: person.title,
              linkedinUrl: person.linkedinUrl,
              evidence: 'schema.org Person markup', email: person.email, phone: person.phone,
            })
          }
        }

        // An address beside a person's name: the label names them, or the block around the link
        // gives them a role.
        for (const entry of data.mailto) {
          const label = entry.label.replace(/\s+/g, ' ').trim()
          const near = entry.near.replace(/\s+/g, ' ').trim()
          if (isUsablePerson(label, '')) {
            const role = near.match(ROLE_ANYWHERE)?.[0] ?? ''
            const key = label.toLowerCase()
            if (!peopleSet.has(key)) {
              peopleSet.set(key, {
                fullName: label,
                title: role,
                linkedinUrl: '',
                evidence: `${entry.address} published beside their name`, email: isUsableEmail(entry.address) ? entry.address : undefined,
              })
            }
          }
        }

        // A LinkedIn profile with a name and a role around it.
        for (const link of data.links) {
          if (!/linkedin\.com\/in\//i.test(link.href)) continue
          const name = link.near.match(/([A-Z][a-z]+(?:[^\S\n]+[A-Z][a-z'-]+){1,2})/)?.[1] ?? link.text
          if (!isUsablePerson(name, '')) continue
          const role = link.near.match(ROLE_ANYWHERE)?.[0] ?? ''
          const key = name.toLowerCase()
          if (!peopleSet.has(key)) {
            peopleSet.set(key, { fullName: name.trim(), title: role, linkedinUrl: link.href, evidence: 'LinkedIn profile page' })
          }
        }

        for (const address of cleanEmails([...data.mailto.map((entry) => entry.address), ...(data.text.match(/[\w.+-]+@[\w-]+\.[\w.-]+/g) ?? [])])) {
          if (emailSet.has(address)) continue
          emailSet.set(address, { value: address, score: scoreEmail(address, siteHost), page: url })
        }
        for (const raw of data.tel) {
          const value = normalisePhone(raw)
          if (!value || value.replace(/\D/g, '').length < 9) continue
          if (!phoneSet.has(value)) phoneSet.set(value, { value, page: url })
        }
        for (const link of data.links) {
          const social = socialFrom(link.href)
          if (!social) continue
          const key = `${social.platform}:${social.profileUrl}`
          if (!socialSet.has(key)) socialSet.set(key, social)
        }

        // A name beside a role in the page's own prose is the last resort for Tier 1: it is real
        // evidence, but the weakest kind, so it is recorded as such.
        const person = findPerson(data.text)
        if (person) {
          const key = person.fullName.toLowerCase()
          if (!peopleSet.has(key)) {
            peopleSet.set(key, {
              fullName: person.fullName,
              title: person.title,
              linkedinUrl: data.links.find((link) => /linkedin\.com\/in\//i.test(link.href))?.href ?? '',
              evidence: 'named beside a role on the site',
            })
          }
        }

        return data.links.filter((link) => isContactLink(link.href, link.text)).map((link) => link.href)
      }

      const home = await harvest(origin.href)
      if (!home) {
        findings.error = `${siteHost} could not be reached.`
        await context.close()
        return findings
      }

      // Follow at most two same-site contact-ish pages, which is where the details live.
      const candidates = absorb(home, origin.href)
        .filter((href) => {
          try {
            return new URL(href).host.replace(/^www\./i, '') === siteHost
          } catch {
            return false
          }
        })
        .slice(0, 2)

      for (const url of candidates) {
        const data = await harvest(url)
        if (data) absorb(data, url)
      }

      findings.emails = Array.from(emailSet.values()).sort((a, b) => b.score - a.score)
      findings.phones = Array.from(phoneSet.values())
      findings.socials = Array.from(socialSet.values())
      findings.people = Array.from(peopleSet.values())
      await context.close()
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') throw error
      findings.error = error instanceof Error ? error.message : String(error)
    }
    return findings
  }
}
