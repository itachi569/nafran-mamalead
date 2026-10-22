const test = require('node:test')
const assert = require('node:assert/strict')
const { ScrapeRunner } = require('../dist-electron/scraper/runner.js')
const { MockProvider } = require('../dist-electron/scraper/mock.js')
const { ChromiumMapsProvider } = require('../dist-electron/scraper/chromium-maps.js')
const { normaliseQuery } = require('../dist-electron/scraper/types.js')
const query = { keywords: ['dentist Clifton', 'dentist Saddar', 'clinic DHA'], location: 'Karachi', maxResultsPerKeyword: 20, maxResultsTotal: 20 }

test('Maps provider stops reading cards at the total across areas/keywords', async () => {
  let pageUrl = ''; let reads = 0; let searches = 0
  const page = { setDefaultTimeout() {}, setDefaultNavigationTimeout() {}, url: () => pageUrl, goto: async url => { pageUrl = url; searches++ } }
  const provider = new ChromiumMapsProvider({ context: { newPage: async () => page } })
  provider.settleConsent = async () => {}; provider.detectBlock = async () => {}; provider.pause = async () => {}
  // Deliberately oversized feed: a provider guard must still stop exactly at 20.
  provider.collectCards = async () => Array.from({ length: 37 }, (_, i) => ({ name: `Clinic ${i}`, lines: [], website: '', ratingText: '', reviewText: '' }))
  provider.readDetail = async (_, entry) => { reads++; return { name: entry.name, address: `${reads} Karachi`, phone: '', website: '', category: '', plusCode: '', ratingText: '', reviewText: '' } }
  const progress = []
  const rows = await provider.run(normaliseQuery(query), value => progress.push(value), new AbortController().signal)
  assert.equal(rows.length, 20); assert.equal(reads, 20); assert.equal(searches, 1)
  assert.ok(progress.every(value => !value.found || value.found <= 20))
})

test('runner caps streaming and returned rows even if a provider overproduces', async () => {
  const original = MockProvider.prototype.run
  try {
    for (const streaming of [true, false]) {
      MockProvider.prototype.run = async (_, sink) => {
        const rows = Array.from({ length: 37 }, (_, i) => ({ id: String(i), name: `Clinic ${i}` }))
        if (streaming) rows.forEach(lead => sink({ lead, target: 60 }))
        return rows
      }
      const events = []
      const result = await new ScrapeRunner().start({ provider: 'mock', query, onProgress: event => events.push(event) }).result
      assert.equal(result.leads.length, 20)
      assert.ok(events.every(event => event.found <= 20 && event.target <= 20))
      assert.equal(result.query.region, 'pk')
    }
  } finally { MockProvider.prototype.run = original }
})

test('cancellation retains captured rows, blocks overlapping runs, then allows restart', async () => {
  const runner = new ScrapeRunner()
  let stopped
  const handle = runner.start({ provider: 'mock', query, onProgress: event => { if (event.found === 2) stopped = runner.stop() } })
  assert.throws(() => runner.start({ provider: 'mock', query }), /already running/)
  const result = await handle.result
  await stopped
  assert.equal(result.status, 'cancelled'); assert.equal(result.leads.length, 2)
  assert.equal(runner.busy, false)
  assert.equal((await runner.start({ provider: 'mock', query: { ...query, maxResultsTotal: 1 } }).result).leads.length, 1)
})

test('cancelling immediately after start does not leave a running provider', async () => {
  const runner = new ScrapeRunner()
  const handle = runner.start({ provider: 'mock', query })
  await runner.stop()
  assert.equal((await handle.result).status, 'cancelled')
  assert.equal(runner.busy, false)
})
