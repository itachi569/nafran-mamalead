import {createHash,randomInt} from 'node:crypto'
import {SUPPORT_EMAIL,SupportError,validateSupport} from './support-contract.mjs'
import {buildSupportEmail,deliverSupportEmail} from './support-email.mjs'
export function supportConfig(env,store) {
 return {configured:typeof store.reserveSupportMessage==='function',email:env.SUPPORT_INBOX || SUPPORT_EMAIL,slaText:env.SUPPORT_SLA_TEXT || '',deliveryConfigured:Boolean(env.RESEND_API_KEY&&env.EMAIL_FROM&&env.SUPPORT_INBOX)}
}
export async function sendSupport({env,store,installation,input,ip,fetcher=fetch,now=Date.now()}) {
 if(input?.website)return {ok:true,ticketId:null,duplicate:false}
 const value=validateSupport(input)
 if(!store.reserveSupportMessage)throw new SupportError(503,'Support messages are not configured yet.')
 const secret=env.SUPPORT_IP_SALT || env.DOWNLOAD_SIGNING_KEY || env.RESEND_API_KEY
 if(ip && !secret)throw new SupportError(503,'Support messages are not configured yet.')
 const license=await store.licenseForInstallation?.(installation.id)
 // Licence metadata comes from the authenticated installation, never the request.
 const kind=license?(license.kind || (license.expires_at?'trial':'lifetime')):null
 value.meta.license={kind:['trial','lifetime'].includes(kind)?kind:null,last4:license?.key_last4 || null,active:Boolean(license?.activated_at&&!license.revoked_at&&(!license.expires_at||Date.parse(license.expires_at)>now))}
 const created=new Date(now).toISOString()
 const row={...value,id:'ML-S-'+randomInt(2176782336).toString(36).padStart(6,'0').toUpperCase(),installation_id:installation.id,license_last4:value.meta.license.last4,license_kind:value.meta.license.kind,
  message_hash:createHash('sha256').update(value.message).digest('hex'),ip_hash:ip?createHash('sha256').update(ip+'|'+secret).digest('hex'):null,email_status:'pending',status:'open',created_at:created,last_activity_at:created}
 let saved
 try{saved=await store.reserveSupportMessage(row)}catch(e){if(e instanceof SupportError)throw e;throw new SupportError(503,'Support could not save your message. Your draft is safe; please retry.')}
 if(saved.retryAfterSeconds)throw new SupportError(429,`You've sent several messages recently. Try again in ${Math.ceil(saved.retryAfterSeconds/60)} minute${saved.retryAfterSeconds>60?'s':''}.`,null,saved.retryAfterSeconds)
 const ticket=saved.row
 if(ticket.email_status!=='sent') {
  let delivered=false
  try{delivered=Boolean(await deliverSupportEmail(env,{from:env.EMAIL_FROM,to:[env.SUPPORT_INBOX],reply_to:ticket.email,...buildSupportEmail(ticket)},'nafran-support-'+ticket.id,fetcher))}catch{}
  await store.markSupportEmail(ticket.id,delivered?'sent':'failed')
  ticket.email_status=delivered?'sent':'failed'
 }
 return {ok:true,ticketId:ticket.id,duplicate:saved.duplicate,emailQueued:ticket.email_status!=='sent'}
}

// Local service retries persisted notifications. Tickets are already visible in admin.
export async function retrySupportDelivery({env,store,fetcher=fetch,now=Date.now()}) {
 if(!env.RESEND_API_KEY||!env.EMAIL_FROM||!env.SUPPORT_INBOX)return {sent:0,failed:0};
 const rows=await store.pendingSupportMessages(new Date(now-120000).toISOString());let sent=0,failed=0;
 for(const ticket of rows){try{await deliverSupportEmail(env,{from:env.EMAIL_FROM,to:[env.SUPPORT_INBOX],reply_to:ticket.email,...buildSupportEmail(ticket)},'nafran-support-'+ticket.id,fetcher);await store.markSupportEmail(ticket.id,'sent');sent++;}catch{await store.markSupportEmail(ticket.id,'failed');failed++;}}
 return {sent,failed};
}
