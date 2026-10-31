import {localDate} from '../local-date'
// Writes an export to disk.
//
// The export modal already lets a scope and a column set be chosen; this is the half that was
// missing, and it is why the modal's Download button used to do nothing. Everything is written
// locally: no upload, no network.
import { readFileSync, writeFileSync } from 'node:fs'
import { app, dialog, type BrowserWindow } from 'electron'
import { join } from 'node:path'
import ExcelJS from 'exceljs'
import fontkit from '@pdf-lib/fontkit'
import { phoneInfo } from '../phone-format'
import { PDFDocument, rgb, type PDFFont, type PDFImage, type PDFPage } from 'pdf-lib'
import type { Repository } from '../db/repository'

import {compareEmailContacts} from '../email-ranking'

const logoAsset = join(__dirname, 'assets', 'mamalead-print.jpeg')
const headerLogoAsset = join(__dirname, 'assets', 'mamalead-header.png')
const watermarkAsset = join(__dirname, 'assets', 'mamalead-sheet.png')

export type ExportKind = 'leads' | 'runs' | 'invoices' | 'profiles' | 'website'
export type ExportFormat = 'csv' | 'xlsx' | 'pdf'

export interface ExportRequest {
  kind: ExportKind
  /** How many rows the chosen scope covers, as the modal states it. */
  limit: number
  delimiter: string
  /** Column labels the user left switched on, in the order the modal lists them. */
  columns: string[]
  fileName: string
  format?: ExportFormat
  /** Exact leads selected by the finder; an empty selection never falls back to all leads. */
  leadIds?: string[]
  /** Applied to the whole database for a filtered lead export, not just rendered rows. */
  leadFilter?: 'all' | 'phone' | 'email' | 'social' | 'missing'
  search?: string
  runId?: string
  lookupJobId?: string
}

export interface ExportResult {
  path: string
  fileName: string
  rows: number
  columns: number
  bytes: number
}

/** Turns a column label from the modal into the value it stands for. */
type ColumnReader = (row: Record<string, unknown>) => string

function text(value: unknown): string {
  if (value === null || value === undefined) return ''
  return String(value)
}

function shortDate(iso: unknown): string {
  const raw = text(iso)
  if (!raw) return ''
  const date = new Date(raw)
  return Number.isNaN(date.getTime()) ? raw : localDate(date)
}

function duration(ms: unknown): string {
  const total = Number(ms ?? 0)
  if (!total) return ''
  const seconds = Math.round(total / 1000)
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}

function numberedEmails(values:string[]):string {
  const unique=Array.from(new Set(values.map(value=>value.trim().toLowerCase()).filter(Boolean)))
  return unique.length>1?unique.map((value,index)=>`${index+1}. ${value}`).join('\n'):unique[0]??''
}

const LEAD_COLUMNS: Record<string, ColumnReader> = {
  'Business name': (row) => text(row.name),
  Domain: (row) => text(row.website).replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0],
  Phone: (row) => text(row.phone),
  Email: (row) => text(row.all_emails ?? row.best_email),
  Address: (row) => text(row.address),
  Rating: (row) => text(row.rating),
  'Review count': (row) => text(row.review_count),
  Socials: (row) => text(row.socials),
  Score: (row) => text(row.score),
    Source: (row) => text(row.provider),
  'Saved date': (row) => shortDate(row.captured_at),
}

const RUN_COLUMNS: Record<string, ColumnReader> = {
  'Started at': (row) => shortDate(row.started_at),
  Keywords: (row) => {
    try {
      return (JSON.parse(text(row.keywords)) as string[]).join(', ')
    } catch {
      return text(row.keywords)
    }
  },
  Source: (row) => text(row.provider),
  Location: (row) => text(row.location),
  'Places captured': (row) => text(row.found),
  Duration: (row) => duration(row.duration_ms),
  Status: (row) => text(row.status),
  'Error reason': (row) => text(row.error),
  'Credits used': () => '1',
}

const INVOICE_COLUMNS: Record<string, ColumnReader> = {
  'Invoice number': (row) => text(row.number),
  Issued: (row) => text(row.issued),
  Description: (row) => text(row.description),
  Net: (row) => text(row.net),
  VAT: (row) => text(row.vat),
  Total: (row) => text(row.total),
  Status: (row) => text(row.status),
  'PDF link': () => '',
}

const PROFILE_COLUMNS: Record<string, ColumnReader> = {
  'Business name': (row) => text(row.name),
  Domain: (row) => text(row.website).replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0],
  Platform: (row) => text(row.platform),
  Handle: (row) => text(row.handle),
  'Profile URL': (row) => text(row.profile_url),
  Followers: (row) => text(row.followers),
  Verified: (row) => (Number(row.verified) ? 'Yes' : 'No'),
  Discovered: (row) => shortDate(row.discovered_at),
}

const DELIMITERS: Record<string, string> = { csv: ',', tsv: '\t', ';': ';' }

function escapeCell(value: string, delimiter: string): string {
  if (value.includes('"') || value.includes('\n') || value.includes('\r') || value.includes(delimiter)) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

/**
 * The rows behind each scope, read from the local database.
 *
 * Leads carry their best address, their social profiles and any named contact, because those
 * live in their own tables and an export that omitted them would be less useful than the page.
 */
function rowsFor(
  repository: Repository,
  workspaceId: string,
  request: ExportRequest,
): { columns: Record<string, ColumnReader>; rows: Record<string, unknown>[] } {
  if (!['leads','runs','invoices','profiles','website'].includes(request.kind)) throw new Error('This export module is no longer available.')
  if (request.kind === 'runs') {
    return { columns: RUN_COLUMNS, rows: repository.listRuns(workspaceId, Math.max(1, request.limit)) as unknown as Record<string, unknown>[] }
  }

  if (request.kind === 'invoices') {
    // Stripe invoices are displayed through the authenticated billing service. A local plan row
    // is not evidence of a charge and must never be turned into an invoice export.
    return { columns: INVOICE_COLUMNS, rows: [] }
  }

  if (request.kind === 'profiles') {
    const profiles = repository.profileExportRows(workspaceId, request.leadIds ?? [])
    return {
      columns: PROFILE_COLUMNS,
      rows: profiles,
    }
  }

  if (request.kind === 'website') {
    if (!request.lookupJobId) throw new Error('Choose a Website Lookup scan to export.')
    const session=repository.websiteLookupSession(workspaceId,request.lookupJobId)
    if (!session) throw new Error('That Website Lookup scan could not be found.')
    const selected=request.leadIds === undefined ? null : new Set(request.leadIds)
    const rows=session.rows.filter(row=>!selected || selected.has(row.leadId)).slice(0,Math.max(0,request.limit))
    return { columns: {
      'Business name': row=>text(row.businessName), Website: row=>text(row.website),
      Emails: row=>numberedEmails([...(row.emails as {value:string;score?:number;source?:string}[])].sort(compareEmailContacts).map(item=>item.value)),
      'Phone numbers': row=>(row.phones as {value:string}[]).map(item=>item.value).join('\n'),
      'Business address': row=>text(row.address),
      'Social links': row=>(row.socials as {url:string}[]).map(item=>item.url).join('\n'),
      Sources: row=>(row.sources as string[]).join('\n'),
      Status: row=>row.status === 'done' ? ((row.emails as unknown[]).length || (row.phones as unknown[]).length || (row.socials as unknown[]).length || row.address ? 'Found' : 'No public details') : text(row.status),
      Error: row=>text(row.error),
    }, rows: rows as unknown as Record<string,unknown>[] }
  }

  const rows = [] as ReturnType<Repository['listLeads']>['rows']
  const wanted = Math.max(0, request.limit)
  // Explicit selections must not fall back to the first N rows in the whole database.
  if (request.leadIds !== undefined) {
    for (const id of [...new Set(request.leadIds)].slice(0, wanted)) {
      const lead = repository.getLead(workspaceId, id)
      if (lead) rows.push(lead)
    }
  }
  while (request.leadIds === undefined && rows.length < wanted) {
    const page = repository.listLeads(workspaceId, {
      limit: Math.min(500, wanted - rows.length),
      offset: rows.length,
      filter: request.leadFilter,
      search: request.search,
      runId: request.runId,
    })
    if (!page.rows.length) break
    rows.push(...page.rows)
    if (rows.length >= page.total) break
  }
  const enriched = rows.map((lead) => {
    const phones = (repository.listContacts(workspaceId,'phone',[lead.id]) as {value:string;score:number|null}[]).sort((a,b)=>(b.score??0)-(a.score??0))
    const bestPhone=phones.find(phone=>(phone.score??0)>=50)?.value
    const phoneValues=[bestPhone,lead.phone,...phones.map(item=>item.value)].filter((value):value is string=>Boolean(value && value.replace(/\D/g,'').length>=9 && value.replace(/\D/g,'').length<=15))
    const allPhones=Array.from(new Map(phoneValues.map(value=>{const normalized=phoneInfo(value,lead.address+' '+lead.website).number;return [normalized.replace(/\D/g,''),normalized]})).values())
    const emails = (repository.listContacts(workspaceId, 'email', [lead.id]) as { value: string; score: number | null;source?:string }[]).sort(compareEmailContacts).slice(0,1)
    const socials = repository.listSocialProfiles(workspaceId, [lead.id]) as { platform: string }[]

    const best = emails[0]
    return {
      ...lead,
      phone: allPhones.join('\n'),
      best_email: best?.value ?? '',
      all_emails:numberedEmails(emails.map(item=>item.value)),
      socials: socials.map((social) => social.platform).join(', '),

    }
  })
  return { columns: LEAD_COLUMNS, rows: enriched }
}

export interface ExportPayload {
  body: string
  rows: number
  columns: string[]
}

interface ExportTable {
  columns: string[]
  values: string[][]
}

function exportTable(repository: Repository, workspaceId: string, request: ExportRequest): ExportTable {
  const { columns, rows } = rowsFor(repository, workspaceId, request)
  const chosen = request.columns.filter((label) => columns[label])
  if (!chosen.length) throw new Error('Choose at least one column to export.')
  const values=rows.map(row=>chosen.map(label=>columns[label](row)))
  const phoneColumn=chosen.indexOf('Phone')
  if(request.format==='xlsx' && phoneColumn>=0){
    const max=Math.max(1,...values.map(row=>row[phoneColumn].split('\n').filter(Boolean).length))
    if(max>1){
      chosen.splice(phoneColumn,1,...Array.from({length:max},(_,i)=>'Phone '+(i+1)))
      for(const row of values){const phones=row[phoneColumn].split('\n');row.splice(phoneColumn,1,...Array.from({length:max},(_,i)=>phones[i]||''))}
    }
  }
  return {columns:chosen,values}
}

/**
 * Builds the file's contents without touching the file system or the UI, so the same code path
 * that writes an export can be tested without a save dialog.
 */
export function buildExport(
  repository: Repository,
  workspaceId: string,
  request: ExportRequest,
): ExportPayload {
  const table = exportTable(repository, workspaceId, request)
  const separator = DELIMITERS[request.delimiter] ?? ','
  const body = [
    table.columns.join(separator),
    ...table.values.map((row) => row.map((value) => escapeCell(value, separator)).join(separator)),
  ].join('\n')

  return { body: `${body}\n`, rows: table.values.length, columns: table.columns }
}

function exportTitle(kind: ExportKind): string {
  return kind === 'website' ? 'Website Lookup' : kind === 'profiles' ? 'Social Profiles' : kind === 'runs' ? 'Run History' : kind === 'invoices' ? 'Invoices' : 'Leads'
}

async function buildXlsx(table: ExportTable, kind: ExportKind): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'MamaLead'
  workbook.title = `MamaLead - ${exportTitle(kind)}`
  workbook.subject = `${exportTitle(kind)} export`
  const sheet = workbook.addWorksheet(exportTitle(kind))
  const watermark = workbook.addImage({ buffer: readFileSync(watermarkAsset) as any, extension: 'png' })
  sheet.addBackgroundImage(watermark)
  const lastColumn = Math.max(1, table.columns.length)
  const lastColumnLetter = sheet.getColumn(lastColumn).letter
  sheet.columns = table.columns.map((column, index) => ({
    key: column,
    width: Math.min(column === 'Profile URL' ? 65 : 48, Math.max(
      column === 'Profile URL' ? 36 : 15,
      column.length + 3,
      ...table.values.slice(0, 100).map((row) => String(row[index] ?? '').length + 2),
    )),
  }))

  // Branding is part of the sheet itself, so it also appears when opened or printed.
  sheet.mergeCells(1, 1, 1, lastColumn)
  sheet.getRow(1).height = 58
  const headerLogo = workbook.addImage({ buffer: readFileSync(headerLogoAsset) as any, extension: 'png' })
  // Embed the actual brand artwork as a drawing, not only a worksheet background.
  sheet.addImage(headerLogo, {
    tl: { col: 0.05, row: 0.1 },
    ext: { width: 96, height: 96 * 584 / 892 },
    editAs: 'oneCell',
  })
  sheet.mergeCells(2, 1, 2, lastColumn)
  sheet.getCell(2, 1).value = `${exportTitle(kind)}  |  ${table.values.length} ${table.values.length===1?'row':'rows'}  |  ${localDate()}`
  sheet.getCell(2, 1).font = { name: 'Aptos', size: 11, color: { argb: 'FF435042' } }
  sheet.getCell(2, 1).alignment = { vertical: 'middle', indent: 2 }
  sheet.getRow(2).height = 27
  sheet.getRow(3).height = 10
  for (let column = 1; column <= lastColumn; column += 1) {
    sheet.getCell(1, column).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1C1C1C' } }
    sheet.getCell(2, column).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE6EBE1' } }
  }

  sheet.addRow(table.columns)
  for (const row of table.values) sheet.addRow(row.map((value,index)=>{
    const numeric=['Rating','Review count','Score','Found','Max results'].includes(table.columns[index])
    return numeric && String(value).trim()!=='' && Number.isFinite(Number(value)) ? Number(value) : value
  }))
  const headerRow = sheet.getRow(4)
  headerRow.height = 30
  headerRow.font = { name: 'Aptos', size: 11, bold: true, color: { argb: 'FFFFFFFF' } }
  headerRow.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF27302A' } }
  headerRow.eachCell((cell) => {
    cell.border = { right: { style: 'hair', color: { argb: 'FF758172' } } }
  })

  table.values.forEach((values, index) => {
    const row = sheet.getRow(index + 5)
    const wrappedLines = Math.max(1, ...values.map((value, column) => value.split(/\r?\n/).reduce((total, line) => total + Math.max(1, Math.ceil(line.length / Math.max(10, Number(sheet.getColumn(column + 1).width ?? 25) - 2))), 0)))
    row.height = Math.min(409,Math.max(30,wrappedLines*14+10))
    row.alignment = { vertical: 'middle', wrapText: true }
    row.font = { name: 'Aptos', size: 10, color: { argb: 'FF1C1C1C' } }
    row.eachCell((cell, columnNumber) => {
      cell.border = {
        bottom: { style: 'hair', color: { argb: 'FFDDE2DA' } },
        right: { style: 'hair', color: { argb: 'FFDDE2DA' } },
      }
      const label = table.columns[columnNumber - 1]
      const url = String(values[columnNumber - 1] ?? '')
      if (label === 'Profile URL' && /^https?:\/\//i.test(url)) {
        cell.value = { text: url, hyperlink: url }
        cell.font = { name: 'Aptos', size: 10, underline: true, color: { argb: 'FF315F76' } }
      }
    })
  })
  sheet.autoFilter = { from: { row: 4, column: 1 }, to: { row: Math.max(4, table.values.length + 4), column: lastColumn } }
  sheet.views = [{ state: 'frozen', ySplit: 4 }]
  sheet.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: '1:4', printArea: `A1:${lastColumnLetter}${Math.max(4, table.values.length + 4)}` }
  sheet.headerFooter.oddFooter = `&Lmamalead&C${exportTitle(kind)}&RPage &P of &N`
  return Buffer.from(await workbook.xlsx.writeBuffer({zip:{compression:'DEFLATE',compressionOptions:{level:9}}}))
}

function pdfText(value: string): string {
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
}

function drawPdfBrandHeader(page: PDFPage, logo: PDFImage, font: PDFFont, bold: PDFFont, title: string, summary: string, margin: number): void {
  const { width, height } = page.getSize()
  const size = logo.scaleToFit(84, 55)
  page.drawRectangle({ x: 0, y: height - 78, width, height: 78, color: rgb(.11, .11, .11) })
  page.drawImage(logo, { x: margin, y: height - 65, ...size })
  page.drawText(title, { x: margin + 104, y: height - 34, size: 16, font: bold, color: rgb(1, 1, 1) })
  page.drawText(summary, { x: margin + 104, y: height - 53, size: 9, font, color: rgb(.78, .84, .73) })
}

function pdfCellLines(value: string, font: PDFFont, size: number, width: number): string[] {
  const source = pdfText(value).replace(/\s+/g, ' ').trim()
  if (!source) return ['']
  const lines: string[] = []
  let line = ''
  for (const word of source.split(' ')) {
    const candidate = line ? `${line} ${word}` : word
    if (font.widthOfTextAtSize(candidate, size) <= width) {
      line = candidate
      continue
    }
    if (line) lines.push(line)
    line = ''
    // A URL may have no spaces; split it by measured width without dropping characters.
    for (const character of word) {
      if (font.widthOfTextAtSize(line + character, size) > width && line) {
        lines.push(line)
        line = ''
      }
      line += character
    }
  }
  if (line) lines.push(line)
  return lines
}

async function buildPdf(table: ExportTable, kind: ExportKind): Promise<Buffer> {
  const pdf = await PDFDocument.create()
  pdf.setTitle(`MamaLead - ${exportTitle(kind)}`)
  pdf.setAuthor('MamaLead')
  pdf.setSubject(`${exportTitle(kind)} export`)
  // pdf-lib's JPEG parser reads from byte zero of the backing ArrayBuffer. Node buffers
  // may be pooled with a nonzero offset, so give the parser an owned byte array.
  const logo = await pdf.embedJpg(Uint8Array.from(readFileSync(logoAsset)))
  const headerLogo = await pdf.embedPng(Uint8Array.from(readFileSync(headerLogoAsset)))
  pdf.registerFontkit(fontkit)
  const font = await pdf.embedFont(Uint8Array.from(readFileSync(join(__dirname,'assets','satoshi-400.ttf'))),{subset:true})
  const bold = await pdf.embedFont(Uint8Array.from(readFileSync(join(__dirname,'assets','satoshi-700.ttf'))),{subset:true})
  const wideTable = (kind === 'website' && table.columns.length >= 7)
  const width = wideTable ? 1191 : 842
  const height = wideTable ? 842 : 595
  const margin = 34
  const contentWidth = width - margin * 2
  const title = exportTitle(kind)
  const weights = table.columns.map((column) => {
    if (kind === 'website') return ({'Business name':1.8,Website:1.8,Emails:2.2,'Phone numbers':1.8,'Business address':2.2,'Social links':2.2,Sources:2.4,Status:1.1,Error:1.8} as Record<string,number>)[column] ?? 1.5

    if (column === 'Email' || column === 'Emails') return 2.2
    if (column === 'Phone') return 1.55
    if (column === 'Profile URL') return 3.2
    if (column === 'Business name' || column === 'Address' || column === 'Description') return 1.8
    if (column === 'Domain' || column === 'Handle' || column === 'Keywords') return 1.5
    if (column === 'Verified' || column === 'Followers' || column === 'Rating') return 0.85
    return 1.1
  })
  const weightSum = weights.reduce((sum, value) => sum + value, 0)
  const widths = weights.map((weight) => (contentWidth * weight) / weightSum)
  const lefts = widths.map((_, index) => margin + widths.slice(0, index).reduce((sum, value) => sum + value, 0))
  const textSize = wideTable ? 8 : table.columns.length > 9 ? 6.7 : 7.5
  const lineHeight = textSize + 3.5
  const minRowHeight = 25
  const columnHeadings = table.columns.map((column, index) => pdfCellLines(column, bold, 7.5, widths[index] - 14))
  const headingHeight = Math.max(30, Math.max(...columnHeadings.map(lines => lines.length)) * 9 + 12)
  let y = 0
  let rowIndex = 0

  const startPage = (): PDFPage => {
    const page = pdf.addPage([width, height])
    drawPdfBrandHeader(page, headerLogo, font, bold, title, `${table.values.length} ${table.values.length===1?'ROW':'ROWS'}`, margin)
    y = height - 100
    page.drawRectangle({ x: margin, y: y - headingHeight, width: contentWidth, height: headingHeight, color: rgb(0.16, 0.19, 0.16) })
    columnHeadings.forEach((lines, index) => {
      lines.forEach((line, lineIndex) => page.drawText(line, {
        x: lefts[index] + 7, y: y - 12 - lineIndex * 9, size: 7.5, font: bold, color: rgb(1, 1, 1),
      }))
    })
    lefts.slice(1).forEach((x) => page.drawLine({ start: { x, y }, end: { x, y: y - headingHeight }, thickness: 0.45, color: rgb(0.44, 0.5, 0.44) }))
    y -= headingHeight
    return page
  }
  let page = startPage()
  for (const row of table.values) {
    const lines = row.map((value, index) => value.split(/\r?\n/).flatMap(part => pdfCellLines(part, font, textSize, widths[index] - 14)))
    const totalLines = Math.max(1, ...lines.map(item => item.length))
    const fullRowHeight = Math.max(minRowHeight, totalLines * lineHeight + 10)
    const freshRowSpace = height - 100 - headingHeight - 37
    // Keep ordinary records together; unusually long records continue onto the next page.
    if (y - fullRowHeight < 37 && (fullRowHeight <= freshRowSpace || y < height - 100 - headingHeight)) page = startPage()
    let offset = 0
    while (offset < totalLines) {
      if (y - minRowHeight < 37) page = startPage()
      const fit = Math.max(1, Math.floor((y - 37 - 10) / lineHeight))
      const count = Math.min(fit, totalLines - offset)
      const rowHeight = Math.max(minRowHeight, count * lineHeight + 10)
      page.drawRectangle({
        x: margin, y: y - rowHeight, width: contentWidth, height: rowHeight,
        color: rowIndex % 2 ? rgb(0.94, 0.96, 0.93) : rgb(1, 1, 1),
      })
      page.drawLine({ start: { x: margin, y: y - rowHeight }, end: { x: width - margin, y: y - rowHeight }, thickness: 0.45, color: rgb(0.84, 0.87, 0.83) })
      lefts.slice(1).forEach((x) => page.drawLine({ start: { x, y }, end: { x, y: y - rowHeight }, thickness: 0.45, color: rgb(0.84, 0.87, 0.83) }))
      lines.forEach((cellLines, index) => {
        cellLines.slice(offset, offset + count).forEach((line, lineIndex) => page.drawText(line, {
          x: lefts[index] + 7, y: y - 12 - lineIndex * lineHeight, size: textSize, font,
          color: table.columns[index] === 'Profile URL' ? rgb(0.18, 0.35, 0.45) : rgb(0.12, 0.15, 0.13),
        }))
      })
      y -= rowHeight
      offset += count
      if (offset < totalLines) page = startPage()
    }
    rowIndex += 1
  }
  pdf.getPages().forEach((sheet, index) => {
    // The original logo is deliberately faint above the row fills, so it survives printing
    // without reducing contrast enough to obscure the table text and grid.
    sheet.drawImage(logo, { x: (width - 430) / 2, y: 82, width: 430, height: 430, opacity: 0.1 })
    sheet.drawText(`mamalead  |  ${title}`, { x: margin, y: 20, size: 7, font, color: rgb(0.38, 0.43, 0.38) })
    const label = `Page ${index + 1} of ${pdf.getPageCount()}`
    sheet.drawText(label, { x: width - margin - font.widthOfTextAtSize(label, 7), y: 20, size: 7, font, color: rgb(0.38, 0.43, 0.38) })
  })
  return Buffer.from(await pdf.save())
}

/** Builds any supported file format without opening a save dialog; used by export smoke tests. */
export async function buildFormattedExport(
  repository: Repository,
  workspaceId: string,
  request: ExportRequest,
): Promise<{ content: Buffer; rows: number; columns: string[] }> {
  const table = exportTable(repository, workspaceId, request)
  const format = request.format ?? 'csv'
  const content = format === 'xlsx'
    ? await buildXlsx(table, request.kind)
    : format === 'pdf'
      ? await buildPdf(table, request.kind)
      : Buffer.from(buildExport(repository, workspaceId, request).body, 'utf8')
  return { content, rows: table.values.length, columns: table.columns }
}

/**
 * Writes the export and returns where it landed. A cancelled dialog returns null rather than
 * throwing, because cancelling is a normal outcome.
 */
export async function writeExport(
  window: BrowserWindow | null,
  repository: Repository,
  workspaceId: string,
  request: ExportRequest,
): Promise<ExportResult | null> {
  const format = request.format ?? 'csv'
  const baseName = request.fileName.replace(/\.(?:csv|tsv|xlsx|pdf)$/i, '')
  const extension = format === 'xlsx' ? 'xlsx' : format === 'pdf' ? 'pdf' : request.fileName.toLowerCase().endsWith('.tsv') ? 'tsv' : 'csv'
  const defaultFileName = `${baseName}.${extension}`

  const defaultPath = join(app.getPath('downloads'), defaultFileName)
  const filters = format === 'xlsx'
    ? [{ name: 'Excel workbook', extensions: ['xlsx'] }]
    : format === 'pdf'
      ? [{ name: 'PDF document', extensions: ['pdf'] }]
      : [{ name: extension === 'tsv' ? 'Tab-separated file' : 'CSV file', extensions: [extension] }]
  const picked = window
    ? await dialog.showSaveDialog(window, { defaultPath, title: 'Save export', filters })
    : await dialog.showSaveDialog({ defaultPath, title: 'Save export', filters })
  if (picked.canceled || !picked.filePath) return null
  const table=exportTable(repository,workspaceId,request)
  if(!table.values.length)throw new Error('There are no results to export.')
  const payload=format==='csv'?buildExport(repository,workspaceId,request):null

  const content = format === 'xlsx'
    ? await buildXlsx(table, request.kind)
    : format === 'pdf'
      ? await buildPdf(table, request.kind)
      : payload?.body ?? ''
  writeFileSync(picked.filePath, content)
  const fileName = picked.filePath.split(/[\\/]/).pop() ?? request.fileName
  const rowCount = table.values.length

  repository.recordExport({
    workspaceId,
    kind: request.kind,
    scope: `${rowCount} rows`,
    rowCount,
    columns: table.columns,
    fileName,
    path: picked.filePath,
  })

  return {
    path: picked.filePath,
    fileName,
    rows: rowCount,
    columns: table.columns.length,
    bytes: Buffer.isBuffer(content) ? content.byteLength : Buffer.byteLength(content, 'utf8'),
  }
}
