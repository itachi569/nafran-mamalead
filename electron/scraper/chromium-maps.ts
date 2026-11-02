import {normalizePhone} from '../phone-format'
import {matchesWebsiteFilter} from '../enrichment/source-policy'
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright'
import { AUTOMATION_ARGS, IGNORED_DEFAULT_ARGS, chromeUserAgent } from './browser'
import { parseAddress } from './location'
import { leadId, ScraperBlockedError, ScraperUnavailableError, type ProgressSink, type ScraperProvider } from './provider'
import type { Lead, ScrapeQuery } from './types'
import {mapsHasNoResults, mapsBusinessRelevant, mapsCardCategory} from './relevance'
import {SavedMapsPlaces} from './saved-places'
import {mapsMessages} from './messages'

interface RawCard {
  href: string
  name: string
  ratingText: string
  reviewText: string
  lines: string[]
  website: string
  sponsored: boolean
}

interface RawDetail {
  name: string
  category: string
  address: string
  phone: string
  website: string
  plusCode: string
  ratingText: string
  reviewText: string
}

const MAPS_SEARCH = 'https://www.google.com/maps/search/'
const FEED_SELECTOR = 'div[role="feed"]'
const PLACE_HEADING = 'h1.DUwDvf'

const BLOCK_PATTERNS = [/unusual traffic/i, /automated queries/i, /not a robot/i, /recaptcha/i, /sorry\/index/i]

function toNumber(value: string): number | null {
  const match = value.replace(/,/g, '').match(/\d+(\.\d+)?/)
  return match ? Number(match[0]) : null
}

function toCount(value: string): number | null {
  const match = value.replace(/[(),\s]/g, '').match(/\d+/)
  return match ? Number(match[0]) : null
}

export class ChromiumMapsProvider implements ScraperProvider {
  readonly id = 'chromium-maps' as const
  readonly label = 'Chromium · Google Maps'
  readonly requiresBrowser = true
  skip?: (lead: Partial<Lead>) => boolean
  skipBudget = 0
  lastRunExhausted = false
  private preparedPage: Page | null = null

  private browser: Browser | null = null
  private context: BrowserContext | null = null
  /**
   * Whether this provider is the one that opened the browser.
   *
   * A browser handed to it — the window that just took the Google sign-in — belongs to whoever
   * opened it, and is left open when the run ends. Closing it would take away the profile window
   * the user is looking at, and the next run would have to open and sign in to it all over again.
   */
  private readonly adopted: boolean
  private readonly savedPlaces: SavedMapsPlaces
  private readonly skippedSaved = new Set<string>()

  constructor(options: { context?: BrowserContext; savedPlaces?: SavedMapsPlaces } = {}) {
    this.savedPlaces = options.savedPlaces ?? new SavedMapsPlaces()
    if (options.context) {
      this.context = options.context
      this.adopted = true
    } else {
      this.adopted = false
    }
  }

  async run(query: ScrapeQuery, sink: ProgressSink, signal: AbortSignal): Promise<Lead[]> {
    this.lastRunExhausted = false
    this.skippedSaved.clear()
    const leads: Lead[] = []
    const seen = new Set<string>()
    const seenHrefs = new Set<string>()
    const total = query.keywords.length
    const runTarget = Math.min(query.maxResultsTotal ?? Infinity, query.maxResultsPerKeyword * total)
    const onAbort = () => void this.close()
    signal.addEventListener('abort', onAbort, { once: true })

    try {
      await this.launch(query)
      const context = this.context
      if (!context) throw new ScraperUnavailableError('Chromium started without a browser context.')
      const page = this.preparedPage ?? await context.newPage()
      this.preparedPage = null
      page.setDefaultTimeout(30_000)
      page.setDefaultNavigationTimeout(45_000)

      for (let index = 0; index < total; index += 1) {
        this.assertLive(signal)
        if (leads.length >= runTarget) break
        const keyword = query.keywords[index]
        const keywordStart = leads.length
        const relevanceKeyword = query.relevanceKeywords?.[index] || keyword
        const term = `${keyword} in ${query.location}`
        sink({
          status: 'running',
          keyword,
          keywordIndex: index,
          keywordTotal: total,
          target: runTarget,
          message: mapsMessages.searching(term),
        })

        await page.goto(`${MAPS_SEARCH}${encodeURIComponent(term)}?hl=${query.language}&gl=${query.region}`, {
          waitUntil: 'domcontentloaded',
        })
        await this.settleConsent(page)
        await this.detectBlock(page, page.url())

        const cards = await this.collectCards(page, query, sink, keyword, index, total, leads.length)
        const panel = await page.locator('[role="main"]').first().innerText().catch(()=>page.locator('body').innerText())
        if(mapsHasNoResults(panel)) {
          this.lastRunExhausted = true
          sink({status:'running',keyword,keywordIndex:index,keywordTotal:total,found:leads.length,target:runTarget,message:'No matching places for this query.'})
          continue
        }
        if(!cards.length && !(await page.locator(PLACE_HEADING).count())) continue
        sink({
          status: 'running',
          keyword,
          keywordIndex: index,
          keywordTotal: total,
          found: leads.length,
          target: runTarget,
          message: cards.length
            ? `Read ${cards.length} place${cards.length === 1 ? '' : 's'} from the results feed`
            : 'Single place result — reading the detail panel',
        })

        const entries = cards.length
          ? cards
          : [{ href: page.url(), name: '', ratingText: '', reviewText: '', lines: [], website: '', sponsored: false }]

        for (let slot = 0; slot < entries.length; slot += 1) {
          this.assertLive(signal)
          if (leads.length >= runTarget || leads.length-keywordStart >= query.maxResultsPerKeyword) break
          const entry = entries[slot]
          if (seenHrefs.has(entry.href)) continue
          if (this.savedPlaces.has({mapsUrl:entry.href}) || this.skip?.({mapsUrl:entry.href,name:entry.name})) {
            this.skippedSaved.add(entry.href)
            continue
          }
          // An explicit feed category can reject a wrong business before an expensive visit.
          // Missing/ambiguous categories still get a detail read before making that decision.
          const feedCategory = mapsCardCategory(entry.lines)
          if (feedCategory && !mapsBusinessRelevant(relevanceKeyword, query.location, {name:entry.name, category:feedCategory})) {
            sink({status:'running', keyword, keywordIndex:index, keywordTotal:total, found:leads.length, target:runTarget,
              message:`Skipped unrelated place · ${entry.name} · ${leads.length} matching leads`})
            continue
          }
          const visitStarted = Date.now()
          const detail = await this.readDetail(page, entry, query)
          const name = detail.name || entry.name
          if (!name) continue
          if (!mapsBusinessRelevant(relevanceKeyword, query.location, {name, category: detail.category, lines: entry.lines})) {
            sink({status:'running', keyword, keywordIndex:index, keywordTotal:total, found:leads.length, target:runTarget,
              message:`Skipped unrelated place · ${name} · ${leads.length} matching leads`})
            if (slot < entries.length - 1) await this.pause(query, signal, visitStarted)
            continue
          }
          const key = `${name.toLowerCase()}|${detail.address || entry.lines.join(' ')}`.toLowerCase()
          if (seen.has(key)) continue
          const { area, postcode } = parseAddress(detail.address)
          const coords = this.coordsOf(page.url())
          const lead: Lead = {
            id: leadId(name, detail.address, detail.plusCode),
            name,
            category: detail.category,
            address: detail.address,
            area,
            postcode,
            phone: normalizePhone(detail.phone,detail.address+' '+detail.website+' '+query.location),
            website: detail.website || entry.website,
            rating: toNumber(detail.ratingText || entry.ratingText),
            reviewCount: toCount(detail.reviewText || entry.reviewText),
            latitude: coords.latitude,
            longitude: coords.longitude,
            placeRef: this.placeRefOf(query.detail ? page.url() : entry.href),
            mapsUrl: query.detail ? page.url() : entry.href,
            query: term,
            keyword,
            provider: this.id,
            capturedAt: new Date().toISOString(),
          }
          if (this.savedPlaces.has(lead) || this.skip?.(lead)) {
            this.skippedSaved.add(entry.href || key)
            sink({status:'running', keyword, keywordIndex:index, keywordTotal:total, found:leads.length, target:runTarget,
              message:`Skipped saved business · ${name} · ${leads.length} new leads`})
            if (slot < entries.length - 1) await this.pause(query, signal, visitStarted)
            continue
          }
          if (!matchesWebsiteFilter(lead.website, query.websiteFilter)) {
            if (slot < entries.length - 1) await this.pause(query,signal,visitStarted)
            continue
          }
          seen.add(key)
          if (entry.href) seenHrefs.add(entry.href)
          leads.push(lead)
          sink({
            status: 'running',
            keyword,
            keywordIndex: index,
            keywordTotal: total,
            found: leads.length,
            target: runTarget,
            message: mapsMessages.captured(leads.length,name),
            lead,
          })
          if (leads.length >= runTarget) break
          if (slot < entries.length - 1) await this.pause(query, signal, visitStarted)
        }
      }
      if (this.skippedSaved.size) {
        const collectionNote = `Skipped ${this.skippedSaved.size} businesses already saved on this device. Only new leads count toward your limit.`
        sink({status:'running', found:leads.length, target:runTarget, message:collectionNote, collectionNote})
      }
      return leads
    } finally {
      signal.removeEventListener('abort', onAbort)
      await this.close()
    }
  }

  async prepare(query:ScrapeQuery,signal:AbortSignal):Promise<void> {
    signal.throwIfAborted()
    await this.launch(query)
    if(!this.context)throw new ScraperUnavailableError('Browser context is unavailable.')
    if(this.preparedPage)await this.preparedPage.close().catch(()=>undefined)
    const page=await this.context.newPage()
    this.preparedPage=page
    const abort=()=>void page.close().catch(()=>undefined)
    signal.addEventListener('abort',abort,{once:true})
    try{
      const term=query.keywords[0]+' in '+query.location
      await page.goto(`${MAPS_SEARCH}${encodeURIComponent(term)}?hl=${query.language}&gl=${query.region}`,{waitUntil:'domcontentloaded',timeout:15000})
      signal.throwIfAborted()
    }finally{signal.removeEventListener('abort',abort)}
  }

  async close(): Promise<void> {
    const browser = this.browser
    const context = this.context
    this.browser = null
    this.context = this.adopted ? context : null
    if(this.preparedPage){await this.preparedPage.close().catch(()=>undefined);this.preparedPage=null}
    // A browser the caller opened outlives the run: the reference is dropped so nothing here uses
    // it again, and the window itself is left exactly as the user left it.
    if (this.adopted) return
    // A persistent context owns its browser and has no separate handle, so for one of those the
    // context is the thing to close. `browser` is only set for the throwaway case.
    if (browser) await browser.close().catch(() => undefined)
    else if (context) await context.close().catch(() => undefined)
  }

  /**
   * Starts the browser and leaves its context on `this.context`.
   *
   * A saved profile is opened where it lives, so the Google sign-in it holds is the one every run
   * after it gets. Anything else is a temporary profile Playwright creates and deletes with the
   * context — nothing of an existing browser session is opened or written.
   *
   * A context already on the provider is the caller's own window: there is nothing to start, and
   * the page the run needs is opened in it.
   */
  private async launch(query: ScrapeQuery): Promise<void> {
    if (this.context) return
    const executablePath = query.executablePath?.trim()
    const profileDir = query.profileDir?.trim()
    const viewport = { width: 1440, height: 900 }
    const locale = query.language === 'en' ? 'en-GB' : query.language
    try {
      const launchOptions = {
        headless: query.headless,
        ignoreDefaultArgs: IGNORED_DEFAULT_ARGS,
        args: AUTOMATION_ARGS,
        ...(executablePath ? { executablePath } : {}),
      }
      if (profileDir) {
        // A profile folder takes one browser at a time, and the gate reads the saved account by
        // opening that same folder a moment before this. That read closes first, but Windows does
        // not always let go of the lock in the same instant, so the open is tried again before the
        // run gives up on a profile that is in fact free.
        this.context = await this.openProfile(profileDir, { ...launchOptions, viewport, locale, userAgent: chromeUserAgent() })
        return
      }
      const browser = await chromium.launch(launchOptions)
      this.browser = browser
      this.context = await browser.newContext({ viewport, locale, userAgent: chromeUserAgent() })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (/Executable doesn't exist|playwright install/i.test(message)) {
        throw new ScraperUnavailableError(
          executablePath
            ? `The chosen browser could not be started: ${executablePath}. Check the path, or clear it in Run behaviour to use the bundled Chromium.`
            : 'Chromium is not installed for Playwright. Run: npx playwright install chromium',
        )
      }
      if (profileDir) {
        // A profile folder takes one browser at a time, and the sign-in window is the other thing
        // that holds this one.
        throw new ScraperUnavailableError(
          `The saved Google profile could not be opened: ${message} Close the Google sign-in window, then run again.`,
        )
      }
      throw new ScraperUnavailableError(
        executablePath ? `The chosen browser could not be started: ${executablePath} — ${message}` : `Chromium could not start: ${message}`,
      )
    }
  }

  /** Opens the saved profile, retrying the one failure that is about timing rather than access. */
  private async openProfile(
    profileDir: string,
    options: Parameters<typeof chromium.launchPersistentContext>[1],
  ): Promise<BrowserContext> {
    const attempts = 3
    for (let attempt = 1; ; attempt += 1) {
      try {
        return await chromium.launchPersistentContext(profileDir, options)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        const contended = /ProcessSingleton|SingletonLock|already (in use|running)|lock/i.test(message)
        if (attempt >= attempts || !contended) throw error
        await new Promise((resolve) => setTimeout(resolve, 1_200))
      }
    }
  }

  private assertLive(signal: AbortSignal): void {
    if (signal.aborted) throw new DOMException('Scrape cancelled', 'AbortError')
  }

  private async pause(query: ScrapeQuery, signal: AbortSignal, visitStarted = Date.now()): Promise<void> {
    const span = Math.max(0, query.maxDelayMs - query.minDelayMs)
    // Count navigation/read time toward the chosen interval instead of adding the full delay
    // again after every page has already loaded. Network visits remain sequential and paced.
    const waitFor = Math.max(0, query.minDelayMs + Math.floor(Math.random() * (span + 1)) - (Date.now() - visitStarted))
    this.assertLive(signal)
    if (!waitFor) return
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        signal.removeEventListener('abort', onAbort)
        resolve()
      }, waitFor)
      function onAbort() {
        clearTimeout(timer)
        reject(new DOMException('Scrape cancelled', 'AbortError'))
      }
      if (signal.aborted) onAbort()
      else signal.addEventListener('abort', onAbort, { once: true })
    })
  }

  private async settleConsent(page: Page): Promise<void> {
    const candidates = [
      'button[aria-label="Accept all"]',
      'button[aria-label="Reject all"]',
      'button:has-text("Accept all")',
      'button:has-text("I agree")',
      'form[action*="consent"] button',
    ]
    for (const selector of candidates) {
      const target = page.locator(selector).first()
      try {
        if (await target.isVisible({ timeout: 1_500 })) {
          await target.click({ timeout: 3_000 })
          await page.waitForLoadState('domcontentloaded').catch(() => undefined)
          return
        }
      } catch {
        // Consent UI is optional; a missing panel is the normal case.
      }
    }
  }

  private async detectBlock(page: Page, url: string): Promise<void> {
    if (/consent\.google\.com|\/sorry\//.test(url)) {
      throw new ScraperBlockedError(
        'Google redirected this session to a consent or block page.',
        'Run with the browser visible (headless off), slow the pacing down, and try a smaller result cap. Google can also require the official Places API for automated access.',
      )
    }
    const text = await page.locator('body').innerText().catch(() => '')
    if (BLOCK_PATTERNS.some((pattern) => pattern.test(text))) {
      throw new ScraperBlockedError(
        'Google returned an anti-automation challenge instead of results.',
        'This build does not bypass CAPTCHA or bot checks. Use the official Places API for reliable automated access, or lower the volume and pace.',
      )
    }
  }

  private async collectCards(
    page: Page,
    query: ScrapeQuery,
    sink: ProgressSink,
    keyword: string,
    index: number,
    total: number,
    alreadyFound: number,
  ): Promise<RawCard[]> {
    await page.waitForSelector(`${FEED_SELECTOR}, ${PLACE_HEADING}`, { timeout: 25_000 }).catch(() => undefined)
    const feed = page.locator(FEED_SELECTOR)
    if (!(await feed.count())) return []
    await page.waitForSelector('a.hfpxzc', { timeout: 20_000 }).catch(() => undefined)

    // Rejected places do not consume the allowance. Consider later candidates in this same
    // query's feed instead of truncating to the requested number before relevance filtering.
    // Saved cards with stable Maps IDs do not consume this budget. Extra candidates cover old
    // records which can only be recognised after reading their name/address detail panel.
    const limit = 200 + Math.min(this.savedPlaces.size + this.skipBudget, 5000)
    const allCards = new Map<string,RawCard>()
    let candidates: RawCard[] = []
    const relevanceKeyword = query.relevanceKeywords?.[index] || keyword
    let stagnant = 0
    let loaded = 0
    let exhausted = false
    for (let pass = 0; pass < 90 && candidates.length < limit && stagnant < 3; pass += 1) {
      const next = await this.readFeed(page)
      for (const card of next) allCards.set(card.href,card)
      if (allCards.size === loaded) stagnant += 1
      else stagnant = 0
      loaded = allCards.size
      candidates = [...allCards.values()].filter(card => {
        if (card.sponsored) return false
        if (this.savedPlaces.has({mapsUrl:card.href}) || this.skip?.({mapsUrl:card.href,name:card.name})) {
          this.skippedSaved.add(card.href)
          return false
        }
        const category = mapsCardCategory(card.lines)
        return !category || mapsBusinessRelevant(relevanceKeyword,query.location,{name:card.name,category})
      })
      sink({
        status: 'running',
        keyword,
        keywordIndex: index,
        keywordTotal: total,
        found: alreadyFound,
        target: Math.min(query.maxResultsTotal ?? Infinity, query.maxResultsPerKeyword * total),
        message: `Loading results · ${loaded} listed · ${this.skippedSaved.size} saved businesses skipped`,
      })
      if (candidates.length >= limit) break
      exhausted = Boolean(await page
        .locator('text=/You\'ve reached the end of the list/i')
        .count()
        .catch(() => 0))
      if (exhausted) break
      await feed.evaluate((el) => el.scrollBy(0, el.scrollHeight))
      // Wait for actual new cards instead of assuming a slow response is an exhausted list.
      await page.waitForFunction(previous => {
        const list = document.querySelector('div[role="feed"]')
        const seen = new Set(previous)
        return Array.from(list?.querySelectorAll<HTMLAnchorElement>('a.hfpxzc') ?? []).some(link => !seen.has(link.href))
          || /You've reached the end of the list/i.test(document.body.innerText)
      }, [...allCards.keys()], {timeout: 3500, polling: 200}).catch(error => { if (page.isClosed()) throw error })
    }
    this.lastRunExhausted = exhausted
    const collectionNote = exhausted
      ? `Google Maps reached the end of the list for “${keyword}”.`
      : candidates.length >= limit ? `Checked up to ${limit} new candidates listed by Google Maps for “${keyword}”.`
      : `Google Maps stopped loading more places for “${keyword}” after retries. Try a smaller area for more coverage.`
    sink({status:'running', keyword, keywordIndex:index, keywordTotal:total, found:alreadyFound,
      target:Math.min(query.maxResultsTotal ?? Infinity, query.maxResultsPerKeyword * total), message:collectionNote, collectionNote})
    return candidates.slice(0, limit)
  }

  private async readFeed(page: Page): Promise<RawCard[]> {
    return page.evaluate((): RawCard[] => {
      const feed = document.querySelector('div[role="feed"]')
      if (!feed) return []
      const links = Array.from(feed.querySelectorAll('a.hfpxzc')) as HTMLAnchorElement[]
      return links.map((link) => {
        const card = (link.closest('div[jsaction]') ?? link.parentElement) as HTMLElement | null
        const lines = card
          ? Array.from(card.querySelectorAll('div.W4Efsd'))
              .map((el) => (el as HTMLElement).innerText.replace(/\s+/g, ' ').trim())
              .filter(Boolean)
          : []
        const website = card?.querySelector('a[data-value="Website"]') as HTMLAnchorElement | null
        return {
          href: link.href,
          name: link.getAttribute('aria-label')?.trim() ?? '',
          ratingText: card?.querySelector('span.MW4etd')?.textContent?.trim() ?? '',
          reviewText: card?.querySelector('span.UY7F9')?.textContent?.trim() ?? '',
          lines,
          website: website?.href ?? '',
          sponsored: card ? /sponsored/i.test(card.innerText) : false,
        }
      })
    })
  }

  private async readDetail(page: Page, entry: RawCard, query: ScrapeQuery): Promise<RawDetail> {
    const empty: RawDetail = {
      name: entry.name,
      category: '',
      address: '',
      phone: '',
      website: '',
      plusCode: '',
      ratingText: entry.ratingText,
      reviewText: entry.reviewText,
    }
    if (!query.detail || !entry.href) {
      const infoLine =
        entry.lines.find((line) => line.includes('·') && !/\b(open|closed|closes)\b/i.test(line)) ??
        entry.lines.find((line) => /,/.test(line)) ??
        ''
      const address = infoLine.includes('·') ? infoLine.slice(infoLine.lastIndexOf('·') + 1).trim() : infoLine
      return { ...empty, address, category: mapsCardCategory(entry.lines) }
    }
    try {
      // A single-place search has already loaded its detail panel.
      if (page.url() !== entry.href || !(await page.locator(PLACE_HEADING).count())) {
        await page.goto(entry.href, { waitUntil: 'domcontentloaded' })
      }
      await this.settleConsent(page)
      await page.waitForSelector(PLACE_HEADING, { timeout: 20_000 }).catch(() => undefined)
      await this.detectBlock(page, page.url())
      const detail = await page.evaluate((): RawDetail => {
        const text = (selector: string) => (document.querySelector(selector) as HTMLElement | null)?.textContent?.trim() ?? ''
        const label = (selector: string) => (document.querySelector(selector) as HTMLElement | null)?.getAttribute('aria-label') ?? ''
        const ratingBlock = document.querySelector('div.F7nice')
        return {
          name: text('h1.DUwDvf'),
          category: text('button[jsaction*="category"]') || text('div.DkEaL'),
          address: label('button[data-item-id="address"]').replace(/^Address:\s*/i, '').trim(),
          phone: label('button[data-item-id^="phone:tel:"]').replace(/^Phone:\s*/i, '').trim(),
          website: (document.querySelector('a[data-item-id="authority"]') as HTMLAnchorElement | null)?.href ?? '',
          plusCode: label('button[data-item-id="oloc"]').replace(/^Plus code:\s*/i, '').trim(),
          ratingText: (ratingBlock?.querySelector('span[aria-hidden="true"]') as HTMLElement | null)?.textContent?.trim() ?? '',
          reviewText: (ratingBlock?.querySelector('span[aria-label*="review"]') as HTMLElement | null)?.getAttribute('aria-label')?.trim() ?? '',
        }
      })
      return { ...detail, name: detail.name || entry.name }
    } catch (error) {
      if (error instanceof ScraperBlockedError) throw error
      return empty
    }
  }

  private coordsOf(url: string): { latitude: number | null; longitude: number | null } {
    const at = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/)
    if (at) return { latitude: Number(at[1]), longitude: Number(at[2]) }
    const dataParam = url.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/)
    if (dataParam) return { latitude: Number(dataParam[1]), longitude: Number(dataParam[2]) }
    return { latitude: null, longitude: null }
  }

  private placeRefOf(url: string): string {
    const ftid = url.match(/!1s(0x[0-9a-f]+:0x[0-9a-f]+)/i)?.[1]
    if (ftid) return ftid
    const cid = url.match(/[?&]cid=(\d+)/)?.[1]
    return cid ? `cid:${cid}` : ''
  }
}
