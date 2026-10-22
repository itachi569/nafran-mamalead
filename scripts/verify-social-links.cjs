const test = require('node:test')
const assert = require('node:assert/strict')
const { WebsiteEnricher } = require('../dist-electron/enrichment/website.js')

async function scan(html) {
  const original = global.fetch
  global.fetch = async () => new Response(html, { headers: { 'content-type': 'text/html' } })
  try { return (await new WebsiteEnricher().inspectSocialFast('https://company.fixture.test')).socials }
  finally { global.fetch = original }
}

test('preserves the ID that identifies a numeric Facebook profile', async () => {
  const rows = await scan('<a href="https://www.facebook.com/profile.php?id=123456789&amp;ref=footer">Facebook</a>')
  assert.equal(rows.length, 1)
  assert.equal(rows[0].profileUrl, 'https://www.facebook.com/profile.php?id=123456789')
  assert.equal(rows[0].handle, '123456789')
})
test('reads escaped JSON social links', async () => {
  const rows = await scan(String.raw`<script>{"sameAs":["https:\/\/instagram.com\/ourcompany\/"]}</script>`)
  assert.equal(rows[0]?.handle, 'ourcompany')
})
test('ignores share links, social home pages, and lookalike hosts', async () => {
  const urls = ['https://facebook.com', 'https://facebook.com/sharer/sharer.php?u=hello', 'https://x.com/intent/tweet', 'https://evilfacebook.com/ourcompany', 'https://instagram.com/p/post123', 'https://youtube.com/watch?v=123']
  assert.deepEqual(await scan(urls.map(url => `<a href="${url}">social</a>`).join('')), [])
})
test('retains real platform profiles and removes tracking parameters', async () => {
  const urls = ['https://instagram.com/ourcompany/?utm_source=site', 'https://facebook.com/ourcompany', 'https://linkedin.com/company/ourcompany', 'https://tiktok.com/@ourcompany', 'https://youtube.com/@ourcompany', 'https://x.com/ourcompany']
  const rows = await scan(urls.map(url => `<a href="${url}">social</a>`).join(''))
  assert.equal(rows.length, 6)
  assert.ok(rows.every(row => !row.profileUrl.includes('utm_source')))
})
test('does not invent social pages when a site publishes none', async () => {
  assert.deepEqual(await scan('<h1>Company</h1>'), [])
})
