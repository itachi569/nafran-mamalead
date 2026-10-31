import {useEffect,useRef} from 'react'
import type { AppValues } from './useAppValues'
import type { WebsiteLookupRow } from '../../electron/enrichment/website-lookup'
import { ExportDialog } from './ExportDialog'
import './website-lookup.css'

function rowStatus(row: WebsiteLookupRow) {
  if(row.status==='failed')return 'Retry needed'
  if(row.status==='running')return 'Scanning'
  if(row.status==='queued')return 'Queued'
  return row.emails.length || row.phones.length || row.socials.length || row.address ? 'Found' : 'No public details'
}

export function WebsiteLookupPanel({V}:{V:AppValues}) {
  const L=V.websiteLookup
  const resultsRef=useRef<HTMLElement>(null)
  const previousScan=useRef<{id:string;running:boolean}|null>(null)
  const jobId=L.session?.jobId
  const scanRunning=L.session?.status==='queued'||L.session?.status==='running'
  useEffect(()=>{
    const previous=previousScan.current
    previousScan.current=jobId?{id:jobId,running:scanRunning}:null
    // A saved completed scan must not pull the page down when it is opened again.
    if(!jobId||previous?.id!==jobId||!previous.running||scanRunning)return
    let frame=requestAnimationFrame(()=>{
      frame=requestAnimationFrame(()=>{
        resultsRef.current?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'})
      })
    })
    return ()=>cancelAnimationFrame(frame)
  },[jobId,scanRunning])
  const hasSelection=Object.values(L.fields).some(Boolean)
  const activeFields=L.session?.fields ?? L.fields
  const ready=L.preview.sites.length
  return <div className="wl-page" data-website-lookup="1">
    <header className="wl-title"><div><span className="wl-eyebrow">BUSINESS CONTACTS</span><h1>Website Lookup</h1><p>Find published business emails, phone numbers, addresses and social profiles in one scan.</p></div><span className="wl-badge">{L.running?'Scan in progress':L.session?'Latest scan saved on this device':'Ready to scan'}</span></header>
    <div className="wl-setup">
      <section className="wl-card wl-input-card"><div className="wl-section-title"><span className="wl-link-icon" aria-hidden="true">↗</span><div><h2>Start with your websites</h2><p>Paste a list, upload CSV/TSV/Excel, or use saved Google Maps results.</p></div></div>
        <div className="wl-paste"><div><label htmlFor="lookup-websites">Website URLs</label><span role="status" data-lookup-input-count="1">{ready} ready · {L.preview.duplicates} duplicates · {L.preview.invalid+L.preview.profiles.length} skipped</span></div><textarea id="lookup-websites" aria-label="Websites to look up" value={L.input} disabled={L.running} onChange={event=>L.setInput(event.currentTarget.value)} placeholder={'https://example.com\nhttps://another-website.com\nOne business website per line'} spellCheck={false}/></div>
        {L.preview.rows.some(row=>row.reason) && <p className="wl-hint" role="status">Skipped: {L.preview.rows.filter(row=>row.reason).slice(0,5).map(row=>row.value).join(', ')}. Use a business website; social platforms, directories and invalid URLs are excluded.</p>}
        <div className="wl-input-actions"><button className="wl-button wl-primary" type="button" onClick={()=>void L.start()} disabled={L.running || !ready || !hasSelection}>{L.preparing?'Preparing…':L.running?'Scanning websites…':ready>500?'Scan first 500':`Start lookup${ready?` · ${ready}`:''}`}</button><button className="wl-button wl-outline" type="button" disabled={L.running} onClick={V.openImp}>Import websites <span aria-hidden="true">↗</span></button><button className="wl-text-button" type="button" disabled={L.running} onClick={async()=>{try{L.setInput(await navigator.clipboard.readText());L.clearError()}catch{L.setError('Clipboard access was blocked. Paste websites into the box instead.')}}}>Paste from clipboard</button></div>
        <p className="wl-hint" role="status">{ready>500 && <strong>{ready} ready · {ready-500} over the limit. The remaining links stay here for your next scan. </strong>}Up to 500 unique websites per scan. Saved websites are scanned again and reused without creating duplicates.</p>
      </section>
      <section className="wl-card wl-options"><span className="wl-eyebrow">YOUR SCAN</span><h2>Choose what to find</h2><p>Select the business details you need.</p><fieldset disabled={L.running}><legend className="sr-only">Details to find</legend>{([{key:'email',title:'Email addresses',detail:'Public business mailboxes',icon:'@'},{key:'phone',title:'Phone numbers',detail:'Published contact numbers',icon:'↗'},{key:'social',title:'Social profiles',detail:'Facebook, Instagram, LinkedIn and more',icon:'◎'},{key:'address',title:'Business address',detail:'Published office or business locations',icon:'⌖'}] as const).map(item=><label className="wl-option" key={item.key}><span className="wl-option-icon" aria-hidden="true">{item.icon}</span><span><strong>{item.title}</strong><small>{item.detail}</small></span><input type="checkbox" checked={L.fields[item.key]} onChange={event=>L.setFields({...L.fields,[item.key]:event.currentTarget.checked})}/></label>)}</fieldset></section>
    </div>
    {L.error && <p className="wl-error" role="alert">{L.error}</p>}
    {L.session && <section className="wl-card wl-progress" aria-label="Website scan progress"><div className="wl-progress-heading"><div><h2>{L.running?'Reading public website pages':L.session.status==='failed' && L.remaining>0?'Scan stopped':L.failed?'Scan complete with errors':'Scan complete'}</h2><p>{L.running?L.rows.find(row=>row.status==='running')?.website || 'Your websites are queued for scanning.':`${L.session.added} new · ${L.session.reused} saved websites reused`}</p></div><span>{L.processed} / {L.rows.length}</span></div><progress max={Math.max(1,L.rows.length)} value={L.processed} aria-label="Websites processed"/><div className="wl-progress-stats" role="status"><span><strong>{L.processed}</strong> processed</span><span><strong>{L.remaining}</strong> remaining</span><span><strong>{L.failed}</strong> errors</span><span><strong>{L.rows.filter(row=>row.status==='done' && rowStatus(row)==='Found').length}</strong> with contact details</span></div>{L.session.message && <p className="wl-error">{L.session.message}</p>}</section>}
    <section ref={resultsRef} className="wl-card wl-results" style={{scrollMarginTop:24}}><div className="wl-results-heading"><div><h2>Business contact results</h2><p>{L.rows.length?`${L.rows.length} website${L.rows.length===1?'':'s'} in this scan${L.selected.length?` · ${L.selected.length} selected`:''}. Missing details stay blank.`:'Your scanned websites and their published contact details will appear here.'}</p></div><div><button type="button" className="wl-button wl-outline" disabled={!L.session} onClick={()=>void L.refresh()}>Refresh</button>{L.session && !L.running && <button type="button" className="wl-button wl-outline" onClick={()=>void L.start(L.rows.filter(row=>L.failed?row.status==='failed':true).map(row=>row.website),L.session!.fields)}>{L.failed?'Retry failed':'Rescan all'}</button>}<button type="button" className="wl-button wl-primary" disabled={!L.rows.length || L.running} onClick={L.openExport}>Export {L.selected.length?'selected':'results'} ↓</button></div></div>
      {L.rows.length?<div className="wl-table-scroll"><table><thead><tr><th><input aria-label="Select all websites" type="checkbox" checked={L.selected.length===L.rows.length} onChange={L.selectAll}/></th><th>Business / Website</th>{activeFields.email&&<th>Emails</th>}{activeFields.phone&&<th>Phone numbers</th>}{activeFields.address&&<th>Business address</th>}{activeFields.social&&<th>Social profiles</th>}<th>Sources</th><th>Status</th></tr></thead><tbody>{L.rows.map(row=><tr key={row.leadId} data-lookup-row={row.leadId}><td><input aria-label={`Select ${row.businessName}`} type="checkbox" checked={L.selected.includes(row.leadId)} onChange={()=>L.toggle(row.leadId)}/></td><td><strong>{row.businessName}</strong><a href={row.website} target="_blank" rel="noreferrer">{row.website.replace(/^https?:\/\//,'')}</a></td>{activeFields.email&&<td>{row.emails.map(item=><a key={item.value} href={`mailto:${item.value}`}>{item.value}</a>)}</td>}{activeFields.phone&&<td>{row.phones.map(item=><a key={item.value} href={`tel:${item.value}`}>{item.value}</a>)}</td>}{activeFields.address&&<td>{row.address}</td>}{activeFields.social&&<td>{row.socials.map(item=><a key={item.url} href={item.url} target="_blank" rel="noreferrer">{item.platform} ↗</a>)}</td>}<td>{row.sources.length>0&&<details><summary>{row.sources.length} page{row.sources.length===1?'':'s'} read</summary>{row.sources.map(url=><a key={url} href={url} target="_blank" rel="noreferrer">{new URL(url).pathname || '/'} ↗</a>)}</details>}</td><td><span className={`wl-row-status wl-${row.status}`}>{rowStatus(row)}</span>{row.error&&<small className="wl-row-error" title={row.error}>{row.error}</small>}</td></tr>)}</tbody></table></div>:<div className="wl-results-empty"><span aria-hidden="true">◎</span><h3>One website. All its business contacts.</h3><p>Start a scan above. Every result stays tied to its website and the public pages that were read.</p></div>}
      {L.exportNote&&<p className="wl-export-note" role="status">{L.exportNote}</p>}
    </section>
    {L.exportOpen&&<ExportDialog title="Export Website Lookup" summary={`${L.exportCount} ${L.selected.length?'selected websites':'websites in this scan'} · published contacts, sources and scan status`} busy={L.exportBusy} empty={!L.exportCount} onExport={format=>void L.exportFile(format)} onClose={L.closeExport}/>}
  </div>
}
