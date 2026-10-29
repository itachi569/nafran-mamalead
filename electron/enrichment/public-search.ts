import {parse, type DefaultTreeAdapterMap} from 'parse5'

export type PublicSearchHit={title:string;description:string;url:string}

/** Search navigation and account forms are not public evidence about a business owner. */
export function isPublicSourceUrl(value:string):boolean{
  try{
    const url=new URL(value),host=url.hostname.toLowerCase()
    return /^https?:$/.test(url.protocol) && !url.username && !url.password
      && !/(?:^|\.)(?:google\.[a-z.]+|bing\.com|duckduckgo\.com)$/.test(host)
      && !/(?:^|\/)(?:log-?in|sign-?in|sign-?up|register|auth|oauth)(?:\/|$)/i.test(url.pathname)
  }catch{return false}
}
type Node=DefaultTreeAdapterMap['node']
type Element=DefaultTreeAdapterMap['element']
const decode=(value:string)=>value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1').replace(/&quot;/g,'"').replace(/&apos;|&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&')
const text=(node:Node):string=>'value' in node?node.value:'childNodes' in node?node.childNodes.map(text).join(' '):''
const attr=(node:Element,key:string)=>node.attrs.find(item=>item.name===key)?.value ?? ''
const normal=(value:string)=>value.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase()

export function relevantSearchHits(hits:PublicSearchHit[],query:string):PublicSearchHit[]{
  type Site={host:string;path:string;exclude:boolean}
  const sites:Site[]=[],hostname=(url:URL)=>url.hostname.toLowerCase().replace(/^www\./,'').replace(/\.$/,'')
  let invalidSite=false
  const textQuery=query.replace(/(?:^|\s)(-?)site:(?:"([^"]*)"|'([^']*)'|([^\s]*))/gi,(_match,excluded,quoted,single,bare)=>{
    const value=quoted??single??bare??''
    try{
      const url=new URL(/^https?:\/\//i.test(value)?value:`https://${value}`),host=hostname(url)
      if(!value || !/^https?:$/.test(url.protocol) || url.username || url.password || !host.includes('.') || /[*\s]/.test(host))throw new Error('Invalid site restriction')
      sites.push({host,path:url.pathname.replace(/\/+$/,''),exclude:Boolean(excluded)})
    }catch{invalidSite=true}
    return ' '
  })
  const terms=normal(textQuery).replace(/["']/g,'').split(/\s+/).filter(term=>term.length>2 && !['email','address','owner','founder','contact','company','site:'].includes(term))
  const requiredSites=sites.filter(site=>!site.exclude),requiredCount=terms.length+requiredSites.length
  if(invalidSite || !requiredCount)return []
  return hits.filter(hit=>{
    if(!isPublicSourceUrl(hit.url))return false
    if(sites.length){
      let url:URL
      try{url=new URL(hit.url);if(!/^https?:$/.test(url.protocol))return false}catch{return false}
      // Exact host matching (apart from www) prevents a result snippet or lookalike suffix from
      // pretending to satisfy site:. Unrequested subdomains are not trusted implicitly.
      const matches=(site:Site)=>hostname(url)===site.host && (!site.path || url.pathname===site.path || url.pathname.startsWith(site.path+'/'))
      if(requiredSites.some(site=>!matches(site)) || sites.some(site=>site.exclude && matches(site)))return false
    }
    const haystack=normal(`${hit.url} ${hit.title} ${hit.description}`)
    return terms.filter(term=>haystack.includes(term)).length+requiredSites.length>=Math.min(2,requiredCount)
  })
}

export function searchHitsFromHtml(html:string):PublicSearchHit[]{
  if(/anomaly\.js|anomaly-modal|challenge-form|unusual traffic/i.test(html))throw new Error('Public search requires a browser check.')
  if(/<rss\b/i.test(html))return Array.from(html.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi),item=>{
    const tag=(name:string)=>decode(item[1].match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`,'i'))?.[1] ?? '')
    return {title:tag('title'),description:tag('description'),url:tag('link')}
  })
  const result:PublicSearchHit[]=[]
  const visit=(node:Node)=>{
    if('tagName' in node && node.tagName==='a' && /(?:^|\s)(?:result__a|result-link)(?:\s|$)/.test(attr(node,'class'))){
      try{
        let url=new URL(attr(node,'href'),'https://duckduckgo.com')
        if(url.searchParams.has('uddg'))url=new URL(url.searchParams.get('uddg')!)
        let context:Node=node
        for(let i=0;i<4 && 'parentNode' in context && context.parentNode;i++){context=context.parentNode;if('tagName' in context && (/(?:^|\s)result(?:\s|$)/.test(attr(context,'class')) || context.tagName==='tr'))break}
        if(/^https?:$/.test(url.protocol) && !/(?:^|\.)duckduckgo\.com$/i.test(url.hostname))result.push({title:text(node).replace(/\s+/g,' ').trim(),description:text(context).replace(/\s+/g,' ').trim().slice(0,2200),url:url.href})
      }catch{/* Ignore malformed result links. */}
    }
    if('childNodes' in node)node.childNodes.forEach(visit)
  }
  visit(parse(html));return result
}

/** Independent public indexes are bounded and fetched together; challenges are never bypassed. */
export async function searchPublicSources(query:string,signal?:AbortSignal):Promise<PublicSearchHit[]>{
  const budget=AbortSignal.any([...(signal?[signal]:[]),AbortSignal.timeout(4500)])
  const endpoints=['https://www.bing.com/search?format=rss&q=','https://html.duckduckgo.com/html/?q=']
  const results=await Promise.allSettled(endpoints.map(async endpoint=>{
    const response=await fetch(endpoint+encodeURIComponent(query),{signal:budget,headers:{accept:'text/html,application/rss+xml','user-agent':'Mozilla/5.0 (compatible; MamaLead public contact lookup)'}})
    if(!response.ok)throw new Error(`Public search returned HTTP ${response.status}.`)
    return searchHitsFromHtml((await response.text()).slice(0,2_000_000))
  }))
  if(signal?.aborted)throw new DOMException('Enrichment cancelled','AbortError')
  const hits=relevantSearchHits(results.flatMap(result=>result.status==='fulfilled'?result.value:[]),query)
  if(!hits.length && results.every(result=>result.status==='rejected'))throw new Error('Public search is unavailable or requires a browser check. Retry later.')
  return [...new Map(hits.map(hit=>[hit.url,hit])).values()].slice(0,8)
}
