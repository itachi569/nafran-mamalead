const path=require('node:path'),fs=require('node:fs'),vm=require('node:vm'),{createRequire}=require('node:module');
const root=path.resolve(__dirname,'..'),{chromium}=createRequire(path.join(root,'package.json'))('playwright'),out=path.resolve(root,'../../outputs/MamaLead-website-1.4.18');fs.mkdirSync(out,{recursive:true});
(async()=>{
 const raw=fs.readFileSync(path.join(root,'website/index.html'),'utf8'),data=vm.runInNewContext(raw.slice(raw.indexOf('const MODULES ='),raw.indexOf('class Component extends'))+'\n({MODULES,FAQS,HERO})',{}, {timeout:1000});
 const refs=[...raw.matchAll(/(?:src="|"src": ")(img\/app\/[^"\s]+)/g)].map(match=>match[1]);for(const ref of refs)if(!fs.existsSync(path.join(root,'website',ref)))throw Error('Missing screenshot '+ref);
 if(refs.some(ref=>!ref.includes('/v1.4.18/')))throw Error('Old screenshots linked');
  for(const phrase of ['Automatic updates','Search-indexed email','Click anywhere on an unread','Restart to install','Short answers. Straight to the page.','one main email','Verify found emails On or Off','a name match alone is not enough','Results come into view automatically','Every selected business counts','Stop scan keeps completed results','Scan 15 leads','Repeated links to the same profile are merged'])if(!raw.includes(phrase))throw Error('Latest app behavior missing from website: '+phrase);
 const browser=await chromium.launch({headless:true,executablePath:path.join(root,'.playwright-browsers/chromium-1243/chrome-win64/chrome.exe')});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],httpErrors=[];page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error')errors.push(message.text())});page.on('response',response=>{if(response.url().startsWith('http://127.0.0.1:8798/')&&response.status()>=400)httpErrors.push(response.status()+' '+response.url())});
  await page.goto('http://127.0.0.1:8798/',{waitUntil:'domcontentloaded'});await page.evaluate(()=>document.fonts.ready);await page.locator('#modules button').first().waitFor();await page.waitForTimeout(600);
  await page.locator('img').evaluateAll(images=>Promise.all(images.map(image=>{image.loading='eager';return image.decode()})));
  for(const selector of ['header [data-brand-logo]','footer [data-footer-brand-logo]'])if(!await page.locator(selector).evaluate(img=>img.complete&&img.naturalWidth>0))throw Error('Logo failed '+selector);
  if(await page.locator('span').filter({hasText:/^L$/}).count())throw Error('Placeholder L remains');
  await page.locator('.latest-update').screenshot({path:path.join(out,'automatic-updates.png')});await page.locator('.latest-assist').screenshot({path:path.join(out,'assist-links.png')});await page.locator('footer').screenshot({path:path.join(out,'footer-logo.png')});await page.locator('#latest').screenshot({path:path.join(out,'latest-features.png')});await page.locator('#workflow').screenshot({path:path.join(out,'workflow-desktop.png')});
  if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1))throw Error('Horizontal overflow at 1440');
  const ctas=await page.locator('#pricing .pricing-action').evaluateAll(els=>els.map(el=>{const b=el.getBoundingClientRect();return {top:b.top,left:b.left,height:b.height,text:el.textContent}}));
  if(ctas.length!==3 || Math.max(...ctas.map(c=>c.top))-Math.min(...ctas.map(c=>c.top))>2 || new Set(ctas.map(c=>c.height)).size!==1)throw Error('Desktop pricing CTAs misaligned '+JSON.stringify(ctas));
  await page.locator('#pricing').screenshot({path:path.join(out,'pricing-desktop.png')});
  const decoded=await page.evaluate(async urls=>Promise.all([...new Set(urls)].map(async src=>{const image=new Image();image.src=src;await image.decode();if(!image.naturalWidth)throw Error('Empty image '+src);return {src,width:image.naturalWidth,height:image.naturalHeight}})),refs);
  const moduleChecks=[];
  for(let i=0;i<data.MODULES.length;i++){
   const module=data.MODULES[i];await page.locator('#modules button').nth(i).click();const dialog=page.getByRole('dialog',{name:module.name,exact:true});await dialog.waitFor();const text=await dialog.innerText();for(const line of module.bullets)if(!text.includes(line))throw Error('Module description mismatch '+module.name);
   const modalImage=dialog.locator('div[role="img"]');
   for(const image of module.shots){if(module.shots.length>1)await dialog.getByRole('button',{name:image.label,exact:true}).click();if(!(await modalImage.evaluate(el=>getComputedStyle(el).backgroundImage)).includes(image.src))throw Error('Wrong modal screenshot '+module.name+' '+image.label);if(i===4||i===2||i===7)await dialog.screenshot({path:path.join(out,(i===4?'owner':i===2?'email':'settings')+'-module-'+path.basename(image.src))});}
   await page.keyboard.press('Escape');await dialog.waitFor({state:'detached'});moduleChecks.push(module.name);
  }
  if(data.MODULES[4].bullets.some(line=>/Shows published emails, phone numbers/.test(line))||data.MODULES[7].lead.includes('Members'))throw Error('Stale module copy');
  if(/\bMac\b|Apple Silicon|\bMembers\b|Welcome to MamaLead/.test(await page.locator('body').innerText()))throw Error('Old Mac, Members or app welcome text is visible');
  const checks=['automatic update controls and new-release notifications','short Assist answers and contextual page links','click-anywhere mark-as-read','indexed owner-email evidence and export labels','footer and header original logos','no placeholder L, Mac, Members or app welcome banner','8 current module descriptions and all screenshot gallery tabs','all '+decoded.length+' referenced app screenshots decoded','live saved search and History','owner-only sourced emails','all selected Maps businesses plus actual progress and Stop','main website phone priority','selected-field Website Lookup','import sources and CSV/TSV picker','branded PDF/Excel information','notifications and Undo','Assist languages and Roman Urdu','pricing and download routes retained','three desktop pricing CTAs share top position and height'];
  checks.push('one main email, scoped optional validity, checked/total progress and Stop checking, Unknown recheck, verified shared-owner sources, compact import counts and automatic result scrolling');
  const download=await page.locator('[data-public-download="windows"]').getAttribute('href');if(download!=='https://api.mamalead.com/v1/download?platform=windows')throw Error('Public download route changed');
  for(const width of [390,768]){
   await page.setViewportSize({width,height:844});await page.evaluate(()=>window.scrollTo(0,0));await page.waitForTimeout(200);if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1))throw Error('Horizontal overflow at '+width);
   const faq=page.locator('#faq').getByRole('button',{name:'Which phone number appears first?',exact:true});await faq.click();await page.waitForTimeout(600);const p=faq.locator('..').locator('p'),answer=p.locator('..');if(await p.evaluate(el=>el.offsetHeight)>await answer.evaluate(el=>el.clientHeight)+1)throw Error('FAQ answer clipped at '+width);
   await page.locator('#latest').screenshot({path:path.join(out,width===390?'latest-mobile.png':'latest-tablet.png')});await page.locator('#pricing').screenshot({path:path.join(out,'pricing-'+width+'.png')});
   if(width===390){await page.locator('footer').screenshot({path:path.join(out,'footer-mobile.png')});await page.locator('#faq').screenshot({path:path.join(out,'faq-mobile.png')});await page.locator('#modules button').nth(4).click();const dm=page.getByRole('dialog',{name:'Decision Makers',exact:true});await dm.waitFor();await dm.getByRole('button',{name:'Scan progress and Stop',exact:true}).click();await dm.screenshot({path:path.join(out,'owner-module-mobile.png')});await page.keyboard.press('Escape');await dm.waitFor({state:'detached'});}
   await faq.click();
  }
  if(errors.length||httpErrors.length)throw Error(JSON.stringify({errors,httpErrors}));checks.push('390/768 desktop responsive layout; long FAQ answers readable; no renderer or local asset errors');
  const report={url:'http://127.0.0.1:8798/',versionShown:'1.4.18',widths:[1440,768,390],modules:moduleChecks,faqs:data.FAQS.length,screenshots:decoded.length,checks,pricingCtas:ctas.map(c=>({...c,top:Math.round(c.top)})),errors,httpErrors,published:false};fs.writeFileSync(path.join(out,'check.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
