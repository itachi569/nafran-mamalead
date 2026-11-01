import {useCallback,useEffect,useRef,useState} from 'react'
import {localDb} from '../lib/local'
import type {StoredLead} from '../types/desktop'

const columns=['Business name','Domain','Phone','Email','Address','Rating','Review count','Socials','Source','Saved date']
export function SavedListDetails({id,name,onClose,onLead,onDelete,deleteDisabled}:{id:string;name:string;onClose:()=>void;onLead:(id:string)=>void;onDelete:()=>void;deleteDisabled:boolean}) {
  const db=localDb(),panel=useRef<HTMLElement>(null),generation=useRef(0)
  const [ids,setIds]=useState<string[]>([]),[rows,setRows]=useState<StoredLead[]>([]),[page,setPage]=useState(0)
  const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[note,setNote]=useState('')
  const refresh=useCallback(async()=>{
    if(!db)return
    const request=++generation.current;setLoading(true)
    try{
      const members=await db.lists.members(id)
      const offset=Math.min(page*50,Math.max(0,Math.ceil(members.length/50)-1)*50)
      const data=await Promise.all(members.slice(offset,offset+50).map(leadId=>db.leads.get(leadId)))
      if(request!==generation.current)return
      setIds(members);setRows(data.filter((row):row is StoredLead=>Boolean(row)))
      if(offset!==page*50)setPage(offset/50)
    }catch(e){if(request===generation.current)setError(e instanceof Error?e.message:'Could not load this list.')}
    finally{if(request===generation.current)setLoading(false)}
  },[db,id,page])
  useEffect(()=>{void refresh();const stop=db?.onChanged(()=>void refresh());return()=>{generation.current++;stop?.()}},[db,refresh])
  useEffect(()=>{panel.current?.scrollIntoView({behavior:'smooth',block:'start'});panel.current?.focus({preventScroll:true})},[id])
  async function remove(leadId:string){
    if(!db||busy)return
    setBusy(true);setError('')
    try{await db.lists.removeLead(id,leadId);setNote('Removed from this list. The lead is still saved in All Leads.');await refresh()}
    catch(e){setError(e instanceof Error?e.message:'Could not remove this lead.')}
    finally{setBusy(false)}
  }
  async function exportList(format:'pdf'|'xlsx'){
    if(!db||busy||!ids.length)return
    setBusy(true);setError('');setNote('')
    try{
      const fileName=(name.replace(/[<>:"/\\|?*\u0000-\u001f]/g,'-').slice(0,80)||'saved-list')+'.'+format
      const result=await db.exports.write({kind:'leads',leadIds:ids,limit:ids.length,delimiter:'csv',columns,fileName,format})
      if(result)setNote(`Saved ${result.rows} ${result.rows===1?'lead':'leads'} to ${result.fileName}.`)
    }catch(e){setError(e instanceof Error?e.message:'Could not export this list.')}
    finally{setBusy(false)}
  }
  return <section ref={panel} tabIndex={-1} className="saved-list-detail" aria-label="Saved list details">
    <div className="saved-list-heading"><div><h2>{name}</h2><p>{ids.length} {ids.length===1?'lead':'leads'} saved in this list</p></div><button className="data-action" onClick={onClose}>Close list</button></div>
    <div className="data-toolbar">
      <button disabled={busy||loading||!ids.length} onClick={()=>void exportList('xlsx')}>Export Excel</button>
      <button disabled={busy||loading||!ids.length} onClick={()=>void exportList('pdf')}>Export PDF</button>
      <button disabled={busy||deleteDisabled} onClick={onDelete}>Delete list</button>
    </div>
    <p>Removing a lead or deleting this list keeps your leads in All Leads.</p>
    {error&&<p role="alert">{error}</p>}{note&&<p role="status">{note}</p>}
    {loading?<p role="status">Loading list…</p>:rows.length?<><div className="saved-list-table"><table><thead><tr><th>Business</th><th>Website</th><th>Phone</th><th>Actions</th></tr></thead><tbody>{rows.map(row=><tr key={row.id}><td><button className="saved-list-name" onClick={()=>onLead(row.id)}>{row.name}</button></td><td>{row.website||'No website'}</td><td>{row.phone||'No phone'}</td><td><button className="data-action" disabled={busy} onClick={()=>void remove(row.id)} aria-label={`Remove ${row.name} from list`}>Remove from list</button></td></tr>)}</tbody></table></div>
      <div className="data-toolbar"><button disabled={page===0||busy} onClick={()=>setPage(value=>value-1)}>Previous</button><span>{page*50+1}–{Math.min((page+1)*50,ids.length)} of {ids.length}</span><button disabled={(page+1)*50>=ids.length||busy} onClick={()=>setPage(value=>value+1)}>Next</button></div></>:<p>This list is empty. Add saved leads to see them here.</p>}
  </section>
}
