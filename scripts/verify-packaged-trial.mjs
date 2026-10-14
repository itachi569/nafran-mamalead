import assert from 'node:assert/strict'
import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { _electron as electron } from 'playwright'

const executablePath = resolve(import.meta.dirname, '../release/win-unpacked/Nafran Leads Scraper.exe')
const directory = mkdtempSync(join(tmpdir(), 'nafran-packaged-trial-'))
let desktop
try {
  const env = { ...process.env, APPDATA: join(directory, 'appdata') }
  delete env.ELECTRON_RUN_AS_NODE
  desktop = await electron.launch({
    executablePath,
    args: [`--user-data-dir=${join(directory, 'profile')}`],
    env,
    timeout: 60_000,
  })
  const page = await desktop.firstWindow()
  for (const [range, phrase] of [
    ['7 Days', 'last 7 days'],
    ['30 Days', 'last 30 days'],
    ['All Time', 'across all time'],
  ]) {
    await page.locator(`[data-range="1"] [data-r="${range}"]`).first().click({ timeout: 30_000 })
    assert.match(await page.locator('[data-volume-period="1"]').innerText(), new RegExp(phrase))
    assert.equal(await page.locator(`[data-range="1"] [data-r="${range}"]`).first().getAttribute('aria-pressed'), 'true')
  }
  console.log('PASS  packaged dashboard changes period when each date button is clicked')

  const bell = page.locator('[data-notifications-button="1"]')
  await bell.click()
  assert.equal(await page.locator('[data-notifications-panel="1"]').count(), 1)
  await page.locator('[data-notifications-panel="1"] h2').click()
  assert.equal(await page.locator('[data-notifications-panel="1"]').count(), 1)
  await page.getByText('Total Leads', { exact: true }).first().click()
  assert.equal(await page.locator('[data-notifications-panel="1"]').count(), 0)
  await bell.click()
  await page.keyboard.press('Escape')
  assert.equal(await page.locator('[data-notifications-panel="1"]').count(), 0)
  console.log('PASS  notification panel closes on outside click or Escape, not inside click')

  await page.locator('[data-assist="1"]').click()
  assert.equal(await page.locator('[data-chat-panel="1"]').count(), 1)
  await page.locator('[data-chat-panel="1"]').getByText('Nafran Assist').click()
  assert.equal(await page.locator('[data-chat-panel="1"]').count(), 1)
  await page.locator('[data-view="dashboard"]').click()
  assert.equal(await page.locator('[data-chat-panel="1"]').count(), 0)
  console.log('PASS  Nafran Assist closes on outside click, not inside click')

  await page.locator('[data-view="maps"]').click()
  await page.locator('[data-bulk="1"]').click()
  const keywordsModal = page.locator('[data-bulk-keywords-modal="1"]')
  assert.equal(await keywordsModal.count(), 1)
  await keywordsModal.locator('section').first().click({ position: { x: 30, y: 30 } })
  assert.equal(await keywordsModal.count(), 1)
  await keywordsModal.click({ position: { x: 5, y: 5 } })
  assert.equal(await keywordsModal.count(), 0)
  console.log('PASS  bulk keyword dialog closes on backdrop click, not inside click')

  await page.locator('[data-view="social"]').click()
  await page.locator('[data-socimpopen="1"]').click()
  const importModal = page.locator('[data-impmodal="1"]')
  assert.equal(await importModal.count(), 1)
  await importModal.locator('section').first().click({ position: { x: 30, y: 30 } })
  assert.equal(await importModal.count(), 1)
  await importModal.click({ position: { x: 5, y: 5 } })
  assert.equal(await importModal.count(), 0)
  console.log('PASS  import dialog closes only when its backdrop is clicked')

  await page.locator('[data-view="dashboard"]').click()
  await page.locator('[data-qa="1"]').last().click()
  const exportModal = page.locator('[data-export-backdrop="1"]')
  assert.equal(await exportModal.count(), 1)
  await exportModal.locator('section').first().click({ position: { x: 30, y: 30 } })
  assert.equal(await exportModal.count(), 1)
  await exportModal.click({ position: { x: 5, y: 5 } })
  assert.equal(await exportModal.count(), 0)
  console.log('PASS  export dialog closes only when its backdrop is clicked')

  await page.locator('[data-view="settings"]').first().click({ timeout: 30_000 })
  await page.locator('[data-stab="plan"]').first().click({ timeout: 30_000 })
  await page.locator('[data-trial-open="1"]').click({ timeout: 30_000 })
  assert.equal(await page.locator('[data-trial-form="1"] input[type="email"]').count(), 1)
  console.log('PASS  packaged app opens the 1-day trial email form')
  await page.locator('[data-stab="acct"]').click()
  await page.getByRole('button', { name: 'Activate', exact: true }).click()
  assert.match(await page.locator('[data-license-notice="1"]').innerText(), /Enter your Nafran license key first\./)
  console.log('PASS  packaged app shows the empty-license notice at the top')
} finally {
  if (desktop) await desktop.close().catch(() => {})
  const tempRoot = realpathSync(tmpdir()) + sep
  if (realpathSync(directory).startsWith(tempRoot)) rmSync(directory, { recursive: true, force: true })
}
