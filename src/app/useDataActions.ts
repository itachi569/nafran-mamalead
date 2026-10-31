import {useCallback,useEffect,useRef,useState} from 'react'
import type {LocalApi} from '../types/desktop'

/** A deletion is committed only after the visible five-second Undo period. */
export function useDataActions(db:LocalApi|null, flash:(text:string)=>void) {
  const [selected,setSelected]=useState<string[]>([])
  const [pending,setPending]=useState('')
  const timer=useRef<ReturnType<typeof setTimeout>|null>(null)
  const operation=useRef<(()=>Promise<unknown>)|null>(null)
  const [busy,setBusy]=useState(false)
  useEffect(()=>()=>{if(timer.current)clearTimeout(timer.current)},[])
  const undo=useCallback(()=>{if(timer.current)clearTimeout(timer.current);timer.current=null;operation.current=null;setPending('')},[])
  useEffect(()=>{
    if(!pending)return
    // Start the Undo window after the toast has been committed and painted.
    const frame=requestAnimationFrame(()=>{timer.current=setTimeout(()=>{const commit=operation.current;operation.current=null;timer.current=null;setPending('');if(!commit)return;setBusy(true);void commit().then(()=>{setSelected([]);flash('Removed from your saved records.')}).catch(e=>flash(e.message || 'Could not delete the record.')).finally(()=>setBusy(false))},5000)})
    return ()=>{cancelAnimationFrame(frame);if(timer.current)clearTimeout(timer.current);timer.current=null}
  },[pending,flash])
  const schedule=useCallback((label:string,commit:()=>Promise<unknown>)=>{
    if(operation.current || busy)return
    operation.current=commit
    setPending(label)
  },[busy])
  return {selected,pending,busy,undo,
    toggle:(id:string)=>setSelected(ids=>ids.includes(id)?ids.filter(value=>value!==id):[...ids,id]),
    selectPage:(ids:string[])=>setSelected(current=>ids.every(id=>current.includes(id))?current.filter(id=>!ids.includes(id)):[...new Set([...current,...ids])]),
    clear:()=>setSelected([]),
    removeSelected:()=>{if(db && selected.length)schedule(`${selected.length} selected leads will be deleted in 5 seconds.`,()=>db.leads.remove(selected))},
    removeRun:(id:string)=>{if(db)schedule('This run will be removed in 5 seconds. Its leads will stay saved.',()=>db.runs.remove(id))},
  }
}
