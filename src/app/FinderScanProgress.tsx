import { useLayoutEffect, useRef } from 'react'
import type { FinderScan } from './useFinderScan'
import './decision-scan-progress.css'

export type ScanProgressView = Pick<FinderScan<{leadId:string}>, 'scanOn'|'scanning'|'scanSub'|'progress'|'stopping'|'stopped'|'stop'|'refresh'|'rings'|'exit'> & {
  retry?: () => void
  retryCount?: number
}
type Kind = 'dm'|'social'|'email'|'phone'
const copy = {
  dm: {heading:'Contact Coverage',label:'Decision Makers',subject:'Owner email checks for every selected business.',live:'OWNER LOOKUP IN PROGRESS',phase:'Finding the owner & email…',first:'Identify the owner',second:'Match a published email'},
  social: {heading:'Social Profile Scan',label:'Social Profiles',subject:'Checking the websites selected for this scan.',live:'SOCIAL PROFILE SCAN IN PROGRESS',phase:'Finding published social profiles…',first:'Read the website',second:'Save matching profiles'},
  email: {heading:'Email Coverage',label:'Email Finder',subject:'Finding the main email published by each selected business.',live:'EMAIL SCAN IN PROGRESS',phase:'Finding the main published email…',first:'Read website & contact pages',second:'Save the main email'},
  phone: {heading:'Phone Coverage',label:'Phone Finder',subject:'Finding the main phone number published by each selected business.',live:'PHONE SCAN IN PROGRESS',phase:'Finding the main phone number…',first:'Read website & contact pages',second:'Save the main number'},
}
function ScanIcon({kind}:{kind:Kind}) {
  return <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    {kind==='dm'?<><circle cx="16" cy="11" r="4.5"/><path d="M7 26c.6-5.2 3.8-8 9-8s8.4 2.8 9 8"/></>:kind==='email'?<><rect x="4" y="7" width="24" height="18" rx="4"/><path d="m5 9 11 9L27 9"/></>:kind==='phone'?<path d="m9 4 5 6-3 4c2 4 3 5 7 7l4-3 6 5c-1 4-4 6-7 5C12 25 7 20 4 11 3 8 5 5 9 4Z"/>:<><circle cx="9" cy="16" r="4"/><circle cx="24" cy="7" r="4"/><circle cx="24" cy="25" r="4"/><path d="m12.5 14 8-5m-8 9 8 5"/></>}
  </svg>
}
export function FinderScanProgress({scan,kind}:{scan:ScanProgressView;kind:Kind}) {
  const card=useRef<HTMLElement>(null)
  useLayoutEffect(()=>{
    const element=card.current,toolbar=element?.closest('[data-saved-search-page]')?.querySelector('[data-socbar]')
    if(!element || !toolbar)return
    const update=()=>{element.style.scrollMarginTop=(toolbar.getBoundingClientRect().height+28)+'px'}
    update()
    const observer=new ResizeObserver(update);observer.observe(toolbar)
    return ()=>observer.disconnect()
  },[])
  const p=scan.progress,c=copy[kind]
  const waitingForGoogle=kind==='dm' && scan.scanning && /Sign in to Google|Google needs your attention/i.test(p.message)
  const title=scan.stopping?'Stopping scan…':scan.stopped?'Scan stopped':waitingForGoogle?'Waiting for Google':scan.scanning?(p.current?'Scanning leads':'Preparing scan…'):p.failed?'Finished with issues':p.remaining?'Scan incomplete':'Scan complete'
  const secondSearch=kind==='dm' && /matching owner email|owner email sources/i.test(p.message)
  const phase=scan.stopping?'Saving your progress…':waitingForGoogle?'Your Google connection needs attention':!p.current?'Getting things ready…':kind!=='dm'?c.phase:/checking published .*sources/i.test(p.message)?'Checking published sources…':/reconnecting to Google/i.test(p.message)?'Reconnecting to search…':secondSearch?"Checking the owner's email…":c.phase
  return <section ref={card} data-card="1" data-finder-progress={kind} data-decision-progress={kind==='dm'?'1':undefined} className="dm-progress-card">
    <div className="dm-progress-heading">
      <div><h2 data-fcov={kind}>{c.heading}</h2><p>{c.subject}</p></div>
      {scan.scanning?<button type="button" className="dm-stop" onClick={scan.stop} disabled={scan.stopping}><span aria-hidden="true">■</span>{scan.stopping?'Stopping…':'Stop scan'}</button>:<div className="dm-progress-actions">{Boolean(scan.retryCount) && <button type="button" className="dm-stop" onClick={scan.retry}>Retry {scan.retryCount} failed {scan.retryCount===1?'business':'businesses'}</button>}<button type="button" className="dm-refresh" onClick={scan.refresh}>Refresh results</button>{kind!=='dm' && <button type="button" className="dm-refresh" data-exitscan="1" onClick={scan.exit}>Show all leads</button>}</div>}
    </div>
    {scan.scanOn && <div className={`dm-progress-panel${scan.scanning?' dm-search-live':''}`} data-stopping={scan.stopping || waitingForGoogle || undefined}>
      {scan.scanning && <>
        <div className="dm-search-hero">
          <div className="dm-search-orbit" aria-hidden="true">
            <span className="dm-orbit-ring dm-orbit-outer"/><span className="dm-orbit-ring dm-orbit-inner"/>
            <span className="dm-orbit-core"><ScanIcon kind={kind}/></span>
            <span className="dm-orbit-mail"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/></svg></span>
          </div>
          <div className="dm-search-copy" role="status" aria-live="polite">
            <span className="dm-live-label"><i aria-hidden="true"/>{scan.stopping?'FINISHING UP':waitingForGoogle?'ACTION NEEDED':c.live}</span>
            <h3>{phase}</h3>
            <p>{p.current || 'Preparing your selected businesses'}<span aria-hidden="true" className="dm-wait-dots"><i/><i/><i/></span></p>
            <small>{scan.stopping?'Completed results will stay saved.':waitingForGoogle?'The scan is waiting for you. Complete the Google step to continue.':"Please wait while we check public sources. Results appear below as they're ready."}</small>
            {waitingForGoogle && <button type="button" className="dm-browser-help" onClick={()=>document.querySelector('[data-owner-browser]')?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'center'})}>Open Google connection ↑</button>}
          </div>
        </div>
        <div className="dm-search-steps" aria-label="Current business search steps">
          <span data-active={!secondSearch} data-complete={secondSearch}><b>{secondSearch?'✓':'1'}</b>{c.first}</span><i aria-hidden="true"/>
          <span data-active={secondSearch}><b>2</b>{c.second}{kind==='dm' && <small>Targeted follow-up searches</small>}</span>
        </div>
      </>}
      <div className="dm-progress-numbers"><div><strong data-scan-percent>{p.percent}<small>%</small></strong><span>{title}</span></div><p><b>{p.processed}</b> of <b>{p.total}</b> leads checked<span><b>{p.remaining}</b> remaining{p.failed>0?` · ${p.failed} need retry`:''}</span></p></div>
      <div className="dm-progress-track" role="progressbar" aria-label={`${c.label} scan progress`} aria-valuenow={p.percent} aria-valuemin={0} aria-valuemax={100} aria-valuetext={`${p.percent}%: ${p.processed} of ${p.total} leads checked, ${p.remaining} remaining`}><span style={{width:`${p.percent}%`}}/></div>
      <div className="dm-progress-detail" role="status" aria-live="polite"><span>{scan.stopping?'Stopping the current check. Completed results will be kept.':scan.scanning?p.message || 'Starting your selected lead checks…':scan.scanSub}</span></div>
    </div>}
    {scan.rings.length>0 && <div className="dm-coverage-rings">{scan.rings.map(r=><div key={r.name} className="dm-coverage-ring"><span><svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="44" className="dm-ring-track"/><circle cx="50" cy="50" r="44" className="dm-ring-value" strokeDasharray="276.5" strokeDashoffset={r.off}/></svg><b>{r.pct}<small>%</small></b></span><strong>{r.name}</strong><small>{r.leads}</small></div>)}</div>}
  </section>
}
