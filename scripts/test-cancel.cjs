// Temporary check: confirms a running scrape can be cancelled mid-flight.
const { ScrapeRunner } = require('../dist-electron/scraper/runner.js')

const runner = new ScrapeRunner()
const handle = runner.start({
  provider: 'chromium-maps',
  query: { keywords: ['dentist'], location: 'Manchester, United Kingdom', maxResultsPerKeyword: 20 },
  onProgress: (progress) => console.log(`progress: found=${progress.found} ${progress.message}`),
})

setTimeout(() => {
  console.log('--- calling stop() ---')
  void handle.stop()
}, 9000)

handle.result.then((summary) => {
  console.log(`final status=${summary.status} leads=${summary.leads.length} error=${summary.error ?? ''}`)
  process.exit(0)
})
