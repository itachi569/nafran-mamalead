import { useCallback, useEffect, useRef, useState } from 'react'
import { MAX_NOTIFICATIONS, NOTIFICATIONS_STORAGE_KEY, readStoredNotifications, type AppNotification, type NotificationDetails } from './notification-model'

export function useNotifications(enabled:boolean) {
  const [notifications,setNotifications]=useState(readStoredNotifications)
  const current=useRef(notifications),nativeEnabled=useRef(enabled)
  nativeEnabled.current=enabled
  const [toast,setToast]=useState<{message:string;undo:boolean}|null>(null)
  const removed=useRef<{item:AppNotification;index:number}|null>(null)
  const timer=useRef<number|undefined>(undefined)
  useEffect(()=>()=>window.clearTimeout(timer.current),[])
  const commit=useCallback((items:AppNotification[])=>{
    current.current=items;setNotifications(items)
    try {window.localStorage.setItem(NOTIFICATIONS_STORAGE_KEY,JSON.stringify(items))}catch{/* The in-memory history still works if storage is full. */}
  },[])
  const feedback=useCallback((message:string,undo=false)=>{
    window.clearTimeout(timer.current);setToast({message,undo})
    timer.current=window.setTimeout(()=>{setToast(null);removed.current=null},4500)
  },[])
  const notify=useCallback((title:string,body:string,level:AppNotification['level']='info',runId?:string,details:NotificationDetails={})=>{
    if(details.eventKey){const prior=current.current.find(item=>item.eventKey===details.eventKey);if(prior)return prior.id}
    const item:AppNotification={id:crypto.randomUUID(),title,body,level,runId,at:new Date().toISOString(),unread:true,...details,chips:details.chips?.slice(0,4)}
    commit([item,...current.current].slice(0,MAX_NOTIFICATIONS))
    if(nativeEnabled.current)void window.desktop?.notifications?.show(title,body,item.id).catch(()=>undefined)
    return item.id
  },[commit])
  const markRead=useCallback((id:string)=>commit(current.current.map(item=>item.id===id?{...item,unread:false}:item)),[commit])
  const toggleRead=useCallback((id:string)=>commit(current.current.map(item=>item.id===id?{...item,unread:!item.unread}:item)),[commit])
  const markAllRead=useCallback(()=>{commit(current.current.map(item=>({...item,unread:false})));removed.current=null;feedback('All notifications marked as read')},[commit,feedback])
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
  return {notifications:notifications.filter(item=>!/decision[ -]?maker|owner email|owner scan/i.test(item.title)),notify,markRead,toggleRead,markAllRead,remove,undo,toast,find}
}
