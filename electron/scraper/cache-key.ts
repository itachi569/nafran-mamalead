import {createHash} from 'node:crypto'
import {getDomain} from 'tldts'
import {normalizePhone} from '../phone-format'
import {mapsPlaceIdentity} from './saved-places'

export const normText=(s:string)=>s.normalize('NFKC').toLowerCase().trim().replace(/\s+/g,' ')
export const identityHash=(s:string)=>createHash('sha256').update(s).digest('hex')
export const cacheKeyFor=(keyword:string,location:string,region:string,language:string)=>identityHash(`v1|${normText(keyword)}|${normText(location)}|${region}|${language}`)
const shared=['facebook.com','instagram.com','linktr.ee','wa.me','google.com','business.site','wixsite.com','blogspot.com']
export function domainIdentity(website:string):string {
  try {const host=new URL(website.includes('://')?website:'https://'+website).hostname.toLowerCase()
    if(shared.some(d=>host===d||host.endsWith('.'+d)))return ''
    return getDomain(host,{allowPrivateDomains:true})||''
  }catch{return ''}
}
export interface PlaceIdentity {placeRef?:string;mapsUrl?:string;phone?:string;website?:string;address?:string}
export function placeIdentity(p:PlaceIdentity):string[] {
  const ref=mapsPlaceIdentity(p.placeRef||'')||mapsPlaceIdentity(p.mapsUrl||'')
  const phone=normalizePhone(p.phone||'',(p.address||'')+' '+(p.website||''))
  const domain=domainIdentity(p.website||'')
  return [ref,phone?'tel:'+phone:'',domain?'web:'+domain:''].filter(Boolean)
}
export class IdentitySet {
  readonly values=new Set<string>()
  constructor(places:PlaceIdentity[]=[]){for(const p of places)this.add(p)}
  get size(){return this.values.size}
  has(p:PlaceIdentity){return placeIdentity(p).some(v=>this.values.has(v))}
  add(p:PlaceIdentity){for(const v of placeIdentity(p))this.values.add(v)}
  hashes():{placeRefs:string[];phones:string[];domains:string[]} {
    const result={placeRefs:[] as string[],phones:[] as string[],domains:[] as string[]}
    if(this.values.size>20000)return result
    for(const id of this.values){
      if(id.startsWith('tel:'))result.phones.push(identityHash(id.slice(4)))
      else if(id.startsWith('web:'))result.domains.push(identityHash(id.slice(4)))
      else if(id.startsWith('cid:'))result.placeRefs.push(identityHash(id))
    }
    return result
  }
}
