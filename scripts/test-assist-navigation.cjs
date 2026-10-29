const assert=require('node:assert/strict')
const {assistShortcuts,assistDestinations}=require('../dist-electron/assist-navigation.js')
const {assistMessagesWithWorkflowHint}=require('../dist-electron/assist-workflow.js')
const {assistMessagesWithLanguageHint}=require('../dist-electron/assist-language.js')
for(const [question,answer,page,expected] of [
 ['social profile ka kya kam h','Import websites in Social Profiles.','dashboard',['social']],
 ['reports kahan milti h','Reports shows totals.','email',['reports']],
 ['owner email find karni h','Decision Makers shows published owner emails.','dashboard',['dm']],
 ['email validity kaise karun','Open Email Finder.','dashboard',['email']],
 ['where do I download the app update?','App updates is in Account.','dashboard',['updates']],
 ['رپورٹ کہاں ہے؟','Open Reports.','dashboard',['reports']],
 ['¿Dónde están mis contactos?','Open All Leads.','dashboard',['leads']],
 ['export kaise karun','Export Excel or PDF.','phone',['phone']],
 ['hello','How can I help?','dashboard',[]],
 ['open javascript:alert(1)','https://external.example','dashboard',[]],
])assert.deepEqual(assistShortcuts(question,answer,page),expected,question)
for(const key of Object.keys(assistDestinations))assert.ok(assistDestinations[key].label)
const messages=assistMessagesWithWorkflowHint(assistMessagesWithLanguageHint([{role:'user',content:'mujy social profile k bary m btao'}]))
assert.match(messages[0].content,/Roman Urdu/)
assert.match(messages[0].content,/1-3 short sentences/)
assert.match(messages[0].content,/mujy social profile k bary m btao/)
assert.ok(messages[0].content.length<=1200)
const longQuestion='email '+ 'my real question '.repeat(50)
assert.ok(assistMessagesWithWorkflowHint([{role:'user',content:longQuestion}])[0].content.startsWith(longQuestion),'style guidance must not crowd out the question')
console.log('PASS Assist destinations, owner/email separation, multilingual page names, unknown-link rejection, concise reply and Roman Urdu hints')
