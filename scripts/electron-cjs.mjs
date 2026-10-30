import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const marker = fileURLToPath(new URL('../dist-electron/package.json', import.meta.url))
writeFileSync(marker, `${JSON.stringify({ type: 'commonjs' }, null, 2)}\n`, 'utf8')

// Sandboxed Electron preloads cannot require adjacent local modules. Keep all helpers in one file.
await build({
  entryPoints:[fileURLToPath(new URL('../electron/preload.ts',import.meta.url))],
  outfile:fileURLToPath(new URL('../dist-electron/preload.js',import.meta.url)),
  bundle:true,platform:'node',format:'cjs',target:'node22',external:['electron'],
})
