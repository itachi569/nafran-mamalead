import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const marker = fileURLToPath(new URL('../dist-electron/package.json', import.meta.url))
writeFileSync(marker, `${JSON.stringify({ type: 'commonjs' }, null, 2)}\n`, 'utf8')
