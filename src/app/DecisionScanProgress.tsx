import type { FinderScan } from './useFinderScan'
import './decision-scan-progress.css'

export function DecisionScanProgress({scan}:{scan:FinderScan<unknown>}) {
  const p=scan.progress
  const title=scan.stopping?'Stopping scan…':scan.stopped?'Scan stopped':scan.scanning?(p.current?'Scanning leads':'Preparing scan…'):p.failed?'Finished with issues':p.remaining?'Scan incomplete':'Scan complete'
  return <section data-card="1" data-decision-progress="1" className="dm-progress-card">
    <div className="dm-progress-heading">
      <div><h2 data-fcov="dm">Contact Coverage</h2><p>{scan.scanOn?'Owner email checks for every selected business.':'Coverage of your saved owner results.'}</p></div>
      {scan.scanning?<button type="button" className="dm-stop" onClick={scan.stop} disabled={scan.stopping}><span aria-hidden="true">■</span>{scan.stopping?'Stopping…':'Stop scan'}</button>:<button type="button" className="dm-refresh" onClick={scan.refresh}>Refresh results</button>}
    </div>
    {scan.scanOn && <div className="dm-progress-panel">
      <div className="dm-progress-numbers"><div><strong data-scan-percent>{p.percent}<small>%</small></strong><span>{title}</span></div><p><b>{p.processed}</b> of <b>{p.total}</b> leads checked<span><b>{p.remaining}</b> remaining{p.failed>0?` · ${p.failed} need retry`:''}</span></p></div>
      <div className="dm-progress-track" role="progressbar" aria-label="Decision Makers scan progress" aria-valuenow={p.percent} aria-valuemin={0} aria-valuemax={100} aria-valuetext={`${p.percent}%: ${p.processed} of ${p.total} leads checked, ${p.remaining} remaining`}><span style={{width:`${p.percent}%`}}/></div>
      <div className="dm-progress-detail" role="status" aria-live="polite">
        {scan.scanning && p.current?<strong>Checking {p.current}</strong>:null}
        <span>{scan.stopping?'Stopping the current check. Completed results will be kept.':scan.scanning?p.message || 'Starting your selected lead checks…':scan.scanSub}</span>
      </div>
    </div>}
    <div className="dm-coverage-rings">{scan.rings.map(r=><div key={r.name} className="dm-coverage-ring"><span><svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="44" className="dm-ring-track"/><circle cx="50" cy="50" r="44" className="dm-ring-value" strokeDasharray="276.5" strokeDashoffset={r.off}/></svg><b>{r.pct}<small>%</small></b></span><strong>{r.name}</strong><small>{r.leads}</small></div>)}</div>
  </section>
}
