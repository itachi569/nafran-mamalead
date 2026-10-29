import {useEffect,useState} from 'react'
import type {OwnerBrowserStatus} from '../types/desktop'
import './owner-browser.css'

export function OwnerBrowserControl(){
  const [status,setStatus]=useState<OwnerBrowserStatus>({phase:'closed',open:false,message:'Sign in once in MamaLead Chrome, then import websites to start.'})
  const [opening,setOpening]=useState(false)
  useEffect(()=>{
    const bridge=window.desktop?.ownerBrowser
    if(!bridge)return
    let active=true
    void bridge.status().then(value=>{if(active)setStatus(value)}).catch(()=>undefined)
    const unsubscribe=bridge.onStatus(value=>{if(active)setStatus(value)})
    return ()=>{active=false;unsubscribe()}
  },[])
  const act=async(action:'open'|'connect'|'signIn')=>{
    const bridge=window.desktop?.ownerBrowser
    if(!bridge){setStatus({phase:'error',open:false,message:'Open the desktop app to use MamaLead Chrome.'});return}
    setOpening(true)
    try{setStatus(await bridge[action]())}catch(error){setStatus({phase:'error',open:false,message:error instanceof Error?error.message:'Chrome could not open. Try again.'})}finally{setOpening(false)}
  }
  const manual=status.phase==='sign-in',connect=status.phase==='connect',failed=status.phase==='error'
  const scanning=status.phase==='searching' || status.phase==='verification'
  return <section className="owner-browser-card" data-owner-browser data-phase={status.phase}>
    <div className="owner-browser-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="2" y="3" width="20" height="17" rx="4"/><path d="M2 8h20M6 5.5h.1M9 5.5h.1M9 12l-2 2 2 2m6-4 2 2-2 2"/></svg></div>
    <div className="owner-browser-copy"><h2>Search with MamaLead Chrome <span>No API key</span></h2><p>Sign in directly in normal Chrome. Close that window, then connect your saved sign-in here. Up to two searches per business.</p><small role="status" aria-live="polite">{status.message}</small></div>
    <div className="owner-browser-actions">
      <button type="button" onClick={()=>void act(connect?'connect':failed?'signIn':'open')} disabled={opening || manual}>{opening?'Please wait…':manual?'Sign-in window is open':connect?'Connect saved sign-in':failed?'Sign in to Google':status.open?'Show Chrome':'Open Chrome & sign in'}<span aria-hidden="true"> ↗</span></button>
      {(connect || failed || status.open && !manual) && <button className="owner-browser-secondary" type="button" disabled={opening || scanning} onClick={()=>void act(failed?'connect':'signIn')}>{failed?'Connect saved sign-in':'Sign in to Google'}</button>}
    </div>
  </section>
}
