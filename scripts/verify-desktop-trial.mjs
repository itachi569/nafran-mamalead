import assert from 'node:assert/strict'
import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { _electron as electron } from 'playwright'
import { createBillingServer } from '../billing-server/server.mjs'

const root = resolve(import.meta.dirname, '..')
const directory = mkdtempSync(join(tmpdir(), 'nafran-desktop-trial-'))
const sent = []
const service = createBillingServer({
  env: {
    STRIPE_SECRET_KEY: 'sk_test_desktoptrial',
    STRIPE_PRICE_LIFETIME: 'price_lifetime',
    BILLING_DB_PATH: join(directory, 'billing.db'),
    BILLING_PORT: '0',
    BILLING_PUBLIC_URL: 'http://127.0.0.1:38747',
    DOWNLOAD_SIGNING_KEY: 'desktop-trial-test-signing-secret-123456',
  },
  fetch: async (url) => {
    assert.match(url, /\/prices\/price_lifetime$/)
    return { ok: true, json: async () => ({ active: true, currency: 'pkr', unit_amount: 1000000, recurring: null }) }
  },
  sendEmail: async (message) => { sent.push(message); return true },
})
let desktop
try {
  await new Promise((resolve, reject) => service.server.once('error', reject).listen(0, '127.0.0.1', resolve))
  const origin = `http://127.0.0.1:${service.server.address().port}`
  const packaged = process.env.NAFRAN_TEST_PACKAGED === '1'
  const env = { ...process.env, LEADSNAP_BILLING_API_URL: origin, APPDATA: join(directory, 'appdata') }
  delete env.ELECTRON_RUN_AS_NODE
  desktop = await electron.launch(packaged ? {
    executablePath: resolve(root, 'release/win-unpacked/MamaLead.exe'),
    args: [`--user-data-dir=${join(directory, 'profile')}`], env, timeout: 60_000,
  } : {
    cwd: root, args: ['.', `--user-data-dir=${join(directory, 'profile')}`], env, timeout: 60_000,
  })
  if (packaged) await desktop.evaluate((_, mockOrigin) => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = (input, init) => {
      const url = new URL(String(input))
      if (url.origin === 'https://api.mamalead.com') return originalFetch(new URL(url.pathname + url.search, mockOrigin), init)
      return originalFetch(input, init)
    }
  }, origin)
  const page = await desktop.firstWindow()
  await page.locator('[data-view="settings"]').first().click()
  await page.locator('[data-stab="plan"]').first().click()
  await page.locator('[data-trial-open="1"]').click()
  assert.equal(await page.locator('[data-trial-form="1"] input[type="email"]').count(), 1)
  console.log('PASS  trial row opens the email request form')

  const email = `desktop-trial-${Date.now()}@example.test`
  await page.locator('#desktop-trial-email').fill(email)
  await page.getByRole('button', { name: 'Email my 1-day key' }).click()
  await page.locator('[data-stab="acct"][aria-current="page"]').waitFor({ timeout: 15_000 })
  await page.locator('[data-license-next-step="1"]').getByText(`Trial key sent to ${email}`, { exact: false }).waitFor()
  assert.equal(await page.locator('#nafran-license-key').evaluate((element) => element === document.activeElement), true)
  assert.equal(sent.length, 1)
  assert.equal(sent[0].to, email)
  assert.equal(sent[0].kind, 'trial')
  assert.equal((await page.locator('[data-license-next-step="1"]').innerText()).includes(sent[0].licenseKey), false)
  console.log('PASS  desktop emails one trial key and focuses Account licence entry automatically')

  const sameEmailRetry = await page.evaluate((sameEmail) => window.desktop.billing.requestTrial(sameEmail, true)
    .then(() => 'unexpected success').catch((error) => String(error.message)), email)
  assert.match(sameEmailRetry, /already received its one trial key/i)
  assert.equal(sent.length, 1)

  await page.locator('[data-trial-change-email="1"]').click()
  await page.locator('[data-stab="plan"][aria-current="page"]').waitFor()
  await page.locator('[data-trial-form="1"]').waitFor()
  const correctedEmail = `corrected-${Date.now()}@example.test`
  await page.locator('#desktop-trial-email').fill(correctedEmail)
  await page.getByRole('button', { name: 'Send replacement key' }).click()
  await page.locator('[data-stab="acct"][aria-current="page"]').waitFor()
  assert.equal(sent.length, 2)
  assert.equal(sent[1].to, correctedEmail)
  assert.notEqual(sent[1].licenseKey, sent[0].licenseKey)
  assert.equal(await page.locator('[data-trial-change-email="1"]').count(), 0)
  assert.match(await page.locator('[data-license-next-step="1"]').innerText(), /previous key is no longer valid/i)
  const anotherCorrection = await page.evaluate(() => window.desktop.billing.requestTrial('third@example.test', true)
    .then(() => 'unexpected success').catch((error) => String(error.message)))
  assert.match(anotherCorrection, /can no longer be changed/i)
  assert.equal(sent.length, 2)
  console.log('PASS  wrong-email button returns to the form, sends one replacement, then returns to Account')

  await page.getByRole('button', { name: 'Activate', exact: true }).click()
  await page.locator('[data-license-notice="1"]').getByText('Enter your Nafran license key first.').waitFor()
  console.log('PASS  empty license shows a top error notice')

  await page.locator('#nafran-license-key').fill(sent[0].licenseKey)
  await page.getByRole('button', { name: 'Activate', exact: true }).click()
  await page.locator('[data-license-notice="1"]').getByText('Invalid license key. Check the key in your email and try again.').waitFor()
  console.log('PASS  replacement invalidates the key sent to the wrong email')

  await page.locator('#nafran-license-key').fill(sent[1].licenseKey)
  await page.getByRole('button', { name: 'Activate', exact: true }).click()
  await page.locator('[data-license-notice="1"]').getByText('License activated on this machine.').waitFor()
  await page.getByText('1-day trial active on this machine', { exact: false }).waitFor({ timeout: 15_000 })
  const status = await page.evaluate(() => window.desktop.billing.status())
  assert.equal(status.trial?.active, true)
  assert.equal(status.license?.kind, 'trial')
  console.log('PASS  emailed key activates the 24-hour trial on this device')

  await page.evaluate(() => { window.__trialTestDoneRunId = ''; window.desktop.scraper.onDone((summary) => { window.__trialTestDoneRunId = summary.runId }) })
  const run = await page.evaluate(() => window.desktop.scraper.start({
    provider: 'mock', query: { keywords: ['clinic'], location: 'Manchester', maxResultsPerKeyword: 1 },
  }))
  await page.waitForFunction(async (runId) => {
    const latest = await window.desktop.scraper.last()
    return latest?.runId === runId && latest.status === 'done' && latest.leads.length === 1
  }, run.runId, { timeout: 15_000 })
  await page.waitForFunction(async () => (await window.desktop.billing.status()).mapsLeads?.used === 1)
  await page.waitForFunction((runId) => window.__trialTestDoneRunId === runId, run.runId)
  await page.locator('[data-stab="plan"]').click()
  await page.getByRole('button', { name: 'Refresh billing' }).click()
  await page.locator('[data-trial-maps-usage="1"]').getByText('1 of 300 Maps leads used · 299 remaining', { exact: false }).waitFor()
  console.log('PASS  first Maps keyword captures 1 lead and leaves 299 trial leads')

  const secondRun = await page.evaluate(() => window.desktop.scraper.start({
    provider: 'mock', query: { keywords: ['dentist'], location: 'Manchester', maxResultsPerKeyword: 8 },
  }))
  await page.waitForFunction(async (runId) => (await window.desktop.scraper.last())?.runId === runId && (await window.desktop.billing.status()).mapsLeads?.used === 9, secondRun.runId)
  await page.waitForFunction((runId) => window.__trialTestDoneRunId === runId, secondRun.runId)
  console.log('PASS  another keyword shares the same 300-lead allowance')

  const trialRow = service.db.prepare('select id, bound_installation_id from trial_licenses limit 1').get()
  service.db.prepare('insert into trial_map_runs (id, trial_id, installation_id, reserved, delivered, lease_until, created_at) values (?, ?, ?, ?, ?, ?, ?)')
    .run('test-backfill', trialRow.id, trialRow.bound_installation_id, 290, 290, new Date(Date.now() + 60_000).toISOString(), new Date().toISOString())
  const cappedRun = await page.evaluate(() => window.desktop.scraper.start({
    provider: 'mock', query: { keywords: ['doctor', 'surgeon'], location: 'Manchester', maxResultsPerKeyword: 8 },
  }))
  await page.waitForFunction(async (runId) => (await window.desktop.scraper.last())?.runId === runId && (await window.desktop.billing.status()).mapsLeads?.used === 300, cappedRun.runId)
  await page.waitForFunction((runId) => window.__trialTestDoneRunId === runId, cappedRun.runId)
  await page.getByRole('button', { name: 'Refresh billing' }).click()
  await page.locator('[data-trial-maps-usage="1"]').getByText('300 of 300 Maps leads used · 0 remaining', { exact: false }).waitFor()
  assert.equal((await page.evaluate(() => window.desktop.scraper.last())).leads.length, 1)
  const overLimit = await page.evaluate(() => window.desktop.scraper.start({ provider: 'mock', query: { keywords: ['clinic'], maxResultsPerKeyword: 1 } })
    .then(() => 'unexpected success').catch((error) => String(error.message)))
  assert.match(overLimit, /300 Maps leads are used/i)
  console.log('PASS  desktop caps the final run at 300 leads and blocks the next one')
} finally {
  if (desktop) await desktop.close()
  service.close()
  const tempRoot = realpathSync(tmpdir()) + sep
  if (realpathSync(directory).startsWith(tempRoot)) rmSync(directory, { recursive: true, force: true })
}
