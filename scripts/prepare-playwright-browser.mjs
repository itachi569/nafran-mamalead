import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { createRequire } from 'node:module'

const root = resolve(import.meta.dirname, '..')
const browsers = join(root, '.playwright-browsers')
mkdirSync(browsers, { recursive: true })

const env = { ...process.env, PLAYWRIGHT_BROWSERS_PATH: browsers }
const cli = join(root, 'node_modules', 'playwright', 'cli.js')
const installed = spawnSync(process.execPath, [cli, 'install', 'chromium'], {
  cwd: root, env, stdio: 'inherit', shell: false,
})
if (installed.error) throw installed.error
if (installed.status !== 0) process.exit(installed.status ?? 1)

process.env.PLAYWRIGHT_BROWSERS_PATH = browsers
const require = createRequire(import.meta.url)
const { chromium } = require('playwright')
const executable = chromium.executablePath()
if (!existsSync(executable)) throw new Error(`Packaged Chromium was not installed: ${executable}`)
console.log(`Bundling Chromium from ${browsers}`)
