import { useEffect, useRef } from 'react'
import type { AppValues } from './useAppValues'
import './saved-search.css'

export function FinderSearchHistory({V}:{V:AppValues}) {
  const finder=V.fPhone.histOpen?V.fPhone:V.fEmail.histOpen?V.fEmail:null
  const title=V.fPhone.histOpen?'Phone Finder':'Email Finder'
  const close=useRef<()=>void>(()=>undefined),panel=useRef<HTMLElement>(null)
  close.current=finder?.closeHist ?? (()=>undefined)
  const open=Boolean(finder)
  useEffect(()=>{
    if(!open)return
    const previous=document.activeElement as HTMLElement|null
    panel.current?.querySelector<HTMLButtonElement>('button')?.focus()
    const key=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();close.current()}if(event.key==='Tab'&&panel.current){const buttons=[...panel.current.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')],first=buttons[0],last=buttons[buttons.length-1];if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus()}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus()}}}
    window.addEventListener('keydown',key);return()=>{window.removeEventListener('keydown',key);previous?.isConnected&&previous.focus()}
  },[open])
  if(!finder)return null
  return <div className="saved-history-scrim" onClick={finder.closeHist}><aside ref={panel} className="saved-history" role="dialog" aria-modal="true" aria-label={`${title} search history`} onClick={event=>event.stopPropagation()}>
    <header><div><h2>{title} history</h2><p>Saved searches on this device. Select one to show its matches.</p></div><button type="button" aria-label="Close search history" onClick={finder.closeHist}>×</button></header>
    <ol>{finder.hist.map(item=><li key={item.q}><button type="button" onClick={item.run}><span>{item.q}</span><small>{item.n || '0'} matching saved records</small><span aria-hidden="true">↗</span></button></li>)}</ol>
    {!finder.hist.length&&<p className="saved-history-empty">No searches yet. Type a name, website, email or number to search your saved records.</p>}
    <footer><span>{finder.count} saved searches</span><button type="button" disabled={!finder.hist.length} onClick={finder.clearHistory}>Clear history</button></footer>
  </aside></div>
}
