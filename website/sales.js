(function () {
  'use strict'

  const scriptApi = document.currentScript?.dataset.billingApi
  const billingOrigin = scriptApi && ['localhost', '127.0.0.1'].includes(window.location.hostname)
    ? scriptApi
    : 'https://api.mamalead.com'
  const api = (path) => new URL(path, billingOrigin).toString()
  const macDownloads = {
    'mac-arm64': { key: 'macArm64', label: 'Download for Mac · Apple Silicon', hint: 'Newer Macs · M1 or newer' },
    'mac-x64': { key: 'macX64', label: 'Download for Mac · Intel', hint: 'Older Macs · Intel processor' },
  }
  const isMac = /Mac/i.test(navigator.userAgentData?.platform || navigator.platform || navigator.userAgent)
  let downloadOptions = null
  let statusMessage = ''

  // The landing page renderer can replace its cards after this script runs.
  // Reapply download links and notices to the current elements after a render.
  const reconcile = () => {
    document.querySelectorAll('[data-public-download="windows"]').forEach((link) => {
      const href = api('/v1/download?platform=windows')
      if (link.href !== href) link.href = href
    })
    for (const [platform, choice] of Object.entries(macDownloads)) {
      const link = document.querySelector(`[data-public-download="${platform}"]`)
      if (!link || !downloadOptions?.[choice.key]) continue
      const href = api(`/v1/download?platform=${platform}`)
      if (link.href !== href) link.href = href
      let title = link.querySelector('[data-download-title]')
      let hint = link.querySelector('[data-download-hint]')
      if (!title || !hint) {
        title = document.createElement('span')
        title.dataset.downloadTitle = ''
        hint = document.createElement('span')
        hint.dataset.downloadHint = ''
        link.replaceChildren(title, hint)
      }
      if (title.textContent !== choice.label) title.textContent = choice.label
      if (hint.textContent !== choice.hint) hint.textContent = choice.hint
      hint.style.cssText = 'font-size: 12px; font-weight: 400; line-height: 1.4; color: #C8D5BB;'
      link.style.flexDirection = 'column'
      link.style.gap = '4px'
      link.style.textAlign = 'center'
      link.removeAttribute('aria-disabled')
      link.style.cursor = 'pointer'
      link.style.background = '#1C1C1C'
      link.style.color = '#FFFFFF'
    }
    const macNote = document.querySelector('[data-mac-download-note]')
    if (macNote && (downloadOptions?.macArm64 || downloadOptions?.macX64)) {
      const message = 'Mac v1.4.11 · Open the DMG and drag MamaLead to Applications. Apple verification is pending; macOS may show a security warning on first open.'
      if (macNote.textContent !== message) macNote.textContent = message
    }
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
  if (document.querySelector('[data-public-download="mac-arm64"]')) {
    fetch(api('/v1/download-options'), { cache: 'no-store' })
      .then((response) => response.ok ? response.json() : null)
      .then((options) => { downloadOptions = options; reconcile() })
      .catch(() => {})
  }

  const setStatus = (message) => { statusMessage = message; reconcile() }
  let cancelHandoff = null
  const showDownload = () => {
    document.getElementById('download')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    window.location.hash = 'download'
    if (isMac) {
      setStatus('Choose Apple Silicon or Intel in Downloads, then install MamaLead and click Subscribe again.')
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
