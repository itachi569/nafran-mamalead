const ticketPattern=/^ML-S-[A-Z0-9]{6}$/
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const short=v=>String(v??'').slice(0,8)
const fail=(status,message)=>{throw Object.assign(new Error(message),{status})}
export async function supportApi({method,url,store,writer,body,email,actor,cap=2}) {
 const path=url.pathname.replace(/\/+$/,'')
 const configured=async()=>{try{return Boolean((await writer?.config())?.configured)}catch{return false}}
 const summary=r=>({id:r.id,created:r.created_at,lastActivity:r.last_activity_at,status:r.status,category:r.category,subject:r.subject,preview:r.message.slice(0,140),email:email(r.email),name:r.name,licenseLast4:r.license_last4,licenseKind:r.license_kind,installation:short(r.installation_id),platform:r.device_platform||r.meta?.app?.platform||'',appVersion:r.meta?.app?.version||'',unread:!r.admin_read_at,replies:Number(r.replies||0)})
 if(method==='GET'&&path==='/admin/api/support/unread')return await store.supportCounts?.() || {open:0,unread:0,available:false}
 if(method==='GET'&&path==='/admin/api/support'){
  const p=url.searchParams,enumValue=(key,values,defaultValue)=>{const v=p.get(key)||defaultValue;if(!values.includes(v))fail(400,'Invalid '+key+' filter.');return v}
  const opt={status:enumValue('status',['open','replied','closed','all'],'open'),category:enumValue('category',['licence','bug','feature','other','all'],'all'),from:p.get('from')||'',to:p.get('to')||'',q:p.get('q')||'',unread:p.get('unread')==='1',sort:enumValue('sort',['activity','created'],'activity'),page:Number(p.get('page')||1),pageSize:Number(p.get('pageSize')||25)}
  if(!Number.isSafeInteger(opt.page)||opt.page<1||opt.page>1e6||!Number.isSafeInteger(opt.pageSize)||opt.pageSize<1||opt.pageSize>100||opt.q.length>80)fail(400,'Invalid support list query.')
  for(const value of [opt.from,opt.to])if(value&&(!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value))))fail(400,'Use a valid date filter.')
  const result=await store.supportList?.(opt)
  if(!result)return {rows:[],total:0,page:1,pageSize:25,available:false,message:'Support needs the billing-server update.'}
  return {...result,rows:result.rows.map(summary),available:true,canWrite:Boolean(writer)}
 }
 const match=/^\/admin\/api\/support\/(ML-S-[A-Z0-9]{6})(?:\/(reply|notes))?$/.exec(path)
 if(!match)fail(404,'Support endpoint not found.')
 const id=match[1],ticket=await store.supportTicket?.(id)
 if(!ticket)fail(404,'Support ticket not found.')
 if(method==='GET'&&!match[2]){
  const [thread,context,count,canReply]=await Promise.all([store.supportThread(id),store.supportContext(ticket.installation_id),store.supportSenderTickets(ticket.email,ticket.installation_id),configured()])
  const i=context?.installation,l=context?.license
  return {ticket:{...summary(ticket),message:ticket.message,page:ticket.page,meta:ticket.meta,emailStatus:ticket.email_status,ipHashShort:short(ticket.ip_hash)},
   thread:(thread||[]).map(r=>({id:r.id,kind:r.kind,body:r.body,fromStatus:r.from_status,toStatus:r.to_status,actor:r.actor,created:r.created_at,emailStatus:r.email_status,clientActionId:r.client_action_id})),
   installation:i?{id:short(i.id),platform:i.device_platform,lastSeen:i.last_seen_at,created:i.created_at}:null,
   license:l?{id:short(l.id),last4:l.key_last4,kind:l.kind,revokedAt:l.revoked_at,slotsUsed:l.slotsUsed,cap}:null,
   links:{licenses:'?view=licenses&q='+encodeURIComponent(ticket.license_last4||''),activations:'?view=activations&q='+encodeURIComponent(ticket.license_last4||''),users:'?view=users&q='+encodeURIComponent(short(ticket.installation_id))},
   otherTickets:Math.max(0,(count||1)-1),canReply,canWrite:Boolean(writer)}
 }
 if(!writer)fail(503,'Support replies are not configured on this server.')
 const input=await body(),kind=method==='PATCH'&&!match[2]?'status':method==='POST'&&match[2]==='reply'?'reply':method==='POST'&&match[2]==='notes'?'note':null
 if(!kind)fail(405,'Unsupported support action.')
 if(!input||!uuid.test(input.clientActionId||'')||!ticketPattern.test(id))fail(400,'Invalid support action.')
 const payload={id,clientActionId:input.clientActionId,actor}
 if(kind==='reply'||kind==='note'){if(typeof input.body!=='string'||!input.body.trim()||input.body.length>(kind==='note'?2000:5000))fail(400,'Enter a message within the character limit.');payload.body=input.body.trim();payload.closeAfter=input.closeAfter===true}
 else {if(input.status!==undefined&&!['open','replied','closed'].includes(input.status))fail(400,'Invalid ticket status.');if(input.read!==undefined&&typeof input.read!=='boolean')fail(400,'Invalid read state.');if(input.status===undefined&&input.read===undefined)fail(400,'Choose a status or read state.');payload.status=input.status;payload.read=input.read}
 return writer[kind](payload)
}
