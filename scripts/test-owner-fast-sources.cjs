const assert=require('node:assert/strict')
const {findOwnerContact}=require('../dist-electron/enrichment/owner-search.js')
const original=global.fetch,lead={name:'Northstar',website:'https://northstar.test'}
const owner='<article><h2>Janet Cole</h2><p>Founder of Northstar.</p></article>'
const mail='<p>Janet Cole: janet@northstar.test</p>'
const hit=(path,description='')=>({url:'https://northstar.test/'+path,title:'Northstar',description})
const checks=[]
const blocked=(signal,onAbort)=>new Promise((_,reject)=>{
 const abort=()=>{onAbort();reject(new DOMException('Aborted','AbortError'))}
 if(signal.aborted)abort();else signal.addEventListener('abort',abort,{once:true})
})
async function main(){
 let aborted=0,queries=0,start=Date.now()
 global.fetch=async(raw,{signal})=>String(raw).endsWith('/team')?new Response(owner+mail):blocked(signal,()=>aborted++)
 let r=await findOwnerContact(lead,{websiteFirst:false,search:async()=>{queries++;return {hits:[hit('about','Email janet@northstar.test'),hit('team'),hit('slow')],error:null}}})
 assert.equal(r.people[0].email,'janet@northstar.test');assert.equal(queries,1);assert.equal(aborted,2)
 assert.ok(Date.now()-start<800,'A stalled higher-ranked page blocked the completed second source')
 checks.push('fast second source wins without waiting for a stalled higher-ranked source')

 aborted=0;queries=0;start=Date.now()
 global.fetch=async(raw,{signal})=>String(raw).endsWith('/about')?new Response(owner):String(raw).endsWith('/contact')?new Response(mail):blocked(signal,()=>aborted++)
 r=await findOwnerContact(lead,{websiteFirst:false,search:async q=>{queries++;return {hits:queries===1?[hit('about'),hit('slow-a'),hit('slow-b')]:[hit('contact')],error:null}}})
 assert.equal(r.people[0].email,'janet@northstar.test');assert.equal(queries,2);assert.equal(aborted,2)
 assert.ok(Date.now()-start<800,'Verified owner waited for unrelated identity pages before email search')
 checks.push('verified identity hands off immediately to the company-scoped email query')
 queries=0
 global.fetch=async raw=>{if(String(raw).endsWith('/about'))return new Response(owner);await new Promise(resolve=>setTimeout(resolve,10));return new Response(mail)}
 r=await findOwnerContact(lead,{websiteFirst:false,search:async()=>{queries++;if(queries>1)await new Promise(resolve=>setTimeout(resolve,25));return {hits:queries===1?[hit('about'),hit('contact')]:[],error:null}}})
 assert.equal(r.people[0].email,'janet@northstar.test');assert.ok(queries<=2)
 checks.push('a pending source from the identity query is retained when the flow advances')

 async function personal(html){
  global.fetch=async raw=>new Response(String(raw)==='https://northstar.test'?owner:html)
  return findOwnerContact(lead,{search:async()=>({hits:[{url:'https://janetcole.test/project',title:'Janet Cole',description:'Northstar founder contact'}],error:null})})
 }
 const profile='<title>Janet Cole</title><h1>Janet Cole</h1><p>I built Northstar for local businesses.</p><a href="https://northstar.test">My project</a><p><a href="mailto:website@janetcole.test?subject=Hello">Email me</a></p>'
 r=await personal(profile);assert.equal(r.people[0].email,'website@janetcole.test');assert.equal(r.searches,1);assert.equal(r.people[0].emailEvidence,'personal-page')
 checks.push('independently verified founder can use an explicitly published personal-site contact')
 for(const [label,html] of [
  ['same-name person without company connection',profile.replace('https://northstar.test','https://southstar.test')],
  ['a company link alone without authorship',profile.replace('I built Northstar','I reviewed Northstar')],
  ['generic business contact page',profile.replaceAll('<title>Janet Cole</title>','<title>Consulting Company</title>').replace('<h1>Janet Cole</h1>','<h1>Our team</h1>')],
  ['third party mailbox',profile.replace('website@janetcole.test','website@someoneelse.test')],
  ['ambiguous personal mailboxes',profile+'<p>other@janetcole.test</p>'],
 ]){r=await personal(html);assert.equal(r.people[0].email,'',label);checks.push(label+' is rejected')}

 const reads=[];queries=0
 global.fetch=async raw=>{const url=String(raw);reads.push(url);return new Response(url===lead.website?'<a href="/web-development-company">Web development company</a><a href="/about/team">Our team</a><a href="/contact">Contact us</a>':url.endsWith('/contact')?mail:owner)}
 r=await findOwnerContact(lead,{search:async()=>{queries++;return {hits:[],error:null}}})
 assert.equal(r.people[0].email,'janet@northstar.test');assert.equal(queries,0);assert.ok(!reads.some(url=>url.endsWith('/web-development-company')))
 checks.push('company navigation prioritizes real about/contact pages over SEO service pages')
 const slowReads=[]
 global.fetch=async raw=>{const url=String(raw);slowReads.push(url);if(url.startsWith('https://northstar.test'))throw new DOMException('Timeout','TimeoutError');return new Response('<h1>Northstar</h1>'+owner+'<a href="https://northstar.test">Website</a>'+mail)}
 r=await findOwnerContact(lead,{search:async()=>({hits:[...Array.from({length:8},(_,i)=>hit('about/'+i)),{url:'https://register.test/northstar',title:'Northstar founder',description:'Janet Cole, founder of Northstar'}],error:null})})
 assert.equal(r.people[0].email,'janet@northstar.test');assert.ok(slowReads.includes('https://register.test/northstar'));assert.ok(slowReads.filter(url=>url.startsWith('https://northstar.test')).length<=3)
 checks.push('timing-out domain cannot hide a reachable independent source behind many failing pages')
 console.log(JSON.stringify({passed:true,checks},null,2))
}
main().catch(error=>{console.error(error);process.exitCode=1}).finally(()=>{global.fetch=original})
