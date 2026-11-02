import {cacheKeyFor, domainIdentity, mapsIdentity, publicWebsite, hash} from './lead-cache-key.mjs'

export class LeadCacheError extends Error {
  constructor(status,message,retryAfter=0) {super(message);this.status=status;this.retryAfter=retryAfter}
}
const bad = message => {throw new LeadCacheError(400,message)}
const integer = (n,min,max) => Number.isSafeInteger(n)&&n>=min&&n<=max
const bounded = (value,fallback,min,max) => Number.isFinite(Number(value))?Math.min(max,Math.max(min,Number(value))):fallback
export function validateQuery(q) {
  if (!q || !['keyword','location','region','language'].every(k=>typeof q[k]==='string'&&q[k].trim().length>0&&q[k].length<=200) ||
      q.cacheKey!==cacheKeyFor(q.keyword,q.location,q.region,q.language)) bad('Invalid exact cache query.')
  return {keyword:q.keyword,location:q.location,region:q.region,language:q.language,cacheKey:q.cacheKey}
}
export function validatePlace(p,index=0) {
  const reject=reason=>({rejected:{index,reason}})
  if (!p || typeof p!=='object')return reject('invalid_place')
  let maps
  try { maps=new URL(p.mapsUrl) } catch {return reject('invalid_maps_url')}
  // Only Google's published domains, not arbitrary google.<attacker tld> names.
  const google=/^(?:(?:www|maps)\.)?google\.(?:com|[a-z]{2}|co\.(?:uk|in|jp|kr|nz|za|id|th|il)|com\.(?:pk|au|br|mx|ar|tr|sg|my|hk|tw|ph|vn|eg|sa|ua))$/i
  if(maps.protocol!=='https:'||maps.username||maps.password||maps.port||!google.test(maps.hostname)||!maps.pathname.startsWith('/maps/'))return reject('invalid_maps_url')
  const fromUrl=mapsIdentity(maps.href),fromRef=mapsIdentity(p.placeRef)
  if (!fromUrl || (p.placeRef && (!fromRef || fromRef!==fromUrl)))return reject('invalid_place_ref')
  if(typeof p.name!=='string'||!p.name.trim()||p.name.length>200||/https?:\/\/|www\.|\S+@\S+/.test(p.name))return reject('invalid_name')
  if (['category','address','area','postcode'].some(k=>p[k]!=null&&(typeof p[k]!=='string'||p[k].length>({category:120,address:300,area:120,postcode:30}[k]))))return reject('invalid_text')
  const phone=p.phone || '',website=p.website || ''
  if(typeof phone!=='string'||(phone&&!/^\+[1-9]\d{6,14}$/.test(phone)))return reject('invalid_phone')
  if(website&&!publicWebsite(website))return reject('invalid_website')
  for(const [key,min,max] of [['latitude',-90,90],['longitude',-180,180],['rating',1,5],['reviewCount',0,1000000]]) {
    if(p[key]!=null&&(!Number.isFinite(p[key])||p[key]<min||p[key]>max||(key==='reviewCount'&&!Number.isInteger(p[key]))))return reject('invalid_'+key)
  }
  if(!integer(p.rank,0,1000000))return reject('invalid_rank')
  return {place:{placeKey:fromUrl,name:p.name.trim(),category:p.category||'',address:p.address||'',area:p.area||'',postcode:p.postcode||'',phone,website:website?publicWebsite(website):'',rating:p.rating??null,reviewCount:p.reviewCount??null,latitude:p.latitude??null,longitude:p.longitude??null,placeRef:fromRef?p.placeRef:fromUrl.slice(4),mapsUrl:maps.href,rank:p.rank}}
}
function cleanEnrichment(p) {
  if(!p||!/^cid:\d{5,25}$/.test(p.placeKey)||!publicWebsite(p.website))bad('Invalid enrichment place.')
  for(const key of ['emails','phones','socials'])if(!Array.isArray(p[key])||p[key].length>10)bad('Invalid enrichment fields.')
  const domain=domainIdentity(p.website),allowed=new Set([domain,'gmail.com','yahoo.com','outlook.com','hotmail.com'])
  const source=value=>{const u=publicWebsite(value);return u&&domainIdentity(u)===domain?u:null}
  const emails=p.emails.filter(e=>typeof e?.value==='string'&&e.value.length<=254&&/^[^\s@]+@[^\s@]+$/.test(e.value)&&allowed.has(e.value.toLowerCase().split('@')[1])&&source(e.source)).map(e=>({value:e.value.toLowerCase(),source:source(e.source),score:Math.min(100,Math.max(0,Number(e.score)||0))}))
  const phones=p.phones.filter(e=>/^\+[1-9]\d{6,14}$/.test(e?.value)&&source(e.source)).map(e=>({value:e.value,source:source(e.source)}))
  const socialHosts={facebook:['facebook.com'],instagram:['instagram.com'],linkedin:['linkedin.com'],twitter:['twitter.com','x.com'],x:['x.com','twitter.com'],youtube:['youtube.com','youtu.be'],tiktok:['tiktok.com'],pinterest:['pinterest.com']}
  const socials=p.socials.filter(e=>{try{const host=new URL(e.url).hostname;return publicWebsite(e.url)&&socialHosts[e.platform]?.some(d=>host===d||host.endsWith('.'+d))&&source(e.source)}catch{return false}}).map(e=>({platform:e.platform,url:e.url,source:source(e.source)}))
  const scannedKinds=Array.isArray(p.scannedKinds)?[...new Set(p.scannedKinds.filter(k=>['email','phone','social'].includes(k)))]:['email','phone','social'].filter(k=>p[{email:'emails',phone:'phones',social:'socials'}[k]].length)
  return {placeKey:p.placeKey,website:p.website,emails,phones,socials,scannedKinds,address:typeof p.address==='string'&&p.address.length<=300?p.address:''}
}
export async function handleLeadCache({path,input,installationId,kind,ip,env,store}) {
  if(env.LEAD_CACHE_ENABLED!=='1')return {enabled:false}
  const ttlDays=bounded(env.LEAD_CACHE_TTL_DAYS,30,1,90),enrichTtlDays=bounded(env.LEAD_CACHE_ENRICH_TTL_DAYS,30,1,90)
  const base={installationId,ttlDays,enrichTtlDays}
  let result
  if(path==='lookup'){
    if(input?.keyVersion!=='v1'||!Array.isArray(input.queries)||input.queries.length<1||input.queries.length>8||!integer(input.limitPerQuery,1,200))bad('Invalid lookup request.')
    const queries=input.queries.map(validateQuery)
    if(new Set(queries.map(q=>q.cacheKey)).size!==queries.length)bad('Duplicate query.')
    if(!/^[a-zA-Z0-9_-]{1,100}$/.test(input.runId||''))bad('Invalid run identity.')
    const totalLimit=input.maxResultsTotal??input.limitPerQuery*queries.length
    if(!integer(totalLimit,1,input.limitPerQuery*queries.length))bad('Invalid run allowance.')
    const exclude={};let count=0
    for(const key of ['placeRefs','phones','domains']){
      const values=input.exclude?.[key]||[]
      if(!Array.isArray(values)||values.some(v=>typeof v!=='string'||!/^[a-f0-9]{64}$/.test(v)))bad('Exclusions must be SHA-256 hashes.')
      count+=values.length;exclude[key]=[...new Set(values)]
    }
    if(count>20000)bad('Too many exclusions.')
    if(!['any','has','none'].includes(input.websiteFilter??'any'))bad('Invalid website filter.')
    if(input.maxAgeDays!=null&&(!Number.isFinite(input.maxAgeDays)||input.maxAgeDays<1))bad('Invalid cache age.')
    const rollout=bounded(env.LEAD_CACHE_ROLLOUT_PERCENT,100,0,100)
    result=await store.leadCacheLookup({...base,ip,kind,reservationId:input.reservationId??null,runId:input.runId,queries,limit:input.limitPerQuery,totalLimit,exclude,websiteFilter:input.websiteFilter??'any',ttlDays:Math.min(ttlDays,input.maxAgeDays??ttlDays),serve:env.LEAD_CACHE_SERVE==='1'&&parseInt(hash(installationId).slice(0,8),16)%100<rollout,paceFactor:bounded(env.LEAD_CACHE_PACE_FACTOR,0.5,0.35,0.6),warmBrowser:env.LEAD_CACHE_WARM_BROWSER!=='0'})
  }else if(path==='contribute'){
    if(input?.keyVersion!=='v1'||!Array.isArray(input.places)||input.places.length>200||!/^[a-zA-Z0-9_-]{1,100}$/.test(input.runId||''))bad('Invalid contribution.')
    const meta=validateQuery(input.query),valid=input.places.map(validatePlace)
    result=await store.leadCacheContribute({...base,runId:input.runId,meta,exhausted:input.exhausted===true,inputCount:input.places.length,places:valid.flatMap(v=>v.place?[v.place]:[]),rejected:valid.flatMap(v=>v.rejected?[v.rejected]:[])})
  }else if(path==='enrichment'){
    result=await store.leadCacheEnrichmentUpsert({...base,...cleanEnrichment(input)})
  }else throw new LeadCacheError(404,'Cache endpoint not found.')
  if(result?.error)throw new LeadCacheError(result.error.status,result.error.message,result.error.retryAfter)
  return result
}
