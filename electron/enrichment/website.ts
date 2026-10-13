// Reads a lead's own website to find the contact details a Maps listing does not publish.
//
// This is the step that turns a captured business into something worth contacting: a Maps entry
// gives a name and a phone, and the site it links to usually carries an address, sometimes a
// named person, and almost always a social profile. The worker drives one Chromium page through
// the site's home page and up to two contact-ish pages, then reports what it found.
//
// Nothing here writes to the database; it returns findings and the caller decides what to keep.
import { chromium, type Browser } from 'playwright'

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
}

export interface WebsiteFindings {
  emails: FoundEmail[]
  phones: FoundPhone[]
  socials: FoundSocial[]
  people: FoundPerson[]
  /** Pages actually read, so a run can report what it looked at. */
  pagesRead: string[]
  error: string | null
}

const SOCIAL_HOSTS: [RegExp, FoundSocial['platform']][] = [
  [/instagram\.com$/i, 'instagram'],
  [/facebook\.com$/i, 'facebook'],
  [/linkedin\.com$/i, 'linkedin'],
  [/tiktok\.com$/i, 'tiktok'],
  [/youtube\.com$|youtu\.be$/i, 'youtube'],
  [/twitter\.com$|(^|\.)x\.com$/i, 'x'],
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
  const host = url.host.replace(/^www\./i, '')
  for (const [pattern, platform] of SOCIAL_HOSTS) {
    if (!pattern.test(host)) continue
    // The first path segment is the handle, except for the shapes that put a keyword first.
    const segments = url.pathname.split('/').filter(Boolean)
    const handle = segments[0] && !['company', 'in', 'pages', 'profile.php', 'c', 'channel', 'user'].includes(segments[0])
      ? segments[0]
      : (segments[1] ?? '')
    return { platform, handle, profileUrl: `${url.origin}${url.pathname}`.replace(/\/$/, '') }
  }
  return null
}

/** Basic entity decoding is enough for hrefs and JSON-LD URLs without loading a browser. */
function decodeHtml(value: string): string {
  return value
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
  for (const match of html.matchAll(/https?:\/\/(?:www\.)?(?:instagram\.com|facebook\.com|linkedin\.com|tiktok\.com|youtube\.com|youtu\.be|twitter\.com|x\.com)[^\s"'<>\\]*/gi)) add(match[0])

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
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' '),
  ).trim()
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
  const people = peopleFromJsonLd(jsonLd).map((person) => ({
    fullName: person.fullName,
    title: person.title,
    linkedinUrl: person.linkedinUrl,
    evidence: 'schema.org Person markup',
  }))
  const prosePerson = findPerson(text)
  if (prosePerson && !people.some((person) => person.fullName.toLowerCase() === prosePerson.fullName.toLowerCase())) {
    people.push({ ...prosePerson, linkedinUrl: '', evidence: 'named beside a role on the site' })
  }

  return { emails, phones, socials: socialLinksFromHtml(html, pageUrl), people }
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
  if (digits.startsWith('0') && digits.length >= 10) return `+44 ${digits.slice(1).replace(/(\d{3})(\d{3})(\d+)/, '$1 $2 $3')}`.trim()
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
  return words.every((word, index) => /^[A-Z][a-z'-]*$/.test(word) || (index > 0 && /^(van|von|de|der|den|la|le|al|bin|mac|mc|da|di)$/.test(word)))
}

function isContactLink(href: string, text: string): boolean {
  return /contact|about|team|staff|our-people|meet|clinic|practice|book/i.test(`${href} ${text}`)
}

/** Link text and marketing copy that reads like a name beside a role but is neither. */
const PERSON_NOISE =
  /^(read more|learn more|find out|contact us|book now|view profile|see more|hair removal|our team|meet the|more info|get in touch|about us|click here|book online|our services)$/i

/**
 * Finds the first credible "Name — Role" pair on a page.
 *
 * Both halves are limited to a few words, because a page's prose will happily produce a
 * sentence-shaped name if the pattern is allowed to run. Anything that reads as a button, a
 * heading or a service is rejected rather than stored as a person.
 */
function findPerson(text: string): { fullName: string; title: string } | null {
  const pattern =
    /([A-Z][a-z]+(?:[^\S\n]+[A-Z][a-z'-]+){0,2})[^\S\n]*[\n·|][^\S\n]*(Director|Owner|Founder|Practice Manager|Clinic Director|Manager|Principal|Partner|Head of [A-Za-z]+(?:[^\S\n]+[A-Za-z]+){0,2}|Lead [A-Za-z]+(?:[^\S\n]+[A-Za-z]+){0,2}|Therapist|Dentist|Doctor|Dermatologist|Physiotherapist|Chiropractor|Surgeon|Consultant|Specialist|Practitioner)(?![A-Za-z])/g
  for (const match of text.matchAll(pattern)) {
    const fullName = match[1].trim()
    const title = match[2].trim()
    if (!isUsablePerson(fullName, title)) continue
    return { fullName, title }
  }
  return null
}

/** The role vocabulary, as a pattern that can be matched anywhere in a block of text. */
const ROLE_ANYWHERE = new RegExp(
  String.raw`\b(Director|Owner|Founder|Practice Manager|Clinic Director|Manager|Principal|Partner|Head of [A-Za-z]+(?:[^\S\n]+[A-Za-z]+){0,2}|Lead [A-Za-z]+(?:[^\S\n]+[A-Za-z]+){0,2}|Therapist|Dentist|Doctor|Dermatologist|Physiotherapist|Chiropractor|Surgeon|Consultant|Specialist|Practitioner)\b`,
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
function peopleFromJsonLd(blocks: string[]): { fullName: string; title: string; email: string; linkedinUrl: string }[] {
  const found: { fullName: string; title: string; email: string; linkedinUrl: string }[] = []
  const seen = new Set<string>()

  const readPerson = (node: Record<string, unknown>): void => {
    const name = typeof node.name === 'string' ? node.name.replace(/\s+/g, ' ').trim() : ''
    const title = typeof node.jobTitle === 'string' ? node.jobTitle.replace(/\s+/g, ' ').trim() : ''
    if (!name || !isUsablePerson(name, title)) return
    const key = name.toLowerCase()
    if (seen.has(key)) return
    seen.add(key)
    found.push({
      fullName: name,
      title,
      email: typeof node.email === 'string' ? node.email.replace(/^mailto:/i, '').trim() : '',
      linkedinUrl: typeof node.sameAs === 'string' && /linkedin\.com\/in\//i.test(node.sameAs) ? node.sameAs : '',
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
    for (const key of ['employee', 'founder', 'member', 'author', 'alumni']) {
      if (node[key]) visit(node[key])
    }
    if (node['@graph']) visit(node['@graph'])
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
          'user-agent': 'Nafran Leads contact scanner/1.3',
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
          'user-agent': 'Nafran Leads contact scanner/1.3',
        },
      })
      if (!response.ok) {
        findings.error = `${origin.host} returned HTTP ${response.status}.`
        return findings
      }
      const html = await response.text()
      if (signal?.aborted) throw new DOMException('Enrichment cancelled', 'AbortError')
      const pageUrl = response.url || origin.href
      const contacts = contactFindingsFromHtml(html, pageUrl)
      findings.pagesRead.push(pageUrl)
      findings.emails = contacts.emails
      findings.phones = contacts.phones
      findings.socials = contacts.socials
      findings.people = contacts.people
    } catch (error) {
      if (signal?.aborted) throw new DOMException('Enrichment cancelled', 'AbortError')
      findings.error = error instanceof Error ? error.message : `${origin.host} could not be fetched.`
    } finally {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
    }
    return findings
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
        // Structured people first: they carry a name and a title as data.
        for (const person of peopleFromJsonLd(data.jsonLd)) {
          const key = person.fullName.toLowerCase()
          if (!peopleSet.has(key)) {
            peopleSet.set(key, {
              fullName: person.fullName,
              title: person.title,
              linkedinUrl: person.linkedinUrl,
              evidence: 'schema.org Person markup',
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
                evidence: `${entry.address} published beside their name`,
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
