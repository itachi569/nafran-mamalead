import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium } from 'playwright'
import { buildLicenseEmail } from '../billing-server/license-email.mjs'

const output = resolve(process.argv[2] || 'release/email-preview')
mkdirSync(output, { recursive: true })
const key = `NF-${'ABCD-'.repeat(9)}WXYZ`
const browser = await chromium.launch({ headless: true })
try {
  for (const kind of ['trial', 'lifetime']) {
    const email = buildLicenseEmail({ to: 'jane.doe+preview@gmail.com', licenseKey: key, kind, download: 'https://mamalead.com/#download' })
    const html = email.html.replace('cid:mamalead-logo', `data:image/png;base64,${email.attachments[0].content}`)
    writeFileSync(resolve(output, `${kind}.html`), html)
    for (const [name, width] of [['desktop', 700], ['mobile', 390]]) {
      const page = await browser.newPage({ viewport: { width, height: 900 }, deviceScaleFactor: 1 })
      await page.setContent(html, { waitUntil: 'load' })
      await page.screenshot({ path: resolve(output, `${kind}-${name}.png`), fullPage: true })
      await page.close()
    }
  }
  console.log(`Email previews saved to ${output}`)
} finally {
  await browser.close()
}
