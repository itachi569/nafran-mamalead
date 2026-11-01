import {normalizePhone} from '../phone-format'
import {matchesWebsiteFilter} from '../enrichment/source-policy'
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright'
import { AUTOMATION_ARGS, IGNORED_DEFAULT_ARGS, chromeUserAgent } from './browser'
import { parseAddress } from './location'
import { leadId, ScraperBlockedError, ScraperUnavailableError, type ProgressSink, type ScraperProvider } from './provider'
import type { Lead, ScrapeQuery } from './types'
import {mapsHasNoResults,mapsResultsRelevant} from './relevance'

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

  constructor(options: { context?: BrowserContext } = {}) {
    if (options.context) {
      this.context = options.context
      this.adopted = true
    } else {
      this.adopted = false
    }
  }

  async run(query: ScrapeQuery, sink: ProgressSink, signal: AbortSignal): Promise<Lead[]> {
    const leads: Lead[] = []
    const seen = new Set<string>()
    const total = query.keywords.length
    const runTarget = Math.min(query.maxResultsTotal ?? Infinity, query.maxResultsPerKeyword * total)
    const onAbort = () => void this.close()
    signal.addEventListener('abort', onAbort, { once: true })

    try {
      await this.launch(query)
      const context = this.context
      if (!context) throw new ScraperUnavailableError('Chromium started without a browser context.')
      const page = await context.newPage()
      page.setDefaultTimeout(30_000)
      page.setDefaultNavigationTimeout(45_000)

      for (let index = 0; index < total; index += 1) {
        this.assertLive(signal)
        if (leads.length >= runTarget) break
        const keyword = query.keywords[index]
        const term = `${keyword} in ${query.location}`
        sink({
          status: 'running',
          keyword,
          keywordIndex: index,
          keywordTotal: total,
          target: runTarget,
          message: `Searching Google Maps for “${term}”`,
        })

        await page.goto(`${MAPS_SEARCH}${encodeURIComponent(term)}?hl=${query.language}&gl=${query.region}`, {
          waitUntil: 'domcontentloaded',
        })
        await this.settleConsent(page)
        await this.detectBlock(page, page.url())

        const cards = await this.collectCards(page, query, sink, keyword, index, total, leads.length)
        const panel = await page.locator('[role="main"]').first().innerText().catch(()=>page.locator('body').innerText())
        if(mapsHasNoResults(panel) || (cards.length && !mapsResultsRelevant(keyword,query.location,cards))) {
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
          if (leads.length >= runTarget) break
          const entry = entries[slot]
          const detail = await this.readDetail(page, entry, query)
          const name = detail.name || entry.name
          if (!name) continue
          const key = `${name.toLowerCase()}|${detail.address || entry.lines.join(' ')}`.toLowerCase()
          if (seen.has(key)) continue
          seen.add(key)
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
            placeRef: this.placeRefOf(page.url()),
            mapsUrl: page.url(),
            query: term,
            keyword,
            provider: this.id,
            capturedAt: new Date().toISOString(),
          }
          if (!matchesWebsiteFilter(lead.website, query.websiteFilter)) {
            await this.pause(query,signal); continue
          }
          leads.push(lead)
          sink({
            status: 'running',
            keyword,
            keywordIndex: index,
            keywordTotal: total,
            found: leads.length,
            target: runTarget,
            message: `Captured ${leads.length} · ${name}`,
            lead,
          })
          if (leads.length >= runTarget) break
          if (slot < entries.length - 1) await this.pause(query, signal)
        }
      }
      return leads
    } finally {
      signal.removeEventListener('abort', onAbort)
      await this.close()
    }
  }

  async close(): Promise<void> {
    const browser = this.browser
    const context = this.context
    this.browser = null
    this.context = null
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
    if (this.adopted) return
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

  private async pause(query: ScrapeQuery, signal: AbortSignal): Promise<void> {
    const span = Math.max(0, query.maxDelayMs - query.minDelayMs)
    const waitFor = query.minDelayMs + Math.floor(Math.random() * (span + 1))
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

    const limit = query.websiteFilter && query.websiteFilter !== "any" ? 200 : Math.min(query.maxResultsPerKeyword, (query.maxResultsTotal ?? Infinity) - alreadyFound)
    let stagnant = 0
    let loaded = 0
    for (let pass = 0; pass < 40 && loaded < limit && stagnant < 3; pass += 1) {
      const next = await this.readFeed(page)
      if (next.length === loaded) stagnant += 1
      else stagnant = 0
      loaded = next.length
      sink({
        status: 'running',
        keyword,
        keywordIndex: index,
        keywordTotal: total,
        found: alreadyFound,
        target: Math.min(query.maxResultsTotal ?? Infinity, query.maxResultsPerKeyword * total),
        message: `Loading results · ${Math.min(loaded, limit)} of ${limit} listed`,
      })
      if (loaded >= limit) break
      const exhausted = await page
        .locator('text=/You\'ve reached the end of the list/i')
        .count()
        .catch(() => 0)
      if (exhausted) break
      await feed.evaluate((el) => el.scrollBy(0, el.scrollHeight))
      await page.waitForTimeout(700 + Math.floor(Math.random() * 500))
    }
    const cards = (await this.readFeed(page)).filter((card) => !card.sponsored)
    return cards.slice(0, limit)
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
      return { ...empty, address }
    }
    try {
      await page.goto(entry.href, { waitUntil: 'domcontentloaded' })
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
