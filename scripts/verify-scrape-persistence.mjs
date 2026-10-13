// Runs a real Chromium Maps scrape from the running app and follows it through to the database.
//
// This is the whole pipeline in one check: the UI starts the run, the worker drives Chromium, the
// main process writes the leads, and the renderer re-reads them from SQLite.
//
// Run with filters goes through the Google gate, so the saved profile is given a session first —
// the gate will not scrape without an account, and no check can sign in to a real one.
import { seedGoogleSession } from './lib/google-session.mjs'

const PORT = 9222

console.log('seeding the saved Google profile…')
console.log('  gate will see an account:', await seedGoogleSession())

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
  if (result.result?.exceptionDetails) return { error: result.result.exceptionDetails.text }
  return result.result?.result?.value
}

// ---- configure the run: one keyword, a small cap, so it finishes quickly but is real.
console.log('configuring the run…')
const configured = await evaluate(`(async () => {
  document.querySelector('[data-view="maps"]').click()
  await new Promise(r => setTimeout(r, 800))

  // Remove every keyword but one.
  const removeButtons = Array.from(document.querySelectorAll('[data-kw="1"] [data-x="1"], [data-kw="1"]'))
  for (const button of removeButtons) button.click()
  await new Promise(r => setTimeout(r, 300))

  const input = document.querySelector('[data-kwinput]')
  input.focus()
  input.value = 'dentist'
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  input.dispatchEvent(new Event('input', { bubbles: true }))
  await new Promise(r => setTimeout(r, 300))

  // Bring the cap down to 5.
  const fewer = document.querySelector('[aria-label="Fewer results"]')
  for (let i = 0; i < 4; i += 1) { fewer.click(); await new Promise(r => setTimeout(r, 60)) }
  await new Promise(r => setTimeout(r, 300))

  const chips = Array.from(document.querySelectorAll('[data-kw="1"]')).map(n => n.textContent.replace('×', '').trim())
  return JSON.stringify({ chips, cap: (document.querySelector('[data-setup] span[style*="font-size:19px"]') || {}).textContent })
})()`)
console.log('  ', configured)

// ---- start it
const started = await evaluate(`(async () => {
  const button = document.querySelector('[data-runbtn="1"]')
  if (!button) return 'no run button'
  button.click()
  await new Promise(r => setTimeout(r, 1500))
  return button.getAttribute('data-state')
})()`)
console.log('run state after clicking:', started)

// ---- wait for it to finish
console.log('waiting for the scrape to finish…')
const deadline = Date.now() + 300_000
let state = 'run'
let lastMessage = ''
while (Date.now() < deadline) {
  await new Promise((resolve) => setTimeout(resolve, 5000))
  const snapshot = await evaluate(`(async () => JSON.stringify({
    state: (document.querySelector('[data-runbtn="1"]') || {}).getAttribute
      ? document.querySelector('[data-runbtn="1"]').getAttribute('data-state')
      : null,
    note: Array.from(document.querySelectorAll('span,p')).map(n => n.textContent || '').find(t => /Scanning|Captured|Finished|results from/.test(t)) || '',
  }))()`)
  const parsed = typeof snapshot === 'string' ? JSON.parse(snapshot) : snapshot
  if (parsed.note && parsed.note !== lastMessage) {
    lastMessage = parsed.note
    console.log('  ·', lastMessage.slice(0, 100))
  }
  state = parsed.state
  if (state === 'idle') break
}
console.log('run finished, state:', state)
if (state !== 'idle') {
  console.error('the run never finished — a state of "wait" means the gate is still asking for a Google account')
  process.exit(1)
}

// ---- what landed in the database
const stored = await evaluate(`(async () => {
  const db = window.desktop.local
  const [leads, runs, stats, usage] = await Promise.all([db.leads.list({ limit: 50 }), db.runs.list(5), db.stats(), db.usage()])
  return JSON.stringify({
    total: leads.total,
    sample: leads.rows.slice(0, 3).map(l => ({ name: l.name, phone: l.phone, website: l.website, area: l.area, score: l.score, ref: l.place_ref })),
    runs: runs.map(r => ({ status: r.status, found: r.found, keywords: r.keywords, location: r.location })),
    stats,
    scrapesUsed: usage.scrapes_used,
  }, null, 1)
})()`)
console.log('=== STORED ===')
console.log(stored)

socket.close()
process.exit(0)
