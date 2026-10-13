// Copies the assets the compiled main process reads at runtime.
//
// tsc only emits JavaScript, so schema.sql would be missing from dist-electron and the app would
// fail to open its database. Keeping the copy in the build makes the compiled output complete.
import { copyFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const assets = [['electron/db/schema.sql', 'dist-electron/db/schema.sql']]

for (const [from, to] of assets) {
  mkdirSync(dirname(`${root}/${to}`), { recursive: true })
  copyFileSync(`${root}/${from}`, `${root}/${to}`)
  console.log(`copied ${from} -> ${to}`)
}
