import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import ExcelJS from 'exceljs'
import { PDFDocument, PDFName } from 'pdf-lib'

const require = createRequire(import.meta.url)
const { buildFormattedExport } = require('../dist-electron/export/writer.js')
const output = resolve(process.argv[2] || join(tmpdir(), 'nafran-export-preview'))
mkdirSync(output, { recursive: true })

const leads = Array.from({ length: 24 }, (_, index) => ({
  id: `lead-${index + 1}`,
  name: `Manchester Clinic ${index + 1}`,
  website: `https://clinic-${index + 1}.example.org/about/contact`,
  phone: `+44 161 555 ${String(1000 + index)}`,
  address: `${120 + index} Market Street, Manchester, United Kingdom`,
  rating: 4.5,
  review_count: 80 + index,
  captured_at: new Date().toISOString(),
  provider: 'google-maps',
}))
const repository = {
  listLeads(_workspaceId, options) {
    return { rows: leads.slice(options.offset, options.offset + options.limit), total: leads.length }
  },
  listContacts(_workspaceId, _kind, ids) {
    return [{ value: `contact-${ids[0]}@example.org`, score: 90 }]
  },
  listSocialProfiles() { return [{ platform: 'Instagram' }] },
  listDecisionMakers() { return [{ full_name: 'Alex Morgan' }] },
}
const columns = ['Business name', 'Domain', 'Phone', 'Email', 'Address', 'Rating', 'Review count', 'Socials', 'Decision maker', 'Saved date']

const xlsx = await buildFormattedExport(repository, 'test', { kind: 'leads', format: 'xlsx', limit: 24, delimiter: ',', columns, fileName: 'mamalead-leads' })
const xlsxPath = join(output, 'mamalead-leads.xlsx')
writeFileSync(xlsxPath, xlsx.content)
const workbook = new ExcelJS.Workbook()
await workbook.xlsx.load(xlsx.content)
const sheet = workbook.worksheets[0]
assert.ok(sheet.getBackgroundImageId() != null, 'Excel background logo is missing')
assert.equal(sheet.getImages().length, 1, 'Excel must embed the original header logo')
const embeddedLogo = workbook.getImage(sheet.getImages()[0].imageId)
assert.deepEqual(Buffer.from(embeddedLogo.buffer), readFileSync(resolve('electron/export/assets/mamalead-logo.png')), 'Excel header must use the original brand asset')
assert.ok(sheet.getRow(1).height >= 58, 'Excel header must have room for the logo')
assert.equal(sheet.getCell('A4').value, 'Business name')
assert.equal(sheet.getCell('A5').value, 'Manchester Clinic 1')
assert.equal(sheet.getCell('A28').value, 'Manchester Clinic 24')
assert.equal(sheet.getCell('A5').border?.right?.style, 'hair')
assert.ok(!sheet.getCell('A5').fill?.pattern || sheet.getCell('A5').fill.pattern === 'none', 'data cell fill would hide the logo background')
assert.equal(sheet.autoFilter, 'A4:J28')
console.log('PASS  Excel has 24 readable lead rows, columns, filters, borders and logo background')

const pdfExport = await buildFormattedExport(repository, 'test', { kind: 'leads', format: 'pdf', limit: 24, delimiter: ',', columns, fileName: 'mamalead-leads' })
const pdfPath = join(output, 'mamalead-leads.pdf')
writeFileSync(pdfPath, pdfExport.content)
const pdf = await PDFDocument.load(pdfExport.content)
assert.ok(pdf.getPageCount() >= 2, 'sample export should exercise a second PDF page')
const images = [...pdf.context.enumerateIndirectObjects()].filter(([, value]) => value?.dict?.get?.(PDFName.of('Subtype'))?.toString() === '/Image')
assert.ok(images.length >= 2, 'PDF must include both header logo and watermark')
console.log(`PASS  PDF has ${pdf.getPageCount()} pages and embedded logo artwork`)
console.log(`Preview files: ${xlsxPath} | ${pdfPath}`)

const peopleColumns = ['Business name', 'Domain', 'Owner', 'Owner email', 'Source']
const people = Array.from({ length: 6 }, (_, i) => ({
  lead_id: leads[i].id,
  full_name: ['Alex Morgan', 'Sam Taylor', 'Jordan Lee', 'Casey Park', 'Jamie Reed', 'Robin Wells'][i],
  title: i % 2 ? 'Owner' : 'Founder',
  email: `${['alex','sam','jordan','casey','jamie','robin'][i]}@clinic-${i + 1}.example.org`,
  phone: `+44 161 555 ${1100 + i}`,
  business_emails: `hello@clinic-${i + 1}.example.org`,
  business_phones: leads[i].phone,
  lead_address: leads[i].address,
  published_socials: `https://www.facebook.com/sampleclinic${i + 1}\nhttps://www.instagram.com/sampleclinic${i + 1}`,
  linkedin_url: `https://www.linkedin.com/in/sample-contact-${i + 1}`,
  source: `${leads[i].website}/team`,
  created_at: '2026-10-28T00:00:00Z',
}))
const peopleRepository = { getLead: (_workspace, id) => leads.find(lead => lead.id === id), decisionMakerLedger: () => people }
const peopleRequest = { kind: 'people', limit: 6, delimiter: ',', columns: peopleColumns, leadIds: people.map(person => person.lead_id), fileName: 'decision-makers' }
for (const format of ['pdf', 'xlsx']) {
  const result = await buildFormattedExport(peopleRepository, 'test', { ...peopleRequest, format })
  assert.equal(result.rows, 6)
  assert.deepEqual(result.columns, peopleColumns)
  writeFileSync(join(output, `mamalead-decision-makers.${format}`), result.content)
  if (format === 'xlsx') {
    const book = new ExcelJS.Workbook(); await book.xlsx.load(result.content)
    const sheet = book.worksheets[0]
    assert.deepEqual(sheet.getRow(4).values.slice(1), peopleColumns)
    assert.equal(sheet.getCell('C5').value, 'Alex Morgan')
    assert.equal(sheet.getCell('C10').value, 'Robin Wells')
    assert.equal(sheet.getImages().length, 1)
    assert.equal(sheet.autoFilter, 'A4:E10')
    assert.equal(sheet.getCell('D5').value,'alex@clinic-1.example.org')
  } else {
    const document = await PDFDocument.load(result.content)
    assert.equal(document.getPage(0).getWidth(), 842, 'Owner email table uses landscape paper')
  }
}
console.log('PASS Decision Makers PDF and Excel contain five owner-email columns and six owner rows')
