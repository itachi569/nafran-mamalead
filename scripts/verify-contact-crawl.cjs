const assert = require('node:assert/strict')
const { createServer } = require('node:http')
const { WebsiteEnricher, addressesFromHtml } = require('../dist-electron/enrichment/website.js')
async function main() {
  const seen=[]
  let base=''
  const server=createServer((req,res)=>{
    seen.push(req.url)
    const routes={
      '/robots.txt': `Sitemap: ${base}/sitemap_index.xml`,
      '/sitemap_index.xml': `<sitemapindex><sitemap><loc>${base}/page-sitemap.xml</loc></sitemap></sitemapindex>`,
      '/page-sitemap.xml': `<urlset><url><loc>${base}/contact-us/</loc></url><url><loc>http://unrelated.invalid/contact</loc></url></urlset>`,
      '/': '<h1>Fixture law firm</h1><a href="mailto:office@law.fixture.test">Office</a>',
      '/people/': `<h1>Our people</h1><div class="person"><div class="nm">Irtafa ur Rehman</div><div class="rl">Partner</div><a href="mailto:irtafa@law.fixture.test">Email me</a><a href="tel:02137297209">Call</a></div><article><h2>Anas Habib Magoon, Esq.</h2><p>Attorney</p><p>${'Legal experience and professional expertise. '.repeat(70)}</p><a href="mailto:anas@law.fixture.test">Email me</a></article><p>Mr. Shah has practised as an Advocate since January 2010 and founded the chambers, whose offices are in Karachi.</p><script>const link='<a href="/contact?who=template">Contact</a>'</script>`,
      '/contact-us/': '<h1>Contact</h1><p>25 Clifton Road, Karachi, Pakistan</p><p>12 Main Street, Lahore, Pakistan</p><p>Ruth Ellery, Founder <a href="mailto:ruth@law.fixture.test">Ruth Ellery</a></p><a href="tel:+922112345678">Call</a><script type="application/ld+json">{"@type":"Person","name":"Ruth Ellery","jobTitle":"Founder","email":"ruth@law.fixture.test"}</script>',
    }
    res.writeHead(routes[req.url] ? 200 : 404, {'content-type':'text/html'});res.end(routes[req.url] ?? '')
  })
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base=`http://127.0.0.1:${server.address().port}`
  const enricher=new WebsiteEnricher()
  try {
    const result=await enricher.inspectContactFast(base)
    assert.equal(result.error,null)
    assert.deepEqual(result.emails.map(e=>e.value).sort(),['office@law.fixture.test','ruth@law.fixture.test'])
    assert.ok(seen.includes('/robots.txt') && seen.includes('/page-sitemap.xml') && seen.includes('/contact-us/'))
    assert.equal(result.addresses.length,2)
    assert.equal(result.people.find(p=>p.fullName==='Ruth Ellery').email,'ruth@law.fixture.test')
    assert.equal(result.phones.length,1)
    const people=await enricher.inspectPeople(`${base}/people/`)
    assert.equal(people.error,null)
    assert.equal(people.people.find(p=>p.fullName==='Irtafa ur Rehman')?.email,'irtafa@law.fixture.test')
    assert.equal(people.people.find(p=>p.fullName==='Irtafa ur Rehman')?.phone,'02137297209')
    assert.equal(people.people.find(p=>p.fullName==='Anas Habib Magoon')?.email,'anas@law.fixture.test')
    assert.ok(!people.addresses.some(a=>a.includes('has practised')))
    assert.ok(!seen.some(url=>url.includes('who=template')))
    assert.deepEqual(addressesFromHtml('<p>The High Courts operate under Article 199 and this chambers appears before them.</p>'),[])
    const controller=new AbortController();controller.abort()
    await assert.rejects(()=>enricher.inspectContactFast(base,controller.signal),/cancel/i)
    console.log('PASS robots → sitemap index → page sitemap → contact, published emails, multiple office addresses, person email, no paragraph address, cancellation')
    if(process.argv.includes('--live')) {
      for(const url of ['https://www.mandviwallaandzafar.com/','https://gssla.com.pk/']) {
        const found=await enricher.inspectContactFast(url)
        assert.equal(found.error,null)
        assert.ok(found.emails.length>=2 && found.addresses.length>=1)
        assert.ok(found.addresses.every(address=>address.length<220))
        console.log(JSON.stringify({url,emails:found.emails.map(e=>e.value),addresses:found.addresses,pages:found.pagesRead}))
      }
    }
  } finally {await enricher.close();server.close()}
}
main().catch(error=>{console.error(error);process.exitCode=1})
