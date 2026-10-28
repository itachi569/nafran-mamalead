import {parse,type DefaultTreeAdapterMap} from 'parse5'

type Node=DefaultTreeAdapterMap['node']
type Element=DefaultTreeAdapterMap['element']
const REQUEST_MS=3_000,LOOKUP_MS=8_000,MAX_BYTES=2_000_000
const normal=(value:string)=>value.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim()
const hostname=(url:URL)=>url.host.toLowerCase().replace(/^www\./,'')
const textOf=(node:Node):string=>{
  if('value' in node)return node.value
  if('tagName' in node && /^(?:script|style|noscript|template)$/.test(node.tagName))return ''
  return 'childNodes' in node?node.childNodes.map(textOf).join(' ').replace(/\s+/g,' ').trim():''
}
function sameSite(raw:string,origin:URL,base=origin.href):string|null{
  try{const url=new URL(raw,base);if(!/^https?:$/.test(url.protocol)||url.username||url.password||hostname(url)!==hostname(origin)||origin.protocol==='https:'&&url.protocol!=='https:')return null;url.hash='';return url.href}catch{return null}
}
const key=(raw:string)=>{const url=new URL(raw);return hostname(url)+url.pathname.replace(/\/$/,'')+url.search}
function blocked(node:Node):boolean{
  let current:Node|null=node
  while(current && 'tagName' in current){
    if(/^(?:header|nav|footer|aside|blockquote)$/.test(current.tagName))return true
    const labels=current.attrs.filter(attr=>attr.name==='class'||attr.name==='id').map(attr=>attr.value).join(' ')
    if(/testimoni|(?:customer|client)[-_ ]?(?:stor(?:y|ies)|review|quote|case)|(?:^|[-_ ])reviews?(?:[-_ ]|$)/i.test(labels))return true
    current=current.parentNode
  }
  return false
}
/** Context stays in the link's paragraph/list item and nearby preceding prose, not the page. */
function linkContext(node:Element):string{
  let block:Node=node
  while('parentNode' in block && block.parentNode && 'tagName' in block.parentNode && !/^(?:p|li|h[1-6]|article|section|main|body)$/.test('tagName' in block?block.tagName:''))block=block.parentNode
  const own=textOf(block),parent='parentNode' in block?block.parentNode:null
  if(!('tagName' in block)||!/^(?:p|li|h[1-6])$/.test(block.tagName)||own.length>1000)return textOf(node).slice(0,200)
  if(!parent||!('childNodes' in parent))return own
  const siblings=parent.childNodes,index=siblings.indexOf(block),pieces=[own]
  let previous=0
  for(let i=index-1;i>=0&&previous<3;i--){const sibling=siblings[i];if(!('tagName' in sibling))continue;if(!/^(?:p|h[1-6])$/.test(sibling.tagName))break;const text=textOf(sibling);if(text.length>800)break;pieces.unshift(text);previous++;if(/^h[1-6]$/.test(sibling.tagName))break}
  return pieces.join(' ').slice(-1800)
}
function links(html:string,base:string,origin:URL):{url:string;label:string;context:string}[]{
  const found:{url:string;label:string;context:string}[]=[]
  const visit=(node:Node):void=>{
    if('tagName' in node && node.tagName==='a'&&!blocked(node)){
      const href=node.attrs.find(attr=>attr.name==='href')?.value,url=href&&sameSite(href,origin,base)
      if(url&&key(url)!==key(base)&&!new URL(url).search&& !/\.(?:pdf|zip|png|jpe?g|svg|gif|webp|mp[34])$/i.test(new URL(url).pathname))found.push({url,label:textOf(node),context:linkContext(node)})
    }
    if('childNodes' in node)node.childNodes.forEach(visit)
  }
  visit(parse(html));return found
}
function waitFor<T>(promise:Promise<T>,signal:AbortSignal):Promise<T>{
  if(signal.aborted){void promise.catch(()=>{});return Promise.reject(signal.reason)}
  return new Promise((resolve,reject)=>{const stop=()=>reject(signal.reason??new DOMException('Cancelled','AbortError'));signal.addEventListener('abort',stop,{once:true});promise.then(resolve,reject).finally(()=>signal.removeEventListener('abort',stop))})
}

/** Discover a few public company-story URLs; the caller must verify the named owner's email. */
export async function discoverOwnerStoryPages(website:string,owner:{fullName:string;evidence?:string},signal?:AbortSignal,seeds:{url:string;html:string}[]=[]):Promise<string[]>{
  signal?.throwIfAborted()
  let origin:URL
  try{origin=new URL(website);if(!/^https?:$/.test(origin.protocol)||origin.username||origin.password)return []}catch{return []}
  const fullName=normal(owner.fullName),firstName=fullName.split(' ')[0]
  if(!fullName||firstName.length<2)return []
  const seeded=new Map<string,{url:string;html:string}>()
  for(const seed of seeds){const url=sameSite(seed.url,origin);if(url&&typeof seed.html==='string'&&seed.html.length<=MAX_BYTES)seeded.set(key(url),{url,html:seed.html})}
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),LOOKUP_MS),combined=AbortSignal.any([controller.signal,...(signal?[signal]:[])])
  const read=async(raw:string):Promise<{url:string;html:string}|null>=>{
    const seedUrl=sameSite(raw,origin),saved=seedUrl&&seeded.get(key(seedUrl))
    if(saved)return saved
    const request=new AbortController(),timeout=setTimeout(()=>request.abort(),REQUEST_MS),requestSignal=AbortSignal.any([combined,request.signal])
    let url=sameSite(raw,origin)
    try{for(let redirect=0;url&&redirect<4;redirect++){
      const response=await waitFor(fetch(url,{redirect:'manual',signal:requestSignal,headers:{accept:'text/html,application/xhtml+xml','user-agent':'MamaLead public story discovery'}}),requestSignal)
      if(response.url&&!sameSite(response.url,origin)){void response.body?.cancel().catch(()=>{});return null}
      if(response.status>=300&&response.status<400){const next=response.headers.get('location');void response.body?.cancel().catch(()=>{});url=next?sameSite(next,origin,url):null;continue}
      if(!response.ok||Number(response.headers.get('content-length')??0)>MAX_BYTES||/application\/pdf/i.test(response.headers.get('content-type')??'')){void response.body?.cancel().catch(()=>{});return null}
      const reader=response.body?.getReader();if(!reader)return null
      const decoder=new TextDecoder();let html='',bytes=0
      try{while(true){const chunk=await waitFor(reader.read(),requestSignal);if(chunk.done)return {url,html:html+decoder.decode()};bytes+=chunk.value.length;if(bytes>MAX_BYTES)return null;html+=decoder.decode(chunk.value,{stream:true})}}finally{void reader.cancel().catch(()=>{})}
    }}catch{/* A slow or blocked optional story cannot delay the scan indefinitely. */}finally{clearTimeout(timeout)}return null
  }
  try{
    const evidence=owner.evidence&&sameSite(owner.evidence,origin),about=new URL('/about',origin).href
    const roots=[...new Map([evidence,about].filter((url):url is string=>Boolean(url)).map(url=>[key(url),url])).values()].slice(0,2)
    const pages=await Promise.all(roots.map(read)),stories=new Map<string,{url:string;score:number}>()
    for(const page of pages){if(!page)continue;for(const link of links(page.html,page.url,origin)){
      const label=normal(link.label),path=normal(new URL(link.url).pathname)
      if(/\b(?:customer|client|testimonial|case study)\b/.test(label)||/(?:customer|client)[-_]stor|case[-_]stud/i.test(path))continue
      const ownStory=/\b(?:our|company|startup|founder|founding|business)\b.{0,45}\b(?:story|journey|history|began|started)\b|\b(?:story|journey|history)\b.{0,45}\b(?:our|company|startup|founder|business)\b/.test(label)
      const ownStoryPath=/(?:^|\/)(?:our-story|company-story|company-history|founder-story|founding-story|startup-journey|our-journey)(?:\/|$)/.test(path)
      if(ownStory||ownStoryPath)stories.set(key(link.url),{url:link.url,score:/founder|founding/.test(label)?2:1})
    }}
    const first=[...stories.values()].sort((a,b)=>b.score-a.score).slice(0,2)
    const articles=combined.aborted?[]:await Promise.all(first.map(item=>read(item.url))),next=new Map<string,{url:string;score:number}>()
    for(const article of articles){if(!article)continue;for(const link of links(article.html,article.url,origin)){
      const context=normal(link.context),label=normal(link.label),path=new URL(link.url).pathname
      if(/\b(?:customer|client|testimonial|case study)\b/.test(label)||/(?:customer|client)[-_]stor|case[-_]stud/i.test(path)||!/(?:^|\/)(?:blog|news|articles?|stories|story|journal|founders?)\/[^/]+/i.test(path))continue
      const full=context.includes(fullName),firstMention=new RegExp(`(?:^|[^\\p{L}])${firstName.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}(?:$|[^\\p{L}])`,'u').test(context)
      const journey=/\b(?:co[- ]?founder|founding|founded|began|beginnings|first line of code|idea.{0,30}born|started.{0,40}(?:company|business|building|develop|project)|develop.{0,40}(?:company|business|project))\b/.test(context)
      if(full||firstMention||journey)next.set(key(link.url),{url:link.url,score:full?3:firstMention?2:1})
    }}
    signal?.throwIfAborted()
    return [...new Map([...next.values()].filter(item=>!stories.has(key(item.url))).sort((a,b)=>b.score-a.score).slice(0,4-first.length).concat(first).map(item=>[key(item.url),item.url])).values()].slice(0,4)
  }finally{clearTimeout(timer);controller.abort()}
}
