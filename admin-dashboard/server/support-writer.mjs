import {readFileSync} from 'node:fs'
export function createSupportWriter({keyFile=new URL('../../app/.admin-license-key',import.meta.url),fetch:fetcher=fetch}={}) {
 let key;try{key=readFileSync(keyFile,'utf8').trim()}catch(e){if(e.code==='ENOENT')return null;throw e}
 if(!/^[a-f0-9]{64}$/.test(key))throw new Error('Invalid private admin credential.')
 const send=async(kind,payload={})=>{
  const response=await fetcher('http://127.0.0.1:38749/support/'+kind,{method:'POST',redirect:'error',signal:AbortSignal.timeout(25000),headers:{authorization:`Bearer ${key}`,'content-type':'application/json'},body:JSON.stringify(payload)})
  const result=await response.json()
  if(!response.ok)throw Object.assign(new Error(result.error || 'Support action failed.'),{status:response.status})
  return result
 }
 return {reply:p=>send('reply',p),status:p=>send('status',p),note:p=>send('note',p),config:()=>send('config')}
}
