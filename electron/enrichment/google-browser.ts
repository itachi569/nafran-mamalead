import {spawn, type ChildProcess} from 'node:child_process'
import {existsSync, mkdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs'
import {join} from 'node:path'
import {chromium, type Browser, type Page} from 'playwright'
import type {OrganicSearchHit} from './dataforseo'

export type OwnerBrowserStatus = {phase:'closed'|'opening'|'ready'|'sign-in'|'connect'|'searching'|'verification'|'error';message:string;open:boolean}
const SESSION_NAMES = new Set(['SID','__Secure-1PSID','__Secure-3PSID'])
const pause = (ms:number,signal?:AbortSignal) => new Promise<void>((resolve,reject)=>{
  if(signal?.aborted){reject(new DOMException('Scan stopped','AbortError'));return}
  const aborted=()=>{clearTimeout(timer);reject(new DOMException('Scan stopped','AbortError'))}
  const timer=setTimeout(()=>{signal?.removeEventListener('abort',aborted);resolve()},ms)
  signal?.addEventListener('abort',aborted,{once:true})
})

/** Reads only the displayed search page. AI answers supply source links, never accepted emails. */
export async function readGoogleResults(page:Page):Promise<{hits:OrganicSearchHit[];challenge:boolean;empty:boolean}> {
  return page.evaluate(()=>{
    const body=document.body?.innerText || ''
    const challenge=/\/(?:sorry|challenge)(?:\/|\?)/.test(location.href) || /accounts\.google\.com|consent\.google\./.test(location.hostname) || Boolean(document.querySelector('iframe[src*="recaptcha"],#captcha-form')) || /unusual traffic from your computer network|verify (?:that )?you(?:'re| are) (?:a )?human/i.test(body)
    const hits:{title:string;url:string;description:string;aiOverview?:boolean}[]=[]
    const seen=new Set<string>()
    const external=(raw:string)=>{
      try{let url=new URL(raw,location.href);if(url.hostname===location.hostname && url.pathname==='/url')url=new URL(url.searchParams.get('q') || url.searchParams.get('url') || '');if(!/^https?:$/.test(url.protocol) || /(^|\.)(?:google\.[a-z.]+|googleusercontent\.com|gstatic\.com|youtube\.com)$/.test(url.hostname))return '';return url.href}catch{return ''}
    }
    for(const heading of Array.from(document.querySelectorAll('h3'))){
      const a=heading.closest('a') || heading.querySelector('a');const url=external(a?.getAttribute('href') || '');if(!url || seen.has(url))continue
      let card:Element=heading
      for(let i=0;i<6 && card.parentElement;i++){const parent=card.parentElement;if(parent.querySelectorAll('h3').length>1 || parent===document.body)break;card=parent;if((card.textContent || '').length>350)break}
      // Ads are not evidence for an owner's identity.
      if(card.closest('[data-text-ad],.uEierd,[data-dtld]'))continue
      seen.add(url);hits.push({title:heading.textContent?.trim() || '',url,description:(card.textContent || '').replace(/\s+/g,' ').trim().slice(0,3000)})
    }
    for(const heading of Array.from(document.querySelectorAll('h1,h2,[role="heading"]'))){
      if(!/^(?:AI Overview|AI overview)$/i.test(heading.textContent?.trim() || ''))continue
      let area:Element=heading
      for(let i=0;i<5 && area.parentElement;i++){if(area.querySelector('a[href^="http"]'))break;area=area.parentElement}
      if(area===document.body || (area.textContent || '').length>25000)continue
      for(const a of Array.from(area.querySelectorAll('a[href]'))){const url=external(a.getAttribute('href') || '');if(!url || seen.has(url))continue;seen.add(url);hits.push({title:a.textContent?.trim() || 'Overview source',url,description:'',aiOverview:true})}
    }
    return {hits:hits.slice(0,14),challenge,empty:/did not match any documents|no results found for|no results containing all your search terms/i.test(body)}
  })
}

/** A normal installed Chrome process with a dedicated profile and loopback-only DevTools.
 * No normal Chrome profile, copied cookies, password handling, or CAPTCHA automation. */
export class GoogleOwnerBrowser {
  private browser:Browser|null=null
  private page:Page|null=null
  private child:ChildProcess|null=null
  private launching:Promise<void>|null=null
  private searching=false
  private manual:ChildProcess|null=null
  private closing=false
  private state:OwnerBrowserStatus={phase:'closed',message:'Sign in once in MamaLead Chrome. Internet required; no search API key.',open:false}
  constructor(private profile:string,private changed:(status:OwnerBrowserStatus)=>void=()=>{}){}
  status(){return {...this.state}}
  private emit(phase:OwnerBrowserStatus['phase'],message:string){this.state={phase,message,open:Boolean(this.browser?.isConnected() || this.manual)};this.changed(this.status())}
  private get readyFile(){return join(this.profile,'mamalead-session-ready')}
  /** Sign-in runs in ordinary Chrome with no automation connection or debugging switches.
   * The user closes that window to save the profile, then explicitly chooses Connect. */
  async signIn(){
    if(this.searching)throw new Error('Stop the owner scan before changing the Google sign-in.')
    if(this.manual)return this.status()
    await this.close();this.closing=false
    rmSync(this.readyFile,{force:true});mkdirSync(this.profile,{recursive:true})
    const executable=this.chromePath()
    const openedAt=Date.now()
    const child=spawn(executable,[`--user-data-dir=${this.profile}`,'--no-first-run','--no-default-browser-check','--new-window','https://accounts.google.com/ServiceLogin?continue=https%3A%2F%2Fwww.google.com%2F&hl=en'],{stdio:'ignore',windowsHide:true})
    this.manual=child
    this.emit('sign-in','Sign in directly in Chrome, then close that Chrome window and click Connect saved sign-in. MamaLead is not controlling the sign-in window.')
    child.once('error',error=>{if(this.manual===child){this.manual=null;this.emit('error','Chrome could not open: '+error.message)}})
    child.once('exit',()=>{if(this.manual===child){this.manual=null;if(!this.closing)this.emit(Date.now()-openedAt<1500?'error':'connect',Date.now()-openedAt<1500?'Chrome closed before sign-in started, or another MamaLead Chrome window already has this profile. Close the other MamaLead Chrome windows, then choose Sign in to Google again.':'Chrome is closed. Click Connect saved sign-in to use the Google account you signed in with.')}})
    return this.status()
  }
  private chromePath():string {
    const paths=process.platform==='win32'
      ? [process.env.PROGRAMFILES,process.env['PROGRAMFILES(X86)'],process.env.LOCALAPPDATA].filter(Boolean).map(base=>join(base!,'Google','Chrome','Application','chrome.exe'))
      : process.platform==='darwin'?['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']:['/usr/bin/google-chrome','/usr/bin/google-chrome-stable']
    const executable=paths.find(existsSync)
    if(!executable)throw new Error('Install Google Chrome to use browser owner search, then try again.')
    return executable
  }
  private async launch(){
    this.emit('opening','Opening MamaLead Chrome…')
    mkdirSync(this.profile,{recursive:true})
    const portFile=join(this.profile,'DevToolsActivePort')
    // This file belongs only to this dedicated profile. Never reconnect to a different browser.
    rmSync(portFile,{force:true})
    const child=spawn(this.chromePath(),[`--user-data-dir=${this.profile}`,'--remote-debugging-port=0','--remote-debugging-address=127.0.0.1','--no-first-run','--no-default-browser-check','https://www.google.com/'],{stdio:'ignore',windowsHide:true})
    this.child=child
    let launchError:Error|undefined
    child.on('error',error=>{launchError=error})
    try{
      const deadline=Date.now()+20000
      while(Date.now()<deadline){
        if(this.closing)throw new Error('MamaLead Chrome connection was cancelled.')
        if(launchError)throw launchError
        if(child.exitCode!==null)throw new Error('MamaLead Chrome closed before connecting. Close any older MamaLead search window, then try again.')
        if(existsSync(portFile)){
          const [port,path]=readFileSync(portFile,'utf8').trim().split(/\r?\n/)
          if(/^\d+$/.test(port) && path?.startsWith('/devtools/browser/')){
            this.browser=await chromium.connectOverCDP(`http://127.0.0.1:${port}`,{timeout:5000})
            if(this.closing){await this.close();throw new Error('MamaLead Chrome connection was cancelled.')}
            const browser=this.browser
            this.page=browser.contexts()[0]?.pages()[0] || await browser.contexts()[0].newPage()
            browser.on('disconnected',()=>{if(this.browser===browser){this.browser=null;this.page=null;this.emit('closed','MamaLead Chrome is closed. Open it to continue.')}})
            this.emit('opening','Checking the saved Google sign-in…')
            return
          }
        }
        await pause(150)
      }
      throw new Error('MamaLead Chrome did not connect in time. Close its window and try again.')
    }catch(error){child.kill();this.child=null;this.emit('error',error instanceof Error?error.message:String(error));throw error}
  }
  async open(){
    this.closing=false
    if(this.manual)return this.status()
    if(!this.browser?.isConnected() && !existsSync(this.readyFile))return this.signIn()
    return this.connect()
  }
  async connect(){
    if(this.manual)throw new Error('Finish signing in and close the MamaLead Chrome window first, then click Connect saved sign-in.')
    this.closing=false
    const alreadyConnected=Boolean(this.browser?.isConnected())
    if(!this.browser?.isConnected()){
      this.launching ??= this.launch().finally(()=>{this.launching=null})
      await this.launching
    }
    if(!this.page || this.page.isClosed())this.page=await this.browser!.contexts()[0].newPage()
    if(!alreadyConnected && !await this.signedIn()){
      await this.close();rmSync(this.readyFile,{force:true})
      this.emit('error','No saved Google sign-in was found. Click Sign in to Google, finish signing in and close that Chrome window, then connect again.')
      throw new Error(this.state.message)
    }
    if(!alreadyConnected){writeFileSync(this.readyFile,'1\n','utf8');this.emit('ready','Google sign-in connected. Owner searches will use this saved account.')}
    await this.page.bringToFront()
    // BringToFront alone does not restore a minimized native Chrome window.
    const session=await this.page.context().newCDPSession(this.page)
    try{const {windowId}=await session.send('Browser.getWindowForTarget');await session.send('Browser.setWindowBounds',{windowId,bounds:{windowState:'normal'}})}catch{/* Some window managers have no native window bounds. */}finally{await session.detach()}
    return this.status()
  }
  async signedIn(){
    const cookies=await this.browser?.contexts()[0]?.cookies('https://www.google.com').catch(()=>[]) || []
    return cookies.some(cookie=>SESSION_NAMES.has(cookie.name) && /(^|\.)google\.com$/.test(cookie.domain))
  }
  async prepare(signal:AbortSignal,progress:(message:string)=>void){
    while(this.searching)await pause(50,signal)
    signal.throwIfAborted();await this.open();signal.throwIfAborted()
    if(await this.signedIn())return
    const message='Sign in to Google in the normal Chrome window. Close that window, then click Connect saved sign-in in MamaLead to continue the scan.'
    progress(message)
    try{
      const deadline=Date.now()+5*60*1000
      while(Date.now()<deadline){
        signal.throwIfAborted()
        if(this.state.phase==='error')throw new Error(this.state.message)
        if(this.state.phase==='ready' && await this.signedIn())return
        await pause(750,signal)
      }
      throw new Error('Google sign-in is still needed. Finish signing in, close Chrome and connect, then retry the scan.')
    }catch(error){this.emit(signal.aborted?this.state.phase:'error',signal.aborted?'Scan stopped. You can finish signing in and connect before the next scan.':error instanceof Error?error.message:String(error));throw error}
  }
  async search(query:string,signal:AbortSignal,progress:(message:string)=>void=()=>{}):Promise<{hits:OrganicSearchHit[];error:string|null}>{
    if(this.searching)throw new Error('MamaLead Chrome is already checking another business. Wait for that scan or stop it first.')
    if(!this.browser?.isConnected() || !this.page || this.page.isClosed())throw new Error('MamaLead Chrome was closed. Open it and retry the scan.')
    this.searching=true
    const page=this.page
    let stopping:Promise<unknown>|undefined
    const stop=()=>{stopping=page.context().newCDPSession(page).then(async session=>{try{await session.send('Page.stopLoading')}finally{await session.detach()}}).catch(()=>undefined)}
    signal.addEventListener('abort',stop,{once:true})
    try{
      signal.throwIfAborted();this.emit('searching',`Searching Google: ${query}`)
      await page.goto('https://www.google.com/search?'+new URLSearchParams({q:query,hl:'en',num:'10'}),{waitUntil:'domcontentloaded',timeout:20000}).catch(error=>{if(!/Timeout/.test(String(error)))throw error})
      let deadline=Date.now()+12000,waiting=false
      for(;;){
        signal.throwIfAborted()
        if(page.isClosed())throw new Error('MamaLead Chrome was closed. Open it and retry the scan.')
        if(new URL(page.url()).hostname==='accounts.google.com'){
          rmSync(this.readyFile,{force:true})
          throw new Error('Google sign-in needs to be renewed. Stop this scan and use Sign in to Google to open the normal sign-in window.')
        }
        const result=await readGoogleResults(page)
        if(result.challenge){
          if(!waiting){waiting=true;deadline=Date.now()+5*60*1000;const message='Google needs your attention. Complete the sign-in, consent or verification in MamaLead Chrome; the scan will resume.';this.emit('verification',message);progress(message);await page.bringToFront()}
        }else{
          if(waiting){waiting=false;deadline=Date.now()+12000;this.emit('searching','Google check completed. Reading results…');progress('Google check completed. Reading results…')}
          const current=new URL(page.url())
          if(current.hostname==='www.google.com' && current.pathname==='/search' && current.searchParams.get('q')===query){
            if(result.hits.length || result.empty){this.emit('ready','Search read. Checking the linked public sources…');return {hits:result.hits,error:null}}
          }
        }
        if(Date.now()>deadline)throw new Error(waiting?'Google verification was not completed. Finish the check and retry.':'Google results could not be read. Open MamaLead Chrome, check the search page, then retry.')
        await pause(500,signal)
      }
    }catch(error){
      if(signal.aborted){this.emit('ready','Scan stopped. Your Chrome profile stays saved.');throw new DOMException('Scan stopped','AbortError')}
      const message='MamaLead Chrome: '+(error instanceof Error?error.message:String(error));this.emit('error',message);throw new Error(message)
    }finally{signal.removeEventListener('abort',stop);await stopping;this.searching=false}
  }
  async close(){
    this.closing=true
    const browser=this.browser;this.browser=null;this.page=null
    if(browser?.isConnected()){
      try{const session=await browser.newBrowserCDPSession();await session.send('Browser.close')}catch{/* Chrome may already be closed. */}
    }
    if(!browser)this.child?.kill()
    this.child=null
    // A manual authentication window belongs to the user; quitting MamaLead leaves it alone.
    this.emit('closed','MamaLead Chrome is closed. Your sign-in stays in its saved profile.')
  }
}
