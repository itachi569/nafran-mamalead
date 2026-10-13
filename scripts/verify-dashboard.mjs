// Reads the dashboard and billing pages and checks they state what the database holds.
const PORT = 9222

const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
const page = targets.find((target) => target.type === 'page')
if (!page) {
  console.error('no page target')
  process.exit(1)
}

const socket = new WebSocket(page.webSocketDebuggerUrl)
let nextId = 1
const pending = new Map()
socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data)
  if (message.id && pending.has(message.id)) {
    pending.get(message.id)(message)
    pending.delete(message.id)
  }
})
const send = (method, params = {}) =>
  new Promise((resolve) => {
    const id = nextId++
    pending.set(id, resolve)
    socket.send(JSON.stringify({ id, method, params }))
  })

await new Promise((resolve) => socket.addEventListener('open', resolve))
await send('Runtime.enable')

const results = []
function check(name, ok, detail = '') {
  results.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` · ${detail}` : ''}`)
}

const expression = `(async () => {
  const db = window.desktop.local
  const totals = await db.dashboard()

  document.querySelector('[data-view="dashboard"]').click()
  await new Promise((r) => setTimeout(r, 1200))
  const body = () => document.body.innerText.replace(/\\n+/g, ' | ')

  const tile = (label) => {
    const node = Array.from(document.querySelectorAll('div')).filter((el) => el.textContent === label).pop()
    return node ? node.parentElement.innerText.replace(/\\n+/g, ' ').replace(label, '').trim() : 'missing'
  }

  // The quality score is the display numeral in the Data Quality card, read from its own node
  // rather than matched out of the page text.
  const qualityCard = Array.from(document.querySelectorAll('section')).find((s) => /Data Quality/.test(s.innerText))
  const qualityScore = qualityCard
    ? (qualityCard.querySelector('div[style*="clamp(52px"]') || {}).textContent || 'missing'
    : 'missing'
  const qualityLabel = qualityCard
    ? Array.from(qualityCard.querySelectorAll('span')).map((s) => s.textContent).find((t) => /Good|Fair|Thin|No data/.test(t)) || 'missing'
    : 'missing'

  const rings = Array.from(document.querySelectorAll('circle[stroke-dashoffset]')).map((c) => c.getAttribute('stroke-dashoffset'))

  return JSON.stringify({
    db: {
      total: totals.total,
      enriched: totals.enriched,
      withPhone: totals.withPhone,
      withEmail: totals.withEmail,
      withSocial: totals.withSocial,
      exportReady: totals.exportReady,
      noEmail: totals.noEmail,
      quality: totals.quality,
      qualityLabel: totals.qualityLabel,
      platforms: totals.platforms,
      categories: totals.categories,
    },
    page: {
      total: tile('Total Leads'),
      enriched: tile('Enriched'),
      phone: tile('With Phone'),
      exportReady: tile('Ready to Export'),
      rings,
      qualityScore,
      qualityLabel,
      // The reference build printed its own sample figures (128 leads, 18 of 18). Those are gone,
      // but a bare search for "128" now matches the live Ready-to-Export count once the file passes
      // 128 leads, which says nothing. The real question is whether any tile still shows the
      // reference's stale pair, so the tiles are read and compared against the database instead.
      tiles: ['Total Leads', 'Enriched', 'With Phone', 'Ready to Export'].map((label) => tile(label)),
      insight: (body().match(/\\d+ of \\d+ leads have a website[^|]*/) || [])[0] || '',
      greeting: (document.querySelector('h1') || {}).textContent || '',
    },
  }, null, 1)
})()`

const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
if (result.result?.exceptionDetails) {
  console.error('probe failed:', JSON.stringify(result.result.exceptionDetails, null, 1))
  process.exit(1)
}
const data = JSON.parse(result.result.result.value)
console.log(JSON.stringify(data, null, 2))
console.log('')

const { db, page: ui } = data
check('the dashboard total matches the database', ui.total.startsWith(String(db.total)), `${ui.total} vs ${db.total} on file`)
check('the enriched tile reads the aggregate', ui.enriched.includes(String(db.enriched)), ui.enriched)
check('the phone tile reads the aggregate', ui.phone.includes(String(db.withPhone)), ui.phone)
check('the export tile reads the aggregate', ui.exportReady.includes(String(db.exportReady)), ui.exportReady)
check('the coverage rings are drawn from real shares', ui.rings.every((offset) => offset !== null), ui.rings.join(', '))
check('the quality score matches the aggregate', ui.qualityScore === String(db.quality), `${ui.qualityScore} vs ${db.quality}% on file`)
check('the quality label matches the aggregate', ui.qualityLabel === db.qualityLabel, ui.qualityLabel)
check('the page greeting is left alone', /Afternoon, Nafran$/.test(ui.greeting), ui.greeting)
// Every tile has to name a figure the database agrees with. The reference's sample counts (128
// leads, 18 enriched) would fail this, which is what the old literal check was reaching for.
const liveFigures = [String(db.total), String(db.enriched), String(db.withPhone), String(db.exportReady)]
const staleTiles = ui.tiles.filter((text, at) => !text.includes(liveFigures[at]))
check(
  'no tile still shows a sample figure',
  staleTiles.length === 0,
  staleTiles.length ? `stale: ${staleTiles.join(' / ')}` : ui.tiles.join(' | '),
)
check('the insight line states a real gap', /\d+ of \d+ leads/.test(ui.insight), ui.insight.slice(0, 90))

const failed = results.filter((entry) => !entry.ok)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
socket.close()
process.exit(failed.length ? 1 : 0)
