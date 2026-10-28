import {useState} from 'react'
import {canonicalSocialProfile,socialProfileIdentity} from '../../electron/social-profile'
import './social-profile-links.css'

const labels:Record<string,string>={facebook:'Facebook',instagram:'Instagram',linkedin:'LinkedIn',youtube:'YouTube',tiktok:'TikTok',x:'X',other:'Profile'}
const tags:Record<string,string>={facebook:'f',instagram:'ig',linkedin:'in',youtube:'yt',tiktok:'tt',x:'x',other:'↗'}

/** One badge per platform; distinct accounts stay available in an expandable list. */
export function SocialProfileLinks({profiles}:{profiles:{url:string;tag?:string}[]}){
 const [open,setOpen]=useState(false)
 const unique=new Map<string,{url:string;label:string;tag:string}>()
 for(const item of profiles){const profile=canonicalSocialProfile(item.url);if(profile)unique.set(socialProfileIdentity(profile),{url:profile.profileUrl,label:labels[profile.platform],tag:tags[profile.platform]});else if(item.tag==='··'&&/^https?:\/\//i.test(item.url))unique.set(item.url,{url:item.url,label:'Profile',tag:'↗'})}
 const groups=new Map<string,{url:string;label:string;tag:string}[]>()
 for(const item of unique.values()){const group=groups.get(item.label)??[];group.push(item);groups.set(item.label,group)}
 const extra=[...groups.values()].reduce((sum,group)=>sum+group.length-1,0)
 return <span className="social-profile-links" data-social-profile-group>
  {[...groups.values()].map(group=><a key={group[0].label} className="social-profile-badge" href={group[0].url} target="_blank" rel="noopener noreferrer" data-social-profile-link={group[0].url} aria-label={`Open ${group[0].label} profile${group.length>1?` (${group.length} accounts available)`:''}`} title={`${group[0].label}: ${group[0].url}`}>{group[0].tag}</a>)}
  {extra>0&&<button type="button" className="social-profile-more" aria-expanded={open} onClick={()=>setOpen(!open)}>{open?'Hide accounts':`+${extra} accounts`}</button>}
  {open&&extra>0&&<span className="social-profile-accounts" aria-label="All social accounts">{[...unique.values()].map(item=><a key={item.url} href={item.url} target="_blank" rel="noopener noreferrer" data-social-profile-link={item.url}>{item.label} · {new URL(item.url).pathname.replace(/^\//,'')}{new URL(item.url).search}</a>)}</span>}
 </span>
}
