// Exercises real renderer notifications in a throwaway Electron profile.
const assert = require('node:assert/strict')
const { _electron } = require('playwright')
const { mkdtempSync, realpathSync, rmSync } = require('node:fs')
const { resolve, join, sep } = require('node:path')
const { tmpdir } = require('node:os')

const root = resolve(__dirname, '..')
const directory = mkdtempSync(join(tmpdir(), 'nafran-notifications-'))
const executable = process.argv.find(arg => arg.startsWith('--exe='))?.slice(6)
const packaged = process.argv.includes('--packaged') || Boolean(executable)
let desktop

async function sendUpdate(state, message) {
  await desktop.evaluate(({ BrowserWindow }, payload) => {
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send('updates:status', payload)
    }
  }, { state, version: null, percent: null, message })
}

async function main() {
  const env = { ...process.env, APPDATA: join(directory, 'appdata') }
  delete env.ELECTRON_RUN_AS_NODE
  desktop = await _electron.launch({
    ...(packaged ? { executablePath: executable || join(root, 'release', 'win-unpacked', 'MamaLead.exe') } : { cwd: root }),
    args: packaged ? [`--user-data-dir=${join(directory, 'profile')}`] : ['.', `--user-data-dir=${join(directory, 'profile')}`],
    env,
    timeout: 60_000,
  })
  const page = await desktop.firstWindow()
  const pageErrors = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  await page.locator('[data-view="dashboard"]').waitFor()

  const native = await page.evaluate(() => window.desktop.notifications.show('Notification test', 'Bridge is reachable.'))
  assert.equal(typeof native.shown, 'boolean')
  console.log('PASS  native notification bridge responds')

  const bell = page.locator('[data-notifications-button="1"]')
  const panel = page.locator('[data-notifications-panel="1"]')
  const badge = page.locator('[data-notifications-badge="1"]')
  await bell.click()
  await page.locator('[data-notifications-empty="1"]').waitFor()
  assert.equal(await bell.getAttribute('aria-expanded'), 'true')
  await page.locator('[data-notifications-close="1"]').click()
  assert.equal(await panel.count(), 0)
  console.log('PASS  bell opens an empty panel and Back closes it')

  // Disable OS popups in this test; app history must still collect real update events.
  await page.evaluate(() => localStorage.setItem('nafran.notifications.enabled', '0'))
  await page.reload()
  await page.locator('[data-view="dashboard"]').waitFor()
  await sendUpdate('error', 'Test update failed')
  await badge.getByText('1').waitFor()
  await sendUpdate('ready', 'Test update ready')
  await badge.getByText('2').waitFor()
  await bell.click()
  await page.getByText('Update check failed', { exact: true }).waitFor()
  await page.getByText('Update ready', { exact: true }).waitFor()
  assert.match(await panel.innerText(), /2 saved · 0 unread/)
  console.log('PASS  actual error and success events create bell history and unread count')

  assert.equal(await badge.count(),0,'opening the panel clears the unread badge')
  await page.reload();await page.locator('[data-view="dashboard"]').waitFor()
  assert.equal(await badge.count(),0,'seen state persists after reload')
  await bell.click()
  const readRow=page.locator('[data-note]').filter({hasText:'Update check failed'})
  await readRow.locator('[data-notification-read]').click()
  assert.equal(await readRow.getAttribute('data-unread'),'yes')
  assert.equal(await badge.innerText(),'1')
  await page.getByRole('tab',{name:'Unread 1',exact:true}).click()
  await readRow.locator('time').click()
  assert.equal(await readRow.count(),0)
  assert.equal(await badge.count(),0)
  await page.getByRole('tab',{name:'All 2',exact:true}).click()
  await readRow.locator('[data-notification-read]').click()
  await readRow.focus();await page.keyboard.press('Enter')
  assert.equal(await readRow.getAttribute('data-unread'),'no')
  await page.getByText('Total Leads',{exact:true}).first().click()
  assert.equal(await panel.count(),0)
  await bell.click();await page.keyboard.press('Escape');assert.equal(await panel.count(),0)
  await bell.click()
  console.log('PASS opening marks existing notices seen durably; manual unread, timestamp, keyboard and outside/Escape still work')

  await page.locator('[data-note]').filter({ hasText: 'Update ready' }).locator('[data-notification-delete]').click()
  assert.equal(await badge.count(), 0)
  assert.equal(await page.locator('[data-note]').count(), 1)
  await sendUpdate('ready', 'Another update ready')
  await badge.getByText('1').waitFor()
  await page.locator('[data-notifications-read="1"]').click()
  assert.equal(await badge.count(), 0)
  assert.match(await panel.innerText(), /2 saved · 0 unread/)
  await page.locator('[data-notification-delete]').first().click()
  await page.locator('[data-notification-delete]').first().click()
  await page.locator('[data-notifications-empty="1"]').waitFor()
  await page.reload()
  await bell.click()
  await page.locator('[data-notifications-empty="1"]').waitFor()
  console.log('PASS  delete, Mark all read, and empty history persist after reload')

  // In-app popups still work if the OS declines to display a native notification.
  await desktop.evaluate(({ipcMain})=>{ipcMain.removeHandler('notifications:show');ipcMain.handle('notifications:show',()=>({shown:false}))})
  await page.evaluate(()=>localStorage.setItem('nafran.notifications.enabled','1'))
  await page.reload();await page.locator('[data-view="dashboard"]').waitFor()
  await sendUpdate('error','Popup error needs review')
  let popup=page.locator('[data-notification-popup]')
  await popup.waitFor();await desktop.evaluate(({BrowserWindow})=>{const win=BrowserWindow.getAllWindows()[0];win.show();win.focus()});await page.bringToFront()
  await page.waitForFunction(()=>{const node=document.querySelector('[data-notification-popup]');if(!node)return false;const transform=getComputedStyle(node).transform;return transform==='none'||transform==='matrix(1, 0, 0, 1, 0, 0)'})
  let bounds=await popup.boundingBox()
  const viewport=await page.evaluate(()=>({width:document.documentElement.clientWidth,height:innerHeight}))
  assert.ok(bounds.y>=10&&bounds.y<40&&Math.abs(viewport.width-bounds.x-bounds.width-20)<3,'popup is in the upper right corner: '+JSON.stringify({bounds,viewport}))
  await page.screenshot({path:resolve(root,'../../outputs/mamalead-popup-light.png')})
  assert.match(await popup.innerText(),/MamaLead.*Just now/s)
  assert.equal(await page.locator('[data-notifications-panel]').count(),0,'popup does not open the full history')
  await popup.hover();await page.waitForTimeout(8500);assert.equal(await popup.count(),1,'hover keeps the notice readable')
  await popup.getByRole('button',{name:'Dismiss notification: Update check failed',exact:true}).click()
  assert.equal(await popup.count(),0);assert.equal(await badge.innerText(),'1','dismiss retains unread history')
  await sendUpdate('ready','Popup update ready')
  await popup.waitFor();await popup.locator('.nt-popup-open').click()
  await page.locator('#app-updates').waitFor()
  assert.equal(await popup.count(),0)
  const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('nafran.notifications')))
  assert.equal(stored.find(item=>item.title==='Update ready').unread,false,'opening popup marks its own item read')
  await page.reload();await page.locator('[data-view="settings"]').waitFor();assert.equal(await popup.count(),0,'saved notices are not replayed')
  await sendUpdate('error','Automatic popup dismissal fixture')
  await popup.waitFor();await page.mouse.move(2,2);await page.waitForTimeout(8500)
  assert.equal(await popup.count(),0,'unfocused popup closes automatically')
  console.log('PASS upper-right popup, OS fallback, pause on hover, dismiss, related-page navigation, read state and no replay')

  assert.deepEqual(pageErrors, [])
  console.log('PASS  notification flow has no renderer errors')
  console.log(`notification checks passed (${packaged ? 'packaged' : 'local'} app)`)
}

main().catch((error) => {
  console.error('notification verification failed:', error)
  process.exitCode = 1
}).finally(async () => {
  if (desktop) await desktop.close()
  const tempRoot = realpathSync(tmpdir()) + sep
  if (realpathSync(directory).startsWith(tempRoot)) rmSync(directory, { recursive: true, force: true })
})
