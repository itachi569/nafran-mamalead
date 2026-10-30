import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { LocalApi } from '../types/desktop'
import { DEFAULT_LOOKUP_FIELDS, type WebsiteLookupFields, type WebsiteLookupSession } from '../../electron/enrichment/website-lookup'
import { importPreview, pendingImport, savePendingImport, WEBSITE_IMPORT_LIMIT } from './website-import'

export function useWebsiteLookup(db: LocalApi | null, allowed: () => boolean, onFinished: (session:WebsiteLookupSession) => void) {
  const [input, setInput] = useState(() => pendingImport('lookup-page'))
  const [fields, setFields] = useState<WebsiteLookupFields>({...DEFAULT_LOOKUP_FIELDS})
  const [session, setSession] = useState<WebsiteLookupSession | null>(null)
  const [preparing, setPreparing] = useState(false)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [exportOpen, setExportOpen] = useState(false)
  const [exportBusy, setExportBusy] = useState(false)
  const [exportNote, setExportNote] = useState('')
  const lock = useRef(false)
  const exporting = useRef(false)
  const generation = useRef(0)
  const alive = useRef(true)
  const currentJob = useRef('')
  const callbacks = useRef({allowed,onFinished})
  callbacks.current={allowed,onFinished}
  const completed = useRef(new Set<string>())
  const active = useRef(new Set<string>())
  const finishCallbacks = useRef(new Map<string,typeof onFinished>())
  const loading = useRef(false)
  const preview = useMemo(()=>importPreview(input),[input])
  const running = preparing || session?.status === 'queued' || session?.status === 'running'

  const refresh = useCallback(async () => {
    if (!db || loading.current) return
    const request=generation.current, job=currentJob.current
    loading.current=true
    try {
      const next=await db.lookup.get(job || undefined)
      if (!alive.current || request!==generation.current) return
      setSession(next)
      if (next) {
        currentJob.current=next.jobId
        if(next.status==='queued'||next.status==='running')active.current.add(next.jobId)
        if ((next.status==='done' || next.status==='failed') && !completed.current.has(next.jobId)) {
          completed.current.add(next.jobId)
          const finished=finishCallbacks.current.get(next.jobId) ?? callbacks.current.onFinished
          finishCallbacks.current.delete(next.jobId)
          if(active.current.has(next.jobId))finished(next)
        }
      }
    } catch (err) { if(alive.current && request===generation.current)setError(err instanceof Error ? err.message : 'The lookup results could not be loaded.') }
    finally { loading.current=false }
  },[db])

  useEffect(()=>{
    alive.current=true;void refresh()
    return ()=>{alive.current=false}
  },[refresh])

  useEffect(()=>{
    if (!session || !running) return
    const timer=window.setInterval(()=>void refresh(),900)
    const unsubscribe=window.desktop?.enrichment.onProgress(progress=>{
      if(progress.jobId===currentJob.current) void refresh()
    })
    return ()=>{window.clearInterval(timer);unsubscribe?.()}
  },[refresh,running,session?.jobId])

  const start = useCallback(async (lines?: string[], chosen?: WebsiteLookupFields): Promise<boolean> => {
    if (lock.current || running || !callbacks.current.allowed()) return false
    const all=importPreview(lines ? lines.join('\n') : input).sites
    const sites=all.slice(0,WEBSITE_IMPORT_LIMIT)
    const options=chosen ?? fields
    setError('');setExportNote('')
    if (!sites.length) {setError('Add at least one business website to start the lookup.');return false}
    if (!Object.values(options).some(Boolean)) {setError('Select at least one detail to find.');return false}
    if (!db) {setError('Open MamaLead desktop to scan websites.');return false}
    lock.current=true;setPreparing(true);generation.current++
    try {
      savePendingImport('lookup-page', all.slice(WEBSITE_IMPORT_LIMIT))
      const next=await db.lookup.start(sites,options)
      if (!alive.current) return false
      currentJob.current=next.jobId;active.current.add(next.jobId);finishCallbacks.current.set(next.jobId,callbacks.current.onFinished);setSession(next);setSelected([]);setInput(all.slice(WEBSITE_IMPORT_LIMIT).join('\n'))
      void window.desktop?.enrichment.prioritize(next.jobId).catch(err=>{if(alive.current){setError(err instanceof Error ? err.message : 'The scan could not start.');void refresh()}})
      return true
    } catch (err) {if(alive.current)setError(err instanceof Error ? err.message : 'The lookup could not start.');return false}
    finally {lock.current=false;if(alive.current)setPreparing(false)}
  },[db,fields,input,refresh,running])

  const exportRows = selected.length ? session?.rows.filter(row=>selected.includes(row.leadId)) ?? [] : session?.rows ?? []
  async function exportFile(format: 'xlsx' | 'pdf') {
    if (!db || !session || exporting.current || !exportRows.length || running) return
    exporting.current=true;setExportBusy(true);setError('')
    const columns=['Business name','Website',...(session.fields.email?['Emails']:[]),...(session.fields.phone?['Phone numbers']:[]),...(session.fields.address?['Business address']:[]),...(session.fields.social?['Social links']:[]),'Sources','Status','Error']
    try {
      const result=await db.exports.write({kind:'website',lookupJobId:session.jobId,format,limit:exportRows.length,leadIds:exportRows.map(row=>row.leadId),columns,delimiter:'csv',fileName:`mamalead-website-lookup-${new Date().toISOString().slice(0,10)}`})
      if (result && alive.current) {setExportOpen(false);setExportNote(`${result.rows} website${result.rows===1?'':'s'} exported to ${result.fileName}.`)}
    } catch (err) {if(alive.current)setError(err instanceof Error ? err.message : 'The export could not be saved.')}
    finally {exporting.current=false;if(alive.current)setExportBusy(false)}
  }
  const rows=session?.rows ?? []
  const processed=rows.filter(row=>row.status==='done' || row.status==='failed').length
  const failed=rows.filter(row=>row.status==='failed').length
  return {input,setInput,fields,setFields,session,rows,running,preparing,error,setError,clearError:()=>setError(''),preview,start,refresh,
    selected,toggle:(id:string)=>setSelected(ids=>ids.includes(id)?ids.filter(value=>value!==id):[...ids,id]),
    selectAll:()=>setSelected(selected.length===rows.length?[]:rows.map(row=>row.leadId)),
    processed,failed,remaining:rows.length-processed,
    exportOpen,openExport:()=>{setExportNote('');setExportOpen(true)},closeExport:()=>{if(!exportBusy)setExportOpen(false)},exportBusy,exportFile,exportCount:exportRows.length,exportNote,
  }
}

export type WebsiteLookupValues = ReturnType<typeof useWebsiteLookup>
