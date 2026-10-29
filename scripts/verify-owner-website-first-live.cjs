// Opt-in real network QA. Reuses only MamaLead's dedicated Chrome profile in a NEW tab.
// It never navigates the application's tab, bypasses verification, or writes customer data.
const fs=require('node:fs'),path=require('node:path'),{chromium}=require('playwright')
const {GoogleOwnerBrowser}=require('../dist-electron/enrichment/google-browser.js')
const {findOwnerContact}=require('../dist-electron/enrichment/owner-search.js')
async function main(){
 const profile=path.join(process.env.APPDATA,'nafran-leads-scraper','owner-google-chrome'),port=fs.readFileSync(path.join(profile,'DevToolsActivePort'),'utf8').split(/\r?\n/)[0]
 if(!/^\d+$/.test(port))throw Error('No dedicated browser port')
 const connection=await chromium.connectOverCDP('http://127.0.0.1:'+port),page=await connection.contexts()[0].newPage()
 const browser=new GoogleOwnerBrowser(profile);browser.browser=connection;browser.page=page
 const out=path.resolve(__dirname,'../../..','outputs/owner-website-first-live.json'),reports=fs.existsSync(out)?JSON.parse(fs.readFileSync(out,'utf8')).reports:[];let googleBlocked=false
 const nativeFetch=global.fetch
 try{for(const domain of process.argv.slice(2).length?process.argv.slice(2):['topstudayworld.com','topstudyworld.com','onesmartsheep.com','plausible.io','balsamiq.com','ghost.org']){
  const start=Date.now(),reads=[],queries=[],controller=new AbortController();let lastProgress
  global.fetch=async(url,options)=>{const before=Date.now();try{const r=await nativeFetch(url,options);reads.push({url:String(url),status:r.status,ms:Date.now()-before});return r}catch(e){reads.push({url:String(url),ms:Date.now()-before,error:e.cause?.code||e.message});throw e}}
  let result
  try{result=await findOwnerContact({name:domain,website:'https://'+domain},{signal:controller.signal,search:async(q,s,remaining)=>{
   if(googleBlocked)return {hits:[],error:'Live Google verification required; diagnostic stopped without bypassing it.'}
   const before=Date.now();const r=await browser.search(q,s,message=>{if(/needs your attention/.test(message)){googleBlocked=true;controller.abort()}},remaining);queries.push({query:q,ms:Date.now()-before,hits:r.hits});return r
  },onSources:(step,checked,total)=>{lastProgress={step,checked,total}}})}catch(e){result={error:googleBlocked?'Google verification required':e.message}}
  const report={domain,seconds:(Date.now()-start)/1000,result,queries,reads,lastProgress};const old=reports.findIndex(r=>r.domain===domain);if(old>=0)reports.splice(old,1);reports.push(report);fs.writeFileSync(out,JSON.stringify({at:new Date().toISOString(),reports},null,2));console.log(JSON.stringify({domain,seconds:report.seconds,result,queries:queries.length,reads:reads.length}))
 }}finally{global.fetch=nativeFetch;await page.close()}
 // Disconnect only this diagnostic client; leave app-owned Chrome running.
 process.exit(0)
}
main().catch(e=>{console.error(e);process.exit(1)})
