(function () {
  'use strict'
  const localApi = document.currentScript?.dataset.billingApi
  const origin = localApi && ['localhost', '127.0.0.1'].includes(location.hostname) ? localApi : 'https://api.mamalead.com'
  const reconcile = () => {
    const href = new URL('/v1/download?platform=windows', origin).toString()
    document.querySelectorAll('[data-public-download="windows"]').forEach(link => { if (link.href !== href) link.href = href })
  }
  let queued = false
  new MutationObserver(() => {
    if (queued) return
    queued = true
    queueMicrotask(() => { queued = false; reconcile() })
  }).observe(document.documentElement, {childList:true, subtree:true})
  reconcile()
}())

// Event delegation also works after the static template hydrates.
;(function () {
  function closeMenu(focus) {
    const button=document.querySelector('.mobile-menu-button'), menu=document.getElementById('mobile-menu')
    if (!button || !menu) return
    button.setAttribute('aria-expanded','false'); button.setAttribute('aria-label','Open menu'); menu.setAttribute('data-open','false'); menu.hidden=true
    if(focus)button.focus()
  }
  document.addEventListener('click',event=>{
    const button=event.target.closest('.mobile-menu-button')
    if(button){const menu=document.getElementById('mobile-menu');const open=button.getAttribute('aria-expanded')!=='true';button.setAttribute('aria-expanded',String(open));button.setAttribute('aria-label',open?'Close menu':'Open menu');menu.setAttribute('data-open',String(open));menu.hidden=!open;return}
    if(event.target.closest('#mobile-menu a') || !event.target.closest('.site-header'))closeMenu(false)
  })
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&document.querySelector('.mobile-menu-button[aria-expanded="true"]'))closeMenu(true)})
  matchMedia('(max-width:640px)').addEventListener('change',()=>closeMenu(false))
}())
