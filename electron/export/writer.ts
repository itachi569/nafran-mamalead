// Writes an export to disk.
//
// The export modal already lets a scope and a column set be chosen; this is the half that was
// missing, and it is why the modal's Download button used to do nothing. Everything is written
// locally: no upload, no network.
import { readFileSync, writeFileSync } from 'node:fs'
import { app, dialog, type BrowserWindow } from 'electron'
import { join } from 'node:path'
import ExcelJS from 'exceljs'
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import type { Repository } from '../db/repository'

const logoAsset = join(__dirname, 'assets', 'mamalead-original.jpeg')
const watermarkAsset = join(__dirname, 'assets', 'mamalead-watermark.png')

export type ExportKind = 'leads' | 'runs' | 'invoices' | 'profiles' | 'people'
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
  return Number.isNaN(date.getTime()) ? raw : date.toISOString().slice(0, 10)
}

function duration(ms: unknown): string {
  const total = Number(ms ?? 0)
  if (!total) return ''
  const seconds = Math.round(total / 1000)
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}

const LEAD_COLUMNS: Record<string, ColumnReader> = {
  'Business name': (row) => text(row.name),
  Domain: (row) => text(row.website).replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0],
  Phone: (row) => text(row.phone),
  Email: (row) => text(row.best_email),
  Address: (row) => text(row.address),
  Rating: (row) => text(row.rating),
  'Review count': (row) => text(row.review_count),
  Socials: (row) => text(row.socials),
  Score: (row) => text(row.score),
  'Decision maker': (row) => text(row.decision_maker),  Source: (row) => text(row.provider),
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

  if (request.kind === 'people') {
    const ids = [...new Set(request.leadIds ?? [])]
    const leads = new Map(ids.map((id) => [id, repository.getLead(workspaceId, id)]))
    const rows = ids.flatMap((id) => repository.listDecisionMakers(workspaceId, [id]))
      .filter((person) => leads.get(String(person.lead_id)))
      .map((person) => {
        const lead = leads.get(String(person.lead_id))!
        return { ...person, name: lead.name, website: lead.website }
      })
    return { columns: {
      'Business name': (row) => text(row.name), Domain: LEAD_COLUMNS.Domain,
      'Decision maker': (row) => text(row.full_name), Role: (row) => text(row.title),
      Email: (row) => text(row.email), Phone: (row) => text(row.phone),
      LinkedIn: (row) => text(row.linkedin_url), Source: (row) => text(row.source),
      'Saved date': (row) => shortDate(row.created_at),
    }, rows }
  }

  const rows = [] as ReturnType<Repository['listLeads']>['rows']
  const wanted = Math.max(0, request.limit)
  while (rows.length < wanted) {
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
    const emails = repository.listContacts(workspaceId, 'email', [lead.id]) as { value: string; score: number | null }[]
    const socials = repository.listSocialProfiles(workspaceId, [lead.id]) as { platform: string }[]
    const people = repository.listDecisionMakers(workspaceId, [lead.id]) as { full_name: string }[]
    const best = emails.sort((a, b) => (b.score ?? -1) - (a.score ?? -1))[0]
    return {
      ...lead,
      best_email: best?.value ?? '',
      socials: socials.map((social) => social.platform).join(', '),
      decision_maker: people[0]?.full_name ?? '',
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
  return {
    columns: chosen,
    values: rows.map((row) => chosen.map((label) => columns[label](row))),
  }
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
  return kind === 'people' ? 'Decision Makers' : kind === 'profiles' ? 'Social Profiles' : kind === 'runs' ? 'Run History' : kind === 'invoices' ? 'Invoices' : 'Leads'
}

async function buildXlsx(table: ExportTable, kind: ExportKind): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'MamaLead'
  workbook.title = `MamaLead - ${exportTitle(kind)}`
  workbook.subject = `${exportTitle(kind)} export`
  const sheet = workbook.addWorksheet(exportTitle(kind))
  const watermark = workbook.addImage({ filename: watermarkAsset, extension: 'png' })
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
  sheet.getCell(1, 1).value = 'mamalead'
  sheet.getCell(1, 1).font = { name: 'Aptos Display', size: 19, bold: true, color: { argb: 'FFFFFFFF' } }
  sheet.getCell(1, 1).alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }
  sheet.getRow(1).height = 40
  sheet.mergeCells(2, 1, 2, lastColumn)
  sheet.getCell(2, 1).value = `${exportTitle(kind)}  |  ${table.values.length} rows  |  ${new Date().toISOString().slice(0, 10)}`
  sheet.getCell(2, 1).font = { name: 'Aptos', size: 11, color: { argb: 'FF435042' } }
  sheet.getCell(2, 1).alignment = { vertical: 'middle', indent: 2 }
  sheet.getRow(2).height = 27
  sheet.getRow(3).height = 10
  for (let column = 1; column <= lastColumn; column += 1) {
    sheet.getCell(1, column).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1C1C1C' } }
    sheet.getCell(2, column).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE6EBE1' } }
  }

  sheet.addRow(table.columns)
  for (const row of table.values) sheet.addRow(row)
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
    row.height = Math.min(60, Math.max(25, values.some((value) => value.length > 70) ? 42 : 25))
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
  return Buffer.from(await workbook.xlsx.writeBuffer())
}

function pdfText(value: string): string {
  return value.replace(/[^\x20-\x7E]/g, '?')
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
  const logo = await pdf.embedJpg(readFileSync(logoAsset))
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const width = 842
  const height = 595
  const margin = 34
  const contentWidth = width - margin * 2
  const title = exportTitle(kind)
  const weights = table.columns.map((column) => {
    if (column === 'Profile URL') return 3.2
    if (column === 'Business name' || column === 'Address' || column === 'Description') return 1.8
    if (column === 'Domain' || column === 'Handle' || column === 'Keywords') return 1.5
    if (column === 'Verified' || column === 'Followers' || column === 'Rating') return 0.85
    return 1.1
  })
  const weightSum = weights.reduce((sum, value) => sum + value, 0)
  const widths = weights.map((weight) => (contentWidth * weight) / weightSum)
  const lefts = widths.map((_, index) => margin + widths.slice(0, index).reduce((sum, value) => sum + value, 0))
  const textSize = table.columns.length > 9 ? 6.7 : 7.5
  const lineHeight = textSize + 3.5
  const minRowHeight = 25
  let y = 0
  let rowIndex = 0

  const startPage = (): PDFPage => {
    const page = pdf.addPage([width, height])
    page.drawRectangle({ x: 0, y: height - 78, width, height: 78, color: rgb(0.11, 0.11, 0.11) })
    page.drawRectangle({ x: margin, y: height - 59, width: 38, height: 38, color: rgb(0.78, 0.84, 0.73) })
    page.drawText('m', { x: margin + 10, y: height - 50, size: 20, font: bold, color: rgb(0.11, 0.11, 0.11) })
    page.drawText('mamalead', { x: margin + 50, y: height - 34, size: 16, font: bold, color: rgb(1, 1, 1) })
    page.drawText(`${title.toUpperCase()}  |  ${table.values.length} ROWS`, { x: margin + 50, y: height - 53, size: 9, font, color: rgb(0.78, 0.84, 0.73) })
    y = height - 100
    page.drawRectangle({ x: margin, y: y - 30, width: contentWidth, height: 30, color: rgb(0.16, 0.19, 0.16) })
    table.columns.forEach((column, index) => {
      const lines = pdfCellLines(column, bold, 7.5, widths[index] - 14)
      lines.slice(0, 2).forEach((line, lineIndex) => page.drawText(line, {
        x: lefts[index] + 7, y: y - 12 - lineIndex * 9, size: 7.5, font: bold, color: rgb(1, 1, 1),
      }))
    })
    lefts.slice(1).forEach((x) => page.drawLine({ start: { x, y }, end: { x, y: y - 30 }, thickness: 0.45, color: rgb(0.44, 0.5, 0.44) }))
    y -= 30
    return page
  }
  let page = startPage()
  for (const row of table.values) {
    const lines = row.map((value, index) => pdfCellLines(value, font, textSize, widths[index] - 14))
    const rowHeight = Math.max(minRowHeight, Math.max(...lines.map((item) => item.length)) * lineHeight + 10)
    if (y - rowHeight < 37) page = startPage()
    page.drawRectangle({
      x: margin, y: y - rowHeight, width: contentWidth, height: rowHeight,
      color: rowIndex % 2 ? rgb(0.94, 0.96, 0.93) : rgb(1, 1, 1),
    })
    page.drawLine({ start: { x: margin, y: y - rowHeight }, end: { x: width - margin, y: y - rowHeight }, thickness: 0.45, color: rgb(0.84, 0.87, 0.83) })
    lefts.slice(1).forEach((x) => page.drawLine({ start: { x, y }, end: { x, y: y - rowHeight }, thickness: 0.45, color: rgb(0.84, 0.87, 0.83) }))
    lines.forEach((cellLines, index) => {
      cellLines.forEach((line, lineIndex) => page.drawText(line, {
        x: lefts[index] + 7, y: y - 12 - lineIndex * lineHeight, size: textSize, font,
        color: table.columns[index] === 'Profile URL' ? rgb(0.18, 0.35, 0.45) : rgb(0.12, 0.15, 0.13),
      }))
    })
    y -= rowHeight
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
  const table = exportTable(repository, workspaceId, request)
  const payload = format === 'csv' ? buildExport(repository, workspaceId, request) : null

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
