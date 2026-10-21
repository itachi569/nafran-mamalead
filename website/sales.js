(function () {
  'use strict'

  const scriptApi = document.currentScript?.dataset.billingApi
  const billingOrigin = scriptApi && ['localhost', '127.0.0.1'].includes(window.location.hostname)
    ? scriptApi
    : 'https://api.mamalead.com'
  const api = (path) => new URL(path, billingOrigin).toString()
  const isWindows = /Win/i.test(navigator.userAgentData?.platform || navigator.platform || navigator.userAgent)
  let statusMessage = ''

  // The landing page renderer can replace its cards after this script runs.
  // Reapply download links and notices to the current elements after a render.
  const reconcile = () => {
    document.querySelectorAll('[data-public-download="windows"]').forEach((link) => {
      const href = api('/v1/download?platform=windows')
      if (link.href !== href) link.href = href
    })
    const status = document.querySelector('[data-decision-handoff-status]')
    if (status && status.textContent !== statusMessage) status.textContent = statusMessage
  }
  let reconcileQueued = false
  new MutationObserver(() => {
    if (reconcileQueued) return
    reconcileQueued = true
    queueMicrotask(() => { reconcileQueued = false; reconcile() })
  }).observe(document.documentElement, { childList: true, subtree: true })
  reconcile()


  const setStatus = (message) => { statusMessage = message; reconcile() }
  let cancelHandoff = null
  const showDownload = () => {
    document.getElementById('download')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    window.location.hash = 'download'
    if (!isWindows) {
      setStatus('Downloads are currently available for Windows 10 / 11 (64-bit). Open this page on a Windows computer to install MamaLead.')
      return
    }
    setStatus('Starting the Windows installer download. After installing MamaLead, click Subscribe again.')
    window.location.assign(api('/v1/download?platform=windows'))
  }
  document.addEventListener('click', (event) => {
    const link = event.target.closest?.('[data-decision-handoff="1"]')
    if (!link) return
    cancelHandoff?.()
    setStatus('Opening MamaLead payment. If the app is not installed, Downloads will open shortly.')
    let timer = null
    let appOpened = false
    const cleanup = () => {
      if (timer) clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('focus', onFocus)
      cancelHandoff = null
    }
    const onVisibility = () => {
      if (!document.hidden) return
      appOpened = true
      cleanup()
      setStatus('MamaLead opened. Complete the Decision Makers payment in the app.')
    }
    const fallback = () => {
      timer = null
      if (appOpened) { cleanup(); return }
      if (!document.hasFocus()) return
      cleanup()
      showDownload()
    }
    const onFocus = () => { if (!appOpened && !timer) timer = setTimeout(fallback, 500) }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('focus', onFocus)
    cancelHandoff = cleanup
    timer = setTimeout(fallback, 3000)
  }, true)
}())
