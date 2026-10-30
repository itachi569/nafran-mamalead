export const MAX_MAP_KEYWORDS = 8
export const MAX_KEYWORD_LENGTH = 80
export function parseBulkKeywords(raw: string) {
  const supplied = String(raw ?? '').split(/[\r\n,;\t]+|\s+\/\s+/)
    .map(term=>term.replace(/^\s*(?:\d+\s*[.)\-:–]|[•*\-–]+)\s*/, '').replace(/\s+/g,' ').trim()).filter(Boolean)
  const unique = Array.from(new Map(supplied.map(term=>[term.toLocaleLowerCase(),term])).values())
  const tooLong = unique.filter(term=>Array.from(term).length > MAX_KEYWORD_LENGTH)
  return {terms:unique.filter(term=>Array.from(term).length<=MAX_KEYWORD_LENGTH),tooLong,supplied:supplied.length,duplicates:supplied.length-unique.length}
}
export function keywordMergePreview(current: string[], incoming: string[]) {
  const unique = incoming.filter(term=>!current.some(old=>old.toLocaleLowerCase()===term.toLocaleLowerCase()))
  const added = unique.slice(0,Math.max(0,MAX_MAP_KEYWORDS-current.length))
  return {added:added.length,skipped:unique.length-added.length,total:current.length+added.length}
}
export function readMapsDraft(): {keywords:string[];max:number;location:string} {
  try {
    const value=JSON.parse(localStorage.getItem('mamalead.maps.draft') || '{}')
    return {keywords:Array.isArray(value.keywords)?parseBulkKeywords(value.keywords.join('\n')).terms.slice(0,8):['physiotherapy','skin care doctor','sports massage'],
      max:Number.isFinite(value.max)?Math.max(5,Math.min(200,value.max)):25,location:typeof value.location==='string'?value.location:''}
  } catch { return {keywords:['physiotherapy','skin care doctor','sports massage'],max:25,location:''} }
}
