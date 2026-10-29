const assert=require('node:assert/strict'),{mkdtempSync}=require('node:fs'),{join}=require('node:path'),{tmpdir}=require('node:os')
const {readableHtml,contactFindingsFromHtml,ownerBelongsToBusiness,isUsablePerson}=require('../dist-electron/enrichment/website.js')
const {extractPeople}=require('../dist-electron/enrichment/email-extractor.js')
const {LocalDatabase}=require('../dist-electron/db/local-db.js'),{Repository}=require('../dist-electron/db/repository.js')
const checks=[]
const test=(label,fn)=>{fn();checks.push(label)}
test('HTML attributes and embedded metadata are not visible owner evidence',()=>{
 const html='<div data-example="Type > Founder Fake Person">Real page</div><script type="application/ld+json">{"name":"Data Example"}</script>'
 assert.equal(readableHtml(html),'Real page');assert.deepEqual(extractPeople(readableHtml(html)),[])
})
test('marketing calls to action and category labels cannot turn into founders',()=>{
 for(const text of ['Portfolio Websites Get started','Massachusetts Internet properties established in 2009','Domains Log Out Get started'])assert.deepEqual(extractPeople(text),[])
 for(const name of ['Portfolio Websites Get','Massachusetts Internet'])assert.equal(isUsablePerson(name,'Founder'),false)
})
test('plural founder labels retain both real founders',()=>{
 assert.deepEqual(extractPeople('Founders: Dan Cederholm and Rich Thornett\nCEO: Zack Onisko').filter(x=>x.title==='Founder').map(x=>x.fullName),['Dan Cederholm','Rich Thornett'])
})
test('line boundaries preserve names and discard combined headings',()=>{
 const html='<h2>Portfolio Websites</h2><a>Get started</a><p>Northstar was founded by Janet Cole.</p>'
 assert.deepEqual(contactFindingsFromHtml(html,'https://northstar.test').people.filter(x=>x.title==='Founder').map(x=>x.fullName),['Janet Cole'])
})
test('company brand cannot be stored as a person',()=>{
 assert.equal(ownerBelongsToBusiness('<meta property="og:site_name" content="Northstar Studio"><h2>Northstar Studio</h2><p>Founder</p>','https://northstar.test','Northstar Studio'),false)
})
test('subsidiary facts cannot borrow the parent company founder',()=>{
 const html='<h1>Northstar</h1><p>Website: northstar.test</p><article><h2>Janet Cole</h2><p>Co-founder and Chairman</p></article>'
 assert.equal(ownerBelongsToBusiness(html,'https://northstar.test','Janet Cole','https://parent.test/companies/northstar'),false)
 const schema=html+'<script type="application/ld+json">{"@type":"Organization","name":"Parent Company","founder":{"@type":"Person","name":"Alice Brown","jobTitle":"Founder"}}</script>'
 assert.equal(ownerBelongsToBusiness(schema,'https://northstar.test','Alice Brown','https://parent.test/companies/northstar'),false)
 const table='<table><tr><th>Northstar</th></tr><tr><th>Founders</th><td>Janet Cole</td></tr></table>'
 assert.equal(ownerBelongsToBusiness(table,'https://northstar.test','Janet Cole','https://directory.test/northstar'),true)
})
const db=new LocalDatabase(join(mkdtempSync(join(tmpdir(),'owner-identity-')),'leads.db')),repo=new Repository(db),ws=db.ensureWorkspace().id
try{test('startup cleanup removes prior false names while retaining real contacts and leads',()=>{
 const id=repo.importWebsites(ws,['northstar.test'],false).leadIds[0]
 for(const name of ['Portfolio Websites Get','Massachusetts Internet','Janet Cole'])repo.addDecisionMaker({workspaceId:ws,leadId:id,fullName:name,title:'Founder'})
 assert.equal(repo.pruneNoisyPeople(isUsablePerson).removed,2)
 assert.deepEqual(repo.listDecisionMakers(ws).map(x=>x.full_name),['Janet Cole'])
 assert.equal(db.one('select count(*) as n from leads').n,1)
})}finally{db.close()}
console.log(JSON.stringify({passed:true,checks},null,2))
