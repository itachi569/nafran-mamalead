import {readFileSync} from 'node:fs'
const allowed=new Set(['TURNSTILE_SITE_KEY','TURNSTILE_SECRET_KEY','TURNSTILE_HOSTNAMES'])
/** Server-only local credentials. Explicit environment variables always win. */
export function loadTurnstileConfig(input=process.env,defaultFile=new URL('../.secrets/mamalead-turnstile.env',import.meta.url)) {
  const env={...input}
  if(env.TURNSTILE_SITE_KEY?.trim()&&env.TURNSTILE_SECRET_KEY?.trim())return env
  let text
  try{text=readFileSync(env.TURNSTILE_CONFIG_FILE || defaultFile,'utf8')}
  catch(error){if(!env.TURNSTILE_CONFIG_FILE&&error.code==='ENOENT')return env;throw new Error('Cannot read the private Turnstile configuration file.')}
  for(const line of text.replace(/^\uFEFF/,'').split(/\r?\n/)){
    const match=line.match(/^\s*(?:export\s+)?([A-Z_]+)\s*=\s*(.*?)\s*$/)
    if(!match||!allowed.has(match[1])||env[match[1]]?.trim())continue
    let value=match[2]
    if((value.startsWith('"')&&value.endsWith('"'))||(value.startsWith("'")&&value.endsWith("'")))value=value.slice(1,-1)
    else value=value.replace(/\s+#.*$/,'').trim()
    if(value)env[match[1]]=value
  }
  return env
}
