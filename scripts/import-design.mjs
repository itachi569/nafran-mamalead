// Replaces the project's reference markup with the body of a newer design export.
//
// The export is a document: `<x-dc>` holds a `<helmet>` and then the interface itself, which is the
// part `.reference/markup.html` carries. Everything outside that is the designer's own shell, and
// taking it would bring a second document into a project that already has one.
import { readFileSync, writeFileSync, copyFileSync } from 'node:fs'

const FROM = process.argv[2]
const TO = process.argv[3] ?? '.reference/markup.html'
const BACKUP = process.argv[4] ?? '.reference/markup.before-update.html'
if (!FROM) throw new Error('usage: node scripts/import-design.mjs <export.dc.html> [target] [backup]')

const source = readFileSync(FROM, 'utf8')

// The interface runs from the end of `</helmet>` to the closing `</x-dc>`.
const helmetEnd = source.indexOf('</helmet>')
const bodyEnd = source.lastIndexOf('</x-dc>')
if (helmetEnd < 0 || bodyEnd < 0) throw new Error('the export does not look like a design document')

const body = source
  .slice(helmetEnd + '</helmet>'.length, bodyEnd)
  .replace(/^\s*\n/, '')
  .replace(/\s+$/, '\n')

const current = readFileSync(TO, 'utf8')
copyFileSync(TO, BACKUP)

writeFileSync(TO, body, 'utf8')
console.log(`${FROM} → ${TO}`)
console.log(`  before: ${(current.length / 1024).toFixed(1)} KB · after: ${(body.length / 1024).toFixed(1)} KB`)
console.log(`  backup: ${BACKUP}`)

// What the new document binds, so the values object can be checked against it.
const bindings = new Set()
for (const match of body.matchAll(/\{\{\s*([A-Za-z_$][\w$]*)/g)) bindings.add(match[1])
console.log(`  bindings: ${bindings.size}`)
console.log(`  ${[...bindings].sort().join(', ')}`)
