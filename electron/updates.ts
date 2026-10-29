export type UpdateStatus = {
  state: 'disabled' | 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'not-available' | 'error'
  version: string | null
  percent: number | null
  message: string
  enabled: boolean
  autoDownload: boolean
  lastCheckedAt: string | null
}

export type UpdatePreferences = { autoDownload: boolean; lastCheckedAt: string | null }
type Updater = {
  autoDownload: boolean; autoInstallOnAppQuit: boolean; allowDowngrade: boolean; allowPrerelease: boolean
  setFeedURL(options: {provider:'generic';url:string;useMultipleRangeRequest:boolean}): void
  on(event:string, listener:(...args:any[])=>void): unknown
  removeListener(event:string, listener:(...args:any[])=>void): unknown
  checkForUpdates(): Promise<unknown>
  downloadUpdate(): Promise<unknown>
  quitAndInstall(): void
}
type Options = {
  updater: Updater; enabled: boolean; feedUrl: string; disabledMessage: string
  readPreferences: ()=>unknown; savePreferences: (preferences:UpdatePreferences)=>void
  emit: (status:UpdateStatus)=>void; busy: ()=>boolean
  initialDelayMs?: number; intervalMs?: number
}

/** Downloading never restarts the app. Only an explicit restart or a normal app quit installs. */
export class UpdateManager {
  private state: UpdateStatus
  private started = false
  private installing = false
  private startup?: ReturnType<typeof setTimeout>
  private interval?: ReturnType<typeof setInterval>
  private listeners: [string,(...args:any[])=>void][] = []

  constructor(private readonly options:Options) {
    let saved: Partial<UpdatePreferences> = {}
    try { const value=options.readPreferences(); if(value && typeof value==='object')saved=value as Partial<UpdatePreferences> } catch { /* Invalid preferences fall back to manual downloads. */ }
    this.state={state:options.enabled?'idle':'disabled',version:null,percent:null,
      message:options.enabled?'MamaLead checks for new releases automatically.':options.disabledMessage,
      enabled:options.enabled,autoDownload:saved.autoDownload===true,
      lastCheckedAt:typeof saved.lastCheckedAt==='string' && Number.isFinite(Date.parse(saved.lastCheckedAt))?saved.lastCheckedAt:null}
  }

  status():UpdateStatus { return {...this.state} }
  private set(patch:Partial<UpdateStatus>):UpdateStatus {
    this.state={...this.state,...patch};this.options.emit(this.status());return this.status()
  }
  private save(patch:Partial<UpdatePreferences>={}):void {
    this.options.savePreferences({autoDownload:this.state.autoDownload,lastCheckedAt:this.state.lastCheckedAt,...patch})
  }
  start():void {
    if(this.started || !this.state.enabled)return
    this.started=true
    const updater=this.options.updater
    updater.setFeedURL({provider:'generic',url:this.options.feedUrl,useMultipleRangeRequest:false})
    updater.autoDownload=false // The manager controls this to avoid duplicate requests.
    updater.autoInstallOnAppQuit=this.state.autoDownload
    updater.allowDowngrade=false;updater.allowPrerelease=false
    const on=(event:string,listener:(...args:any[])=>void)=>{this.listeners.push([event,listener]);updater.on(event,listener)}
    on('checking-for-update',()=>this.set({state:'checking',message:'Checking for a newer version…',percent:null}))
    on('update-available',(info:{version:string})=>{
      this.set({state:'available',version:info.version,percent:null,message:`Version ${info.version} is available. Update MamaLead to get the latest improvements.`})
      if(this.state.autoDownload)void this.download()
    })
    on('download-progress',(progress:{percent:number})=>{
      const percent=Math.max(0,Math.min(100,Math.round(Number(progress.percent)||0)))
      this.set({state:'downloading',percent,message:`Downloading update — ${percent}%. You can keep working.`})
    })
    on('update-downloaded',(info:{version:string})=>this.set({state:'ready',version:info.version,percent:100,message:`Version ${info.version} is ready. ${this.state.autoDownload?'It will install when you close MamaLead, or choose Restart to install.':'Choose Restart to install when you are ready.'}`}))
    on('update-not-available',()=>this.set({state:'not-available',version:null,percent:null,message:'You are using the latest version.'}))
    on('error',(error:Error)=>this.set({state:'error',percent:null,message:error.message || 'The update could not finish. Check your connection and try again.'}))
    this.startup=setTimeout(()=>void this.check(),this.options.initialDelayMs ?? 8000)
    this.interval=setInterval(()=>void this.check(),this.options.intervalMs ?? 4*60*60*1000)
    this.startup.unref?.();this.interval.unref?.()
  }
  setAutoDownload(enabled:unknown):UpdateStatus {
    if(typeof enabled!=='boolean')throw new Error('Auto-update must be on or off.')
    if(!this.state.enabled)return this.status()
    this.save({autoDownload:enabled}) // A failed disk write must not falsely report a saved choice.
    this.options.updater.autoInstallOnAppQuit=enabled
    this.set({autoDownload:enabled,...(this.state.state==='ready'?{message:enabled?'Update ready. It will install when you close MamaLead, or choose Restart to install.':'Update ready. Choose Restart to install when you are ready.'}:{})})
    if(enabled && this.state.state==='available')void this.download()
    else if(enabled && ['idle','not-available','error'].includes(this.state.state))void this.check()
    return this.status()
  }
  async check():Promise<UpdateStatus> {
    if(!this.state.enabled || this.installing || ['checking','downloading','ready'].includes(this.state.state))return this.status()
    this.set({state:'checking',version:null,percent:null,message:'Checking for a newer version…',lastCheckedAt:new Date().toISOString()})
    try {this.save()} catch { /* A check still works if its timestamp cannot be saved. */ }
    try {await this.options.updater.checkForUpdates()} catch(error) {this.set({state:'error',message:error instanceof Error?error.message:'The update check failed.'})}
    return this.status()
  }
  async download():Promise<UpdateStatus> {
    if(!this.state.enabled || this.state.state!=='available')return this.status()
    this.set({state:'downloading',message:'Downloading the update… You can keep working.',percent:0})
    try {await this.options.updater.downloadUpdate()} catch(error) {this.set({state:'error',percent:null,message:error instanceof Error?error.message:'The update download failed.'})}
    return this.status()
  }
  install():{started:boolean;message?:string} {
    if(this.installing || this.state.state!=='ready')return {started:false}
    if(this.options.busy()){
      const message='Finish or stop your current scan before restarting to install the update.'
      this.set({message});return {started:false,message}
    }
    this.installing=true
    this.options.updater.quitAndInstall()
    return {started:true}
  }
  dispose():void {
    clearTimeout(this.startup);clearInterval(this.interval)
    for(const [event,listener] of this.listeners)this.options.updater.removeListener(event,listener)
    this.listeners=[];this.started=false
  }
}
