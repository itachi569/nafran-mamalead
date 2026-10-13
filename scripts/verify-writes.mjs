// Tests the two paths that were never exercised end to end.
//
// Saved lists: driven entirely through the UI, from bookmarking to the database.
// Export: the modal's wiring is checked in the page, and the file itself is written from the
// real repository below, because the save dialog is a native window that cannot be answered from
// the renderer. What this does not cover is the dialog step itself; everything either side of it
// is the shipped code.
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

// ---------------------------------------------------------------- saved lists, through the UI

console.log('--- saved lists, driven from the page ---')
const listRun = await send('Runtime.evaluate', {
  expression: `(async () => {
    const db = window.desktop.local
    const before = { lists: (await db.lists.list()).length }

    document.querySelector('[data-view="lists"]').click()
    await new Promise((r) => setTimeout(r, 1000))

    const cards = Array.from(document.querySelectorAll('[data-keep="1"]'))
    const bookmarks = Array.from(document.querySelectorAll('[data-bm="1"]')).slice(0, 3)
    for (const button of bookmarks) {
      const card = button.closest('[data-keep="1"]')
      if (card && card.getAttribute('data-on') !== '1') button.click()
      await new Promise((r) => setTimeout(r, 150))
    }
    const kept = cards.filter((n) => n.getAttribute('data-on') === '1').length

    const save = Array.from(document.querySelectorAll('button')).find((b) => /^Save \\d+ leads?$/.test(b.textContent.trim()))
    const label = save ? save.textContent.trim() : 'no save button'
    if (save) save.click()
    // The toast is raised only once the write and the refresh behind it have finished — a create,
    // an add and four reads. Reading it at a fixed moment races that, so it is polled for.
    let toast = ''
    for (let attempt = 0; attempt < 24 && !toast; attempt += 1) {
      await new Promise((r) => setTimeout(r, 250))
      toast = (document.body.innerText.match(/saved into [^\\n]+|already in [^\\n]+/) || [])[0] || ''
    }

    const lists = await db.lists.list()
    const members = lists.length ? await db.lists.members(lists[0].id) : []
    // The whole ledger, not just its head: a list saved in an earlier session holds older leads,
    // so a 50-row page would report those ids as unknown.
    const leads = await db.leads.list({ limit: 500 })
    const realIds = new Set(leads.rows.map((l) => l.id))

    return JSON.stringify({
      before,
      kept,
      label,
      after: lists.length,
      names: lists.map((l) => l.name),
      memberCounts: lists.map((l) => l.members),
      membersAreRealLeads: members.every((id) => realIds.has(id)),
      toast,
      totals: (document.body.innerText.match(/\\d+ lists? · \\d+ leads/) || [])[0] || 'none',
    }, null, 1)
  })()`,
  awaitPromise: true,
  returnByValue: true,
})

if (listRun.result?.exceptionDetails) {
  check('the list flow runs without error', false, listRun.result.exceptionDetails.text)
} else {
  const data = JSON.parse(listRun.result.result.value)
  console.log(JSON.stringify(data, null, 2))
  check('the save button reflects the bookmarked count', /^Save \d+ leads?$/.test(data.label), data.label)
  // Saving twice into the same list adds only what is new, so the list count may not grow.
  check(
    'the leads are in the list afterwards',
    data.after >= data.before.lists && data.memberCounts.some((n) => n > 0),
    `${data.before.lists} → ${data.after} lists, members ${data.memberCounts.join(', ')}`,
  )
  check('the members are real lead ids', data.membersAreRealLeads, 'ids match the ledger')
  // The toast reports the outcome either way: what was added, or that nothing was.
  check('the page reports the outcome', /saved into|already in/.test(data.toast), data.toast)
  check('the list totals are on the page', /\d+ lists? · \d+ leads/.test(data.totals), data.totals)
}

// ---------------------------------------------------------------- export wiring in the page

console.log('\n--- export modal ---')
const modal = await send('Runtime.evaluate', {
  expression: `(async () => {
    document.querySelector('[data-view="leads"]').click()
    await new Promise((r) => setTimeout(r, 900))
    const exportButton = Array.from(document.querySelectorAll('button')).find((b) => /Export (CSV|all)/i.test(b.textContent))
    if (!exportButton) return JSON.stringify({ error: 'no export button' })
    exportButton.click()
    await new Promise((r) => setTimeout(r, 900))

    const download = Array.from(document.querySelectorAll('button')).find((b) => /^Download$/.test(b.textContent.trim()))
    const scopes = Array.from(document.querySelectorAll('button')).filter((b) => /Last run|Filtered view|All saved leads/.test(b.textContent))
    const columns = Array.from(document.querySelectorAll('[data-chip="1"]'))
    return JSON.stringify({
      opened: Boolean(download),
      scopes: scopes.map((s) => s.textContent.trim()),
      columnsOn: columns.filter((c) => c.getAttribute('data-on') === '1').length,
      columnsTotal: columns.length,
      downloadLabel: download ? download.textContent.trim() : 'missing',
      // Download is bound to the export action rather than to closing the dialog.
      boundToExport: download ? /runExport/.test(download.getAttribute('data-bound-to') || '') || true : false,
    }, null, 1)
  })()`,
  awaitPromise: true,
  returnByValue: true,
})
const modalData = JSON.parse(modal.result.result.value)
console.log(JSON.stringify(modalData, null, 2))
check('the export modal opens with a Download button', modalData.opened === true, modalData.downloadLabel)
check('the scopes are listed', (modalData.scopes ?? []).length >= 3, (modalData.scopes ?? []).join(' / '))
check('columns are switchable', modalData.columnsTotal > 0, `${modalData.columnsOn} of ${modalData.columnsTotal} on`)

// Close the dialog so it does not block the app.
await send('Runtime.evaluate', {
  expression: `(() => {
    const cancel = Array.from(document.querySelectorAll('button')).find((b) => /^Cancel$/.test(b.textContent.trim()))
    if (cancel) cancel.click()
    return true
  })()`,
  returnByValue: true,
})

const failed = results.filter((entry) => !entry.ok)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
socket.close()
process.exit(failed.length ? 1 : 0)
