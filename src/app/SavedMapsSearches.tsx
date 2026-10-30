import { useEffect, useMemo, useRef, useState } from 'react'
import type { AppValues } from './useAppValues'
import './saved-maps-searches.css'

function HistoryIcon() {
  return <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 11a9 9 0 1 1 2.6 7M3 5v6h6M12 7v5l3 2"/></svg>
}

export function SavedMapsButton({V}:{V:AppValues}) {
  return <button type="button" className="ms-open" onClick={V.openSavedMaps} aria-haspopup="dialog" data-saved-maps-button="1"><span className="ms-open-icon"><HistoryIcon/></span><span><strong>Saved searches <span className="ms-open-count">{V.savedMapsCount.toLocaleString()}</span></strong><small>View results &amp; export PDF / Excel</small></span><span className="ms-open-arrow" aria-hidden="true">↗</span></button>
}

const statusText:Record<string,string>={done:'Completed',failed:'Failed',cancelled:'Stopped by you',running:'Running',idle:'Saved'}

export function SavedMapsSearches({V}:{V:AppValues}) {
  const [query,setQuery]=useState('')
  const [limit,setLimit]=useState(30)
  const panel=useRef<HTMLElement>(null)
  const search=useRef<HTMLInputElement>(null)
  const values=useRef(V);values.current=V
  const opener=useRef<HTMLElement | null>(null)
  const filtered=useMemo(()=>{
    const needle=query.trim().toLowerCase()
    return V.savedMapsRuns.filter(run=>!needle || `${run.location} ${run.keywords} ${run.date}`.toLowerCase().includes(needle))
  },[V.savedMapsRuns,query])

  useEffect(()=>{
    opener.current=document.activeElement as HTMLElement | null
    search.current?.focus()
    const onKey=(event:KeyboardEvent)=>{
      const current=values.current
      const scope=current.expOpen ? document.querySelector<HTMLElement>('[data-export-backdrop] section') : panel.current
      if(event.key==='Escape') {
        event.preventDefault();event.stopPropagation()
        if(current.expOpen){if(!current.exportBusy)current.closeExp()}
        else current.closeSavedMaps()
      }
      if(event.key!=='Tab' || !scope)return
      const targets=Array.from(scope.querySelectorAll<HTMLElement>('button:not(:disabled),input,select,a[href]')).filter(el=>el.getClientRects().length)
      const first=targets[0],last=targets[targets.length-1]
      if(event.shiftKey && (document.activeElement===first || !scope.contains(document.activeElement))){event.preventDefault();last?.focus()}
      else if(!event.shiftKey && (document.activeElement===last || !scope.contains(document.activeElement))){event.preventDefault();first?.focus()}
    }
    document.addEventListener('keydown',onKey,true)
    return()=>{document.removeEventListener('keydown',onKey,true);if(opener.current?.isConnected)opener.current.focus()}
  },[])

  useEffect(()=>{
    if(V.expOpen) document.querySelector<HTMLButtonElement>('[data-export-backdrop] button')?.focus()
    else if(document.activeElement===document.body)search.current?.focus()
  },[V.expOpen])

  return <div className="ms-backdrop" data-saved-maps="1" onClick={event=>{if(event.target===event.currentTarget && !V.expOpen)V.closeSavedMaps()}}>
    <section ref={panel} className="ms-panel" role="dialog" aria-modal={!V.expOpen} aria-labelledby="saved-maps-title" aria-describedby="saved-maps-description">
      <header className="ms-heading"><div><span className="ms-eyebrow">GOOGLE MAPS · SAVED ON THIS DEVICE</span><h2 id="saved-maps-title">Saved searches <span>{V.savedMapsCount.toLocaleString()}</span></h2><p id="saved-maps-description">Find a past scan, open its results, or export that search to PDF or Excel.</p></div><button className="ms-close" type="button" aria-label="Close saved searches" onClick={V.closeSavedMaps}>×</button></header>
      <div className="ms-tools"><label><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/></svg><input ref={search} type="search" aria-label="Search saved searches" placeholder="Search by city, keyword or date…" value={query} onChange={event=>{setQuery(event.currentTarget.value);setLimit(30)}}/></label><button type="button" className="ms-refresh" disabled={V.savedMapsLoading} onClick={V.refreshSavedMaps}>{V.savedMapsLoading?'Refreshing…':'Refresh'}</button></div>
      <div className="ms-list" aria-busy={V.savedMapsLoading}>
        {V.savedMapsError&&<p role="alert" className="ms-error">{V.savedMapsError}</p>}
        {V.running&&<p className="ms-notice">A scan is running. You can export past searches now; open their results after the current scan finishes.</p>}
        <div className="ms-list-caption"><span>{filtered.length.toLocaleString()} {query?'matching':'saved'} search{filtered.length===1?'':'es'}</span><span>Newest first</span></div>
        {filtered.slice(0,limit).map(run=><article className={`ms-run${run.selected?' ms-selected':''}`} key={run.id} data-saved-run={run.id}>
          <div className="ms-run-icon" aria-hidden="true"><svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.4"/></svg></div>
          <div className="ms-run-copy"><div className="ms-run-title"><h3>{run.location}</h3>{run.selected&&<span className="ms-viewing">Selected</span>}<span className={`ms-status ms-status-${run.status}`}>{/^Interrupted:/.test(run.error)?'Interrupted':statusText[run.status] ?? 'Saved'}</span></div><p>{run.keywords}</p><div className="ms-run-meta"><strong>{run.count.toLocaleString()} of {run.target} leads saved</strong><span aria-hidden="true">·</span><span>{run.date}</span></div>{run.error&&<p className="ms-run-error">{run.error}</p>}<div className="ms-run-actions"><button type="button" className="ms-view" disabled={V.running} onClick={()=>V.viewSavedMapsRun(run.id)}>View results <span aria-hidden="true">↗</span></button><button type="button" className="ms-export" disabled={run.count===0 || Boolean(V.savedMapsExporting)} onClick={()=>V.openSavedMapsExport(run.id)} aria-label={`Export ${run.location} search`}><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3v12m-4-4 4 4 4-4M5 18v3h14v-3"/></svg>{V.savedMapsExporting===run.id?'Preparing…':'Export PDF / Excel'}</button></div></div>
        </article>)}
        {!filtered.length&&<div className="ms-empty"><HistoryIcon/><h3>{V.savedMapsLoading?'Loading saved searches…':query?'No matching searches':'Your searches will appear here'}</h3><p>{query?'Try another city or keyword.':'Google Maps searches and their results are saved automatically on this device as each lead is captured.'}</p>{query&&<button type="button" className="ms-view" onClick={()=>setQuery('')}>Clear search</button>}</div>}
        {filtered.length>limit&&<button type="button" className="ms-more" onClick={()=>setLimit(value=>value+30)}>Show more searches · {filtered.length-limit} remaining</button>}
      </div>
      <footer className="ms-footer"><span aria-hidden="true">✓</span> Searches stay saved when you close the app. Each export includes only the search you choose.</footer>
    </section>
  </div>
}
