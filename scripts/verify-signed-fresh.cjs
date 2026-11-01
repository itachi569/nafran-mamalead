// Verify the shipped binary with a new profile, without test hooks or a pre-activated licence.
const assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path'), os = require('node:os')
const { _electron } = require('playwright')
async function main() {
  const exe = process.env.MAMALEAD_TEST_EXE
  assert.ok(exe && fs.existsSync(exe), 'Set MAMALEAD_TEST_EXE to the signed executable')
  const output = process.env.MAMALEAD_QA_OUTPUT || path.join(os.tmpdir(), 'mamalead-signed-fresh')
  fs.mkdirSync(output, { recursive: true })
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'mamalead-fresh-signed-'))
  const env = { ...process.env, APPDATA: path.join(profile, 'appdata') }
  for (const key of ['ELECTRON_RUN_AS_NODE','VITE_DEV_SERVER_URL','LEADSNAP_TEST_HOOKS']) delete env[key]
  const app = await _electron.launch({executablePath:exe,args:['--user-data-dir='+profile,'--disable-backgrounding-occluded-windows','--disable-renderer-backgrounding'],env,timeout:60000})
  try {
    const page = await app.firstWindow(), errors = []
    page.on('pageerror', error => errors.push(error.message))
    page.setDefaultTimeout(20000)
    await app.evaluate(({BrowserWindow}) => { const w=BrowserWindow.getAllWindows()[0];w.webContents.setBackgroundThrottling(false) })
    await page.setViewportSize({width:1440,height:1000})
    await page.locator('#nafran-license-key').waitFor()
    assert.equal(await page.locator('#nafran-license-key').inputValue(), '')
    assert.equal(await page.getByText('Start your 1-day free trial or get Lifetime access in Settings & Billing.',{exact:true}).count(),0)
    const before = await app.evaluate(async ({app}) => {
      const req=process.getBuiltinModule('module').createRequire(app.getAppPath()+'/package.json')
      const {db}=req('./dist-electron/db/index.js').openDatabase()
      const tables=['leads','lead_contacts','social_profiles','scrape_runs','lists','list_items','enrichment_jobs','exports','import_batches','search_history','decision_makers','decision_maker_candidates','website_lookup_rows']
      const counts=Object.fromEntries(tables.map(table=>[table,db.one('select count(*) n from '+table).n]))
      const status=await req('./dist-electron/billing/client.js').billingStatus()
      return {version:app.getVersion(),packaged:app.isPackaged,counts,licenseActive:!!(status.coreLicenseActive||status.license?.active),connected:!!status.connected}
    })
    assert.equal(before.packaged,true)
    assert.equal(before.connected,true,'The production licence service must respond')
    assert.equal(before.licenseActive,false)
    for (const [table,count] of Object.entries(before.counts)) assert.equal(count,0,table+' must be empty')
    await page.screenshot({path:path.join(output,'fresh-license.png')})
    for (const view of ['dashboard','maps','social','email','phone','website','leads','lists','runs','settings']) {
      await page.locator('[data-view="'+view+'"]').dispatchEvent('click')
      await page.waitForTimeout(250)
      assert.ok((await page.locator('body').innerText()).length>300,view+' renders')
      if(view==='dashboard') {
        assert.equal(await page.getByRole('heading',{name:'Scheduled',exact:true}).count(),0,'No sample scheduled activity')
        assert.ok(!(await page.locator('body').innerText()).includes('63 pending leads'))
        await page.screenshot({path:path.join(output,'fresh-dashboard.png')})
      }
    }
    await page.locator('[data-view="social"]').dispatchEvent('click')
    await page.getByRole('button',{name:'Import websites',exact:true}).dispatchEvent('click')
    await page.locator('#nafran-license-key').waitFor()
    await page.getByText('Enter your license key first',{exact:false}).first().waitFor()
    assert.equal(await page.locator('#nafran-license-key').inputValue(),'')
    assert.equal(await page.locator('[data-view="dm"]').count(),0)
    assert.deepEqual(errors,[])
    const result={...before,profile,allPagesRender:true,unlicensedActionReturnsToKey:true,rendererErrors:errors,passed:true}
    fs.writeFileSync(path.join(output,'fresh-install.json'),JSON.stringify(result,null,2))
    console.log(JSON.stringify(result))
  } finally { await app.close() }
}
main().catch(error=>{console.error(error);process.exitCode=1})
