const fs=require('node:fs'),path=require('node:path'),os=require('node:os')
const {GoogleOwnerBrowser}=require('../dist-electron/enrichment/google-browser.js')
const {findOwnerContact}=require('../dist-electron/enrichment/owner-search.js')
const browser=new GoogleOwnerBrowser(fs.mkdtempSync(path.join(os.tmpdir(),'mamalead-google-live-')))
async function main(){
 await browser.open()
 const report=[]
 for(const domain of ['onesmartsheep.com','namecheap.com']){
  const controller=new AbortController(),queries=[],start=Date.now();let attention=''
  try{
   const result=await findOwnerContact({name:domain,website:'https://'+domain},{signal:controller.signal,search:async(q,s)=>{
    const response=await browser.search(q,s,message=>{if(/needs your attention/.test(message)){attention=message;controller.abort()}})
    queries.push({query:q,hits:response.hits});return response
   }})
   report.push({domain,seconds:(Date.now()-start)/1000,queries,result})
  }catch(error){report.push({domain,seconds:(Date.now()-start)/1000,queries,attention,error:String(error)})}
  if(attention)break
 }
 const out=path.resolve(__dirname,'../../../outputs/owner-browser-live.json');fs.writeFileSync(out,JSON.stringify(report,null,2))
 console.log(JSON.stringify({report:out,results:report.map(({domain,seconds,result,attention,queries})=>({domain,seconds,attention,searches:queries.length,hitCounts:queries.map(q=>q.hits.length),result}))},null,2))
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>browser.close())
