// Compares two design documents and reports what the designer changed.
//
// A line diff of two 3800-line documents is unreadable, so this compares them the way the port
// consumes them: the bindings each one uses, the markers each one hangs on its controls, and the
// visible words on each page. What it prints is what has to change in the app.
//
// usage: node scripts/design-diff.mjs <old.html> <new.html>
import { readFileSync } from 'node:fs'
import { parse } from 'parse5'

const [OLD, NEW] = process.argv.slice(2)
if (!OLD || !NEW) throw new Error('usage: node scripts/design-diff.mjs <old.html> <new.html>')

const read = (file) => parse(readFileSync(file, 'utf8'))
const elements = (node, out = []) => {
  if (!node || typeof node !== 'object') return out
  if (node.tagName) out.push(node)
  for (const child of node.childNodes ?? []) elements(child, out)
  return out
}
const attr = (node, name) => node.attrs?.find((entry) => entry.name === name)?.value
const text = (node) =>
  (node.nodeName === '#text' ? node.value : (node.childNodes ?? []).map(text).join('')).replace(/\s+/g, ' ').trim()

// ---------------------------------------------------------------- bindings

const bindings = (doc) => {
  const found = new Set()
  for (const node of elements(doc)) {
    for (const entry of node.attrs ?? []) {
      for (const match of (entry.value ?? '').matchAll(/\{\{\s*([A-Za-z_$][\w$]*)/g)) found.add(match[1])
    }
    for (const child of node.childNodes ?? []) {
      if (child.nodeName === '#text') {
        for (const match of child.value.matchAll(/\{\{\s*([A-Za-z_$][\w$]*)/g)) found.add(match[1])
      }
    }
    // A loop's list is an expression held on the node, so its alias is a binding too.
    for (const match of String(node.childNodes ?? '').matchAll(/\{\{\s*([A-Za-z_$][\w$]*)/g)) found.add(match[1])
  }
  return found
}

const oldBindings = bindings(read(OLD))
const newBindings = bindings(read(NEW))
const onlyNew = [...newBindings].filter((name) => !oldBindings.has(name)).sort()
const onlyOld = [...oldBindings].filter((name) => !newBindings.has(name)).sort()
console.log(`bindings: ${oldBindings.size} → ${newBindings.size}`)
console.log(`  added   : ${onlyNew.join(', ') || '(none)'}`)
console.log(`  removed : ${onlyOld.join(', ') || '(none)'}`)

// ---------------------------------------------------------------- markers

const markers = (doc) => {
  const found = new Map()
  for (const node of elements(doc)) {
    for (const entry of node.attrs ?? []) {
      if (!entry.name.startsWith('data-')) continue
      if (/\{\{/.test(entry.value ?? '')) continue
      if (!found.has(entry.name)) found.set(entry.name, [])
      found.get(entry.name).push(entry.value)
    }
  }
  return found
}

const oldMarkers = markers(read(OLD))
const newMarkers = markers(read(NEW))
const markerNames = new Set([...oldMarkers.keys(), ...newMarkers.keys()])
const markerChanges = [...markerNames].filter((name) => {
  const before = (oldMarkers.get(name) ?? []).length
  const after = (newMarkers.get(name) ?? []).length
  return before !== after
})
console.log(`\nmarkers whose count changed: ${markerChanges.length}`)
for (const name of markerChanges.sort()) {
  console.log(`  ${name.padEnd(20)} ${(oldMarkers.get(name) ?? []).length} → ${(newMarkers.get(name) ?? []).length}`)
}

// ---------------------------------------------------------------- words on each page

const VIEWS = ['isDashboard', 'isMaps', 'isSocial', 'isEmail', 'isPhone', 'isDm', 'isWebsite', 'isLeads', 'isLists', 'isRuns', 'isSettings']

/** The section a view guards, so each page's own words can be compared on their own. */
function viewSection(doc, view) {
  return elements(doc).find((node) => node.tagName === 'sc-if' && attr(node, 'value') === `{{ ${view} }}`) ?? null
}

/** The words a page prints, with every binding taken out so only the design's own text is left. */
function words(node) {
  if (!node) return new Set()
  const flat = text(node).replace(/\{\{[^}]*\}\}/g, ' ')
  return new Set(
    flat
      .split(/(?<=[a-z0-9)])(?=[A-Z])|(?<=[.!?·])\s+|\s{2,}/)
      .map((part) => part.trim())
      .filter((part) => part.length > 3),
  )
}

const oldDoc = read(OLD)
const newDoc = read(NEW)
console.log('\nper page:')
for (const view of VIEWS) {
  const before = words(viewSection(oldDoc, view))
  const after = words(viewSection(newDoc, view))
  const added = [...after].filter((word) => !before.has(word))
  const removed = [...before].filter((word) => !after.has(word))
  const flag = added.length || removed.length ? 'CHANGED' : 'same   '
  console.log(`  ${flag} ${view.padEnd(12)} +${added.length} -${removed.length}`)
  if (added.length) console.log(`      added  : ${added.slice(0, 14).join(' | ')}`)
  if (removed.length) console.log(`      removed: ${removed.slice(0, 14).join(' | ')}`)
}
