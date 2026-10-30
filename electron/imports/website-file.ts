import ExcelJS from 'exceljs'

export const WEBSITE_FILE_LIMIT = 20 * 1024 * 1024

export function websiteCellText(cell: ExcelJS.Cell): string {
  // ExcelJS's .text getter throws on a hyperlink cell whose display value is null.
  const value = cell.value
  if (value == null || cell.isMerged && cell.master.address !== cell.address) return ''
  if (typeof value !== 'object') return String(value)
  if (value instanceof Date) return value.toISOString()
  if ('richText' in value) return value.richText.map(part => part.text ?? '').join('')
  if ('hyperlink' in value) return String(value.text || value.hyperlink || '')
  if ('result' in value) return value.result == null ? '' : String(value.result)
  if ('text' in value) return String(value.text ?? '')
  return ''
}

/** Both the native picker and dropped files use the same byte-level validation. */
export async function readWebsiteFile(name: string, bytes: Uint8Array): Promise<{name:string;content:string;bytes:number}> {
  if (!/\.(csv|tsv|xlsx)$/i.test(name)) throw new Error('Choose a CSV, TSV or Excel (.xlsx) website list.')
  if (bytes.length > WEBSITE_FILE_LIMIT) throw new Error('Choose a website list no larger than 20 MB.')
  if (!bytes.length) throw new Error('This file is empty.')
  const zip = bytes[0] === 0x50 && bytes[1] === 0x4b
  let content: string
  if (/\.xlsx$/i.test(name)) {
    if (!zip) throw new Error('This is not a valid Excel (.xlsx) file.')
    const workbook = new ExcelJS.Workbook()
    try { await workbook.xlsx.load(Buffer.from(bytes) as never) }
    catch { throw new Error('This Excel file could not be read. Save a new .xlsx or CSV copy and try again.') }
    const sheet = workbook.worksheets[0]
    if (!sheet || !sheet.actualRowCount) throw new Error('This file is empty.')
    const rows: string[] = []
    sheet.eachRow(row => {
      const cells: string[] = []
      row.eachCell({includeEmpty:true}, cell => cells.push('"' + websiteCellText(cell).replace(/"/g, '""') + '"'))
      rows.push(cells.join(','))
    })
    content = rows.join('\n')
  } else {
    if (zip || (bytes[0] === 0xd0 && bytes[1] === 0xcf) || Buffer.from(bytes.subarray(0,4)).toString() === '%PDF') {
      throw new Error('This file is not a text CSV/TSV. Upload Excel files with their original .xlsx extension, or save them as CSV.')
    }
    const encoding = bytes[0] === 0xff && bytes[1] === 0xfe ? 'utf-16le' : bytes[0] === 0xfe && bytes[1] === 0xff ? 'utf-16be' : 'utf-8'
    try { content = new TextDecoder(encoding, {fatal:true}).decode(bytes) }
    catch { throw new Error('This file is not readable text. Save it as UTF-8 CSV, TSV or Excel (.xlsx).') }
    if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffd]/u.test(content.slice(0,4096))) throw new Error('This file is not a text CSV/TSV.')
  }
  if (!content.trim()) throw new Error('This file is empty.')
  return {name, content, bytes:bytes.length}
}
