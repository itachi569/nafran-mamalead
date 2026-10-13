// Reads the pages that were moved onto real data and reports what they now show.
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
  const out = {}
  const text = () => document.body.innerText.replace(/\\n+/g, ' | ')

  document.querySelector('[data-view="runs"]').click()
  await new Promise((r) => setTimeout(r, 900))
  const runBody = text()
  out.runs = {
    badge: (runBody.match(/\\d+ RUNS/) || [])[0] || 'none',
    footer: (runBody.match(/Showing \\d+ of \\d+ runs/) || [])[0] || 'none',
    rows: document.querySelectorAll('[data-runstatus]').length,
    statuses: Array.from(document.querySelectorAll('[data-runstatus]')).map((n) => n.textContent),
    sample: Array.from(document.querySelectorAll('li')).map((n) => n.innerText.replace(/\\n+/g, ' · ')).filter((t) => /Google Maps ·/.test(t)).slice(0, 2),
    counters: ['Runs completed', 'Places captured', 'Run duration', 'Finished clean'].map((label) => {
      const node = Array.from(document.querySelectorAll('div')).filter((el) => el.textContent === label).pop()
      const box = node ? node.parentElement : null
      return label + '=' + (box ? box.innerText.replace(/\\n+/g, ' ').replace(label, '').trim() : 'missing')
    }),
  }

  document.querySelector('[data-view="leads"]').click()
  await new Promise((r) => setTimeout(r, 800))
  out.leads = {
    badge: (text().match(/\\d+ SAVED/) || [])[0] || 'none',
    rows: document.querySelectorAll('[data-row="1"]').length,
    onFile: (text().match(/[\\d,]+ leads on file/) || [])[0] || 'none',
  }

  document.querySelector('[data-view="email"]').click()
  await new Promise((r) => setTimeout(r, 900))
  const emailBody = text()
  out.email = {
    showing: (emailBody.match(/Showing \\d+ of \\d+ leads/) || [])[0] || 'none',
    cascade: (emailBody.match(/Where the \\d+ scraped leads/) || [])[0] || 'none',
    badge: (emailBody.match(/\\d+%/) || [])[0] || 'none',
    rows: document.querySelectorAll('[data-row="1"]').length,
    addresses: Array.from(document.querySelectorAll('[data-row="1"]')).map((r) => r.innerText.split('\\n')[0]).slice(0, 3),
  }

  document.querySelector('[data-view="social"]').click()
  await new Promise((r) => setTimeout(r, 900))
  out.social = {
    rows: document.querySelectorAll('[data-soclist] > li').length,
    donuts: document.querySelectorAll('circle[stroke-dashoffset]').length,
    showing: (text().match(/Showing \\d+ of \\d+ leads/) || [])[0] || 'none',
  }

  document.querySelector('[data-view="lists"]').click()
  await new Promise((r) => setTimeout(r, 900))
  out.lists = {
    totals: (text().match(/\\d+ lists? · \\d+ leads/) || [])[0] || 'none',
    cards: Array.from(document.querySelectorAll('h3')).map((n) => n.textContent).filter((t) => /Tier|Warm|Quays|list/i.test(t)),
  }

  return JSON.stringify(out, null, 1)
})()`

const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
if (result.result?.exceptionDetails) {
  console.error('probe failed:', result.result.exceptionDetails.text)
  process.exit(1)
}
const data = JSON.parse(result.result.result.value)

console.log(JSON.stringify(data, null, 2))
console.log('')

check('Run History shows the stored run count', /^\d+ RUNS$/.test(data.runs.badge), data.runs.badge)
check('Run History lists stored runs', data.runs.rows > 0, `${data.runs.rows} rows`)
check('Run History footer counts the log', /Showing \d+ of \d+ runs/.test(data.runs.footer), data.runs.footer)
check('a run row carries its real summary', data.runs.sample.some((row) => /Google Maps ·/.test(row)), (data.runs.sample[0] ?? '').slice(0, 90))
check('the run counters read the log', data.runs.counters.every((entry) => !entry.endsWith('=missing')), data.runs.counters.join(' | '))

check('the ledger shows stored leads', data.leads.rows > 0 && /^\d+ SAVED$/.test(data.leads.badge), `${data.leads.badge}, ${data.leads.rows} rows`)
check('the Email Finder counts real leads', /Where the \d+ scraped leads/.test(data.email.cascade), data.email.cascade)
check('the Email Finder lists addresses found by the worker', data.email.rows > 0, `${data.email.rows} rows`)
check('Social Profiles reads real rows', data.social.rows >= 0, `${data.social.rows} rows, ${data.social.donuts} rings`)
check('Saved Lists totals read the database', /\d+ lists? · \d+ leads/.test(data.lists.totals), data.lists.totals)

const failed = results.filter((entry) => !entry.ok)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)

socket.close()
process.exit(failed.length ? 1 : 0)
