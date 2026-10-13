// Drives the enrichment worker from the live app and reports what it filled in.
//
// The worker reads each lead's own website for addresses, phone numbers and social profiles.
// This queues a pass over the leads already on file, watches it through to the end, then reads
// the database back to show what was actually stored.
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

async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (result.result?.exceptionDetails) return `ERROR: ${result.result.exceptionDetails.text}`
  return result.result?.result?.value
}

const before = await evaluate(`(async () => {
  const db = window.desktop.local
  const [contacts, socials, leads, coverage] = await Promise.all([
    db.contacts.list('email'), db.social.list(), db.leads.list({ limit: 200 }), db.coverage.email(),
  ])
  return JSON.stringify({
    leadsWithWebsite: leads.rows.filter(l => l.website).length,
    emailsOnFile: contacts.length,
    socialsOnFile: socials.length,
    coverageEmails: coverage.totals ? coverage.totals.emails : 0,
  })
})()`)
console.log('before:', before)

// Queue a pass over every lead that has a website, which is what the app does after a scrape.
const queued = await evaluate(`(async () => {
  const db = window.desktop.local
  const pending = await db.leads.needing('email', 25)
  const { queued } = await db.jobs.queue('email', pending.map(l => l.id))
  const social = await db.leads.needing('social', 25)
  const socialJob = await db.jobs.queue('social', social.map(l => l.id))
  await window.desktop.enrichment.start()
  return JSON.stringify({ emailLeads: queued, socialLeads: socialJob.queued })
})()`)
console.log('queued:', queued)

// Watch it finish. The worker paces itself, so this takes a little while.
console.log('waiting for the worker…')
const deadline = Date.now() + 400_000
let last = ''
while (Date.now() < deadline) {
  await new Promise((resolve) => setTimeout(resolve, 4000))
  const status = await evaluate(`window.desktop.enrichment.status().then(s => JSON.stringify(s))`)
  const parsed = JSON.parse(status)
  if (parsed.running === false && parsed.pending === 0) {
    console.log('  worker idle, queue empty')
    break
  }
  if (status !== last) {
    last = status
    console.log('  ', status)
  }
}

const after = await evaluate(`(async () => {
  const db = window.desktop.local
  const [contacts, socials, people, coverage, jobs, leads] = await Promise.all([
    db.contacts.list('email'), db.social.list(), db.people.list(), db.coverage.email(), db.jobs.totals(), db.leads.list({ limit: 200 }),
  ])
  const byLead = {}
  for (const row of contacts) {
    byLead[row.lead_id] = byLead[row.lead_id] || []
    byLead[row.lead_id].push({ value: row.value, score: row.score, verified: row.verified })
  }
  const nameOf = {}
  for (const lead of leads.rows) nameOf[lead.id] = lead.name
  const stored = Object.entries(byLead).slice(0, 8).map(([id, list]) => ({
    lead: nameOf[id] || id.slice(0, 8),
    addresses: list.sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).map(a => a.value + ' (' + a.score + (a.verified ? ', verified' : '') + ')'),
  }))
  return JSON.stringify({
    emailsFound: contacts.length,
    socialsFound: socials.length,
    peopleFound: people.length,
    coverage: coverage.totals,
    bands: coverage.bands,
    jobs,
    sample: stored,
  }, null, 1)
})()`)
console.log('=== after ===')
console.log(after)

socket.close()
process.exit(0)
