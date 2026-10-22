// Isolated search-bar checks; no network scans or customer records are used.
const assert = require('node:assert/strict')
const { mkdtempSync, mkdirSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join, resolve } = require('node:path')
const { _electron } = require('playwright')
const { LocalDatabase } = require('../dist-electron/db/local-db.js')
const { Repository } = require('../dist-electron/db/repository.js')

async function main() {
  const directory = mkdtempSync(join(tmpdir(), 'mamalead-search-'))
  const userData = join(directory, 'profile')
  mkdirSync(userData)
  const db = new LocalDatabase(join(userData, 'leads.db'))
  const workspace = db.ensureWorkspace()
  const repo = new Repository(db)
  const at = new Date().toISOString()
  for (const [id, name, host, phone, area, email, handle] of [
    ['one','Cedar Dental','alpha.fixture.test','+92 21 1234 5678','Clifton Karachi','contact@alpha.fixture.test','cedarclinic'],
    ['two','Maple Studio','beta.fixture.test','+92 42 9876 5432','Gulberg Lahore','hello@beta.fixture.test','mapleteam'],
  ]) {
    db.run('insert into leads (id,workspace_id,name,website,phone,address,provider,captured_at,last_scanned_at) values (?,?,?,?,?,?,?,?,?)',
      [id,workspace.id,name,`https://${host}`,phone,area,'import',at,at])
    repo.upsertContact({leadId:id,kind:'email',value:email,source:`https://${host}/contact`,verified:false})
    repo.upsertSocialProfile({workspaceId:workspace.id,leadId:id,platform:'instagram',handle,profileUrl:`https://www.instagram.com/${handle}/`})
  }
  db.close()
  const env = {...process.env, APPDATA:join(directory,'appdata')}
  delete env.ELECTRON_RUN_AS_NODE
  const packaged = process.env.NAFRAN_TEST_PACKAGED === '1'
  const app = await _electron.launch(packaged
    ? {executablePath:resolve('release/win-unpacked/MamaLead.exe'),args:[`--user-data-dir=${userData}`],env}
    : {args:['.',`--user-data-dir=${userData}`],cwd:process.cwd(),env})
  try {
    const page = await app.firstWindow()
    const errors=[]; page.on('pageerror',e=>errors.push(e.message))
    await page.waitForSelector('[data-view="social"]')
    for (const [view,selector,terms] of [
      ['social','[data-socq]', ['Cedar Dental','alpha.fixture.test','cedarclinic','https://www.instagram.com/cedarclinic/']],
      ['email','[data-fq="email"]', ['Cedar Dental','alpha.fixture.test','contact@alpha.fixture.test']],
      ['phone','[data-fq="phone"]', ['Cedar Dental','Clifton','+92 21 1234 5678','922112345678']],
    ]) {
      await page.click(`[data-view="${view}"]`)
      const field=page.locator(selector)
      const rows=page.locator('[data-rowgrid][data-row="1"]')
      await rows.filter({hasText:'Cedar Dental'}).waitFor()
      for (const term of terms) {
        console.log(`Checking ${view}: ${term}`)
        await field.fill(term)
        await page.waitForFunction(() => document.querySelectorAll('[data-rowgrid][data-row="1"]').length === 1, null, {timeout:10000})
        assert.match(await rows.innerText(),/Cedar Dental/)
      }
      await field.fill('no-such-contact-xyz')
      await page.waitForFunction(() => document.querySelectorAll('[data-rowgrid][data-row="1"]').length === 0)
      await field.fill('')
      await page.waitForFunction(() => document.querySelectorAll('[data-rowgrid][data-row="1"]').length === 2)
      console.log(`PASS ${view}: advertised fields, no match, clear restores rows`)
    }
    assert.deepEqual(errors,[])
    console.log(`PASS ${packaged?'packaged':'development'} search bars; isolated data: ${directory}`)
  } finally { await app.close() }
}
main().catch(error=>{console.error(error);process.exitCode=1})
