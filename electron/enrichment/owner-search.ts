import {decodePublishedEmailHtml,extractPublishedEmails,extractPeople,stripContactCodeExamples} from './email-extractor'
import {locationForLead,searchOrganicLive} from './dataforseo'
import {isBusinessOwner,ownerEmail,ownerIdentityKey} from './owner-contact'
import {contactFindingsFromHtml,isUsablePerson,ownerBelongsToBusiness,ownerNameOutsideTestimonials,type FoundPerson} from './website'
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
async function readPage(url:string,signal:AbortSignal,ownHost=''){
 try{
  const response=await fetch(url,{signal:AbortSignal.any([signal,AbortSignal.timeout(ownHost && hostOf(url)===ownHost?8500:4500)]),headers:{accept:'text/html,application/xhtml+xml'}})
  if(!response.ok || /^(?:image|audio|video)\/|application\/(?:pdf|octet-stream|zip)/i.test(response.headers.get('content-type') ?? ''))return null
  const html=stripContactCodeExamples(decodePublishedEmailHtml((await response.text()).slice(0,2_000_000))),result={url:response.url || url,html,text:plain(html),at:Date.now()}
  return result
 }catch{return null}
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
  const contact=/contact|faq|team|leadership|founder|about|biograph|consulting|help-us|your-input|thank-you/i.test(hit.url+' '+hit.title)
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
 return Boolean(host && (proof.html.includes('://'+host) || proof.html.includes('://www.'+host) || brand.length>=6 && normal(proof.text).replace(/[^a-z0-9]/g,'').includes(brand)))
}
function publishedMail(page:PublicPage,lead:Lead,owner:{fullName:string},ownerProof?:PublicPage):string{
 const businessHost=hostOf(lead.website)
 if(!businessHost){const scope=namedBusinessScope(page,lead,owner);if(!scope)return '';page=scope}
 const own=Boolean(businessHost) && hostOf(page.url)===businessHost
 const relatedOwner=Boolean(ownerProof && sameOwnerProof(ownerProof,lead,owner) && referencesOtherBusiness(ownerProof,page.url))
 if(!own && !relatedOwner && (!normal(page.text).includes(normal(owner.fullName)) || !aboutCompany(lead,page.html)))return ''
 const mailto=Array.from(page.html.matchAll(/href\s*=\s*["']mailto:([^"'?<>\s]+)/gi),match=>{try{return decodeURIComponent(decode(match[1]))}catch{return ''}})
 const emails=[...new Set([...extractPublishedEmails(page.text),...mailto])].filter(email=>ownerEmail(owner.fullName,email))
 const names=ownerIdentityKey(owner.fullName).split(' ').filter(name=>name.length>=3)
 const matching=emails.filter(email=>{
  if(own || Boolean(businessHost) && !relatedOwner && email.split('@')[1]===businessHost)return true
  const local=email.split('@')[0].replace(/[^a-z]/g,'')
  return names.length>=2 && names.every(name=>local.includes(name))
 })
 return matching.length===1?matching[0].toLowerCase():''
}

/** An explicit indexed contact is a weaker source than a readable live page. Never infer
 * addresses from patterns, masked mailboxes, or a namesake at a different business. */
function indexedOwnerMail(hit:PublicSearchHit,lead:Lead,owner:{fullName:string},proof?:PublicPage):string{
 const host=hostOf(lead.website),name=ownerIdentityKey(owner.fullName)
 if(!host || !proof || !isPublicSourceUrl(hit.url))return ''
 const established=contactFindingsFromHtml(proof.html,proof.url).people.some(person=>ownerIdentityKey(person.fullName)===name && isBusinessOwner(person.title))
 if(!established || !ownerBelongsToBusiness(proof.html,lead.website,owner.fullName,proof.url))return ''
 const description=decode(hit.description),context=normal(description)
 if(!normal(hit.title).includes(normal(owner.fullName)) || !context.includes(normal(owner.fullName)))return ''
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
