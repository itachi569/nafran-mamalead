// Support writes live in billing; admin uses only the read methods below.
export const supportSchema = [
 `create table if not exists billing_support_messages (
 id text primary key, client_message_id text not null unique, installation_id text not null,
 license_last4 text, license_kind text, name text, email text not null, category text not null,
 subject text not null, message text not null, message_hash text not null, page text,
 meta text not null default '{}', ip_hash text, email_status text not null default 'pending',
 status text not null default 'open', admin_read_at text, last_activity_at text not null,
 closed_at text, created_at text not null)`,
 `create table if not exists billing_support_replies (
 id text primary key, ticket_id text not null references billing_support_messages(id), kind text not null,
 body text, from_status text, to_status text, actor text not null, email_status text, resend_id text,
 client_action_id text not null unique, created_at text not null)`,
 'create index if not exists support_install on billing_support_messages(installation_id,created_at)',
 'create index if not exists support_status on billing_support_messages(status,last_activity_at)',
 'create index if not exists support_email on billing_support_messages(email,created_at)',
 'create index if not exists support_ip on billing_support_messages(ip_hash,created_at)',
 'create index if not exists support_thread on billing_support_replies(ticket_id,created_at)'
]
const columns='id,client_message_id,installation_id,license_last4,license_kind,name,email,category,subject,message,message_hash,page,meta,ip_hash,email_status,status,admin_read_at,last_activity_at,closed_at,created_at'
const threadColumns='id,ticket_id,kind,body,from_status,to_status,actor,email_status,resend_id,client_action_id,created_at'
const parse=row=>row?{...row,meta:typeof row.meta==='string'?JSON.parse(row.meta):row.meta}:null
const DAY=86400000
function limits(row) {
 const now=Date.parse(row.created_at)
 return [ ['installation_id',row.installation_id,60000,1],['installation_id',row.installation_id,3600000,5],['installation_id',row.installation_id,DAY,20],['email',row.email,DAY,10],...(row.ip_hash?[['ip_hash',row.ip_hash,DAY,30]]:[]) ].map(([column,value,ms,cap])=>({column,value,ms,cap,since:new Date(now-ms).toISOString()}))
}
function values(row){return columns.split(',').map(k=>k==='meta'?JSON.stringify(row.meta):row[k]??null)}
export function createSqliteSupportStore(db) {
 for(const sql of supportSchema)db.exec(sql)
 return {
  async reserveSupportMessage(row){
   db.exec('BEGIN IMMEDIATE')
   try {
    const prior=db.prepare(`select ${columns} from billing_support_messages where installation_id=? and (client_message_id=? or (message_hash=? and created_at>=?)) order by created_at desc limit 1`).get(row.installation_id,row.client_message_id,row.message_hash,new Date(Date.parse(row.created_at)-DAY).toISOString())
    if(prior){db.exec('COMMIT');return {row:parse(prior),duplicate:true}}
    let wait=0
    for(const l of limits(row)){const r=db.prepare(`select count(*) as n,min(created_at) as oldest from billing_support_messages where ${l.column}=? and created_at>?`).get(l.value,l.since);if(r.n>=l.cap)wait=Math.max(wait,Math.ceil((Date.parse(r.oldest)+l.ms-Date.parse(row.created_at))/1000))}
    if(wait){db.exec('COMMIT');return {retryAfterSeconds:wait}}
    db.prepare(`insert into billing_support_messages (${columns}) values (${columns.split(',').map(()=>'?').join(',')})`).run(...values(row));db.exec('COMMIT');return {row,duplicate:false}
   }catch(e){db.exec('ROLLBACK');throw e}
  },
  async pendingSupportMessages(before){return db.prepare(`select ${columns} from billing_support_messages where email_status != 'sent' and created_at < ? order by created_at limit 10`).all(before).map(parse)},
  async markSupportEmail(id,status){db.prepare('update billing_support_messages set email_status=? where id=?').run(status,id)},
  async supportByClientId(id){return parse(db.prepare(`select ${columns} from billing_support_messages where client_message_id=?`).get(id))}
 }
}
export function createNeonSupportStore(sql) {
 let readyPromise
 const ready=()=>readyPromise??=(async()=>{for(const ddl of supportSchema)await sql.query(ddl)})().catch(e=>{readyPromise=null;throw e})
 return {
  async reserveSupportMessage(row){
   await ready()
   const params=values(row), bind=value=>{params.push(value);return '$'+params.length}
   const duplicate=`installation_id=${bind(row.installation_id)} and (client_message_id=${bind(row.client_message_id)} or (message_hash=${bind(row.message_hash)} and created_at>=${bind(new Date(Date.parse(row.created_at)-DAY).toISOString())}))`
   const checks=limits(row).map(l=>`(select count(*) from billing_support_messages where ${l.column}=${bind(l.value)} and created_at>${bind(l.since)}) < ${l.cap}`)
   const insert=`insert into billing_support_messages (${columns}) select ${values(row).map((_,i)=>'$'+(i+1)).join(',')} where not exists(select 1 from billing_support_messages where ${duplicate}) and ${checks.join(' and ')} on conflict do nothing returning id`
   // Separate statements under READ COMMITTED: lock first, then a fresh snapshot.
   const result=await sql.transaction([
    sql`select pg_advisory_xact_lock(89412319)`,sql.query(insert,params),
    sql.query(`select ${columns} from billing_support_messages where installation_id=$1 and (client_message_id=$2 or (message_hash=$3 and created_at>=$4)) order by created_at desc limit 1`,[row.installation_id,row.client_message_id,row.message_hash,new Date(Date.parse(row.created_at)-DAY).toISOString()])
   ],{isolationLevel:'ReadCommitted'})
   if(result[2][0])return {row:parse(result[2][0]),duplicate:!result[1].length}
   let wait=60
   for(const l of limits(row)){const [r]=await sql.query(`select count(*) as n,min(created_at) as oldest from billing_support_messages where ${l.column}=$1 and created_at>$2`,[l.value,l.since]);if(Number(r.n)>=l.cap)wait=Math.max(wait,Math.ceil((Date.parse(r.oldest)+l.ms-Date.parse(row.created_at))/1000))}
   return {retryAfterSeconds:wait}
  },
  async pendingSupportMessages(before){await ready();return (await sql.query(`select ${columns} from billing_support_messages where email_status != 'sent' and created_at < $1 order by created_at limit 10`,[before])).map(parse)},
  async markSupportEmail(id,status){await ready();await sql`update billing_support_messages set email_status=${status} where id=${id}`},
  async supportByClientId(id){await ready();return parse((await sql.query(`select ${columns} from billing_support_messages where client_message_id=$1`,[id]))[0])}
 }
}
