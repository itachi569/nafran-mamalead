import { useEffect, useMemo, useRef, useState } from 'react'
import type { AppValues } from './useAppValues'
import { importPreview, websiteListFromCsv, WEBSITE_IMPORT_LIMIT } from './website-import'
import './import-websites-dialog.css'

type Source = 'paste' | 'file' | 'run'
type WebsiteFile = ReturnType<typeof websiteListFromCsv> & { name: string; bytes: number; content: string }

function SourceIcon({ kind }: { kind: Source | 'search' | 'close' }) {
  return <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {kind === 'paste' ? <><path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1"/><path d="M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1"/></> : kind === 'file' ? <><path d="M14 3.5H7.5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2V8z"/><path d="M14 3.5V8h4.5M9 13h6M9 16.5h4"/></> : kind === 'run' ? <><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.4"/></> : kind === 'search' ? <><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/></> : <path d="m6.5 6.5 11 11m0-11-11 11"/>}
  </svg>
}

function sizeLabel(bytes: number) {
  return bytes < 1024 ? `${bytes} B` : bytes < 1048576 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1048576).toFixed(1)} MB`
}

export function ImportWebsitesDialog({ V }: { V: AppValues }) {

  const [source, setSource] = useState<Source>('paste')
  const [paste, setPaste] = useState(V.impValue)
  const [file, setFile] = useState<WebsiteFile | null>(null)
  const [runId, setRunId] = useState('')
  const [runText, setRunText] = useState('')

  const [reading, setReading] = useState(false)
  const [loadingRun, setLoadingRun] = useState(false)
  const [error, setError] = useState('')
  const [dragging, setDragging] = useState(false)
  const panel = useRef<HTMLElement>(null)
  const activeSource = useRef(source)
  const alive = useRef(true)
  const runRequest = useRef(0)
  const destination = V.isEmail ? 'Email Finder' : V.isPhone ? 'Phone Finder' : V.isWebsite ? 'Website Lookup' : 'Social Profiles'
  const preview = useMemo(() => importPreview(V.impValue,V.isSocial), [V.impValue,V.isSocial])

  const ready = preview.sites.length + (V.isSocial ? preview.profiles.length : 0)

  const busy = source === 'file' ? reading : source === 'run' && loadingRun
  const tabs = [
    { id: 'paste', title: 'Paste links', detail: 'One per line' },
    { id: 'file', title: 'Upload a file', detail: 'CSV, TSV or Excel · 20 MB' },
    { id: 'run', title: 'From a Maps run', detail: 'Saved results' },
  ] as const

  useEffect(() => {
    alive.current = true
    const opener = document.activeElement as HTMLElement | null
    const dialog = panel.current!
    dialog.querySelector<HTMLButtonElement>('.wi-close')?.focus()
    const trapFocus = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return
      const targets = Array.from(dialog.querySelectorAll<HTMLElement>('button:not(:disabled), textarea, select, [tabindex="0"]')).filter(el => el.getClientRects().length)
      const first = targets[0], last = targets[targets.length - 1]
      if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) { event.preventDefault(); first?.focus() }
    }
    document.addEventListener('keydown', trapFocus)
    return () => { alive.current = false; runRequest.current++; document.removeEventListener('keydown', trapFocus); if (opener?.isConnected) opener.focus() }
  }, [])

  function chooseSource(next: Source) {
    activeSource.current = next
    setSource(next); setError('')
    V.setImportText(next === 'paste' ? paste : next === 'file' ? file?.text ?? '' : loadingRun ? '' : runText)
  }

  function acceptFile(name: string, content: string, bytes: number, column?: number) {
    if (!/\.(csv|tsv|xlsx)$/i.test(name)) throw new Error('Choose a CSV, TSV or Excel website list.')
    if (bytes > 20 * 1024 * 1024) throw new Error('Choose a CSV, TSV or Excel file no larger than 20 MB.')
    const next = { ...websiteListFromCsv(content, column,V.isSocial), name, bytes, content }
    if (!alive.current) return
    setFile(next); setError(next.error)
    if (activeSource.current === 'file') V.setImportText(next.text)
  }

  async function browse() {
    setReading(true); setError('')
    try { const picked = await V.chooseWebsiteCsv(); if (picked) acceptFile(picked.name, picked.content, picked.bytes) }
    catch (err) { if (alive.current) { setFile(null); if (activeSource.current === 'file') V.setImportText(''); setError(err instanceof Error ? err.message : 'The file could not be read.') } }
    finally { if (alive.current) setReading(false) }
  }

  async function pickRun(id: string) {
    const request = ++runRequest.current
    setRunId(id); setRunText(''); setLoadingRun(true); setError(''); V.setImportText('')
    try {

      const sites = await V.importSavedRun(id)
      if (!alive.current || request !== runRequest.current) return
      const text = sites.join('\n')
      setRunText(text)
      if (activeSource.current === 'run') { V.setImportText(text); if (!sites.length) setError('This run has no websites to scan. Choose another run or paste links.') }
    } catch (err) { if (alive.current && request === runRequest.current) setError(err instanceof Error ? err.message : 'The saved results could not be loaded.') }
    finally { if (alive.current && request === runRequest.current) setLoadingRun(false) }
  }

  return <div className="wi-overlay" data-socimp="1" data-impmodal="1" onClick={event => { if (event.target === event.currentTarget) V.closeImp() }} onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); V.closeImp() } }}>
    <section ref={panel} className="wi-dialog" role="dialog" aria-modal="true" aria-labelledby="website-import-title" aria-describedby="website-import-description">
      <header className="wi-header">
        <div><span className="wi-destination"><span/>Into {destination}</span><h2 id="website-import-title">{'Import websites'}</h2><p id="website-import-description">{'Choose your website list. Duplicate links are merged before scanning.'}</p></div>
        <button type="button" className="wi-close" aria-label="Close import dialog" onClick={V.closeImp}><SourceIcon kind="close"/></button>
      </header>
      <div className="wi-sources" role="tablist" aria-label="Website source" data-impsrc={source}>
        {tabs.map((tab, index) => <button type="button" role="tab" key={tab.id} id={`wi-tab-${tab.id}`} aria-controls={`wi-panel-${tab.id}`} aria-selected={source === tab.id} tabIndex={source === tab.id ? 0 : -1} data-src={tab.id} onClick={() => chooseSource(tab.id)} onKeyDown={event => {
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
          event.preventDefault()
          const next = event.key === 'Home' ? 0 : event.key === 'End' ? 2 : (index + (event.key === 'ArrowRight' ? 1 : -1) + 3) % 3
          chooseSource(tabs[next].id); document.getElementById(`wi-tab-${tabs[next].id}`)?.focus()
        }}><span className="wi-source-icon"><SourceIcon kind={tab.id}/></span><span><strong>{tab.title}</strong><span className="wi-meta">{tab.detail}</span></span></button>)}
      </div>
      <div className="wi-body" role="tabpanel" id={`wi-panel-${source}`} aria-labelledby={`wi-tab-${source}`}>
        {source === 'paste' && <>
          <div className="wi-paste">
            <div className="wi-paste-label"><label htmlFor="website-import-urls">Website URLs</label><div><span>{preview.rows.length} {preview.rows.length === 1 ? 'line' : 'lines'}</span><button type="button" onClick={() => { const sample = 'https://example.com\nhttps://www.example.com/contact\nhttps://example.org\nhttps://example.net'; setPaste(sample); V.setImportText(sample) }}>Paste a sample</button></div></div>
            <textarea id="website-import-urls" data-imptext="1" data-socimpinput="1" value={V.impValue} onChange={event => { setPaste(event.currentTarget.value); V.setImportText(event.currentTarget.value) }} spellCheck={false} aria-describedby="website-import-count" placeholder={'https://example.com\nhttps://another-website.com\nOne website per line'}/>
          </div>
        </>}
        {source === 'file' && <div className={`wi-file${dragging ? ' wi-dragging' : ''}`} onDragOver={event => { event.preventDefault(); if (!reading) setDragging(true) }} onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false) }} onDrop={async event => {
          event.preventDefault(); setDragging(false)
          if (reading) return
          const dropped = event.dataTransfer.files[0]
          if (!dropped) return
          setError(''); setReading(true)
          try {
            if (event.dataTransfer.files.length !== 1) throw new Error('Drop one website list at a time.')
            if (!/\.(csv|tsv|xlsx)$/i.test(dropped.name) || dropped.size > 20 * 1024 * 1024) throw new Error('Drop a CSV, TSV or Excel file no larger than 20 MB.')
            const checked = await window.desktop!.readWebsiteFile(dropped.name, new Uint8Array(await dropped.arrayBuffer()))
            acceptFile(checked.name, checked.content, checked.bytes)
          } catch (err) { if (alive.current) { setFile(null); if (activeSource.current === 'file') V.setImportText(''); setError(err instanceof Error ? err.message : 'The file could not be read.') } }
          finally { if (alive.current) setReading(false) }
        }}>
          <div className="wi-file-heading"><span className="wi-file-icon"><SourceIcon kind="file"/></span><div className="wi-file-copy"><strong>{file?.name ?? 'Choose your website list'}</strong><span>{file ? `${file.rowCount.toLocaleString()} rows · ${sizeLabel(file.bytes)}` : 'CSV, TSV or Excel · up to 20 MB'}</span></div><button type="button" className="wi-primary website-file-picker" disabled={reading} onClick={() => void browse()}>{reading ? 'Opening…' : file ? 'Change file' : 'Choose file'}</button></div>
          {file ? <div className="wi-file-preview"><table aria-label="Website file preview"><thead><tr><th>Row</th><th title={file.label}>Column {file.column} · {file.label}</th><th>Status</th></tr></thead><tbody>{file.preview.rows.slice(0, 5).map((row, index) => <tr key={index}><td>{index + 1}</td><td title={row.value}>{row.value || 'No website'}</td><td><span data-ftag={row.status.toLowerCase()} title={row.reason}>{row.status}{row.reason ? ` · ${row.reason}` : ''}</span></td></tr>)}</tbody></table><p>{file.rowCount > 5 ? `${(file.rowCount - 5).toLocaleString()} more rows · ` : ''}{ready.toLocaleString()} ready · {file.preview.duplicates} duplicate{file.preview.duplicates === 1 ? '' : 's'} · {file.preview.invalid} skipped</p></div> : <div className="wi-drop-empty"><SourceIcon kind="paste"/><span>Drop your file here, or choose it from your computer.</span><small>Your website or domain column is detected automatically.</small></div>}
          <p className="wi-hint">Drop another CSV, TSV or Excel file on this box to replace it. The website or domain column is read automatically.</p>
        </div>}
        {source === 'run' && <>
          <div className="wi-runs" role="group" aria-label="Saved Google Maps runs">

            {V.mapsRunOptions.length ? V.mapsRunOptions.map(run => <button type="button" key={run.id} className="wi-run" aria-pressed={runId === run.id} data-runpick="1" data-on={runId === run.id ? 'yes' : 'no'} onClick={() => void pickRun(run.id)}><span className="wi-run-dot"/><span><strong>{run.title}</strong><span className="wi-meta">{run.meta}</span></span><span className="wi-run-date">{run.date}</span></button>) : <div className="wi-empty"><SourceIcon kind="run"/><strong>No saved Maps runs yet</strong><p>Run a Google Maps search first, or use Paste links or Upload a file.</p></div>}
          </div>
          {(V.mapsRunOptions.length > 0) && <p className="wi-hint" role="status">{<>{loadingRun ? 'Loading websites from this run…' : runId ? `${ready} unique website${ready === 1 ? '' : 's'} ready for ${destination}.` : 'Choose a saved run to load its websites.'} Duplicate domains are merged before scanning.</>}</p>}
        </>}
        {file && source === 'file' && <label className="wi-hint">Website column <select aria-label="Website column" value={file.columnIndex} onChange={event=>acceptFile(file.name,file.content,file.bytes,Number(event.target.value))}>{file.columns.map(c=><option key={c.index} value={c.index}>{c.label}</option>)}</select></label>}
      </div>
      {source === 'paste' && preview.rows.some(row=>row.reason) && <p className="wi-hint" role="status">Skipped: {preview.rows.filter(row=>row.reason).slice(0,3).map(row=>row.value).join(', ')}. Use a valid business website; directory and social platform links are excluded here.</p>}
      {(error || (V.isWebsite && V.websiteLookup.error)) && <p className="wi-error" role="alert">{error || V.websiteLookup.error}</p>}
      {ready > WEBSITE_IMPORT_LIMIT && <p className="wi-batch-notice" role="status">{ready} ready · {ready-WEBSITE_IMPORT_LIMIT} over the {WEBSITE_IMPORT_LIMIT} limit. Scan the first {WEBSITE_IMPORT_LIMIT}; the remaining links are saved for the next time you open Import websites.</p>}
      {source === 'paste' && <div className="wi-stats" id="website-import-count" data-import-count="1" role="status">
        <div className="wi-ready"><strong>{ready}</strong><span>ready to {preview.profiles.length && !preview.sites.length ? 'import' : 'scan'}</span></div>
        <div><strong>{preview.duplicates}</strong><span>duplicates merged</span></div>
        <div><strong>{preview.invalid}</strong><span>invalid / non-business</span></div>
      </div>}
      <footer className="wi-footer website-import-footer"><span className="wi-summary" role="status">{busy ? 'Preparing your websites…' : ready ? `${ready.toLocaleString()} unique ${preview.profiles.length ? 'items' : ready === 1 ? 'website' : 'websites'} ready` : 'Add websites to start your scan'}</span><div><button type="button" className="wi-cancel" data-socimpcancel="1" onClick={V.closeImp}>Cancel</button><button type="button" className="wi-primary wi-scan" data-socimpgo="1" data-importgo="1" data-run="1" disabled={Boolean(busy) || !V.impHasLines} onClick={V.impImport}><SourceIcon kind="search"/>{V.impHasLines && !busy ? V.impScanLabel : 'Scan websites'}</button></div></footer>
    </section>
  </div>
}
