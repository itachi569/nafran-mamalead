import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { _electron as electron } from 'playwright'

const repo = resolve(import.meta.dirname, '..')
const directory = mkdtempSync(join(tmpdir(), 'nafran-theme-'))
let desktop

const colors = async (page) => page.evaluate(() => {
  const heading = [...document.querySelectorAll('h2')].find((node) => node.textContent?.trim() === 'Scrape Volume')
  const card = heading?.closest('section')
  const stat = [...(card?.querySelectorAll('div') || [])].find((node) => node.textContent?.trim() === 'This week')?.parentElement
  return {
    theme: document.body.dataset.theme,
    volumeBackground: card ? getComputedStyle(card).backgroundImage : null,
    volumeHeading: heading ? getComputedStyle(heading).color : null,
    statBackground: stat ? getComputedStyle(stat).backgroundColor : null,
    cardSurfaces: [...document.querySelectorAll('[data-card]')].map((node) => {
      const style = getComputedStyle(node)
      return [style.backgroundColor, style.backgroundImage]
    }),
  }
})

try {
  const env = { ...process.env, APPDATA: join(directory, 'appdata') }
  delete env.ELECTRON_RUN_AS_NODE
  desktop = await electron.launch({ args: ['.'], cwd: repo, env, timeout: 60_000 })
  const page = await desktop.firstWindow()
  await page.locator('h2').filter({ hasText: 'Scrape Volume' }).first().waitFor()
  const light = await colors(page)
  assert.equal(light.theme, 'light')

  await page.locator('[data-theme-btn]').click()
  await page.waitForFunction(() => document.body.dataset.theme === 'dark')
  const dark = await colors(page)
  assert.notEqual(dark.volumeBackground, light.volumeBackground)
  assert.notEqual(dark.volumeHeading, light.volumeHeading)
  dark.cardSurfaces.forEach((surface, index) => assert.notDeepEqual(surface, light.cardSurfaces[index]))
  console.log('PASS  dashboard cards and text switch to dark colors')
  await page.evaluate(() => {
    const probe = document.createElement('div')
    probe.dataset.themeProbe = '1'
    probe.style.cssText = 'background:#F5F5F4;color:#1C1C1C'
    probe.textContent = 'Dynamically added content'
    document.body.appendChild(probe)
  })
  await page.waitForFunction(() => getComputedStyle(document.querySelector('[data-theme-probe]')).backgroundColor !== 'rgb(245, 245, 244)')
  console.log('PASS  content added while dark adopts dark colors')

  await page.locator('[data-range="1"] [data-r="7 Days"]').first().click()
  await page.locator('[data-range="1"] [data-r="30 Days"]').first().click()
  await page.locator('[data-view="maps"]').click()
  await page.locator('[data-view="dashboard"]').click()
  const darkAfterRender = await colors(page)
  assert.equal(darkAfterRender.volumeBackground, dark.volumeBackground)
  await page.locator('section[data-card]').filter({ has: page.getByText('Scrape Volume', { exact: true }) }).hover()

  await page.locator('[data-theme-btn]').click()
  await page.waitForFunction(() => document.body.dataset.theme === 'light')
  const restored = await colors(page)
  assert.equal(restored.volumeBackground, light.volumeBackground)
  assert.equal(restored.volumeHeading, light.volumeHeading)
  assert.equal(restored.statBackground, light.statBackground)
  assert.deepEqual(restored.cardSurfaces, light.cardSurfaces)
  assert.equal(await page.locator('[data-theme-probe]').evaluate((node) => getComputedStyle(node).backgroundColor), 'rgb(245, 245, 244)')
  console.log('PASS  hovered Scrape Volume and all dashboard cards return to light colors')
} finally {
  if (desktop) await desktop.close()
  rmSync(directory, { recursive: true, force: true })
}
