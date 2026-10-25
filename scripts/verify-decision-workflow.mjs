import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { readFileSync, mkdirSync } from 'node:fs'
import ExcelJS from 'exceljs'
import { PDFDocument } from 'pdf-lib'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { _electron as electron } from 'playwright'
import { createBillingServer } from '../billing-server/server.mjs'

const root = resolve(import.meta.dirname, '..')
const directory = mkdtempSync(join(tmpdir(), 'nafran-desktop-decision-'))
const delivered = []
let checkoutSession
let checkoutFields
const sessions = new Map()
const fakeStripe = async (raw, request = {}) => {
  const path = new URL(raw).pathname
  let result
  if (path.endsWith('/prices/price_lifetime')) result = { active: true, currency: 'pkr', unit_amount: 1000000, recurring: null }
  else if (path.endsWith('/checkout/sessions') && request.method === 'POST') {
    checkoutFields = new URLSearchParams(request.body)
    checkoutSession = {
      id: `cs_test_direct${sessions.size + 1}`, url: `https://checkout.stripe.com/c/pay/cs_test_direct${sessions.size + 1}`,
      client_reference_id: checkoutFields.get('client_reference_id'), mode: checkoutFields.get('mode'),
      metadata: { product: checkoutFields.get('metadata[product]'), checkoutFlow: checkoutFields.get('metadata[checkoutFlow]') },
      status: 'open', payment_status: 'unpaid', customer: null, customer_details: { email: null },
      payment_intent: 'pi_decision', amount_total: 100000, currency: 'pkr', livemode: false,
    }
    sessions.set(checkoutSession.id, checkoutSession)
    result = checkoutSession
  } else if (/\/checkout\/sessions\/cs_test_direct\d+\/line_items$/.test(path)) result = { data: [{ price: { currency: 'pkr', unit_amount: 100000, recurring: null }, quantity: 1 }] }
  else if (/\/checkout\/sessions\/cs_test_direct\d+$/.test(path)) result = sessions.get(path.split('/').at(-1))
  else if (path.endsWith('/payment_intents/pi_decision')) result = { status: 'succeeded', latest_charge: 'ch_decision' }
  else if (path.endsWith('/charges/ch_decision')) result = { paid: true, refunded: false, amount_refunded: 0, disputed: false, created: Math.floor(Date.now() / 1000) }
  else throw new Error(`Unexpected Stripe request: ${path}`)
  return { ok: true, json: async () => result }
}
const service = createBillingServer({
  env: {
    STRIPE_SECRET_KEY: 'sk_test_decision', STRIPE_PRICE_LIFETIME: 'price_lifetime',
    BILLING_DB_PATH: join(directory, 'billing.db'), BILLING_PORT: '0',
    BILLING_PUBLIC_URL: 'http://127.0.0.1:38747', DOWNLOAD_SIGNING_KEY: 'desktop-decision-test-signing-secret-123456',
  },
  fetch: fakeStripe,
  sendEmail: async (message) => { delivered.push(message); return true },
})
const reportDir = resolve(root, '../../work/decision-workflow-check')
mkdirSync(reportDir, { recursive: true })
const seenPages = []
const fixture = createServer((req, res) => {
  seenPages.push(req.url)
  res.setHeader('content-type', 'text/html')
  const name = req.url.split('/')[1]
  if (name === 'alpha' && req.url.endsWith('/team')) {
    res.end(`<html><body><h1>Our team</h1><a href="/professionals/alice-morgan">Alice Morgan</a><article><h2>Ben Carter</h2><h3>COO</h3><a href="mailto:ben@alpha.fixture.test">Email me</a><a href="tel:+441615551235">Direct phone</a><a href="https://www.linkedin.com/in/ben-carter-fixture/">LinkedIn</a></article><article><h2>Clara Stone</h2><p>Founder</p></article><footer><a href="mailto:info@alpha.fixture.test">Email us</a></footer></body></html>`)
  } else if(name==='alpha' && req.url.includes('/professionals/alice-morgan')) {
    res.end(`<html><body><script type="application/ld+json">{"@type":"ProfilePage","mainEntity":{"@type":"Person","name":"Alice Morgan","jobTitle":"Chief Executive Officer","email":"alice@alpha.fixture.test","telephone":"+441615551234","sameAs":["https://www.linkedin.com/in/alice-morgan-example/"]}}</script></body></html>`)
  } else if(name==='alpha' && req.url.endsWith('/contact')) {
    res.end(`<html><body><address>25 Clifton Road, Karachi, Pakistan</address><address>12 Main Street, Lahore, Pakistan</address><script type="application/ld+json">{"@type":"Organization","email":"office@alpha.fixture.test","telephone":"+922112345678"}</script></body></html>`)
  } else if (name === 'alpha') res.end('<html><body><h1>Alpha</h1><a href="/team">Meet our team</a><a href="/contact">Contact us</a><a href="mailto:info@alpha.fixture.test">Email us</a><a href="https://www.facebook.com/alphafixture">Facebook</a><a href="https://www.instagram.com/alphafixture/">Instagram</a></body></html>')
  else if (name === 'old') res.end('<html><body><script type="application/ld+json">{"@type":"Person","name":"Previous Person","jobTitle":"Owner"}</script></body></html>')
  else res.end('<html><body><h1>No people published</h1></body></html>')
})
let desktop
try {
  await new Promise((done) => service.server.listen(0, '127.0.0.1', done))
  await new Promise((done) => fixture.listen(0, '127.0.0.1', done))
  const origin = `http://127.0.0.1:${service.server.address().port}`
  const fixtureOrigin = `http://127.0.0.1:${fixture.address().port}`
  const env = { ...process.env, APPDATA: join(directory, 'appdata'), LEADSNAP_BILLING_API_URL: origin }
  delete env.ELECTRON_RUN_AS_NODE
  const packaged = process.env.NAFRAN_TEST_PACKAGED === '1'
  desktop = await electron.launch(packaged ? { executablePath: resolve(root, 'release/win-unpacked/MamaLead.exe'), args: [`--user-data-dir=${join(directory,'profile')}`], env, timeout: 60000 } : { args: ['.', `--user-data-dir=${join(directory,'profile')}`], cwd: root, env, timeout: 60000 })
  await desktop.evaluate(({ shell }, { origin, fixtureOrigin }) => {
    shell.openExternal = async () => {}
    const native = globalThis.fetch
    globalThis.fetch = async (input, init) => {
      const url = new URL(String(input))
      if (url.origin === 'https://api.mamalead.com') return native(new URL(url.pathname + url.search, origin), init)
      if (/^(old|alpha|empty)\.fixture\.test$/.test(url.hostname)) {
        const response = await native(`${fixtureOrigin}/${url.hostname.split('.')[0]}${url.pathname}`, init)
        Object.defineProperty(response, 'url', { value: url.href })
        return response
      }
      return native(input, init)
    }
  }, { origin, fixtureOrigin })
  const page = await desktop.firstWindow()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.waitForSelector('[data-view="dm"]')
  await page.evaluate(() => window.desktop.billing.checkout('decisionMaker', ''))
  checkoutSession.status = 'complete'; checkoutSession.payment_status = 'paid'
  checkoutSession.customer = 'cus_decision'; checkoutSession.customer_details.email = 'decision@fixture.test'
  await page.waitForFunction(async () => (await window.desktop.billing.status()).decisionMaker?.active)
  await page.evaluate(()=>window.dispatchEvent(new Event('nafran:billing-updated')))
  await page.waitForTimeout(800)
  await page.click('[data-view="dm"]')
  assert.equal(await page.locator('[data-person="1"]').count(), 0)
  console.log('PASS Decision Makers starts with no previous workspace contacts')
  async function scan(host, names) {
    await page.locator('[data-socbar="1"]').getByRole('button', { name: 'Import websites', exact: true }).click()
    await page.locator('[data-imptext="1"]').fill(host)
    await page.locator('[data-socimpgo="1"]').click()
    await page.waitForFunction((expected) => {
      const card = document.querySelector('[data-fres="dm"]')?.closest('section')
      const text = card?.textContent || ''
      const button = card?.querySelector('button')
      return expected.every((name) => text.includes(name)) && button && !button.disabled
    }, names, { timeout: 60000 })
    await page.waitForTimeout(650)
  }
  await scan('old.fixture.test', ['Previous Person'])
  await scan('alpha.fixture.test', ['Alice Morgan','Ben Carter','Clara Stone'])
  const resultCard = page.locator('section').filter({ has: page.locator('[data-fres="dm"]') })
  assert.equal(await resultCard.locator('[data-scanrow]').count(), 1)
  assert.ok(!(await page.locator('body').innerText()).includes('Previous Person'))
  assert.equal(await page.locator('[data-person="1"]').count(), 3)
  assert.ok(seenPages.includes('/alpha/team'))
  assert.ok(seenPages.includes('/alpha/professionals/alice-morgan'))
  assert.ok(seenPages.includes('/alpha/contact'))
  const detailRows=await page.evaluate(()=>window.desktop.local.people.ledger())
  const ben=detailRows.find(person=>person.full_name==='Ben Carter')
  const clara=detailRows.find(person=>person.full_name==='Clara Stone')
  assert.equal(ben.email,'ben@alpha.fixture.test')
  assert.equal(ben.phone.replace(/\s/g,''),'+441615551235')
  assert.equal(ben.linkedin_url,'https://www.linkedin.com/in/ben-carter-fixture/')
  assert.equal(clara.email,'');assert.equal(clara.phone,'')
  assert.ok(ben.business_emails.includes('info@alpha.fixture.test'))
  assert.ok(ben.business_emails.includes('office@alpha.fixture.test'))
  assert.ok(ben.business_phones.includes('+922112345678'))
  assert.ok(ben.lead_address.includes('25 Clifton Road') && ben.lead_address.includes('12 Main Street'))
  assert.ok(ben.published_socials.includes('facebook.com/alphafixture') && ben.published_socials.includes('instagram.com/alphafixture'))
  for(const text of ['25 Clifton Road','12 Main Street','info@alpha.fixture.test','+922112345678','facebook.com/alphafixture']) assert.ok((await resultCard.innerText()).includes(text),text)
  console.log('PASS direct person and general website contacts, two office addresses, Facebook/Instagram/LinkedIn persist and display; no shared footer contacts attributed to Clara')

  const headingTop = await page.locator('[data-fres="dm"]').evaluate((el) => el.getBoundingClientRect().top)
  const toolbarBottom = await page.locator('[data-socbar="1"]').evaluate((el) => el.getBoundingClientRect().bottom)
  assert.ok(headingTop >= toolbarBottom && headingTop < 600, `People Found top: ${headingTop}; toolbar bottom: ${toolbarBottom}`)
  console.log('PASS homepage links to team; all 3 people found, old scan excluded, People Found auto-scrolls')
  const search = page.locator('[data-fq="dm"]')
  for (const [query, name] of [['Alice','Alice Morgan'],['COO','Ben Carter']]) {
    await search.fill(query)
    await page.waitForFunction(() => document.querySelectorAll('[data-person="1"]').length === 1)
    assert.ok((await page.locator('[data-person="1"]').innerText()).includes(name))
    assert.ok((await resultCard.innerText()).includes(name))
  }
  await search.fill('no-such-person-xyz')
  await page.waitForFunction(() => document.querySelectorAll('[data-person="1"]').length === 0)
  assert.equal(await resultCard.locator('[data-scanrow]').count(),0)
  await search.fill('alpha.fixture.test')
  await page.waitForFunction(() => document.querySelectorAll('[data-person="1"]').length === 3)
  await search.fill('')
  console.log('PASS Decision Makers search after import: person, role, business/domain, no match and clear')
  if (process.env.NAFRAN_WEBSITE_SHOTS === '1') {
    const output = resolve(root, `website/img/app/v${JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version}`)
    mkdirSync(output, { recursive: true })
    await desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1440, 960))
    const dismiss = page.getByRole('button', { name: 'Dismiss trial and Lifetime notice' })
    if (await dismiss.count()) await dismiss.click()
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.waitForTimeout(3000)
    await page.screenshot({ path: join(output, 'dm.png') })
    await page.getByRole('button', { name: 'Download Excel (.xlsx)', exact: true }).scrollIntoViewIfNeeded()
    await page.waitForTimeout(500)
    await page.screenshot({ path: join(output, 'dm-export.png') })
  }
  await desktop.evaluate(({ dialog }) => { dialog.showSaveDialog = async () => ({ canceled: true }) })
  await page.getByRole('button', { name: 'Download Excel (.xlsx)', exact: true }).click()
  await page.waitForTimeout(400)
  assert.equal(await page.locator('[data-person="1"]').count(), 3)
  assert.equal(await page.getByText('What to export', { exact: true }).count(), 0)
  console.log('PASS direct export opens no legacy modal; cancel keeps scan results')
  await desktop.evaluate(({ dialog }) => { dialog.showSaveDialog = async () => { throw new Error('Simulated save failure') } })
  await page.getByRole('button', { name: 'Download PDF', exact: true }).click()
  await page.waitForTimeout(400)
  assert.equal(await page.locator('[data-person="1"]').count(), 3)
  console.log('PASS failed save keeps current scan results')
  const xlsxPath = join(reportDir, 'decision-makers.xlsx')
  await desktop.evaluate(({ dialog }, path) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: path }) }, xlsxPath)
  await page.getByRole('button', { name: 'Download Excel (.xlsx)', exact: true }).click()
  await page.waitForFunction(() => !document.querySelector('[data-fres="dm"]'), null, { timeout: 20000 })
  assert.equal(await page.locator('[data-person="1"]').count(), 0)
  const workbook = new ExcelJS.Workbook(); await workbook.xlsx.readFile(xlsxPath)
  const values = JSON.stringify(workbook.worksheets[0].getSheetValues())
  for (const value of ['Alice Morgan','Ben Carter','Clara Stone','alice@alpha.fixture.test','+441615551234','https://www.linkedin.com/in/alice-morgan-example/']) assert.ok(values.includes(value), value)
  for(const value of ['Business address','Published social links','25 Clifton Road','12 Main Street','info@alpha.fixture.test','+922112345678','facebook.com/alphafixture','instagram.com/alphafixture','ben@alpha.fixture.test'])assert.ok(values.includes(value),value)
  assert.ok(!values.includes('Previous Person'))
  console.log('PASS branded Excel includes all current people and published contact fields; scan resets after save')
  await scan('alpha.fixture.test', ['Alice Morgan','Ben Carter','Clara Stone'])
  await page.screenshot({ path: join(reportDir, 'people-found.png') })
  const pdfPath = join(reportDir, 'decision-makers.pdf')
  await desktop.evaluate(({ dialog }, path) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: path }) }, pdfPath)
  await page.getByRole('button', { name: 'Download PDF', exact: true }).click()
  await page.waitForFunction(() => !document.querySelector('[data-fres="dm"]'), null, { timeout: 20000 })
  const pdf = await PDFDocument.load(readFileSync(pdfPath)); assert.ok(pdf.getPageCount() >= 1)
  const saved = await page.evaluate(() => window.desktop.local.people.ledger())
  assert.equal(saved.filter((person) => person.full_name === 'Previous Person').length, 1)
  assert.equal(saved.filter((person) => person.full_name === 'Alice Morgan').length, 1)
  console.log('PASS branded PDF saves, view resets, previous and current contacts stay safely in the database')
  await page.locator('[data-socbar="1"]').getByRole('button', { name: 'Import websites', exact: true }).click()
  await page.locator('[data-imptext="1"]').fill('empty.fixture.test')
  await page.locator('[data-socimpgo="1"]').click()
  await page.waitForFunction(async () => {
    return (await window.desktop.local.jobs.covered('decision-maker', ['done'])).length === 3
  }, null, { timeout: 60000 })
  await page.waitForTimeout(2000)
  assert.equal(await page.locator('[data-person="1"]').count(), 0)
  assert.ok(!(await page.locator('body').innerText()).includes('Alice Morgan'))
  assert.ok(await page.getByRole('button', { name: 'Download PDF', exact: true }).isDisabled())
  console.log('PASS website without published people shows no old or invented contacts and disables export')
  assert.deepEqual(errors, [])
  console.log(`PASS ${packaged ? 'packaged' : 'development'} complete import → scan → people → Excel/PDF → reset flow`)
} finally {
  if (desktop) await desktop.close().catch(() => {})
  service.close(); fixture.close()
  console.log(`Isolated test data: ${directory}`)
}
