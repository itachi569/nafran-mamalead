// Repeatable local release audit. Every selected suite uses isolated fixtures/profiles.
// This does not publish a release, charge a card or alter the customer's workspace.
const { spawn } = require('node:child_process')
const { mkdirSync, writeFileSync } = require('node:fs')
const { resolve, join } = require('node:path')
const root = resolve(__dirname, '..')
const group = process.argv[2] || 'core'
const output = resolve(process.argv[3] || join(root, 'screenshots/release-audit'))
const groups = {
  core: [
    'test-database.cjs', 'test-deep-pass.cjs', 'test-auto-updates.cjs',
    'test-assist-navigation.cjs', 'test-email-validity-reliability.cjs',
    'test-owner-discovery.cjs', 'test-owner-evidence.cjs', 'verify-main-email.cjs',
    'verify-social-profiles.cjs', 'verify-contact-crawl.cjs', 'verify-maps-limits.cjs',
    'verify-maps-browser-limits.cjs', 'verify-maps-website-filter.cjs',
    'verify-branded-exports.mjs', 'verify-packaging-config.cjs', 'verify-updates.cjs',
    'test-refresh-windows-update-metadata.mjs', 'verify-billing-server.mjs',
    'verify-assist-service.mjs',
  ],
  desktop: [
    'verify-app-audit.mjs', 'verify-finder-search.cjs',
    'verify-notifications.cjs', 'verify-assist-navigation-ui.cjs',
    'verify-email-validity-ui.cjs', 'verify-email-validity-filters.cjs',
    'verify-2000-leads.cjs', 'verify-import-count.cjs', 'verify-decision-saved-count.cjs',
    'verify-saved-maps-searches.cjs', 'verify-website-lookup-ui.cjs',
  ],
}
if (!groups[group]) throw Error('Choose core or desktop')
mkdirSync(output, { recursive: true })
const results = []
async function run(script) {
  const started = Date.now()
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE
  delete env.VITE_DEV_SERVER_URL
  let log = '', timedOut = false
  const child = spawn(process.execPath, [join(root, 'scripts', script)], { cwd: root, env, windowsHide: true })
  child.stdout.on('data', chunk => { log += chunk })
  child.stderr.on('data', chunk => { log += chunk })
  const timeout = setTimeout(() => { timedOut = true; child.kill() }, 240000)
  const exitCode = await new Promise(resolve => {
    child.on('error', error => { log += '\n' + error.stack; resolve(1) })
    child.on('close', resolve)
  })
  clearTimeout(timeout)
  writeFileSync(join(output, script + '.log'), log)
  const passed = exitCode === 0 && !timedOut && !/^FAIL\s/m.test(log)
  const result = { script, passed, exitCode, timedOut, seconds: Math.round((Date.now() - started) / 100) / 10 }
  results.push(result)
  console.log(`${passed ? 'PASS' : 'FAIL'} ${script} (${result.seconds}s)`)
  if (!passed) console.log(log.slice(-2500))
  writeFileSync(join(output, group + '.json'), JSON.stringify({ group, passed: results.every(r => r.passed), results }, null, 2))
}
;(async () => {
  const selected = process.argv.slice(4)
  for (const script of selected.length ? groups[group].filter(script => selected.includes(script)) : groups[group]) await run(script)
  console.log(`${results.filter(r => r.passed).length}/${results.length} ${group} suites passed`)
  if (results.some(r => !r.passed)) process.exitCode = 1
})().catch(error => { console.error(error); process.exitCode = 1 })
