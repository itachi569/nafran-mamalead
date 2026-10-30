// Optional read-only checks against the public sites cited in the QA report.
// Public servers can change; record failures honestly instead of replacing them with fixtures.
const {WebsiteEnricher}=require('../dist-electron/enrichment/website.js')
const fs=require('node:fs'),path=require('node:path')
async function main(){
 const sites=['http://physioway.pk','http://physiodoctor.pk','http://www.physiogic.com/?utm_source=google','http://reactivephysio.pk','http://ejazdanish.lahorespinecare.com']
 const results=[]
 for(let offset=0;offset<sites.length;offset+=2){
  await Promise.all(sites.slice(offset,offset+2).map(async website=>{
   const start=Date.now(),enricher=new WebsiteEnricher()
   try {const result=await enricher.inspectContactFast(website,AbortSignal.timeout(55000),true)
    const record={website,canonical:result.canonicalWebsite,error:result.error,emails:result.emails.length,phones:result.phones.length,socials:result.socials.length,seconds:Math.round((Date.now()-start)/100)/10}
    results.push(record);console.log(JSON.stringify(record))
   }catch(error){const record={website,error:error.message,seconds:Math.round((Date.now()-start)/100)/10};results.push(record);console.log(JSON.stringify(record))}
   finally{await enricher.close()}
  }))
 }
 const out=path.resolve('screenshots/qa-1.4.21');fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'live-websites.json'),JSON.stringify(results,null,2))
}
main().catch(error=>{console.error(error);process.exitCode=1})
