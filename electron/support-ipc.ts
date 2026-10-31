import {app,ipcMain,shell,clipboard} from 'electron'
import {arch,release} from 'node:os'
import {createHash,randomUUID} from 'node:crypto'
import {existsSync,readFileSync,writeFileSync,mkdirSync} from 'node:fs'
import {join} from 'node:path'
import {billingSupportRequest,cachedSupportBilling} from './billing/client'
import {buildSupportMeta} from './support-meta'
import {supportValidation,scrubSupportText,scrubSupportMessage,type SupportPayload,type SupportResult} from './support-data'
import {readSupportConfig,writeSupportConfig,cleanSupportConfig,clearSupportRetry} from './support-cache'
import {userError} from './user-errors'

export function registerSupportIpc(getDiagnostics:()=>{counts:{leads:number;runs:number};emailValidityProvider:string|null}) {
 const errors:{at:string;text:string}[]=[]
 let controller:AbortController|null=null,owner:number|null=null,config=readSupportConfig(app.getPath('userData'))
 let sent:number[]=[]
 const record=(value:unknown)=>{errors.push({at:new Date().toISOString(),text:scrubSupportText(userError(value)).slice(0,800)});if(errors.length>5)errors.shift()}
 // Only bounded, scrubbed user-facing errors are retained; never raw exceptions.
 ipcMain.on('support:recordError',(_event,text:unknown)=>{if(typeof text==='string'&&text.length<=4000)record(text)})
 ipcMain.handle('support:status',async()=>{
  try{const result=cleanSupportConfig(await billingSupportRequest('/v1/support/config'));if(result){config=result;writeSupportConfig(app.getPath('userData'),config)}}catch{config={...config,configured:false}}
  const b=cachedSupportBilling();return {...config,replyEmail:b?.license?.email||b?.purchaseEmail||''}
 })
 ipcMain.handle('support:cancel',event=>{if(owner===event.sender.id)controller?.abort();return {cancelled:true}})
 ipcMain.handle('support:openMail',async(_event,body:unknown)=>{
  if(typeof body!=='string'||body.length>7000)throw new Error('Support message is too long.')
  const text=scrubSupportMessage(body);clipboard.writeText(text)
  await shell.openExternal(`mailto:${encodeURIComponent(config.email)}?subject=MamaLead%20support&body=${encodeURIComponent(text.slice(0,2000))}`);return {opened:true}
 })
 ipcMain.handle('support:send',async(event,p:SupportPayload):Promise<SupportResult>=>{
  if(controller)return {error:'A support message is already being sent.'}
  const invalid=supportValidation(p||{} as SupportPayload);if(Object.keys(invalid).length)return {error:Object.values(invalid)[0],field:Object.keys(invalid)[0]}
  const now=Date.now();sent=sent.filter(t=>t>now-3600000)
  const wait=Math.max(0,60-Math.floor((now-(sent.at(-1)||0))/1000),sent.length>=5?Math.ceil((sent[0]+3600000-now)/1000):0)
  if(wait)return {error:'Please wait before sending another message.',retryAfterSeconds:wait}
  controller=new AbortController();owner=event.sender.id
  const cancelled=()=>controller?.abort();event.sender.once('destroyed',cancelled)
  try{
   const page=/^(dashboard|maps|social|email|phone|website|leads|lists|runs|settings(?::(?:acct|plan|inv|pay))?)$/.test(p.page)?p.page:'unknown'
   const fields={name:p.name.trim(),email:p.email.trim().toLowerCase(),category:p.category,subject:scrubSupportMessage(p.subject.trim()),message:scrubSupportMessage(p.message.trim()),page,diagnostics:p.diagnostics===true}
   // Persist only a payload hash and idempotency UUID, never message/diagnostics.
   const hash=createHash('sha256').update(JSON.stringify(fields)).digest('hex'),path=join(app.getPath('userData'),'support-retry.json')
   let retry:{hash:string;id:string}|null=null;try{if(existsSync(path))retry=JSON.parse(readFileSync(path,'utf8'))}catch{}
   const clientMessageId=retry?.hash===hash&&/^[0-9a-f-]{36}$/i.test(retry.id)?retry.id:randomUUID()
   mkdirSync(app.getPath('userData'),{recursive:true});writeFileSync(path,JSON.stringify({hash,id:clientMessageId}),{mode:0o600})
   const diagnostics=fields.diagnostics?getDiagnostics():{}
   const meta=buildSupportMeta({app:{version:app.getVersion(),platform:process.platform,arch:arch(),osRelease:release(),electron:process.versions.electron,isPackaged:app.isPackaged},license:cachedSupportBilling()?.license,diagnostics:fields.diagnostics,locale:app.getLocale(),timezone:Intl.DateTimeFormat().resolvedOptions().timeZone,lastErrors:errors,...diagnostics})
   const result=await billingSupportRequest('/v1/support',{...fields,clientMessageId,meta,website:''},controller.signal)
   if(result.ok&&result.ticketId)sent.push(Date.now())
   return result
  }catch(e){if(controller?.signal.aborted)return {cancelled:true};record(e);const error=e as {message?:string;status?:number;field?:string;retryAfterSeconds?:number};if(error.status===409)clearSupportRetry(app.getPath('userData'));return {error:userError(error.message||'Support is unavailable.'),field:error.field,retryAfterSeconds:error.retryAfterSeconds,offline:!error.status||error.status===404||error.status>=500}}
  finally{event.sender.removeListener('destroyed',cancelled);controller=null;owner=null}
 })
}
