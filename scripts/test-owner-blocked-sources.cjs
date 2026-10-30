const assert=require('node:assert/strict')
const {findOwnerContact}=require('../dist-electron/enrichment/owner-search.js')
const lead={name:'northstar.test',website:'https://northstar.test'},nativeFetch=global.fetch,checks=[]
const personal='<title>Janet Cole — Design</title><h1>Janet Cole</h1><p>Designer at Southstar. Founder of <a href="https://northstar.test">Northstar</a>.</p><a href="mailto:janet@janetcole.test">Email</a>'
async function main(){
 let reads=[],queries=[]
 global.fetch=async url=>{reads.push(String(url));return new Response(String(url).includes('northstar.test')?'Rate limited':personal,{status:String(url).includes('northstar.test')?429:200})}
 let result=await findOwnerContact(lead,{search:async q=>{queries.push(q);return {hits:queries.length===1?[{url:'https://northstar.test/about',title:'About',description:''}]:[{url:'https://janetcole.test',title:'Janet Cole',description:'Founder of Northstar'}],error:null}}})
 assert.equal(result.people[0].fullName,'Janet Cole');assert.equal(result.people[0].email,'janet@janetcole.test');assert.equal(result.error,null)
 assert.equal(reads.filter(url=>url.includes('northstar.test')).length,1);assert.ok(!queries.some(q=>q.startsWith('site:')));assert.equal(queries[1],'"northstar" founder owner')
 checks.push('rate-limited company is not repeatedly fetched; brand search finds a self-identified founder on their personal site')
 reads=[]
 global.fetch=async url=>{reads.push(String(url));return new Response('Rate limited',{status:429})}
 result=await findOwnerContact(lead,{search:async()=>({hits:[{url:'https://northstar.test/about',title:'About',description:''}],error:null})})
 assert.match(result.error,/blocked source checks \(HTTP 429\)/);assert.equal(reads.length,1);assert.equal(result.people.length,0)
 checks.push('blocked source without verified ownership is a source error rather than Not published')
 for(const [label,html] of [
  ['agency client build',personal.replace('Founder of','Built a website for')],
  ['unrelated founder',personal.replace('Founder of','Founder of Other Company, featured on')],
  ['different company URL',personal.replace('https://northstar.test','https://othercompany.test')],
  ['article about a different person',personal.replace('<h1>Janet Cole</h1>','<h1>John Smith</h1>')],
  ['ambiguous profile identity',personal+'<h1>John Smith</h1>'],
 ]){
  global.fetch=async url=>new Response(String(url).includes('northstar.test')?'Company':html)
  result=await findOwnerContact(lead,{search:async()=>({hits:[{url:'https://janetcole.test',title:'Janet Cole',description:'Northstar'}],error:null})})
  assert.equal(result.people.length,0,label);checks.push(label+' cannot establish ownership')
 }
 global.fetch=async url=>new Response(String(url).includes('northstar.test')?'Company':personal.replace('Designer at Southstar. Founder of','I founded'))
 result=await findOwnerContact(lead,{search:async()=>({hits:[{url:'https://janetcole.test',title:'Janet Cole',description:'Northstar'}],error:null})})
 assert.equal(result.people[0].email,'janet@janetcole.test');checks.push('first-person founding statement with exact company link is supported')
 console.log(JSON.stringify({passed:true,checks},null,2))
}
main().catch(error=>{console.error(error);process.exitCode=1}).finally(()=>{global.fetch=nativeFetch})
