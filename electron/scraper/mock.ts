import { leadId, type ProgressSink, type ScraperProvider } from './provider'
import type { Lead, ScrapeQuery } from './types'

const AREAS = ['Deansgate', 'Ancoats', 'Northern Quarter', 'Salford', 'Chorlton', 'Didsbury', 'Hulme', 'Prestwich']
const CATEGORIES = ['Physiotherapist', 'Skin care clinic', 'Sports massage therapist', 'Wellness centre', 'Rehabilitation centre']

function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    function onAbort() {
      clearTimeout(timer)
      reject(new DOMException('Scrape cancelled', 'AbortError'))
    }
    if (signal.aborted) onAbort()
    else signal.addEventListener('abort', onAbort, { once: true })
  })
}

export class MockProvider implements ScraperProvider {
  readonly id = 'mock' as const
  readonly label = 'Offline demo'
  readonly requiresBrowser = false

  async run(query: ScrapeQuery, sink: ProgressSink, signal: AbortSignal): Promise<Lead[]> {
    const leads: Lead[] = []
    const total = query.keywords.length
    const runTarget = Math.min(query.maxResultsTotal ?? Infinity, Math.min(query.maxResultsPerKeyword, 8) * total)
    for (let i = 0; i < total; i += 1) {
      if (leads.length >= runTarget) break
      const keyword = query.keywords[i]
      const target = Math.min(query.maxResultsPerKeyword, 8)
      for (let n = 1; n <= target; n += 1) {
        if (leads.length >= runTarget) break
        await wait(260, signal)
        const area = AREAS[(i + n) % AREAS.length]
        const name = `${area} ${keyword.charAt(0).toUpperCase()}${keyword.slice(1)} ${n}`
        const address = `${n} ${area} Road, ${query.location.split(',')[0]}`
        const lead: Lead = {
          id: leadId(name, address, ''),
          name,
          category: CATEGORIES[(i + n) % CATEGORIES.length],
          address,
          area,
          postcode: `M${(n % 9) + 1} ${n}AB`,
          phone: n % 3 === 0 ? '' : `+44 161 496 0${(100 + n).toString().slice(-3)}`,
          website: n % 4 === 0 ? '' : `https://${area.toLowerCase().replace(/\s+/g, '')}-${i + 1}.example.com`,
          rating: Number((4.1 + ((n % 8) * 0.1)).toFixed(1)),
          reviewCount: 20 + n * 17,
          latitude: null,
          longitude: null,
          placeRef: '',
          mapsUrl: '',
          query: `${keyword} in ${query.location}`,
          keyword,
          provider: this.id,
          capturedAt: new Date().toISOString(),
        }
        leads.push(lead)
        sink({
          status: 'running' as const,
          keyword,
          keywordIndex: i,
          keywordTotal: total,
          found: leads.length,
          target: runTarget,
          message: `Demo run · ${keyword} · ${n} of ${target} simulated places`,
          lead,
        })
      }
    }
    return leads
  }
}
