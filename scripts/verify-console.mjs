// Walks every page and records anything the renderer complains about: uncaught exceptions,
// console errors and failed network requests. This is the check for "koi error toh nahi".
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
const problems = []
/** Which page the listeners are currently watching, recorded on every problem. */
let current = 'load'

socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data)
  if (message.id && pending.has(message.id)) {
    pending.get(message.id)(message)
    pending.delete(message.id)
    return
  }
  if (message.method === 'Runtime.exceptionThrown') {
    const details = message.params.exceptionDetails
    problems.push({ page: current, kind: 'exception', text: (details.exception?.description ?? details.text).split('\n')[0] })
  }
  if (message.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(message.params.type)) {
    problems.push({ page: current, kind: message.params.type, text: message.params.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 140) })
  }
  if (message.method === 'Log.entryAdded' && ['error', 'warning'].includes(message.params.entry.level)) {
    problems.push({ page: current, kind: message.params.entry.level, text: message.params.entry.text.slice(0, 140) })
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
await send('Log.enable')
await send('Page.enable')

// Reload so the run starts from a clean load with the listeners already attached.
await send('Page.reload', { ignoreCache: true })
await new Promise((resolve) => setTimeout(resolve, 5000))

const VIEWS = ['dashboard', 'maps', 'social', 'email', 'phone', 'dm', 'website', 'leads', 'lists', 'runs', 'settings']
const counts = {}

for (const view of VIEWS) {
  current = view
  const before = problems.length
  const clicked = await send('Runtime.evaluate', {
    expression: `(() => { const n = document.querySelector('[data-view="${view}"]'); if (!n) return false; n.click(); return true })()`,
    returnByValue: true,
  })
  await new Promise((resolve) => setTimeout(resolve, 1300))
  counts[view] = { clicked: clicked.result?.result?.value === true, new: problems.length - before }
}

// The interactive surfaces: the run panel, the import modal, the export modal and the chat.
current = 'interactions'
for (const [name, expression] of [
  ['export modal', `(() => { const b = Array.from(document.querySelectorAll('button')).find(x => /Export/i.test(x.textContent)); if (b) b.click(); return !!b })()`],
  ['export close', `(() => { const b = Array.from(document.querySelectorAll('button')).find(x => /^Cancel$/.test(x.textContent.trim())); if (b) b.click(); return !!b })()`],
  ['import modal', `(() => { const b = Array.from(document.querySelectorAll('button')).find(x => /Import websites/i.test(x.textContent)); if (b) b.click(); return !!b })()`],
  ['import close', `(() => { const b = Array.from(document.querySelectorAll('button')).find(x => /^Cancel$/.test(x.textContent.trim())); if (b) b.click(); return !!b })()`],
  ['chat', `(() => { const b = document.querySelector('[data-assist="1"]'); if (b) b.click(); return !!b })()`],
  ['chat close', `(() => { const b = document.querySelector('[aria-label="Close chat"]'); if (b) b.click(); return !!b })()`],
  ['theme toggle', `(() => { const b = document.querySelector('[data-theme-btn]'); if (b) b.click(); return !!b })()`],
  ['theme back', `(() => { const b = document.querySelector('[data-theme-btn]'); if (b) b.click(); return !!b })()`],
]) {
  const before = problems.length
  await send('Runtime.evaluate', { expression, returnByValue: true })
  await new Promise((resolve) => setTimeout(resolve, 900))
  counts[name] = { new: problems.length - before }
}

console.log('=== per page ===')
for (const [name, info] of Object.entries(counts)) {
  const ok = info.new === 0
  console.log(`  ${ok ? 'clean' : 'ISSUES'}  ${name}${info.clicked === false ? '  (nav not found)' : ''}${info.new ? `  (${info.new})` : ''}`)
}

console.log('\n=== problems ===')
if (!problems.length) {
  console.log('  none')
} else {
  for (const entry of problems.slice(0, 20)) console.log(`  [${entry.page}] ${entry.kind}: ${entry.text}`)
}

socket.close()
process.exit(problems.length ? 1 : 0)
