import {normalizePhone} from '../phone-format'

/** Retain the strongest published source when HTTP and rendered pages overlap. */
export function uniquePhones<T extends {value:string;score?:number;page?:string;source?:string}>(phones:T[],context=''):T[] {
  const found=new Map<string,T>()
  const evidence=[context,...phones.map(phone=>'tel:'+phone.value)].join(' ')
  for(const phone of phones){
    const value=normalizePhone(phone.value,evidence+' '+(phone.page||phone.source||''))
    if(!value)continue
    const key=value.replace(/\D/g,''),previous=found.get(key)
    if(!previous || (phone.score||0)>(previous.score||0))found.set(key,{...phone,value})
  }
  return [...found.values()]
}

const regions=new Intl.DisplayNames(['en'],{type:'region'})
function addressKey(value:string):string {
  // Expand only a terminal country component, never an interior state/street abbreviation.
  const expanded=value.trim().replace(/(?:,\s*|\s+(?=[A-Z]{2,3}$))([A-Z]{2,3})$/,(_match,code:string)=>{
    const aliases:Record<string,string>={UK:'GB',USA:'US',UAE:'AE'}
    const iso=aliases[code]||code
    const name=iso.length===2?regions.of(iso):undefined
    return ' '+(name&&name!==iso?name:code)
  })
  return expanded.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim()
}
export function uniqueAddresses(addresses:string[]):string[] {
  const rows=addresses.map(value=>({value:value.trim(),key:addressKey(value)})).filter(row=>row.key)
  return rows.filter((row,i)=>!rows.some((other,j)=>j!==i&&(' '+other.key+' ').includes(' '+row.key+' ')&&(other.key.length>row.key.length||j<i))).map(row=>row.value).slice(0,12)
}
