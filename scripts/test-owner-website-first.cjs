const assert=require('node:assert/strict')
const {findOwnerContact}=require('../dist-electron/enrichment/owner-search.js')
const lead={name:'Northstar',website:'https://northstar.test/'},originalFetch=global.fetch
const owner='<article><h2>Janet Cole</h2><p>Founder of Northstar.</p></article>'
const mail='<p>Contact Janet Cole</p><a href="mailto:janet@northstar.test">Email Janet</a>'
const checks=[]
async function run(pages,search=async()=>({hits:[],error:null}),extra={}){
 const reads=[],queries=[]
 global.fetch=async(raw,{signal})=>{const url=String(raw);reads.push(url);signal.throwIfAborted();const value=pages[url];assert.notEqual(value,undefined,'Unexpected URL '+url);if(value instanceof Error)throw value;return new Response(value??'',{status:value===null?403:200})}
 const result=await findOwnerContact(lead,{search:async q=>{queries.push(q);return search(q)},...extra});return {result,reads,queries}
}
async function main(){
 let r=await run({'https://northstar.test/':'<a href="/company">Company</a><a href="/contact">Contact</a>','https://northstar.test/company':owner,'https://northstar.test/contact':mail})
 assert.equal(r.result.people[0].email,'janet@northstar.test');assert.equal(r.queries.length,0);assert.equal(r.reads.length,3);checks.push('linked company and contact pages find owner email without Google')
 r=await run({'https://northstar.test/':owner,'https://northstar.test/contact':mail},async()=>({hits:[{url:'https://northstar.test/contact',title:'Contact Janet',description:''}],error:null}))
 assert.equal(r.queries[0],'"Janet Cole" "Northstar" email address');assert.equal(r.result.people[0].email,'janet@northstar.test');assert.equal(r.queries.length,1);checks.push('known owner skips broad identity searches')
 r=await run({'https://northstar.test/':new TypeError('fetch failed',{cause:Object.assign(new Error('DNS'),{code:'ENOTFOUND'})})})
 assert.match(r.result.error,/website address and spelling/);assert.equal(r.queries.length,0);checks.push('nonexistent website fails immediately with actionable spelling error')
 r=await run({'https://northstar.test/':null,'https://northstar.test/about':owner+mail},async()=>({hits:[{url:'https://northstar.test/about',title:'About',description:''}],error:null}))
 assert.equal(r.result.people[0].email,'janet@northstar.test');assert.equal(r.queries.length,1);checks.push('blocked homepage still allows search and accessible source fallback')
 r=await run({'https://northstar.test/':owner+'<p>hello@northstar.test</p>'})
 assert.equal(r.result.people[0].email,'');checks.push('general company inbox is not assigned to owner')
 r=await run({'https://northstar.test/':'<blockquote><p>Janet Cole, Founder of Southstar</p><p>janet@southstar.test</p></blockquote>'})
 assert.equal(r.result.people.length,0);checks.push('unrelated testimonial owner rejected')

 r=await run({'https://northstar.test/':'<nav>Pricing Sign in Get Started <span>Founder tools</span></nav><article><h2>Janet Cole</h2><p>Founder of Northstar.</p>'+mail+'</article>'})
 assert.equal(r.result.people[0].fullName,'Janet Cole');assert.equal(r.queries.length,0);checks.push('navigation labels cannot become owner names')
 r=await run({'https://northstar.test/':'<div>John - Founder, CEO May, 2013</div><div>Hannah - Founder, CTO July, 2013</div>'})
 assert.ok(!r.result.people.some(p=>/CEO May|CTO July/.test(p.fullName)));checks.push('roles and joining dates cannot become owner names')
 const profileOwner=owner+'<a href="https://www.linkedin.com/in/janet-cole">Janet profile</a>'
 r=await run({'https://northstar.test/':profileOwner,'https://www.linkedin.com/posts/unrelated-person':'<p>Someone else</p><p>janet.cole@gmail.com</p>'},async()=>({hits:[{url:'https://www.linkedin.com/posts/unrelated-person',title:'Unrelated post',description:''}],error:null}))
 assert.equal(r.result.people[0].email,'');checks.push('company link to LinkedIn cannot authorize a namesake email from another LinkedIn profile')
 const stop=new AbortController();global.fetch=async(_,opts)=>new Promise((_,reject)=>{opts.signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true});setTimeout(()=>stop.abort(),10)})
 await assert.rejects(findOwnerContact(lead,{signal:stop.signal,search:async()=>{throw Error('Search must not start')}}),{name:'AbortError'});checks.push('Stop aborts website read before a search starts')
 console.log(JSON.stringify({passed:true,checks},null,2))
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>{global.fetch=originalFetch})
