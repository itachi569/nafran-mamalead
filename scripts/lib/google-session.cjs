// The Google gate, for the checks that run the app through Playwright's Electron launcher.
//
// Run with filters will not scrape until the app's own browser holds an account. Those checks launch
// their own copy of the app with the test hooks on, so they can seed the saved profile directly —
// the same session cookie a sign-in leaves behind, and nothing else about the run.
const DEFAULTS = { name: 'SID', value: 'test-session', domain: '.google.com', path: '/' }

/**
 * Writes a session into the app's saved profile, so the next run passes the gate.
 *
 * @param {{ evaluate: (fn: Function) => Promise<unknown> }} app the launched Electron app
 * @returns {Promise<boolean>} whether the gate will now find an account
 */
async function seedGoogleSession(app) {
  const ok = await app.evaluate(async ({ app: electronApp }) => {
    const hook = globalThis.__leadsnapTest
    if (!hook?.seedSession) return false
    return hook.seedSession()
  })
  return Boolean(ok)
}

module.exports = { seedGoogleSession, DEFAULTS }
