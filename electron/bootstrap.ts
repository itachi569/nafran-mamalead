import { app } from 'electron'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { getDefaultAutoSelectFamilyAttemptTimeout, setDefaultAutoSelectFamilyAttemptTimeout } from 'node:net'
import { prepareProfileDirectory } from './profile-directory'

// A 250ms address attempt can reject a reachable overseas website before the
// request's own timeout. Keep IPv4/IPv6 fallback, allowing one second per address.
setDefaultAutoSelectFamilyAttemptTimeout(Math.max(1000, getDefaultAutoSelectFamilyAttemptTimeout()))

// Acquire the same lock older releases use before touching their saved profile.
const userData = app.getPath('userData')
const sessionData = app.getPath('sessionData')
const ownsInstance = app.requestSingleInstanceLock()
app.setName('MamaLead')
let brandedData = userData
if (ownsInstance) {
  try {
    brandedData = prepareProfileDirectory(app.getPath('appData'), userData, app.commandLine.hasSwitch('user-data-dir'))
  } catch (error) {
    // Never strand the user in an empty workspace if a file is locked or disk is full.
    console.warn('MamaLead kept the original data folder:', error instanceof Error ? error.message : 'Migration unavailable')
  }
}
app.setPath('userData', brandedData)
app.setPath('sessionData', sessionData === userData ? brandedData : sessionData)
if (process.platform === 'win32') app.setAppUserModelId('com.nafran.leadsscraper')

// Playwright resolves its browser directory when it is first imported. Set this before main.ts
// imports any scraper module so the packaged app uses the browser inside its own installer.
if (app.isPackaged) {
  const browsers = join(process.resourcesPath, 'playwright-browsers')
  if (existsSync(browsers)) process.env.PLAYWRIGHT_BROWSERS_PATH = browsers
}

if (ownsInstance) require('./main')
else app.quit()
