import { app } from 'electron'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

// Playwright resolves its browser directory when it is first imported. Set this before main.ts
// imports any scraper module so the packaged app uses the browser inside its own installer.
if (app.isPackaged) {
  const browsers = join(process.resourcesPath, 'playwright-browsers')
  if (existsSync(browsers)) process.env.PLAYWRIGHT_BROWSERS_PATH = browsers
}

require('./main')
