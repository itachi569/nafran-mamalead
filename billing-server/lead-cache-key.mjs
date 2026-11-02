import {createHash} from 'node:crypto'
import {isIP} from 'node:net'
import {getDomain} from 'tldts'

export const KEY_VERSION = 'v1'
export const hash = value => createHash('sha256').update(value).digest('hex')
export const normText = value => value.normalize('NFKC').toLowerCase().trim().replace(/\s+/g, ' ')
export const cacheKeyFor = (keyword, location, region, language) => hash(`v1|${normText(keyword)}|${normText(location)}|${region}|${language}`)
const privateTlds = new Set(['internal','local','localhost','test','example','invalid','lan','home','corp','intranet','onion','arpa'])
const shared = new Set(['facebook.com','instagram.com','linktr.ee','wa.me','google.com','business.site','wixsite.com','blogspot.com'])
export function publicWebsite(value) {
  if (typeof value !== 'string' || value.length > 300) return null
  try {
    const u = new URL(value)
    const h = u.hostname.toLowerCase()
    if (!['https:','http:'].includes(u.protocol) || u.username || u.password || isIP(h) || h.startsWith('[') ||
      !h.includes('.') || privateTlds.has(h.split('.').at(-1)) || /(?:^|\.)google\.[a-z.]+$/.test(h)) return null
    return u.href
  } catch { return null }
}
export function domainIdentity(value) {
  try {
    const host = new URL(value).hostname.toLowerCase()
    if ([...shared].some(d => host === d || host.endsWith('.'+d))) return ''
    return getDomain(host, {allowPrivateDomains:true}) || ''
  } catch { return '' }
}
export function mapsIdentity(value) {
  let v = String(value || '')
  try { v = decodeURIComponent(v) } catch {}
  const ftid = v.match(/(?:!1s|^)(0x[0-9a-f]+:0x[0-9a-f]+)/i)
  if (ftid) return 'cid:'+BigInt(ftid[1].split(':')[1]).toString()
  const cid = v.match(/(?:[?&](?:cid|ludocid)=|^)(\d{5,25})(?:$|[&#])/)
  return cid ? 'cid:'+cid[1] : ''
}
