// Checks Settings against the local workspace on the running debug app.
import { chromium } from 'playwright'

const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
try {
  const page = browser.contexts()[0].pages().find((entry) => entry.url().startsWith('http') || entry.url().startsWith('file:'))
  if (!page) throw new Error('no page target')
  const workspace = await page.evaluate(() => window.desktop.local.workspace())
  const lookups = await page.evaluate(() => window.desktop.local.jobs.usage())
  await page.locator('[data-view="settings"]').click()
  await page.locator('[data-stab="plan"]').click()
  const usageText = await page.locator('body').innerText()
  await page.locator('[data-stab="team"]').click()
  const membersText = await page.locator('[data-workspace-members="1"]').innerText()
  const results = []
  function check(name, ok, detail = '') {
    results.push(ok)
    console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (detail ? ' · ' + detail : ''))
  }
  check('workspace name comes from the database', usageText.includes(workspace.name), workspace.name)
  check('Maps usage comes from the database', usageText.includes(String(workspace.usage.scrapes_used)) && usageText.includes(workspace.usage.scrape_limit.toLocaleString('en-GB')))
  check('lookup counts are shown from jobs', ['email', 'phone', 'social', 'decision-maker'].every((kind) => usageText.includes(String(lookups[kind] ?? 0))))
  check('member count comes from local records', membersText.includes(String(workspace.members.length) + ' recorded member'), membersText.replace(/\s+/g, ' ').slice(0, 140))
  check('no invented pricing or purchase controls', !/£39|£89|£8|£6|Next charge|Upgrade to Studio|Buy extra credits/.test(usageText))
  check('no sample people or invite controls', !/Nafran Iqbal|Sana Malik|Iwan Prys|Invite member|Seat history/.test(membersText))
  const failed = results.filter((ok) => !ok).length
  console.log('\n' + (results.length - failed) + '/' + results.length + ' checks passed')
  if (failed) process.exitCode = 1
} finally {
  await browser.close()
}
