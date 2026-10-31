const test=require('node:test')
const assert=require('node:assert/strict')
const {isUsableEmail}=require('../dist-electron/enrichment/website.js')
const {canonicalSocialProfile}=require('../dist-electron/social-profile.js')
test('template addresses and image names are rejected without hiding real business contacts',()=>{
 for(const email of ['test@test.com','yourname@gmail.com','johndoe@gmail.com','info@company.com','logo@2x.png','badge@3x-1.webp','abc@sentry.wixpress.com','you@example.com'])assert.equal(isUsableEmail(email),false,email)
 for(const email of ['info@drnabeel.com','crumbsthebakers@gmail.com','hello-austin@radiantplumbing.com','john.doe@realcompany.pk'])assert.equal(isUsableEmail(email),true,email)
})
test('platform and site-builder profiles are never business profiles',()=>{
 for(const url of ['instagram.com/whatsapp','facebook.com/wix','youtube.com/@YouTube','x.com/twitter'])assert.equal(canonicalSocialProfile('https://'+url),null,url)
 for(const url of ['instagram.com/cakespot.pk','facebook.com/ziadentalcare'])assert.ok(canonicalSocialProfile('https://'+url),url)
})
