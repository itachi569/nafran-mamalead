import { userError } from '../../electron/user-errors'
export const NOTIFICATIONS_STORAGE_KEY = 'nafran.notifications'
export const MAX_NOTIFICATIONS = 200
export type NotificationKind = 'scrape' | 'import' | 'warn' | 'export' | 'billing' | 'system'
export type NotificationView = 'maps' | 'social' | 'email' | 'phone' | 'website' | 'settings' | 'runs'
export type NotificationAction = { type: 'view'; view: NotificationView; runId?: string; tab?: 'plan' | 'acct' | 'inv'; focus?: 'results' | 'search' | 'updates' | 'support' } | { type: 'reveal-export'; path: string }
export interface AppNotification {
  id: string; title: string; body: string; at: string; level: 'info' | 'success' | 'error'; unread: boolean
  runId?: string; kind?: NotificationKind; chips?: string[]; action?: NotificationAction; actionLabel?: string; eventKey?: string
  updates?: {key:string;title:string;body:string;level:AppNotification['level']}[]
}
export type NotificationDetails = Pick<AppNotification, 'kind' | 'chips' | 'action' | 'actionLabel' | 'eventKey'>

export function notificationKind(item: Pick<AppNotification, 'title' | 'level' | 'kind'>): NotificationKind {
  if (item.kind) return item.kind
  if (item.level === 'error' || /allowance.*low/i.test(item.title)) return 'warn'
  if (/export/i.test(item.title)) return 'export'
  if (/payment|licen[cs]e|billing|decision.*ready|key sent|access/i.test(item.title)) return 'billing'
  if (/maps|scrape/i.test(item.title)) return 'scrape'
  if (/lookup|scan|import|enrichment|email|phone|profiles/i.test(item.title)) return 'import'
  return 'system'
}

export function defaultNotificationAction(item: AppNotification): NotificationAction | undefined {
  if (item.action) return item.action
  if (/export/i.test(item.title)) return undefined // Legacy paths were not captured as trusted export actions.
  if (/licen[cs]e|payment|billing|allowance|key sent|decision.*ready/i.test(item.title)) return {type:'view',view:'settings',tab:/key sent|activat/i.test(item.title)?'acct':'plan'}
  if (item.runId || /maps|scrape/i.test(item.title)) return {type:'view',view:'maps',runId:item.runId,focus:item.level==='error'?'search':'results'}
  if (/decision|owner email|owner scan|people/i.test(item.title)) return undefined
  if (/email/i.test(item.title)) return {type:'view',view:'email'}
  if (/phone/i.test(item.title)) return {type:'view',view:'phone'}
  if (/social|profiles/i.test(item.title)) return {type:'view',view:'social'}
  if (/website/i.test(item.title)) return {type:'view',view:'website'}
  if (/update/i.test(item.title)) return {type:'view',view:'settings',tab:'acct'}
  return {type:'view',view:'runs'}
}

function safeAction(value: unknown): NotificationAction | undefined {
  if (!value || typeof value!=='object') return undefined
  const action=value as Record<string,unknown>
  if(action.type==='reveal-export' && typeof action.path==='string' && action.path.length<4096)return {type:'reveal-export',path:action.path}
  if(action.type==='view' && ['maps','social','email','phone','website','settings','runs'].includes(String(action.view)))return {
    type:'view',view:action.view as NotificationView,
    ...(typeof action.runId==='string'?{runId:action.runId}:{}),
    ...(['plan','acct','inv'].includes(String(action.tab))?{tab:action.tab as 'plan'|'acct'|'inv'}:{}),
    ...(['search','results','updates','support'].includes(String(action.focus))?{focus:action.focus as 'search'|'results'|'updates'|'support'}:{}),
  }
  return undefined
}

/** Valid legacy rows keep their IDs, timestamps and read state; no demo data is installed. */
export function readStoredNotifications(): AppNotification[] {
  try {
    const raw:unknown=JSON.parse(window.localStorage.getItem(NOTIFICATIONS_STORAGE_KEY) ?? '[]')
    if(!Array.isArray(raw))return []
    const seen=new Set<string>()
    return raw.flatMap((value:unknown):AppNotification[]=>{
      if(!value || typeof value!=='object')return []
      const item=value as Partial<AppNotification>
      if(typeof item.id!=='string'||seen.has(item.id)||typeof item.title!=='string'||typeof item.body!=='string'||typeof item.at!=='string'||!Number.isFinite(Date.parse(item.at))||!['info','success','error'].includes(String(item.level))||typeof item.unread!=='boolean')return []
      seen.add(item.id)
      return [{id:item.id,title:item.title,body:item.level==='error'?userError(item.body):item.body,at:item.at,level:item.level!,unread:item.unread,runId:typeof item.runId==='string'?item.runId:undefined,
        kind:['scrape','import','warn','export','billing','system'].includes(String(item.kind))?item.kind:undefined,
        chips:Array.isArray(item.chips)?item.chips.filter((chip):chip is string=>typeof chip==='string').slice(0,4):[],
        action:safeAction(item.action),actionLabel:typeof item.actionLabel==='string'?item.actionLabel:undefined,eventKey:typeof item.eventKey==='string'?item.eventKey:undefined,
        updates:Array.isArray(item.updates)?item.updates.filter(update=>update&&typeof update.key==='string'&&typeof update.title==='string'&&typeof update.body==='string'&&['info','success','error'].includes(update.level)).slice(-8):undefined}]
    }).sort((a,b)=>Date.parse(b.at)-Date.parse(a.at)).slice(0,MAX_NOTIFICATIONS)
  } catch {return []}
}

export function notificationGroups(items:AppNotification[],unreadOnly:boolean,now=new Date()) {
  const yesterday=new Date(now);yesterday.setDate(yesterday.getDate()-1)
  return ['Today','Yesterday','Earlier'].map(label=>({label,items:items.filter(item=>{
    const day=new Date(item.at).toDateString()
    return (!unreadOnly || item.unread) && (day===now.toDateString()?'Today':day===yesterday.toDateString()?'Yesterday':'Earlier')===label
  })})).filter(group=>group.items.length)
}

export function notificationClock(at:string,now=new Date()):string {
  const date=new Date(at),yesterday=new Date(now);yesterday.setDate(yesterday.getDate()-1)
  return new Intl.DateTimeFormat(undefined,date.toDateString()===now.toDateString()||date.toDateString()===yesterday.toDateString()?{hour:'numeric',minute:'2-digit'}:{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}).format(date)
}
