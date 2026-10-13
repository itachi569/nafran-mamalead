// Captures a screenshot of each page that now reads real data, so the result can be looked at
// rather than only asserted. Requires the app to be running with --remote-debugging-port=9222.
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const targets = await (await fetch('http://127.0.0.1:9222/json/list')).json()
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
await send('Page.enable')
await send('Runtime.enable')

const out = join(process.cwd(), 'screenshots')
mkdirSync(out, { recursive: true })

for (const view of ['dashboard', 'maps', 'leads', 'email', 'social', 'phone', 'dm', 'website', 'runs', 'lists', 'settings']) {
  await send('Runtime.evaluate', {
    expression: `document.querySelector('[data-view="${view}"]').click()`,
    returnByValue: true,
  })
  await new Promise((resolve) => setTimeout(resolve, 1400))
  const shot = await send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(join(out, `${view}.png`), Buffer.from(shot.result.data, 'base64'))
  console.log('captured', view)
}

socket.close()
process.exit(0)
