// Extracts the interface from a bundled design export.
//
// The design tool ships two shapes. One is a `.dc.html` document, where the interface sits between
// `</helmet>` and `</x-dc>` as ordinary markup. The other is a self-running bundle, where that same
// document is carried inside a script as a JavaScript string, so every newline is `\n` and every
// slash is `\u002F`. This reads both and writes the interface out as plain markup.
//
// usage: node scripts/extract-design.mjs <export.html> <out.html>
import { readFileSync, writeFileSync } from 'node:fs'

const FROM = process.argv[2]
const TO = process.argv[3]
if (!FROM || !TO) throw new Error('usage: node scripts/extract-design.mjs <export.html> <out.html>')

const source = readFileSync(FROM, 'utf8')
const decoder = new TextDecoder('utf-8')

/** The five escapes a JavaScript string uses that matter to markup. */
function unescapeString(value) {
  return value
    .replace(/\\u([0-9a-fA-F]{4})/g, (_match, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '')
    .replace(/\\t/g, '\t')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\')
}

let body = ''

// The plain document first: the interface runs from the end of its helmet to the closing tag.
const helmetEnd = source.indexOf('</helmet>')
const plainEnd = source.lastIndexOf('</x-dc>')
if (helmetEnd >= 0 && plainEnd > helmetEnd) {
  body = source.slice(helmetEnd + '</helmet>'.length, plainEnd)
  console.log('read as a plain design document')
} else {
  // The bundled form: the document is a string inside a script, so its tags are escaped.
  const openAt = source.indexOf('<x-dc>')
  const closeAt = source.indexOf('<\\u002F' + 'x-dc>', openAt)
  if (openAt < 0 || closeAt < 0) throw new Error('the export carries no interface this script can find')
  const escaped = source.slice(openAt, closeAt)
  body = unescapeString(escaped)
  // The helmet is the document's own head; the interface is what follows it.
  const inner = body.indexOf('</helmet>')
  body = inner >= 0 ? body.slice(inner + '</helmet>'.length) : body.slice('<x-dc>'.length)
  console.log('read as a bundled export, unescaped')
}

body = body.replace(/^\s*\n/, '').replace(/\s+$/, '\n')
writeFileSync(TO, body, 'utf8')

const bindings = new Set()
for (const match of body.matchAll(/\{\{\s*([A-Za-z_$][\w$]*)/g)) bindings.add(match[1])
const views = [...body.matchAll(/\{\{\s*(is[A-Z]\w*)\s*\}\}/g)].map((match) => match[1])
console.log(`  wrote ${TO}: ${(body.length / 1024).toFixed(1)} KB`)
console.log(`  bindings: ${bindings.size}`)
console.log(`  views: ${views.join(', ')}`)
console.log(`  probe: ${decoder.decode(new TextEncoder().encode(body.slice(0, 80))).replace(/\s+/g, ' ')}`)

const samples = {
  'scan overlay': 'scanOverlay',
  'scan rows': 'scanRows',
  'overlay title': 'ovTitle',
  'profiles found': 'found so far',
  'social page': 'Social Profiles',
  'finder action': 'fEmail.act',
}
for (const [label, needle] of Object.entries(samples)) {
  console.log(`  ${label.padEnd(16)} ${body.includes(needle) ? 'yes' : 'NO'}`)
}
console.log([...bindings].sort().join(', '))
