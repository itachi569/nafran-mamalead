import { rmSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// tsc does not remove outputs for deleted sources. Never package retired modules.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const output = resolve(root, 'dist-electron')
if (dirname(output) !== root) throw new Error('Invalid Electron build output directory')
rmSync(output, { recursive: true, force: true })
