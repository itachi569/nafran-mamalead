// Inspects the running Electron app through its DevTools protocol endpoint.
//
// Usage: node scripts/inspect-app.mjs [view]
// Connects to the CDP page target, evaluates a probe in the live renderer, and prints the
// result. Read-only: it clicks nav items only when a view argument is given.
import { readFileSync } from 'node:fs'

const PORT = 9222
const wantView = process.argv[2]

const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
const page = targets.find((target) => target.type === 'page')
if (!page) {
  console.error('no page target — is the app running with --remote-debugging-port=9222?')
  process.exit(1)
}

const socket = new WebSocket(page.webSocketDebuggerUrl)
let nextId = 1
const pending = new Map()
const events = []

socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data)
  if (message.id && pending.has(message.id)) {
    pending.get(message.id)(message)
    pending.delete(message.id)
    return
  }
  if (message.method === 'Runtime.consoleAPICalled' || message.method === 'Runtime.exceptionThrown') {
    events.push(message)
  }
})

function send(method, params = {}) {
  const id = nextId++
  return new Promise((resolve) => {
    pending.set(id, resolve)
    socket.send(JSON.stringify({ id, method, params }))
  })
}

async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (result.result?.exceptionDetails) return { error: result.result.exceptionDetails.text }
  return result.result?.result?.value
}

await new Promise((resolve) => socket.addEventListener('open', resolve))
await send('Runtime.enable')

const PROBE = `(() => ({
  docTitle: document.title,
  h1: document.querySelector('h1') && document.querySelector('h1').textContent.trim(),
  navCount: document.querySelectorAll('[data-view]').length,
  theme: document.body.getAttribute('data-theme'),
  rootChildren: document.getElementById('root') ? document.getElementById('root').childElementCount : -1,
  bodyChars: document.body.innerText.length,
  canvases: document.querySelectorAll('canvas').length,
  hasRunButton: Boolean(document.querySelector('[data-runbtn="1"]')),
  hasBridge: typeof window.desktop === 'object' && window.desktop !== null,
  headerLine: document.body.innerText.split('\\n').filter(Boolean).slice(0, 6),
}))()`

console.log('=== RENDERER ===')
console.log(JSON.stringify(await evaluate(PROBE), null, 2))

console.log('=== IPC BRIDGE ===')
console.log(JSON.stringify(await evaluate(`(async () => ({
  info: await window.desktop.getInfo().catch(e => ({ error: String(e) })),
  providers: await window.desktop.scraper.providers().catch(e => ({ error: String(e) })),
  lastRun: await window.desktop.scraper.last().catch(e => ({ error: String(e) })),
}))()`), null, 2))

if (wantView) {
  console.log(`=== VIEW: ${wantView} ===`)
  const clicked = await evaluate(`(async () => {
    const nav = document.querySelector('[data-view="${wantView}"]')
    if (!nav) return { error: 'nav item not found' }
    nav.click()
    await new Promise(r => setTimeout(r, 900))
    return {
      h1: document.querySelector('h1') && document.querySelector('h1').textContent.trim(),
      rows: document.querySelectorAll('[data-rowgrid]').length,
      lottie: document.querySelectorAll('canvas').length,
      text: document.body.innerText.replace(/\\s+/g, ' ').trim().slice(0, 300),
    }
  })()`)
  console.log(JSON.stringify(clicked, null, 2))
}

const problems = events.filter((e) => e.method === 'Runtime.exceptionThrown')
console.log('=== EXCEPTIONS ===')
console.log(problems.length ? JSON.stringify(problems.slice(0, 5).map((e) => e.params.exceptionDetails.text), null, 2) : 'none')

socket.close()
process.exit(0)
