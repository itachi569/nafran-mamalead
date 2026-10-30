import { useEffect, useRef, useState } from 'react'
import { localDb } from '../lib/local'
import type { StoredLead } from '../types/desktop'

export function LeadDetails({id,onClose}:{id:string;onClose:()=>void}) {
  const [lead,setLead]=useState<StoredLead|null>(null)
  const [details,setDetails]=useState<{emails:string[];phones:string[];socials:string[]}>({emails:[],phones:[],socials:[]})
  const [error,setError]=useState('')
  const previousFocus=useRef(document.activeElement as HTMLElement|null)
  useEffect(()=>()=>previousFocus.current?.focus(),[])
  useEffect(()=>{let alive=true;const db=localDb();if(!db)return
    void Promise.all([db.leads.get(id),db.contacts.list('email',[id]),db.contacts.list('phone',[id]),db.social.list([id])]).then(([row,emails,phones,socials])=>{if(!alive)return;setLead(row);setDetails({emails:emails.map(item=>String(item.value)),phones:phones.map(item=>String(item.value)),socials:socials.map(item=>String(item.profile_url))})}).catch(e=>{if(alive)setError(String(e.message))})
    return ()=>{alive=false}
  },[id])
  useEffect(()=>{const close=(e:KeyboardEvent)=>{if(e.key==='Escape')onClose()};window.addEventListener('keydown',close);return()=>window.removeEventListener('keydown',close)},[onClose])
  const values=lead?[['Website',lead.website],['Phone',[...new Set([lead.phone,...details.phones].filter(Boolean))].join('\n')],['Email',details.emails.join('\n')],['Address',lead.address],['Rating',lead.rating==null?'Not rated':`${lead.rating} / 5 · ${lead.review_count ?? 0} reviews`],['Social profiles',details.socials.join('\n')],['Source',lead.provider==='import'?'Website import':lead.provider==='chromium-maps'?'Google Maps':lead.provider]]:[]
  return <div className="lead-detail-backdrop" onClick={event=>{if(event.target===event.currentTarget)onClose()}}><section role="dialog" aria-modal="true" aria-label="Lead details" className="lead-detail" onKeyDownCapture={event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();onClose()}}}><header><h2>{lead?.name || 'Lead details'}</h2><button autoFocus type="button" aria-label="Close lead details" onClick={onClose}>×</button></header>{error?<p role="alert">{error}</p>:!lead?<p>Loading saved details…</p>:<dl>{values.map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value || 'Not on file'}</dd></div>)}</dl>}<p>These details come from your saved results. Missing data is not guessed.</p></section></div>
}
