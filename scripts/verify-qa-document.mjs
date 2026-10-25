// Isolated end-to-end audit: real Electron/SQLite/billing code, local fixture websites and AI.
// No customer records, real payment, provider credits or production deployment are used.
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createServer } from 'node:http'
import { _electron as electron } from 'playwright'
import ExcelJS from 'exceljs'
import { PDFDocument } from 'pdf-lib'
import { createBillingServer } from '../billing-server/server.mjs'
import { verifyMapsWindow } from './lib/verify-maps-window.mjs'

const directory = mkdtempSync(join(tmpdir(), 'mamalead-audit-'))
const packaged = process.env.NAFRAN_TEST_PACKAGED === '1'
const billingReturnTest = process.env.NAFRAN_TEST_BILLING_RETURN === '1'
const sent = [], errors = [], providerRequests = []
const nativeFetch = globalThis.fetch
globalThis.fetch = async (input, init) => {
  if (String(input).startsWith('https://api.cerebras.ai/')) {
    providerRequests.push(JSON.parse(init.body))
    return Response.json({ choices: [{ message: { content: 'Audit AI ready. Import a website to find its published contact details.' } }] })
  }
  return nativeFetch(input, init)
}
const service = createBillingServer({
  env: { STRIPE_SECRET_KEY: 'sk_test_audit', STRIPE_PRICE_LIFETIME: 'price_lifetime', BILLING_DB_PATH: join(directory, 'billing.db'), BILLING_PORT: '0', BILLING_PUBLIC_URL: 'http://127.0.0.1:38747', DOWNLOAD_SIGNING_KEY: 'audit-only-signing-secret-1234567890123', CEREBRAS_API_KEY: 'audit-only-not-a-real-provider-key' },
  fetch: async url => { assert.match(url, /\/prices\/price_lifetime$/); return { ok: true, json: async () => ({ active: true, currency: 'pkr', unit_amount: 1000000, recurring: null }) } },
  sendEmail: async message => { sent.push(message); return true },
})
const fixture = createServer((req, res) => {
  res.setHeader('content-type', 'text/html')
  res.end(`<html><body><h1>Audit Clinic</h1><p>Clifton, Karachi</p><a href="mailto:hello@audit.fixture.test">Email</a><a href="tel:+922112345678">Call</a><a href="https://www.facebook.com/profile.php?id=123456789&amp;ref=footer">Facebook</a><script type="application/ld+json">{"sameAs":["https:\\/\\/instagram.com\\/auditclinic\\/"]}</script></body></html>`)
})
let desktop, page
async function launch() {
  const env = { ...process.env, APPDATA: join(directory, 'appdata'), LEADSNAP_BILLING_API_URL: `http://127.0.0.1:${service.server.address().port}`, LEADSNAP_TEST_HOOKS: '1' }
  delete env.ELECTRON_RUN_AS_NODE; delete env.VITE_DEV_SERVER_URL
  desktop = await electron.launch(packaged
    ? { executablePath: resolve('release/win-unpacked/MamaLead.exe'), args: [`--user-data-dir=${join(directory, 'profile')}`, ...(billingReturnTest ? ['mamalead://billing'] : [])], env, timeout: 60000 }
    : { args: ['.', `--user-data-dir=${join(directory, 'profile')}`, ...(billingReturnTest ? ['mamalead://billing'] : [])], cwd: resolve('.'), env, timeout: 60000 })
  await desktop.evaluate(({ shell }, { billing, website }) => {
    shell.openExternal = async () => {}
    const native = globalThis.fetch
    globalThis.fetch = async (input, init) => {
      const url = new URL(String(input))
      if (url.origin === 'https://api.mamalead.com') return native(billing + url.pathname + url.search, init)
      if (url.hostname.endsWith('.fixture.test')) {
        const response = await native(website + url.pathname, init)
        Object.defineProperty(response, 'url', { value: url.href })
        return response
      }
      if (url.hostname === '127.0.0.1') return native(input, init)
      // Auto-enrichment of offline Maps sample URLs must never call external providers.
      return new Response('Fixture has no further contact information', { status: 404 })
    }
  }, { billing: env.LEADSNAP_BILLING_API_URL, website: `http://127.0.0.1:${fixture.address().port}` })
  page = await desktop.firstWindow()
  page.on('pageerror', error => errors.push(error.message))
  await page.locator('[data-view="dashboard"]').waitFor()
}
async function pages(label) {
  for (const view of ['dashboard', 'maps', 'social', 'email', 'phone', 'dm', 'website', 'leads', 'lists', 'runs', 'settings']) {
    await page.click(`[data-view="${view}"]`)
    await page.waitForTimeout(100)
    assert.ok(await page.locator('section[data-card]').count(), `${view} has content`)
    assert.ok((await page.locator('body').innerText()).length > 300)
  }
  console.log(`PASS ${label}: all 11 app pages render`)
}
try {
  await new Promise(done => service.server.listen(0, '127.0.0.1', done))
  await new Promise(done => fixture.listen(0, '127.0.0.1', done))
  await launch()
  assert.match(await page.title(), /^MamaLead/)
  if (billingReturnTest) {
    await page.locator('#license-section').waitFor()
    await page.click('[data-view="dashboard"]')
    await desktop.evaluate(({app}) => app.emit('second-instance', {}, ['MamaLead.exe','mamalead://billing'], ''))
    await page.locator('#license-section').waitFor()
    assert.equal(await page.evaluate(() => window.desktop.billing.claimReturnHandoff()), false)
    console.log('PASS payment return opens Account on cold launch and brings an existing app back to Billing; handoff consumed once')
  }
  await page.click('[data-view="maps"]')
  assert.equal(await page.getByLabel('Delay between places').inputValue(),'3 s · steady')
  await page.getByRole('button',{name:'Run with filters',exact:true}).click()
  await page.getByRole('heading',{name:'Choose your MamaLead access'}).waitFor()
  await page.waitForTimeout(400)
  await page.screenshot({path:join(directory,'maps-access-options.png')})
  await page.getByRole('button',{name:'Get Lifetime key',exact:true}).click()
  await page.locator('#lifetime-section').waitFor()
  await page.waitForTimeout(1000)
  const lifetimeY=await page.locator('#lifetime-section').evaluate(el=>el.getBoundingClientRect().top)
  assert.ok(lifetimeY>=0 && lifetimeY<850, 'Lifetime card scrolls into view')
  assert.ok(await page.locator('#lifetime-section').evaluate(el=>el.contains(document.activeElement)), 'Lifetime card receives focus')
  await page.click('[data-view="maps"]')
  await page.getByRole('button',{name:'Run with filters',exact:true}).click()
  await page.getByRole('button',{name:'I already have a key',exact:true}).click()
  await page.locator('#license-section').waitFor()
  await page.waitForTimeout(900)
  assert.equal(await page.locator('#nafran-license-key').evaluate(el=>el===document.activeElement),true)
  await page.click('[data-view="maps"]')
  await page.getByRole('button',{name:'Run with filters',exact:true}).click()
  await page.getByRole('button',{name:'Get my 1-day trial'}).click()
  await page.getByRole('button',{name:'Send trial key',exact:true}).waitFor()
  assert.ok(await page.getByLabel('Email for your trial key').isVisible())
  await page.waitForTimeout(700)
  const trialY=await page.locator('#trial-section').evaluate(el=>el.getBoundingClientRect().top)
  assert.ok(trialY>=0 && trialY<850)
  await page.getByRole('button',{name:'Account',exact:true}).click()
  assert.equal(await page.getByRole('heading',{name:'Enrichment keys'}).count(),0)
  assert.equal(await page.locator('[data-assist-settings]').count(),0)
  await page.click('[data-view="dashboard"]')
  await page.getByRole('heading',{name:'Insights / Reports',exact:true}).first().click()
  await page.getByRole('heading',{name:'Choose your MamaLead access'}).waitFor()
  await page.getByRole('button',{name:'Close dialog',exact:true}).click()
  for (const view of ['social', 'email', 'phone', 'dm', 'website', 'leads', 'lists', 'runs']) {
    await page.click(`[data-view="${view}"]`)
    const action = ['social','email','phone','dm'].includes(view)
      ? page.getByRole('button',{name:'Import websites',exact:true}).first()
      : view === 'website' ? page.getByRole('button',{name:'Start lookup',exact:true})
      : page.locator('[data-feature-access] button:visible').first()
    await action.click()
    await page.getByRole('heading',{name:'Choose your MamaLead access'}).waitFor()
    assert.ok(await page.getByRole('button',{name:'Get Lifetime key',exact:true}).isVisible())
    assert.equal(await page.locator('[data-impmodal]').count(),0)
    await page.getByRole('button',{name:'Close dialog',exact:true}).click()
  }
  await page.click('[data-view="social"]')
  await page.getByRole('button',{name:'Import websites',exact:true}).first().focus()
  await page.keyboard.press('Enter')
  await page.getByRole('heading',{name:'Choose your MamaLead access'}).waitFor()
  await page.getByRole('button',{name:'Close dialog',exact:true}).click()
  await page.locator('[data-assist="1"]').click()
  await page.getByRole('heading',{name:'Choose your MamaLead access'}).waitFor()
  await page.getByRole('button',{name:'Close dialog',exact:true}).click()
  console.log('PASS shared access prompt across every feature module and assistant; mouse and keyboard; no unlicensed import starts')
  console.log('PASS unlicensed preflight, Lifetime/trial/existing-key navigation and scroll, visible Send key, provider settings hidden, clickable local reports')
  await pages('fresh installation')
  await page.click('[data-theme-btn]')
  await page.waitForFunction(() => document.body.dataset.theme === 'dark')
  await pages('dark theme')
  await page.click('[data-theme-btn]')
  await page.waitForFunction(() => document.body.dataset.theme === 'light')
  console.log('PASS light/dark theme toggles across every page')
  await page.evaluate(() => window.desktop.billing.requestTrial('audit@fixture.test'))
  assert.equal(sent.length, 1)
  await page.evaluate(key => window.desktop.billing.activate(key), sent[0].licenseKey)
  await page.evaluate(() => window.dispatchEvent(new Event('nafran:billing-updated')))
  await page.waitForTimeout(700)
  assert.equal((await page.evaluate(() => window.desktop.billing.status())).trial.active, true)
  await page.click('[data-view="dashboard"]')
  await page.getByRole('heading',{name:'Insights / Reports',exact:true}).first().click()
  await page.getByRole('heading',{name:'Insights / Reports',exact:true}).last().waitFor()
  await page.screenshot({path:join(directory,'reports.png')})
  await page.getByRole('button',{name:'Close dialog',exact:true}).click()
  await page.click('[data-view="maps"]')
  // A slow online billing refresh must not hold up the local choice dialog.
  await desktop.evaluate(({ipcMain}) => {
    globalThis.__qaBillingStatus = ipcMain._invokeHandlers.get('billing:status')
    globalThis.__qaChoiceStatusCalls = 0
    ipcMain.removeHandler('billing:status')
    ipcMain.handle('billing:status', async (...args) => {
      globalThis.__qaChoiceStatusCalls++
      await new Promise(resolve => setTimeout(resolve, 1800))
      return globalThis.__qaBillingStatus(...args)
    })
  })
  await page.getByRole('button',{name:'Run with filters',exact:true}).click()
  await page.getByRole('heading',{name:'Choose how to open Google Maps'}).waitFor({timeout:1000})
  assert.equal(await desktop.evaluate(()=>globalThis.__qaChoiceStatusCalls),0)
  await desktop.evaluate(({ipcMain}) => {
    ipcMain.removeHandler('billing:status')
    ipcMain.handle('billing:status', globalThis.__qaBillingStatus)
  })
  assert.ok(await page.getByRole('button',{name:'Continue without sign-in'}).isVisible())
  const browserChoice=page.getByRole('checkbox',{name:/Show the browser window/})
  assert.equal(await browserChoice.isChecked(),true)
  assert.equal(await page.getByText('Show the browser window',{exact:true}).count(),1)
  await browserChoice.uncheck()
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('ls-scraper-settings')).visible),false)
  await page.getByRole('button',{name:'Close dialog',exact:true}).click()
  await page.getByRole('button',{name:'Run with filters',exact:true}).click()
  assert.equal(await browserChoice.isChecked(),false)
  await browserChoice.check()
  await page.screenshot({path:join(directory,'google-choice.png')})
  // Capture the actual IPC payload while keeping this UI audit offline.
  await desktop.evaluate(({ipcMain}) => {
    globalThis.__qaGoogleRun = ipcMain._invokeHandlers.get('scraper:runWithGoogle')
    ipcMain.removeHandler('scraper:runWithGoogle')
    ipcMain.handle('scraper:runWithGoogle', (_event, request) => {
      globalThis.__qaGoogleRequest = request
      return {runId:'qa-choice'}
    })
  })
  await page.getByRole('button',{name:'Sign in with Google',exact:true}).click()
  await page.getByRole('button',{name:'Minimize · keep scanning'}).waitFor()
  const googleRequest=await desktop.evaluate(()=>globalThis.__qaGoogleRequest)
  assert.equal(googleRequest.query.headless,false)
  assert.equal(googleRequest.query.savedProfile,true)
  await page.getByRole('button',{name:'Minimize · keep scanning'}).click()
  await page.locator('[data-scan-return]').waitFor()
  await page.click('[data-view="social"]')
  await page.screenshot({path:join(directory,'back-to-scan.png')})
  await page.locator('[data-scan-return]').click()
  await page.getByRole('button',{name:'Minimize · keep scanning'}).waitFor()
  await page.getByRole('button',{name:'Stop',exact:true}).click()
  await page.getByRole('button',{name:'Yes, stop scan'}).click()
  await desktop.evaluate(({ipcMain}) => {
    ipcMain.removeHandler('scraper:runWithGoogle')
    ipcMain.handle('scraper:runWithGoogle',globalThis.__qaGoogleRun)
  })
  console.log('PASS immediate Maps choice without billing round-trip; visible browser default and persisted opt-out; Google visible-run IPC; return to minimized scan from another page')
  await page.getByRole('button',{name:'Run with filters',exact:true}).click()
  await browserChoice.uncheck()
  await desktop.evaluate(({ipcMain}) => {
    globalThis.__qaGuestRun = ipcMain._invokeHandlers.get('scraper:start')
    ipcMain.removeHandler('scraper:start')
    ipcMain.handle('scraper:start', (_event,request) => {
      globalThis.__qaGuestRequest=request
      return {runId:'qa-guest'}
    })
  })
  await page.getByRole('button',{name:'Continue without sign-in'}).click()
  await page.getByRole('button',{name:'Minimize · keep scanning'}).waitFor()
  const guestRequest=await desktop.evaluate(()=>globalThis.__qaGuestRequest)
  assert.equal(guestRequest.query.headless,true)
  assert.equal(guestRequest.query.savedProfile,false)
  await page.getByRole('button',{name:'Stop',exact:true}).click()
  await page.getByRole('button',{name:'Yes, stop scan'}).click()
  await desktop.evaluate(({ipcMain}) => {
    ipcMain.removeHandler('scraper:start')
    ipcMain.handle('scraper:start',globalThis.__qaGuestRun)
  })
  await page.getByRole('button',{name:'Run with filters',exact:true}).click()
  await browserChoice.check()
  await page.getByRole('button',{name:'Close dialog',exact:true}).click()
  console.log('PASS guest scan honours background-window choice and uses a private profile')
  await page.click('[data-assist="1"]')
  await page.locator('[data-chatinput="1"]').fill('How do I import a website?')
  await page.locator('[data-chatinput="1"]').press('Enter')
  await page.locator('[data-msg="bot"]').filter({ hasText: 'Audit AI ready' }).waitFor({ timeout: 15000 })
  assert.equal(providerRequests.length, 1)
  assert.ok(providerRequests[0].messages.some(message => message.content.includes('serverBilling')))
  await page.getByRole('button', { name: 'Close chat', exact: true }).click()
  console.log('PASS server AI: desktop → authenticated local server → mocked provider → chat answer')

  for (const view of ['social', 'email', 'phone', 'website']) {
    await page.click(`[data-view="${view}"]`)
    if(view==='website') {
      await page.getByLabel('Websites to look up').fill(`${view}.fixture.test`)
      await page.getByRole('button',{name:'Start lookup',exact:true}).click()
    } else {
      await page.getByRole('button', { name: 'Import websites', exact: true }).first().click()
      await page.locator('[data-imptext="1"]').fill(`${view}.fixture.test`)
      await page.locator('[data-socimpgo="1"]').click()
      await page.locator('[data-impmodal="1"]').waitFor({ state: 'hidden' })
    }
    if (view === 'social') {
      await page.locator('[data-soclist] a[data-social-profile-link*="123456789"]').waitFor({ timeout: 30000 })
      await page.locator('[data-soclist] a[data-social-profile-link*="auditclinic"]').waitFor()
    } else if (view !== 'website') {
      const expected = view === 'email' ? 'hello@audit.fixture.test' : '+922112345678'
      await page.locator(`[data-fres="${view}"]`).locator('xpath=ancestor::section[1]').getByText(expected, { exact: false }).first().waitFor({ timeout: 30000 })
    }
    console.log(`PASS ${view} website import and published results`)
  }
  await page.waitForFunction(async () => { const jobs = await window.desktop.local.jobs.totals(); return jobs.queued === 0 && jobs.running === 0 }, null, { timeout: 60000 })
  for (const view of ['email','phone']) {
    await page.click(`[data-view="${view}"]`)
    const percentages=Array.from((await page.locator('body').innerText()).matchAll(/(\d+)%/g),m=>Number(m[1]))
    assert.ok(percentages.every(value=>value>=0 && value<=100))
  }
  console.log('PASS Email and Phone Finder percentages stay between 0 and 100')
  const stored = await page.evaluate(() => window.desktop.local.leads.list({ limit: 200 }))
  assert.equal(stored.total, 4)
  const duplicate = await page.evaluate(() => window.desktop.local.imports.websites(['social.fixture.test']))
  assert.equal(duplicate.added, 0)
  console.log('PASS duplicate import keeps one stored business')

  const leadId = stored.rows[0].id
  await page.evaluate(id => window.desktop.local.leads.bookmark(id, true), leadId)
  await page.click('[data-view="lists"]')
  assert.equal(await page.getByRole('button', { name: /Manchester Physio|Skin & Derma|Salford & Quays/ }).count(), 0)
  await page.getByLabel('New list name').fill('Audit saved list')
  await page.getByRole('button', { name: /^Save \d+ leads?/ }).first().click()
  await page.getByRole('heading', { name: 'Audit saved list', exact: true }).waitFor()
  const listId = (await page.evaluate(() => window.desktop.local.lists.list())).find(list => list.name === 'Audit saved list').id
  const listMembers = await page.evaluate(id => window.desktop.local.lists.members(id), listId)
  assert.ok(listMembers.length > 0)
  await page.getByRole('button', { name: /^Save \d+ leads?/ }).first().click()
  assert.deepEqual(await page.evaluate(id => window.desktop.local.lists.members(id), listId), listMembers)
  console.log('PASS bookmark, named list created through UI, real destination counts and duplicate-safe saving')

  // Use real trial accounting and runner with the offline provider, across three area keywords.
  await page.evaluate(() => { window.__auditDone = ''; window.desktop.scraper.onDone(summary => { window.__auditDone = summary.runId }) })
  const run = await page.evaluate(() => window.desktop.scraper.start({ provider: 'mock', query: { keywords: ['dentist Clifton', 'clinic DHA', 'dentist Saddar'], location: 'Karachi', maxResultsPerKeyword: 20, maxResultsTotal: 20 } }))
  await page.waitForFunction(id => window.__auditDone === id, run.runId, { timeout: 20000 })
  const last = await page.evaluate(() => window.desktop.scraper.last())
  assert.equal(last.leads.length, 20); assert.equal(last.query.region, 'pk')
  assert.equal((await page.evaluate(() => window.desktop.billing.status())).mapsLeads.used, 20)
  await page.click('[data-view="runs"]')
  assert.ok((await page.evaluate(() => window.desktop.local.runs.list())).length >= 1)
  console.log('PASS Karachi/three-area run captures and charges exactly 20 leads, persists history')
  await page.click('[data-view="maps"]')
  const runs=await page.evaluate(()=>window.desktop.local.runs.list())
  await page.getByLabel('Search / Run history').selectOption(runs[0].id)
  await page.waitForFunction(()=>document.querySelectorAll('[data-maps-results-table] tbody tr').length===20)
  assert.equal(await page.locator('[data-results]').evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length),1)
  assert.ok(await page.locator('[data-coverage-activity] [data-live-activity]').count())
  await page.screenshot({path:join(directory,'maps-results.png'),fullPage:true})
  const selectors=page.getByLabel('Website status',{exact:true})
  await selectors.first().selectOption('none')
  assert.ok((await page.locator('[data-maps-results-table] tbody').innerText()).includes('No website') || await page.locator('[data-maps-results-table] tbody tr').count()===0)
  assert.equal(await page.locator('[data-maps-results-table] tbody a').count(),0)
  await selectors.first().selectOption('any')
  await page.getByLabel('Select all results',{exact:true}).check()
  await page.getByLabel('Send selected leads to').selectOption('email')
  await page.locator('[data-imptext="1"]').waitFor()
  assert.ok((await page.locator('[data-imptext="1"]').inputValue()).length>5)
  await page.getByLabel('Import website CSV').setInputFiles({name:'leads.csv',mimeType:'text/csv',buffer:Buffer.from('Company,Website,Email\nFixture,https://csv.fixture.test,contact@ignored.test')})
  await page.waitForFunction(()=>document.querySelector('[data-imptext="1"]')?.value==='https://csv.fixture.test')
  await page.keyboard.press('Escape')
  await page.click('[data-view="maps"]')
  await page.locator('[data-results]').getByRole('button',{name:'Export',exact:true}).click()
  await page.screenshot({path:join(directory,'simple-export.png')})
  await desktop.evaluate(({dialog})=>{globalThis.__qaSave=false;dialog.showSaveDialog=async()=>{globalThis.__qaSave=true;return {canceled:true}}})
  await page.locator('[data-export-format="xlsx"]').click()
  for(let i=0;i<50 && !await desktop.evaluate(()=>globalThis.__qaSave);i++)await page.waitForTimeout(100)
  assert.equal(await desktop.evaluate(()=>globalThis.__qaSave),true)
  assert.ok(await page.locator('[data-export-format="xlsx"]').isVisible())
  const savedPath=join(directory,'maps-ui-export.xlsx')
  await desktop.evaluate(({dialog},filePath)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath})},savedPath)
  await page.locator('[data-export-format="xlsx"]').click()
  await page.waitForFunction(()=>!document.querySelector('[data-export-format="xlsx"]'))
  assert.ok(existsSync(savedPath))
  const savedWorkbook=new ExcelJS.Workbook()
  await savedWorkbook.xlsx.readFile(savedPath)
  assert.ok(JSON.stringify(savedWorkbook.worksheets[0].getSheetValues()).includes('Karachi'))
  await page.click('[data-view="dashboard"]')
  await page.locator('[data-notifications-button="1"]').click()
  await page.locator('[data-notification]').filter({hasText:'Maps scrape complete'}).first().click()
  await page.getByLabel('Search / Run history').waitFor()
  await page.waitForFunction(id=>document.querySelector('[aria-label="Search / Run history"]')?.value===id,runs[0].id,{timeout:5000})
  await page.waitForFunction(()=>document.querySelectorAll('[data-maps-results-table] tbody tr').length===20)
  // Exercise progress controls without contacting Google.
  await desktop.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].webContents.send('scraper:progress',{runId:'qa-ui',status:'running',found:0,target:20,message:'Reading places',keyword:'clinic',at:new Date().toISOString()}))
  await page.getByRole('button',{name:'Minimize · keep scanning'}).click()
  await page.locator('[data-scan-return]').click()
  await page.getByRole('button',{name:'Stop',exact:true}).click()
  await page.getByRole('heading',{name:'Stop this scan?'}).waitFor()
  await page.getByRole('button',{name:'Keep scanning',exact:true}).click()
  await page.getByRole('button',{name:'Stop',exact:true}).click()
  await page.getByRole('button',{name:'Yes, stop scan'}).click()
  console.log('PASS run-scoped results, full-width layout, website filter, Send to, CSV file import, real export button Save As/cancel/save, minimize and stop confirmation')


  for (const format of ['csv', 'xlsx', 'pdf']) {
    const file = join(directory, `audit.${format}`)
    await desktop.evaluate(({ dialog }, filePath) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath }) }, file)
    const result = await page.evaluate(format => window.desktop.local.exports.write({ kind: 'leads', limit: 200, delimiter: ',', columns: ['Business name', 'Domain', 'Phone', 'Email'], fileName: 'audit', format }), format)
    assert.equal(result.rows, 24); assert.ok(existsSync(file))
    if (format === 'csv') assert.ok(readFileSync(file, 'utf8').includes('fixture.test'))
    if (format === 'xlsx') { const book = new ExcelJS.Workbook(); await book.xlsx.readFile(file); assert.equal(book.worksheets[0].getCell('A1').value, 'mamalead') }
    if (format === 'pdf') assert.ok((await PDFDocument.load(readFileSync(file))).getPageCount() >= 1)
  }
  console.log('PASS CSV, Excel and PDF contain all 24 stored businesses')
  // Social export UI uses its own format chooser and must preserve results when save is cancelled.
  await page.click('[data-view="social"]')
  const exportButton = page.locator('[data-profcard]').locator('xpath=ancestor::section[1]').getByRole('button', { name: 'Export', exact: true })
  await exportButton.click()
  await desktop.evaluate(({ dialog }) => { globalThis.__auditCancelSeen = false; dialog.showSaveDialog = async () => { globalThis.__auditCancelSeen = true; return { canceled: true } } })
  await page.locator('[data-profile-export="xlsx"]').click()
  for (let i = 0; i < 100 && !await desktop.evaluate(() => globalThis.__auditCancelSeen); i++) await page.waitForTimeout(100)
  assert.equal(await desktop.evaluate(() => globalThis.__auditCancelSeen), true)
  await page.waitForTimeout(200)
  assert.equal(await page.locator('[data-profile-export="xlsx"]').isVisible(), true)
  for (const format of ['xlsx', 'pdf']) {
    const file = join(directory, `social.${format}`)
    await desktop.evaluate(({ dialog }, filePath) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath }) }, file)
    await page.locator(`[data-profile-export="${format}"]`).click()
    for (let i = 0; i < 100 && !existsSync(file); i++) await page.waitForTimeout(100)
    assert.ok(existsSync(file))
    await page.locator('[data-profile-export-backdrop]').waitFor({ state: 'hidden' })
    if (format === 'xlsx') await exportButton.click()
  }
  console.log('PASS Social Profiles Excel/PDF downloads and cancelled-save handling')
  await pages('populated workspace')
  await page.click('[data-view="dashboard"]')
  await page.screenshot({ path: join(directory, 'dashboard.png') })
  await page.click('[data-view="maps"]')
  await page.screenshot({ path: join(directory, 'maps.png') })
  await desktop.close(); desktop = null
  await launch()
  assert.equal((await page.evaluate(() => window.desktop.local.leads.list())).total, 24)
  assert.equal((await page.evaluate(() => window.desktop.local.exports.list())).length, 6)
  assert.deepEqual(await page.evaluate(id => window.desktop.local.lists.members(id), listId), listMembers)
  assert.equal((await page.evaluate(() => window.desktop.billing.status())).trial.active, true)
  console.log('PASS restart retains leads, list, export history and trial activation')
  await page.evaluate(async ({ listId, leadId }) => { await window.desktop.local.lists.removeLead(listId, leadId); await window.desktop.local.lists.remove(listId) }, { listId, leadId })
  assert.ok(!(await page.evaluate(() => window.desktop.local.lists.list())).some(list => list.id === listId))
  if (!packaged) {
    const contacts = await page.evaluate(async leadId => {
      const ids = []
      for (let i = 0; i < 10; i++) ids.push((await window.desktop.local.contacts.upsert({ leadId, kind: 'email', value: `audit${i}@fixture.test`, source: 'test' })).id)
      return ids
    }, leadId)
    await page.click('[data-view="email"]')
    await page.evaluate(() => window.desktop.test.mockSlowEmailValidity())
    await page.evaluate(ids => { window.__verification = window.desktop.emailValidity.verify({ contactIds: ids }) }, contacts)
    for (let i = 0; i < 100 && (await page.evaluate(() => window.desktop.emailValidity.status())).progress.checked < 1; i++) await page.waitForTimeout(50)
    await page.locator('[data-email-validity-cancel="1"]').click()
    const stopped = await page.evaluate(() => window.__verification)
    assert.equal(stopped.cancelled, true)
    assert.ok(stopped.checked > 0 && stopped.checked < 10)
    await page.evaluate(() => window.desktop.test.mockOneEmailValidity())
    const resumed = await page.evaluate(ids => window.desktop.emailValidity.verify({ contactIds: ids }), contacts)
    assert.equal(resumed.checked, 10 - stopped.checked)
    console.log('PASS email verification progress, cancellation, saved partial results and resume')
  }
  await page.click('[data-view="dashboard"]')
  const reportLeadIds=(await page.evaluate(()=>window.desktop.local.leads.list())).rows.slice(0,2).map(lead=>lead.id)
  const reportPeople=await page.evaluate(async ids=>{
    const result=[]
    for(const [index,name] of ['Sarah Miller','Robert Hayes','Nadia Khan'].entries()) result.push((await window.desktop.local.people.add({leadId:ids[index===2?1:0],fullName:name,title:'Director'})).id)
    await window.desktop.local.people.add({leadId:ids[0],fullName:'Sarah Miller',title:'Director'})
    return result
  },reportLeadIds)
  await page.locator('[data-reports-card] [data-lottie]').click()
  await page.locator('[data-report-stat="Decision Makers found"] [data-report-value]').filter({hasText:/^3$/}).waitFor()
  assert.equal(await page.locator('[data-report-stat="Total saved leads"] [data-report-value]').innerText(),'24')
  assert.equal((await page.evaluate(()=>window.desktop.local.dashboard())).decisionMakers,2)
  const extraPerson=await page.evaluate(id=>window.desktop.local.people.add({leadId:id,fullName:'Omar Shah',title:'Partner'}),reportLeadIds[0])
  await page.getByRole('button',{name:'Refresh report',exact:true}).click()
  await page.locator('[data-report-stat="Decision Makers found"] [data-report-value]').filter({hasText:/^4$/}).waitFor()
  await page.screenshot({path:join(directory,'reports-populated.png')})
  await page.getByRole('button',{name:'Close dialog',exact:true}).click()
  await page.click('[data-view="social"]')
  await page.locator('[data-reports-card]').focus()
  await page.keyboard.press('Space')
  await page.locator('[data-report-stat="Decision Makers found"] [data-report-value]').filter({hasText:/^4$/}).waitFor()
  await page.getByRole('button',{name:'Close dialog',exact:true}).click()
  await page.evaluate(async ids=>{for(const id of ids)await window.desktop.local.people.remove(id)},[...reportPeople,extraPerson.id])
  console.log('PASS full Insights card mouse/keyboard on Dashboard and Social; 24 leads, 3 people across 2 businesses, duplicate-safe count and refresh to 4')
  if (process.env.NAFRAN_TEST_MAPS_WINDOWS === '1') {
    await page.click('[data-view="maps"]')
    await verifyMapsWindow(desktop,page)
    await page.getByRole('button',{name:'Minimize · keep scanning'}).waitFor({state:'hidden'})
  }
  service.db.prepare('update trial_licenses set revoked_at = ?').run(new Date().toISOString())
  const revoked = await page.evaluate(() => window.desktop.scraper.start({ provider: 'mock', query: { keywords: ['clinic'], maxResultsTotal: 1 } }).then(() => 'unexpected success').catch(error => error.message))
  assert.match(revoked, /Activate an active 1-day trial or lifetime/)
  await page.evaluate(() => window.dispatchEvent(new Event('nafran:billing-updated')))
  await page.waitForTimeout(700)
  await page.click('[data-view="social"]')
  await page.getByRole('button',{name:'Import websites',exact:true}).first().click()
  await page.getByRole('heading',{name:'Choose your MamaLead access'}).waitFor()
  assert.equal(await page.locator('[data-impmodal]').count(),0)
  await page.getByRole('button',{name:'Close dialog',exact:true}).click()
  console.log('PASS revocation restores the shared access prompt without restarting')
  console.log('PASS revoked test licence blocks a new scrape')
  // Exercise UI entitlement variants without issuing a payment or starting paid work.
  const baseStatus = await page.evaluate(() => window.desktop.billing.status())
  await desktop.evaluate(() => { globalThis.accessAuditFetch = globalThis.fetch })
  async function showStatus(status) {
    await desktop.evaluate((_, status) => {
      globalThis.fetch = async (input, init) => new URL(String(input)).pathname === '/v1/status'
        ? Response.json(status) : globalThis.accessAuditFetch(input, init)
    }, status)
    await page.evaluate(() => window.dispatchEvent(new Event('nafran:billing-updated')))
    await page.waitForTimeout(700)
  }
  await showStatus({ ...baseStatus, connected:true, coreLicenseActive:true, decisionKeyActive:false,
    license:{active:true,kind:'trial'}, lifetime:{...baseStatus.lifetime,active:false},
    trial:{active:true,expiresAt:new Date(Date.now()-60000).toISOString()} })
  await page.getByRole('button',{name:'Import websites',exact:true}).first().click()
  await page.getByRole('heading',{name:'Choose your MamaLead access'}).waitFor()
  await page.getByRole('button',{name:'Close dialog',exact:true}).click()
  await showStatus({ ...baseStatus, connected:true, coreLicenseActive:false, decisionKeyActive:true,
    license:{active:true,kind:'decision'}, lifetime:{...baseStatus.lifetime,active:false}, trial:{active:false,expiresAt:null},
    decisionMaker:{...baseStatus.decisionMaker,active:true,monthlyRemaining:500,renewsAt:new Date(Date.now()+86400000).toISOString()} })
  await page.click('[data-view="dm"]')
  await page.getByRole('button',{name:'Import websites',exact:true}).first().click()
  await page.locator('[data-impmodal]').waitFor()
  await page.locator('[data-impmodal]').getByRole('button',{name:'Cancel',exact:true}).click()
  await page.click('[data-view="social"]')
  await page.getByRole('button',{name:'Import websites',exact:true}).first().click()
  await page.getByRole('heading',{name:'Choose your MamaLead access'}).waitFor()
  await page.getByRole('button',{name:'Close dialog',exact:true}).click()
  await desktop.evaluate(() => { globalThis.fetch = globalThis.accessAuditFetch; delete globalThis.accessAuditFetch })
  console.log('PASS expired trial is blocked; active Decision Makers pass opens only its module')
  assert.deepEqual(errors, [])
  console.log(`PASS ${packaged ? 'packaged' : 'development'} audit: no renderer errors. Artifacts: ${directory}`)
} catch (error) {
  if (page) { console.error((await page.locator('body').innerText()).slice(-2500)); await page.screenshot({ path: join(directory, 'failure.png') }).catch(() => {}) }
  throw error
} finally {
  if (desktop) await desktop.close()
  service.close(); fixture.close(); globalThis.fetch = nativeFetch
}
