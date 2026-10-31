const {test}=require('node:test'),assert=require('node:assert/strict'),{mapsHasNoResults,mapsResultsRelevant}=require('../dist-electron/scraper/relevance.js')
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
