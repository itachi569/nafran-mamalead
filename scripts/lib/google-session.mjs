// The Google gate, for the verification suites that drive a real run.
//
// Run with filters will not scrape until the app's own browser holds an account, and no automated
// check can sign in to a real one. The app publishes a test hook for exactly this (`seedSession`,
// behind `LEADSNAP_TEST_HOOKS=1`), which writes the same session cookie a sign-in leaves behind
// into the app's own profile folder. Nothing else about the run changes: it is still the gate, the
// saved profile and the real Chromium worker.
const PORT = 9222

/** Seeds the app's saved profile and answers whether the gate will now see an account. */
export async function seedGoogleSession() {
  const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
  const page = targets.find((target) => target.type === 'page')
  if (!page) throw new Error('no page target — start the app with `node scripts/dev-debug.mjs` first')

  const socket = new WebSocket(page.webSocketDebuggerUrl)
  const pending = new Map()
  let nextId = 1
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data)
    const resolve = pending.get(message.id)
    if (resolve) {
      pending.delete(message.id)
      resolve(message)
    }
  })
  const send = (method, params) =>
    new Promise((resolve) => {
      const id = nextId++
      pending.set(id, resolve)
      socket.send(JSON.stringify({ id, method, params }))
    })
  await new Promise((resolve) => socket.addEventListener('open', resolve))
  try {
    const answer = await send('Runtime.evaluate', {
      expression: 'window.desktop.test.seedGoogleSession()',
      awaitPromise: true,
      returnByValue: true,
    })
    if (answer.result?.exceptionDetails) {
      const details = answer.result.exceptionDetails
      const why = details.exception?.description ?? details.text
      throw new Error(`the app failed to seed the session: ${why}`)
    }
    const value = answer.result?.result?.value
    if (typeof value !== 'boolean') {
      throw new Error(
        `the app did not answer (${JSON.stringify(answer.result?.result ?? answer.result)}) — start it with \`node scripts/dev-debug.mjs\`, which turns the test hooks on`,
      )
    }
    return value
  } finally {
    socket.close()
  }
}
