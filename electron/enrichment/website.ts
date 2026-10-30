// Reads a lead's own website to find the contact details a Maps listing does not publish.
//
// This is the step that turns a captured business into something worth contacting: a Maps entry
// gives a name and a phone, and the site it links to usually carries an address, sometimes a
// named person, and almost always a social profile. The worker drives one Chromium page through
// the site's home page and up to two contact-ish pages, then reports what it found.
//
// Nothing here writes to the database; it returns findings and the caller decides what to keep.
import { chromium, type Browser } from 'playwright'
import { parse, parseFragment, serialize, type DefaultTreeAdapterMap } from 'parse5'
import { isBusinessOwner, ownerEmail } from './owner-contact'
import { decodePublishedEmailHtml, extractPeople, extractPublishedEmails, stripContactCodeExamples } from './email-extractor'
import { canonicalSocialProfile, socialPlatformOf, socialProfileIdentity } from '../social-profile'
import {compareEmailContacts,emailContactPriority} from '../email-ranking'


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
  /** Strength of the website's main contact evidence; not call-volume verification. */
  score?: number
}

export interface FoundSocial {
  platform: 'instagram' | 'facebook' | 'linkedin' | 'tiktok' | 'youtube' | 'x' | 'other'
  handle: string
  profileUrl: string
  page?: string
}

export interface FoundPerson {
  fullName: string
  title: string
  linkedinUrl: string
  /** Where the name came from, shown beside it so a person can be judged rather than trusted. */
  evidence: string
  /** Both public pages when an explicit short owner signature is resolved by its own team list. */
  identityEvidence?: string[]
  email?: string
  emailEvidence?: 'page' | 'search-index' | 'personal-page'
  phone?: string
}

export interface WebsiteFindings {
  businessName?: string
  addresses?: string[]
  emails: FoundEmail[]
  phones: FoundPhone[]
  socials: FoundSocial[]
  people: FoundPerson[]
  /** Older schema-only owner names superseded by the site's visible current ownership page. */
  supersededOwnerNames?: string[]
  /** Pages actually read, so a run can report what it looked at. */
  pagesRead: string[]
  error: string | null
}

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
  [/^(careers|jobs|press|pr|marketing|accounts|billing|payroll|noreply|no-reply|donotreply|notice|notices|legal|privacy|abuse|compliance|copyright|webmaster)$/i, -20],
]

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
export function socialLinksFromHtml(html: string, baseHref: string): FoundSocial[] {
  const own=canonicalSocialProfile(baseHref),platformPage=Boolean(socialPlatformOf(baseHref))
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

  if(own)add(own.profileUrl)
  // Platform feeds contain other people's accounts and corporate footer links. Only the
  // supplied account and explicit owner metadata are evidence on a platform page.
  if(!platformPage)for(const link of siteLinksFromHtml(html, true))add(link.href)
  const collectUrls=(value:unknown):void=>{
    if(typeof value==='string'){
      const text=decodeHtml(value.replace(/\\\//g,'/'))
      for(const match of text.matchAll(/https?:\/\/[^\s"'<>\\]+/g)){
        let raw=match[0]
        try{const url=new URL(raw);if(platformPage&&/^(?:www\.)?youtube\.com$/.test(url.hostname)&&url.pathname==='/redirect')raw=url.searchParams.get('q')||url.searchParams.get('url')||raw}catch{/* not a URL */}
        add(raw)
      }
    }else if(Array.isArray(value))value.forEach(collectUrls)
    else if(value&&typeof value==='object')Object.values(value).forEach(collectUrls)
  }
  const metadata=(value:unknown):void=>{
    if(Array.isArray(value)){value.forEach(metadata);return}
    if(!value||typeof value!=='object')return
    for(const [key,item] of Object.entries(value)){
      if(key==='sameAs'||(!platformPage&&/^(?:socials?|socialLinks?|socialMedia|(?:facebook|instagram|linkedin|youtube|tiktok|twitter|x)(?:Url|Link|Profile)?)$/i.test(key))||(platformPage&&/^(?:channelHeaderLinksRenderer|channelHeaderLinksViewModel|aboutChannelViewModel)$/i.test(key)))collectUrls(item)
      else metadata(item)
    }
  }
  for(const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)){
    const script=match[1].trim()
    try{metadata(JSON.parse(script));continue}catch{/* Some sites assign their page data to a variable. */}
    const assignment=script.match(/^(?:var\s+|window\.)?(?:ytInitialData|__NEXT_DATA__|__INITIAL_STATE__|__NUXT__)\s*=\s*([\s\S]*?);?$/)
    if(assignment)try{metadata(JSON.parse(assignment[1].replace(/;\s*$/,'')))}catch{/* Never evaluate site scripts. */}
    if(!platformPage){
      // Escaped application/config fragments still need an explicit social property name.
      const unescaped=script.replace(/\\"/g,'"').replace(/\\\//g,'/')
      for(const property of unescaped.matchAll(/["'](?:sameAs|socials?|socialLinks?|socialMedia|(?:facebook|instagram|linkedin|youtube|tiktok|twitter|x)(?:Url|Link|Profile)?)["']\s*:\s*("(?:[^"\\]|\\.)*"|'[^']*'|\[[^\]]{0,10000}\])/gi))collectUrls(property[1])
    }
  }

  const found = new Map<string, FoundSocial>()
  for (const href of candidates) {
    const social = canonicalSocialProfile(href)
    if (!social) continue
    found.set(socialProfileIdentity(social), {...social,page:baseHref})
  }
  return Array.from(found.values())
}

/** Turns server HTML into enough readable text for mailboxes, numbers and named people. */
export function readableHtml(html: string): string {
  // Read text nodes, not a regex-stripped HTML string: attributes can contain markup,
  // JSON and > characters which must never become a visible person's name.
  const walk=(node:DefaultTreeAdapterMap['node']):string=>{
    if('value' in node)return node.value
    if('tagName' in node && /^(?:script|style|template|noscript|head|title|svg)$/.test(node.tagName))return ''
    const text='childNodes' in node?node.childNodes.map(walk).join(' '):''
    return 'tagName' in node && /^(?:h[1-6]|p|div|section|article|li|br|tr|address|table|ul|ol)$/.test(node.tagName)?'\n'+text+'\n':text
  }
  return walk(parseFragment(html)).replace(/[^\S\n]+/g,' ').replace(/ *\n */g,'\n').replace(/\n+/g,'\n').trim()
}

/** Read a published brand name, without inventing a name from a page title or domain. */
export function businessNameFromHtml(html: string): string {
  let metaName = '', schemaName = ''
  const visitSchema = (value: unknown): void => {
    if (!value || typeof value !== 'object') return
    if (Array.isArray(value)) { value.forEach(visitSchema); return }
    const item = value as Record<string, unknown>
    const types = Array.isArray(item['@type']) ? item['@type'].join(' ') : String(item['@type'] ?? '')
    if (!schemaName && /Organization|LocalBusiness|ProfessionalService|LegalService|Attorney|MedicalBusiness|Restaurant|Store|WebSite/i.test(types) && typeof item.name === 'string') schemaName = item.name.trim()
    if (item['@graph']) visitSchema(item['@graph'])
  }
  const walk = (node: DefaultTreeAdapterMap['node']): void => {
    if ('tagName' in node) {
      const attrs = Object.fromEntries(node.attrs.map(attr=>[attr.name,attr.value]))
      if (node.tagName === 'meta' && (attrs.property || attrs.name || '').toLowerCase() === 'og:site_name') metaName = (attrs.content || '').trim()
      if (node.tagName === 'script' && (attrs.type || '').toLowerCase() === 'application/ld+json') {
        try { visitSchema(JSON.parse(node.childNodes.map(child=>'value' in child ? child.value : '').join(''))) } catch { /* Optional malformed schema. */ }
      }
    }
    if ('childNodes' in node) node.childNodes.forEach(walk)
  }
  walk(parse(html))
  const value = (metaName || schemaName).replace(/\s+/g,' ').trim()
  return value.length > 1 && value.length <= 160 && !/^(?:home|website|untitled|wordpress)$/i.test(value) ? value : ''
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

/** Parse real navigation anchors, including unquoted HTML attributes, without reading script templates. */
function siteLinksFromHtml(html: string, visibleOnly = false): { href: string; label: string }[] {
  const links: {href:string;label:string}[]=[]
  const visit=(node:DefaultTreeAdapterMap['node']):void=>{
    if (visibleOnly && 'tagName' in node) {
      const style = node.attrs.find(item => item.name === 'style')?.value || ''
      if (node.attrs.some(item => item.name === 'hidden') || /(?:^|;)\s*(?:display\s*:\s*none|visibility\s*:\s*hidden|(?:width|height)\s*:\s*0(?:px)?\s*(?:;|$))/i.test(style)) return
    }
    if ('tagName' in node && node.tagName==='a') {
      const attr=(name:string)=>node.attrs.find(item=>item.name===name)?.value ?? ''
      if(attr('href'))links.push({href:attr('href'),label:readableHtml(serialize(node)).replace(/\s+/g,' ').trim() || attr('aria-label') || attr('title')})
    }
    if('childNodes' in node)node.childNodes.forEach(visit)
  }
  visit(parse(html));return links
}

/** Explicit first-name owner signatures can be resolved only by the site's own named team. */
function shortOwnerSignaturesFromHtml(html:string):string[]{
  const names=new Set<string>()
  const visit=(node:DefaultTreeAdapterMap['node']):void=>{
    if('tagName' in node){
      const labels=node.attrs.filter(attr=>attr.name==='class'||attr.name==='id').map(attr=>attr.value).join(' ')
      if(/^(?:script|style|nav|header|footer)$/.test(node.tagName)||/testimoni|customer[-_ ]?(?:story|stories|review|quote)|client[-_ ]?(?:story|stories|review)/i.test(labels))return
      if(/^(?:p|h[1-6]|li)$/.test(node.tagName)){
        const text=readableHtml(serialize(node)).replace(/\s+/g,' ').trim()
        const match=text.match(/^([\p{L}'’-]+(?:(?:\s*,\s*|\s+(?:and|&)\s+)[\p{L}'’-]+){1,3})\s*[,·|:–—-]?\s*(?:co[- ]?)?(?:founders|owners)\.?$/iu)
        if(match){const parts=match[1].split(/\s*,\s*|\s+(?:and|&)\s+/i);if(parts.every(name=>/^\p{Lu}[\p{L}'’-]+$/u.test(name)))parts.forEach(name=>names.add(name))}
      }
    }
    if('childNodes' in node)node.childNodes.forEach(visit)
  }
  visit(parse(html));return [...names]
}

/** Names must be in visible team headings/cards; an ordinary mention is insufficient. */
function namedTeamCardsFromHtml(html:string):string[]{
  const document=parse(html),names=new Set<string>()
  let teamHeading=false
  const heading=(node:DefaultTreeAdapterMap['node']):void=>{
    if('tagName' in node && /^h[1-3]$/.test(node.tagName)){
      const text=readableHtml(serialize(node)).replace(/\s+/g,' ').trim()
      if(/^(?:(?:meet|about) (?:our |the )?|our |core )?(?:team|people|leadership|management team|staff|founders|owners)$/i.test(text))teamHeading=true
    }
    if('childNodes' in node)node.childNodes.forEach(heading)
  }
  heading(document);if(!teamHeading)return []
  const visit=(node:DefaultTreeAdapterMap['node']):void=>{
    if('tagName' in node){
      const labels=node.attrs.filter(attr=>attr.name==='class'||attr.name==='id').map(attr=>attr.value).join(' ')
      if(/^(?:script|style|nav|header|footer)$/.test(node.tagName)||/testimoni|customer[-_ ]?(?:story|stories|review|quote)|client[-_ ]?(?:story|stories|review)/i.test(labels))return
      const cardName=/^h[1-4]$/.test(node.tagName) || /^(?:a|strong|b)$/.test(node.tagName) && node.parentNode && 'tagName' in node.parentNode && /^(?:li|p)$/.test(node.parentNode.tagName)
      if(cardName){const name=readableHtml(serialize(node)).replace(/\s+/g,' ').trim();if(name.split(/\s+/).length>=2 && isUsablePerson(name,''))names.add(name)}
    }
    if('childNodes' in node)node.childNodes.forEach(visit)
  }
  visit(document);return [...names]
}

/** Finds contact details already in the first server response, without starting Chromium. */
export function contactFindingsFromHtml(html: string, pageUrl: string): Omit<WebsiteFindings, 'error' | 'pagesRead'> {
  html=decodePublishedEmailHtml(stripContactCodeExamples(html))
  const origin = new URL(pageUrl)
  const siteHost = origin.host.replace(/^www\./i, '')
  const text = readableHtml(html)
  const emails = cleanEmails([
    ...Array.from(html.matchAll(/mailto:([^"'\s?<>]+)/gi), (match) => decodeHtml(match[1])),
    ...(text.match(/[\w.+-]+@[\w-]+\.[\w.-]+/g) ?? []),
    ...extractPublishedEmails(text),
  ]).map((value) => ({ value, score: scoreEmail(value, siteHost), page: pageUrl }))

  const phones = publishedPhonesFromHtml(html,pageUrl)

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
      if(phone.replace(/\D/g,'').length>=9 && phone.replace(/\D/g,'').length<=15 && !phones.some(item=>item.value===phone))phones.push({value:phone,page:pageUrl})
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
    const existing=people.find((saved) => saved.fullName.toLowerCase() === person.fullName.toLowerCase())
    if (!existing) {
      people.push({ ...person, linkedinUrl: '', email: '', phone: '', evidence: pageUrl })
    } else if(!existing.title || isBusinessOwner(person.title) && !isBusinessOwner(existing.title))existing.title=person.title
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
    if (person.phone && normalisePhone(person.phone) && !phones.some(item=>item.value===normalisePhone(person.phone!))) phones.push({value:normalisePhone(person.phone),page:pageUrl})
  }

  return { businessName: businessNameFromHtml(html), addresses: addressesFromHtml(html), emails, phones, socials: socialLinksFromHtml(html, pageUrl).map(social=>({...social,page:pageUrl})), people }
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

/** Published tel links and visible phone text, excluding clearly labelled IDs and dates. */
export function publishedPhonesFromHtml(html: string, page: string): FoundPhone[] {
  const found=new Map<string,FoundPhone>()
  const contactPage=/\/(?:contact(?:-us)?|contactus|reach-us|get-in-touch)(?:\/|\.[a-z]+$|$)/i.test(new URL(page).pathname)
  const add=(raw:string,score=20)=>{
    const value=normalisePhone(raw),digits=value.replace(/\D/g,'')
    score=Math.min(100,Math.max(1,score+(contactPage?10:0)))
    if(digits.length>=9 && digits.length<=15 && score>(found.get(digits)?.score ?? -1))found.set(digits,{value,page,score})
  }
  const walk=(node:DefaultTreeAdapterMap['node'],inChrome=false):void=>{
    if('tagName' in node){
      if(['script','style','noscript','template'].includes(node.tagName))return
      inChrome ||= ['header','footer'].includes(node.tagName)
      const href=node.attrs.find(attr=>attr.name==='href')?.value || ''
      if(/^tel:/i.test(href.trim())){
        const context=readableHtml(serialize(node.parentNode ?? node)).slice(0,1000)
        const secondary=/\b(?:fax|careers|recruitment|press|media enquiries)\b/i.test(context) && !/\b(?:main|reception|switchboard|general enquiries)\b/i.test(context)
        add(href.trim(),50+(inChrome?20:0)+(/\b(?:main|reception|switchboard|general enquiries|call us|call now)\b/i.test(context)?25:0)-(secondary?50:0))
      }
    }
    if('childNodes' in node)node.childNodes.forEach(child=>walk(child,inChrome))
  }
  walk(parse(html))
  for(const line of readableHtml(html).split('\n'))for(const match of line.matchAll(/\+?\d[\d ().-]{7,}\d/g)) {
    const before=line.slice(Math.max(0,(match.index ?? 0)-45),match.index)
    if(/(?:order|invoice|reference|registration|company\s*(?:no|number|id)|tax|vat|cnic|ntn|iban|account|sku|isbn|tracking|postal|postcode|zip|amount|price|total)\b[^\d\n]{0,25}$/i.test(before) && !/(?:phone|tel|mobile|whatsapp|call|fax)\b[^\d\n]{0,18}$/i.test(before))continue
    if(/^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|^\d{1,2}[-/.]\d{1,2}[-/.]\d{4}(?:$|\s)/.test(match[0]))continue
    add(match[0],20+(/(?:phone|tel|mobile|whatsapp|call)\b[^\d\n]{0,18}$/i.test(before)?15:0)-(/fax\b[^\d\n]{0,18}$/i.test(before)?30:0))
  }
  const structured=(value:unknown):void=>{
    if(Array.isArray(value)){value.forEach(structured);return}
    if(!value || typeof value!=='object')return
    const node=value as Record<string,unknown>,type=String(node['@type'] ?? '')
    const score=/Organization|LocalBusiness|Corporation|ProfessionalService|Store|Restaurant|Dentist|Medical|LegalService|Attorney/i.test(type)?70:/ContactPoint/i.test(type)?65:25
    for(const phone of Array.isArray(node.telephone)?node.telephone:[node.telephone])if(typeof phone==='string')add(phone,score+(/customer service|main|reception/i.test(String(node.contactType ?? ''))?15:0))
    Object.values(node).forEach(structured)
  }
  for(const match of html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)){try{structured(JSON.parse(decodeHtml(match[1])))}catch{/* Optional markup. */}}
  return [...found.values()].sort((a,b)=>(b.score ?? 0)-(a.score ?? 0))
}

/** Decodes tel links, strips extensions and rejects values beyond phone digit limits. */
export function normalisePhone(raw: string): string {
  let value=decodeHtml(raw).replace(/^tel:/i,'')
  try{value=decodeURIComponent(value)}catch{return ''}
  value=value.split(/[;?]/)[0].replace(/\s*(?:ext\.?|extension|x)\s*\d+\s*$/i,'').trim()
  // Four dotted octets are an IPv4 address, not a published phone number.
  if(/^\d{1,3}(?:\.\d{1,3}){3}$/.test(value)&&value.split('.').every(part=>Number(part)<=255))return ''
  if(value.startsWith('+'))value=value.replace(/\(0\)/g,'')
  const number=(value.startsWith('+')?'+':'')+value.replace(/\D/g,'')
  const digits=number.replace(/\D/g,'')
  if(digits.length<9 || digits.length>15)return ''
  if(number.startsWith('+44'))return ('+44 '+number.slice(3).replace(/(\d{3})(\d{3})(\d+)/,'$1 $2 $3')).trim()
  return number
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
  if (/^(?:a|an|the|our|your|this|that|latest|featured|company|business|meet|read|learn|how|why|what|for|start|quick)\b/i.test(name)) return false
  if (/[\n\r]/.test(name)) return false
  if (/\b(?:pricing|login|signup|sign|menu|subscribe|download|started|websites?|domains?|portfolio|internet|properties|get)\b/i.test(name)) return false
  if (/^(?:ceo|cto|cfo|coo|cmo|chief|director|manager|officer)\b/i.test(name)) return false
  if (/^(?:e-?mail|call|telephone|phone|contact|meet|message|connect with)\b/i.test(name)) return false
  if (PERSON_NOISE.test(name) || PERSON_NOISE.test(title.trim())) return false
  if (SERVICE_WORDS.test(name)) return false
  // Title-cased marketing headings often sit in the same section as a founder bio. They are not
  // names, and following them would spend a paid search on a slogan instead of the actual owner.
  if (/\b(?:engineering|consistency|compounds|approach|workspace|diagnostic|links|flow|journey|growth|solutions|mission|vision|values|systems|performance|ourselves|yourself)\b/i.test(name)) return false
  if (/^(?:stories|ecommerce|migration|inspiring|insights|resources|entrepreneurs)\b|\b(?:founder|founders|owner|owners)\b/i.test(name)) return false
  if (/\b(?:llc|ltd|limited|inc|incorporated|corporation|company|co)\.?$/i.test(name)) return false
  if (/\b(?:introduction|pro|when|where|who|which|what|why|how|overview)\b/i.test(name)) return false
  if (/^(?:type|industry|headquarters|key people|website|services|private|public)\b/i.test(name)) return false

  const words = name.split(/\s+/)
  if (words.length > 4) return false
  // Each word is capitalised, or a lowercase particle that only appears inside a name.
  return words.every((word, index) => /^\p{Lu}[\p{L}'’.-]*$/u.test(word) || (index > 0 && /^(van|von|de|der|den|la|le|al|bin|ibn|ur|ul|el|mac|mc|da|di)$/.test(word)))
}

/** A customer's founder in a review is not the owner of the website being scanned. */
export function ownerNameOutsideTestimonials(html:string,fullName:string):boolean{
  const wanted=fullName.toLowerCase().replace(/\s+/g,' ').trim()
  let named=false,ordinary=false
  const visit=(node:DefaultTreeAdapterMap['node']):string=>{
    if('value' in node)return node.value
    if('tagName' in node && /^(?:script|style)$/.test(node.tagName))return ''
    const content=('childNodes' in node?node.childNodes.map(visit).join(' '):'').replace(/\s+/g,' ').trim()
    if('tagName' in node && /^(?:h[1-6]|p|span|strong|a|div)$/.test(node.tagName) && content.length<180 && content.toLowerCase().includes(wanted) && (node.tagName!=='div'||content.toLowerCase()===wanted)){
      named=true;let current:DefaultTreeAdapterMap['node']|null=node,review=false
      while(current && 'tagName' in current){
        const labels=current.attrs.filter(attr=>['class','id','data-sentry-element','data-component','data-testid'].includes(attr.name)).map(attr=>attr.value).join(' ')
        if(/testimoni|quotedperson|customer[-_ ]?(?:story|stories|review|quote)|client[-_ ]?(?:story|stories|review)|(?:^|[-_ ])(?:reviews?|quote)(?:[-_ ]|$)/i.test(labels)){review=true;break}
        current=current.parentNode
      }
      if(!review)ordinary=true
    }
    return content
  }
  visit(parse(html));return !named || ordinary
}

/** A director's biography may describe ownership of a different business. */
export function ownerBelongsToBusiness(html:string,website:string,fullName:string,sourceUrl=website):boolean{
  html=stripContactCodeExamples(html)
  let brand='',sameHost=false
  try{const target=new URL(website);brand=target.hostname.replace(/^www\./i,'').split('.')[0].replace(/[^a-z0-9]/gi,'').toLowerCase();sameHost=new URL(sourceUrl).hostname.replace(/^www\./i,'')===target.hostname.replace(/^www\./i,'')}catch{return false}
  if(!brand)return false
  const brands=[brand,...(sameHost?[businessNameFromHtml(html).replace(/[^a-z0-9]/gi,'').toLowerCase()]:[])].filter(Boolean)
  const matchesCompany=(company:string)=>brands.some(value=>company.startsWith(value))
  const normal=(value:string)=>value.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim()
  const wanted=normal(fullName),blocks:string[]=[]
  let companyFactTable=false
  if(brands.includes(wanted.replace(/[^a-z0-9]/g,'')))return false
  const visit=(node:DefaultTreeAdapterMap['node'])=>{
    if('tagName' in node && /^(?:table|dl)$/.test(node.tagName)){
      const text=normal(readableHtml(serialize(node)))
      if(text.length<2500 && text.includes(wanted) && /\b(?:founders?|owners?)\b/.test(text) && brands.some(brand=>text.replace(/[^a-z0-9]/g,'').includes(brand)))companyFactTable=true
    }
    if('tagName' in node && /^(?:p|li|article|section|div)$/.test(node.tagName)){
      const text=normal(readableHtml(serialize(node)))
      if(text.length<2500 && text.includes(wanted) && /\b(?:co[- ]?found(?:ers?|ed)|founders?|founded|founding|owners?|owns|proprietor|started|established)\b/i.test(text))blocks.push(text)
    }
    if('childNodes' in node)node.childNodes.forEach(visit)
  }
  visit(parse(html))
  // Use the nearest prose, so another director's biography cannot establish this person's role.
  const scoped=blocks.filter(block=>!blocks.some(other=>other!==block && other.length<block.length && block.includes(other)))
  if(scoped.length && scoped.every(text=>{
    const at=text.indexOf(wanted),before=text.slice(Math.max(0,at-90),at),after=text.slice(at+wanted.length,at+wanted.length+100)
    return /\b(?:former|retired|previous|ex[- ])\s*(?:co[- ]?)?(?:founder|owner)\s*[,;:\-–—]?\s*$/i.test(before) || /^[\s,;:\-–—]*(?:(?:is|was)\s+)?(?:a\s+|the\s+)?(?:former|retired|previous|ex[- ])\s*(?:co[- ]?)?(?:founder|owner)\b/i.test(after)
  }))return false
  if(!scoped.length){
    if(companyFactTable)return true
    if(!sameHost)return false
    // JSON-LD can be the sole published owner evidence, but a flattened heading plus a bio name
    // is not a real name. Retain only an exact schema name when no visible owner block matches.
    const schemaOwner=(value:unknown,inherited=false):boolean=>{
      if(Array.isArray(value))return value.some(item=>schemaOwner(item,inherited))
      if(!value || typeof value!=='object')return false
      const item=value as Record<string,unknown>
      if(normal(schemaPersonName(item))===wanted && (inherited || typeof item.jobTitle==='string' && isBusinessOwner(item.jobTitle)))return true
      return Object.entries(item).some(([key,next])=>schemaOwner(next,/^(?:founders?|owners?)$/i.test(key)))
    }
    return [...html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)].some(match=>{try{return schemaOwner(JSON.parse(match[1]))}catch{return false}})
  }
  let explicit=false,matched=false
  for(const text of scoped){
    const at=text.indexOf(wanted),context=text.slice(at+ wanted.length,at+wanted.length+220)
    const before=text.slice(Math.max(0,at-180),at)
    const passive=before.match(/([\p{L}0-9][\p{L}0-9 &'’.-]{1,90})[, ]+(?:was\s+)?(?:co[- ]?founded|founded|started|established)(?:\s+in\s+\d{4})?\s+by\s+(?:(?:the\s+)?(?:then\s+)?(?:CEO|chief executive officer|president)\s+)?(?:[\p{L}]+-born\s+)?$/iu)?.[1]
    if(passive){
      const company=passive.split(/[.!?]\s+|\b(?:that|where|when)\s+/i).at(-1)!.replace(/\s+was\s*$/i,'').replace(/[^a-z0-9]/g,'')
      // A biography often uses "It was founded by…" after naming the company. That
      // pronoun is not a different company and must not invalidate the actual founder.
      if(!/^(?:it|we|this|thecompany|thebusiness|thefirm)$/.test(company)){
        explicit=true
        if(matchesCompany(company))matched=true
      }
    }
    const patterns=[
      /^(?:[\s,]+)(?:has\s+)?(?:co[- ]?founded|founded|started|established|owns)\s+([^.;!?]+)/i,
      /^[\s,–—-]*(?:(?:is|was)\s+)?(?:the\s+)?(?:co[- ]?founder|founder|co[- ]?owner|owner|proprietor)(?:\s*(?:and|&(?:amp;)*)\s*[\w\s-]{1,65}?)?\s+(?:of|at)\s+([^.;!?]+)/i,
      // Compact people cards often use "Name / Co-founder, Company".
      /^[\s,–—-]*(?:co[- ]?founder|founder|co[- ]?owner|owner|proprietor)\s*[,|]\s*([^.;!?]+)/i,
    ]
    for(const pattern of patterns){
      const relation=context.match(pattern)?.[1]
      if(!relation)continue
      // A second job title in "Co-founder, President" is not a company name.
      if(/^(?:ceo|cfo|cto|coo|president|director|chief|partner|chairman|chairperson|engineer|developer|designer)(?:\b|$)/i.test(relation))continue
      const company=relation.replace(/^the\s+/i,'').split(/\s+(?:in|since|where|which|and has|and served|from|prior)\b/i)[0].replace(/[^a-z0-9]/g,'')
      if(!company || /^(?:ourcompany|ourbusiness|ourfirm|ourpractice|thiscompany|thisbusiness|thisfirm|thecompany|thebusiness|thefirm)$/.test(company))continue
      explicit=true
      if(matchesCompany(company))matched=true
    }
    // A guest bio can put the company before the role: "Webflow co-founder Vlad..."
    // or "Vlad... / Webflow co-founder". Do not treat that guest as the site's owner.
    const prefix=before.match(/(?:^|[,:;.!?–—])\s*([\p{L}\d][\p{L}\d &'’.-]{1,55}?)\s+(?:co[- ]?founder|co[- ]?owner|proprietor)\s*[,–—-]?\s*$/iu)?.[1]
    const suffix=context.match(/^[\s,–—-]*([\p{L}\d][\p{L}\d &'’.-]{1,55}?)\s+(?:co[- ]?founder|co[- ]?owner|proprietor)\b/iu)?.[1]
    for(const label of [prefix,suffix]){
      if(!label || /^(?:the|our|a|an|is|is the|is a)$/i.test(label))continue
      explicit=true
      if(matchesCompany(label.replace(/[^a-z0-9]/g,'')))matched=true
    }
  }
  if(explicit)return matched
  // A role on a parent company's page does not make that person the subsidiary's founder.
  return sameHost || companyFactTable || scoped.some(text=>brands.some(brand=>text.replace(/[^a-z0-9]/g,'').includes(brand)))
}

function isContactLink(href: string, text: string): boolean {
  if (/\/(?:videos?|blog|news|articles?)\//i.test(href))return false
  return /contact|support|help|customer-service|about|team|staff|our-people|meet|clinic|practice|book/i.test(`${href} ${text}`)
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
  const nameOf = (node: Element) => readableHtml(serialize(node)).replace(/\s+/g,' ').trim().replace(/^(?:Dr\.?|Mr\.?|Mrs\.?|Ms\.?)\s+/i,'').replace(/,?\s+(?:Esq\.?|PhD|M\.D\.)$/i,'').replace(/\s+(?:Co[- ]?Founder|Founder|Co[- ]?Owner|Owner|CEO)$/i,'')
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
      const nameAt=text.toLowerCase().indexOf(name.toLowerCase())
      const afterName=nameAt<0?'':text.slice(nameAt+name.length).replace(/^[\s,·|:—–-]+/,'')
      const beforeName=nameAt<0?'':text.slice(0,nameAt).replace(/[\s,·|:—–-]+$/,'')
      const afterRole=afterName.match(ROLE_ANYWHERE),beforeRole=beforeName.match(ROLE_ANYWHERE)
      const adjacentRole=afterRole?.index===0?afterRole[0]:beforeRole && beforeRole.index!+beforeRole[0].length===beforeName.length?beforeRole[0]:''
      // A role elsewhere in a large section may refer to another person. New cards need a role
      // directly beside the name; do not climb out of a self-contained article looking for one.
      const title=adjacentRole || person?.title || ''
      if(!person && !title) { if(/^(?:article|li)$/.test(parent.tagName))break;continue }
      if(!person) { person={fullName:name,title,email:'',phone:'',linkedinUrl:'',evidence:pageUrl};people.push(person) }
      if(!person.title || title.length>person.title.length && title.includes(person.title))person.title=title
      const email=cleanEmails([...Array.from(block.matchAll(/href\s*=\s*["']mailto:([^"'?<>\s]+)/gi),m=>decodeHtml(m[1])), ...Array.from(text.matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi),m=>m[0])]).find(value=>Boolean(ownerEmail(name,value)))
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
  for(const person of extractPeople(text,24)){
    if(isUsablePerson(person.fullName,person.title) && !people.some(saved=>saved.fullName.toLowerCase()===person.fullName.toLowerCase()))people.push({fullName:person.fullName,title:person.title})
  }
  return people
}

/** The role vocabulary, as a pattern that can be matched anywhere in a block of text. */
const ROLE_ANYWHERE = new RegExp(
  String.raw`\b(Founding Attorney|Founding Partner|Founding Director|Co-Owner|Proprietor|CEO|CFO|CTO|COO|CMO|Chief Executive Officer|Managing Director|Managing Partner|Senior Partner|Co-Founder|Director|Owner|Founder|Practice Manager|Clinic Director|Manager|Principal|Partner|Attorney|Lawyer|Barrister|Advocate|Solicitor|Associate|Head of [A-Za-z]+(?:[^\S\n]+[A-Za-z]+){0,2}|Lead [A-Za-z]+(?:[^\S\n]+[A-Za-z]+){0,2}|Therapist|Dentist|Doctor|Dermatologist|Physiotherapist|Chiropractor|Surgeon|Consultant|Specialist|Practitioner)\b`, 'i',
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
function schemaPersonName(node:Record<string,unknown>):string{
  return typeof node.name==='string' ? node.name : typeof node.givenName==='string' && typeof node.familyName==='string' ? `${node.givenName} ${node.familyName}` : ''
}

function peopleFromJsonLd(blocks: string[]): { fullName: string; title: string; email: string; phone: string; linkedinUrl: string }[] {
  const found: { fullName: string; title: string; email: string; phone: string; linkedinUrl: string }[] = []
  const seen = new Set<string>()
  const indexed = new Map<string,Record<string,unknown>>()
  const documents: unknown[] = []
  const index = (value: unknown): void => {
    if (Array.isArray(value)) { value.forEach(index); return }
    if (!value || typeof value !== 'object') return
    const node=value as Record<string,unknown>
    if (typeof node['@id']==='string' && schemaPersonName(node)) indexed.set(node['@id'],node)
    Object.values(node).forEach(index)
  }
  for (const block of blocks) { try { const value=JSON.parse(block); documents.push(value); index(value) } catch { /* Optional malformed schema. */ } }

  const readPerson = (node: Record<string, unknown>, ownership = ''): void => {
    const name = schemaPersonName(node).replace(/\s+/g, ' ').trim().replace(/^(?:Dr\.?|Mr\.?|Mrs\.?|Ms\.?)\s+/i,'')
    const title = ownership || (typeof node.jobTitle === 'string' ? node.jobTitle.replace(/\s+/g, ' ').trim() : '')
    if (!name || !isUsablePerson(name, title)) return
    const key = name.toLowerCase()
    if (seen.has(key)) {
      const existing = found.find(person=>person.fullName.toLowerCase()===key)
      if (existing && isBusinessOwner(title)) existing.title=title
      return
    }
    seen.add(key)
    found.push({
      fullName: name,
      title,
      email: typeof node.email === 'string' ? node.email.replace(/^mailto:/i, '').trim() : '',
      phone: typeof node.telephone === 'string' ? node.telephone.trim() : '',
      linkedinUrl: (Array.isArray(node.sameAs) ? node.sameAs : [node.sameAs]).find((url): url is string => typeof url === 'string' && /^https?:\/\/(?:www\.)?linkedin\.com\/in\//i.test(url)) ?? '',
    })
  }

  const visit = (value: unknown, ownership = ''): void => {
    if (Array.isArray(value)) {
      value.forEach(item=>visit(item,ownership))
      return
    }
    if (!value || typeof value !== 'object') return
    const node = value as Record<string, unknown>
    const type = node['@type']
    const types = Array.isArray(type) ? type.map(String) : [String(type ?? '')]
    const resolved=typeof node['@id']==='string' ? {...indexed.get(node['@id']),...node} : node
    if ((ownership && !types.some(entry=>/Organization|Corporation/i.test(entry))) || types.some((entry) => /^Person$/i.test(entry))) readPerson(resolved,ownership)
    Object.entries(node).forEach(([key,value])=>{if(value && typeof value==='object')visit(value,/^founders?$/i.test(key)?'Founder':/^owners?$/i.test(key)?'Owner':'')})
  }

  documents.forEach(value=>visit(value))
  return found
}

export class WebsiteEnricher {
  private browser: Browser | null = null

  /** A normal Google web search; challenges are reported rather than bypassed. */
  

  /** Follow the site's own team/about links; one credit still covers one website. */
  

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
   * Homepage plus two linked Contact/About pages. Transient failures get one retry within a
   * sixteen-second site budget; successful pages survive failures on optional pages.
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

    if(!/^https?:$/.test(origin.protocol))return {...findings,error:'Enter an HTTP or HTTPS website URL.'}
    if(signal?.aborted)throw new DOMException('Enrichment cancelled','AbortError')
    const budget=new AbortController(),timer=setTimeout(()=>budget.abort(),16_000)
    const combined=AbortSignal.any([budget.signal,...(signal?[signal]:[])])
    const found=new Map<string,FoundSocial>(),own=canonicalSocialProfile(origin.href)
    if(own)found.set(socialProfileIdentity(own),{...own,page:origin.href})
    let homeFailure = ''
    const read=async(raw:string,home=false):Promise<{url:string;html:string}|null>=>{
      let url = raw
      for (let attempt=0; attempt<(home&&!own?2:1) && !combined.aborted; attempt++) {
        let retry = false
        try{
          const response=await fetch(url,{redirect:'follow',signal:AbortSignal.any([combined,AbortSignal.timeout(home?(own?2500:6000):4000)]),headers:{accept:'text/html,application/xhtml+xml','user-agent':'MamaLead contact scanner/1.5'}})
          if(!response.ok){
            await response.body?.cancel()
            if(home&&!own)homeFailure=`${origin.host} could not be read (HTTP ${response.status}). Retry this website.`
            // Do not repeat denied/challenged requests. Retry temporary server errors only.
            retry=[408,500,502,503,504].includes(response.status)
            if (!retry) return null
          }else{
            const final=response.url||url,reader=response.body?.getReader();if(!reader)return null
            const decoder=new TextDecoder();let html='',bytes=0
            // Keep the useful first part even on large homepages instead of discarding the site.
            try{while(true){const chunk=await reader.read();if(chunk.done)break;const take=chunk.value.subarray(0,2_000_000-bytes);bytes+=take.length;html+=decoder.decode(take,{stream:true});if(bytes>=2_000_000)break}}finally{await reader.cancel().catch(()=>undefined)}
            findings.pagesRead.push(final)
            return {url:final,html:html+decoder.decode()}
          }
        }catch(error){
          if(signal?.aborted)throw new DOMException('Enrichment cancelled','AbortError')
          const cause=error instanceof Error?(error as Error & {cause?:{code?:string}}).cause?.code || '':''
          const timedOut=combined.aborted || /TIMEDOUT|TIMEOUT/.test(cause) || (error instanceof Error && /timeout|timed.?out/i.test(error.name+' '+error.message))
          const certificate=/CERT|TLS|SSL/.test(cause)
          if(home&&!own)homeFailure=certificate?`${origin.host} has a certificate problem. The website owner needs to fix it.`:timedOut?`${origin.host} took too long to respond. Retry this website.`:`${origin.host} could not be reached. Retry this website or check its address.`
          retry=!certificate
          // An old Maps HTTP URL may fail while the site's HTTPS endpoint is healthy.
          if(home && url.startsWith('http://'))url=url.replace(/^http:/,'https:')
        }
        if (!retry || combined.aborted) break
      }
      return null
    }
    const collect=(page:{url:string;html:string})=>{for(const social of socialLinksFromHtml(page.html,page.url)){const canonical=canonicalSocialProfile(social.profileUrl);if(canonical)found.set(socialProfileIdentity(canonical),social)}}
    try {
      let home=await read(origin.href,true)
      // Maps sometimes saves a discontinued location URL; the homepage can still publish profiles.
      if(!home&&!own&&!combined.aborted&&(origin.pathname!=='/'||origin.search))home=await read(new URL('/',origin).href)
      if(home){
        collect(home)
        if(!socialPlatformOf(home.url)){
          const base=new URL(home.url),candidates=new Map<string,number>()
          for(const link of siteLinksFromHtml(home.html))try{
            const url=new URL(link.href,base);url.hash=''
            if(!/^https?:$/.test(url.protocol)||url.host!==base.host||url.href===base.href)continue
            if(/\/(?:videos?|blog|news|articles?|products?|posts?)\//i.test(url.pathname))continue
            const score=/\b(?:contact|reach us|get in touch)\b/i.test(link.label)||/\/(?:contact(?:-us)?|contactus|get-in-touch)(?:\/|\.|$)/i.test(url.pathname)?2:/\/(?:about(?:-us)?|company)(?:\/|\.|$)/i.test(url.pathname)?1:0
            if(score)candidates.set(url.href,Math.max(score,candidates.get(url.href)??0))
          }catch{/* Ignore malformed navigation. */}
          const pages=await Promise.all([...candidates].sort((a,b)=>b[1]-a[1]).slice(0,2).map(([url])=>read(url)))
          for(const page of pages)if(page)collect(page)
        }
      }
      if (signal?.aborted) throw new DOMException('Enrichment cancelled', 'AbortError')
      findings.socials=[...found.values()]
      findings.error = !home && !own ? homeFailure || `${origin.host} could not be read. Retry this website.` : null
    } finally {
      clearTimeout(timer);budget.abort()
    }
    return findings
  }

  /** Main phone lookup: homepage and contact pages first, bounded HTTP reads, no browser startup. */
  async inspectPhoneFast(website: string, signal?: AbortSignal): Promise<WebsiteFindings> {
    const result:WebsiteFindings={emails:[],phones:[],socials:[],people:[],addresses:[],pagesRead:[],error:null}
    let origin:URL
    try{origin=new URL(website)}catch{return {...result,error:'Enter a valid website URL.'}}
    const budget=new AbortController(),timer=setTimeout(()=>budget.abort(),16_000)
    const combined=AbortSignal.any([budget.signal,...(signal?[signal]:[])])
    const sameSite=(raw:string,base=origin.href):string|null=>{try{const url=new URL(decodeHtml(raw),base);url.hash='';return /^https?:$/.test(url.protocol)&&url.host.replace(/^www\./i,'')===origin.host.replace(/^www\./i,'')?url.href:null}catch{return null}}
    const read=async(raw:string):Promise<string>=>{
      let url=sameSite(raw)
      try{
        for(let redirects=0;url&&redirects<4;redirects++){
          const response=await fetch(url,{redirect:'manual',signal:AbortSignal.any([combined,AbortSignal.timeout(3500)]),headers:{'user-agent':'MamaLead contact scanner/1.5'}})
          if(response.status>=300&&response.status<400){const next=sameSite(response.headers.get('location') || '',url);await response.body?.cancel();url=next;continue}
          if(!response.ok||Number(response.headers.get('content-length')??0)>1_500_000){await response.body?.cancel();return ''}
          const reader=response.body?.getReader();if(!reader)return ''
          const decoder=new TextDecoder();let text='',bytes=0
          try{while(true){const chunk=await reader.read();if(chunk.done)break;bytes+=chunk.value.length;if(bytes>1_500_000)break;text+=decoder.decode(chunk.value,{stream:true})}}finally{await reader.cancel()}
          return text+decoder.decode()
        }
      }catch{/* One slow/blocked endpoint must not stall the website. */}
      return ''
    }
    const rank=(raw:string,label='')=>{
      const path=new URL(raw).pathname
      if(/\/(?:blog|news|posts?|products?|team|people|careers)\//i.test(path))return 0
      if(/(?:^|\/)(?:contact(?:-us)?|contactus|reach-us|get-in-touch)(?:\/|\.[a-z]+$|$)/i.test(path))return 10
      if(/^(?:contact(?: us)?|reach us|get in touch)$/i.test(label.trim()))return 9
      if(/(?:^|\/)(?:locations?|offices?|support|customer-service)(?:\/|\.[a-z]+$|$)/i.test(path))return 4
      return 0
    }
    const candidates=new Map<string,number>(),seen=new Set<string>(),collected:FoundPhone[]=[]
    const key=(raw:string)=>{const url=new URL(raw);return url.pathname.replace(/\/$/,'')+url.search}
    const append=(raw:string,label='',base=origin.href)=>{const url=sameSite(raw,base);if(url&&rank(url,label)>0&&!seen.has(key(url)))candidates.set(url,Math.max(candidates.get(url)??0,rank(url,label)))}
    const collect=(url:string,html:string)=>{
      seen.add(key(url));if(!html)return
      result.pagesRead.push(url);collected.push(...publishedPhonesFromHtml(html,url))
      for(const link of siteLinksFromHtml(html))append(link.href,link.label,url)
    }
    try{
      collect(origin.href,await read(origin.href))
      // A linked Contact page is both faster and more relevant than traversing sitemaps.
      if(![...candidates.values()].some(score=>score>=9)&&!combined.aborted){
        const robots=await read(new URL('/robots.txt',origin).href)
        let maps=Array.from(robots.matchAll(/^Sitemap:\s*(\S+)/gim),m=>sameSite(m[1])).filter((url):url is string=>Boolean(url))
        if(!maps.length)maps=[new URL('/sitemap.xml',origin).href]
        const visited=new Set<string>(),mapRank=(url:string)=>/page|contact|static/i.test(url)?3:/post|tag|category|product/i.test(url)?0:1
        for(let round=0;round<2&&maps.length&&!combined.aborted;round++){
          const batch=maps.filter(url=>!visited.has(url)).sort((a,b)=>mapRank(b)-mapRank(a)).slice(0,2);maps=[]
          const pages=await Promise.all(batch.map(async url=>{visited.add(url);return {url,xml:await read(url)}}))
          for(const {xml} of pages){
            const index=/<(?:\w+:)?sitemapindex\b/i.test(xml)
            for(const match of xml.matchAll(/<(?:\w+:)?loc\b[^>]*>([\s\S]*?)<\/(?:\w+:)?loc>/gi)){
              const url=sameSite(match[1].trim().replace(/^<!\[CDATA\[|\]\]>$/g,''));if(!url)continue
              if(index){if(!visited.has(url)&&mapRank(url)>0&&maps.length<32)maps.push(url)}else append(url)
            }
          }
          if([...candidates.values()].some(score=>score>=9))break
        }
      }
      if(!candidates.size&&!combined.aborted)for(const path of ['/contact-us','/contact'])append(new URL(path,origin).href)
      const contacts=[...candidates].sort((a,b)=>b[1]-a[1]).slice(0,2).map(([url])=>url)
      const pages=await Promise.all(contacts.map(async url=>({url,html:await read(url)})))
      for(const {url,html} of pages)collect(url,html)
      const merged=new Map<string,FoundPhone & {pages:Set<string>}>()
      for(const phone of collected){const digits=phone.value.replace(/\D/g,''),existing=merged.get(digits);if(existing){existing.pages.add(key(phone.page));if((phone.score??0)>(existing.score??0)){existing.score=phone.score;existing.page=phone.page}}else merged.set(digits,{...phone,pages:new Set([key(phone.page)])})}
      // Merge a local spelling only when this website also publishes one unambiguous international
      // spelling of that same line. Never invent a country code from the user's search location.
      for(const [digits,phone] of [...merged]){
        if(phone.value.startsWith('+'))continue
        const local=digits.startsWith('0')?digits.slice(1):digits
        const matches=[...merged.entries()].filter(([key,value])=>value.value.startsWith('+')&&key.endsWith(local)&&key.length>local.length&&key.length-local.length<=3)
        if(matches.length===1){const target=matches[0][1];phone.pages.forEach(page=>target.pages.add(page));if((phone.score??0)>(target.score??0)){target.score=phone.score;target.page=phone.page}merged.delete(digits)}
      }
      result.phones=[...merged.values()].map(({pages,...phone})=>({...phone,score:Math.min(100,(phone.score??0)+Math.max(0,pages.size-1)*15)})).sort((a,b)=>(b.score??0)-(a.score??0))
      if(!result.pagesRead.length)result.error=budget.signal.aborted?'The website took too long to respond. Retry this website.':'The website could not be read. Try again or check its URL.'
    }finally{clearTimeout(timer);budget.abort();if(signal?.aborted)throw new DOMException('Enrichment cancelled','AbortError')}
    return result
  }

  /** Fast contact pass over the server HTML of a site. */
  async inspectContactFast(website: string, signal?: AbortSignal, mainEmailOnly=false): Promise<WebsiteFindings> {
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
    const contactRank=(raw:string,label='') => {
      const path=new URL(raw,origin).pathname
      if (/\/(?:videos?|blog|news|articles?|products?)\//i.test(path)) return 0
      if (/(?:^|\/)(?:contact(?:-us)?|contactus|reach-us|get-in-touch)(?:\/|\.[a-z]+$|$)/i.test(path)) return 10
      if (/^(?:contact(?: us)?|reach us|get in touch|email us)$/i.test(label.trim())) return 9
      if (/(?:^|\/)(?:support|help|customer-service|customer-support|customer-care)(?:\/|\.[a-z]+$|$)/i.test(path))return 6
      if (/(?:^|\/)(?:legal(?:-notices)?|privacy(?:-policy)?|policies|terms(?:-of-service)?|imprint|impressum)(?:\/|\.[a-z]+$|$)/i.test(path))return 1
      return /(?:^|\/)(?:locations?|offices?|about(?:-us)?)(?:\/|\.[a-z]+$|$)/i.test(path) ? 3 : 0
    }
    const mapRank=(url:string) => /page|contact|static/i.test(url) ? 3 : /post|tag|category|product/i.test(url) ? 0 : 1
    const pageKey=(raw:string) => { const url=new URL(raw);return url.host.replace(/^www\./i,'')+url.pathname.replace(/\/$/,'')+url.search }
    const queue=[origin.href]; const seen=new Set<string>()
    const append=(raw:string) => { const url=sameSite(raw); if(url && !seen.has(pageKey(url)) && !queue.some(saved=>pageKey(saved)===pageKey(url)) && queue.length<12){queue.push(url);queue.sort((a,b)=>a===origin.href?-1:b===origin.href?1:contactRank(b)-contactRank(a))} }
    try {
      const home=read(origin.href).catch(()=>'')
      if(mainEmailOnly){
        const html=await home
        if(signal?.aborted)throw new DOMException('Cancelled','AbortError')
        if(html){
          const found=contactFindingsFromHtml(html,origin.href)
          const primary=[...found.emails].sort((a,b)=>compareEmailContacts({...a,source:a.page},{...b,source:b.page}))[0]
          if(primary&&emailContactPriority(primary.value,primary.page)>=18)return {...result,...found,emails:[primary],pagesRead:[origin.href]}
        }
      }
      const robots=await read(new URL('/robots.txt',origin).href).catch(()=>'')
      const maps=Array.from(robots.matchAll(/^Sitemap:\s*(\S+)/gim),m=>m[1])
      if (!maps.length) maps.push(new URL('/sitemap.xml',origin).href, new URL('/sitemap_index.xml',origin).href, new URL('/wp-sitemap.xml',origin).href)
      const visitedMaps=new Set<string>()
      while(maps.length && visitedMaps.size<6 && !combined.aborted){
        if(queue.some(url=>contactRank(url)>=9) && maps.every(url=>mapRank(url)===0))break
        maps.sort((a,b)=>mapRank(b)-mapRank(a))
        const map=sameSite(maps.shift()!); if(!map || visitedMaps.has(map))continue; visitedMaps.add(map)
        const xml=await read(map).catch(()=>'')
        const index=/<(?:\w+:)?sitemapindex\b/i.test(xml)
        const locations=Array.from(xml.matchAll(/<(?:\w+:)?loc\b[^>]*>([\s\S]*?)<\/(?:\w+:)?loc>/gi),match=>sameSite(match[1].trim().replace(/^<!\[CDATA\[|\]\]>$/g,''))).filter((url):url is string=>Boolean(url))
        if (index) {
          for(const url of locations.sort((a,b)=>mapRank(b)-mapRank(a))) if(!visitedMaps.has(url) && !maps.includes(url) && maps.length<32)maps.push(url)
        } else {
          for(const url of locations.sort((a,b)=>contactRank(b)-contactRank(a))) if(contactRank(url)>0)append(url)
        }
      }
      while(queue.length && seen.size<6 && !combined.aborted){
        if(!result.emails.length && seen.size>=2)queue.sort((a,b)=>(contactRank(b)===1?4:contactRank(b))-(contactRank(a)===1?4:contactRank(a)))
        const url=queue.shift()!; if(seen.has(pageKey(url)))continue; seen.add(pageKey(url))
        if(contactRank(url)===1 && result.emails.length)continue
        const html=url===origin.href ? await home : await read(url).catch(()=>''); if(!html)continue
        const found=contactFindingsFromHtml(html,url);result.pagesRead.push(url)
        if (!result.businessName && found.businessName) result.businessName=found.businessName
        if(contactRank(url)===1) {
          const siteHost=origin.hostname.replace(/^www\./i,'').toLowerCase(),brand=siteHost.split('.')[0]
          const personal=new Set(['gmail.com','outlook.com','hotmail.com','yahoo.com','proton.me','protonmail.com','icloud.com','aol.com','live.com','gmx.com'])
          found.emails=found.emails.filter(email=>{const domain=email.value.split('@')[1];return domain===siteHost || domain.endsWith('.'+siteHost) || domain.split('.')[0]===brand || personal.has(domain)})
          found.phones=[];found.socials=[];found.people=[];found.addresses=[]
        }
        result.emails.push(...found.emails);result.phones.push(...found.phones);result.socials.push(...found.socials);result.people.push(...found.people);result.addresses!.push(...(found.addresses ?? []))
        if(mainEmailOnly&&contactRank(url)>=9&&found.emails.some(email=>emailContactPriority(email.value,email.page)>=0))break
        const links=siteLinksFromHtml(html).map(link=>{
          try { return {url:sameSite(new URL(link.href,url).href),label:link.label} } catch { return null }
        }).filter((link):link is {url:string;label:string}=>Boolean(link?.url))
        for(const link of links.sort((a,b)=>contactRank(b.url,b.label)-contactRank(a.url,a.label))) if(contactRank(link.url,link.label)>0)append(link.url)
      }
      const emails=new Map<string,FoundEmail>()
      for(const email of result.emails){const prior=emails.get(email.value);if(!prior||compareEmailContacts({...email,source:email.page},{...prior,source:prior.page})<0)emails.set(email.value,email)}
      result.emails=[...emails.values()].sort((a,b)=>compareEmailContacts({...a,source:a.page},{...b,source:b.page}))
      if(mainEmailOnly)result.emails=result.emails.slice(0,1)
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
        for (const phone of contactFindingsFromHtml(data.html,url).phones) phoneSet.set(phone.value,phone)

        for (const social of socialLinksFromHtml(data.html,url)) {
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

        const rank=(link:{href:string;text:string})=>/contact|reach us|get in touch/i.test(`${link.href} ${link.text}`)?3:/support|help/i.test(`${link.href} ${link.text}`)?2:1
        return data.links.filter((link) => isContactLink(link.href, link.text)).sort((a,b)=>rank(b)-rank(a)).map((link) => link.href)
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
