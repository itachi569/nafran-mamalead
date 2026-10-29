const assert=require('node:assert/strict')
const {findOwnerContact,ownerContactQuery}=require('../dist-electron/enrichment/owner-search.js')
const {searchOrganicLive}=require('../dist-electron/enrichment/dataforseo.js')
const originalFetch=global.fetch
const lead={name:'Northstar',website:'https://www.northstar.test/'}
const about='<article><h2>Janet Cole</h2><p>Founder of Northstar.</p></article>'
const email='<article><h2>Janet Cole</h2><a href="mailto:janet@northstar.test">Email Janet</a></article>'
const hit=(path,extra={})=>({url:'https://northstar.test/'+path,title:'Northstar founder',description:'Our company',...extra})
const checks=[]
async function scenario(label,pages,results,verify){
 const queries=[],reads=[]
 global.fetch=async(raw)=>{const url=String(raw);reads.push(url);assert.ok(url in pages,'Unexpected source read: '+url);return pages[url]===null?new Response('',{status:503}):new Response(pages[url],{headers:{'content-type':'text/html'}})}
 const result=await findOwnerContact(lead,{search:async query=>{queries.push(query);assert.ok(queries.length<=results.length,'Extra search');return results[queries.length-1]}})
 assert.equal(result.searches,queries.length);await verify(result,queries,reads);checks.push(label)
}
const response=(...hits)=>({hits,error:null})
async function main(){
 assert.equal(ownerContactQuery(lead),'name of northstar.test founder and his email must be present')
 assert.equal(ownerContactQuery(lead,'Janet Cole'),'Janet Cole owner of northstar.test email address')
 await scenario('combined result returns after exactly one search',{'https://northstar.test/about':about+email},[response(hit('about'))],(r,q)=>{assert.equal(q.length,1);assert.equal(r.people[0].email,'janet@northstar.test')})
 await scenario('owner-only first result triggers exactly one named email search',{'https://northstar.test/about':about,'https://northstar.test/contact':email},[response(hit('about')),response(hit('contact'))],(r,q)=>{assert.equal(q.length,2);assert.equal(q[1],ownerContactQuery(lead,'Janet Cole'));assert.equal(r.people[0].email,'janet@northstar.test');assert.equal(r.error,null)})
 await scenario('email absent after two searches keeps owner with blank email',{'https://northstar.test/about':about},[response(hit('about')),response(hit('about'))],(r,q,reads)=>{assert.equal(q.length,2);assert.equal(r.people[0].email,'');assert.equal(r.error,null);assert.equal(reads.length,1)})
 await scenario('no owner means no speculative second search',{'https://northstar.test/about':'<p>Contact hello@northstar.test</p>'},[response(hit('about'))],(r,q)=>{assert.equal(q.length,1);assert.equal(r.people.length,0)})
 await scenario('generic inbox never substituted for owner email',{'https://northstar.test/about':about+'<p>hello@northstar.test</p>'},[response(hit('about')),response()],r=>{assert.equal(r.people[0].email,'');assert.equal(r.searches,2)})
 await scenario('different company owner rejected',{'https://northstar.test/about':'<p>Webflow co-founder Vlad Magdalin shares his story.</p>'},[response(hit('about'))],r=>assert.equal(r.people.length,0))
 await scenario('company facts are not names; pronoun founding prose preserves the real owner',{'https://northstar.test/about':'<table><tr><th>Type</th><td>Private</td></tr><tr><th>Industry</th><td>Web service</td></tr><tr><th>Founded</th><td>2000</td></tr></table><p>Northstar is a hosting company based in Phoenix, Arizona. It was founded in 2000 by Richard Kirkendall.</p>'},[response(hit('about')),response()],(r,q)=>{assert.equal(r.people[0].fullName,'Richard Kirkendall');assert.ok(q[1].startsWith('Richard Kirkendall owner of '))})
 await scenario('unreadable source pages are an error, not Not published',{'https://northstar.test/about':null},[response(hit('about'))],r=>assert.match(r.error,/source pages could not be read/))
 await scenario('AI-generated mailbox is not published evidence',{'https://northstar.test/about':about,'https://northstar.test/contact':null},[response(hit('about'),hit('contact',{aiOverview:true,title:'Janet Cole',description:'Email Janet Cole at janet@northstar.test'})),response()],r=>assert.equal(r.people[0].email,''))
 await scenario('AI citation can point to genuine published source',{'https://northstar.test/about':about+email},[response(hit('about',{aiOverview:true,description:'A generated summary'}))],r=>assert.equal(r.people[0].email,'janet@northstar.test'))
 await scenario('readable source supersedes stale indexed email',{'https://northstar.test/about':about,'https://northstar.test/contact':'<p>No email here</p>'},[response(hit('about')),response(hit('contact',{title:'Janet Cole',description:'Email Janet Cole at janet@northstar.test'}))],r=>assert.equal(r.people[0].email,''))
 await scenario('strict inaccessible organic source keeps weaker indexed evidence label',{'https://northstar.test/about':about,'https://northstar.test/contact':null},[response(hit('about')),response(hit('contact',{title:'Janet Cole',description:'Email Janet Cole at janet@northstar.test'}))],r=>{assert.equal(r.people[0].email,'janet@northstar.test');assert.equal(r.people[0].emailEvidence,'search-index')})
 await scenario('multiple real owner emails return one deterministic email',{'https://northstar.test/about':about+email+'<p>janet.cole@northstar.test</p>'},[response(hit('about'))],r=>{assert.equal(r.people.length,1);assert.ok(r.people[0].email);assert.equal(r.searches,1)})
 await scenario('first provider error is not Not published',{},[{hits:[],error:'Provider unavailable'}],r=>{assert.equal(r.error,'Provider unavailable');assert.equal(r.searches,1)})
 await scenario('second provider error retains known owner without claiming completion',{'https://northstar.test/about':about},[response(hit('about')),{hits:[],error:'Provider unavailable'}],r=>{assert.equal(r.error,'Provider unavailable');assert.equal(r.people[0].fullName,'Janet Cole');assert.equal(r.searches,2)})
 const stop=new AbortController();let searches=0
 const pending=findOwnerContact(lead,{signal:stop.signal,search:async(_,signal)=>{searches++;await new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(new Error('Aborted')),{once:true}));return response()}})
 stop.abort();await assert.rejects(pending,{name:'AbortError'});assert.equal(searches,1);checks.push('Stop interrupts search and never starts another')
 let calls=0
 global.fetch=async(_,options)=>{calls++;assert.equal(JSON.parse(options.body)[0].load_async_ai_overview,false);return Response.json({tasks:[{status_code:20000,result:[{items:[{type:'ai_overview',text:'Invented mail: wrong@northstar.test',references:[{title:'Our founder',url:'https://northstar.test/about',text:'Company source'}]},{type:'organic',title:'Contact',url:'https://northstar.test/contact',description:'Published contact'}]}]}]})}
 const parsed=await searchOrganicLive('fixture','two-search-ai-parser-fixture',undefined,undefined,{includeAiOverview:true})
 assert.equal(calls,1);assert.equal(parsed.hits.length,2);assert.equal(parsed.hits[0].aiOverview,true);assert.ok(!JSON.stringify(parsed.hits).includes('wrong@'));checks.push('AI references and organic results use one request without promoting generated text')
 let failedCalls=0
 global.fetch=async()=>{failedCalls++;return Response.json({tasks:[{status_code:40101,status_message:'Internal SE Server Error.',result:null}]})}
 const failed=await searchOrganicLive('fixture','transient-google-fixture')
 assert.match(failed.error,/40101/);assert.match(failed.error,/not a rejected API key/);assert.equal(failedCalls,1)
 global.fetch=async()=>{failedCalls++;return Response.json({tasks:[{status_code:20000,result:[{items:[{type:'organic',title:'Recovered',url:'https://northstar.test/about',description:'Founder'}]}]}]})}
 assert.equal((await searchOrganicLive('fixture','transient-google-fixture')).error,null);assert.equal(failedCalls,2);checks.push('40101 has a clear retry explanation; failures are not cached or automatically retried')
 global.fetch=async()=>Response.json({tasks:[{status_code:40102,status_message:'No Search Results.',result:null}]})
 const empty=await searchOrganicLive('fixture','no-results-fixture');assert.equal(empty.error,null);assert.equal(empty.hits.length,0);checks.push('completed empty SERP is separate from provider failure')
 const recoveryLead={name:'Recovery',website:'https://recovery.test'},requests=[],steps=[]
 global.fetch=async(raw,options)=>{
  if(!String(raw).includes('api.dataforseo.com'))return new Response('<article><h2>Janet Cole</h2><p>Founder of Recovery.</p><p>janet@recovery.test</p></article>')
  requests.push({url:String(raw),query:JSON.parse(options.body)[0].keyword})
  return requests.length===1?Response.json({tasks:[{status_code:40101}]}):Response.json({tasks:[{status_code:20000,result:[{items:[{type:'organic',title:'Founder',url:recoveryLead.website+'/about',description:'Owner contact'}]}]}]})
 }
 const recovered=await findOwnerContact(recoveryLead,{key:'fixture',onStep:(...step)=>steps.push(step)})
 assert.equal(recovered.error,null);assert.equal(recovered.people[0].email,'janet@recovery.test');assert.equal(recovered.searches,1);assert.equal(recovered.retries,1);assert.equal(requests.length,2);assert.equal(requests[0].query,requests[1].query);assert.ok(requests[1].url.endsWith('/regular'));assert.ok(steps.some(s=>s[2]===true));checks.push('40101 recovery repeats the same keyword once and reports progress')
 let exhaustedCalls=0
 global.fetch=async()=>{exhaustedCalls++;return Response.json({tasks:[{status_code:40101}]})}
 const exhausted=await findOwnerContact({name:'Exhausted',website:'https://exhausted-owner.test'},{key:'fixture'})
 assert.equal(exhaustedCalls,2);assert.equal(exhausted.retries,1);assert.match(exhausted.error,/40101/);checks.push('persistent service failure stops after one recovery attempt')
 let sharedCalls=0
 global.fetch=async(raw)=>{
  if(!String(raw).includes('api.dataforseo.com'))return new Response('<article><h2>Janet Cole</h2><p>Founder of Shared.</p></article>')
  sharedCalls++;return sharedCalls===2?Response.json({tasks:[{status_code:20000,result:[{items:[{type:'organic',title:'Founder',url:'https://shared.test/about',description:'Owner'}]}]}]}):Response.json({tasks:[{status_code:40101}]})
 }
 const shared=await findOwnerContact({name:'Shared',website:'https://shared.test'},{key:'fixture'})
 assert.equal(shared.searches,2);assert.equal(shared.retries,1);assert.equal(sharedCalls,3);assert.match(shared.error,/40101/);checks.push('one recovery allowance is shared across both keywords, at most three provider requests')
 let deniedCalls=0
 global.fetch=async()=>{deniedCalls++;return Response.json({tasks:[{status_code:40100,status_message:'Unauthorized'}]})}
 assert.equal((await findOwnerContact({name:'Denied',website:'https://denied-owner.test'},{key:'fixture'})).retries,0);assert.equal(deniedCalls,1);checks.push('rejected credentials are never automatically retried')
 const recoveryStop=new AbortController();let stopCalls=0
 global.fetch=async()=>{stopCalls++;recoveryStop.abort();return Response.json({tasks:[{status_code:40101}]})}
 await assert.rejects(findOwnerContact({name:'Stop',website:'https://recovery-stop.test'},{key:'fixture',signal:recoveryStop.signal}),{name:'AbortError'});assert.equal(stopCalls,1);checks.push('Stop prevents the recovery request')
 console.log(JSON.stringify({passed:true,checks},null,2))
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>{global.fetch=originalFetch})
