import {decodePublishedEmailHtml,extractPublishedEmails,extractPeople,stripContactCodeExamples} from './email-extractor'
import {locationForLead,searchOrganicLive} from './dataforseo'
import {isBusinessOwner,ownerEmail,ownerIdentityKey} from './owner-contact'
import {readableHtml,contactFindingsFromHtml,isUsablePerson,ownerBelongsToBusiness,ownerNameOutsideTestimonials,type FoundPerson} from './website'
import {isPublicSourceUrl,searchPublicSources,type PublicSearchHit} from './public-search'
import {parse,serialize,type DefaultTreeAdapterMap} from 'parse5'
import {parseAddress} from '../scraper/location'
import {discoverOwnerContactPages} from './owner-sitemap'
import {discoverOwnerStoryPages} from './owner-story'

type Lead={name:string;website:string;area?:string;address?:string}
export type OwnerEmailSource={fullName:string;email:string;source:string;website:string}
export type OwnerPageCache=Map<string,ReturnType<typeof readPage>>
type Options={key?:string;signal?:AbortSignal;knownSources?:OwnerEmailSource[];scannedPages?:string[];pageCache?:OwnerPageCache;searchWeb?:(query:string,signal?:AbortSignal)=>Promise<PublicSearchHit[]>}
const decode=(text:string)=>text.replace(/&quot;/g,'"').replace(/&apos;|&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&')
const plain=(html:string)=>decode(html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi,' ').replace(/<[^>]+>/g,' ')).replace(/\s+/g,' ')
const normal=(value:string)=>value.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
const mentionsOwner=(text:string,name:string)=>(' '+ownerIdentityKey(text)+' ').includes(' '+ownerIdentityKey(name)+' ')
const queryOwnerName=(name:string)=>name.split(/\s+/).filter(word=>!/^([a-z]|mr|mrs|ms|dr|prof)\.?$/i.test(word)).join(' ')
const hostOf=(url:string)=>{try{return new URL(url).hostname.replace(/^www\./i,'').toLowerCase()}catch{return ''}}
const mentionsWebsite=(html:string,host:string)=>new RegExp(`(?:^|[^a-z0-9_.-])(?:www\\.)?${host.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}(?=$|[^a-z0-9_.-])`,'i').test(html)
// Leave room for source verification after a slower completed provider response. Successful
// lookups still return immediately; this is a ceiling, never a delay before showing results.
const budget=(signal?:AbortSignal)=>AbortSignal.any([...(signal?[signal]:[]),AbortSignal.timeout(30_000)])
const phrase=(value:string)=>normal(value).replace(/&/g,' and ').replace(/[^\p{L}\p{N}]+/gu,' ').replace(/\s+/g,' ').trim()
const businessName=(lead:Lead)=>phrase(lead.name).replace(/\s+(?:ltd|limited|llc|inc|incorporated)$/,'').trim()
const locality=(lead:Lead)=>parseAddress(lead.address || '').area || parseAddress(lead.area || '').area
// Quote domains so search engines do not replace a less familiar brand with a similarly named
// company (for example MamaLead/Marmalead). A different company's founder is never a fallback.
const searchIdentity=(lead:Lead)=>hostOf(lead.website)?`"${hostOf(lead.website)}"`:[lead.name.trim(),locality(lead)].filter(Boolean).join(' ')
// Keep the domain for precise free discovery. A brand query can find a press release or
// register that names the company but never spells out its domain; affiliation is still
// verified on the source page before accepting the owner.
const searchBrand=(lead:Lead)=>{
 const host=hostOf(lead.website)
 const name=lead.name.trim().replace(/^https?:\/\//i,'').replace(/^www\./i,'').replace(/\/$/,'')
 return (host && (!name || name.toLowerCase()===host)?host.split('.')[0]:name).replace(/["\r\n]/g,' ').trim()
}

function aboutCompany(lead:Lead,value:string,requirePlace=true):boolean{
 const text=normal(value),host=hostOf(lead.website)
 if(host && text.includes(host))return true
 if(!host){
  const company=businessName(lead),place=phrase(locality(lead)),context=' '+phrase(plain(value))+' '
  return company.length>=4 && context.includes(' '+company+' ') && (!requirePlace || !place || context.includes(' '+place+' '))
 }
 const brand=normal(lead.name.includes('.')?host.split('.')[0]:lead.name).replace(/\s+/g,' ').trim()
 return brand.length>=4 && (' '+phrase(plain(value))+' ').includes(' '+phrase(brand)+' ')
}
async function readPage(url:string,signal:AbortSignal,ownHost='',failed?:(error:unknown)=>void){
 try{
  const response=await fetch(url,{signal:AbortSignal.any([signal,AbortSignal.timeout(ownHost && hostOf(url)===ownHost?8500:4500)]),headers:{accept:'text/html,application/xhtml+xml'}})
  if(!response.ok || /^(?:image|audio|video)\/|application\/(?:pdf|octet-stream|zip)/i.test(response.headers.get('content-type') ?? ''))return null
  // Hydration payloads, executable scripts and CSS are not published contact evidence.
  // Excluding them avoids repeatedly parsing megabytes of framework data; keep JSON-LD.
  const source=(await response.text()).slice(0,2_000_000).replace(/<(script|style)\b([^>]*)>[\s\S]*?<\/\1>/gi,(block,tag,attrs)=>tag.toLowerCase()==='script' && /type\s*=\s*["']application\/ld\+json["']/i.test(attrs)?block:'')
  const html=stripContactCodeExamples(decodePublishedEmailHtml(source)),result={url:response.url || url,html,text:readableHtml(html),at:Date.now()}
  return result
 }catch(error){failed?.(error);return null}
}
/** A source is revalidated once per lookup, even when both indexes return the same URL. */
function pageReader(signal:AbortSignal,ownHost='',pages:OwnerPageCache=new Map()){
 return (url:string)=>{
  let key=url
  try{const parsed=new URL(url);parsed.hash='';key=parsed.href}catch{/* readPage rejects malformed URLs */}
  let page=pages.get(key)
  if(!page){page=readPage(key,signal,ownHost);pages.set(key,page)}
  return page
 }
}
/** Read the business's own evidence before unrelated profile indexes consume the page limit. */
function preferredHits(hits:PublicSearchHit[],host:string):PublicSearchHit[]{
 const score=(hit:PublicSearchHit)=>{
  const own=Boolean(host) && hostOf(hit.url)===host
  const contact=/contact|faq|team|company|who-we-are|leadership|founder|about|biograph|consulting|help-us|your-input|thank-you/i.test(hit.url+' '+hit.title)
  const mailbox=/[\w.+-]+@[\w.-]+\.[a-z]{2,}|\b(?:at|dot)\b/i.test(hit.description) && /email|contact|@/i.test(hit.description)
  return (own?100:0)+(contact?12:0)+(mailbox?8:0)
 }
 return [...hits].sort((a,b)=>score(b)-score(a))
}
async function publicHits(query:string,options:Options,signal:AbortSignal):Promise<PublicSearchHit[]>{
 if(options.key)return searchPublicSources(query,signal).catch(error=>{if(signal.aborted)throw error;return []})
 let failure:unknown
 if(options.searchWeb){try{const hits=await options.searchWeb(query,signal);if(hits.length)return hits}catch(error){if(signal.aborted)throw error;failure=error}}
 const hits=await searchPublicSources(query,signal)
 if(!hits.length && failure)throw failure
 return hits
}
type PublicPage=NonNullable<Awaited<ReturnType<typeof readPage>>>
function exactBusinessLabel(html:string,lead:Lead):boolean{
 let matched=false
 const visit=(node:DefaultTreeAdapterMap['node'])=>{
  if('tagName' in node){
   const labels=node.attrs.filter(attr=>attr.name==='class'||attr.name==='itemprop').map(attr=>attr.value).join(' ')
   if((/^h[1-6]$/.test(node.tagName) || /^(?:name)$|(?:business|company|listing)[-_ ](?:name|title)/i.test(labels)) && businessName({...lead,name:plain(serialize(node))})===businessName(lead))matched=true
  }
  if('childNodes' in node)node.childNodes.forEach(visit)
 }
 visit(parse(html));return matched
}
/** Without a website, the business, place and owner must be evidenced in one public listing. */
function namedBusinessScope(page:PublicPage,lead:Lead,owner:{fullName:string}):PublicPage|null{
 if(!locality(lead))return null
 const wanted=' '+phrase(owner.fullName)+' '
 const cards:{node:DefaultTreeAdapterMap['element'];html:string;text:string}[]=[]
 const visit=(node:DefaultTreeAdapterMap['node'])=>{
  if('tagName' in node){
   const labels=node.attrs.filter(attr=>attr.name==='class'||attr.name==='id').map(attr=>attr.value).join(' ')
   if(/^(?:article|section|li)$/.test(node.tagName) || node.tagName==='div' && /(?:^|[-_\s])(?:card|listing|business|profile|company|provider)(?:[-_\s]|$)/i.test(labels)){
    const html=serialize(node),text=plain(html)
    if((' '+phrase(text)+' ').includes(wanted))cards.push({node,html,text})
   }
  }
  if('childNodes' in node)node.childNodes.forEach(visit)
 }
 visit(parse(page.html))
 const inner=cards.filter(card=>!cards.some(other=>{
  if(other===card)return false
  let parent=other.node.parentNode
  while(parent){if(parent===card.node)return true;parent='parentNode' in parent?parent.parentNode:null}
  return false
 }))
 const candidates=inner.length?inner:[{html:page.html,text:page.text}]
 const matched=candidates.find(card=>card.text.length<=2500 && aboutCompany(lead,card.text) && exactBusinessLabel(card.html,lead) && ownerNameOutsideTestimonials(card.html,owner.fullName))
 return matched?{...page,html:matched.html,text:matched.text}:null
}
function sameOwnerProof(page:PublicPage,lead:Lead,owner:{fullName:string}):boolean{
 return Boolean(hostOf(lead.website)) && hostOf(page.url)===hostOf(lead.website) && contactFindingsFromHtml(page.html,page.url).people.some(person=>isBusinessOwner(person.title) && ownerIdentityKey(person.fullName)===ownerIdentityKey(owner.fullName))
}
function referencesOtherBusiness(proof:PublicPage,sourceUrl:string):boolean{
 const host=hostOf(sourceUrl),brand=host.split('.')[0].replace(/[^a-z0-9]/g,'')
 // A link to one LinkedIn profile does not establish every person on LinkedIn.
 if(/(?:^|\.)(?:linkedin\.com|facebook\.com|instagram\.com|twitter\.com|x\.com|youtube\.com|medium\.com|substack\.com)$/.test(host)){
  const canonical=(value:string)=>{try{const url=new URL(decode(value),proof.url);return hostOf(url.href)+url.pathname.replace(/\/+$/,'')}catch{return ''}}
  const target=canonical(sourceUrl)
  return Boolean(new URL(sourceUrl).pathname.replace(/\//g,'')) && [...proof.html.matchAll(/href\s*=\s*["']([^"']+)["']/gi)].some(match=>canonical(match[1])===target)
 }
 return Boolean(host && (proof.html.includes('://'+host) || proof.html.includes('://www.'+host) || brand.length>=6 && normal(proof.text).replace(/[^a-z0-9]/g,'').includes(brand)))
}
/** A personal website can publish a mailbox such as website@firstname.tld. It is
 * not a company inbox: require independent company ownership proof, the person's
 * exact page identity, and their own first-person statement linking this business. */
function personalWebsiteMail(page:PublicPage,lead:Lead,owner:{fullName:string},proof?:PublicPage):string{
 const host=hostOf(page.url),company=hostOf(lead.website),name=ownerIdentityKey(owner.fullName)
 if(!proof || !company || host===company || !mentionsWebsite(page.html,company))return ''
 if(!name.split(' ').some(part=>part.length>=4 && host.split('.')[0].includes(part)))return ''
 const headings=[...page.html.matchAll(/<(title|h1)\b[^>]*>([\s\S]*?)<\/\1>/gi)]
 if(!headings.some(match=>ownerIdentityKey(plain(match[2]))===name))return ''
 const brand=company.split('.')[0].replace(/[^a-z0-9]/g,'')
 const selfAuthored=[...page.html.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)].some(match=>{
  const text=plain(match[1])
  return /\bI\b[^.!?]{0,45}\b(?:built|build|created|founded|started|run)\b/i.test(text) && normal(text).replace(/[^a-z0-9]/g,'').includes(brand)
 })
 if(!selfAuthored)return ''
 const mailto=[...page.html.matchAll(/href\s*=\s*["']mailto:([^"'?<>\s]+)/gi)].map(match=>{try{return decodeURIComponent(decode(match[1])).toLowerCase()}catch{return ''}})
 const emails=[...new Set([...extractPublishedEmails(page.text),...mailto])].filter(email=>email.split('@')[1]===host && !/^(?:support|sales|privacy|legal|billing|no.?reply)@/i.test(email))
 return emails.length===1 && sameOwnerProof(proof,lead,owner)?emails[0]:''
}
function publishedMail(page:PublicPage,lead:Lead,owner:{fullName:string},ownerProof?:PublicPage,preferFirst=false):string{
 const personal=personalWebsiteMail(page,lead,owner,ownerProof)
 if(personal)return personal
 const businessHost=hostOf(lead.website)
 if(!businessHost){const scope=namedBusinessScope(page,lead,owner);if(!scope)return '';page=scope}
 const own=Boolean(businessHost) && hostOf(page.url)===businessHost
 const mailto=Array.from(page.html.matchAll(/href\s*=\s*["']mailto:([^"'?<>\s]+)/gi),match=>{try{return decodeURIComponent(decode(match[1]))}catch{return ''}})
 const emails=[...new Set([...extractPublishedEmails(page.text),...mailto])].filter(email=>ownerEmail(owner.fullName,email))
 if(!emails.length)return ''
 let relatedOwner=false
 if(!own && !(mentionsOwner(page.text,owner.fullName) && aboutCompany(lead,page.html))){
  relatedOwner=Boolean(ownerProof && referencesOtherBusiness(ownerProof,page.url) && sameOwnerProof(ownerProof,lead,owner))
  if(!relatedOwner)return ''
 }
 const names=ownerIdentityKey(owner.fullName).split(' ').filter(name=>name.length>=3)
 const matching=emails.filter(email=>{
  if(own || Boolean(businessHost) && !relatedOwner && email.split('@')[1]===businessHost)return true
  const local=email.split('@')[0].replace(/[^a-z]/g,'')
  return names.length>=2 && names.every(name=>local.includes(name))
 })
 return matching.length===1 || preferFirst && matching.length>0 ? matching[0].toLowerCase() : ''
}

export type OwnerContactResult = {people:FoundPerson[];searches:number;retries:number;error:string|null}
type OwnerContactOptions = {
 key?:string;signal?:AbortSignal;
 timeoutMs?:number;
 activeBudgetMs?:number;
 /** Inspect the supplied site before querying a search engine. */
 websiteFirst?:boolean;
 onStep?:(step:number,query:string,retrying?:boolean,phase?:'owner'|'email')=>void;
 onSources?:(step:number,checked:number,total:number)=>void;
 search?:(query:string,signal:AbortSignal,remainingMs?:number)=>Promise<{hits:import('./dataforseo').OrganicSearchHit[];error:string|null;waitingMs?:number}>;
}

export function ownerContactQuery(lead:Lead,ownerName=''):string{
 const company=hostOf(lead.website) || [lead.name,locality(lead)].filter(Boolean).join(' ').replace(/["\r\n]/g,' ').trim()
 return ownerName ? `"${queryOwnerName(ownerName)}" "${searchBrand(lead) || company}" email address` : `"${company}" founder owner email address`
}

/** Adaptive, source-verified discovery. Stop on a match; otherwise use distinct targeted
 * queries within a short active-work budget. Human Google checks do not use that budget. */
export async function findOwnerContact(lead:Lead,options:OwnerContactOptions={}):Promise<OwnerContactResult>{
 const result:OwnerContactResult={people:[],searches:0,retries:0,error:null}
 if(!lead.name.trim() && !hostOf(lead.website))return {...result,error:'This business has no usable name or website.'}
 if(!options.key?.trim() && !options.search)return {...result,error:'Owner search is not configured. Add the DataForSEO credential in Settings → Account.'}
 const sources=new AbortController()
 const signal=AbortSignal.any([...(options.signal?[options.signal]:[]),sources.signal,AbortSignal.timeout(options.timeoutMs ?? 60_000)])
 const started=Date.now(),activeBudgetMs=options.activeBudgetMs ?? 25_000
 let waitingMs=0,linkedReads=0
 const remainingMs=()=>Math.max(0,activeBudgetMs-(Date.now()-started-waitingMs))
 const checkBudget=()=>{signal.throwIfAborted();if(remainingMs()<=0)throw new Error('Owner lookup reached its time limit. Saved findings are kept; retry this business to finish.')}
 const host=hostOf(lead.website),cache:OwnerPageCache=new Map(),pages:PublicPage[]=[],completedReads=new Set<PublicPage>(),unreadable=new Set<string>(),slowHosts=new Map<string,number>()
 let websiteMissing=false
 const read=(url:string,checkWebsite=false)=>{
  let value=cache.get(url)
  if(!value){checkBudget();value=readPage(url,AbortSignal.any([signal,AbortSignal.timeout(Math.max(1,Math.floor(Math.min((slowHosts.get(hostOf(url)) || 0)>=2?1000:3500,remainingMs()))))]),host,error=>{
   const failure=error as {code?:string;cause?:{code?:string}}
   if(checkWebsite && /^(?:ENOTFOUND|EAI_NONAME)$/.test(failure.cause?.code || failure.code || ''))websiteMissing=true
   if(!signal.aborted && ((error as Error)?.name==='TimeoutError' || /TIMEDOUT|TIMEOUT/.test(failure.cause?.code || failure.code || '')))slowHosts.set(hostOf(url),(slowHosts.get(hostOf(url)) || 0)+1)
  }).then(page=>{if(!page)unreadable.add(url);else{completedReads.add(page);if(page.url!==url)cache.set(page.url,Promise.resolve(page))}return page});cache.set(url,value)}
  return value
 }
 const searched=new Set<string>()
 const search=async(query:string,phase:'owner'|'email')=>{
  checkBudget();searched.add(query);const step=++result.searches;options.onStep?.(step,query,false,phase)
  const response=await (options.search?options.search(query,signal,remainingMs()):searchOrganicLive(options.key!,query,locationForLead(lead),AbortSignal.any([signal,AbortSignal.timeout(Math.max(1,Math.floor(remainingMs())))]),{includeAiOverview:step===1,recover:()=>{
   if(result.retries>=1)return false
   result.retries++;options.onStep?.(step,query,true,phase);return true
  }}))
  if('waitingMs' in response && typeof response.waitingMs==='number')waitingMs+=Math.max(0,Math.min(response.waitingMs,Date.now()-started-waitingMs))
  signal.throwIfAborted()
  if(response.error)throw new Error(response.error)
  return response.hits
 }
 const candidates=(hits:import('./dataforseo').OrganicSearchHit[])=>{
  const ranked=preferredHits([...new Map(hits.filter(hit=>isPublicSourceUrl(hit.url)).map(hit=>[hit.url,hit])).values()],host)
  const bonus=(hit:PublicSearchHit)=>{
   const owner=owners.values().next().value?.person
   const namedEmail=extractPublishedEmails(hit.description).some(email=>owner?Boolean(ownerEmail(owner.fullName,email)):email.split('@')[1]===host && !/^(?:info|hello|contact|support|sales|office|admin|team|help|notice|privacy|legal|billing|no.?reply)(?:[._-]|@)/i.test(email))
   const identity=hostOf(hit.url)===host && /\/(?:about(?:-us)?|our-team|team|company|who-we-are|leadership|founders?)(?:\/|$|\?)/i.test(new URL(hit.url).pathname)
   const founderSnippet=extractPeople(hit.description).some(person=>isBusinessOwner(person.title) && isUsablePerson(person.fullName,person.title))
   const named=Boolean(owner && mentionsOwner(hit.title+' '+hit.description,owner.fullName))
   const personal=named && ownerIdentityKey(owner!.fullName).split(' ').some(part=>part.length>=4 && hostOf(hit.url).split('.')[0].includes(part))
   const path=new URL(hit.url).pathname
   const listing=/\/(?:search|tags?|category|categories)(?:\/|$)/i.test(path)
   const lowValue=/\b(?:email format|email pattern|customer support|careers|jobs)\b/i.test(hit.title)
   return (namedEmail?700:0)+(owner && named?250:0)+(owner && personal?300:0)+(!owner && identity?500:0)+(!owner && founderSnippet?300:0)-(listing&&!namedEmail?500:0)-(lowValue?250:0)-(slowHosts.has(hostOf(hit.url))?600:0)
  }
  // A timing-out domain must not fill every slot and starve reachable independent sources.
  const perHost=new Map<string,number>()
  return ranked.sort((a,b)=>bonus(b)-bonus(a)).filter(hit=>{
   const site=hostOf(hit.url),count=perHost.get(site) || 0
   if(slowHosts.has(site) && count>=2)return false
   perHost.set(site,count+1);return true
  }).slice(0,6)
 }
 const owners=new Map<string,{person:FoundPerson;proof:PublicPage}>()
 const checkedMail=new Map<string,string>(),linkedPages=new Set<string>()
 const learn=(page:PublicPage)=>{
  // Menu labels beside marketing copy cannot establish an owner identity.
  const html=page.html.replace(/<nav\b[^>]*>[\s\S]*?<\/nav>/gi,'')
  page={...page,html,text:readableHtml(html)}
  const own=Boolean(host) && hostOf(page.url)===host
  if(!own && (!aboutCompany(lead,page.html) || host && !mentionsWebsite(page.html,host)))return
  const extracted=[...contactFindingsFromHtml(page.html,page.url).people,...extractPeople(page.text).map(person=>({...person,evidence:page.url,linkedinUrl:''}))]
  for(const person of extracted){
   if(!isBusinessOwner(person.title) || !isUsablePerson(person.fullName,person.title) || !ownerNameOutsideTestimonials(page.html,person.fullName))continue
   if(host ? !ownerBelongsToBusiness(page.html,lead.website,person.fullName,page.url) : !namedBusinessScope(page,lead,person))continue
   const key=ownerIdentityKey(person.fullName)
   if(!owners.has(key))owners.set(key,{person:{...person,email:'',phone:'',linkedinUrl:'',evidence:page.url},proof:page})
  }
  if(!result.people.length && owners.size)result.people=[owners.values().next().value!.person]
 }
 const match=(hits:import('./dataforseo').OrganicSearchHit[],only?:{person:FoundPerson;proof:PublicPage})=>{
  for(const owner of only?[only]:owners.values()){
   for(const page of pages){
    const key=ownerIdentityKey(owner.person.fullName)+'|'+page.url
    if(!checkedMail.has(key))checkedMail.set(key,publishedMail(page,lead,owner.person,owner.proof,true))
    const email=checkedMail.get(key)!
    if(email)return {...owner.person,email,evidence:page.url,emailEvidence:ownerEmail(owner.person.fullName,email)?'page' as const:'personal-page' as const}
   }
   for(const hit of hits){
    // Never turn an AI-generated answer into a published or indexed mailbox.
    if(hit.aiOverview || !unreadable.has(hit.url))continue // Readable sources supersede old snippets, including redirects.
    const email=indexedOwnerMail(hit,lead,owner.person,owner.proof)
    if(email)return {...owner.person,email,evidence:hit.url,emailEvidence:'search-index' as const}
   }
  }
  return null
 }
 const matchCompletedReads=()=>{
  for(const page of completedReads)if(!pages.some(prior=>prior.url===page.url)){pages.push(page);if(!owners.size)learn(page)}
  return match([])
 }
 const inspect=async(hits:import('./dataforseo').OrganicSearchHit[],step:number,only?:{person:FoundPerson;proof:PublicPage},stopAfterIdentity=false)=>{
  const urls=candidates(hits)
  const hadOwner=owners.size>0
  let checked=0
  options.onSources?.(step,0,urls.length)
  for(let i=0;i<urls.length;i+=3){
   checkBudget()
   // Process whichever source finishes first; a stalled first link must not block
   // a verified owner/email already available from another source in the batch.
   const pending=new Map(urls.slice(i,i+3).map((hit,index)=>[index,read(hit.url).then(page=>({index,page}))]))
   while(pending.size){
    const {index,page}=await Promise.race(pending.values());pending.delete(index)
    checkBudget()
    if(page && !pages.some(prior=>prior.url===page.url)){pages.push(page);if(!owners.size)learn(page)}
    options.onSources?.(step,++checked,urls.length)
    const found=match(hits,only);if(found)return found
    // Once identity is established, targeted email results are more useful than
    // exhausting general identity pages. Pending reads remain cached for reuse.
    if(stopAfterIdentity && !hadOwner && owners.size)return null
   }
  }
  return null
 }
 const followContacts=async()=>{
  if(!host || linkedReads>=3)return null
  const links=new Map<string,import('./dataforseo').OrganicSearchHit>()
  for(const page of pages){
   if(hostOf(page.url)!==host || linkedPages.has(page.url))continue
   linkedPages.add(page.url)
   const visit=(node:DefaultTreeAdapterMap['node'])=>{
    if('tagName' in node && node.tagName==='a'){
     const href=node.attrs.find(a=>a.name==='href')?.value
     if(href)try{
      const url=new URL(decode(href),page.url);url.hash=''
      const title=plain(serialize(node))
      const contactPath=/\/(?:contact(?:-us)?|about(?:-us)?|our-team|team|company|who-we-are|founder|leadership|biograph)(?:[/-]|$)/i.test(url.pathname)
      const contactLabel=/^(?:about(?: us| [\w ]+)?|contact(?: us)?|our (?:team|company)|team|company|who we are|leadership|founders?)$/i.test(title.trim())
      if(hostOf(url.href)===host && isPublicSourceUrl(url.href) && !cache.has(url.href) && (contactPath || contactLabel))links.set(url.href,{url:url.href,title,description:''})
     }catch{/* Ignore malformed/non-web links. */}
    }
    if('childNodes' in node)node.childNodes.forEach(visit)
   }
   visit(parse(page.html))
  }
  const next=candidates([...links.values()]).slice(0,3-linkedReads);linkedReads+=next.length
  return next.length?inspect(next,result.searches):null
 }
 try{
  if(options.websiteFirst!==false && host && isPublicSourceUrl(lead.website)){
   options.onSources?.(0,0,1)
   const home=await read(lead.website,true)
   checkBudget()
   if(websiteMissing)return {...result,error:'The website '+host+' could not be found. Check the website address and spelling, then import the corrected URL.'}
   if(home){pages.push(home);learn(home)}
   options.onSources?.(0,1,1)
   const direct=match([]) || await followContacts()
   if(direct)return {...result,people:[direct]}
  }
  const company=host || [lead.name,locality(lead)].filter(Boolean).join(' ').replace(/["\r\n]/g,' ').trim()
  const identityQueries=[ownerContactQuery(lead),...(host?[`site:${host} (founder OR owner OR "co-founder")`]:[]),`"${company}" founder owner`,`"${company}" about leadership founder`]
  while(result.searches<6){
   checkBudget()
   const completed=matchCompletedReads()
   if(completed)return {...result,people:[completed]}
   const owner=owners.values().next().value
   const name=owner?queryOwnerName(owner.person.fullName).replace(/["\r\n]/g,' ').trim():''
   const queries=owner?[
    ownerContactQuery(lead,name),
    `"${name}" "${company}" email address`,
    `"${name}" "${searchBrand(lead)}" email contact`,
    `"${name}" "${searchBrand(lead)}" Gmail`,
    ...(host?[`site:${host} "${name}" (email OR contact)`]:[]),
   ]:identityQueries
   const query=queries.find(q=>!searched.has(q))
   if(!query)break
   const hits=await search(query,owner?'email':'owner')
   const found=matchCompletedReads() || await inspect(hits,result.searches,owner,!owner) || await followContacts()
   if(found)return {...result,people:[found]}
  }
  checkBudget()
  if(unreadable.size && !pages.length)throw new Error('Search results were found, but their source pages could not be read. Retry this business.')
  return result
 }catch(error){
  if(options.signal?.aborted)throw new DOMException('Enrichment cancelled','AbortError')
  return {...result,error:signal.aborted?'Owner search timed out. Retry this company.':error instanceof Error?error.message:'Owner search could not finish.'}
 }finally{sources.abort()}
}

/** An explicit indexed contact is a weaker source than a readable live page. Never infer
 * addresses from patterns, masked mailboxes, or a namesake at a different business. */
function indexedOwnerMail(hit:PublicSearchHit,lead:Lead,owner:{fullName:string},proof?:PublicPage):string{
 const host=hostOf(lead.website),name=ownerIdentityKey(owner.fullName)
 if(!host || !proof || !isPublicSourceUrl(hit.url))return ''
 const established=contactFindingsFromHtml(proof.html,proof.url).people.some(person=>ownerIdentityKey(person.fullName)===name && isBusinessOwner(person.title))
 if(!established || !ownerBelongsToBusiness(proof.html,lead.website,owner.fullName,proof.url))return ''
 const description=decode(hit.description)
 if(!mentionsOwner(description,owner.fullName))return ''
 // A company directory can use a generic page title. Its indexed excerpt must
 // explicitly associate the named owner with this business, not just list a mail.
 if(!mentionsOwner(hit.title,owner.fullName) && !(aboutCompany(lead,description) && /\b(?:owner|founder|proprietor)\b/i.test(description)))return ''
 if(!/\b(?:contact|email|e-mail|reach)\b/i.test(description) || /\b(?:example|sample|format|pattern|guess|former|previous|no longer)\b/i.test(description))return ''
 const emails=[...new Set(extractPublishedEmails(description).map(value=>ownerEmail(owner.fullName,value)).filter(value=>value && value.split('@')[1]===host))]
 return emails.length===1?emails[0]:''
}

/** Identify the owner on a verified public page when the business website names nobody. */
export async function findBusinessOwners(lead:Lead,options:Options={}):Promise<{people:FoundPerson[];error:string|null}>{
 const signal=budget(options.signal),host=hostOf(lead.website),identity=searchIdentity(lead),query=`${identity} founder owner`,read=pageReader(signal,host)
 if(!identity)return {people:[],error:'This saved business has no usable name or website.'}
 try{
  const verify=async(hits:PublicSearchHit[])=>{
   const candidates=preferredHits([...new Map(hits.filter(hit=>isPublicSourceUrl(hit.url) && (Boolean(host) && hostOf(hit.url)===host || aboutCompany(lead,`${hit.title} ${hit.description} ${hit.url}`,false))).map(hit=>[hit.url,hit])).values()],host).slice(0,6)
   for(let index=0;index<candidates.length && !signal.aborted;index+=3){
   const results=await Promise.all(candidates.slice(index,index+3).map(async hit=>{
   const page=await read(hit.url);if(!page || (hostOf(page.url)!==host && !aboutCompany(lead,page.html)))return []
   // A shared brand is insufficient: Tally forms and Tally accounting are different
   // businesses. External biographies must tie the person to this website explicitly.
   if(host && hostOf(page.url)!==host && !mentionsWebsite(page.html,host))return []
   const prose=extractPeople(page.text).filter(person=>isBusinessOwner(person.title) && isUsablePerson(person.fullName,person.title))
   const cards=contactFindingsFromHtml(page.html,page.url).people.filter(person=>isBusinessOwner(person.title) && isUsablePerson(person.fullName,person.title))
   return [...new Map([...cards,...prose.map(person=>({...person,evidence:page.url,linkedinUrl:''}))].map(person=>[normal(person.fullName),person])).values()].filter(person=>{
    if(hostOf(page.url)===host)return true
    const at=normal(page.text).indexOf(normal(person.fullName));return at>=0 && aboutCompany(lead,page.text.slice(Math.max(0,at-250),at+500))
   }).filter(person=>ownerNameOutsideTestimonials(page.html,person.fullName) && (!host || ownerBelongsToBusiness(page.html,lead.website,person.fullName,page.url))).map(person=>({...person,email:publishedMail(page,lead,person),phone:'',linkedinUrl:'',evidence:page.url}))
    .filter(person=>Boolean(host) || Boolean(namedBusinessScope(page,lead,person)))
   }))
   const people=[...new Map(results.flat().map(person=>[normal(person.fullName),person])).values()].slice(0,3)
   if(people.length)return people
   }
   return []
  }
  let people=await verify(await publicHits(query,options,signal))
  // A keyword match is only a discovery hint. Try the configured index when those pages do not
  // actually establish an owner, including when an index returns only an unhelpful homepage.
  if(!people.length && options.key && !signal.aborted){
   const paid=await searchOrganicLive(options.key,host && searchBrand(lead)?`"${searchBrand(lead)}" founder`:query,locationForLead(lead),signal)
   people=await verify(paid.hits)
   if(paid.error && !people.length)return {people:[],error:paid.error}
  }
  return {people,error:!people.length && signal.aborted?'Public owner search reached its time limit. Retry this website.':null}
 }catch(error){if(options.signal?.aborted)throw new DOMException('Enrichment cancelled','AbortError');return {people:[],error:signal.aborted?'Public owner search reached its time limit. Retry this website.':error instanceof Error?error.message:'Owner search could not finish.'}}
}

/** Snippets guide discovery; only the linked public page can establish a mailbox. */
export async function findOwnerEmail(lead:Lead,owner:{fullName:string;evidence?:string},options:Options={}):Promise<{email:string;source:string;error:string|null;emailEvidence?:'page'|'search-index'}>{
 const empty={email:'',source:'',error:null as string|null},signal=budget(options.signal),host=hostOf(lead.website),read=pageReader(signal,host,options.pageCache)
 const searchController=new AbortController(),searchSignal=AbortSignal.any([signal,searchController.signal])
 if(!searchIdentity(lead))return empty
 try{
  let ownerProof:PublicPage|undefined
  if(/^https?:\/\//i.test(owner.evidence ?? '')){const page=await read(owner.evidence!);if(page){ownerProof=page;const email=publishedMail(page,lead,owner);if(email)return {email,source:page.url,error:null}}}
  // Saved contacts are only discovery hints. Re-read their public source and require the current
  // founder bio to connect the companies; a matching name alone never shares an email.
  const known=(options.knownSources ?? []).filter(source=>ownerIdentityKey(source.fullName)===ownerIdentityKey(owner.fullName) && /^https?:\/\//i.test(source.source)).slice(0,3)
  if(ownerProof && known.length){
   const matches=await Promise.all(known.map(async source=>{if(!referencesOtherBusiness(ownerProof!,source.website))return null;const page=await read(source.source);if(!page)return null;const email=publishedMail(page,lead,owner,ownerProof);return email && email===source.email.toLowerCase()?{email,source:page.url,error:null}:null}))
   const unique=new Map(matches.filter((match):match is NonNullable<typeof match>=>Boolean(match)).map(match=>[match.email,match]));if(unique.size===1)return [...unique.values()][0]
  }
  const query=`"${owner.fullName}" ${searchIdentity(lead)} email address`
  let indexedMatch:{email:string;source:string;error:null;emailEvidence:'search-index'}|null=null
  const verify=async(hits:PublicSearchHit[],allowIndexed=false)=>{
   const candidates=preferredHits([...new Map(hits.filter(hit=>isPublicSourceUrl(hit.url) && (hostOf(hit.url)===host || normal(`${hit.title} ${hit.description}`).includes(normal(owner.fullName)))).map(hit=>[hit.url,hit])).values()],host).slice(0,6)
   // A public register may follow three official pages which contain no mailbox. Try the
   // second bounded batch only when the preferred sources have not produced a verified email.
   for(let index=0;index<candidates.length && !signal.aborted;index+=3){
    const matches=await Promise.all(candidates.slice(index,index+3).map(async hit=>{
     const page=await read(hit.url)
     if(!page){
      const email=allowIndexed?indexedOwnerMail(hit,lead,owner,ownerProof):''
      if(email && !indexedMatch)indexedMatch={email,source:hit.url,error:null,emailEvidence:'search-index'}
      return null
     }
     const email=publishedMail(page,lead,owner,ownerProof);return email?{email,source:page.url,error:null}:null
    }))
    const match=matches.find(Boolean);if(match)return match
   }
   return null
  }
  // Process independent sources as they finish. A slow sitemap or blocked free index must
  // not hold a completed provider result (or a published official email) behind it.
  const firstName=ownerIdentityKey(owner.fullName).split(' ')[0]
  const searches=[publicHits(query,options,searchSignal)]
  if(host && firstName?.length>=3)searches.push(searchPublicSources(`site:${host} "${firstName}" email`,searchSignal))
  const searchCount=searches.length
  if(host){
   const pageKey=(value:string)=>{try{const url=new URL(value);return hostOf(value)+url.pathname.replace(/\/$/,'')+url.search}catch{return value}}
   const scanned=new Set((options.scannedPages ?? []).map(pageKey))
   // URL normalization may have removed www even when the apex serves a different product.
   // Use the same-business origin actually reached by the verified owner biography.
   const website=ownerProof && hostOf(ownerProof.url)===host?new URL('/',ownerProof.url).href:lead.website
   searches.push(discoverOwnerContactPages(website,owner.fullName,searchSignal).then(urls=>urls.filter(url=>!scanned.has(pageKey(url))).map(url=>({url,title:'Official website page',description:''}))))
   searches.push(discoverOwnerStoryPages(website,owner,searchSignal,ownerProof?[ownerProof]:[]).then(urls=>urls.filter(url=>!scanned.has(pageKey(url))).map(url=>({url,title:'Official founder story',description:''}))))
  }
  let providerError:string|null=null
  if(options.key){
   // The owner is already identified. Do not require a company keyword in the index:
   // profile titles often contain only the person's name. A namesake at another company
   // still fails the affiliation check on the fetched source page in publishedMail.
   const paidQuery=`"${owner.fullName}" email`
   searches.push(searchOrganicLive(options.key,paidQuery,locationForLead(lead),searchSignal).then(paid=>{providerError=paid.error;return paid.hits}))
  }
  type Outcome={index:number;match:Awaited<ReturnType<typeof verify>>;error?:unknown}
  const pending=new Map<number,Promise<Outcome>>()
  searches.forEach((search,index)=>pending.set(index,search.then(hits=>verify(hits,Boolean(options.key) && index===searches.length-1)).then(match=>({index,match}),error=>({index,match:null,error}))))
  const failures=new Map<number,unknown>()
  while(pending.size){
   const result=await Promise.race(pending.values());pending.delete(result.index)
   signal.throwIfAborted()
   if(result.match)return result.match
   if(result.error)failures.set(result.index,result.error)
  }
  if(indexedMatch)return indexedMatch
  if(providerError)return {...empty,error:providerError}
  // Empty sitemap/story results are not successful search responses. Surface an index
  // outage only after trying the official sources, rather than calling it "not found".
  if(!options.key && Array.from({length:searchCount},(_,index)=>index).every(index=>failures.has(index)))throw failures.get(0)
  return empty
 }catch(error){if(options.signal?.aborted)throw new DOMException('Enrichment cancelled','AbortError');return {...empty,error:signal.aborted?'Public email search reached its time limit. Retry this website.':error instanceof Error?error.message:'Public email search could not finish.'}}
 finally{searchController.abort()}
}
