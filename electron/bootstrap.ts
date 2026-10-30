import { app } from 'electron'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

// Windows toast headers use this identity, not the notification's title. Keep it
// aligned with the installer shortcut while preserving existing local data paths.
const userData = app.getPath('userData')
const sessionData = app.getPath('sessionData')
app.setName('MamaLead')
app.setPath('userData', userData)
app.setPath('sessionData', sessionData)
if (process.platform === 'win32') app.setAppUserModelId('com.nafran.leadsscraper')

// Playwright resolves its browser directory when it is first imported. Set this before main.ts
// imports any scraper module so the packaged app uses the browser inside its own installer.
if (app.isPackaged) {
  const browsers = join(process.resourcesPath, 'playwright-browsers')
  if (existsSync(browsers)) process.env.PLAYWRIGHT_BROWSERS_PATH = browsers
}

require('./main')
