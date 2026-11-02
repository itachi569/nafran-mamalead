import {randomUUID} from 'node:crypto'
import {cacheSchema} from './lead-cache-schema.mjs'
import {hash, normText, domainIdentity} from './lead-cache-key.mjs'

const iso = value => new Date(value).toISOString()
const readJson = value => typeof value === 'string' ? JSON.parse(value) : value || []
const q = (sql, params = []) => ({sql, params})
const fail = (status, message, retryAfter = 0) => ({error:{status,message,retryAfter}})
const msDay = 86400000
function publicPlace(p, enrichment, cutoff) {
  return {
    placeKey:p.place_key, name:p.name, category:p.category, address:p.address, area:p.area, postcode:p.postcode,
    phone:p.phone_e164, website:p.website, rating:p.rating, reviewCount:p.review_count,
    latitude:p.latitude, longitude:p.longitude, placeRef:p.place_ref, mapsUrl:p.maps_url, scrapedAt:iso(p.scraped_at),
    enrichment:enrichment && Date.parse(enrichment.enriched_at) >= cutoff ? {
      emails:Date.parse(enrichment.emails_at)>=cutoff?readJson(enrichment.emails_json):[],
      phones:Date.parse(enrichment.phones_at)>=cutoff?readJson(enrichment.phones_json):[],
      socials:Date.parse(enrichment.socials_at)>=cutoff?readJson(enrichment.socials_json):[],
      scannedKinds:['emails','phones','socials'].filter(k=>Date.parse(enrichment[k+'_at'])>=cutoff).map(k=>({emails:'email',phones:'phone',socials:'social'}[k])),
      address:enrichment.address, enrichedAt:iso(enrichment.enriched_at),
    } : null,
  }
}

/** Generator operations keep SQLite transactions synchronous and run the same SQL on Neon. */
function* operation(action, a, prefix = '') {
  const t = name => prefix+'lead_cache_'+name
  const nowMs = a.now ?? Date.now(), now = iso(nowMs), day = now.slice(0,10)
  function* rows(sql, params = []) { return yield q(sql, params) }
  function* one(sql, params = []) { return (yield* rows(sql, params))[0] }
  function* bump(key, values) {
    const names = ['lookups','hits','partial_hits','served','requested','contributed']
    yield* rows(`insert into ${t('stats')}(day,cache_key,${names.join(',')}) values(?,?,?,?,?,?,?,?)
      on conflict(day,cache_key) do update set ${names.map(n=>n+'='+t('stats')+'.'+n+'+excluded.'+n).join(',')}`,
      [day,key,...names.map(n=>values[n] || 0)])
  }
  function* rate(buckets) {
    for (const b of buckets) {
      const old = yield* one(`select used,expires_at from ${t('buckets')} where bucket=?`, [b.key])
      if (old && Date.parse(old.expires_at) > nowMs && Number(old.used)+b.add > b.limit) return false
    }
    for (const b of buckets) {
      yield* rows(`insert into ${t('buckets')}(bucket,used,expires_at) values(?,?,?)
        on conflict(bucket) do update set used=case when ${t('buckets')}.expires_at<=? then excluded.used else ${t('buckets')}.used+excluded.used end,expires_at=excluded.expires_at`,
        [b.key,b.add,iso(b.end),now])
    }
    return true
  }
  if (action === 'prune') {
    const older = iso(nowMs-90*msDay)
    for (const [name,col,cutoff] of [['contributions','created_at',older],['votes','created_at',older],['query_places','seen_at',older],['runs','started_at',iso(nowMs-7*msDay)],['receipts','started_at',iso(nowMs-7*msDay)],['buckets','expires_at',now],['locks','expires_at',now],['blocks','blocked_until',now]]) {
      yield* rows(`delete from ${t(name)} where ${col}<?`,[cutoff])
    }
    yield* rows(`delete from ${t('run_places')} where not exists(select 1 from ${t('receipts')} r where r.installation_id=${t('run_places')}.installation_id and r.run_id=${t('run_places')}.run_id)`)
    yield* rows(`update ${t('queries')} set place_count=(select count(*) from ${t('query_places')} p where p.cache_key=${t('queries')}.cache_key)`)
    return {ok:true}
  }
  if (action === 'stats') {
    const sum = yield* one(`select coalesce(sum(lookups),0) as lookups,coalesce(sum(hits),0) as hits,coalesce(sum(partial_hits),0) as partial_hits,coalesce(sum(served),0) as served,coalesce(sum(requested),0) as requested,coalesce(sum(contributed),0) as contributed from ${t('stats')} where day>=? and day<=?`,[a.fromDay,a.toDay])
    const count = yield* one(`select count(*) as places,coalesce(sum(quarantined),0) as quarantined from ${t('places')}`)
    const queries = yield* one(`select count(*) as total from ${t('queries')}`)
    const top = yield* rows(`select q.keyword_norm as keyword,q.location_norm as location,q.region,q.place_count as places,sum(s.lookups) as lookups,sum(s.hits) as hits from ${t('stats')} s join ${t('queries')} q on q.cache_key=s.cache_key where s.day>=? and s.day<=? group by q.cache_key,q.keyword_norm,q.location_norm,q.region,q.place_count order by sum(s.lookups) desc limit 20`,[a.fromDay,a.toDay])
    return {lookups:Number(sum.lookups),hits:Number(sum.hits),hitRate:Number(sum.lookups)?Number(sum.hits)/Number(sum.lookups):0,partialHits:Number(sum.partial_hits),leadsServed:Number(sum.served),leadsRequested:Number(sum.requested),servedRatio:Number(sum.requested)?Number(sum.served)/Number(sum.requested):0,contributed:Number(sum.contributed),places:Number(count.places),queries:Number(queries.total),quarantined:Number(count.quarantined),topQueries:top.map(x=>({...x,places:Number(x.places),lookups:Number(x.lookups),hitRate:Number(x.lookups)?Number(x.hits)/Number(x.lookups):0,hits:undefined}))}
  }
  if (action === 'lookup') {
    const hour = Math.floor(nowMs/3600000), hourEnd=(hour+1)*3600000, dayEnd=(Math.floor(nowMs/msDay)+1)*msDay
    if (!(yield* rate([{key:'lookup:'+a.installationId+':'+hour,add:1,limit:60,end:hourEnd},{key:'ip:'+hash(a.ip || 'unknown')+':'+day,add:1,limit:600,end:dayEnd}]))) return fail(429,'Cache lookup limit reached.',3600)
    // Trial receipts must reference this installation's actual quota reservation.
    if (a.kind === 'trial') {
      const reserved = yield* one(`select reserved,created_at from ${prefix}trial_map_runs where id=? and installation_id=?`,[a.reservationId,a.installationId])
      if (!reserved || Date.parse(reserved.created_at)<nowMs-6*3600000 || a.totalLimit>Number(reserved.reserved)) return fail(403,'A recent Maps reservation is required.')
      const used = yield* one(`select run_id from ${t('receipts')} where reservation_id=?`,[a.reservationId])
      if (used && used.run_id !== a.runId) return fail(403,'This reservation already has a cache run.')
    }
    yield* rows(`insert into ${t('receipts')}(installation_id,run_id,reservation_id,requested,started_at) values(?,?,?,?,?) on conflict(installation_id,run_id) do nothing`,[a.installationId,a.runId,a.kind==='trial'?a.reservationId:null,a.totalLimit,now])
    const receipt = yield* one(`select requested from ${t('receipts')} where installation_id=? and run_id=?`,[a.installationId,a.runId])
    if (Number(receipt.requested)!==a.totalLimit) return fail(403,'Run allowance cannot change.')
    const results = []
    let remainingAllowance=a.totalLimit
    let lock = null
    for (const meta of a.queries) {
      yield* rows(`insert into ${t('queries')}(cache_key,keyword_norm,location_norm,region,language,created_at) values(?,?,?,?,?,?) on conflict(cache_key) do nothing`,[meta.cacheKey,normText(meta.keyword),normText(meta.location),meta.region,meta.language,now])
      yield* rows(`insert into ${t('runs')}(installation_id,run_id,cache_key,requested,started_at) values(?,?,?,?,?) on conflict(installation_id,run_id,cache_key) do nothing`,[a.installationId,a.runId,meta.cacheKey,a.limit,now])
      const query = yield* one(`select * from ${t('queries')} where cache_key=?`,[meta.cacheKey])
      const cutoff = iso(nowMs-a.ttlDays*msDay)
      const base = `from ${t('query_places')} qp join ${t('places')} p on p.place_key=qp.place_key where qp.cache_key=? and p.quarantined=0`
      const counts = yield* one(`select count(*) as total,coalesce(sum(case when p.scraped_at>=? then 1 else 0 end),0) as fresh ${base}`,[cutoff,meta.cacheKey])
      const filters=[], params=[meta.cacheKey,cutoff]
      if (a.websiteFilter==='has') filters.push("coalesce(p.website,'')<>''")
      if (a.websiteFilter==='none') filters.push("coalesce(p.website,'')=''")
      // JSON array expansion avoids SQLite's parameter limit for 20,000 exclusions.
      for (const [key,col] of [['placeRefs','place_ref_hash'],['phones','phone_hash'],['domains','domain_hash']]) {
        const values=a.exclude?.[key] || []
        if (values.length) {
          const expanded=prefix ? 'select jsonb_array_elements_text(?::jsonb)' : 'select value from json_each(?)'
          filters.push(`(p.${col} is null or p.${col} not in (${expanded}))`);params.push(JSON.stringify(values))
        }
      }
      const queryLimit=Math.min(a.limit,remainingAllowance)
      const eligible=a.serve?yield* one(`select count(*) as count ${base} and p.scraped_at>=? ${filters.map(f=>'and '+f).join(' ')}`,params):{count:0}
      params.push(queryLimit)
      const places = a.serve ? yield* rows(`select p.* ${base} and p.scraped_at>=? ${filters.map(f=>'and '+f).join(' ')} order by qp.rank,p.place_key limit ?`,params) : []
      const keys=places.map(p=>p.place_key)
      remainingAllowance-=places.length
      const enrichments = keys.length ? yield* rows(`select * from ${t('enrichment')} where place_key in (${keys.map(()=>'?').join(',')})`,keys) : []
      const enrichmentMap = new Map(enrichments.map(e=>[e.place_key,e]))
      const stale=Number(counts.total)-Number(counts.fresh)
      // A complete shared query can still have more rows than this limited response.
      // Do not prevent the client filling a shortfall after its identity/relevance checks.
      const exhausted=Boolean(a.serve && Number(eligible.count)<=places.length && stale===0 && query.exhausted_at && Date.parse(query.exhausted_at)>=Date.parse(cutoff))
      results.push({cacheKey:meta.cacheKey,total:Number(counts.total),fresh:Number(counts.fresh),stale,exhausted,places:places.map(p=>publicPlace(p,enrichmentMap.get(p.place_key),nowMs-a.enrichTtlDays*msDay))})
      yield* bump(meta.cacheKey,{lookups:1,hits:places.length?1:0,partial_hits:places.length>0&&places.length<a.limit?1:0,served:places.length,requested:a.limit})
      if (places.length<a.limit && !exhausted) {
        yield* rows(`insert into ${t('locks')}(cache_key,installation_id,expires_at) values(?,?,?) on conflict(cache_key) do update set installation_id=excluded.installation_id,expires_at=excluded.expires_at where ${t('locks')}.expires_at<=? or ${t('locks')}.installation_id=excluded.installation_id`,[meta.cacheKey,a.installationId,iso(nowMs+600000),now])
        const l=yield* one(`select installation_id,expires_at from ${t('locks')} where cache_key=?`,[meta.cacheKey])
        lock={acquired:l.installation_id===a.installationId,expiresAt:iso(l.expires_at),retryAfterMs:Math.max(0,Date.parse(l.expires_at)-nowMs)}
      }
    }
    return {enabled:true,ttlDays:a.ttlDays,enrichTtlDays:a.enrichTtlDays,paceFactor:a.paceFactor,warmBrowser:a.warmBrowser,results,lock}
  }
  const blocked = yield* one(`select blocked_until from ${t('blocks')} where installation_id=?`,[a.installationId])
  if (blocked && Date.parse(blocked.blocked_until)>nowMs) return fail(403,'Cache contributions are temporarily blocked.')
  if (action === 'contribute') {
    const receipt = yield* one(`select r.requested,r.accepted,r.started_at,k.requested as query_requested from ${t('receipts')} r join ${t('runs')} k on k.installation_id=r.installation_id and k.run_id=r.run_id where r.installation_id=? and r.run_id=? and k.cache_key=?`,[a.installationId,a.runId,a.meta.cacheKey])
    if (!receipt || Date.parse(receipt.started_at)<nowMs-6*3600000 || a.inputCount>Number(receipt.query_requested)) return fail(403,'A recent cache run receipt is required.')
    const hour=Math.floor(nowMs/3600000)
    if (!(yield* rate([{key:'write:'+a.installationId+':'+hour,add:1,limit:30,end:(hour+1)*3600000},{key:'places:'+a.installationId+':'+day,add:a.inputCount,limit:2000,end:(Math.floor(nowMs/msDay)+1)*msDay}]))) return fail(429,'Cache contribution limit reached.',3600)
    if (a.rejected.length>a.inputCount*0.2) {
      yield* rows(`insert into ${t('blocks')}(installation_id,blocked_until) values(?,?) on conflict(installation_id) do update set blocked_until=excluded.blocked_until`,[a.installationId,iso(nowMs+msDay)])
      return fail(422,'Too many invalid places; batch rejected.')
    }
    const used = yield* rows(`select place_key from ${t('run_places')} where installation_id=? and run_id=?`,[a.installationId,a.runId])
    const seen=new Set(used.map(r=>r.place_key))
    const unique=[...new Map(a.places.map(p=>[p.placeKey,p])).values()]
    const newCount=unique.filter(p=>!seen.has(p.placeKey)).length
    if (Number(receipt.accepted)+newCount>Number(receipt.requested)) return fail(403,'Contribution exceeds the run allowance.')
    let accepted=0,duplicates=0
    const keys=unique.map(p=>p.placeKey),marks=keys.map(()=>'?').join(',')
    const previous=keys.length?yield* rows(`select * from ${t('places')} where place_key in (${marks})`,keys):[]
    const oldByKey=new Map(previous.map(p=>[p.place_key,p]))
    const confirmed=keys.length?yield* rows(`select place_key from ${t('contributions')} where installation_id=? and place_key in (${marks})`,[a.installationId,...keys]):[]
    const confirmedKeys=new Set(confirmed.map(p=>p.place_key))
    const votes=keys.length?yield* rows(`select * from ${t('votes')} where place_key in (${marks}) and created_at>=?`,[...keys,iso(nowMs-a.ttlDays*msDay)]):[]
    const pending={votes:[],contributions:[],places:[],links:[],used:[]}
    const columns=['place_key','name','category','address','area','postcode','phone_e164','website','website_domain','rating','review_count','latitude','longitude','place_ref','maps_url','place_ref_hash','phone_hash','domain_hash','scraped_at','first_seen_at','confirmations','quarantined','updated_at']
    function* bulk(name,cols,values,conflict){
      if(values.length)yield* rows(`insert into ${t(name)}(${cols.join(',')}) values ${values.map(v=>'('+v.map(()=>'?').join(',')+')').join(',')} ${conflict}`,values.flat())
    }
    for (const p of unique) {
      if (seen.has(p.placeKey)) {duplicates++;continue}
      const old = oldByKey.get(p.placeKey)
      const confirmation = !confirmedKeys.has(p.placeKey)
      if(confirmation)pending.contributions.push([randomUUID(),a.installationId,a.meta.cacheKey,p.placeKey,now])
      let phone=p.phone,website=p.website
      for (const [field,value] of [['phone_e164',phone],['website',website]]) {
        if (!value || (old?.[field] && old[field]!==value && Date.parse(old.scraped_at)>nowMs-a.ttlDays*msDay)) {
          if (value) {
            pending.votes.push([p.placeKey,field,value,a.installationId,now])
            const voters=new Set(votes.filter(v=>v.place_key===p.placeKey&&v.field===field&&v.value===value&&v.installation_id!==a.installationId).map(v=>v.installation_id))
            voters.add(a.installationId)
            if (voters.size>=2) continue
          }
          if(field==='phone_e164')phone=old?.phone_e164 || ''
          else website=old?.website || ''
        }
      }
      const domain=domainIdentity(website)
      pending.places.push([p.placeKey,p.name,p.category,p.address,p.area,p.postcode,phone,website,domain,p.rating,p.reviewCount,p.latitude,p.longitude,p.placeRef,p.mapsUrl,hash(p.placeKey),phone?hash(phone):null,domain?hash(domain):null,now,old?iso(old.first_seen_at):now,Number(old?.confirmations || 0)+(confirmation?1:0),old?.quarantined || 0,now])
      pending.links.push([a.meta.cacheKey,p.placeKey,p.rank,now])
      pending.used.push([a.installationId,a.runId,p.placeKey])
      accepted++
    }
    yield* bulk('contributions',['id','installation_id','cache_key','place_key','created_at'],pending.contributions,'on conflict(installation_id,place_key) do nothing')
    yield* bulk('votes',['place_key','field','value','installation_id','created_at'],pending.votes,'on conflict(place_key,field,installation_id) do update set value=excluded.value,created_at=excluded.created_at')
    yield* bulk('places',columns,pending.places,'on conflict(place_key) do update set '+columns.slice(1).map(c=>c+'=excluded.'+c).join(','))
    yield* bulk('query_places',['cache_key','place_key','rank','seen_at'],pending.links,`on conflict(cache_key,place_key) do update set rank=case when excluded.rank<${t('query_places')}.rank then excluded.rank else ${t('query_places')}.rank end,seen_at=excluded.seen_at`)
    yield* bulk('run_places',['installation_id','run_id','place_key'],pending.used,'on conflict do nothing')
    yield* rows(`update ${t('receipts')} set accepted=accepted+? where installation_id=? and run_id=?`,[accepted,a.installationId,a.runId])
    yield* rows(`update ${t('queries')} set place_count=(select count(*) from ${t('query_places')} where cache_key=?),last_scraped_at=?,exhausted_at=? where cache_key=?`,[a.meta.cacheKey,now,a.exhausted?now:null,a.meta.cacheKey])
    yield* bump(a.meta.cacheKey,{contributed:accepted})
    yield* rows(`delete from ${t('locks')} where cache_key=? and installation_id=?`,[a.meta.cacheKey,a.installationId])
    return {accepted,duplicates:duplicates+a.places.length-unique.length,rejected:a.rejected}
  }
  if (action === 'enrichment') {
    const place=yield* one(`select p.website from ${t('places')} p join ${t('contributions')} c on c.place_key=p.place_key where p.place_key=? and c.installation_id=? and c.created_at>=? and p.quarantined=0`,[a.placeKey,a.installationId,iso(nowMs-90*msDay)])
    if (!place || domainIdentity(place.website)!==domainIdentity(a.website) || !domainIdentity(place.website)) return fail(403,'A matching public Maps contribution is required.')
    const hour=Math.floor(nowMs/3600000)
    if (!(yield* rate([{key:'enrich:'+a.installationId+':'+hour,add:1,limit:2000,end:(hour+1)*3600000}]))) return fail(429,'Enrichment limit reached.',3600)
    const old=yield* one(`select * from ${t('enrichment')} where place_key=?`,[a.placeKey])
    const values=[],times=[]
    for(const [plural,kind] of [['emails','email'],['phones','phone'],['socials','social']]){
      const fresh=a.scannedKinds.includes(kind)
      values.push(JSON.stringify(fresh?a[plural]:readJson(old?.[plural+'_json'])))
      times.push(fresh?now:old?.[plural+'_at']?iso(old[plural+'_at']):null)
    }
    yield* rows(`insert into ${t('enrichment')}(place_key,emails_json,phones_json,socials_json,emails_at,phones_at,socials_at,address,enriched_at) values(?,?,?,?,?,?,?,?,?) on conflict(place_key) do update set emails_json=excluded.emails_json,phones_json=excluded.phones_json,socials_json=excluded.socials_json,emails_at=excluded.emails_at,phones_at=excluded.phones_at,socials_at=excluded.socials_at,address=excluded.address,enriched_at=excluded.enriched_at`,[a.placeKey,...values,...times,a.address,now])
    return {accepted:true}
  }
  throw new Error('Unknown cache operation')
}

function methods(execute) {
  return {
    leadCacheLookup: a=>execute('lookup',a),
    leadCacheContribute:a=>execute('contribute',a),
    leadCacheEnrichmentUpsert:a=>execute('enrichment',a),
    leadCacheAdminStats:a=>execute('stats',a),
    leadCachePrune:()=>execute('prune',{}),
  }
}
export function createSqliteLeadCacheStore(db) {
  for (const sql of cacheSchema()) db.exec(sql)
  return methods((action,args)=>{
    db.exec('BEGIN IMMEDIATE')
    try {
      const gen=operation(action,args)
      let next=gen.next()
      while(!next.done) {next=gen.next(db.prepare(next.value.sql).all(...next.value.params))}
      db.exec('COMMIT')
      return next.value
    } catch(error) {db.exec('ROLLBACK');throw error}
  })
}
export function createNeonLeadCacheStore(databaseUrl, ready = async()=>{}, createClient) {
  let schemaReady
  return methods(async(action,args)=>{
    await ready()
    // Request-scoped connection: interactive transactions must not outlive serverless requests.
    const client=createClient?createClient():new (await import('@neondatabase/serverless')).Client({connectionString:databaseUrl})
    await client.connect()
    try {
      await client.query('BEGIN')
      await client.query("select pg_advisory_xact_lock(734619236)")
      if (!schemaReady) for (const sql of cacheSchema(true)) await client.query(sql)
      const gen=operation(action,args,'billing_')
      let next=gen.next()
      while(!next.done) {
        let i=0
        const sql=next.value.sql.replace(/\?/g,()=>'$'+(++i))
        next=gen.next((await client.query(sql,next.value.params)).rows)
      }
      await client.query('COMMIT');schemaReady=true
      return next.value
    } catch(error) {await client.query('ROLLBACK').catch(()=>{});throw error}
    finally {await client.end()}
  })
}
