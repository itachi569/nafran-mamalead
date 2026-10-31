import {existsSync,readFileSync,writeFileSync,mkdirSync,unlinkSync} from 'node:fs'
import {join} from 'node:path'
import {SUPPORT_EMAIL_FALLBACK,type SupportConfig} from './support-data'

export function cleanSupportConfig(input:unknown):SupportConfig|null {
 const value=input as Partial<SupportConfig>|null
 if(!value||typeof value.email!=='string'||value.email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email))return null
 return {configured:value.configured===true,email:value.email,slaText:typeof value.slaText==='string'?value.slaText.slice(0,200):''}
}
export function readSupportConfig(directory:string):SupportConfig {
 try {
  const text=readFileSync(join(directory,'support-config.json'),'utf8')
  const cached=text.length<=4096?cleanSupportConfig(JSON.parse(text)):null
  if(cached)return {...cached,configured:false}
 }catch{}
 return {configured:false,email:SUPPORT_EMAIL_FALLBACK,slaText:''}
}
export function writeSupportConfig(directory:string,config:SupportConfig):void {
 const safe=cleanSupportConfig(config);if(!safe)return
 // Only public contact details persist. Never cache credentials or customer email.
 try{mkdirSync(directory,{recursive:true});writeFileSync(join(directory,'support-config.json'),JSON.stringify({email:safe.email,slaText:safe.slaText}),{mode:0o600})}catch{}
}
export function clearSupportRetry(directory:string):void {
 const file=join(directory,'support-retry.json')
 try{if(existsSync(file))unlinkSync(file)}catch{}
}
