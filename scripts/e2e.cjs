// End-to-end check of the ported app: starts a real Chromium Google Maps run from the
// reference UI and confirms the captured leads reach the tables.
//
// Run with filters goes through the Google gate, so the saved profile is given a session first —
// the gate will not scrape without an account, and no check can sign in to a real one.
const { _electron } = require('playwright')
const { seedGoogleSession } = require('./lib/google-session.cjs')

async function main() {
  const app = await _electron.launch({
    args: ['.'],
    cwd: process.cwd(),
    env: { ...process.env, LEADSNAP_TEST_HOOKS: '1' },
  })
  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0].setContentSize(1440, 900)
  })
  await page.waitForSelector('[data-view="dashboard"]', { timeout: 30000 })
  await page.waitForTimeout(1000)

  console.log('title:', (await page.textContent('h1')).trim())
  console.log('gate will see an account:', await seedGoogleSession(app))

  await page.click('[data-view="maps"]')
  await page.waitForTimeout(600)

  // One keyword only, and a small cap, so the run is quick but real.
  for (const chip of await page.$$('[data-kw="1"]')) await chip.click()
  await page.fill('[data-kwinput]', 'dentist')
  await page.press('[data-kwinput]', 'Enter')
  for (let i = 0; i < 4; i += 1) await page.click('[aria-label="Fewer results"]')
  await page.waitForTimeout(300)
  console.log('keywords:', (await page.$$eval('[data-kw="1"]', (nodes) => nodes.map((n) => n.textContent.replace('×', '').trim()))).join(', '))
  console.log('cap:', (await page.textContent('[data-setup] span[style*="font-size:19px"]')).trim())

  await page.click('[data-runbtn="1"]')
  console.log('run started…')

  await page.waitForFunction(() => document.querySelector('[data-runbtn="1"]')?.getAttribute('data-state') === 'run', null, { timeout: 30000 })
  await page.waitForTimeout(6000)
  const midRun = await page.evaluate(() => ({
    side: document.querySelector('[data-account] span span')?.textContent?.trim(),
    note: Array.from(document.querySelectorAll('p,span')).map((n) => n.textContent || '').find((t) => t.startsWith('Scanning') || t.includes('captured')),
  }))
  console.log('mid-run status:', midRun.side, '|', midRun.note ? midRun.note.trim().slice(0, 90) : '(no note)')

  await page.waitForFunction(() => document.querySelector('[data-runbtn="1"]')?.getAttribute('data-state') === 'idle', null, { timeout: 180000 })
  console.log('run finished')

  await page.click('[data-view="leads"]')
  await page.waitForTimeout(1200)
  const rows = await page.$$eval('[data-row]', (nodes) =>
    nodes
      .map((node) => node.textContent.replace(/\s+/g, ' ').trim())
      .filter((text) => text.length > 40)
      .slice(0, 6),
  )
  console.log(`lead rows: ${rows.length}`)
  for (const row of rows) console.log('  ', row.slice(0, 110))

  const shot = process.env.COMMANDCODE_SCRATCHPAD
  if (shot) await page.screenshot({ path: `${shot}/port-leads-after-run.png` })
  await app.close()
}

main().catch((error) => {
  console.error('e2e failed:', error.message)
  process.exitCode = 1
})
