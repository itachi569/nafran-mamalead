// Dev launcher with a debugging port, so the running app can be inspected from outside.
//
// `npm run dev` cannot carry an extra Electron flag, and Playwright's Electron launcher is
// unavailable in this environment, so this starts Vite and then Electron with
// --remote-debugging-port. That port exposes the renderer over CDP, which is how the UI is
// verified instead of guessed at from a window title.
//
// Vite is only started when nothing is already serving the dev port. A previous run that was
// killed can leave its server behind, and starting a second one fails the whole launch.
//
// Vite reloads the renderer on every save, but the main process is not watched: `package.json`
// points at the compiled `dist-electron/main.js`. Editing anything under `electron/` therefore
// changes nothing until it is rebuilt, so that build runs here, before Electron starts.
import { spawn, spawnSync } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'

const DEV_URL = 'http://localhost:5173/'
const PORT = 9222

for (const [label, command, args] of [
  ['tsc', 'npx', ['tsc', '-p', 'electron/tsconfig.json']],
  ['electron-cjs', 'node', ['scripts/electron-cjs.mjs']],
]) {
  const built = spawnSync(command, args, { stdio: 'inherit', shell: process.platform === 'win32' })
  if (built.status !== 0) {
    console.error(`[launcher] ${label} failed with ${built.status}; not starting Electron on a stale build`)
    process.exit(built.status ?? 1)
  }
}
console.log('[launcher] main process rebuilt from electron/')

const children = []
function launch(command, args, name, extraEnv) {
  const child = spawn(command, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: extraEnv ? { ...process.env, ...extraEnv } : process.env,
  })
  children.push(child)
  child.on('exit', (code) => console.log(`[launcher] ${name} exited with ${code}`))
  return child
}

function shutdown() {
  for (const child of children) child.kill()
  process.exit(0)
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

async function devServerUp() {
  try {
    const response = await fetch(DEV_URL)
    return response.ok
  } catch {
    return false
  }
}

if (await devServerUp()) {
  console.log('[launcher] a dev server is already running, reusing it')
} else {
  launch('npx', ['vite'], 'vite')
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (await devServerUp()) break
    await sleep(500)
  }
}
console.log('[launcher] dev server reachable, starting electron')

// VITE_DEV_SERVER_URL is what makes main.ts load the dev server instead of the prebuilt
// `dist` bundle. Without it the window silently renders the last build, so a source edit looks
// like it had no effect — verification then measures the wrong code.
//
// LEADSNAP_TEST_HOOKS publishes the app's own browser to the checks, which is how a suite gets a
// session into the profile and drives a real run past the Google gate. It is a debugging launcher,
// so the flag is on here and nowhere else.
launch('npx', ['electron', '.', `--remote-debugging-port=${PORT}`], 'electron', {
  VITE_DEV_SERVER_URL: DEV_URL,
  LEADSNAP_TEST_HOOKS: '1',
})
console.log(`[launcher] electron started with CDP on http://127.0.0.1:${PORT}`)
