import {randomUUID} from 'node:crypto'
import type {LocalDatabase} from './local-db'
import type {Repository} from './repository'
import type {CacheEnrichment} from '../scraper/cached-maps'
import {mapsPlaceIdentity} from '../scraper/saved-places'
import type {Lead} from '../scraper/types'

export class LeadCacheRepository {
  constructor(private db:LocalDatabase){}
  origin(leadId:string,lead:Lead){
    const key=mapsPlaceIdentity(lead.placeRef)||mapsPlaceIdentity(lead.mapsUrl)
    if(key.startsWith('cid:')&&lead.website)this.db.run('insert into lead_cache_origins(lead_id,place_key,website) values(?,?,?) on conflict do nothing',[leadId,key,lead.website])
  }
  publicOrigin(leadId:string){return this.db.one<{place_key:string;website:string}>('select place_key,website from lead_cache_origins where lead_id=?',[leadId])}
  enqueue(kind:'contribute'|'enrichment',body:unknown){
    const now=new Date().toISOString(),payload=JSON.stringify(body)
    if(Buffer.byteLength(payload)>262144)return
    this.db.run('insert into lead_cache_outbox(id,kind,payload,created_at,next_attempt_at) values(?,?,?,?,?)',[randomUUID(),kind,payload,now,now])
  }
  pending(){
    this.db.run('delete from lead_cache_outbox where attempts>=3 or created_at<?',[new Date(Date.now()-7*86400000).toISOString()])
    return this.db.query<{id:string;kind:'contribute'|'enrichment';payload:string;attempts:number}>('select id,kind,payload,attempts from lead_cache_outbox where next_attempt_at<=? order by case when kind=\'contribute\' then 0 else 1 end,created_at limit 200',[new Date().toISOString()])
  }
  complete(id:string){this.db.run('delete from lead_cache_outbox where id=?',[id])}
  failed(id:string,attempt:number){this.db.run('update lead_cache_outbox set attempts=attempts+1,next_attempt_at=? where id=?',[new Date(Date.now()+60000*Math.pow(5,attempt)).toISOString(),id])}
  diagnostics(runId:string,hits:number){this.db.run('update scrape_runs set cache_hits=? where id=?',[hits,runId])}
  seed(repository:Repository,workspaceId:string,leadId:string,e:CacheEnrichment){
    if(Date.parse(e.enrichedAt)<Date.now()-30*86400000)return
    this.db.transaction(()=>{
      for(const email of e.emails.slice(0,1))repository.upsertContact({leadId,kind:'email',value:email.value,source:email.source,verified:false,score:email.score})
      for(const phone of e.phones)repository.upsertContact({leadId,kind:'phone',value:phone.value,source:phone.source,verified:false,score:0})
      for(const social of e.socials)repository.upsertSocialProfile({workspaceId,leadId,platform:social.platform as any,handle:'',profileUrl:social.url,source:social.source||''})
      repository.markLeadScanned(leadId)
      const kinds=e.scannedKinds||(['email','phone','social'] as const).filter(k=>e[{email:'emails',phone:'phones',social:'socials'}[k] as 'emails'|'phones'|'socials'].length)
      this.db.run('insert into lead_cache_seeded(lead_id,email,phone,social,seeded_at) values(?,?,?,?,?) on conflict(lead_id) do update set email=excluded.email,phone=excluded.phone,social=excluded.social,seeded_at=excluded.seeded_at',[leadId,kinds.includes('email')?1:0,kinds.includes('phone')?1:0,kinds.includes('social')?1:0,e.enrichedAt])
      // Cached evidence never carries another device's verification verdict.
      this.db.run('update lead_contacts set validation_status=null,validation_message=null,validated_at=null where lead_id=?',[leadId])
    })
  }
}
