// Photograph the packaged application using fictional sample data, never owner/customer data.
const { _electron } = require('playwright')
const { mkdtempSync, mkdirSync, writeFileSync } = require('node:fs')
const { join, resolve } = require('node:path')
const { tmpdir } = require('node:os')
const { LocalDatabase } = require('../dist-electron/db/local-db.js')
const { Repository } = require('../dist-electron/db/repository.js')

async function main() {
  const version = require('../package.json').version
  const output = resolve(`website/img/app/v${version}`)
  const profile = mkdtempSync(join(tmpdir(), 'mamalead-site-shots-'))
  mkdirSync(output, { recursive: true })
  const db = new LocalDatabase(join(profile, 'leads.db'))
  const workspace = db.ensureWorkspace()
  const repository = new Repository(db)
  const names = ['Cedar Dental', 'Maple Dental Studio', 'Willow Smile Clinic', 'Oak Dental Care', 'Birch Family Dental', 'Elm Dental Studio', 'Aspen Dental Care', 'Juniper Smile Clinic']
  for (let run = 0; run < 3; run++) {
    const end = new Date(Date.now() - run * 86400000)
    repository.saveRun(workspace.id, {
      provider: 'chromium', status: 'done', keywords: ['dentists'], location: 'Manchester', maxResultsPerKeyword: 8,
      detail: true, startedAt: new Date(+end - 84000).toISOString(), finishedAt: end.toISOString(), durationMs: 84000, error: null,
      leads: names.map((name, i) => ({ name: run ? `${name} ${['Central','North'][run-1]}` : name,
        category: 'Dental clinic', address: `${12+i} Sample Street, Manchester`, area: 'Manchester', postcode: 'M1',
        phone: i % 4 ? `+44 161 496 00${String(i+run*8).padStart(2,'0')}` : '',
        website: `https://clinic-${run*8+i+1}.fixture.test`, rating: 4.2+(i%4)/5, reviewCount: 15+i*9,
        latitude: 53.48 + i*.002, longitude: -2.24 + run*.006,
        placeRef: `illustrative-${run}-${i}`, query: 'dentists Manchester', keyword: 'dentists',
      })),
    })
  }
  const leads = repository.listLeads(workspace.id, {limit:100}).rows
  for (const [i, lead] of leads.entries()) {
    if (i%3) repository.upsertContact({leadId:lead.id,kind:'email',value:`hello@${new URL(lead.website).hostname}`,source:lead.website+'/contact',verified:false})
    if (i%4) repository.upsertSocialProfile({workspaceId:workspace.id,leadId:lead.id,platform:'instagram',handle:`sampleclinic${i+1}`,profileUrl:`https://www.instagram.com/sampleclinic${i+1}/`})
    if (i%2) repository.upsertSocialProfile({workspaceId:workspace.id,leadId:lead.id,platform:'facebook',handle:`sampleclinic${i+1}`,profileUrl:`https://www.facebook.com/sampleclinic${i+1}/`})
    db.run('update leads set last_scanned_at = ? where id = ?', [new Date().toISOString(),lead.id])
  }
  const list = repository.createList(workspace.id, 'Manchester dental outreach')
  repository.addLeadsToList(list.id, leads.slice(0,8).map(lead=>lead.id))
  db.close()
  const env={...process.env}; delete env.ELECTRON_RUN_AS_NODE; delete env.VITE_DEV_SERVER_URL
  const app = await _electron.launch({executablePath:resolve('release/win-unpacked/MamaLead.exe'),args:[`--user-data-dir=${profile}`],env,timeout:60000})
  const errors=[]
  try {
    const page=await app.firstWindow(); page.on('pageerror',error=>errors.push(error.message))
    await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setContentSize(1440,960))
    await page.locator('[data-view="dashboard"]').waitFor()
    await page.locator('[data-plan-welcome]').waitFor({timeout:60000})
    await page.evaluate(()=>localStorage.setItem('ls-theme','light')); await page.reload()
    await page.locator('[data-plan-welcome]').waitFor()
    await page.locator('[data-plan-welcome]').screenshot({path:join(output,'welcome.png')})
    await page.getByRole('button',{name:'Dismiss trial and Lifetime notice'}).click()
    for(const [view,file] of [['dashboard','dashboard-light'],['maps','maps-light'],['social','social'],['email','email'],['phone','phone'],['website','website'],['leads','leads'],['lists','lists'],['runs','runs'],['settings','settings']]) {
      await page.click(`[data-view="${view}"]`)
      await page.evaluate(()=>window.scrollTo(0,0)); await page.waitForTimeout(700)
      await page.screenshot({path:join(output,file+'.png')})
      console.log('Captured '+file)
      if(view==='maps') {
        await page.getByRole('heading',{name:'Results',exact:true}).scrollIntoViewIfNeeded()
        await page.waitForTimeout(500); await page.screenshot({path:join(output,'coverage-map.png')})
      }
    }
    await page.locator('.billing-offer').screenshot({path:join(output,'settings.png')})
    await page.locator('.billing-plan-grid').screenshot({path:join(output,'settings-plans.png')})
    await page.locator('[data-stab="acct"]').click(); await page.evaluate(()=>window.scrollTo(0,0)); await page.waitForTimeout(600)
    await page.locator('section[data-card]').filter({has:page.getByRole('heading',{name:'MamaLead license',exact:true})}).screenshot({path:join(output,'settings-account.png')})
    if(errors.length) throw new Error(errors.join('\n'))
    writeFileSync(join(output,'capture.json'),JSON.stringify({version,capturedAt:new Date().toISOString(),source:'Packaged Windows app',workspace:'Fictional sample data; not customer records',size:{width:1440,height:960}},null,2)+'\n')
  } finally { await app.close() }
}
main().catch(error=>{console.error(error);process.exitCode=1})
