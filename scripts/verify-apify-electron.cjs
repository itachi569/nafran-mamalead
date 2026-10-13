const { chromium } = require('playwright')

async function main() {
  const browser = await chromium.connectOverCDP(process.env.CDP_URL || 'http://127.0.0.1:9222')
  const pages = browser.contexts().flatMap((context) => context.pages())
  const page = pages.find((candidate) => candidate.url().startsWith('http://localhost:5173')) || pages[0]
  if (!page) throw new Error('No Electron renderer is connected to the debugging port.')

  await page.waitForFunction(() => Boolean(window.desktop?.local && window.desktop?.emailValidity && window.desktop?.test))
  const existing = await page.evaluate(() => window.desktop.local.contacts.list('email'))
  const seed = existing.find((row) => typeof row.lead_id === 'string' && row.lead_id)
  if (!seed) throw new Error('The Electron database has no lead that can own the temporary test address.')

  const live = process.env.LIVE_APIFY === '1'
  const address = live ? (process.env.APIFY_TEST_EMAIL || 'info@apify.com').trim().toLowerCase() : `apify-electron-test-${Date.now()}@example.com`
  if (existing.some((row) => String(row.value || '').trim().toLowerCase() === address)) {
    throw new Error(`Refusing to reuse and later delete an existing contact: ${address}`)
  }
  const created = await page.evaluate(
    ({ leadId, value }) => window.desktop.local.contacts.upsert({ leadId, kind: 'email', value, source: 'apify-electron-test' }),
    { leadId: seed.lead_id, value: address },
  )

  try {
    await page.getByText('Email Finder', { exact: true }).first().click()
    await page.locator('[data-email-validity="1"]').first().waitFor({ state: 'visible' })
    if (!live) await page.evaluate(() => window.desktop.test.mockOneEmailValidity())
    const startedAt = Date.now()
    const summary = await page.evaluate(
      (contactId) => window.desktop.emailValidity.verify({ contactIds: [contactId], force: true }),
      created.id,
    )
    const elapsedMs = Date.now() - startedAt
    const stored = await page.evaluate(() => window.desktop.local.contacts.list('email'))
    const checked = stored.find((row) => row.id === created.id)

    if (summary.provider !== 'apify' || summary.checked !== 1 || (!live && summary.valid !== 1)) {
      throw new Error(`Unexpected Electron verification summary: ${JSON.stringify(summary)}`)
    }
    if (!['valid', 'invalid', 'risky', 'unknown'].includes(checked?.validation_status) || checked?.validation_provider !== 'apify') {
      throw new Error(`Apify result was not persisted by Electron: ${JSON.stringify(checked)}`)
    }

    console.log(JSON.stringify({
      ok: true,
      window: await page.title(),
      provider: summary.provider,
      checked: summary.checked,
      savedStatus: checked.validation_status,
      savedProvider: checked.validation_provider,
      elapsedMs,
      live,
      buttonVisible: true,
    }, null, 2))
  } finally {
    await page.evaluate((contactId) => window.desktop.local.contacts.remove(contactId), created.id)
    await browser.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
