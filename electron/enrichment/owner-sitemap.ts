/** Bounded discovery hints only. The caller must read each page and verify the owner's mailbox. */
const REQUEST_MS = 5_000
const LOOKUP_MS = 8_000
const MAX_BYTES = 2_000_000
const CACHE_MS = 10 * 60_000
const MAX_CACHED_SITES = 80
const MAX_PAGE_HINTS = 12_000

type Cached = { at: number; urls: string[] }
type Shared = { controller: AbortController; promise: Promise<string[]>; subscribers: number; settled: boolean }
const cache = new Map<string, Cached>()
const pending = new Map<string, Shared>()
const normalizedHost = (url: URL) => url.host.toLowerCase().replace(/^www\./, '')
const normal = (value: string) => value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

function sameSite(raw: string, origin: URL, base = origin.href): string | null {
  try {
    const url = new URL(raw, base)
    if (!/^https?:$/.test(url.protocol) || url.username || url.password || normalizedHost(url) !== normalizedHost(origin)) return null
    if (origin.protocol === 'https:' && url.protocol !== 'https:') return null
    url.hash = ''
    return url.href
  } catch { return null }
}

function aborted<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) {
    void promise.catch(() => {})
    return Promise.reject(signal.reason ?? new DOMException('Cancelled', 'AbortError'))
  }
  return new Promise((resolve, reject) => {
    const stop = () => reject(signal.reason ?? new DOMException('Cancelled', 'AbortError'))
    signal.addEventListener('abort', stop, { once: true })
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', stop))
  })
}

function xmlText(value: string): string {
  return value.trim().replace(/^<!\[CDATA\[([\s\S]*)\]\]>$/, '$1')
    .replace(/&#(x[0-9a-f]+|\d+);/gi, (_match, code: string) => {
      const number = parseInt(code.replace(/^x/i, ''), /^x/i.test(code) ? 16 : 10)
      return number > 0 && number <= 0x10ffff ? String.fromCodePoint(number) : ''
    }).replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
}

function pageResource(raw: string): boolean {
  try {
    const path = decodeURIComponent(new URL(raw).pathname).toLowerCase()
    return /\.(?:avif|bmp|gif|ico|jpe?g|png|svg|webp|tiff?|mp[34]|m4[av]|mov|avi|webm|ogg|wav|pdf|zip|gz|rar|7z|exe|dmg|docx?|xlsx?|pptx?|woff2?|ttf|eot|css|m?js|map|json|xml|txt)(?:\/|$)/i.test(path)
  } catch { return true }
}

/** Only the sitemap's own direct record/loc children, never image:loc or video metadata. */
function directLocations(text: string, kind: 'urlset' | 'sitemapindex'): string[] {
  const record = kind === 'urlset' ? 'url' : 'sitemap', stack: string[] = [], locations: string[] = []
  let rootPrefix = '', start = -1
  const tokens = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>|<(\/?)([A-Za-z_][\w:.-]*)\b[^<>]*>/g
  for (const token of text.matchAll(tokens)) {
    if (!token[2]) continue
    const tag = token[2].toLowerCase(), local = tag.split(':').at(-1)!, prefix = tag.slice(0, tag.length - local.length)
    if (token[1]) {
      if (stack.at(-1) !== tag) { stack.length = 0; start = -1; continue }
      if (start >= 0 && stack.length === 3 && tag === rootPrefix + 'loc') {
        locations.push(xmlText(text.slice(start, token.index)))
        start = -1
      }
      stack.pop()
    } else {
      if (!stack.length && local === kind) rootPrefix = prefix
      if (stack.length === 2 && stack[0] === rootPrefix + kind && stack[1] === rootPrefix + record && tag === rootPrefix + 'loc') start = token.index! + token[0].length
      else if (start >= 0) start = -1
      if (!/\/\s*>$/.test(token[0])) stack.push(tag)
    }
  }
  return locations
}

async function collect(origin: URL, signal: AbortSignal): Promise<{ urls: string[]; cacheable: boolean }> {
  const overall = new AbortController(), timer = setTimeout(() => overall.abort(new DOMException('Sitemap lookup timed out', 'TimeoutError')), LOOKUP_MS)
  const budget = AbortSignal.any([signal, overall.signal])
  let transientFailure = false, validMap = false, validUrlSet = false
  const read = async (raw: string): Promise<{ url: string; text: string } | null> => {
    const request = new AbortController(), requestTimer = setTimeout(() => request.abort(new DOMException('Sitemap request timed out', 'TimeoutError')), REQUEST_MS)
    const requestSignal = AbortSignal.any([budget, request.signal])
    let url = sameSite(raw, origin)
    try {
      for (let redirect = 0; url && redirect < 4; redirect++) {
        const response = await aborted(fetch(url, { redirect: 'manual', signal: requestSignal, headers: { accept: 'application/xml,text/xml,text/plain', 'user-agent': 'MamaLead public contact discovery' } }), requestSignal)
        if (response.url && !sameSite(response.url, origin)) { void response.body?.cancel().catch(() => {}); return null }
        if (response.status >= 300 && response.status < 400) {
          const location = response.headers.get('location')
          void response.body?.cancel().catch(() => {})
          url = location ? sameSite(location, origin, url) : null
          continue
        }
        if (!response.ok || Number(response.headers.get('content-length') ?? 0) > MAX_BYTES) {
          if (response.status >= 500 || response.status === 429) transientFailure = true
          void response.body?.cancel().catch(() => {}); return null
        }
        const reader = response.body?.getReader()
        if (!reader) return null
        const decoder = new TextDecoder(); let text = '', bytes = 0
        try {
          while (true) {
            const chunk = await aborted(reader.read(), requestSignal)
            if (chunk.done) return { url, text: text + decoder.decode() }
            bytes += chunk.value.length
            if (bytes > MAX_BYTES) return null
            text += decoder.decode(chunk.value, { stream: true })
          }
        } finally { void reader.cancel().catch(() => {}) }
      }
    } catch { transientFailure = true }
    finally { clearTimeout(requestTimer) }
    return null
  }
  const pages = new Map<string, string>(), maps = new Set<string>(), visited = new Set<string>()
  const key = (raw: string) => { const url = new URL(raw); return normalizedHost(url) + url.pathname.replace(/\/$/, '') + url.search }
  const acceptMap = (document: { url: string; text: string } | null) => {
    if (!document) return
    const kind = document.text.match(/<(?:[\w.-]+:)?(urlset|sitemapindex)\b/i)?.[1]?.toLowerCase()
    if (!kind || !new RegExp(`</(?:[\\w.-]+:)?${kind}\\s*>`, 'i').test(document.text)) return
    validMap = true
    if (kind === 'urlset') validUrlSet = true
    visited.add(key(document.url))
    for (const raw of directLocations(document.text, kind as 'urlset' | 'sitemapindex')) {
      const url = sameSite(raw, origin, document.url)
      if (!url) continue
      if (kind === 'sitemapindex') { if (maps.size < 64 && !visited.has(key(url))) maps.add(url) }
      else if (!pageResource(url) && pages.size < MAX_PAGE_HINTS) pages.set(key(url), url)
    }
  }
  const mapRank = (url: string) => /page|contact|static/i.test(new URL(url).pathname) ? 4 : /post|blog|article/i.test(new URL(url).pathname) ? 3 : /tag|category|product|image|video/i.test(new URL(url).pathname) ? 0 : 2
  try {
    const defaults = ['/sitemap.xml', '/sitemap_index.xml'].map(path => new URL(path, origin).href)
    defaults.forEach(url => visited.add(key(url)))
    const [robots, ...first] = await Promise.all([read(new URL('/robots.txt', origin).href), ...defaults.map(read)])
    if (robots) for (const match of robots.text.matchAll(/^\s*Sitemap:\s*(\S+)/gim)) {
      const url = sameSite(xmlText(match[1]), origin)
      if (url && !visited.has(key(url)) && maps.size < 64) maps.add(url)
    }
    first.forEach(acceptMap)
    const fallback = new URL('/wp-sitemap.xml', origin).href
    if (!maps.size && !validMap) maps.add(fallback)
    // Exactly two rounds, at most four XML documents. Robots is a separate text request.
    const second = [...new Map([...maps].map(url => [key(url), url])).values()].filter(url => !visited.has(key(url))).sort((a, b) => mapRank(b) - mapRank(a)).slice(0, 2)
    if (!budget.aborted) {
      second.forEach(url => visited.add(key(url)))
      const documents = await Promise.all(second.map(read)); documents.forEach(acceptMap)
    }
    signal.throwIfAborted()
    return { urls: [...pages.values()], cacheable: validUrlSet && !transientFailure && !budget.aborted }
  } finally { clearTimeout(timer); overall.abort() }
}

function ranked(urls: string[], ownerName: string): string[] {
  const names = normal(ownerName).replace(/[^\p{L}\p{N}]+/gu, ' ').split(' ').filter(name => name.length >= 2 && !['mr', 'mrs', 'ms', 'dr'].includes(name))
  const score = (raw: string) => {
    let path: string
    try { path = normal(decodeURIComponent(new URL(raw).pathname)) } catch { return 0 }
    if (pageResource(raw)) return 0
    const words = path.replace(/[^\p{L}\p{N}]+/gu, ' ').trim().split(' '), segments = path.split('/').filter(Boolean)
    const leaf = (segments.at(-1) ?? '').replace(/\.(?:html?|php|aspx?)$/, '')
    const topical = segments.some(segment => /^(?:blog|articles?|posts?|news|resources?|docs|guides?)$/.test(segment))
    if (/^(?:contact(?:-us)?|reach-us|get-in-touch|email-us)$/.test(leaf)) return 100
    if (/^(?:(?:[\w]+-)*faq|frequently-asked(?:-questions)?)$/.test(leaf)) return 90
    if (/help-us|your-input|give-input/.test(leaf) || /^(?:feedback|send-feedback|share-feedback)$/.test(leaf)) return 85
    if (/^(?:thank-you|thankyou)(?:-|$)/.test(leaf)) return 80
    if (names.length >= 2 && names.every(name => words.includes(name))) return 75
    if (!topical && /^(?:support|customer-service|help)$/.test(leaf)) return 70
    if (segments.some(segment => /^(?:authors?|team|people|founders?|leadership|biograph(?:y|ies))$/.test(segment))) return names.some(name => words.includes(name)) ? 55 : topical ? 0 : 35
    if (/^about(?:-us)?$/.test(leaf)) return 30
    if (!topical && /^(?:privacy(?:-policy)?|imprint|impressum|legal-notice|terms(?:-of-(?:use|service))?)$/.test(leaf)) return 5
    return 0
  }
  return urls.map(url => ({ url, score: score(url) })).filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score || a.url.length - b.url.length || a.url.localeCompare(b.url)).slice(0, 12).map(item => item.url)
}

/** URL hints only; no mailbox guesses and no contact-page body reads. */
export async function discoverOwnerContactPages(website: string, ownerName: string, signal?: AbortSignal): Promise<string[]> {
  signal?.throwIfAborted()
  let origin: URL
  try {
    origin = new URL(website)
    if (!/^https?:$/.test(origin.protocol) || origin.username || origin.password) return []
    origin = new URL(origin.origin)
  } catch { return [] }
  const cacheKey = origin.protocol + '//' + normalizedHost(origin), saved = cache.get(cacheKey)
  if (saved && Date.now() - saved.at < CACHE_MS) return ranked(saved.urls, ownerName)
  cache.delete(cacheKey)
  let shared = pending.get(cacheKey)
  if (!shared) {
    shared = { controller: new AbortController(), subscribers: 0, settled: false, promise: Promise.resolve([]) }
    const entry = shared
    entry.promise = collect(origin, entry.controller.signal).then(result => {
      if (result.cacheable && !entry.controller.signal.aborted) {
        if (cache.size >= MAX_CACHED_SITES) cache.delete(cache.keys().next().value!)
        cache.set(cacheKey, { at: Date.now(), urls: result.urls })
      }
      return result.urls
    }).finally(() => { entry.settled = true; if (pending.get(cacheKey) === entry) pending.delete(cacheKey) })
    pending.set(cacheKey, entry)
  }
  const entry = shared
  entry.subscribers++
  try { return ranked(await (signal ? aborted(entry.promise, signal) : entry.promise), ownerName) }
  finally {
    entry.subscribers--
    if (!entry.settled && !entry.subscribers) {
      entry.controller.abort(new DOMException('All sitemap callers stopped', 'AbortError'))
      if (pending.get(cacheKey) === entry) pending.delete(cacheKey)
    }
  }
}
