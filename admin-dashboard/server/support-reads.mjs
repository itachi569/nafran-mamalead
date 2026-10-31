const columns='id,client_message_id,installation_id,license_last4,license_kind,name,email,category,subject,message,message_hash,page,meta,ip_hash,email_status,status,admin_read_at,last_activity_at,closed_at,created_at'
const threadColumns='id,ticket_id,kind,body,from_status,to_status,actor,email_status,resend_id,client_action_id,created_at'
const parse=row=>row?{...row,meta:typeof row.meta==='string'?JSON.parse(row.meta):row.meta}:null
const DAY=86400000

// Parameterised reads, without SELECT * or credentials. Missing tables degrade cleanly.
export function createSupportReads(query, dialect='sqlite') {
 const installations=dialect==='neon'?'billing_installations':'installations'
 const safe=async(fn)=>{try{return await fn()}catch(e){if(/no such table|does not exist/i.test(e.message))return null;throw e}}
 const run=(text,args=[])=>query(dialect==='neon'?text.replace(/\?/g,(()=>{let i=0;return ()=>'$'+(++i)})()):text,args)
 const counts=()=>safe(async()=>{const rows=await run('select status,count(*) as n,sum(case when admin_read_at is null then 1 else 0 end) as unread from billing_support_messages group by status');const c={open:0,replied:0,closed:0,unread:0};for(const r of rows){c[r.status]=Number(r.n);c.unread+=Number(r.unread)}return c})
 return {
  supportCounts:counts,
  supportList:opt=>safe(async()=>{
   const clauses=[],args=[];const add=(s,...v)=>{clauses.push(s);args.push(...v)}
   if(opt.status!=='all')add('s.status=?',opt.status)
   if(opt.category!=='all')add('s.category=?',opt.category)
   if(opt.from)add('s.created_at>=?',opt.from+'T00:00:00.000Z')
   if(opt.to)add('s.created_at<?',new Date(Date.parse(opt.to)+DAY).toISOString())
   if(opt.unread)add('s.admin_read_at is null')
   if(opt.q){const q=opt.q.toLowerCase(),escaped=q.replace(/[\\%_]/g,'\\$&');add(`(lower(s.email) like ? escape '\\' or lower(s.id) like ? escape '\\' or lower(s.subject) like ? escape '\\' or lower(s.license_last4)=? or (${q.length>=6?'1=1':'1=0'} and (lower(s.installation_id) like ? escape '\\' or lower(i.device_id) like ? escape '\\')))`,'%'+escaped+'%','%'+escaped+'%','%'+escaped+'%',q,escaped+'%',escaped+'%')}
   const where=clauses.length?'where '+clauses.join(' and '):'',base=`from billing_support_messages s left join ${installations} i on i.id=s.installation_id ${where}`
   const [total]=await run(`select count(*) as n ${base}`,args)
   const rows=await run(`select ${columns.split(',').map(c=>'s.'+c).join(',')},i.device_platform,(select count(*) from billing_support_replies r where r.ticket_id=s.id and r.kind='reply') as replies ${base} order by s.${opt.sort==='created'?'created_at':'last_activity_at'} desc,s.id desc limit ? offset ?`,[...args,opt.pageSize,(opt.page-1)*opt.pageSize])
   return {rows:rows.map(parse),total:Number(total.n),page:opt.page,pageSize:opt.pageSize,counts:await counts()}
  }),
  supportTicket:id=>safe(async()=>parse((await run(`select ${columns} from billing_support_messages where id=?`,[id]))[0])),
  supportThread:id=>safe(()=>run(`select ${threadColumns} from billing_support_replies where ticket_id=? order by created_at,id`,[id])),
  supportSenderTickets:(email,id)=>safe(async()=>Number((await run('select count(*) as n from billing_support_messages where email=? or installation_id=?',[email,id]))[0].n)),
  supportContext:id=>safe(async()=>{
   const i=(await run(`select id,device_platform,last_seen_at,created_at,license_id from ${installations} where id=?`,[id]))[0]
   if(!i)return {installation:null,license:null}
   const licenseTable=dialect==='neon'?'billing_licenses':'licenses',trialTable=dialect==='neon'?'billing_trial_licenses':'trial_licenses'
   let l=(await run(`select id,key_last4,revoked_at from ${licenseTable} where id=? or installation_id=? limit 1`,[i.license_id,id]))[0],kind='lifetime'
   if(!l){l=(await run(`select id,key_last4,revoked_at from ${trialTable} where id=? or installation_id=? limit 1`,[i.license_id,id]))[0];kind='trial'}
   if(!l && dialect==='sqlite'){try{l=(await run('select id,key_last4,revoked_at,kind from owner_licenses where id=?',[i.license_id]))[0];if(l)kind=l.kind}catch(e){if(!/no such table/i.test(e.message))throw e}}
   const slots=l?Number((await run(`select count(*) as n from ${installations} where license_id=?`,[l.id]))[0].n):0
   return {installation:i,license:l?{...l,kind,slotsUsed:slots}:null}
  })
 }
}
