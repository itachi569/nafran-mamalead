const test=require('node:test')
const assert=require('node:assert/strict')
const {readWebsitePage}=require('../dist-electron/enrichment/http-page.js')
test('temporary errors retry once, respect Retry-After and cancellation, never retry access blocks',async()=>{
 const original=global.fetch
 try{
  for(const status of [502,503,504]){
   let calls=0
   global.fetch=async()=>++calls===1?new Response('',{status,headers:{'retry-after':'0'}}):new Response('<html>Recovered</html>')
   const page=await readWebsitePage('https://fixture.test',{signal:new AbortController().signal})
   assert.match(page.html,/Recovered/);assert.equal(calls,2)
  }
  let calls=0
  global.fetch=async()=>{calls++;return new Response('',{status:503,headers:{'retry-after':'0'}})}
  await assert.rejects(readWebsitePage('https://fixture.test',{signal:new AbortController().signal}),/busy|503/);assert.equal(calls,2)
  for(const status of [403,429,503]){
   calls=0;global.fetch=async()=>{calls++;return new Response('',{status,headers:{'retry-after':'60'}})}
   await assert.rejects(readWebsitePage('https://fixture.test',{home:true,signal:new AbortController().signal}));assert.equal(calls,1)
  }
  calls=0;global.fetch=async()=>{calls++;return new Response('',{status:503})}
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(new Error('cancelled by user')),30)
  await assert.rejects(readWebsitePage('https://fixture.test',{signal:controller.signal}),/cancelled/);clearTimeout(timer);assert.equal(calls,1)
  let begin=Date.now();calls=0;global.fetch=async()=>++calls===1?new Response('',{status:502,headers:{'retry-after':'0.1'}}):new Response('ok')
  await readWebsitePage('https://fixture.test',{signal:new AbortController().signal});assert.ok(Date.now()-begin>=90)
  global.fetch=async()=>new Response('',{status:302,headers:{location:'https://another.test/'}})
  await assert.rejects(readWebsitePage('https://fixture.test',{signal:new AbortController().signal}),/outside/)
 }finally{global.fetch=original}
})
