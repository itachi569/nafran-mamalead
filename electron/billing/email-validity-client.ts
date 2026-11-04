import {randomUUID} from 'node:crypto'
import {emailValidityRequest} from './client'
import {EmailVerificationError,type EmailValidityResult} from '../email-verifier'

type Job={id:string;state:'running'|'completed'|'failed'|'cancelled';results:EmailValidityResult[];message:string;total:number;checked:number}
export async function serverEmailValidityStatus(){
  try{return await emailValidityRequest<{configured:boolean;message:string}>('/status')}
  catch{return {configured:false,message:'MamaLead mailbox verification is unavailable. Check your connection and try again. No DNS-only verification is used.'}}
}
export async function verifyEmailsOnServer(addresses:string[],signal:AbortSignal,onResults:(rows:EmailValidityResult[])=>void,onMessage:(message:string)=>void):Promise<EmailValidityResult[]>{
  const requested=new Set(addresses),saved=new Map<string,EmailValidityResult>()
  let job:Job|undefined
  const accept=(state:Job)=>{
    if(!Array.isArray(state.results)||!['running','completed','failed','cancelled'].includes(state.state))throw new Error('The email service returned an incomplete response.')
    const fresh=state.results.filter(row=>requested.has(row.email)&&!saved.has(row.email)&&['valid','invalid','risky','unknown'].includes(row.status)&&row.provider==='leadsangel')
    for(const row of fresh)saved.set(row.email,row)
    if(fresh.length)onResults(fresh)
    onMessage(state.message)
  }
  const pause=()=>new Promise<void>((resolve,reject)=>{const abort=()=>{clearTimeout(timer);reject(signal.reason)};const timer=setTimeout(()=>{signal.removeEventListener('abort',abort);resolve()},1200);signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort()})
  try{
    job=await emailValidityRequest<Job>('/jobs','POST',{emails:addresses,requestId:randomUUID()},signal)
    if(!/^[a-f0-9-]{36}$/.test(job.id))throw new Error('The email service did not return a check ID.')
    const deadline=Date.now()+160_000
    accept(job)
    while(job.state==='running'&&Date.now()<deadline){await pause();job=await emailValidityRequest<Job>('/jobs/'+job.id,'GET',undefined,signal);accept(job)}
    if(job.state==='running')throw new Error('Mailbox verification timed out. Completed results are saved; retry the remaining emails.')
    if(job.state==='failed'&&!saved.size)throw new Error(job.message)
    return [...saved.values()]
  }catch(error){
    if(signal.aborted)throw signal.reason
    // Do not fan out a provider outage into many paid retries or silently switch to DNS checks.
    throw new EmailVerificationError(error instanceof Error?error.message:'Full email verification could not finish.',false)
  }finally{
    if(job?.state==='running')void emailValidityRequest('/jobs/'+job.id,'DELETE').catch(()=>undefined)
  }
}
