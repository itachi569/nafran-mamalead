import {leadCacheRequest} from './client'
import {leadCacheEnabled,leadCacheTimeoutMs} from '../runtime-config'
import type {CacheLookup} from '../scraper/cached-maps'
import type {LeadCacheRepository} from '../db/lead-cache-repository'

let draining=false
let drainAgain=false
let serverEnabled=false
export const cacheSharingActive=()=>leadCacheEnabled&&serverEnabled
export async function leadCacheLookup(body:unknown,signal:AbortSignal):Promise<CacheLookup|null>{
  if(!leadCacheEnabled)return null
  try{const result=await leadCacheRequest('lookup',body,AbortSignal.any([signal,AbortSignal.timeout(leadCacheTimeoutMs)])) as CacheLookup;serverEnabled=result.enabled===true;return result}
  catch{return null}
}
/** Never blocks a Maps run. The durable outbox is written before any HTTP request. */
export async function drainLeadCache(repository:LeadCacheRepository):Promise<void>{
  if(!leadCacheEnabled)return
  if(draining){drainAgain=true;return}
  draining=true
  try{
   do{
    drainAgain=false
    for(const item of repository.pending()){
      try{
        const result=await leadCacheRequest(item.kind,JSON.parse(item.payload),AbortSignal.timeout(leadCacheTimeoutMs)) as {enabled?:boolean}
        if(result.enabled===false){drainAgain=false;return}
        repository.complete(item.id)
      }catch{repository.failed(item.id,item.attempts)}
    }
   }while(drainAgain)
  }catch{/* Retry on next start/run; cache failures never fail scraping. */}
  finally{draining=false}
}
