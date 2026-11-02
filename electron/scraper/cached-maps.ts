import type {Lead,ScrapeQuery} from './types'
import {leadId,type ProgressSink,type ScraperProvider} from './provider'
import {cacheKeyFor,IdentitySet,placeIdentity} from './cache-key'
import {mapsMessages} from './messages'
import {matchesWebsiteFilter} from '../enrichment/source-policy'
import {mapsBusinessRelevant} from './relevance'

export interface CacheEnrichment {
  scannedKinds?:('email'|'phone'|'social')[]
  emails:{value:string;source:string;score:number}[]
  phones:{value:string;source:string}[]
  socials:{platform:string;url:string;source?:string}[]
  address:string
  enrichedAt:string
}
export interface CachedPlace extends Omit<Lead,'id'|'provider'|'query'|'keyword'|'capturedAt'> {
  placeKey:string
  scrapedAt:string
  enrichment?:CacheEnrichment|null
}
export interface CacheLookup {
  enabled:boolean
  ttlDays?:number
  enrichTtlDays?:number
  paceFactor?:number
  warmBrowser?:boolean
  results?:{cacheKey:string;places:CachedPlace[];stale:number;exhausted:boolean}[]
}
export interface CacheDeps {
  enabled:boolean
  reservationId:string|null
  appVersion:string
  known:IdentitySet
  seeds:Map<string,CacheEnrichment>
  cachedIds?:Set<string>
  lookup:(body:unknown,signal:AbortSignal)=>Promise<CacheLookup|null>
  enqueue:(kind:'contribute'|'enrichment',body:unknown)=>void
  diagnostics:(runId:string,hits:number)=>void
  /** Injected only in unit tests; production pacing is abortable and at least 300ms. */
  sleep?:(ms:number,signal:AbortSignal)=>Promise<void>
}
export interface CacheInner extends ScraperProvider {
  skip?:(p:Partial<Lead>)=>boolean
  skipBudget?:number
  lastRunExhausted?:boolean
  prepare?:(query:ScrapeQuery,signal:AbortSignal)=>Promise<void>
  close?:()=>Promise<void>
}
export function cacheSleep(ms:number,signal:AbortSignal):Promise<void>{
  signal.throwIfAborted()
  return new Promise((resolve,reject)=>{
    const abort=()=>{clearTimeout(timer);reject(new DOMException('Scrape cancelled','AbortError'))}
    const timer=setTimeout(()=>{signal.removeEventListener('abort',abort);resolve()},ms)
    signal.addEventListener('abort',abort,{once:true})
  })
}
function publicLead(lead:Lead,rank:number){
  return {rank,name:lead.name,category:lead.category,address:lead.address,area:lead.area,postcode:lead.postcode,phone:lead.phone,website:lead.website,rating:lead.rating,reviewCount:lead.reviewCount,latitude:lead.latitude,longitude:lead.longitude,placeRef:lead.placeRef,mapsUrl:lead.mapsUrl,scrapedAt:lead.capturedAt}
}
export class CachedMapsProvider implements ScraperProvider {
  readonly id='chromium-maps' as const
  get label(){return this.inner.label}
  get requiresBrowser(){return this.inner.requiresBrowser}
  cacheHits=0
  constructor(private inner:CacheInner,private deps:CacheDeps,private runId:string){}
  async close(){await this.inner.close?.()}
  async run(query:ScrapeQuery,sink:ProgressSink,signal:AbortSignal):Promise<Lead[]>{
    if(!this.deps.enabled)return this.inner.run(query,sink,signal)
    const delivered=new IdentitySet()
    for(const id of this.deps.known.values)delivered.values.add(id)
    this.inner.skip=p=>delivered.has(p)
    this.inner.skipBudget=delivered.size
    const target=Math.min(query.maxResultsTotal??Infinity,query.maxResultsPerKeyword*query.keywords.length)
    const queries=query.keywords.map(keyword=>({keyword,location:query.location,region:query.region,language:query.language,cacheKey:cacheKeyFor(keyword,query.location,query.region,query.language)}))
    sink({status:'running',target,message:mapsMessages.opening})
    const lookup=await this.deps.lookup({keyVersion:'v1',runId:this.runId,reservationId:this.deps.reservationId,queries,limitPerQuery:query.maxResultsPerKeyword,maxResultsTotal:target,websiteFilter:query.websiteFilter||'any',maxAgeDays:30,exclude:this.deps.known.hashes()},signal).catch(()=>null)
    signal.throwIfAborted()
    const enabled=lookup?.enabled===true
    const out:Lead[]=[]
    const batches:{query:typeof queries[number];places:ReturnType<typeof publicLead>[];exhausted:boolean}[]=[]
    let failed=false
    try{
      for(const [i,keyword] of query.keywords.entries()){
        if(out.length>=target)break
        signal.throwIfAborted()
        const meta=queries[i],perTarget=Math.min(query.maxResultsPerKeyword,target-out.length)
        const cached=enabled?lookup?.results?.find(r=>r.cacheKey===meta.cacheKey):null
        let kwCount=0
        sink({status:'running',keyword,keywordIndex:i,keywordTotal:queries.length,target,found:out.length,message:mapsMessages.searching(keyword+' in '+query.location)})
        if(cached?.places.length&&!query.headless&&lookup?.warmBrowser!==false){
          await this.inner.prepare?.({...query,keywords:[keyword]},signal)
        }
        for(const p of cached?.places||[]){
          signal.throwIfAborted()
          if(kwCount>=perTarget||out.length>=target)break
          if(!p.name||!placeIdentity(p).length||!Number.isFinite(Date.parse(p.scrapedAt))||Date.parse(p.scrapedAt)<Date.now()-Math.min(30,lookup?.ttlDays??30)*86400000)continue
          if(!matchesWebsiteFilter(p.website,query.websiteFilter)||delivered.has(p)||!mapsBusinessRelevant(query.relevanceKeywords?.[i]||keyword,query.location,p))continue
          const lead:Lead={name:p.name,category:p.category,address:p.address,area:p.area,postcode:p.postcode,phone:p.phone,website:p.website,rating:p.rating,reviewCount:p.reviewCount,latitude:p.latitude,longitude:p.longitude,placeRef:p.placeRef,mapsUrl:p.mapsUrl,id:leadId(p.name,p.address,p.placeRef),provider:'chromium-maps',keyword,query:keyword+' in '+query.location,capturedAt:new Date().toISOString()}
          const delay=Math.max(300,(query.minDelayMs+Math.random()*(query.maxDelayMs-query.minDelayMs))*Math.min(0.6,Math.max(0.35,lookup?.paceFactor??0.5)))
          await (this.deps.sleep||cacheSleep)(delay,signal)
          signal.throwIfAborted()
          delivered.add(lead);out.push(lead);kwCount++;this.cacheHits++
          this.deps.cachedIds?.add(lead.id)
          if(p.enrichment&&Date.parse(p.enrichment.enrichedAt)>=Date.now()-Math.min(30,lookup?.enrichTtlDays??30)*86400000)this.deps.seeds.set(lead.id,structuredClone(p.enrichment))
          sink({lead,keyword,keywordIndex:i,keywordTotal:queries.length,target,found:out.length,status:'running',message:mapsMessages.captured(out.length,lead.name)})
          this.deps.diagnostics(this.runId,this.cacheHits)
        }
        const remaining=Math.min(perTarget-kwCount,target-out.length)
        const batch={query:meta,places:[] as ReturnType<typeof publicLead>[],exhausted:false};batches.push(batch)
        if(remaining>0&&!(cached?.exhausted&&cached.stale===0)){
          this.inner.skipBudget=delivered.size
          await this.inner.run({...query,keywords:[keyword],relevanceKeywords:[query.relevanceKeywords?.[i]||keyword],maxResultsPerKeyword:remaining,maxResultsTotal:remaining},progress=>{
            if(signal.aborted)return
            if(progress.lead){
              if(delivered.has(progress.lead)||out.length>=target||kwCount>=perTarget)return
              const raw=structuredClone(progress.lead)
              delivered.add(raw);out.push(raw);kwCount++
              if(raw.provider==='chromium-maps')batch.places.push(publicLead(raw,kwCount))
            }
            sink({...progress,keyword,keywordIndex:i,keywordTotal:queries.length,target,found:out.length,message:progress.lead?mapsMessages.captured(out.length,progress.lead.name):progress.message})
          },signal)
          // A filtered/owned-only scrape cannot certify that the shared cache contains the full set.
          batch.exhausted=Boolean(this.inner.lastRunExhausted&&kwCount<perTarget&&this.deps.known.size===0&&(!query.websiteFilter||query.websiteFilter==='any'))
        }
      }
      return out
    }catch(error){failed=!signal.aborted;throw error}
    finally{
      await this.close()
      this.inner.skip=undefined
      if(enabled&&!failed)for(const batch of batches)if(batch.places.length||batch.exhausted)this.deps.enqueue('contribute',{keyVersion:'v1',runId:this.runId,reservationId:this.deps.reservationId,appVersion:this.deps.appVersion,...batch})
    }
  }
}
