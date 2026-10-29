import type { FinderScan } from './useFinderScan'
import './decision-scan-progress.css'

export function DecisionScanProgress({scan}:{scan:FinderScan<{leadId:string}>}) {
  const p=scan.progress
  const waitingForGoogle=scan.scanning && /Sign in to Google|Google needs your attention/i.test(p.message)
  const title=scan.stopping?'Stopping scan…':scan.stopped?'Scan stopped':waitingForGoogle?'Waiting for Google':scan.scanning?(p.current?'Scanning leads':'Preparing scan…'):p.failed?'Finished with issues':p.remaining?'Scan incomplete':'Scan complete'
  const secondSearch=/Search 2 of 2/.test(p.message)
  const failedIds=[...new Set(scan.rows.filter(row=>row.lookupOutcome?.status==='error').map(row=>row.leadId))]
  const phase=scan.stopping?'Saving your progress…':waitingForGoogle?'Your Google connection needs attention':!p.current?'Getting things ready…':/checking published sources/i.test(p.message)?'Checking published sources…':/reconnecting to Google/i.test(p.message)?'Reconnecting to search…':secondSearch?"Checking the owner's email…":'Finding the owner & email…'
  return <section data-card="1" data-decision-progress="1" className="dm-progress-card">
    <div className="dm-progress-heading">
      <div><h2 data-fcov="dm">Contact Coverage</h2><p>{scan.scanOn?'Owner email checks for every selected business.':'Coverage of your saved owner results.'}</p></div>
      {scan.scanning?<button type="button" className="dm-stop" onClick={scan.stop} disabled={scan.stopping}><span aria-hidden="true">■</span>{scan.stopping?'Stopping…':'Stop scan'}</button>:<div className="dm-progress-actions">{failedIds.length>0 && <button type="button" className="dm-stop" onClick={()=>scan.scanImported(failedIds)}>Retry {failedIds.length} failed {failedIds.length===1?'business':'businesses'}</button>}<button type="button" className="dm-refresh" onClick={scan.refresh}>Refresh results</button></div>}
    </div>
    {scan.scanOn && <div className={`dm-progress-panel${scan.scanning?' dm-search-live':''}`} data-stopping={scan.stopping || waitingForGoogle || undefined}>
      {scan.scanning && <>
        <div className="dm-search-hero">
          <div className="dm-search-orbit" aria-hidden="true">
            <span className="dm-orbit-ring dm-orbit-outer"/><span className="dm-orbit-ring dm-orbit-inner"/>
            <span className="dm-orbit-core"><svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><circle cx="16" cy="11" r="4.5"/><path d="M7 26c.6-5.2 3.8-8 9-8s8.4 2.8 9 8"/></svg></span>
            <span className="dm-orbit-mail"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="m4 7 8 6 8-6"/></svg></span>
          </div>
          <div className="dm-search-copy" role="status" aria-live="polite">
            <span className="dm-live-label"><i aria-hidden="true"/>{scan.stopping?'FINISHING UP':waitingForGoogle?'ACTION NEEDED':'OWNER LOOKUP IN PROGRESS'}</span>
            <h3>{phase}</h3>
            <p>{p.current || 'Preparing your selected businesses'}<span aria-hidden="true" className="dm-wait-dots"><i/><i/><i/></span></p>
            <small>{scan.stopping?'Completed results will stay saved.':waitingForGoogle?'The scan is waiting for you. Complete the Google step to continue.':"Please wait while we check public sources. Results appear below as they're ready."}</small>
            {waitingForGoogle && <button type="button" className="dm-browser-help" onClick={()=>document.querySelector('[data-owner-browser]')?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'center'})}>Open Google connection ↑</button>}
          </div>
        </div>
        <div className="dm-search-steps" aria-label="Current business search steps">
          <span data-active={!secondSearch} data-complete={secondSearch}><b>{secondSearch?'✓':'1'}</b>Owner + email</span>
          <i aria-hidden="true"/>
          <span data-active={secondSearch}><b>2</b>Named email search<small>Only if needed</small></span>
        </div>
      </>}
      <div className="dm-progress-numbers"><div><strong data-scan-percent>{p.percent}<small>%</small></strong><span>{title}</span></div><p><b>{p.processed}</b> of <b>{p.total}</b> leads checked<span><b>{p.remaining}</b> remaining{p.failed>0?` · ${p.failed} need retry`:''}</span></p></div>
      <div className="dm-progress-track" role="progressbar" aria-label="Decision Makers scan progress" aria-valuenow={p.percent} aria-valuemin={0} aria-valuemax={100} aria-valuetext={`${p.percent}%: ${p.processed} of ${p.total} leads checked, ${p.remaining} remaining`}><span style={{width:`${p.percent}%`}}/></div>
      <div className="dm-progress-detail" role="status" aria-live="polite">
        <span>{scan.stopping?'Stopping the current check. Completed results will be kept.':scan.scanning?p.message || 'Starting your selected lead checks…':scan.scanSub}</span>
      </div>
    </div>}
    <div className="dm-coverage-rings">{scan.rings.map(r=><div key={r.name} className="dm-coverage-ring"><span><svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="44" className="dm-ring-track"/><circle cx="50" cy="50" r="44" className="dm-ring-value" strokeDasharray="276.5" strokeDashoffset={r.off}/></svg><b>{r.pct}<small>%</small></b></span><strong>{r.name}</strong><small>{r.leads}</small></div>)}</div>
  </section>
}
