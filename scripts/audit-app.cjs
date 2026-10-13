// What is left in the generated app that is not wired to anything.
//
// The app is generated from the design, so what ships is a template full of the designer's own
// sample content plus the bindings this project added. This scans the generated file for the three
// things that survive that process and should not: numbers printed as if they were data, buttons
// with no handler at all, and buttons whose only handler is the reference action hook.
//
// Usage: node scripts/audit-app.cjs
const { readFileSync } = require('node:fs')

const source = readFileSync('src/app/ReferenceApp.tsx', 'utf8')
const lines = source.split('\n')

// The views, in the order the file draws them. Everything before the first one is the shell.
const views = []
let current = 'shell'
for (let index = 0; index < lines.length; index += 1) {
  const view = /shows\(V\.is(\w+)\)/.exec(lines[index])
  if (view) {
    current = view[1]
    views.push({ name: current, from: index + 1 })
  } else if (views.length) {
    views[views.length - 1].to = index + 1
  }
}
const viewOf = (line) => {
  let found = 'shell'
  for (const view of views) if (line >= view.from && (!view.to || line <= view.to)) found = view.name
  return found
}

// ---- 1. numbers printed as text, with no binding around them
const numberText = new Map()
for (let index = 0; index < lines.length; index += 1) {
  const line = lines[index]
  for (const match of line.matchAll(/>([^<>{}]*\d[^<>{}]*)</g)) {
    const text = match[1].trim()
    if (!text || text.length > 90) continue
    // Percentages, sizes and times in styles are not claims about the workspace; text is.
    if (/^(?:#|rgba|rgb|\d+px|\d+%|\d+rem|\d+em|\d+s|\d+ms|\d+fr)/.test(text)) continue
    const key = viewOf(index + 1)
    const list = numberText.get(key) ?? []
    list.push(`${index + 1}: ${text}`)
    numberText.set(key, list)
  }
}

// ---- 2. buttons with nothing to run
const HANDLERS = [
  'onClick', 'onInput', 'onChange', 'sc-camel-on-click', 'data-action', 'data-goto', 'data-rerun',
  'data-view', 'data-stab', 'data-r=', 'data-chip', 'data-runbtn', 'data-run=', 'data-more',
  'data-qa', 'data-attn', 'data-exportgo', 'data-theme-btn', 'data-assist', 'data-open',
  'data-maphistopen', 'data-shistopen', 'data-socrefresh', 'data-socimpopen', 'data-exitscan',
  'data-fact', 'data-scanscrim', 'data-deeprun', 'data-deepsave', 'data-deeptest', 'data-kwinput',
  'data-importgo', 'data-socimpgo', 'data-location', 'data-socimp', 'data-leadsearch', 'data-tab=',
]
const dead = []
for (let index = 0; index < lines.length; index += 1) {
  const tag = /<button\b([^>]*)>/.exec(lines[index])
  if (!tag) continue
  const attrs = tag[1]
  if (HANDLERS.some((name) => attrs.includes(name))) continue
  const label = (lines[index].match(/>([^<{]+)</) ?? [])[1] ?? '(no label on this line)'
  dead.push(`${viewOf(index + 1)} · line ${index + 1}: ${label.trim().slice(0, 60)}`)
}

// ---- 3. buttons still using the delegated action hook
const demo = new Map()
for (let index = 0; index < lines.length; index += 1) {
  const label = /data-action="([^"]+)"/.exec(lines[index])
  if (!label) continue
  const key = viewOf(index + 1)
  const list = demo.get(key) ?? []
  list.push(label[1])
  demo.set(key, list)
}
const demoTotal = [...demo.values()].reduce((total, list) => total + list.length, 0)

// ---- 4. values the app builds and never shows
const valuesBlock = source.slice(source.indexOf('export function ReferenceApp'))
const valueKeys = new Set()
const appValues = readFileSync('src/app/useAppValues.ts', 'utf8').split('\n')
let insideReturn = false
for (const line of appValues) {
  if (/^  return \{/.test(line)) insideReturn = true
  else if (insideReturn && /^  \}/.test(line)) insideReturn = false
  if (!insideReturn) continue
  const key = /^ {4}([a-zA-Z_][\w]*):/.exec(line)
  if (key) valueKeys.add(key[1])
}
const unused = [...valueKeys].filter((key) => !valuesBlock.includes(`V.${key}`) && !source.includes(`{{ ${key} }}`))

console.log('=== 1. Numbers printed as data, page by page')
for (const [view, list] of numberText) {
  console.log(`\n${view} (${list.length})`)
  for (const entry of list) console.log(`   ${entry}`)
}

console.log('\n=== 2. Buttons with no handler at all')
console.log(dead.length ? dead.map((entry) => `   ${entry}`).join('\n') : '   (none)')

console.log('\n=== 3. Buttons using delegated actions')
for (const [view, list] of demo) console.log(`   ${view} (${list.length}): ${[...new Set(list)].join(', ')}`)
console.log(`   total: ${demoTotal}`)

console.log('\n=== 4. Values built but never bound')
console.log(unused.length ? `   ${unused.length}: ${unused.join(', ')}` : '   (none)')
