export type SocialPlatform='facebook'|'instagram'|'linkedin'|'youtube'|'tiktok'|'x'
export interface CanonicalSocialProfile {platform:SocialPlatform;handle:string;profileUrl:string}
const hosts:Record<string,SocialPlatform>={
 'facebook.com':'facebook','www.facebook.com':'facebook','m.facebook.com':'facebook','mbasic.facebook.com':'facebook','web.facebook.com':'facebook','fb.me':'facebook',
 'instagram.com':'instagram','www.instagram.com':'instagram','m.instagram.com':'instagram','instagr.am':'instagram',
 'linkedin.com':'linkedin','www.linkedin.com':'linkedin','uk.linkedin.com':'linkedin','pk.linkedin.com':'linkedin',
 'youtube.com':'youtube','www.youtube.com':'youtube','m.youtube.com':'youtube','youtu.be':'youtube',
 'tiktok.com':'tiktok','www.tiktok.com':'tiktok','m.tiktok.com':'tiktok',
 'x.com':'x','www.x.com':'x','twitter.com':'x','www.twitter.com':'x','mobile.twitter.com':'x',
}
export function socialPlatformOf(raw:string):SocialPlatform|null {try{const host=new URL(raw).hostname.toLowerCase();return hosts[host]??(/^[a-z]{2}\.linkedin\.com$/.test(host)?'linkedin':null)}catch{return null}}
const reserved=new Set('login login.php logout signup sign-up signin sign-in register reg recover recovery help support about privacy policies policy terms legal business developers developer dialog plugins sharer sharer.php share share.php watch reel reels stories story.php photo photo.php photos permalink.php groups events marketplace gaming hashtag search pages home settings notifications friends account accounts api ajax rsrc ads creators results feed playlist embed shorts intent i intent.php t redirect oembed'.split(' '))
const profileTabs=new Set('about reviews posts photos videos reels followers following mentions community featured tagged streams shorts live playlists'.split(' '))
for(const endpoint of 'tr lite r.php terms.php checkpoint consent policies_center privacy_center ad_campaign'.split(' '))reserved.add(endpoint)
/** Only account/page/channel links. Content, navigation and share endpoints are not profiles. */
export function canonicalSocialProfile(raw:string):CanonicalSocialProfile|null {
 let url:URL
 try{url=new URL(/^https?:\/\//i.test(raw.trim())?raw.trim():'https://'+raw.trim())}catch{return null}
 if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.port)return null
 const platform=socialPlatformOf(url.href);if(!platform)return null
 let segments:string[]
 try{segments=url.pathname.split('/').filter(Boolean).map(value=>decodeURIComponent(value))}catch{return null}
 if(!segments.length||segments.some(value=>/[\s\\/?#<>]/.test(value)))return null
 const [first,second,third]=segments,low=first.toLowerCase()
 const profile=(handle:string,path:string,host:string):CanonicalSocialProfile=>({platform,handle,profileUrl:'https://'+host+'/'+path})
 if(platform==='facebook'){
  if(low==='profile.php'){const id=url.searchParams.get('id');return id&&/^\d{5,}$/.test(id)?profile(id,'profile.php?id='+id,'www.facebook.com'):null}
  if(['people','pages'].includes(low)&&second&&third&&/^\d{5,}$/.test(third)&&(segments.length===3||segments.length===4&&profileTabs.has(segments[3])))return profile(third,'profile.php?id='+third,'www.facebook.com')
  if(low==='pg'&&second&&(segments.length===2||segments.length===3&&profileTabs.has(third)))return profile(second,encodeURIComponent(second),'www.facebook.com')
  if(reserved.has(low)||! /^[\p{L}\p{N}._-]+$/u.test(first))return null
  if(segments.length>1&&(segments.length!==2||!profileTabs.has(second.toLowerCase())))return null
  return profile(first,encodeURIComponent(first),'www.facebook.com')
 }
 if(platform==='youtube'){
  if(url.hostname.toLowerCase()==='youtu.be')return null
  if(first.startsWith('@')&&first.length>1&&(segments.length===1||segments.length===2&&profileTabs.has(second.toLowerCase())))return profile(first.slice(1),'@'+encodeURIComponent(first.slice(1)),'www.youtube.com')
  if(['channel','c','user'].includes(low)&&second&&(segments.length===2||segments.length===3&&profileTabs.has(third.toLowerCase())))return profile(second,low+'/'+encodeURIComponent(second),'www.youtube.com')
  return null
 }
 if(platform==='linkedin')return ['company','in','school','showcase'].includes(low)&&second&&(segments.length===2||segments.length===3&&['about','posts','people','jobs','life'].includes(third.toLowerCase()))?profile(second,low+'/'+encodeURIComponent(second),'www.linkedin.com'):null
 if(platform==='tiktok')return first.startsWith('@')&&first.length>1&&segments.length===1?profile(first.slice(1),'@'+encodeURIComponent(first.slice(1)),'www.tiktok.com'):null
 if(reserved.has(low)||['p','explore','direct','tv','challenge','directory','jobs','download','tos','safety','messages'].includes(low))return null
 if(platform==='instagram')return /^[\p{L}\p{N}._-]+$/u.test(first)&&(segments.length===1||segments.length===2&&['tagged','reels'].includes(second.toLowerCase()))?profile(first,encodeURIComponent(first),'www.instagram.com'):null
 return /^[a-zA-Z0-9_]{1,30}$/.test(first)&&segments.length===1?profile(first,first,'x.com'):null
}
export function socialProfileIdentity(profile:CanonicalSocialProfile):string {
 return profile.platform+'|'+(profile.platform==='youtube'&&profile.profileUrl.includes('/channel/')?profile.profileUrl:profile.profileUrl.toLowerCase())
}
