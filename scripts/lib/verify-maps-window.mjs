import assert from 'node:assert/strict'

// Real browser windows with local HTML fixtures; no Google credentials or requests.
export async function verifyMapsWindow(desktop, page) {
  await desktop.evaluate(({app}) => {
    const require = process.getBuiltinModule('module').createRequire(app.getAppPath() + '/package.json')
    const {chromium} = require('playwright')
    const original = chromium.launchPersistentContext.bind(chromium)
    globalThis.__windowAudit = { launches: [], restore: () => {chromium.launchPersistentContext=original} }
    chromium.launchPersistentContext = async (dir, options) => {
      const context = await original(dir, options)
      await context.route('**/*', route => route.fulfill({contentType:'text/html',body:'<html><body><h1>Google fixture</h1><div role="feed"></div><p>No results found</p></body></html>'}))
      globalThis.__windowAudit.launches.push({headless:options.headless,dir})
      return context
    }
  })
  try {
    await page.evaluate(() => {
      window.__windowGate = window.desktop.scraper.runWithGoogle({provider:'chromium-maps',query:{keywords:['fixture'],location:'Karachi',maxResultsTotal:1,headless:false}}).catch(e=>e.message)
    })
    let gate
    for(let i=0;i<120;i++) {
      gate=await desktop.evaluate(()=>globalThis.__leadsnapTest.browser())
      if(gate.open && gate.pages.some(url=>url.includes('accounts.google.com'))) break
      await page.waitForTimeout(100)
    }
    assert.ok(gate.open && gate.pages.some(url=>url.includes('accounts.google.com')),'Google sign-in opens a real visible browser')
    assert.equal((await desktop.evaluate(()=>globalThis.__windowAudit.launches)).at(-1).headless,false)
    assert.equal(await desktop.evaluate(()=>globalThis.__leadsnapTest.stage().busy),false,'No scan starts before sign-in')
    await desktop.evaluate(()=>globalThis.__leadsnapTest.closeBrowser())
    assert.match(await page.evaluate(()=>window.__windowGate),/closed|Cancelled/)
    assert.equal(await page.evaluate(()=>window.desktop.test.seedGoogleSession()),true)
    const count=await desktop.evaluate(()=>globalThis.__windowAudit.launches.length)
    await page.evaluate(()=>window.desktop.scraper.runWithGoogle({provider:'chromium-maps',query:{keywords:['fixture'],location:'Karachi',maxResultsTotal:1,headless:false}}))
    for(let i=0;i<120 && await desktop.evaluate(()=>globalThis.__windowAudit.launches.length)===count;i++) await page.waitForTimeout(100)
    const launches=await desktop.evaluate(()=>globalThis.__windowAudit.launches)
    assert.ok(launches.length>count,'Saved account scan launches its browser')
    assert.equal(launches.at(-1).headless,false,'Saved account does not override visible-window choice')
    await page.evaluate(()=>window.desktop.scraper.stop())
    for(let i=0;i<150 && await desktop.evaluate(()=>globalThis.__leadsnapTest.stage().busy);i++) await page.waitForTimeout(100)
    assert.equal(await desktop.evaluate(()=>globalThis.__leadsnapTest.stage().busy),false)
    console.log('PASS real Chromium windows: fresh Google sign-in waits; closing cancels; saved account scan opens headed browser. All pages are local fixtures.')
  } finally {
    await desktop.evaluate(()=>globalThis.__windowAudit.restore())
  }
}
