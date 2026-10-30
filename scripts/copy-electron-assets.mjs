// Copies the assets the compiled main process reads at runtime.
//
// tsc only emits JavaScript, so schema.sql would be missing from dist-electron and the app would
// fail to open its database. Keeping the copy in the build makes the compiled output complete.
import { copyFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const assets = [
  ['src/assets/fonts/satoshi-400.ttf','dist-electron/export/assets/satoshi-400.ttf'],
  ['src/assets/fonts/satoshi-700.ttf','dist-electron/export/assets/satoshi-700.ttf'],
  ['electron/db/schema.sql', 'dist-electron/db/schema.sql'],
  ['electron/export/assets/mamalead-print.jpeg', 'dist-electron/export/assets/mamalead-print.jpeg'],
  ['electron/export/assets/mamalead-header.png', 'dist-electron/export/assets/mamalead-header.png'],
  ['electron/export/assets/mamalead-sheet.png', 'dist-electron/export/assets/mamalead-sheet.png'],
]

for (const [from, to] of assets) {
  mkdirSync(dirname(`${root}/${to}`), { recursive: true })
  copyFileSync(`${root}/${from}`, `${root}/${to}`)
  console.log(`copied ${from} -> ${to}`)
}
