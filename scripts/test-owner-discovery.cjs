const assert = require('node:assert/strict')
const {extractPeople} = require('../dist-electron/enrichment/email-extractor.js')
const {ownerBelongsToBusiness, contactFindingsFromHtml} = require('../dist-electron/enrichment/website.js')
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
  global.fetch = async () => new Response('<article><h2>Janet Cole</h2><p>Founder of a different company.</p>info@northstar.test</article>',{headers:{'content-type':'text/html'}})
  const generic = await findOwnerEmail(lead,{fullName:'Janet Cole'},{searchWeb:async()=>[{url:'https://northstar.test/contact',title:'Contact',description:''}]})
  check('generic company inbox is never substituted for an owner email',()=>assert.equal(generic.email,''))
  global.fetch = async () => new Response('Unavailable',{status:503})
  const unavailable = await findOwnerEmail(lead,{fullName:'Janet Cole'},{searchWeb:async()=>{throw Error('Search is unavailable')}})
  check('empty sitemap does not mask an unavailable email search',()=>assert.ok(unavailable.error))
  console.log(JSON.stringify({passed:true,checks},null,2))
}
main().catch(error=>{console.error(error);process.exitCode=1}).finally(()=>{global.fetch=originalFetch})
