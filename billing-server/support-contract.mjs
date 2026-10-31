export const SUPPORT_EMAIL = 'billing@nafran.co'
export const categories = ['licence', 'bug', 'feature', 'other']
export const ticketPattern = /^ML-S-[A-Z0-9]{6}$/
export const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
export class SupportError extends Error {
  constructor(status, message, field, retryAfterSeconds) { super(message); Object.assign(this, {status, field, retryAfterSeconds}) }
}
export function scrubSupportMessage(value) {
  return String(value ?? '').replace(/https?:\/\/[^\s<>]+/gi, raw => {try {const u=new URL(raw);u.search='';u.hash='';u.username='';u.password='';return u.toString()} catch{return '[URL]'}})
    .replace(/NF(?:[-\s]?[A-Z0-9]{4}){5,}\b/gi,'NF-****')
    .replace(/(?:Bearer\s+)[\w.\-]+/gi,'Bearer [redacted]')
    .replace(/\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}\b/g,'[redacted]')
    .replace(/\bre_[A-Za-z0-9]{16,}\b/g,'[redacted]')
    .replace(/\bapify_api_[A-Za-z0-9]{20,}\b/g,'[redacted]')
    .replace(/\bcsk[_-][A-Za-z0-9]{20,}\b/g,'[redacted]')
}
export function scrubSupportText(value) {
  return scrubSupportMessage(value).replace(/\b[\w.+-]+@([\w.-]+\.[a-z]{2,})\b/gi,'***@$1')
    .replace(/([A-Z]:[\\/]Users[\\/])[^\\/\s]+(?: [^\\/\s]+)*/gi,'$1***')
    .replace(/(\/(?:home|Users)\/)[^/\s]+/g,'$1***')
    .replace(/\b[A-Za-z0-9_-]{32,}\b/g,'[redacted]')
}
export function cleanMeta(input, diagnostics) {
  const m=input && typeof input==='object'?input:{}, a=m.app || {}, l=m.license || {}
  const safe = (v,n=80) => scrubSupportText(typeof v==='string'?v:'').slice(0,n)
  const result={app:{version:safe(a.version,30),platform:safe(a.platform,20),arch:safe(a.arch,20),osRelease:safe(a.osRelease),electron:safe(a.electron,30),isPackaged:a.isPackaged===true},
    license:{kind:['trial','lifetime'].includes(l.kind)?l.kind:null,last4:/^[A-Z0-9]{4}$/i.test(l.last4 || '')?l.last4:null,active:l.active===true}}
  if(diagnostics) Object.assign(result,{locale:safe(m.locale),timezone:safe(m.timezone),lastErrors:Array.isArray(m.lastErrors)?m.lastErrors.slice(-5).map(e=>({at:/^\d{4}-\d\d-\d\dT/.test(e?.at || '')?safe(e.at,40):'',text:safe(e?.text,800)})):[],counts:{leads:Math.max(0,Math.min(1e9,Number(m.counts?.leads)||0)),runs:Math.max(0,Math.min(1e9,Number(m.counts?.runs)||0))},emailValidityProvider:['leadsangel','apify','mailverifier'].includes(m.emailValidityProvider)?m.emailValidityProvider:null})
  return result
}
export function validateSupport(input) {
  if(!input || typeof input!=='object' || Array.isArray(input))throw new SupportError(400,'Enter your support message.')
  const field=(key,min,max)=>{const v=input[key]??'';if(typeof v!=='string'||v.trim().length<min||v.length>max)throw new SupportError(400,`Enter ${key} (${min}–${max} characters).`,key);return v.trim()}
  const name=field('name',0,80),email=field('email',1,254).toLowerCase(),subject=field('subject',0,120),message=field('message',10,5000)
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||/[\r\n]/.test(email))throw new SupportError(400,'Enter a valid email address.','email')
  if(!categories.includes(input.category))throw new SupportError(400,'Choose a support category.','category')
  if(!uuidPattern.test(input.clientMessageId || ''))throw new SupportError(400,'Please reopen the support form.')
  if((message.match(/https?:\/\//gi)||[]).length>5)throw new SupportError(400,'Too many links. Include at most 5 URLs.','message')
  const page=/^(dashboard|maps|social|email|phone|website|leads|lists|runs|settings(?::(?:acct|plan|inv|pay))?)$/.test(input.page || '')?input.page:'unknown'
  return {client_message_id:input.clientMessageId,name,email,category:input.category,subject:scrubSupportMessage(subject || `${input.category}: ${message.slice(0,60)}`).replace(/[\r\n]/g,' '),message:scrubSupportMessage(message),page,meta:cleanMeta(input.meta,input.diagnostics===true)}
}
export function validateSupportAction(kind,input) {
  if(!input||!ticketPattern.test(input.id || '')||!uuidPattern.test(input.clientActionId || ''))throw new SupportError(400,'Choose a valid support ticket and action.')
  if(kind==='reply'||kind==='note') {if(typeof input.body!=='string'||!input.body.trim()||input.body.length>(kind==='note'?2000:5000))throw new SupportError(400,`Enter ${kind==='note'?'a note (1–2000)':'a reply (1–5000)'} characters.`)}
  else if(kind==='status'){if(input.status!==undefined&&!['open','replied','closed'].includes(input.status))throw new SupportError(400,'Choose a valid ticket status.');if(input.read!==undefined&&typeof input.read!=='boolean')throw new SupportError(400,'Invalid read state.');if(input.status===undefined&&input.read===undefined)throw new SupportError(400,'Choose a status or read state.')}
  else throw new SupportError(404,'Support action not found.')
  return {id:input.id,clientActionId:input.clientActionId,body:input.body?.trim(),status:input.status,read:input.read,closeAfter:input.closeAfter===true}
}
