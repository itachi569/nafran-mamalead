(() => {
 'use strict';
 let launcher=document.getElementById('mama-ai-launcher');
 const MAIL='hello@mamalead.com',MAILTO='mailto:'+MAIL+'?subject=MamaLead%20Support';
 const local=/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname),override=new URL(location.href).searchParams.get('billingApi');
 const api=local&&override&&/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(override)?override:'https://api.mamalead.com';
 const key='mamalead.mama-ai.v1:'+api,day=()=>new Date().toISOString().slice(0,10);
 let messages=[],remaining=6,config=null,busy=false,token='',widget=null,started=false;
 try{const saved=JSON.parse(sessionStorage.getItem(key)||'null');if(saved?.day===day()&&Array.isArray(saved.messages))messages=saved.messages.filter(m=>['user','assistant'].includes(m.role)&&typeof m.content==='string').slice(-12).map(m=>({role:m.role,content:m.content.slice(0,2000)}));}catch{}
 const panel=document.createElement('section');panel.className='mama-ai-panel';panel.id='mama-ai-panel';panel.hidden=true;panel.setAttribute('role','dialog');panel.setAttribute('aria-label','Mama AI — MamaLead guide');
 panel.innerHTML=`<header class="mama-ai-head"><div class="mama-ai-avatar"><img src="/img/mamalead-favicon.png" alt="" width="38" height="38"></div><div class="mama-ai-name"><h2>Mama <span>AI</span></h2><p>Your MamaLead guide</p></div><button class="mama-ai-icon" type="button" data-hide aria-label="Minimize Mama AI">−</button><button class="mama-ai-icon" type="button" data-hide aria-label="Close Mama AI">×</button></header>
 <div class="mama-ai-scroll"><div class="mama-ai-intro"><p class="mama-ai-eyebrow">A little guidance. A big next step.</p><h3>Hi, I’m Mama.<br>What brings you here?</h3><p>Let’s find your next connection. Ask me about MamaLead, your free trial or getting started.</p></div><div class="mama-ai-questions"><button type="button">What can MamaLead find?</button><button type="button">How does the free trial work?</button><button type="button">What’s included in Lifetime?</button></div><div class="mama-ai-messages" role="log" aria-label="Chat messages" aria-live="polite" aria-relevant="additions"></div><div class="mama-ai-thinking" role="status" hidden><i></i><i></i><i></i><span>Mama is thinking…</span></div><div class="mama-ai-error" role="alert" hidden></div><div class="mama-ai-handoff" role="status" hidden><p></p><a href="${MAILTO}">${MAIL} ↗</a><small class="mama-ai-reset"></small></div></div>
 <div class="mama-ai-bottom"><div class="mama-ai-security"></div><form class="mama-ai-form"><textarea rows="1" maxlength="1000" aria-label="Your question for Mama AI" placeholder="Ask Mama AI…"></textarea><button type="submit" aria-label="Send message" disabled><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 5l7 7-7 7"/></svg></button></form><p class="mama-ai-email">Prefer email? <a href="${MAILTO}">${MAIL}</a></p></div>`;
 document.body.append(panel);
 const get=s=>panel.querySelector(s),input=get('textarea'),send=get('[type=submit]'),scroll=get('.mama-ai-scroll'),log=get('.mama-ai-messages'),questions=get('.mama-ai-questions'),error=get('.mama-ai-error'),handoff=get('.mama-ai-handoff'),thinking=get('.mama-ai-thinking');
 function save(){try{sessionStorage.setItem(key,JSON.stringify({day:day(),messages}));}catch{}}
 function supportText(el,text){el.replaceChildren();text.split(/(hello@mamalead\.com)/gi).forEach(part=>{if(part.toLowerCase()===MAIL){const link=document.createElement('a');link.href=MAILTO;link.textContent=part;el.append(link);}else el.append(document.createTextNode(part));});}
 function bubble(m){const el=document.createElement('div');el.className='mama-ai-message';el.dataset.role=m.role;if(m.role==='assistant'){const label=document.createElement('span');label.className='mama-ai-message-label';label.textContent='Mama AI';el.append(label);}const body=document.createElement('span');if(m.role==='assistant')supportText(body,m.content);else body.textContent=m.content;el.append(body);log.append(el);}
 function bottom(){scroll.scrollTo({top:scroll.scrollHeight,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});}
 function displayError(text){error.textContent=text;error.hidden=!text;if(text)bottom();}
 function render(){
  send.disabled=busy||remaining<=0||!token||!config?.configured||!input.value.trim();input.disabled=remaining<=0||busy;
  thinking.hidden=!busy;questions.hidden=messages.length>0||busy||remaining<=0;
  input.placeholder=remaining<=0?'Our support team can help below':busy?'One moment…':'Ask Mama AI…';
 }
 function showHandoff(text){handoff.hidden=false;supportText(handoff.querySelector('p'),text||"I can help you reach our support team. Email us below for more help.");bottom();}
 async function request(path,body){const c=new AbortController(),t=setTimeout(()=>c.abort(),40000);try{const response=await fetch(api+path,{method:body?'POST':'GET',headers:body?{'content-type':'application/json'}:{},...(body?{body:JSON.stringify(body)}:{}),signal:c.signal});const data=await response.json();if(!response.ok)throw Object.assign(new Error(data.message||data.error||'Mama AI is unavailable. Please try again.'),{data,status:response.status});return data;}finally{clearTimeout(t);}}
 let securityLoader;
 function loadSecurity(){if(window.turnstile?.render)return Promise.resolve();if(securityLoader)return securityLoader;securityLoader=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';script.async=true;script.onload=()=>window.turnstile?.render?resolve():reject(Error('Security check unavailable'));script.onerror=()=>reject(Error('Security check unavailable'));document.head.append(script);});return securityLoader;}
 async function mountSecurity(){if(remaining<=0||!config?.configured)return;await loadSecurity();if(widget!==null)return;widget=window.turnstile.render(get('.mama-ai-security'),{sitekey:config.turnstileSiteKey,action:'mamalead_chat',theme:'light',appearance:'interaction-only',callback:value=>{token=value;render();},'expired-callback':()=>{token='';render();},'error-callback':()=>{token='';render();displayError('The security check could not load. Reopen chat to retry, or use email below.');}});}
 async function setup(){
  displayError('');
  try{config=await request('/v1/assist/web/config');remaining=config.remaining;render();if(remaining===0){showHandoff();return;}if(!config.configured){displayError('Mama AI is taking a break. You can still reach our team by email below.');return;}await mountSecurity();}
  catch{securityLoader=null;displayError('Chat could not connect. Reopen it to retry, or email our team below.');}
 }
 async function open(){if(!panel.isConnected)document.body.append(panel);panel.hidden=false;launcher.setAttribute('aria-expanded','true');launcher.hidden=true;document.querySelector('.back-to-top')?.setAttribute('hidden','');if(!started){messages.forEach(bubble);started=true;}render();input.focus();await setup();if(widget!==null&&!token&&!busy&&remaining>0)window.turnstile.reset(widget);}
 function close(){panel.hidden=true;launcher.hidden=false;launcher.setAttribute('aria-expanded','false');document.querySelector('.back-to-top')?.removeAttribute('hidden');launcher.focus();}
 async function submit(){
  const question=input.value.trim();if(!question||busy||remaining<=0)return;if(!token||!config?.configured){displayError('Please wait for the chat security check, or use email below.');return;}
  busy=true;displayError('');const user={role:'user',content:question};bubble(user);input.value='';render();bottom();
  try{
   const answer=await request('/v1/assist/web/chat',{messages:[...messages,user].slice(-11),turnstileToken:token});
   if(typeof answer.text!=='string'||!Number.isInteger(answer.remaining))throw Error('Invalid chat response');
   remaining=answer.remaining;config.resetAt=answer.resetAt;messages.push(user,{role:'assistant',content:answer.text});bubble(messages.at(-1));save();if(remaining===0)showHandoff(answer.handoff);
  }catch(e){
   log.lastElementChild?.remove();input.value=question;
   if(e.data?.code==='daily_limit'){remaining=0;config={...config,resetAt:e.data.resetAt};showHandoff(e.data.message);}
   else{if(Number.isInteger(e.data?.remaining))remaining=e.data.remaining;displayError(e.name==='AbortError'?'The answer took too long. Please retry, or email our team below.':e.message||'Chat could not connect. Please try again.');}
  }finally{busy=false;token='';if(widget!==null&&remaining>0)window.turnstile.reset(widget);render();bottom();if(!panel.hidden&&remaining>0)input.focus();}
 }
 // The website renderer replaces its original markup; delegate clicks to the current launcher.
 document.addEventListener('click',e=>{const current=e.target.closest?.('#mama-ai-launcher');if(current){launcher=current;open();}});panel.querySelectorAll('[data-hide]').forEach(b=>b.addEventListener('click',close));
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!panel.hidden){e.stopPropagation();close();}});
 get('form').addEventListener('submit',e=>{e.preventDefault();submit();});input.addEventListener('input',render);
 input.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();submit();}});
 questions.querySelectorAll('button').forEach(button=>button.addEventListener('click',()=>{input.value=button.textContent;render();submit();}));
})();
