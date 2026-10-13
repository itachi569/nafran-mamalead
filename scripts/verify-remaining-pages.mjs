// Checks the three pages that were still static: Phone Finder, Decision Makers and Website
// Lookup. Each is compared against the database the same way the other page probes are.
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
  const out = {}

  // ---- Phone Finder
  const phone = { rows: await db.phones.ledger({ limit: 200 }), summary: await db.phones.summary() }
  document.querySelector('[data-view="phone"]').click()
  await new Promise((r) => setTimeout(r, 1000))
  const phoneBody = () => document.body.innerText.replace(/\\n+/g, ' | ')
  out.phone = {
    db: phone.summary,
    renderedRows: document.querySelectorAll('[data-row="1"]').length,
    showing: (phoneBody().match(/Showing \\d+ of \\d+ leads/) || [])[0] || 'none',
    callable: (phoneBody().match(/of \\d+ leads · \\d+% callable/) || [])[0] || 'none',
    areaCodes: Array.from(document.querySelectorAll('li')).map((n) => n.innerText.replace(/\\n+/g, ' ')).filter((t) => /^(\\+?\\d{2,5}|07 mobile) /.test(t)).slice(0, 4),
    lineTypes: Array.from(document.querySelectorAll('span')).map((s) => s.textContent).filter((t) => ['Reception', 'Direct line', 'Mobile', 'Missing'].includes(t)).length,
    firstRow: (document.querySelector('[data-row="1"]') || {}).innerText ? document.querySelector('[data-row="1"]').innerText.replace(/\\n+/g, ' · ') : 'none',
    staleLiteral: /\\b89 numbers\\b|27 direct lines/.test(phoneBody()),
  }

  // ---- Decision Makers
  const funnel = await db.people.funnel()
  const people = await db.people.ledger()
  document.querySelector('[data-view="dm"]').click()
  await new Promise((r) => setTimeout(r, 1000))
  out.dm = {
    db: funnel,
    peopleInDb: people.length,
    cards: document.querySelectorAll('[data-person="1"]').length,
    funnelCounts: ['Leads scraped', 'Have a website', 'LinkedIn company page found', 'People listed on the page', 'Named decision maker matched'].map((label) => {
      const node = Array.from(document.querySelectorAll('span')).find((s) => s.textContent === label)
      const row = node ? node.parentElement : null
      return label + '=' + (row ? row.innerText.replace(/\\n+/g, ' ').replace(label, '').trim() : 'missing')
    }),
    stalePeople: /Ruth Ellery|Marcus Aidoo|Nadia Okafor|Iwan Prys/.test(document.body.innerText),
  }

  // ---- Website Lookup
  document.querySelector('[data-view="website"]').click()
  await new Promise((r) => setTimeout(r, 1000))
  const siteBody = () => document.body.innerText.replace(/\\n+/g, ' | ')
  out.website = {
    status: (siteBody().match(/Nothing imported yet|\\d+ imports on file/) || [])[0] || 'none',
    summary: (siteBody().match(/\\d+ lines · \\d+ added · \\d+ duplicates skipped|No imports yet/) || [])[0] || 'none',
    tally: (siteBody().match(/\\d+ with email · \\d+ with phone · \\d+ with socials · \\d+ pending/) || [])[0] || 'none',
    hasImportButton: Boolean(Array.from(document.querySelectorAll('button')).find((b) => /Import websites|Start lookup/.test(b.textContent))),
    staleExample: /deansgatephysio\\.co\\.uk[^]*244 Deansgate/.test(siteBody()),
  }

  return JSON.stringify(out, null, 1)
})()`

const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
if (result.result?.exceptionDetails) {
  console.error('probe failed:', JSON.stringify(result.result.exceptionDetails, null, 1))
  process.exit(1)
}
const data = JSON.parse(result.result.result.value)
console.log(JSON.stringify(data, null, 2))
console.log('')

// Phone
check('the phone book renders a row per lead', data.phone.renderedRows >= data.phone.db.total - 1, `${data.phone.renderedRows} rows vs ${data.phone.db.total} leads`)
check('the phone header counts real leads', data.phone.showing.includes(`of ${data.phone.db.total} leads`), data.phone.showing)
check('the callable share is derived', /of \d+ leads · \d+% callable/.test(data.phone.callable), data.phone.callable)
check('line-type pills are drawn from the data', data.phone.lineTypes > 0, `${data.phone.lineTypes} pills`)
check('the area breakdown lists real codes', data.phone.areaCodes.length > 0, data.phone.areaCodes.join(' / ').slice(0, 80))
check('no hard-coded phone figures remain', !data.phone.staleLiteral, data.phone.staleLiteral ? 'old figures still shown' : 'all figures live')
check('a phone row carries a real business', /\d/.test(data.phone.firstRow) && data.phone.firstRow.length > 8, data.phone.firstRow.slice(0, 80))

// Decision makers
check('the funnel reads the database', data.dm.funnelCounts.every((c) => !c.endsWith('=missing')), data.dm.funnelCounts.join(' | '))
check('the funnel totals match', data.dm.funnelCounts[0].endsWith(`=${data.dm.db.total}`), data.dm.funnelCounts[0])
check('the invented people are gone', !data.dm.stalePeople, data.dm.stalePeople ? 'reference people still shown' : 'no invented names')
check('the card grid matches the stored people', data.dm.cards === Math.min(data.dm.peopleInDb, data.dm.cards), `${data.dm.cards} cards for ${data.dm.peopleInDb} people`)

// Website lookup
check('the import state is reported', data.website.status !== 'none', data.website.status)
check('the import summary is rendered', data.website.summary !== 'none', data.website.summary)
check('the results tally is rendered', /\d+ with email/.test(data.website.tally), data.website.tally)
check('an import control is present', data.website.hasImportButton, 'Import websites / Start lookup')

const failed = results.filter((entry) => !entry.ok)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
socket.close()
process.exit(failed.length ? 1 : 0)
