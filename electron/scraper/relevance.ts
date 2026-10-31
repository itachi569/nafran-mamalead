/** Reject explicit no-result panels and wholly unrelated fuzzy Latin matches.
 * Cross-script searches are retained: Maps can return English names for an Urdu query.
 */
export function mapsHasNoResults(text: string): boolean {
  return /Google Maps (?:can't|cannot|couldn't) find|no results (?:found|for)|no matching (?:places|results)|کوئی نتیجہ نہیں|کوئی نتائج نہیں/i.test(text)
}
export function mapsResultsRelevant(keyword: string, location: string, rows: {name:string;category?:string;lines?:string[]}[]): boolean {
  if (!rows.length) return false
  if (/[^\u0000-\u024f]/u.test(keyword)) return true
  const normal=(value:string)=>value.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'')
  const place=new Set(normal(location).match(/[a-z]+/g) ?? [])
  const ignore=new Set(['in','near','me','best','top','the','and','of','a','an','for'])
  const tokens=(normal(keyword).match(/[a-z0-9]+/g) ?? []).filter(word=>word.length>=3 && !place.has(word) && !ignore.has(word))
  const aliases:Record<string,string[]>={dentist:['dental','orthodont'],dentists:['dental','orthodont'],lawyer:['attorney','law firm','legal'],lawyers:['attorney','law firm','legal'],plumber:['plumbing'],plumbers:['plumbing'],doctor:['clinic','physician','medical'],doctors:['clinic','physician','medical'],physiotherapist:['physiotherapy','physical therapy'],restaurant:['dining','cafe','food'],restaurants:['dining','cafe','food']}
  if(!tokens.length) return true
  const candidates=tokens.flatMap(token=>[token,token.replace(/s$/,''),...(aliases[token] ?? [])])
  return rows.some(row=>{const text=normal([row.name,row.category,...(row.lines ?? [])].filter(Boolean).join(' '));return candidates.some(token=>text.includes(token))})
}
