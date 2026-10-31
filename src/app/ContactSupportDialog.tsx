import {useEffect,useRef,useState} from 'react'
import {SUPPORT_EMAIL_FALLBACK,supportValidation,type SupportPayload,type SupportResult,type SupportConfig,type SupportCategory} from '../../electron/support-data'
import logo from '../../build/mamalead-icon.png'
import './contact-support.css'
const draftKey='mamalead.supportDraft.v1',lastSentKey='mamalead.supportLastSent.v1',emailKey='mamalead.supportEmail.v1'
const load=(key:string)=>{try{return JSON.parse(localStorage.getItem(key)||'null')}catch{return null}}
export function ContactSupportDialog({page,preset,onClose,onSent}:{page:string;preset?:{category?:SupportCategory;message?:string};onClose:()=>void;onSent:(ticket:string)=>void}) {
 const [data,setData]=useState<SupportPayload>(()=>{const old=load(draftKey);return {name:old?.name||'',email:old?.email||load(emailKey)||'',category:preset?.category||old?.category||'other',subject:old?.subject||'',message:preset?.message||old?.message||'',diagnostics:preset?.category?preset.category==='bug':old?.diagnostics===true,page}})
 const [config,setConfig]=useState<SupportConfig>({configured:false,email:SUPPORT_EMAIL_FALLBACK,slaText:''})
 const [busy,setBusy]=useState(false),[result,setResult]=useState<SupportResult|null>(null),[touched,setTouched]=useState<Record<string,boolean>>({}),[copied,setCopied]=useState(false)
 const [until,setUntil]=useState(Number(load(lastSentKey)||0)+60000),[clock,setClock]=useState(Date.now())
 const panel=useRef<HTMLElement>(null),current=useRef(data),alive=useRef(true),sent=useRef(false),pending=useRef(false)
 current.current=data
 const save=()=>{if(!sent.current && (current.current.message || current.current.subject || current.current.name))try{localStorage.setItem(draftKey,JSON.stringify({...current.current,updatedAt:Date.now()}))}catch{}}
 useEffect(()=>{const id=window.setTimeout(save,500);return()=>window.clearTimeout(id)},[data])
 useEffect(()=>{const id=window.setInterval(()=>setClock(Date.now()),1000);return()=>clearInterval(id)},[])
 useEffect(()=>{
  alive.current=true;const opener=document.activeElement as HTMLElement|null
  panel.current?.querySelector<HTMLInputElement>('input')?.focus()
  void window.desktop?.support?.status().then(c=>{if(alive.current){setConfig(c);setData(d=>d.email||!c.replyEmail?d:{...d,email:c.replyEmail})}}).catch(()=>{})
  const key=(e:KeyboardEvent)=>{
   if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();if(pending.current)void window.desktop?.support.cancel();onClose()}
   if(e.key!=='Tab')return
   const items=Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),summary,a[href]')||[]).filter(el=>el.getClientRects().length)
   const first=items[0],last=items.at(-1)
   if(e.shiftKey&&(document.activeElement===first||!panel.current?.contains(document.activeElement))){e.preventDefault();last?.focus()}
   else if(!e.shiftKey&&(document.activeElement===last||!panel.current?.contains(document.activeElement))){e.preventDefault();first?.focus()}
  }
  document.addEventListener('keydown',key,true)
  return()=>{alive.current=false;save();document.removeEventListener('keydown',key,true);if(opener?.isConnected)opener.focus()}
 },[])
 const errors=supportValidation(data),wait=Math.max(0,Math.ceil((until-clock)/1000))
 const change=(key:keyof SupportPayload,value:string|boolean)=>{setData(d=>({...d,[key]:value,...(key==='category'?{diagnostics:value==='bug'}:{})}));setResult(null);setTouched(t=>({...t,[key]:true}))}
 const close=()=>{if(pending.current)void window.desktop?.support.cancel();onClose()}
 async function send(){
  if(busy||Object.keys(errors).length||wait)return
  if(!window.desktop?.support){setResult({error:'Open the MamaLead desktop app to send a message.',offline:true});return}
  setBusy(true);pending.current=true;setResult(null);save()
  try{
   const answer=await window.desktop.support.send({...data,page});if(!alive.current)return
   setResult(answer)
   if(answer.ok&&answer.ticketId){sent.current=true;localStorage.removeItem(draftKey);localStorage.setItem(lastSentKey,JSON.stringify(Date.now()));localStorage.setItem(emailKey,JSON.stringify(data.email.trim()));onSent(answer.ticketId)}
   if(answer.retryAfterSeconds)setUntil(Date.now()+answer.retryAfterSeconds*1000)
  }catch{if(alive.current)setResult({error:'Could not reach MamaLead support. Your draft is saved.',offline:true})}
  finally{pending.current=false;if(alive.current)setBusy(false)}
 }
 return <div className="support-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)close()}}>
  <section ref={panel} className="support-dialog" role="dialog" aria-modal="true" aria-labelledby="support-title">
   <header><div className="support-brand"><img src={logo} alt=""/><span>MamaLead <small>HELP & SUPPORT</small></span></div><button type="button" aria-label="Close contact support" className="support-close" onClick={close}>×</button></header>
   {result?.ok&&result.ticketId?<div className="support-success" role="status"><span className="support-check">✓</span><h2 id="support-title">Message received</h2><p>Your ticket is <strong>{result.ticketId}</strong>.</p><p>We’ll reply to <strong>{data.email}</strong>{config.slaText?`. ${config.slaText}`:'.'}{result.emailQueued?' Your message is saved in our support inbox.':''}</p><button onClick={()=>{void navigator.clipboard.writeText(result.ticketId!).then(()=>setCopied(true))}}>{copied?'Ticket copied':'Copy ticket ID'}</button><button className="support-primary" onClick={close}>Done</button></div>:<>
   <h2 id="support-title">How can we help?</h2><p className="support-intro">Tell us what happened or share an idea. Your draft stays on this device until you send it.</p>
   <form onSubmit={e=>{e.preventDefault();void send()}} noValidate>
    <div className="support-fields"><div className="support-pair"><label>Your name <span>optional</span><input value={data.name} maxLength={80} disabled={busy} autoComplete="name" onChange={e=>change('name',e.target.value)}/></label><label>Reply email<input type="email" value={data.email} maxLength={254} disabled={busy} autoComplete="email" aria-invalid={Boolean(touched.email&&errors.email)} onChange={e=>change('email',e.target.value)}/>{touched.email&&errors.email&&<small role="alert">{errors.email}</small>}</label></div>
    <label>What is this about?<select value={data.category} disabled={busy} onChange={e=>change('category',e.target.value)}><option value="licence">Licence</option><option value="bug">Bug</option><option value="feature">Feature request</option><option value="other">Other</option></select></label>
    <label>Subject <span>optional</span><input value={data.subject} maxLength={120} disabled={busy} onChange={e=>change('subject',e.target.value)} placeholder="A short summary"/></label>
    <label>Message<textarea aria-label="Message" value={data.message} maxLength={5000} disabled={busy} rows={5} aria-invalid={Boolean(touched.message&&errors.message)} onChange={e=>change('message',e.target.value)} placeholder="What were you trying to do? What happened?"/><span className="support-counter">{data.message.length.toLocaleString()} / 5,000</span>{touched.message&&errors.message&&<small role="alert">{errors.message}</small>}</label>
    <div className="support-diagnostics"><label><input type="checkbox" checked={data.diagnostics} disabled={busy} onChange={e=>change('diagnostics',e.target.checked)}/>Attach diagnostics</label><details><summary>What’s included?</summary><p>Always: app and Electron versions, operating system and architecture, packaged-build status, current page, installation identity and licence type/status/last 4.</p><p>With diagnostics: language, time zone, up to 5 scrubbed error messages, total lead/run counts and email-validity provider name. No lead records, full keys, credentials, cookies or files are attached.</p></details></div>
    <p className="support-privacy">We send your message plus app version, OS and licence last 4. No leads, keys or files are attached automatically.</p>
    {result?.error&&<div className="support-error" role="alert">{result.offline?`Couldn’t reach MamaLead support. Your message is saved — try again, or email ${config.email}.`:result.error}{result.offline&&<button type="button" onClick={()=>void window.desktop?.support.openMail(`${data.subject}\n\n${data.message}`).catch(()=>setResult({error:`Could not open your mail app. Email ${config.email}.`,offline:true}))}>Copy message & open email</button>}</div>}
    {wait>0&&<p role="status">You can send another message in {wait} seconds.</p>}
    </div><footer><button type="button" disabled={busy} className="support-discard" onClick={()=>{localStorage.removeItem(draftKey);setData(d=>({...d,name:'',subject:'',message:'',category:'other',diagnostics:false}));setTouched({});setResult(null)}}>Discard draft</button><button type="button" onClick={close}>{busy?'Cancel send':'Cancel'}</button><button type="submit" className="support-primary" disabled={busy||wait>0||Object.keys(errors).length>0}>{busy?'Sending…':result?.offline?'Retry message':'Send message →'}</button></footer>
   </form></>}
  </section>
 </div>
}
