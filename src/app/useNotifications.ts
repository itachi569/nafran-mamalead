import { useCallback, useEffect, useRef, useState } from 'react'
import { MAX_NOTIFICATIONS, NOTIFICATIONS_STORAGE_KEY, readStoredNotifications, type AppNotification, type NotificationDetails } from './notification-model'

export function useNotifications(enabled:boolean) {
  const [notifications,setNotifications]=useState(readStoredNotifications)
  const current=useRef(notifications),nativeEnabled=useRef(enabled)
  nativeEnabled.current=enabled
  const [toast,setToast]=useState<{message:string;undo:boolean}|null>(null)
  const [popups,setPopups]=useState<AppNotification[]>([])
  const dismissPopup=useCallback((id:string)=>setPopups(items=>items.filter(item=>item.id!==id)),[])
  const dismissPopups=useCallback(()=>setPopups([]),[])
  const removed=useRef<{item:AppNotification;index:number}|null>(null)
  const timer=useRef<number|undefined>(undefined)
  useEffect(()=>()=>window.clearTimeout(timer.current),[])
  const commit=useCallback((items:AppNotification[])=>{
    current.current=items;setNotifications(items)
    setPopups(visible=>visible.filter(popup=>items.some(item=>item.id===popup.id)))
    try {window.localStorage.setItem(NOTIFICATIONS_STORAGE_KEY,JSON.stringify(items))}catch{/* The in-memory history still works if storage is full. */}
  },[])
  const feedback=useCallback((message:string,undo=false)=>{
    window.clearTimeout(timer.current);setToast({message,undo})
    timer.current=window.setTimeout(()=>{setToast(null);removed.current=null},4500)
  },[])
  const notify=useCallback((title:string,body:string,level:AppNotification['level']='info',runId?:string,details:NotificationDetails={})=>{
    const groupKey=(runId ? 'run:'+runId : details.eventKey) || (level==='error'?'error:'+title+':'+body:'')
    const needsAttention=level==='error'||details.kind==='billing'||details.kind==='warn'||/^update:/.test(details.eventKey || '')||/^(New MamaLead update|Update ready)$/.test(title)
    const update={key:details.eventKey || title,title,body,level}
    if(groupKey){const prior=current.current.find(item=>item.eventKey===groupKey);if(prior){
      const updates=runId?[...(prior.updates || [{key:prior.eventKey || prior.title,title:prior.title,body:prior.body,level:prior.level}]).filter(part=>part.key!==update.key),update].slice(-8):undefined
      const hasIssues=updates?.some(part=>part.level==='error')
      const next={...prior,...details,eventKey:groupKey,updates,
        body:updates?updates.map(part=>part.title+': '+part.body).join('\n'):body,
        title:updates&&updates.length>1?(hasIssues?'Run finished with issues':'Run results updated'):title,
        level:hasIssues?'error' as const:level,unread:needsAttention||prior.unread,at:new Date().toISOString()}
      if(prior.body!==next.body||prior.title!==next.title||prior.level!==next.level){
        commit(current.current.map(item=>item.id===prior.id?next:item))
        if(nativeEnabled.current)setPopups(items=>[next,...items.filter(item=>item.id!==prior.id)].slice(0,2))
      }
      return prior.id
    }}
    details={...details,eventKey:groupKey || undefined}
    const item:AppNotification={id:crypto.randomUUID(),title,body,level,runId,at:new Date().toISOString(),unread:details.kind!=='export'&&needsAttention,...details,chips:details.chips?.slice(0,4),updates:runId?[update]:undefined}
    commit([item,...current.current].slice(0,MAX_NOTIFICATIONS))
    if(nativeEnabled.current){
      setPopups(items=>[item,...items].slice(0,2))
      void window.desktop?.notifications?.show(title,body,item.id).catch(()=>undefined)
    }
    return item.id
  },[commit])
  const markRead=useCallback((id:string)=>{dismissPopup(id);commit(current.current.map(item=>item.id===id?{...item,unread:false}:item))},[commit,dismissPopup])
  const toggleRead=useCallback((id:string)=>commit(current.current.map(item=>item.id===id?{...item,unread:!item.unread}:item)),[commit])
  const markAllRead=useCallback(()=>{setPopups([]);commit(current.current.map(item=>({...item,unread:false})));removed.current=null;feedback('All notifications marked as read')},[commit,feedback])
  const remove=useCallback((id:string)=>{
    const index=current.current.findIndex(item=>item.id===id)
    if(index<0)return
    removed.current={item:current.current[index],index}
    commit(current.current.filter(item=>item.id!==id));feedback('Notification deleted',true)
  },[commit,feedback])
  const undo=useCallback(()=>{
    const deleted=removed.current;if(!deleted)return
    const items=current.current.filter(item=>item.id!==deleted.item.id)
    items.splice(Math.min(deleted.index,items.length),0,deleted.item)
    if(items.length>MAX_NOTIFICATIONS){let index=items.length-1;while(index>=0&&items[index].id===deleted.item.id)index--;if(index>=0)items.splice(index,1)}
    commit(items);removed.current=null;window.clearTimeout(timer.current);setToast(null)
  },[commit])
  const find=useCallback((id:string)=>current.current.find(item=>item.id===id),[])
  return {notifications:notifications.filter(item=>!/decision[ -]?maker|owner email|owner scan/i.test(item.title)),notify,markRead,toggleRead,markAllRead,remove,undo,toast,find,popups,dismissPopup,dismissPopups}
}
