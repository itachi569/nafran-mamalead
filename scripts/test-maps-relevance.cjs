const {test}=require('node:test'),assert=require('node:assert/strict'),{mapsHasNoResults,mapsResultsRelevant}=require('../dist-electron/scraper/relevance.js')
const {mapsBusinessRelevant}=require('../dist-electron/scraper/relevance.js')
const {normaliseQuery}=require('../dist-electron/scraper/types.js')

for (const [keyword,name,category,expected] of [
 ['software house','Arbisoft','Software company',true],
 ['software house','Bright Apps','Software development company',true],
 ['software house','Tech Office','Marketing agency',false],
 ['software house','Code Shop','Computer software store',false],
 ['software house','Design Studio','Website designer',false],
 ['software house','Software House','Restaurant',false],
 ['software house','Learn Code','Software development institute',false],
 ['software house','House Cafe','Cafe',false],
 ['software house','Unknown Business','',false],
 ['software house','Alpha Software House','',true],
 ['dentist','Bright Smile','Dental clinic',true],
 ['dentist','Dentist Cafe','Cafe',false],
 ['dentist','Supply Depot','Dental equipment supplier',false],
 ['pediatric dentist','Family Smiles','Dentist',false],
 ['pediatric dentist','Junior Smiles','Pediatric dentist',true],
 ['skin care doctor','Clear Skin','Dermatologist',true],
 ['skin care doctor','Care Shop','Cosmetics store',false],
 ['lawyers','Smith Legal','Attorney',true],
 ['plumber','Emergency Pipe Repairs','Plumbing service',true],
 ['plumber','Pipe Shop','Plumbing supply store',false],
 ['bar','The Barber','Barber shop',false],
 ['IT','Fitness Studio','Gym',false],
 ['ڈینٹسٹ','Bright Smile','Dental clinic',true],
 ['ڈینٹسٹ','Corner Shop','Grocery store',false],
 ['美容院','青山美容院','美容院',true],
 ['美容院','Restaurant','Restaurant',false],
 ['Arbisoft','Arbisoft','Software company',true],
 ['Arbisoft','Other Company','Software company',false],
 ['software companies in Lahore','Arbisoft','Software company',true],
 ['best dentist near me','Bright Smile','Dental clinic',true],
]) test(`individual relevance: ${keyword} / ${name} / ${category}`,()=>{
 assert.equal(mapsBusinessRelevant(keyword,'Lahore',{name,category}),expected)
})

test('addresses and unrelated neighbours cannot establish keyword relevance',()=>{
 const unrelated={name:'Corner Cafe',category:'Cafe',lines:['Cafe · Software House Road, Lahore']}
 assert.equal(mapsBusinessRelevant('software house','Lahore',unrelated),false)
 assert.equal(mapsBusinessRelevant('software house','Lahore',{name:'Unknown',lines:['Cafe · Software House Road, Lahore']}),false)
 assert.equal(mapsBusinessRelevant('software house','Lahore',{name:'Unknown',lines:['123 Software House Road, Lahore']}),false)
 assert.equal(mapsBusinessRelevant('software house','Lahore',{name:'Unknown',lines:['Software House Road']}),false)
 const list=[{name:'Arbisoft',category:'Software company'},unrelated]
 assert.deepEqual(list.filter(row=>mapsBusinessRelevant('software house','Lahore',row)).map(row=>row.name),['Arbisoft'])
})
test('district query subjects stay aligned through query normalisation',()=>{
 const q=normaliseQuery({keywords:['dentist Clifton',' ','dentist Saddar'],relevanceKeywords:['dentist','','dentist']})
 assert.deepEqual(q.keywords,['dentist Clifton','dentist Saddar']);assert.deepEqual(q.relevanceKeywords,['dentist','dentist'])
 assert.deepEqual(normaliseQuery({keywords:['software house']}).relevanceKeywords,['software house'])
})
test('Maps explicit no-result and gibberish fuzzy matches are rejected',()=>{
 assert.ok(mapsHasNoResults("Google Maps can't find zzqxv nonexistentbusinesstype 9981"))
 assert.ok(mapsHasNoResults('No results found'))
 assert.equal(mapsResultsRelevant('zzqxv nonexistentbusinesstype 9981','Lahore',[{name:'Zouq-E-Saeed Restaurant',lines:['Restaurant']},{name:'ZK Manufacturing',lines:['Manufacturer']}]),false)
})
test('Valid dental and cross-script Urdu queries retain relevant businesses',()=>{
 const rows=[{name:'Bright Smile',lines:['Dental clinic']}]
 assert.ok(mapsResultsRelevant('dentist Lahore','Lahore',rows));assert.ok(mapsResultsRelevant('ڈینٹسٹ','لاہور',rows))
 assert.ok(mapsResultsRelevant('lawyer','London',[{name:'Smith & Co',category:'Attorney'}]))
 assert.equal(mapsHasNoResults('Bright Smile Dental clinic'),false)
})
