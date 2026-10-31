import {plural} from './plural'
export type SupportCategory='licence'|'bug'|'feature'|'other'
export interface SupportPayload {name:string;email:string;category:SupportCategory;subject:string;message:string;diagnostics:boolean;page:string}
export interface SupportResult {ok?:boolean;ticketId?:string;duplicate?:boolean;emailQueued?:boolean;error?:string;field?:string;retryAfterSeconds?:number;cancelled?:boolean;offline?:boolean}
export interface SupportConfig {configured:boolean;email:string;slaText:string;replyEmail?:string}
export const SUPPORT_EMAIL_FALLBACK='billing@nafran.co'
export function formatSupportWait(seconds:number):string {
 const wait=Math.max(0,Math.ceil(seconds))
 return wait<60?plural(wait,'second'):[Math.floor(wait/60)+' min',wait%60?(wait%60)+' s':''].filter(Boolean).join(' ')
}
export function supportValidation(p:SupportPayload):Record<string,string> {
 const errors:Record<string,string>={}
 if(typeof p.name!=='string'||p.name.length>80)errors.name='Use up to 80 characters.'
 if(typeof p.email!=='string'||p.email.length>254||!/^\S+@[^\s@]+\.[^\s@]+$/.test(p.email.trim())||p.email.trim().split('@').length!==2)errors.email='Enter a valid email address.'
 if(!['licence','bug','feature','other'].includes(p.category))errors.category='Choose a category.'
 if(typeof p.subject!=='string'||p.subject.length>120)errors.subject='Use up to 120 characters.'
 if(typeof p.message!=='string'||p.message.trim().length<10||p.message.length>5000)errors.message='Write 10–5,000 characters.'
 return errors
}
// User-authored messages retain contact emails and paths; only credentials are removed.
export function scrubSupportMessage(value:unknown):string {
 return String(value??'').replace(/https?:\/\/[^\s<>]+/gi,raw=>{try{const u=new URL(raw);u.search='';u.hash='';u.username='';u.password='';return u.toString()}catch{return '[URL]'}})
 .replace(/NF(?:[-\s]?[A-Z0-9]{4}){5,}\b/gi,'NF-****').replace(/Bearer\s+[\w.\-]+/gi,'Bearer [redacted]')
 .replace(/\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}\b/g,'[redacted]')
 .replace(/\bre_[A-Za-z0-9]{16,}\b/g,'[redacted]')
 .replace(/\bapify_api_[A-Za-z0-9]{20,}\b/g,'[redacted]')
 .replace(/\bcsk[_-][A-Za-z0-9]{20,}\b/g,'[redacted]')
 .replace(/\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}/g,'[redacted]')
 .replace(/(?<![A-Za-z0-9_-])[A-Za-z0-9_-]{32,}(?![A-Za-z0-9_-])/g,(token,offset,text)=>{
  // Generic token detection must not damage a customer's email, URL or file path.
  const before=text.slice(0,offset),after=text.slice(offset)
  const word=(before.match(/[^\s"'<>]*$/)?.[0]||'')+(after.match(/^[^\s"'<>]*/)?.[0]||'')
  if(/[@/\\]/.test(word))return token
  const labelled=/\b(?:token|secret|api[ _-]?key|password|authorization)\s*(?:[:=]\s*)?["']?\s*$/i.test(before.slice(-80))
  const mixed=/[a-z]/.test(token)&&/[A-Z]/.test(token)
  const opaque43=token.length===43&&(token.match(/[A-Z]/g)||[]).length>=6&&(token.match(/[a-z]/g)||[]).length>=6
  return labelled||(mixed&&(/\d/.test(token)||opaque43))?'[redacted]':token
 })
}
// Automatic diagnostics additionally hide personal addresses, paths and opaque tokens.
export function scrubSupportText(value:unknown):string {
 return scrubSupportMessage(value).replace(/\b[\w.+-]+@([\w.-]+\.[a-z]{2,})\b/gi,'***@$1')
 .replace(/([A-Z]:[\\/]Users[\\/])[^\\/\r\n]+/gi,'$1***').replace(/(\/(?:home|Users)\/)[^/\s]+/g,'$1***').replace(/\b[A-Za-z0-9_-]{32,}\b/g,'[redacted]')
}
