// Real Chromium and Maps provider, with controlled Maps HTML; no Google network traffic.
const assert = require('node:assert/strict')
const { chromium } = require('playwright')
const { ChromiumMapsProvider } = require('../dist-electron/scraper/chromium-maps.js')
const { normaliseQuery } = require('../dist-electron/scraper/types.js')
async function main() {
  const browser = await chromium.launch({ headless: true })
  try {
    for (const [cap, available, keywords, expected] of [
      [40, 60, ['dentist'], 40], [25, 40, ['dentist'], 25],
      [25, 10, ['dentist'], 10], [25, 10, ['dentist Clifton', 'dentist Saddar'], 10],
    ]) {
      const context = await browser.newContext()
      await context.route('**/*', route => {
        const cards = Array.from({ length: available }, (_, i) => `<div jsaction="card"><a class="hfpxzc" aria-label="Karachi Clinic ${i}" href="https://www.google.com/maps/place/clinic-${i}">Clinic</a><div class="W4Efsd">Clinic · ${i} Clifton, Karachi</div><span class="MW4etd">4.5</span><span class="UY7F9">(20)</span></div>`).join('')
        return route.fulfill({ contentType: 'text/html', body: `<html><body><div role="feed">${cards}</div><p>You've reached the end of the list</p></body></html>` })
      })
      const provider = new ChromiumMapsProvider({ context })
      provider.pause = async () => {} // Test fixture needs no network pacing.
      const progress = []
      const leads = await provider.run(normaliseQuery({ keywords, location: 'Karachi', maxResultsPerKeyword: cap, maxResultsTotal: cap, detail: false }), event => progress.push(event), new AbortController().signal)
      assert.equal(leads.length, expected)
      assert.equal(new Set(leads.map(lead => lead.id)).size, expected)
      assert.ok(progress.every(event => (event.found ?? 0) <= cap))
      console.log(`PASS actual Chromium Maps parsing: requested ${cap}, ${available} available per search, ${keywords.length} keyword/area(s) → ${expected} unique leads`)
      await context.close()
    }
  } finally { await browser.close() }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
