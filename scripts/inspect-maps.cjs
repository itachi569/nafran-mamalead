// Diagnostic helper: opens a Google Maps search, waits for results, then reports
// the feed card markup and the detail-panel fields the scraper depends on.
const { chromium } = require('playwright')

const url = process.argv[2] || 'https://www.google.com/maps/search/physiotherapy+in+Manchester,+United+Kingdom?hl=en&gl=uk'
const headed = process.argv.includes('--headed')

const collapse = (text) => text.replace(/\s+/g, ' ').trim()

async function main() {
  const browser = await chromium.launch({ headless: !headed })
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'en-GB' })
  const page = await context.newPage()
  await page.goto(url, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('div[role="feed"], h1.DUwDvf', { timeout: 25000 })
  await page.waitForSelector('a.hfpxzc', { timeout: 25000 }).catch(() => undefined)
  await page.waitForTimeout(1500)

  const feedInfo = await page.evaluate(() => {
    const feed = document.querySelector('div[role="feed"]')
    if (!feed) return { hasFeed: false }
    const links = Array.from(feed.querySelectorAll('a.hfpxzc'))
    const first = links[0]
    const card = first && first.closest('div[jsaction]')
    const infoLines = card
      ? Array.from(card.querySelectorAll('div.W4Efsd')).map((el) => el.innerText.replace(/\s+/g, ' ').trim())
      : []
    return {
      hasFeed: true,
      linkCount: links.length,
      sponsoredCount: links.filter((l) => /sponsored/i.test((l.closest('div[jsaction]') || l).innerText)).length,
      first: {
        name: first ? first.getAttribute('aria-label') : '',
        href: first ? first.href : '',
        rating: card && card.querySelector('span.MW4etd') ? card.querySelector('span.MW4etd').textContent.trim() : '',
        reviews: card && card.querySelector('span.UY7F9') ? card.querySelector('span.UY7F9').textContent.trim() : '',
        infoLines,
        website: card && card.querySelector('a[data-value="Website"]') ? card.querySelector('a[data-value="Website"]').href : '',
        html: card ? card.outerHTML.replace(/\s+/g, ' ').slice(0, 900) : '',
      },
    }
  })
  console.log('FEED:', JSON.stringify(feedInfo, null, 2))

  if (feedInfo.first && feedInfo.first.href) {
    await page.goto(feedInfo.first.href, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('h1.DUwDvf', { timeout: 20000 }).catch(() => undefined)
    await page.waitForTimeout(1200)
    const detail = await page.evaluate(() => {
      const text = (selector) => {
        const el = document.querySelector(selector)
        return el ? el.textContent.trim() : ''
      }
      const label = (selector) => {
        const el = document.querySelector(selector)
        return el ? el.getAttribute('aria-label') || '' : ''
      }
      const ratingBlock = document.querySelector('div.F7nice')
      return {
        url: location.href,
        name: text('h1.DUwDvf'),
        category: text('button[jsaction*="category"]') || text('div.DkEaL'),
        address: label('button[data-item-id="address"]'),
        phone: label('button[data-item-id^="phone:tel:"]'),
        website: document.querySelector('a[data-item-id="authority"]')
          ? document.querySelector('a[data-item-id="authority"]').href
          : '',
        plusCode: label('button[data-item-id="oloc"]'),
        ratingHidden: ratingBlock ? (ratingBlock.querySelector('span[aria-hidden="true"]') || {}).textContent || '' : '',
        ratingLabel: ratingBlock ? (ratingBlock.querySelector('span[aria-label]') || {}).getAttribute('aria-label') || '' : '',
        itemIds: Array.from(document.querySelectorAll('[data-item-id]')).map((el) => el.getAttribute('data-item-id')).slice(0, 15),
      }
    })
    console.log('DETAIL:', JSON.stringify(detail, null, 2))
  }

  await browser.close()
}

main().catch((error) => {
  console.error('inspect failed:', error.message)
  process.exitCode = 1
})
