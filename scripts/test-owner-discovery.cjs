const assert = require('node:assert/strict')
const {extractPeople} = require('../dist-electron/enrichment/email-extractor.js')
const {ownerBelongsToBusiness, ownerNameOutsideTestimonials, contactFindingsFromHtml, isUsablePerson} = require('../dist-electron/enrichment/website.js')
const {isBusinessOwner} = require('../dist-electron/enrichment/owner-contact.js')
const {findBusinessOwners, findOwnerEmail} = require('../dist-electron/enrichment/owner-search.js')
const {searchOrganicLive} = require('../dist-electron/enrichment/dataforseo.js')
const {isPublicSourceUrl} = require('../dist-electron/enrichment/public-search.js')
const checks = []
const check = (label, fn) => { fn(); checks.push(label) }
const originalFetch = global.fetch
async function main() {
  const prose = 'Northstar was started in 2000 by CEO Richard Kirkendall in Los Angeles, California.'
  const html = `<article><p>${prose}</p></article>`
  check('dated founding statement retains the name and Founder role', () => {
    assert.deepEqual(extractPeople(prose).map(({fullName,title})=>({fullName,title})), [{fullName:'Richard Kirkendall',title:'Founder'}])
    assert.ok(contactFindingsFromHtml(html,'https://northstar.test/about').people.some(p=>p.fullName==='Richard Kirkendall' && isBusinessOwner(p.title)))
  })
  check('founding statement must refer to the scanned company', () => {
    assert.ok(ownerBelongsToBusiness(html,'https://northstar.test','Richard Kirkendall'))
    assert.equal(ownerBelongsToBusiness(html,'https://other-company.test','Richard Kirkendall'),false)
  })
  check('sentence endings and lowercase prose do not corrupt names', () => {
    assert.ok(extractPeople('Founded by Janet Cole.').some(p=>p.fullName==='Janet Cole'))
    assert.ok(extractPeople('Established in 1999 by president Ana García in Madrid.').some(p=>p.fullName==='Ana García'))
    assert.ok(extractPeople('Founded by Adriaan van Rossum in Amsterdam.').some(p=>p.fullName==='Adriaan van Rossum'))
    assert.ok(!extractPeople('Chief executive officer Jane Smith leads our team.').some(p=>isBusinessOwner(p.title)))
  })
  check('search navigation and login forms are not evidence pages', () => {
    assert.equal(isPublicSourceUrl('https://www.google.co.uk/search?q=owner'),false)
    assert.equal(isPublicSourceUrl('https://northstar.test/myaccount/login/'),false)
    assert.ok(isPublicSourceUrl('https://northstar.test/about/'))
  })
  check('guest founders and testimonial company labels do not establish site ownership',()=>{
    const guest='<article><p>Sunny Bonnell, Co-founder &amp;amp; CEO of Motto®, shares her advice.</p></article>'
    assert.equal(ownerBelongsToBusiness(guest,'https://awwwards.test','Sunny Bonnell'),false)
    assert.ok(ownerBelongsToBusiness(guest,'https://motto.test','Sunny Bonnell'))
    assert.equal(ownerBelongsToBusiness('<div><h3>Dylan Field</h3><span>Co-founder, Figma</span></div>','https://northstar.test','Dylan Field'),false)
    assert.equal(ownerBelongsToBusiness('<p>Webflow co-founder Vlad Magdalin shares his story.</p>','https://northstar.test','Vlad Magdalin'),false)
    assert.ok(ownerBelongsToBusiness('<div><h3>Janet Cole</h3><span>Co-founder, Northstar</span></div>','https://northstar.test','Janet Cole'))
    assert.ok(ownerBelongsToBusiness('<li><strong>Jon Buda</strong>, Co-founder, President</li>','https://transistor.test','Jon Buda'))
    assert.equal(ownerNameOutsideTestimonials('<div><div data-sentry-element="Quote">Great software!<div data-sentry-element="QuotedPerson"><div>Steven Tey</div><div>Founder Dub.co</div></div></div></div>','Steven Tey'),false)
    assert.equal(isUsablePerson('Webflow Co','Founder'),false)
    assert.equal(isUsablePerson('PRO Introduction Sunny Bonnell','Co-founder'),false)
    assert.equal(isUsablePerson('Namecheap When','Founder'),false)
  })
  check('structured founder givenName and familyName are accepted without a name field',()=>{
    const structured='<script type="application/ld+json">{"@type":"Organization","founders":[{"givenName":"Jon","familyName":"Buda"},{"givenName":"Justin","familyName":"Jackson"}]}</script>'
    assert.deepEqual(contactFindingsFromHtml(structured,'https://transistor.test').people.map(p=>p.fullName),['Jon Buda','Justin Jackson'])
    assert.ok(ownerBelongsToBusiness(structured,'https://transistor.test','Jon Buda'))
  })
  global.fetch = async raw => new Response(String(raw).endsWith('/founder') ? '<article><h2>Janet Cole</h2><p>Founder of Northstar.</p><a href="mailto:janet@northstar.test">Email Janet</a></article>' : '<p>No owner published here.</p>',{headers:{'content-type':'text/html'}})
  const lead = {name:'Northstar',website:'https://northstar.test'}
  const result = await findBusinessOwners(lead,{searchWeb:async()=>[...Array.from({length:3},(_,i)=>({url:`https://northstar.test/about-${i}`,title:'About Northstar',description:'Company'})),{url:'https://northstar.test/founder',title:'Northstar founder',description:'Our founder'}]})
  check('unhelpful first three sources do not hide the fourth source', () => assert.ok(result.people.some(p=>p.fullName==='Janet Cole' && p.email==='janet@northstar.test')))
  global.fetch = async raw => {
    if(String(raw).includes('api.dataforseo.com'))return Response.json({tasks:[{status_code:20000,result:[{items:[...Array.from({length:10},()=>({title:'Images',url:'https://www.google.com/search?udm=2&q=owner'})),{title:'Public founder',url:'https://northstar.test/founder',description:'Janet Cole'}]}]}]})
    throw Error('Unexpected fetch')
  }
  const organic = await searchOrganicLive('fixture','fixture owner discovery')
  check('search widgets cannot fill the paid source limit', () => assert.deepEqual(organic.hits.map(h=>h.url),['https://northstar.test/founder']))
  let paidQuery = ''
  global.fetch = async (raw,options) => {
    if(String(raw).includes('api.dataforseo.com')) {
      paidQuery = JSON.parse(options.body)[0].keyword
      return Response.json({tasks:[{status_code:20000,result:[{items:[{title:'Marmalead founder',url:'https://marmalead.test/about',description:'Founder of Marmalead'}]}]}]})
    }
    if(String(raw).includes('bing.com'))return new Response('<rss><channel></channel></rss>')
    if(String(raw).includes('duckduckgo.com'))return new Response('<html>No results</html>')
    throw Error('An unrelated company must not supply owner evidence')
  }
  const unrelated = await findBusinessOwners({name:'mamalead.com',website:'https://mamalead.com'},{key:'fixture'})
  check('broader paid query still rejects a similarly named unrelated company',()=>{
    assert.equal(paidQuery,'"mamalead" founder')
    assert.deepEqual(unrelated.people,[])
  })
  global.fetch=async raw=>new Response(String(raw).endsWith('/wrong')?'<h1>Tally Solutions</h1><p>Shyam Goenka is founder of Tally Solutions.</p><a href="https://tallysolutions.test">Website</a>':'<h1>Tally</h1><p>Filip Minev is founder of Tally.</p><a href="https://tally.test">Website</a>')
  const sameBrand=await findBusinessOwners({name:'Tally',website:'https://tally.test'},{searchWeb:async()=>[{title:'Tally founders',description:'Tally Solutions founder',url:'https://directory.test/wrong'},{title:'Tally founders',description:'Tally form builder',url:'https://directory.test/right'}]})
  check('same-name companies require their exact website on the external owner source',()=>assert.deepEqual(sameBrand.people.map(p=>p.fullName),['Filip Minev']))
  global.fetch = async () => new Response('<article><h2>Janet Cole</h2><p>Founder of a different company.</p>info@northstar.test</article>',{headers:{'content-type':'text/html'}})
  const generic = await findOwnerEmail(lead,{fullName:'Janet Cole'},{searchWeb:async()=>[{url:'https://northstar.test/contact',title:'Contact',description:''}]})
  check('generic company inbox is never substituted for an owner email',()=>assert.equal(generic.email,''))
  global.fetch = async () => new Response('Unavailable',{status:503})
  const unavailable = await findOwnerEmail(lead,{fullName:'Janet Cole'},{searchWeb:async()=>{throw Error('Search is unavailable')}})
  check('empty sitemap does not mask an unavailable email search',()=>assert.ok(unavailable.error))
  let waiting=0,aborted=0,fastQuery=''
  global.fetch=async(raw,options={})=>{
    const url=String(raw)
    if(url.includes('api.dataforseo.com')){
      fastQuery=JSON.parse(options.body)[0].keyword
      return Response.json({tasks:[{status_code:20000,result:[{items:[{title:'Janet Cole | Northstar',url:'https://northstar.test/published-contact',description:'Founder email'}]}]}]})
    }
    if(url.endsWith('/published-contact'))return new Response('<article><h2>Janet Cole</h2><p>Founder of Northstar</p><a href="mailto:janet@northstar.test">Email Janet</a></article>')
    waiting++
    return new Promise((resolve,reject)=>{
      const stop=()=>{aborted++;reject(new DOMException('Cancelled','AbortError'))}
      if(options.signal?.aborted)stop();else options.signal?.addEventListener('abort',stop,{once:true})
    })
  }
  const rapid=await findOwnerEmail(lead,{fullName:'Janet Cole'},{key:'fixture',signal:AbortSignal.timeout(1500)})
  check('published provider email returns while free indexes and sitemap are still waiting',()=>{
    assert.equal(rapid.email,'janet@northstar.test');assert.equal(rapid.error,null)
    assert.equal(fastQuery,'"Janet Cole" email')
    assert.ok(waiting>0 && aborted>0,'unused searches must be cancelled')
  })
  const stop=new AbortController()
  const cancelled=findOwnerEmail(lead,{fullName:'Maria Green'},{signal:stop.signal})
  stop.abort()
  await assert.rejects(cancelled,error=>error.name==='AbortError')
  checks.push('Stop still cancels the parallel owner-email searches')
  const proof='<article><h2>Janet Cole</h2><p>Janet Cole is founder of Northstar.</p></article>'
  const snippetCases=[
    {description:'To contact Janet Cole send an email to janet@northstar.test or janet@oldcompany.test.',expected:'janet@northstar.test'},
    {description:'To contact Janet Cole email janet@different-company.test.',expected:''},
    {description:'To contact Janet Cole email j***@northstar.test.',expected:''},
    {description:'Janet Cole email format example: janet@northstar.test',expected:''},
    {description:'To contact Janet Cole email hello@northstar.test.',expected:''},
    {description:'To contact Janet Cole email janet@northstar.test.',expected:'',live:true},
    {description:'To contact Janet Cole email janet@northstar.test.',expected:'',noProof:true},
  ]
  for(let i=0;i<snippetCases.length;i++){
    const item=snippetCases[i],website=`https://northstar.test`,source=`https://directory.test/person-${i}`
    const fullName=`Janet ${['Mason','Nolan','Oliver','Palmer','Quinn','Reed','Stone'][i]}`
    global.fetch=async(raw)=>{
      const url=String(raw)
      if(url.endsWith('/proof'))return new Response(proof.replaceAll('Janet Cole',fullName))
      if(url.includes('api.dataforseo.com'))return Response.json({tasks:[{status_code:20000,result:[{items:[{title:fullName+' Email',description:item.description.replaceAll('Janet Cole',fullName),url:source}]}]}]})
      if(url===source)return new Response(item.live?'This page no longer publishes contact details.':'Blocked',{status:item.live?200:403})
      return new Response('Unavailable',{status:503})
    }
    const indexed=await findOwnerEmail({...lead,website},{fullName,evidence:item.noProof?undefined:website+'/proof'},{key:'fixture'})
    assert.equal(indexed.email,item.expected,`indexed source case ${i}`)
    if(item.expected)assert.equal(indexed.emailEvidence,'search-index')
  }
  checks.push('indexed fallback requires established owner, explicit unmasked company mailbox, blocked source, and evidence label')
  console.log(JSON.stringify({passed:true,checks},null,2))
}
main().catch(error=>{console.error(error);process.exitCode=1}).finally(()=>{global.fetch=originalFetch})
