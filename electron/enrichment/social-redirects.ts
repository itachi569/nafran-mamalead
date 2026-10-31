import {canonicalSocialProfile,type CanonicalSocialProfile} from '../social-profile'
const cache=new Map<string,{at:number;profile:CanonicalSocialProfile|null}>()
/** Only public Facebook share redirects, no cookies/login/challenge handling. */
export async function resolvePublishedShareLinks(html:string,base:string,signal:AbortSignal):Promise<CanonicalSocialProfile[]> {
 const urls=[...new Set([...html.matchAll(/https?:\/\/(?:www\.|m\.)?(?:facebook|fb)\.com\/share\/[a-z0-9]+\/?/gi)].map(m=>m[0]))].slice(0,3)
 const results=await Promise.all(urls.map(async raw=>{
  const hit=cache.get(raw);if(hit&&Date.now()-hit.at<600_000)return hit.profile
  let profile:CanonicalSocialProfile|null=null,url=raw
  try{
   const bounded=AbortSignal.any([signal,AbortSignal.timeout(2500)])
   for(let i=0;i<4;i++){
    const response=await fetch(url,{redirect:'manual',signal:bounded,headers:{accept:'text/html'}})
    await response.body?.cancel()
    if(response.status<300||response.status>=400)break
    const location=response.headers.get('location');if(!location)break
    const next=new URL(location,url)
    if(next.protocol!=='https:'||next.username||next.password||next.port||! /^(?:(?:www|m|web)\.)?(?:facebook|fb)\.com$/i.test(next.hostname))break
    url=next.href;profile=canonicalSocialProfile(url);if(profile)break
   }
  }catch{/* An unresolved share is not claimed to be a verified business profile. */}
  if(!signal.aborted)cache.set(raw,{at:Date.now(),profile})
  return profile
 }))
 return results.filter((p):p is CanonicalSocialProfile=>Boolean(p))
}
