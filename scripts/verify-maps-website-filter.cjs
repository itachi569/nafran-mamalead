const assert=require('node:assert/strict')
const {chromium}=require('playwright')
const {ChromiumMapsProvider}=require('../dist-electron/scraper/chromium-maps.js')
const {normaliseQuery}=require('../dist-electron/scraper/types.js')
async function main(){
  const browser=await chromium.launch({headless:true})
  try{
    for(const filter of ['any','has','none']){
      const context=await browser.newContext()
      await context.route('**/*',route=>route.fulfill({contentType:'text/html',body:`<div role="feed">${Array.from({length:10},(_,i)=>`<div jsaction="card"><a class="hfpxzc" aria-label="Clinic ${i}" href="https://www.google.com/maps/place/clinic-${i}">Clinic</a></div>`).join('')}</div><p>You've reached the end of the list</p>`}))
      const provider=new ChromiumMapsProvider({context});provider.pause=async()=>{}
      provider.readDetail=async(_page,entry)=>({name:entry.name,category:'Clinic',address:entry.name+' Karachi',phone:'',website:Number(entry.name.split(' ').at(-1))%2?'https://clinic.fixture.test':'',plusCode:'',ratingText:'',reviewText:''})
      const progress=[]
      const leads=await provider.run(normaliseQuery({keywords:['clinic'],location:'Karachi',maxResultsPerKeyword:7,maxResultsTotal:7,websiteFilter:filter}),event=>progress.push(event),new AbortController().signal)
      assert.equal(leads.length,filter==='any'?7:5)
      assert.ok(leads.every(lead=>filter==='any'||(filter==='has'?Boolean(lead.website):!lead.website)))
      assert.ok(progress.every(event=>(event.found??0)<=7))
      console.log(`PASS Maps ${filter}: ${leads.length} accepted, requested cap 7, no mismatching leads`)
      await context.close()
    }
  }finally{await browser.close()}
}
main().catch(error=>{console.error(error);process.exitCode=1})
