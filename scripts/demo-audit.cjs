// Which controls in the generated app only show a toast? Grouped by the view they sit in.
const fs = require('node:fs')
const lines = fs.readFileSync('src/app/ReferenceApp.tsx', 'utf8').split('\n')
const out = new Map()
let current = 'shell'
for (const line of lines) {
  const view = /shows\(V\.is(\w+)\)/.exec(line)
  if (view) current = view[1]
  const demo = /data-demo="([^"]+)"/.exec(line)
  if (!demo) continue
  const list = out.get(current) ?? []
  list.push(demo[1])
  out.set(current, list)
}
let total = 0
for (const [view, list] of out) {
  total += list.length
  console.log(`${view} (${list.length}): ${[...new Set(list)].join(', ')}`)
}
console.log('total demo controls:', total)
