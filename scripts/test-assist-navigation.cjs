const assert=require('node:assert/strict')
const {assistShortcuts,assistDestinations}=require('../dist-electron/assist-navigation.js')
const {assistMessagesWithWorkflowHint}=require('../dist-electron/assist-workflow.js')
const {assistMessagesWithLanguageHint}=require('../dist-electron/assist-language.js')
for(const [question,answer,page,expected] of [
 ['social profile ka kya kam h','Import websites in Social Profiles.','dashboard',['social']],
 ['reports kahan milti h','Reports shows totals.','email',['reports']],
 ['owner email find karni h','Decision Makers is no longer available.','dashboard',[]],
 ['email validity kaise karun','Open Email Finder.','dashboard',['email']],
 ['where do I download the app update?','App updates is in Account.','dashboard',['updates']],
 ['رپورٹ کہاں ہے؟','Open Reports.','dashboard',['reports']],
 ['¿Dónde están mis contactos?','Open All Leads.','dashboard',['leads']],
 ['export kaise karun','Export Excel or PDF.','phone',['phone']],
 ['hello','How can I help?','dashboard',[]],
 ['open javascript:alert(1)','https://external.example','dashboard',[]],
 ['how to contact with your conmapny?', 'Use Settings & Billing > Account for our email and phone details.', 'email', ['support']],
 ['What is your company email or phone number?', 'Email Finder and Phone Finder.', 'dashboard', ['support']],
 ['apki company se rabta kasy karun?', 'Contact Support.', 'phone', ['support']],
 ['آپ سے رابطہ کیسے کروں؟', 'Contact Support.', 'dashboard', ['support']],
 ['Contact support about a broken Email Finder scan', 'Open Email Finder.', 'email', ['support']],
 ['can you find company emails?', 'Open Email Finder.', 'dashboard', ['email']],
 ['how do I use your phone finder?', 'Phone Finder scans websites.', 'dashboard', ['phone']],
 ['tell me more', 'You can find email and phone details on Account.', 'dashboard', ['account']],
 ['hello', 'Contact us using an email or phone number.', 'dashboard', []],
])assert.deepEqual(assistShortcuts(question,answer,page),expected,question)
for(const key of Object.keys(assistDestinations))assert.ok(assistDestinations[key].label)
const messages=assistMessagesWithWorkflowHint(assistMessagesWithLanguageHint([{role:'user',content:'mujy social profile k bary m btao'}]))
assert.match(messages[0].content,/Roman Urdu/)
assert.match(messages[0].content,/1-3 short sentences/)
assert.match(messages[0].content,/mujy social profile k bary m btao/)
assert.ok(messages[0].content.length<=1200)
const support=assistMessagesWithWorkflowHint(assistMessagesWithLanguageHint([{role:'user',content:'apki company se rabta kasy karun?'}]))[0].content
assert.match(support,/Settings & Billing > Account > Help & support/)
assert.doesNotMatch(support,/in the sidebar/)
assert.match(support,/Do not claim our email\/phone details are listed there/)
assert.match(support,/Roman Urdu/)
const longQuestion='email '+ 'my real question '.repeat(50)
assert.ok(assistMessagesWithWorkflowHint([{role:'user',content:longQuestion}])[0].content.startsWith(longQuestion),'style guidance must not crowd out the question')
console.log('PASS Assist destinations, owner/email separation, multilingual page names, unknown-link rejection, concise reply and Roman Urdu hints')
