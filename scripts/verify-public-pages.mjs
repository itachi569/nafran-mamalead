import assert from 'node:assert/strict'
import {spawn} from 'node:child_process'
import {createServer} from 'node:net'
import {resolve} from 'node:path'
const probe=createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r))
const child=spawn(process.execPath,['website/server.mjs'],{env:{...process.env,LANDING_ROOT:resolve('website'),LANDING_HOST:'127.0.0.1',LANDING_PORT:String(port)},stdio:'ignore'})
const base='http://127.0.0.1:'+port
try{
 for(let n=0;n<100;n++){try{await fetch(base);break}catch{await new Promise(r=>setTimeout(r,50))}}
 for(const path of ['/','/support','/privacy','/terms','/thank-you']){
  const res=await fetch(base+path);assert.equal(res.status,200,path);const html=await res.text()
  for(const pattern of [/<title>[^<]+<\/title>/,/<meta name="description" content="[^"]+"/,/<link rel="canonical" href="https:\/\/mamalead.com\//,/<meta property="og:title" content="[^"]+"/,/<meta property="og:description"/,/<meta property="og:url"/])assert.match(html,pattern,path)
  const image=html.match(/<meta property="og:image" content="([^"]+)"/)?.[1]
  if(image)assert.equal((await fetch(base+new URL(image).pathname)).status,200)
 }
 const redirect=await fetch(base+'/contact?from=test',{redirect:'manual'});assert.equal(redirect.status,301);assert.equal(redirect.headers.get('location'),'/support?from=test')
 for(const path of ['/support/','/privacy/','/terms/','/thank-you/','/contact'])assert.equal((await fetch(base+path)).status,200,path)
 for(const path of ['/.secrets/mamalead-turnstile.env','/mamalead_turnstile.env','/../package.json'])assert.equal((await fetch(base+path)).status,404,path)
 console.log('PASS clean routes, redirects, title/description/canonical/Open Graph on all five pages, image URLs and private-file rejection')
}finally{child.kill()}
