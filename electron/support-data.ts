export type SupportCategory='licence'|'bug'|'feature'|'other'
export interface SupportPayload {name:string;email:string;category:SupportCategory;subject:string;message:string;diagnostics:boolean;page:string}
export interface SupportResult {ok?:boolean;ticketId?:string;duplicate?:boolean;emailQueued?:boolean;error?:string;field?:string;retryAfterSeconds?:number;cancelled?:boolean;offline?:boolean}
export interface SupportConfig {configured:boolean;email:string;slaText:string;replyEmail?:string}
export const SUPPORT_EMAIL_FALLBACK='billing@nafran.co'
export function supportValidation(p:SupportPayload):Record<string,string> {
 const errors:Record<string,string>={}
 if(typeof p.name!=='string'||p.name.length>80)errors.name='Use up to 80 characters.'
 if(typeof p.email!=='string'||p.email.length>254||!/^\S+@[^\s@]+\.[^\s@]+$/.test(p.email.trim())||p.email.trim().split('@').length!==2)errors.email='Enter a valid email address.'
 if(!['licence','bug','feature','other'].includes(p.category))errors.category='Choose a category.'
 if(typeof p.subject!=='string'||p.subject.length>120)errors.subject='Use up to 120 characters.'
 if(typeof p.message!=='string'||p.message.trim().length<10||p.message.length>5000)errors.message='Write 10–5,000 characters.'
 return errors
}
export function scrubSupportText(value:unknown):string {
 return String(value??'').replace(/https?:\/\/[^\s<>]+/gi,raw=>{try{const u=new URL(raw);u.search='';u.hash='';u.username='';u.password='';return u.toString()}catch{return '[URL]'}})
 .replace(/NF(?:[-\s]?[A-Z0-9]{4}){5,}\b/gi,'NF-****').replace(/Bearer\s+[\w.\-]+/gi,'Bearer [redacted]')
 .replace(/(?:sk|rk|re|apify_api|csk)[_-][\w-]{8,}/gi,'[redacted]').replace(/\b[\w.+-]+@([\w.-]+\.[a-z]{2,})\b/gi,'***@$1')
 .replace(/([A-Z]:[\\/]Users[\\/])[^\\/\r\n]+/gi,'$1***').replace(/(\/(?:home|Users)\/)[^/\s]+/g,'$1***').replace(/\b[A-Za-z0-9_-]{32,}\b/g,'[redacted]')
}
