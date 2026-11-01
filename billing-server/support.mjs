import {createHash,randomInt} from 'node:crypto'
import {SUPPORT_EMAIL,SupportError,validateSupport} from './support-contract.mjs'
import {buildSupportEmail,buildSupportReceipt,deliverSupportEmail} from './support-email.mjs'
import {isIP} from 'node:net'
export function supportConfig(env,store) {
 const emailConfigured=Boolean(env.RESEND_API_KEY?.trim()&&env.EMAIL_FROM?.trim()&&env.SUPPORT_INBOX?.trim())
 return {configured:typeof store.reserveSupportMessage==='function',email:env.SUPPORT_INBOX || SUPPORT_EMAIL,slaText:env.SUPPORT_SLA_TEXT || '',deliveryConfigured:emailConfigured,emailConfigured}
}
export function webSupportConfig(env,store) {
 const config=supportConfig(env,store)
 const captchaConfigured=Boolean(env.TURNSTILE_SITE_KEY?.trim()&&env.TURNSTILE_SECRET_KEY?.trim())
 return {...config,configured:config.configured&&captchaConfigured,captchaConfigured,turnstileSiteKey:captchaConfigured?env.TURNSTILE_SITE_KEY.trim():null}
}
export async function sendWebSupport({env,store,input,ip,fetcher=fetch,now=Date.now()}) {
 if(input?.website)return {ok:true,ticketId:null,duplicate:false}
 validateSupport(input)
 if(typeof input.turnstileToken!=='string'||!input.turnstileToken.trim()||input.turnstileToken.length>2048)throw new SupportError(400,'Complete the security check first.','turnstileToken')
 if(!webSupportConfig(env,store).configured)throw new SupportError(503,'The support form is temporarily unavailable. Please email our support team.')
 if(!isIP(ip))throw new SupportError(503,'The support form could not verify this connection. Please try again.')
 let result
 try {
  const response=await fetcher('https://challenges.cloudflare.com/turnstile/v0/siteverify',{method:'POST',redirect:'error',signal:AbortSignal.timeout(8000),headers:{'content-type':'application/json'},body:JSON.stringify({secret:env.TURNSTILE_SECRET_KEY,response:input.turnstileToken,remoteip:ip})})
  if(!response.ok)throw new Error('verification unavailable')
  result=await response.json()
 }catch{throw new SupportError(503,'The security check is temporarily unavailable. Please try again.')}
 const hosts=new Set((env.TURNSTILE_HOSTNAMES || 'mamalead.com,www.mamalead.com').split(',').map(h=>h.trim().toLowerCase()).filter(Boolean))
 if(!result.success || !hosts.has(String(result.hostname).toLowerCase()) || result.action!=='mamalead_support')throw new SupportError(403,'The security check expired or failed. Please complete it again.','turnstileToken')
 const secret=env.SUPPORT_IP_SALT || env.DOWNLOAD_SIGNING_KEY || env.RESEND_API_KEY
 if(!secret)throw new SupportError(503,'Support messages are not configured yet.')
 // Public messages do not create billing installations or trust client licence metadata.
 const id='web:'+createHash('sha256').update(ip+'|'+input.email.trim().toLowerCase()+'|'+secret).digest('hex')
 return sendSupport({env,store,installation:{id},input:{...input,page:'website',diagnostics:false,meta:{app:{platform:'web'}}},source:'website',ip,fetcher,now})
}
async function deliverTicket(env,store,ticket,fetcher) {
 const attempts=[]
 if(ticket.email_status!=='sent')attempts.push((async()=>{
  let delivered=false
  try{delivered=Boolean(await deliverSupportEmail(env,{from:env.EMAIL_FROM,to:[env.SUPPORT_INBOX],reply_to:ticket.email,...buildSupportEmail(ticket)},'nafran-support-'+ticket.id,fetcher))}catch{}
  if(!delivered)console.warn('[support-delivery]',JSON.stringify({ticketId:ticket.id,phase:'inbox',status:'queued-for-retry'}))
  ticket.email_status=delivered?'sent':'failed';await store.markSupportEmail(ticket.id,ticket.email_status)
 })())
 if(['pending','failed'].includes(ticket.receipt_status))attempts.push((async()=>{
  let delivered=false
  try{delivered=Boolean(await deliverSupportEmail(env,{from:env.SUPPORT_REPLY_FROM || env.EMAIL_FROM,to:[ticket.email],reply_to:env.SUPPORT_INBOX,...buildSupportReceipt(ticket)},'mamalead-support-receipt-'+ticket.id,fetcher))}catch{}
  if(!delivered)console.warn('[support-delivery]',JSON.stringify({ticketId:ticket.id,phase:'receipt',status:'queued-for-retry'}))
  ticket.receipt_status=delivered?'sent':'failed';await store.markSupportReceipt(ticket.id,ticket.receipt_status)
 })())
 await Promise.all(attempts)
}
export async function sendSupport({env,store,installation,input,ip,fetcher=fetch,now=Date.now(),source='app'}) {
 if(input?.website)return {ok:true,ticketId:null,duplicate:false}
 const value=validateSupport(input)
 if(!store.reserveSupportMessage)throw new SupportError(503,'Support messages are not configured yet.')
 const secret=env.SUPPORT_IP_SALT || env.DOWNLOAD_SIGNING_KEY || env.RESEND_API_KEY
 if(ip && !secret)throw new SupportError(503,'Support messages are not configured yet.')
 const license=source==='website'?null:await store.licenseForInstallation?.(installation.id)
 // Licence metadata comes from the authenticated installation, never the request.
 const kind=license?(license.kind || (license.expires_at?'trial':'lifetime')):null
 value.meta.license={kind:['trial','lifetime'].includes(kind)?kind:null,last4:license?.key_last4 || null,active:Boolean(license?.activated_at&&!license.revoked_at&&(!license.expires_at||Date.parse(license.expires_at)>now))}
 const created=new Date(now).toISOString()
 const row={...value,id:'ML-S-'+randomInt(2176782336).toString(36).padStart(6,'0').toUpperCase(),installation_id:installation.id,license_last4:value.meta.license.last4,license_kind:value.meta.license.kind,
  message_hash:createHash('sha256').update(value.message).digest('hex'),ip_hash:ip?createHash('sha256').update(ip+'|'+secret).digest('hex'):null,email_status:'pending',receipt_status:'pending',source,status:'open',created_at:created,last_activity_at:created}
 let saved
 try{saved=await store.reserveSupportMessage(row)}catch(e){if(e instanceof SupportError)throw e;throw new SupportError(503,'Support could not save your message. Your draft is safe; please retry.')}
 if(saved.retryAfterSeconds)throw new SupportError(429,`You've sent several messages recently. Try again in ${Math.ceil(saved.retryAfterSeconds/60)} minute${saved.retryAfterSeconds>60?'s':''}.`,null,saved.retryAfterSeconds)
 const ticket=saved.row
 await deliverTicket(env,store,ticket,fetcher)
 const emailSent=ticket.email_status==='sent',receiptSent=ticket.receipt_status==='sent'
 return {ok:true,ticketId:ticket.id,duplicate:saved.duplicate,emailSent,receiptSent,emailQueued:!emailSent||['pending','failed'].includes(ticket.receipt_status)}
}

// Local service retries persisted notifications. Tickets are already visible in admin.
export async function retrySupportDelivery({env,store,fetcher=fetch,now=Date.now()}) {
 if(!env.RESEND_API_KEY||!env.EMAIL_FROM||!env.SUPPORT_INBOX)return {sent:0,failed:0};
 const rows=await store.pendingSupportMessages(new Date(now-120000).toISOString());let sent=0,failed=0;
 for(const ticket of rows){try{await deliverTicket(env,store,ticket,fetcher);if(ticket.email_status==='sent'&&!['pending','failed'].includes(ticket.receipt_status))sent++;else failed++}catch{failed++}}
 return {sent,failed};
}
