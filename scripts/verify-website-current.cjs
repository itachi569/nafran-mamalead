const path=require('node:path'),fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),{chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),out=path.resolve(root,'../../outputs/MamaLead-website-1.4.19');fs.mkdirSync(out,{recursive:true});
const url=process.env.MAMALEAD_SITE_PREVIEW||'http://127.0.0.1:8798/';
(async()=>{
 const raw=fs.readFileSync(path.join(root,'website/index.html'),'utf8');
 const data=vm.runInNewContext(raw.slice(raw.indexOf('const MODULES ='),raw.indexOf('class Component extends'))+';({MODULES,FAQS,HERO})');
 const retired=/Decision Makers?|owner[- ]emails?|owner records|named owners|\/subscribe\/|Search-indexed email/i;
 for(const name of ['index.html','privacy.html','sales.js'])assert.doesNotMatch(fs.readFileSync(path.join(root,'website',name),'utf8'),retired,'Retired content in '+name);
 const refs=[...new Set([...raw.matchAll(/(?:src="|"src": ")(img\/app\/[^"\s]+)/g)].map(m=>m[1]))];
 for(const ref of refs){assert.ok(ref.includes('/v1.4.19/'),'Stale screenshot '+ref);assert.ok(fs.existsSync(path.join(root,'website',ref)),'Missing '+ref)}
 assert.equal(data.MODULES.length,8);
 for(const name of ['Dashboard & Reports','Google Maps Scraper','Social Profiles','Email Finder','Phone Finder','Website Lookup','All Leads, Saved Lists & Run History','Settings & Billing'])assert.ok(data.MODULES.some(m=>m.name===name),'Missing '+name);
 for(const phrase of ['one main email','Verify found emails On or Off','Stop checking','Stop scan keeps completed results','Repeated links to the same profile are merged','500 websites','CSV/TSV','Automatic updates','Click anywhere on an unread','Roman Urdu','300 Google Maps leads','Rs 10,000'])assert.ok(raw.includes(phrase),'Missing current feature: '+phrase);
 const browser=await chromium.launch({headless:true,executablePath:path.join(root,'.playwright-browsers/chromium-1243/chrome-win64/chrome.exe')});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],httpErrors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});page.on('response',r=>{if(r.url().startsWith(url)&&r.status()>=400)httpErrors.push(r.status()+' '+r.url())});
  await page.goto(url,{waitUntil:'domcontentloaded'});await page.locator('#modules button').first().waitFor();await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(800);
  const decoded=await page.evaluate(async urls=>Promise.all(urls.map(async src=>{const i=new Image();i.src=src;await i.decode();return{src,width:i.naturalWidth,height:i.naturalHeight}})),refs);
  for(const s of ['header [data-brand-logo]','footer [data-footer-brand-logo]'])assert.ok(await page.locator(s).evaluate(i=>i.complete&&i.naturalWidth>0),'Broken logo');
  assert.doesNotMatch(await page.locator('body').innerText(),retired);
  assert.doesNotMatch(await page.locator('body').innerText(),/\bMac\b|Apple Silicon|\bMembers\b|Welcome to MamaLead/);
  assert.equal(await page.locator('span').filter({hasText:/^L$/}).count(),0);
  assert.equal(await page.locator('[data-public-download="windows"]').getAttribute('href'),'https://api.mamalead.com/v1/download?platform=windows');
  const moduleChecks=[];
  for(let n=0;n<data.MODULES.length;n++){
   const m=data.MODULES[n];await page.locator('#modules button').nth(n).click();const dialog=page.getByRole('dialog',{name:m.name,exact:true});await dialog.waitFor();
   const text=await dialog.innerText();for(const line of m.bullets)assert.ok(text.includes(line),'Missing description '+m.name);
   for(const shot of m.shots){if(m.shots.length>1)await dialog.getByRole('button',{name:shot.label,exact:true}).click();assert.ok((await dialog.locator('div[role="img"]').evaluate(e=>getComputedStyle(e).backgroundImage)).includes(shot.src),'Wrong gallery image');}
   if(m.name==='Email Finder'){await dialog.getByRole('button',{name:'Main email results',exact:true}).click();await dialog.screenshot({path:path.join(out,'email-module.png')})}
   await page.keyboard.press('Escape');await dialog.waitFor({state:'detached'});moduleChecks.push(m.name);
  }
  for(const [n,name] of ['Google Maps Scraper','Email Finder','All Leads, Saved Lists & Run History'].entries()){
   await page.locator('#how button').nth(n).click();await page.getByRole('dialog',{name,exact:true}).waitFor();await page.keyboard.press('Escape');
  }
  const ctas=await page.locator('#pricing .pricing-action').evaluateAll(els=>els.map(e=>{const b=e.getBoundingClientRect();return{top:b.top,height:b.height,text:e.textContent}}));
  assert.equal(ctas.length,2);assert.ok(Math.abs(ctas[0].top-ctas[1].top)<2,'Pricing buttons not aligned');assert.equal(ctas[0].height,ctas[1].height);
  for(const [selector,file] of [['#top','hero-desktop'],['#latest','latest-desktop'],['#modules','modules-desktop'],['#pricing','pricing-desktop'],['.latest-assist','assist'],['footer','footer']])await page.locator(selector).screenshot({path:path.join(out,file+'.png')});
  for(const width of [1440,768,390]){
   await page.setViewportSize({width,height:1000});await page.evaluate(()=>window.scrollTo(0,0));await page.waitForTimeout(150);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Page overflow '+width);
   const faq=page.locator('#faq').getByRole('button',{name:'Which phone number appears first?',exact:true});await faq.click();await page.waitForTimeout(600);const answer=faq.locator('..').locator('p');assert.ok(await answer.evaluate(e=>e.offsetHeight<=e.parentElement.clientHeight+1),'FAQ clipped');await faq.click();
   if(width!==1440){await page.locator('#pricing').screenshot({path:path.join(out,'pricing-'+width+'.png')});await page.locator('#modules').screenshot({path:path.join(out,'modules-'+width+'.png')});}
   if(width===390){await page.locator('#modules button').nth(3).click();const d=page.getByRole('dialog',{name:'Email Finder',exact:true});await d.waitFor();await d.getByRole('button',{name:'Scan progress',exact:true}).click();assert.ok(await d.evaluate(e=>e.scrollWidth<=e.clientWidth+1),'Mobile dialog overflow');await d.screenshot({path:path.join(out,'email-module-mobile.png')});await page.keyboard.press('Escape');}
  }
  await page.goto(new URL('privacy.html',url).href,{waitUntil:'domcontentloaded'});assert.doesNotMatch(await page.locator('body').innerText(),retired);
  assert.deepEqual(errors,[]);assert.deepEqual(httpErrors,[]);
  const report={url,versionShown:'1.4.19',widths:[1440,768,390],modules:moduleChecks,faqs:data.FAQS.length,screenshots:decoded,pricingCtas:ctas,rendererErrors:errors,httpErrors,published:false};fs.writeFileSync(path.join(out,'check.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:true,modules:moduleChecks.length,screenshots:decoded.length,faqs:data.FAQS.length,widths:report.widths,rendererErrors:errors,httpErrors,published:false}));
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
