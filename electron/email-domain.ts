const privateTlds=new Set(['internal','local','localhost','test','example','invalid','lan','home','corp','intranet','onion'])
/** Public email checks must not send private/reserved namespaces to a paid verifier. */
export function hasPublicEmailDomain(email:string):boolean {
  if(!/^[^\s@]+@[^\s@]+$/.test(email.trim()))return false
  const rawDomain=email.trim().split('@').pop() || ''
  if(/[\s/#?:\\]/.test(rawDomain))return false
  let domain:string
  try{domain=new URL('https://'+rawDomain).hostname.toLowerCase()}catch{return false}
  const parts=domain.split('.'),tld=parts.at(-1) || ''
  return parts.length>1 && parts.every(part=>/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(part))
    && /^(?:[a-z]{2,}|xn--[a-z0-9-]+)$/i.test(tld) && !privateTlds.has(tld)
    && domain!=='home.arpa' && !domain.endsWith('.home.arpa')
}
