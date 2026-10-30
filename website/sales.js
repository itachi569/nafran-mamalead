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
