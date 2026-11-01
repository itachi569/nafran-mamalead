import {Resolver} from 'node:dns/promises'
import {domainToASCII} from 'node:url'
import type {EmailValidityResult} from './email-verifier'
import disposableDomains from './data/disposable-domains.json'
import {hasPublicEmailDomain} from './email-domain'

const typos:Record<string,string>={'gmial.com':'gmail.com','gmai.com':'gmail.com','gmal.com':'gmail.com','gmail.con':'gmail.com','gmail.co':'gmail.com','hotmial.com':'hotmail.com','hotmai.com':'hotmail.com','hotmal.com':'hotmail.com','yaho.com':'yahoo.com','yahooo.com':'yahoo.com','yahoo.con':'yahoo.com','outlok.com':'outlook.com'}
const disposable = new Set(disposableDomains)
export function isDisposableDomain(domain:string):boolean {
 const parts=domain.toLowerCase().replace(/\.$/,'').split('.')
 return parts.some((_,i)=>i<parts.length-1&&disposable.has(parts.slice(i).join('.')))
}
const cache=new Map<string,{at:number;status:'mail'|'none'|'unknown';message:string}>()
export function isRoleEmail(email:string):boolean {return /^(info|hello|contact|support|sales|admin|office|enquiries|inquiries|help|team|billing|careers|jobs|noreply|no-reply|dispatch|service|services|bookings|reservations|orders|marketing|accounts|hr)(?:[-._][a-z0-9]+)*$/i.test(email.split('@')[0])}
const verdict=(email:string,status:EmailValidityResult['status'],message:string):EmailValidityResult=>({email,status,verified:false,score:status==='invalid'?0:status==='risky'?35:null,message,provider:'local'})
/** DNS can disprove a domain, never prove that an individual mailbox exists. */
export async function precheckEmail(raw:string,signal?:AbortSignal,resolver=new Resolver({timeout:1500,tries:1})):Promise<EmailValidityResult|null> {
  const email=raw.trim().toLowerCase(),domain=domainToASCII(email.split('@')[1] || '')
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!domain)return verdict(email,'invalid','The address format is invalid. Checked locally; no provider credit used.')
  if(!hasPublicEmailDomain(email))return verdict(email,'invalid','Reserved/private or invalid domain — not a public email address. No provider credit used.')
  if(typos[domain])return verdict(email,'risky',`Possible domain typo. Did you mean ${email.split('@')[0]}@${typos[domain]}? The published address was kept unchanged; no provider credit used.`)
  if(isDisposableDomain(domain))return verdict(email,'risky','Disposable / temporary inbox. Checked locally; no provider credit used.')
  if(signal?.aborted)throw signal.reason
  let result=cache.get(domain)
  if(!result || Date.now()-result.at>300_000){
    const cancel=()=>resolver.cancel(),timer=setTimeout(cancel,2500)
    signal?.addEventListener('abort',cancel,{once:true})
    try{
      const missing=(e:unknown)=>['ENODATA','ENOTFOUND','ENONAME'].includes((e as NodeJS.ErrnoException).code || '')
      let mx:Awaited<ReturnType<Resolver['resolveMx']>>=[]
      try{mx=await resolver.resolveMx(domain)}catch(e){if(!missing(e))throw e}
      if(mx.some(r=>r.exchange && r.exchange!=='.'))result={at:Date.now(),status:'mail',message:''}
      else if(mx.length)result={at:Date.now(),status:'none',message:'The domain explicitly does not accept email (null MX).'}
      else{
        const addresses=await Promise.allSettled([resolver.resolve4(domain),resolver.resolve6(domain)])
        const hasAddress=addresses.some(r=>r.status==='fulfilled'&&r.value.length>0)
        const uncertain=addresses.some(r=>r.status==='rejected'&&!missing(r.reason))
        result={at:Date.now(),status:hasAddress?'mail':uncertain?'unknown':'none',message:uncertain?'DNS could not be checked. Retry when the network is available.':'The email domain has no MX or A/AAAA record.'}
      }
    }catch{result={at:Date.now(),status:'unknown',message:'DNS could not be checked. Retry when the network is available.'}}
    finally{clearTimeout(timer);signal?.removeEventListener('abort',cancel)}
    if(signal?.aborted)throw signal.reason
    if(result.status!=='unknown')cache.set(domain,result)
  }
  return result.status==='mail'?null:verdict(email,result.status==='none'?'invalid':'unknown',result.message+' Checked locally; no provider credit used.')
}
