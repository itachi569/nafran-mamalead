import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
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
}
const columns = ['Business name', 'Domain', 'Phone', 'Email', 'Address', 'Rating', 'Review count', 'Socials', 'Saved date']

const xlsx = await buildFormattedExport(repository, 'test', { kind: 'leads', format: 'xlsx', limit: 24, delimiter: ',', columns, fileName: 'mamalead-leads' })
const xlsxPath = join(output, 'mamalead-leads.xlsx')
writeFileSync(xlsxPath, xlsx.content)
const workbook = new ExcelJS.Workbook()
await workbook.xlsx.load(xlsx.content)
const sheet = workbook.worksheets[0]
assert.ok(sheet.getBackgroundImageId() != null, 'Excel background logo is missing')
assert.equal(sheet.getImages().length, 1, 'Excel must embed the original header logo')
const embeddedLogo = workbook.getImage(sheet.getImages()[0].imageId)
const hash = value => createHash('sha256').update(value).digest('hex')
assert.equal(hash(Buffer.from(embeddedLogo.buffer)), hash(readFileSync(resolve('electron/export/assets/mamalead-header.png'))), 'Excel header must use the optimized brand asset')
assert.ok(sheet.getRow(1).height >= 58, 'Excel header must have room for the logo')
assert.equal(sheet.getCell('A4').value, 'Business name')
assert.equal(sheet.getCell('A5').value, 'Manchester Clinic 1')
assert.equal(sheet.getCell('A28').value, 'Manchester Clinic 24')
assert.equal(sheet.getCell('A5').border?.right?.style, 'hair')
assert.ok(!sheet.getCell('A5').fill?.pattern || sheet.getCell('A5').fill.pattern === 'none', 'data cell fill would hide the logo background')
assert.equal(sheet.autoFilter, 'A4:I28')
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

// Retired exports must reject explicitly instead of silently producing a wrong table.
for (const format of ['pdf', 'xlsx']) {
  await assert.rejects(() => buildFormattedExport(repository, 'test', { kind: 'people', format, limit: 24, columns: [], fileName: 'retired' }), /no longer available/)
}
console.log('PASS Retired owner exports are rejected; current lead exports keep their branding')
