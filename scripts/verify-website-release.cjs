const assert = require('node:assert/strict')
const { chromium } = require('playwright')
const { mkdirSync, readFileSync } = require('node:fs')
const { resolve, join } = require('node:path')
async function main() {
  const origin = process.env.SITE_CHECK_URL || 'http://127.0.0.1:8788'
  const out = resolve('../website-release-preview'); mkdirSync(out,{recursive:true})
  const browser = await chromium.launch({headless:true})
  const page = await browser.newPage({viewport:{width:1440,height:1000}})
  const errors=[]; page.on('pageerror',error=>errors.push(error.message))
  try {
    await page.goto(origin,{waitUntil:'networkidle'})
    await page.locator('[data-public-download="windows"][data-dc-tpl]').waitFor()
    const html=readFileSync('website/index.html','utf8')
    const files=[...new Set(html.match(/img\/app\/v1\.4\.14\/[\w.-]+\.png/g))]
    for(const file of files) {
      const res=await page.request.get(new URL(file,origin).href)
      assert.equal(res.status(),200,file)
      assert.match(res.headers()['content-type'],/image\/png/)
    }
    assert.equal(await page.locator('[data-public-download^="mac"]').count(),0)
    assert.equal(await page.locator('[data-public-download="windows"]').getAttribute('href'),'https://api.mamalead.com/v1/download?platform=windows')
    assert.match(await page.locator('body').innerText(),/Windows 1.4.14/)
    await page.locator('img').evaluateAll(imgs=>Promise.all(imgs.map(img=>{img.loading='eager';return img.decode()})))
    assert.equal(await page.locator('img').evaluateAll(imgs=>imgs.every(i=>i.complete && i.naturalWidth>0)),true)
    await page.screenshot({path:join(out,'desktop.png')})
    for(const name of ['pricing','download']) {
      await page.locator('#'+name).scrollIntoViewIfNeeded(); await page.waitForTimeout(800)
      await page.screenshot({path:join(out,name+'.png')})
    }
    const buttons=await page.locator('#pricing .pricing-action').evaluateAll(elements=>elements.map(el=>({top:el.getBoundingClientRect().top,bottom:el.getBoundingClientRect().bottom})))
    assert.equal(buttons.length,3)
    assert.ok(Math.max(...buttons.map(b=>b.bottom))-Math.min(...buttons.map(b=>b.bottom))<2,'pricing actions align')
    const moduleButton=page.getByRole('button',{name:'Open the Google Maps Scraper module'})
    await moduleButton.click(); await page.getByRole('dialog').getByRole('img',{name:/Light-mode Google Maps Scraper/}).waitFor()
    await page.screenshot({path:join(out,'module.png')})
    await page.keyboard.press('Escape')
    await page.setViewportSize({width:390,height:844})
    await page.goto(origin+'/#download',{waitUntil:'networkidle'})
    await page.locator('#download').scrollIntoViewIfNeeded(); await page.waitForTimeout(800)
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'no mobile horizontal overflow')
    await page.screenshot({path:join(out,'mobile.png')})
    assert.deepEqual(errors,[])
    console.log(`PASS ${files.length} latest screenshots, Windows-only download, desktop/mobile layout, pricing alignment and module modal; no renderer errors (${origin})`)
  } finally { await browser.close() }
}
main().catch(error=>{console.error(error);process.exitCode=1})
