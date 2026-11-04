const test=require('node:test')
const assert=require('node:assert/strict')
const {isUsableEmail,contactFindingsFromHtml}=require('../dist-electron/enrichment/website.js')
const {extractPublishedEmails,extractEmails}=require('../dist-electron/enrichment/email-extractor.js')
const {canonicalSocialProfile}=require('../dist-electron/social-profile.js')
test('template addresses and image names are rejected without hiding real business contacts',()=>{
 for(const email of ['test@test.com','yourname@gmail.com','johndoe@gmail.com','info@company.com','logo@2x.png','badge@3x-1.webp','abc@sentry.wixpress.com','you@example.com'])assert.equal(isUsableEmail(email),false,email)
 for(const email of ['info@drnabeel.com','crumbsthebakers@gmail.com','hello-austin@radiantplumbing.com','john.doe@realcompany.pk'])assert.equal(isUsableEmail(email),true,email)
})
test('platform and site-builder profiles are never business profiles',()=>{
 for(const url of ['instagram.com/whatsapp','facebook.com/wix','youtube.com/@YouTube','x.com/twitter'])assert.equal(canonicalSocialProfile('https://'+url),null,url)
 for(const url of ['instagram.com/cakespot.pk','facebook.com/ziadentalcare'])assert.ok(canonicalSocialProfile('https://'+url),url)
})
test('template mailboxes are excluded from text, mailto and structured contacts',()=>{
 const html='<p>contact@info.com info@yourcompany.com hello@realbiz.pk</p><a href="mailto:sales@business.com">Email</a><script type="application/ld+json">{"email":"support@sample.com"}</script>'
 assert.deepEqual(contactFindingsFromHtml(html,'https://realbiz.pk/contact').emails.map(e=>e.value),['hello@realbiz.pk'])
 for(const domain of ['info.com','mail.com','company.com','yourcompany.com','yoursite.com','website.com','test.com','sample.com','site.com','business.com','email.org']){
  assert.equal(isUsableEmail('contact@'+domain,'https://realbiz.pk'),false,domain)
  assert.deepEqual(extractPublishedEmails('contact@'+domain,'https://realbiz.pk'),[],domain)
  assert.deepEqual(extractEmails('contact@'+domain),[],domain)
 }
})
test('real free-mail users and the business own domain are retained',()=>{
 for(const email of ['clinic@mail.com','john.smith@mail.com','info@realbiz.pk','sales@realbusiness.com'])assert.equal(isUsableEmail(email,'https://realbiz.pk'),true,email)
 assert.deepEqual(contactFindingsFromHtml('<p>support@mail.com</p>','https://www.mail.com/contact').emails.map(e=>e.value),['support@mail.com'])
 assert.equal(isUsableEmail('contact@info.com','https://info.com.evil.org'),false)
 assert.equal(isUsableEmail('info@example.com','https://example.com'),false)
 assert.equal(isUsableEmail('contact@sub.info.com','https://realbiz.pk'),false)
})
