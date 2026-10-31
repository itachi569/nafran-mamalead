import {createPortal} from 'react-dom'
import { useEffect, useRef, useState } from 'react'
import { localDb } from '../lib/local'
import type { StoredLead } from '../types/desktop'

export function LeadDetails({id,onClose}:{id:string;onClose:()=>void}) {
  const [lead,setLead]=useState<StoredLead|null>(null)
  const [details,setDetails]=useState<{emails:string[];phones:string[];socials:string[]}>({emails:[],phones:[],socials:[]})
  const [error,setError]=useState('')
  const [editing,setEditing]=useState(false),[busy,setBusy]=useState(false)
  const [draft,setDraft]=useState({name:'',phone:'',website:'',address:'',category:''})
  const previousFocus=useRef(document.activeElement as HTMLElement|null)
  useEffect(()=>{const overflow=document.body.style.overflow;document.body.style.overflow='hidden';return()=>{document.body.style.overflow=overflow;previousFocus.current?.focus({preventScroll:true})}},[])
  useEffect(()=>{let alive=true;const db=localDb();if(!db)return
    void Promise.all([db.leads.get(id),db.contacts.list('email',[id]),db.contacts.list('phone',[id]),db.social.list([id])]).then(([row,emails,phones,socials])=>{if(!alive)return;setLead(row);setDetails({emails:emails.map(item=>String(item.value)),phones:phones.map(item=>String(item.value)),socials:socials.map(item=>String(item.profile_url))})}).catch(e=>{if(alive)setError(String(e.message))})
    return ()=>{alive=false}
  },[id])
  useEffect(()=>{const close=(e:KeyboardEvent)=>{if(e.key==='Escape')onClose()};window.addEventListener('keydown',close);return()=>window.removeEventListener('keydown',close)},[onClose])
  const values=lead?[['Website',lead.website],['Phone',[...new Set([lead.phone,...details.phones].filter(Boolean))].join('\n')],['Email',details.emails.join('\n')],['Address',lead.address],['Rating',lead.rating==null?'Not rated':`${lead.rating} / 5 · ${lead.review_count ?? 0} reviews`],['Social profiles',details.socials.join('\n')],['Source',lead.provider==='import'?'Website import':lead.provider==='chromium-maps'?'Google Maps':lead.provider]]:[]
  return createPortal(<div className="lead-detail-backdrop" onPointerDown={event=>{if(event.target===event.currentTarget && !busy)onClose()}}>
    <section role="dialog" aria-modal="true" aria-label="Lead details" className="lead-detail">
      <header><h2>{lead?.name || 'Lead details'}</h2><button autoFocus type="button" aria-label="Close lead details" disabled={busy} onClick={onClose}>×</button></header>
      {error && <p role="alert">{error}</p>}
      {!lead ? <p>Loading saved details…</p> : editing ? <form className="lead-edit-form" onSubmit={async event=>{event.preventDefault();if(busy)return;setBusy(true);setError('');try{const db=localDb();if(!db)throw new Error('Open the desktop app.');await db.leads.update(id,draft);setLead(await db.leads.get(id));setEditing(false)}catch(e){setError(e instanceof Error?e.message:'Could not save changes.')}finally{setBusy(false)}}}>
        {(['name','phone','website','address','category'] as const).map(key=><label key={key}>{key==='name'?'Business name':key.charAt(0).toUpperCase()+key.slice(1)}<input aria-label={`Edit ${key}`} value={draft[key]} required={key==='name'} maxLength={key==='address'?2000:500} onChange={event=>setDraft(current=>({...current,[key]:event.target.value}))}/></label>)}
        <div className="data-toolbar"><button disabled={busy} type="submit">{busy?'Saving…':'Save changes'}</button><button disabled={busy} type="button" onClick={()=>{setEditing(false);setError('')}}>Cancel</button></div>
      </form> : <><dl>{values.map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value || 'Not on file'}</dd></div>)}</dl><button className="data-action" onClick={()=>{setDraft({name:lead.name,phone:lead.phone,website:lead.website,address:lead.address,category:lead.category});setEditing(true)}}>Edit lead</button></>}
      <p>These details come from your saved results. Missing data is not guessed.</p>
    </section>
  </div>,document.body)
}
