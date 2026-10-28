import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { AppValues } from './useAppValues'
import { defaultNotificationAction, notificationClock, notificationGroups, notificationKind, type AppNotification, type NotificationKind } from './notification-model'
import './notification-center.css'

function NoteIcon({kind}:{kind:NotificationKind}) {
  return <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {kind==='scrape'?<><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.4"/></>:kind==='warn'?<><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5M8.5 11h5"/></>:kind==='import'?<><path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1"/><path d="M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1"/></>:kind==='export'?<path d="M12 4v11m-4.5-4.5L12 15l4.5-4.5M5 19.5h14"/>:kind==='billing'?<><circle cx="8.5" cy="12" r="3.5"/><path d="M12 12h8.5M17 12v3M20 12v2"/></>:<><path d="M6.5 10a5.5 5.5 0 0 1 11 0c0 4 1.5 5.5 1.5 5.5H5S6.5 14 6.5 10zM10 18.5a2.2 2.2 0 0 0 4 0"/></>}
  </svg>
}

function actionLabel(item:AppNotification):string {
  if(item.actionLabel)return item.actionLabel
  const action=defaultNotificationAction(item)
  if(!action)return ''
  if(action.type==='reveal-export')return 'Show in folder'
  return {maps:'Review leads',social:'Open profiles',email:'Open Email Finder',phone:'Open Phone Finder',dm:'Open Decision Makers',website:'Open Website Lookup',settings:'Open Settings & Billing',runs:'Open activity'}[action.view]
}

export function NotificationCenter({V}:{V:AppValues}) {
  const [tab,setTab]=useState<'all'|'unread'>('all')
  const [actionError,setActionError]=useState('')
  const [opening,setOpening]=useState('')
  const [placement,setPlacement]=useState({top:80,right:16,maxHeight:Math.max(200,window.innerHeight-100)})
  const panel=useRef<HTMLElement>(null),first=useRef<HTMLButtonElement>(null)
  const groups=useMemo(()=>notificationGroups(V.notifications,tab==='unread'),[V.notifications,tab])
  const unread=V.notifications.filter(item=>item.unread).length
  const values=useRef(V);values.current=V
  useLayoutEffect(()=>{
    const bell=document.querySelector<HTMLElement>('[data-notifications-button]')
    const position=()=>{
      const bounds=bell?.getBoundingClientRect(),width=Math.min(480,window.innerWidth-32)
      const below=bounds ? window.innerHeight-bounds.bottom-16 : 0
      const top=bounds && bounds.bottom>0 && below>=300 ? Math.max(12,bounds.bottom+10) : 12
      const right=Math.min(Math.max(12,window.innerWidth-(bounds?.right ?? window.innerWidth-16)),Math.max(12,window.innerWidth-width-12))
      setPlacement({top,right,maxHeight:Math.max(120,Math.min(760,window.innerHeight-top-16))})
    }
    position();window.addEventListener('resize',position);window.addEventListener('scroll',position)
    const observer=new ResizeObserver(position)
    if(bell?.closest('header'))observer.observe(bell.closest('header')!)
    return()=>{observer.disconnect();window.removeEventListener('resize',position);window.removeEventListener('scroll',position)}
  },[])
  useEffect(()=>{
    const opener=document.activeElement as HTMLElement|null
    first.current?.focus()
    const key=(event:KeyboardEvent)=>{
      if(event.key==='Escape'){event.preventDefault();event.stopPropagation();values.current.closeNotifications();return}
      if(event.key!=='Tab'||!panel.current)return
      const targets=Array.from(panel.current.querySelectorAll<HTMLElement>('button:not(:disabled):not([tabindex="-1"]),[tabindex="0"]')).filter(el=>el.getClientRects().length)
      const start=targets[0],end=targets[targets.length-1]
      if(event.shiftKey && (document.activeElement===start || !panel.current.contains(document.activeElement))){event.preventDefault();end?.focus()}
      else if(!event.shiftKey && (document.activeElement===end || !panel.current.contains(document.activeElement))){event.preventDefault();start?.focus()}
    }
    document.addEventListener('keydown',key,true)
    return()=>{document.removeEventListener('keydown',key,true);if(opener?.isConnected)opener.focus()}
  },[])
  return <section ref={panel} id="notifications-panel" className="nt-panel" style={placement} data-notifications-panel="1" role="dialog" aria-label="Notifications">
    <header className="nt-header"><button ref={first} type="button" className="nt-icon-button nt-back" data-notifications-close="1" aria-label="Back to page" title="Close notifications" onClick={V.closeNotifications}><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M19 12H5.5M11 6l-6 6 6 6"/></svg></button><div><h2>Notifications</h2><p>{V.notificationsCountLabel}</p></div>{unread>0&&<button type="button" className="nt-mark-all" onClick={V.markNotificationsRead} data-notifications-read="1">Mark all read</button>}</header>
    <div className="nt-tabs" role="tablist" aria-label="Notification filter" data-active={tab}>{(['all','unread'] as const).map(value=><button id={`nt-tab-${value}`} type="button" role="tab" aria-selected={tab===value} aria-controls="notification-items" tabIndex={tab===value?0:-1} key={value} onClick={()=>{setTab(value);setActionError('')}} onKeyDown={event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const next=event.key==='Home'?'all':event.key==='End'?'unread':value==='all'?'unread':'all';setTab(next);document.getElementById(`nt-tab-${next}`)?.focus()}}>{value==='all'?'All':'Unread'} <span>{value==='all'?V.notifications.length:unread}</span></button>)}</div>
    <div className="nt-body" id="notification-items" role="tabpanel" aria-labelledby={`nt-tab-${tab}`}>
      {actionError&&<p className="nt-error" role="alert">{actionError}</p>}
      {groups.map(group=><div className="nt-group" key={group.label}><div className="nt-group-label"><span>{group.label}</span><span/></div>{group.items.map(item=>{
        const kind=notificationKind(item),label=actionLabel(item)
        return <article key={item.id} className="nt-note" data-note={item.id} data-unread={item.unread?'yes':'no'}><span className="nt-note-symbol"><span className="nt-kind" data-kind={kind}><NoteIcon kind={kind}/></span><span className="nt-unread-dot" aria-label={item.unread?'Unread':undefined}/></span><div className="nt-note-content"><div className="nt-note-title"><strong>{item.title}</strong><time dateTime={item.at}>{notificationClock(item.at)}</time></div><p>{item.body}</p>{Boolean(item.chips?.length)&&<div className="nt-chips">{item.chips!.map((chip,index)=><span key={index}>{chip}</span>)}</div>}{label&&<button type="button" className="nt-action" disabled={Boolean(opening)} onClick={async()=>{setActionError('');setOpening(item.id);try{const error=await V.openNotification(item.id);if(error)setActionError(error)}finally{setOpening('')}}}>{opening===item.id?'Opening…':label}<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h13.5M13 6l6 6-6 6"/></svg></button>}</div><div className="nt-note-controls"><button type="button" className="nt-icon-button" data-notification-read={item.id} aria-label={`${item.unread?'Mark as read':'Mark as unread'}: ${item.title}`} title={item.unread?'Mark as read':'Mark as unread'} onClick={()=>V.notificationCenter.toggleRead(item.id)}><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{item.unread?<path d="M5 12.5 9.5 17 19 7.5"/>:<><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2.2" fill="currentColor"/></>}</svg></button><button type="button" className="nt-icon-button nt-delete" data-notification-delete={item.id} aria-label={`Delete notification: ${item.title}`} title="Delete" onClick={()=>{V.deleteNotification(item.id);setActionError('')}}><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 7h14M10 7V5h4v2M7 7l.8 12h8.4L17 7M10.5 11v5M13.5 11v5"/></svg></button></div></article>
      })}</div>)}
      {!groups.length&&<div className="nt-empty" data-notifications-empty="1"><span><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5 9.5 17 19 7.5"/></svg></span><h3>{tab==='unread'&&V.notifications.length?"You're all caught up":'No notifications yet'}</h3><p>New scrape, scan and export results land here.</p></div>}
    </div>
  </section>
}

export function NotificationToast({V}:{V:AppValues}) {
  const toast=V.notificationCenter.toast
  if(!toast)return null
  return <div role="status" className="nt-toast" data-notifications-toast="1"><span>{toast.message}</span>{toast.undo&&<button type="button" onClick={V.notificationCenter.undo}>Undo</button>}</div>
}
