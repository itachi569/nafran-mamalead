import {randomUUID} from 'node:crypto'
import {SupportError,validateSupportAction} from './support-contract.mjs'
import {buildSupportReplyEmail,deliverSupportEmail} from './support-email.mjs'
export function createAdminSupport(db,{env=process.env,fetch:fetcher=fetch}={}) {
 const active=new Map()
 const configured=()=>Boolean(env.RESEND_API_KEY&&env.EMAIL_FROM&&env.SUPPORT_INBOX)
 async function perform(kind,input) {
  if(kind==='config')return {configured:configured()}
  const p=validateSupportAction(kind,input),actor=String(input.actor || 'owner-token').slice(0,254)
  const ticket=db.prepare('select id,email,subject,message,status from billing_support_messages where id=?').get(p.id)
  if(!ticket)throw new SupportError(404,'Support ticket not found.')
  let row=db.prepare('select * from billing_support_replies where client_action_id=?').get(p.clientActionId)
  if(row&&(row.ticket_id!==p.id||row.kind!==kind||((kind==='reply'||kind==='note')&&row.body!==p.body)))throw new SupportError(409,'This action was already used. Refresh the ticket before sending.')
  if(kind==='reply'&&row?.email_status!=='sent'&&!configured())throw new SupportError(503,'Support replies are not configured on this server.')
  if(!row){
   if(kind==='reply'){
    const count=db.prepare("select count(*) as n from billing_support_replies where actor=? and kind='reply' and created_at>?").get(actor,new Date(Date.now()-3600000).toISOString()).n
    if(count>=30)throw new SupportError(429,'Reply limit reached. Try again in an hour.')
   }
   const at=new Date().toISOString()
   row={id:randomUUID(),ticket_id:p.id,kind,body:p.body || (p.read===undefined?null:p.read?'Marked read':'Marked unread'),from_status:kind==='status'?ticket.status:null,to_status:kind==='reply'?(p.closeAfter?'closed':'replied'):p.status || null,actor,email_status:kind==='reply'?'pending':null,client_action_id:p.clientActionId,created_at:at}
   db.exec('BEGIN IMMEDIATE')
   try{
    db.prepare('insert into billing_support_replies(id,ticket_id,kind,body,from_status,to_status,actor,email_status,client_action_id,created_at) values(?,?,?,?,?,?,?,?,?,?)').run(...['id','ticket_id','kind','body','from_status','to_status','actor','email_status','client_action_id','created_at'].map(k=>row[k]))
    if(kind==='note')db.prepare('update billing_support_messages set last_activity_at=?,admin_read_at=? where id=?').run(at,at,p.id)
    if(kind==='status'){
     if(p.status)db.prepare('update billing_support_messages set status=?,closed_at=?,last_activity_at=? where id=?').run(p.status,p.status==='closed'?at:null,at,p.id)
     if(p.read!==undefined)db.prepare('update billing_support_messages set admin_read_at=? where id=?').run(p.read?at:null,p.id)
    }
    db.exec('COMMIT')
   }catch(e){db.exec('ROLLBACK');throw e}
  }
  if(kind==='reply'&&row.email_status!=='sent'){
   let resendId
   try{resendId=await deliverSupportEmail(env,{from:env.SUPPORT_REPLY_FROM || env.EMAIL_FROM,to:[ticket.email],reply_to:env.SUPPORT_INBOX,...buildSupportReplyEmail({ticket,body:row.body,signature:env.SUPPORT_SIGNATURE})},'nafran-support-reply-'+row.client_action_id,fetcher)}catch{}
   if(!resendId){db.prepare("update billing_support_replies set email_status='failed' where id=?").run(row.id);throw new SupportError(502,'Email could not be sent. The reply was saved as failed; retry.')}
   const at=new Date().toISOString(),status=row.to_status || 'replied'
   db.exec('BEGIN IMMEDIATE')
   try{db.prepare("update billing_support_replies set email_status='sent',resend_id=? where id=?").run(resendId,row.id);db.prepare('update billing_support_messages set status=?,last_activity_at=?,admin_read_at=?,closed_at=? where id=?').run(status,at,at,status==='closed'?at:null,p.id);db.exec('COMMIT')}catch(e){db.exec('ROLLBACK');throw e}
   row.email_status='sent'
  }
  const current=db.prepare('select status,admin_read_at from billing_support_messages where id=?').get(p.id)
  return {ok:true,status:current.status,readAt:current.admin_read_at,...(kind==='reply'?{reply:{id:row.id,emailStatus:row.email_status}}:kind==='note'?{note:{id:row.id,created:row.created_at}}:{})}
 }
 return async(kind,input)=>{
  const key=input?.clientActionId
  if(!key)return perform(kind,input)
  const identity=JSON.stringify({kind,...input})
  if(active.has(key)){if(active.get(key).identity!==identity)throw new SupportError(409,'A different action is already using this identifier.');return active.get(key).promise}
  const promise=perform(kind,input).finally(()=>active.delete(key));active.set(key,{identity,promise});return promise
 }
}
