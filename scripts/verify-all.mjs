// Runs every verification suite in order and prints a single summary.
//
// The suites drive the running app over CDP, so the app has to be up first — `node
// scripts/dev-debug.mjs` starts it with the debugging port open. Each suite is its own process:
// one that fails cannot take the rest down with it, and the exit code is non-zero if any check
// anywhere failed.
import { spawnSync } from 'node:child_process'

const SUITES = [
  'verify-backend',
  'verify-pages',
  'verify-dashboard',
  'verify-remaining-pages',
  'verify-billing',
  'verify-writes',
  'verify-console',
  'verify-persistence',
  'verify-scrape-persistence',
  'verify-enrichment',
]

// The suites that launch the built app themselves, on a throwaway copy of the data folder. They
// need no debug port and are what covers the pages the design drives: the Social Profiles page,
// the three finder pages and their scan, and every page that states a figure about the workspace.
const SELF_LAUNCHING = ['verify-social-page.cjs', 'verify-finder-scan.cjs', 'verify-data-pages.cjs', 'verify-2000-leads.cjs', 'verify-local-settings-phone.cjs', 'verify-updates.cjs', 'test-social-import.cjs', 'test-database.cjs']

// The app has to be listening before the first suite connects.
const port = 9222
let reachable = false
for (let attempt = 0; attempt < 15 && !reachable; attempt += 1) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/json/list`)
    reachable = response.ok
  } catch {
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }
}
if (!reachable) {
  console.error(`No app on 127.0.0.1:${port}. Start it first: node scripts/dev-debug.mjs`)
  process.exit(1)
}

let passed = 0
let failed = 0
const broken = []

for (const suite of SUITES) {
  const run = spawnSync('node', [`scripts/${suite}.mjs`], { encoding: 'utf8', shell: process.platform === 'win32' })
  const output = `${run.stdout ?? ''}${run.stderr ?? ''}`
  const hits = [...output.matchAll(/^(PASS|FAIL)\s/gm)]
  const ok = hits.filter((hit) => hit[1] === 'PASS').length
  const bad = hits.filter((hit) => hit[1] === 'FAIL').length
  passed += ok
  failed += bad
  console.log(`${suite.padEnd(28)} ${String(ok).padStart(3)} pass  ${String(bad).padStart(3)} fail`)
  if (bad) {
    for (const line of output.split('\n').filter((entry) => entry.startsWith('FAIL'))) console.log(`    ${line}`)
  }
  if (run.status !== 0 && !bad) broken.push(`${suite} (exit ${run.status})`)
}

// The suites that bring their own window up. They are run whatever the debugging port did, because
// they launch the app themselves and are the only cover for the pages the updated design drives.
for (const suite of SELF_LAUNCHING) {
  const run = spawnSync('node', [`scripts/${suite}`], { encoding: 'utf8', shell: process.platform === 'win32' })
  const output = `${run.stdout ?? ''}${run.stderr ?? ''}`
  const ok = (output.match(/^PASS\s/gm) ?? []).length
  const bad = (output.match(/^FAIL\s/gm) ?? []).length
  passed += ok
  failed += bad
  console.log(`${suite.padEnd(28)} ${String(ok).padStart(3)} pass  ${String(bad).padStart(3)} fail`)
  if (bad) {
    for (const line of output.split('\n').filter((entry) => entry.startsWith('FAIL'))) console.log(`    ${line}`)
  }
  if (run.status !== 0 && !bad) broken.push(`${suite} (exit ${run.status})`)
}

console.log(`\nTOTAL: ${passed}/${passed + failed} checks passed`)
if (broken.length) console.log(`suites that errored without a check: ${broken.join(', ')}`)
process.exit(failed || broken.length ? 1 : 0)
