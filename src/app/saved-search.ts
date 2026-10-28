/** Match saved fields independently so adjacent phone numbers cannot form a false match. */
function normalized(value:string):string {
  try{value=decodeURIComponent(value)}catch{/* Keep an incomplete pasted URL usable. */}
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim().replace(/^https?:\/\//,'').replace(/^www\./,'').replace(/\/$/,'')
}
export function isPhoneSearch(value:string):boolean {return /^[+\d\s().-]+$/.test(value.trim()) && value.replace(/\D/g,'').length>0}
export function savedSearchScore(fields:string[],query:string):number {
  const term=normalized(query);if(!term)return 1
  if(isPhoneSearch(query)){
    const digits=query.replace(/\D/g,'')
    return Math.max(0,...fields.filter(field=>/^[+\d\s().-]+$/.test(field.trim())).map(field=>{const value=field.replace(/\D/g,'');return value===digits?100:value.startsWith(digits)?75:value.includes(digits)?50:0}))
  }
  const values=fields.map(normalized),terms=term.split(/[^\p{L}\p{N}@.]+/u).filter(Boolean)
  if(values.some(field=>field===term))return 100
  if(values.some(field=>field.startsWith(term)))return 80
  if(values.some(field=>field.includes(term)))return 60
  return terms.length && terms.every(word=>values.some(field=>field.includes(word)))?40:0
}
export function searchSavedRows<Row>(rows:Row[],query:string,fields:(row:Row)=>string[]):Row[] {
  if(!query.trim())return rows
  const scored=rows.map((row,index)=>({row,index,score:savedSearchScore(fields(row),query)})).filter(item=>item.score>0)
  const exactPhone=isPhoneSearch(query)&&query.replace(/\D/g,'').length>=7&&scored.some(item=>item.score===100)
  return scored.filter(item=>!exactPhone||item.score===100).sort((a,b)=>b.score-a.score||a.index-b.index).map(item=>item.row)
}
