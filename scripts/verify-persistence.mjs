// Confirms the leads captured by the last scrape are still on file after a full restart.
const targets = await (await fetch('http://127.0.0.1:9222/json/list')).json()
const page = targets.find((t) => t.type === 'page')
if (!page) {
  console.error('no page target:', JSON.stringify(targets.map((t) => ({ type: t.type, url: t.url }))))
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

const expression = `(async () => {
  try {
    const db = window.desktop.local
    const leads = await db.leads.list({ limit: 50 })
    const runs = await db.runs.list(5)
    const usage = await db.usage()
    const stats = await db.stats()
    document.querySelector('[data-view="leads"]').click()
    await new Promise((r) => setTimeout(r, 1200))
    const body = document.body.innerText.replace(/\\n+/g, ' ')
    const first = document.querySelector('[data-row="1"]')
    return JSON.stringify({
      leadsInDb: leads.total,
      runsInDb: runs.length,
      scrapesUsed: usage.scrapes_used,
      withPhone: stats.withPhone,
      withWebsite: stats.withWebsite,
      sidebarOnFile: (body.match(/[\\d,]+ leads on file/) || [])[0] || 'none',
      badge: (body.match(/\\d+ SAVED/) || [])[0] || 'none',
      renderedRows: document.querySelectorAll('[data-row="1"]').length,
      firstRow: first ? first.innerText.replace(/\\n+/g, ' | ').slice(0, 120) : 'none',
    }, null, 1)
  } catch (error) {
    return 'ERROR: ' + error.message
  }
})()`

const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
console.log(result.result?.exceptionDetails ? JSON.stringify(result.result.exceptionDetails, null, 2) : result.result?.result?.value)

socket.close()
process.exit(0)
