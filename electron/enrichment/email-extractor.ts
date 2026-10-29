// Pulling addresses out of a search result.
//
// The deep pass searches for a business's decision makers and reads the addresses out of the
// snippets Google returns. Those snippets are written by other people, so an address arrives in
// whatever shape the page that published it used: obfuscated against scrapers, wrapped in HTML
// entities, spaced out with zero-width characters, or broken across a Markdown code span.
//
// This module is the part that copes with that. It is deliberately the only place that decides what
// an address is, so a snippet's evidence can be checked against one implementation rather than
// several, and it is deliberately forgiving: a snippet that cannot be read is a snippet with no
// address in it, never a crash.
//
// What it produces is a candidate, not a fact. An address in a search snippet is somebody else's
// claim about a business, which is exactly why the app files deep hits as suggestions to confirm
// rather than as contacts.

export interface ExtractedEmail {
  /** The address, lower-cased, in the form it would be written in a mail client. */
  value: string
  /** The text it was found in, so a person can judge the claim rather than trust it. */
  source: string
  /** True when the value was written obfuscated or entity-encoded rather than plainly. */
  obfuscated: boolean
  /** The result URL the address was read from. Empty when the result named none. */
  url: string
  /**
   * The title, description and URL of the result item, used to decide whether the address is
   * about the business that was searched. Not shown on its own.
   */
  context: string
}

/** Cloudflare publishes these email labels for the browser to display, using a small XOR encoding. */
export function decodePublishedEmailHtml(html: string): string {
  return html.replace(/<(a|span)\b[^>]*\bdata-cfemail=["']([0-9a-f]+)["'][^>]*>[\s\S]*?<\/\1>/gi,(original,_tag,hex:string)=>{
    if (hex.length<4 || hex.length%2) return original
    const key=parseInt(hex.slice(0,2),16)
    const bytes=new Uint8Array((hex.length-2)/2)
    for (let i=2;i<hex.length;i+=2) bytes[(i-2)/2]=parseInt(hex.slice(i,i+2),16)^key
    const email=new TextDecoder().decode(bytes)
    return /^[^\s<>@]+@[^\s<>@]+\.[a-z]{2,}$/i.test(email) ? email : original
  })
}

/** Example programs and SQL rows describe test data, not contact details. */
export function stripContactCodeExamples(text: string): string {
  const example = /\b(?:insert\s+into\s+\S+[\s\S]*?\bvalues\s*\(|create\s+table\s+|select\s+.+\s+from\s+)|(?:const|let|var)\s+\w+\s*=|["'](?:email|name)["']\s*:/i
  const contactOnly=(body:string)=>/^(?:(?:e-?mail|contact)(?:\s+us)?\s*:?\s*)?(?:mailto:)?[^\s<>@]+@[^\s<>@]+\.[a-z]{2,}$/i.test(body.replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim())
  // HTML strings inside hydration scripts are data, not DOM blocks. Preserve whole scripts so
  // removing an example cannot accidentally join two script tags around the page's real content.
  const scripts:string[]=[]
  return text.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi,whole=>`\u0000CONTACT_SCRIPT_${scripts.push(whole)-1}\u0000`)
    .replace(/<pre\b[^>]*>([\s\S]*?)<\/pre>/gi, (whole,body:string)=>contactOnly(body)?whole:' ')
    .replace(/```[^\n]*\n[\s\S]*?```/g, ' ')
    .replace(/<code\b[^>]*>([\s\S]*?)<\/code>/gi, (whole, body: string) => {
      return contactOnly(body) ? whole : ' '
    })
    .replace(/<(td|p)\b[^>]*>([\s\S]*?)<\/\1>/gi, (whole, _tag: string, body: string) => example.test(body.replace(/<[^>]*>/g,' ')) ? ' ' : whole)
    .replace(/\u0000CONTACT_SCRIPT_(\d+)\u0000/g,(_whole,index:string)=>scripts[Number(index)])
}

/** Literal addresses and explicit [at]/(at) obfuscation; prose such as "team at company.com" is not an email. */
export function extractPublishedEmails(text: string): string[] {
  const decoded=text.replace(/&#(x[0-9a-f]+|[0-9]+);/gi,(_match,code:string)=>{
    const value=parseInt(code.replace(/^x/i,''),/^x/i.test(code)?16:10)
    return value>0 && value<=0x10ffff ? String.fromCodePoint(value) : ''
  }).replace(/\s*(?:\[\s*at\s*\]|\(\s*at\s*\))\s*/gi,'@').replace(/\s*(?:\[\s*dot\s*\]|\(\s*dot\s*\))\s*/gi,'.')
  return [...new Set((decoded.match(/[A-Z0-9._%+-]+@[A-Z0-9-]+(?:\.[A-Z0-9-]+)+/gi) ?? []).map(value=>value.toLowerCase()))]
}

/** A person named by a result snippet, still a suggestion until somebody confirms it. */
export interface ExtractedPerson {
  fullName: string
  title: string
  source: string
  url: string
}

/** Domain parts that mark an address as a placeholder rather than a mailbox. */
const PLACEHOLDER_DOMAINS = ['example.com', 'example.org', 'example.net', 'domain.com', 'yourdomain.com', 'email.com', 'sentry.io', 'wixpress.com']

/** Local parts that are roles or placeholders rather than a person's mailbox. */
const PLACEHOLDER_LOCALS = ['example', 'email', 'yourname', 'someone', 'name', 'test', 'user', 'no-reply', 'noreply', 'donotreply']

/**
 * The shapes an at-sign and a dot are written in when a page is hiding them.
 *
 * The dots are put back before the at-signs, because a page that hides both writes the dot first:
 * `ruth at northernspine dot co dot uk` has no dot for the at-sign's rule to recognise until the
 * dot words have been turned back. The full-width forms are here because a page typed with a
 * Chinese or Japanese input method carries `＠` and `．` rather than `@` and `.`.
 *
 * The spaced-word forms are the ones that have to be careful: "a dot product" is prose, not an
 * address, so the word after "dot" is only taken as a suffix when it is the length of one.
 */
const OBFUSCATIONS: [RegExp, string][] = [
  [/\s*\[\s*dot\s*\]\s*/gi, '.'],
  [/\s*\(\s*dot\s*\)\s*/gi, '.'],
  [/\s*\{\s*dot\s*\}\s*/gi, '.'],
  [/(?<=[a-z0-9])\s+dot\s+(?=[a-z]{2,4}\b)/gi, '.'],
  [/\s*\[\s*at\s*\]\s*/gi, '@'],
  [/\s*\(\s*at\s*\)\s*/gi, '@'],
  [/\s*\{\s*at\s*\}\s*/gi, '@'],
  [/(?<=[a-z0-9])\s+at\s+(?=[a-z0-9-]+\.)/gi, '@'],
]

/** Characters that are invisible or decorative and carry no meaning in an address. */
const INVISIBLE = /[\u200B-\u200D\u2060\uFEFF\u00AD]/g

/** Full-width and other wide punctuation, folded back to their ASCII forms. */
const WIDE: [RegExp, string][] = [
  [/[\uFF20]/g, '@'],
  [/[\uFF0E\u3002\uFF61]/g, '.'],
  [/[\uFF0D\u2010-\u2015]/g, '-'],
  [/[\uFF0B]/g, '+'],
  [/[\uFF3F]/g, '_'],
]

/** Reads the entities a page puts around an address, including the malformed ones. */
function decodeEntities(text: string): string {
  return text.replace(/&#x?[0-9a-f]*;?/gi, (match) => {
    const numeric = match.match(/^&#(x?)([0-9a-f]*);?$/i)
    if (!numeric) return match
    const digits = numeric[2]
    // A bare `&#;` or `&#x;` carries no digits: it is left as it is rather than turned into NaN.
    if (!digits) return match
    const code = Number.parseInt(digits, numeric[1] ? 16 : 10)
    if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return match
    try {
      return String.fromCodePoint(code)
    } catch {
      return match
    }
  })
}

/** Everything a snippet is folded down to before an address is looked for in it. */
function normalise(text: string): string {
  let out = decodeEntities(text)
  out = out.replace(INVISIBLE, '')
  for (const [pattern, replacement] of WIDE) out = out.replace(pattern, replacement)
  for (const [pattern, replacement] of OBFUSCATIONS) out = out.replace(pattern, replacement)
  // Markdown emphasis around an address is the page's formatting, not part of the address.
  out = out.replace(/[`*_]{1,3}/g, '')
  return out
}

/**
 * Whether an address is worth keeping.
 *
 * A masked value (`****@example.com`), a placeholder domain and a role mailbox are all things a
 * search result is full of and none of them is a decision maker's address, so they are dropped
 * rather than offered for confirmation.
 */
function worthKeeping(value: string): boolean {
  const [local, domain] = value.split('@')
  if (!local || !domain) return false
  if (!/^[a-z0-9.!+_%'-]+$/.test(local)) return false
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) return false
  if (/\*/.test(local)) return false
  if (PLACEHOLDER_DOMAINS.some((known) => domain === known || domain.endsWith(`.${known}`))) return false
  if (PLACEHOLDER_LOCALS.includes(local)) return false
  // A single-character local part is a mask or a typo, not a mailbox.
  if (local.length < 2) return false
  return true
}

/** The address pattern, applied to text that has already been folded to its plain form. */
const EMAIL_PATTERN = /[a-z0-9][a-z0-9.!+_%'-]*@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+/gi

/**
 * Every address in one piece of text.
 *
 * `obfuscated` is true when the text as it arrived did not already contain the address in plain
 * form — an address written `name [at] business [dot] com` is held to a lower standard than one
 * published as it is, and the card that shows it says which it was.
 */
export function extractEmails(text: string, limit = 20): ExtractedEmail[] {
  if (typeof text !== 'string' || !text) return []
  text=stripContactCodeExamples(text)
  const plain = text.toLowerCase()
  const read = normalise(text)
  const found = new Map<string, ExtractedEmail>()

  for (const match of read.matchAll(EMAIL_PATTERN)) {
    const value = match[0].toLowerCase().replace(/[.!'-]+$/, '')
    if (!worthKeeping(value)) continue
    if (found.has(value)) continue
    if (found.size >= limit) break
    found.set(value, {
      value,
      // A window around the address rather than the whole snippet: enough to see who it belongs to.
      source: snippetAround(read, match.index ?? 0, match[0].length),
      obfuscated: !plain.includes(value),
      url: '',
      context: '',
    })
  }
  return [...found.values()]
}

/** The words around an address, so the card can show what it was said about. */
function snippetAround(text: string, at: number, length: number): string {
  const from = Math.max(0, at - 90)
  const to = Math.min(text.length, at + length + 90)
  return `${from > 0 ? '…' : ''}${text.slice(from, to).replace(/\s+/g, ' ').trim()}${to < text.length ? '…' : ''}`
}

/**
 * Every string anywhere in a result, however deeply nested.
 *
 * A SERP response carries its text under whichever keys the result type happens to use — `snippet`,
 * `description`, `items`, `references`, and more inside an AI Overview — so the extractor walks the
 * whole structure rather than a list of keys it would have to keep adding to. The ceiling is deep
 * enough for the nesting a real response arrives in and shallow enough that a structure with a cycle
 * cannot run away: `serp.tasks[].result[].items[].references[].text` is already six levels down.
 */
export function collectText(value: unknown, depth = 0, seen = new Set<unknown>()): string[] {
  if (depth > 24 || value == null) return []
  if (typeof value === 'string') return [value]
  if (typeof value !== 'object') return []
  if (seen.has(value)) return []
  seen.add(value)

  if (Array.isArray(value)) return value.flatMap((entry) => collectText(entry, depth + 1, seen))
  return Object.values(value as Record<string, unknown>).flatMap((entry) => collectText(entry, depth + 1, seen))
}

/**
 * Every address in a whole SERP result, each with the text it came from.
 *
 * The order is the order the results arrived in, because a snippet Google ranked higher is the one
 * a person would have read first, and the list is offered for judgement rather than used as fact.
 */
interface ResultContext {
  url: string
  text: string
}

const EMPTY_CONTEXT: ResultContext = { url: '', text: '' }

/** The page a result item points at, when it points at one. */
function pageUrl(record: Record<string, unknown>): string {
  for (const key of ['url', 'link', 'source_url']) {
    const value = record[key]
    if (typeof value === 'string' && /^https?:\/\//i.test(value)) return value
  }
  return ''
}

/** The words a result item uses to describe itself, apart from the nested items under it. */
function ownText(record: Record<string, unknown>): string {
  const bits: string[] = []
  for (const key of ['title', 'description', 'snippet', 'text', 'markdown']) {
    const value = record[key]
    if (typeof value === 'string') bits.push(value)
  }
  return bits.join(' ')
}

/** A SERP item, as opposed to the envelope the items are wrapped in. */
function isResultItem(record: Record<string, unknown>): boolean {
  return (
    typeof record.url === 'string' ||
    typeof record.title === 'string' ||
    typeof record.snippet === 'string' ||
    typeof record.description === 'string' ||
    typeof record.type === 'string'
  )
}

/**
 * Walks a result, keeping each address with the item it was found in.
 *
 * The envelope around the items — the task, the keyword, the cost — is not part of any item, so
 * an address found in one result is not credited to the title of the result above it. A nested
 * reference does keep its parent's title: that parent is the page the reference was quoted from.
 */
function walkResult(
  value: unknown,
  context: ResultContext,
  found: Map<string, ExtractedEmail>,
  limit: number,
  depth: number,
  seen: Set<unknown>,
): void {
  if (found.size >= limit || depth > 24 || value == null) return
  if (typeof value === 'string') {
    for (const email of extractEmails(value, limit)) {
      if (found.has(email.value)) continue
      found.set(email.value, { ...email, url: context.url, context: context.text })
      if (found.size >= limit) return
    }
    return
  }
  if (typeof value !== 'object') return
  if (seen.has(value)) return
  seen.add(value)

  if (Array.isArray(value)) {
    for (const entry of value) walkResult(entry, context, found, limit, depth + 1, seen)
    return
  }

  const record = value as Record<string, unknown>
  const next = isResultItem(record)
    ? {
        url: pageUrl(record) || context.url,
        text: `${context.text} ${ownText(record)} ${pageUrl(record)}`.trim().slice(-4000),
      }
    : context
  for (const [key, entry] of Object.entries(record)) {
    // The URL is recorded as the source, not scanned: a path is not a sentence about the business.
    if (key === 'url' || key === 'link' || key === 'source_url' || key === 'domain') continue
    walkResult(entry, next, found, limit, depth + 1, seen)
  }
}

export function extractEmailsFromResult(result: unknown, limit = 20): ExtractedEmail[] {
  const found = new Map<string, ExtractedEmail>()
  walkResult(result, EMPTY_CONTEXT, found, limit, 0, new Set())
  return [...found.values()]
}

const PERSON_TITLE = '(?:co[- ]?founder|co[- ]?owner|founder|owner|principal|managing director|director|chief executive officer|ceo)'
const PERSON_NAME = "[\\p{Lu}][\\p{L}.'’-]*(?:[^\\S\\r\\n]+(?:van|von|de|der|den|la|le|al|bin|ibn|da|di|[\\p{Lu}][\\p{L}.'’-]*)){1,3}"

/**
 * A name as somebody actually wrote it, with the words around it taken off.
 *
 * A snippet that introduces a person writes the introduction into the sentence — "Hi, I'm Ruth
 * Taylor, founder of…", "I'm Razi Siddiqui (CEO)" — and the name pattern is greedy enough to carry
 * that opening into the name. "I'm Razi Siddiqui" is not a person's name, and filing it as one
 * puts a suggestion on screen that reads like a bug.
 */
/**
 * A word that is part of somebody's job rather than their name.
 *
 * "Moeed Shahid Chief Technology, Director at Rex Technologies" came back from a live search as a
 * person called "Moeed Shahid Chief Technology": the name pattern is happy to carry four capitalised
 * words, and the first two words of the job title look exactly like the last two of a name. A name
 * is cut at the first of these words, but only where two words are left — so a surname that happens
 * to be one of them is not mistaken for a title.
 */
const TITLE_WORD = /^(?:chief|technology|technical|officer|executive|head|manager|managing|director|founder|co|owner|principal|partner|lead|senior|junior|digital|marketing|sales|operations|growth|strategy|cto|ceo|coo|cfo|md)$/i

function cleanPersonName(value: string): string {
  const stripped = value
    .replace(/^[\s,;:|–—-]+|[\s,;:|–—-]+$/g, '')
    .replace(/^(?:hi|hello|hey)[\s,]+/i, '')
    .replace(/^(?:i\s*['’]?\s*(?:am|m)|my name is|this is|we\s*['’]?\s*(?:are|re))\s+/i, '')
    .replace(/^[A-Z][a-z]+-born\s+/, '')
    .replace(/\s+/g, ' ')
    .trim()
  const words = stripped.split(' ')
  const cut = words.findIndex((word, index) => index >= 2 && (TITLE_WORD.test(word) || /^[\p{Ll}]/u.test(word) && !/^(?:van|von|de|der|den|la|le|al|bin|ibn|da|di)$/.test(word)))
  const name = cut >= 2 ? words.slice(0, cut).join(' ') : stripped
  // The surrounding sentence is case-insensitive; its trailing "in London" or full stop
  // must not become part of a capitalized person's name and make the entire match fail.
  return name.replace(/([\p{L}]{2,})[.;:]$/u,'$1')
}

/**
 * A word that opens a sentence about a person rather than naming one.
 *
 * The preposition matters as much as the pronoun: "CEO Of Rextech Studios" is a title followed by a
 * company, and the name pattern reads "Of Rextech Studios" as a person unless the opening word is
 * one this app refuses to start a name with.
 */
const NOT_A_NAME_START = /^(?:i|i['’]?m|im|we|we['’]?re|my|our|me|us|he|she|they|it|you|your|the|this|that|company|business|team|about|contact|read|meet|of|at|for|and|with|from|by|in|on|to|a|an|is|are|was|were|our|its)$/i

function isPersonName(value: string): boolean {
  const words = value.split(/\s+/)
  if (words.length < 2 || words.length > 4) return false
  if (!words.every((word,index) => /^\p{Lu}[\p{L}'’.-]*$/u.test(word) && (!/[.,;:!?]$/.test(word) || /^\p{Lu}\.$/u.test(word)) || index>0 && /^(?:van|von|de|der|den|la|le|al|bin|ibn|da|di)$/.test(word))) return false
  if (/^(?:stories|ecommerce|migration|inspiring|insights|resources|business|entrepreneurs)\b|\b(?:founder|founders|owner|owners)\b/i.test(value)) return false
  if (/\b(?:llc|ltd|limited|inc|incorporated|corporation|company)\.?$/i.test(value)) return false
  return !NOT_A_NAME_START.test(words[0])
}

/** Extracts named founders/owners from the title and snippet text of a SERP result. */
export function extractPeople(text: string, limit = 8): ExtractedPerson[] {
  if (typeof text !== 'string' || !text.trim()) return []
  text=stripContactCodeExamples(text)
  const found = new Map<string, ExtractedPerson>()
  const add = (name: string, title: string, source: string) => {
    const fullName = cleanPersonName(name)
    if (!isPersonName(fullName)) return
    const key = fullName.toLowerCase()
    if (found.has(key) || found.size >= limit) return
    // The same person is often written two ways on one page — "Razi Siddiqui" in a heading and
    // "Razi Siddiqui, CEO" in the line under it. Filing both puts two cards on screen for one
    // person to confirm, so a name that is already covered by one that was read is dropped.
    for (const seen of found.keys()) {
      if (seen.includes(key) || key.includes(seen)) return
    }
    found.set(key, { fullName, title: title.replace(/[-]+/g, ' ').replace(/\s+/g, ' ').trim(), source: snippetAround(text, Math.max(0, text.indexOf(name)), name.length), url: '' })
  }

  // A date and a job title can sit inside a founding statement. Process the explicit
  // founding evidence before a nearby CEO title so the staff role cannot hide ownership.
  const foundedBy = new RegExp(`\\b(?:co[- ]?founded|founded|started|established)(?:\\s+in\\s+\\d{4})?\\s+by\\s+(?:(?:the\\s+)?(?:then\\s+)?(?:CEO|chief executive officer|president)\\s+)?(${PERSON_NAME})`, 'giu')
  for (const match of text.matchAll(foundedBy)) add(match[1], 'Founder', text)

  const titleFirst = new RegExp(`\\b(${PERSON_TITLE})\\b\\s*(?:is|:|-|–|—|,)?\\s+(${PERSON_NAME})`, 'giu')
  for (const match of text.matchAll(titleFirst)) add(match[2], match[1], text)

  // A separator is required here: without it, the company in “Northern Spine founder Ruth
  // Taylor” would be mistaken for a person before the title-first rule sees Ruth Taylor.
  const nameFirst = new RegExp(`\\b(${PERSON_NAME})\\s*(?:,|[-–—])\\s*(${PERSON_TITLE})\\b`, 'giu')
  for (const match of text.matchAll(nameFirst)) add(match[1], match[2], text)

  const nameBeforeIs = new RegExp(`\\b(${PERSON_NAME})\\s+(?:is|was)\\s+(?:the\\s+)?(${PERSON_TITLE})\\b`, 'giu')
  for (const match of text.matchAll(nameBeforeIs)) add(match[1], match[2], text)
  const nameFounded = new RegExp(`\\b(${PERSON_NAME})\\s+(?:has\\s+)?(?:co[- ]?founded|founded|started|established)\\b`, 'giu')
  for (const match of text.matchAll(nameFounded)) add(match[1], 'Founder', text)
  // A joint founder sentence is evidence for both people, not a single concatenated name.
  const photoPosition='(?:\\s*\\((?:left|right|centre|center)\\))?'
  const jointFounders=new RegExp(`\\b(${PERSON_NAME})${photoPosition}\\s+(?:and|&)\\s+(${PERSON_NAME})${photoPosition}\\s+(?:(?:are|were)\\s+(?:the\\s+)?(?:co[- ]?)?(?:founders|owners)|(?:co[- ]?founded|founded|started|established))\\b`,'giu')
  for(const match of text.matchAll(jointFounders)){add(match[1],'Founder',text);add(match[2],'Founder',text)}
  return [...found.values()]
}

function walkPeople(
  value: unknown,
  context: ResultContext,
  found: Map<string, ExtractedPerson>,
  limit: number,
  depth: number,
  seen: Set<unknown>,
): void {
  if (found.size >= limit || depth > 24 || value == null) return
  if (typeof value === 'string') {
    for (const person of extractPeople(value, limit)) {
      const key = person.fullName.toLowerCase()
      if (found.has(key) || found.size >= limit) continue
      found.set(key, { ...person, source: person.source || context.text, url: context.url })
    }
    return
  }
  if (typeof value !== 'object' || seen.has(value)) return
  seen.add(value)
  if (Array.isArray(value)) {
    for (const entry of value) walkPeople(entry, context, found, limit, depth + 1, seen)
    return
  }
  const record = value as Record<string, unknown>
  const next = isResultItem(record)
    ? {
        url: pageUrl(record) || context.url,
        text: `${context.text} ${ownText(record)} ${pageUrl(record)}`.trim().slice(-4000),
      }
    : context
  for (const [key, entry] of Object.entries(record)) {
    if (key === 'url' || key === 'link' || key === 'source_url' || key === 'domain') continue
    walkPeople(entry, next, found, limit, depth + 1, seen)
  }
}

/** Every named founder/owner in a whole SERP result, with the snippet and URL it came from. */
export function extractPeopleFromResult(result: unknown, limit = 8): ExtractedPerson[] {
  const found = new Map<string, ExtractedPerson>()
  walkPeople(result, EMPTY_CONTEXT, found, limit, 0, new Set())
  return [...found.values()]
}
