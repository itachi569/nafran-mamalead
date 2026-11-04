import {readFileSync} from 'node:fs'
import {createHash,randomUUID} from 'node:crypto'
import {verifyEmailAddressesWithLeadsAngel} from './leadsangel-provider.mjs'

// Private server file only. Never return credentials, provider job IDs or raw SMTP responses.
export function emailValidityCredentials(env){
  try{
    const value=env.LEADSANGEL_CONFIG_FILE?JSON.parse(readFileSync(env.LEADSANGEL_CONFIG_FILE,'utf8')):{licenseKey:env.LEADSANGEL_LICENSE_KEY,deviceId:env.LEADSANGEL_DEVICE_ID,expiresOn:env.LEADSANGEL_EXPIRES_ON}
    if(!/^[A-Z0-9-]{8,80}$/i.test(value.licenseKey??'')||!/^[A-Z0-9-]{8,120}$/i.test(value.deviceId??''))return null
    if(value.expiresOn && (!/^\d{4}-\d{2}-\d{2}$/.test(value.expiresOn)||Date.parse(value.expiresOn+'T23:59:59Z')<Date.now()))return null
    return {licenseKey:value.licenseKey,deviceId:value.deviceId,expiresOn:value.expiresOn??null}
  }catch{return null}
}

export function createEmailValidityService({env,store,ErrorType,verify=verifyEmailAddressesWithLeadsAngel,now=Date.now}){
  const credentials=emailValidityCredentials(env),jobs=new Map(),locks=new Set()
  const fail=(status,message)=>{throw new ErrorType(status,message)}
  const snapshot=job=>({id:job.id,state:job.state,results:[...job.results.values()],total:job.addresses.length,checked:job.results.size,message:job.message,failed:job.state==='failed'?job.addresses.length-job.results.size:0})
  const prune=()=>{for(const [id,job] of jobs){if(job.state==='running'&&now()-job.seen>45_000){job.controller.abort();job.state='cancelled';job.message='Check stopped because the app disconnected.'}if(job.state!=='running'&&now()-job.created>10*60_000)jobs.delete(id)}}
  const timer=setInterval(prune,5000);timer.unref()
  const owned=(owner,id)=>{prune();const job=jobs.get(id);if(!job||job.owner!==owner)fail(404,'Email check expired or was not found. Please start a new check.');return job}
  const safeResult=(row,job)=>{
    if(!row||!job.addresses.includes(row.email)||!['valid','invalid','risky','unknown'].includes(row.status))return
    const score=typeof row.score==='number'&&Number.isFinite(row.score)?Math.max(0,Math.min(100,Math.round(row.score))):null
    let message=String(row.message??'Mailbox check finished.').slice(0,500)
    for(const secret of [credentials?.licenseKey,credentials?.deviceId])if(secret)message=message.split(secret).join('[redacted]')
    job.results.set(row.email,{email:row.email,status:row.status,verified:row.status==='valid',score,message,provider:'leadsangel'})
  }
  return {
    configuration:()=>({configured:Boolean(credentials),provider:'leadsangel',level:'mailbox',managed:true,message:credentials?'Mailbox verification is provided by MamaLead. No separate API key is needed.':'Mailbox verification is temporarily unavailable. Please try again later or contact support.'}),
    async start(owner,input){
      prune()
      if(!credentials)fail(503,'Full email verification is not available on the server. Please contact support. No DNS-only result was substituted.')
      if(!input||!Array.isArray(input.emails)||!input.emails.length||input.emails.length>20||typeof input.requestId!=='string'||!/^[a-f0-9-]{36}$/i.test(input.requestId))fail(400,'Send 1–20 email addresses and a valid request ID.')
      const addresses=[...new Set(input.emails.map(email=>typeof email==='string'?email.trim().toLowerCase():''))]
      if(addresses.some(email=>email.length>254||!/^[^\s@<>]+@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/i.test(email)||/\.(?:invalid|localhost|test|local|example)$/.test(email)))fail(400,'One or more email addresses are invalid.')
      const digest=createHash('sha256').update(JSON.stringify(addresses)).digest('hex')
      const previous=[...jobs.values()].find(job=>job.owner===owner&&job.requestId===input.requestId)
      if(previous){if(previous.digest!==digest)fail(409,'This request ID was already used for different addresses.');previous.seen=now();return snapshot(previous)}
      if(locks.has(owner)||[...jobs.values()].some(job=>job.owner===owner&&job.state==='running'))fail(409,'An email check is already running. Wait or stop it first.')
      if(locks.size+[...jobs.values()].filter(job=>job.state==='running').length>=8||jobs.size>=1000)fail(429,'Email verification is busy. Please retry shortly.')
      locks.add(owner)
      try{
        // Persist rate limits across restarts using the existing atomic usage store.
        if(!store.reserveAssistUsage)fail(503,'Email verification limits are not configured. Please contact support.')
        const minute=Math.floor(now()/60000),day=Math.floor(now()/86400000)
        const remaining=await store.reserveAssistUsage([{key:`email:${owner}:m:${minute}`,limit:12,expires:(minute+2)*60000},{key:`email:${owner}:d:${day}`,limit:500,expires:(day+2)*86400000}])
        if(!remaining)fail(429,'Email check limit reached. Please retry later.')
        const job={id:randomUUID(),owner,requestId:input.requestId,digest,addresses,results:new Map(),created:now(),seen:now(),state:'running',message:'Checking mailboxes…',controller:new AbortController()}
        jobs.set(job.id,job)
        void (async()=>{
          try{
            const signal=AbortSignal.any([job.controller.signal,AbortSignal.timeout(150000)])
            const rows=await verify(credentials,addresses,signal,()=>{},rows=>{if(job.state==='running')for(const row of rows)safeResult(row,job)})
            if(job.state!=='running')return
            for(const row of rows)safeResult(row,job)
            job.state=job.results.size===addresses.length?'completed':'failed'
            job.message=job.state==='completed'?'Mailbox check finished.':'Some mailboxes could not be checked. Completed results are saved; retry the remaining addresses.'
          }catch{
            if(job.state==='running'){job.state='failed';job.message='The mailbox verification service could not complete this check. Completed results are saved. Please retry later or contact support.'}
          }
        })()
        return snapshot(job)
      }finally{locks.delete(owner)}
    },
    status(owner,id){const job=owned(owner,id);job.seen=now();return snapshot(job)},
    cancel(owner,id){const job=owned(owner,id);if(job.state==='running'){job.state='cancelled';job.message='Email check stopped. Completed results are saved.';job.controller.abort()}return snapshot(job)},
    close(){clearInterval(timer);for(const job of jobs.values())job.controller.abort();jobs.clear()},
  }
}
