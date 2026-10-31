const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
const html=text=>`<div style="font-family:Arial,sans-serif;max-width:680px;line-height:1.6;color:#1c1c1c"><h2>MamaLead Support</h2><div style="white-space:pre-wrap">${escape(text)}</div></div>`
export function buildSupportEmail(row) {
 const text=`Ticket ${row.id}\nCategory: ${row.category}\nFrom: ${row.name || 'Customer'} <${row.email}>\n\n${row.message}\n\nApp context (licence last 4 only):\n${JSON.stringify(row.meta,null,2)}\nPage: ${row.page}`
 return {subject:`[MamaLead ${row.category}] ${row.subject} · ${row.id}`,text,html:html(text)}
}
export function buildSupportReplyEmail({ticket,body,signature}) {
 const text=`${body}\n\n${signature || 'MamaLead Support · mamalead.com'}\n\n— Original message —\n${ticket.message.slice(0,1000)}\n\nTicket ${ticket.id}`
 return {subject:`Re: ${ticket.subject} [${ticket.id}]`,text,html:html(text)}
}
export async function deliverSupportEmail(env,payload,id,fetcher=fetch) {
 if(!env.RESEND_API_KEY||!env.EMAIL_FROM||!env.SUPPORT_INBOX)return null
 const response=await fetcher('https://api.resend.com/emails',{method:'POST',redirect:'error',signal:AbortSignal.timeout(20000),headers:{authorization:`Bearer ${env.RESEND_API_KEY}`,'content-type':'application/json','idempotency-key':id},body:JSON.stringify(payload)})
 if(!response.ok)throw new Error('Support email delivery failed.')
 const result=await response.json();return result.id || 'sent'
}
