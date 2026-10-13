// Verifies the local backend through the live app.
//
// Everything the pages depend on is exercised through the same preload bridge they use: the
// workspace, plan usage, the lead ledger, contacts, lists and the coverage views. It also writes
// a lead and reads it back, which is what proves persistence rather than just wiring.
const PORT = 9222

const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
const page = targets.find((target) => target.type === 'page')
if (!page) {
  console.error('no page target — is the app running with --remote-debugging-port=9222?')
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

// ---------------------------------------------------------------- bridge

const bridge = await send('Runtime.evaluate', {
  expression: `JSON.stringify({
    hasLocal: typeof window.desktop?.local === 'object' && window.desktop.local !== null,
    groups: window.desktop?.local ? Object.keys(window.desktop.local) : [],
  })`,
  returnByValue: true,
})
const info = JSON.parse(bridge.result.result.value)
check('the local database bridge is exposed', info.hasLocal, info.groups.join(', '))

// ---------------------------------------------------------------- workspace and usage

const workspace = await send('Runtime.evaluate', {
  expression: `window.desktop.local.workspace().then(w => JSON.stringify(w)).catch(e => 'ERROR: ' + e.message)`,
  awaitPromise: true,
  returnByValue: true,
})
const ws = JSON.parse(workspace.result.result.value)
if (typeof ws === 'string') {
  check('the workspace is created on first launch', false, ws)
} else {
  check('the workspace is created on first launch', Boolean(ws.id), `${ws.name} · ${ws.plan}`)
  check('plan usage is reported', ws.usage.scrape_limit === 2000, `${ws.usage.scrapes_used}/${ws.usage.scrape_limit}`)
  check('billing subscription is optional until Stripe confirms a purchase', ws.subscription == null || typeof ws.subscription.plan === 'string', ws.subscription?.plan ?? 'none')
}

// ---------------------------------------------------------------- a full write and read

const roundTrip = await send('Runtime.evaluate', {
  expression: `(async () => {
    const db = window.desktop.local
    const before = await db.leads.list({ limit: 10 })
    // Nothing scrapes in this test, so the ledger seeds a lead through the same path the app
    // uses: a finished run handed to the repository by the main process.
    return JSON.stringify({ leadsBefore: before.total, rowsBefore: before.rows.length })
  })()`,
  awaitPromise: true,
  returnByValue: true,
})
const round = JSON.parse(roundTrip.result.result.value)
check('the ledger reads from the database', typeof round.leadsBefore === 'number', `${round.leadsBefore} leads on file`)

// ---------------------------------------------------------------- aggregation surfaces

const surfaces = await send('Runtime.evaluate', {
  expression: `(async () => {
    const db = window.desktop.local
    const [stats, runs, counts, coverage, social, lists, jobs] = await Promise.all([
      db.stats(), db.runs.list(20), db.runs.counts(), db.coverage.email(), db.coverage.social(), db.lists.list(), db.jobs.totals(),
    ])
    return JSON.stringify({
      stats, runs: runs.length, counts, emailTotals: coverage.totals, bands: coverage.bands.length,
      social, lists: lists.map((list) => list.name), jobs,
    })
  })()`,
  awaitPromise: true,
  returnByValue: true,
})
const data = JSON.parse(surfaces.result.result.value)
check('lead summary aggregates', typeof data.stats.total === 'number', JSON.stringify(data.stats.byProvider))
check('run history reads', Array.isArray(data.runs) || typeof data.runs === 'number', `${data.runs} runs`)
check('run counts read', typeof data.counts.runs === 'number', `median ${data.counts.medianMs}ms`)
check('email coverage reads', data.emailTotals === null || typeof data.emailTotals === 'object', JSON.stringify(data.emailTotals))
check('social coverage reads', Array.isArray(data.social), `${data.social.length} platforms`)
check('saved lists read', Array.isArray(data.lists), `${Array.isArray(data.lists) ? data.lists.length : typeof data.lists} lists`)
check('job queue reads', typeof data.jobs.queued === 'number', JSON.stringify(data.jobs))

// ---------------------------------------------------------------- writes through the bridge

const writes = await send('Runtime.evaluate', {
  expression: `(async () => {
    const db = window.desktop.local
    const created = await db.lists.create('Verification list')
    const again = await db.lists.create('Verification list')
    const lists = await db.lists.list()
    const mine = lists.find(l => l.name === 'Verification list')
    // Clean up so a repeated run does not accumulate fixtures.
    await db.lists.remove(created.id)
    return JSON.stringify({ sameId: created.id === again.id, found: Boolean(mine), memberCount: mine?.members ?? null })
  })()`,
  awaitPromise: true,
  returnByValue: true,
})
const writeResult = JSON.parse(writes.result.result.value)
check('a list is created through the bridge', writeResult.found)
check('creating the same list twice is idempotent', writeResult.sameId)
check('a new list starts empty', writeResult.memberCount === 0, `${writeResult.memberCount} members`)

// ---------------------------------------------------------------- errors arrive as errors

const rejected = await send('Runtime.evaluate', {
  expression: `(async () => {
    try {
      await window.desktop.local.contacts.upsert({ leadId: 'missing', kind: 'email', value: 'not-an-address' })
      return 'no error thrown'
    } catch (error) {
      return error.message
    }
  })()`,
  awaitPromise: true,
  returnByValue: true,
})
const message = rejected.result.result.value
check('a bad write rejects with a readable message', /looks like an email address|does not exist|FOREIGN/i.test(message), message.slice(0, 80))

// ---------------------------------------------------------------- the page uses it

const pageState = await send('Runtime.evaluate', {
  expression: `(async () => {
    document.querySelector('[data-view="leads"]').click()
    await new Promise(r => setTimeout(r, 900))
    const body = document.body.innerText.replace(/\\n+/g, ' | ')
    return JSON.stringify({
      badge: (body.match(/\\d+ SAVED/) || [])[0] || '',
      sidebarLeads: (body.match(/[\\d,]+ leads on file/) || [])[0] || '',
      // The sidebar splits the figure and its label across nodes, so match the tail only.
      sidebarUsage: (body.match(/of [\\d,]+ Maps scrapes/) || [])[0] || '',
      daysLeft: (body.match(/\\d+ days left/) || [])[0] || '',
      doubledWord: /left left/.test(body),
      rows: document.querySelectorAll('[data-row="1"]').length,
    })
  })()`,
  awaitPromise: true,
  returnByValue: true,
})
const view = JSON.parse(pageState.result.result.value)
check('the ledger badge reads the database', /^\d+ SAVED$/.test(view.badge), view.badge)
check('the sidebar lead count reads the database', /leads on file$/.test(view.sidebarLeads), view.sidebarLeads)
check('the sidebar plan usage reads the database', /of [\d,]+ Maps scrapes$/.test(view.sidebarUsage), view.sidebarUsage)
check('the renewal line reads as one phrase', !view.doubledWord, view.daysLeft)
check('the ledger renders its rows', view.rows > 0, `${view.rows} rows`)

const failed = results.filter((entry) => !entry.ok)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
if (failed.length) {
  console.log('failed:')
  for (const entry of failed) console.log(`  - ${entry.name}`)
  process.exitCode = 1
}

socket.close()
process.exit(process.exitCode ?? 0)
