(function () {
  'use strict'
  const scriptApi = document.currentScript?.dataset.billingApi
  const billingOrigin = scriptApi && ['localhost', '127.0.0.1'].includes(window.location.hostname)
    ? scriptApi
    : 'https://api.mamalead.com'
  const tokenKey = 'nafran.billing.installation.' + new URL(billingOrigin).host
  const api = (path) => new URL(path, billingOrigin).toString()
  const readToken = () => localStorage.getItem(tokenKey) || ''
  const saveToken = (token) => { if (/^[A-Za-z0-9_-]{43}$/.test(token)) localStorage.setItem(tokenKey, token) }
  async function request(path, options) {
    const headers = Object.assign({}, options && options.headers)
    const token = readToken()
    if (token) headers.authorization = 'Bearer ' + token
    const response = await fetch(api(path), Object.assign({}, options, { headers }))
    const body = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(body.error || 'Request failed (' + response.status + ').')
    return body
  }
  async function ensureToken() {
    const token = readToken()
    if (token) return token
    const body = await request('/v1/installations', { method: 'POST' })
    saveToken(body.token)
    return body.token
  }
  const banner = (message, error, sticky) => {
    let node = document.querySelector('[data-purchase-status]')
    if (!node) {
      node = document.createElement('div')
      node.dataset.purchaseStatus = '1'
      node.style.cssText = 'position:fixed;z-index:9999;left:50%;bottom:22px;transform:translateX(-50%);max-width:min(640px,calc(100% - 32px));padding:14px 18px;border-radius:16px;background:#1c1c1c;color:#fff;box-shadow:0 16px 40px #0003;font:14px/1.45 system-ui,sans-serif'
      document.body.appendChild(node)
    }
    node.textContent = message
    node.style.background = error ? '#7e302b' : '#1c1c1c'
    clearTimeout(node._hide)
    if (!sticky) node._hide = setTimeout(() => node.remove(), error ? 9000 : 7000)
    return node
  }
  async function buy(product) {
    try {
      await ensureToken()
      const body = await request('/v1/checkout', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ product }) })
      window.location.assign(body.url)
    } catch (error) { banner(error instanceof Error ? error.message : 'Checkout could not be started.', true) }
  }
  async function finishPurchase() {
    if (!new URLSearchParams(window.location.search).has('purchase')) return
    try {
      await ensureToken()
      const license = await request('/v1/license', { method: 'POST' })
      const message = license.licenseKey
        ? 'Payment verified. Your license is ' + license.licenseKey + (license.emailSent ? '. It was also emailed to you.' : '. Save this key; email delivery is not configured yet.')
        : 'Your license is already issued and ends in ' + license.last4 + '.'
      const status = banner(message, false, true)
      if (license.downloadAvailable) {
        const download = await request('/v1/download-link', { method: 'POST' })
        const link = document.createElement('a')
        link.href = download.url
        link.textContent = ' Download the installer'
        link.style.cssText = 'color:#c8d5bb;margin-left:8px'
        status.appendChild(link)
      }
      history.replaceState({}, '', window.location.pathname + window.location.hash)
    } catch (error) { banner(error instanceof Error ? error.message : 'Payment is still being verified. Refresh in a moment.', true) }
  }
  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-buy-product]')
    if (!button) return
    event.preventDefault()
    void buy(button.dataset.buyProduct)
  })
  document.addEventListener('submit', async (event) => {
    if (!event.target.matches('[data-trial-request]')) return
    event.preventDefault()
    const form = event.target
    const email = form.elements.namedItem('email')?.value?.trim()
    const button = form.querySelector('button[type="submit"]')
    if (!email || !button) return
    button.disabled = true
    try {
      await ensureToken()
      const result = await request('/v1/trial', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email }) })
      banner(result.message || 'Your trial key was emailed to you.', false, true)
      form.reset()
    } catch (error) { banner(error instanceof Error ? error.message : 'Trial key could not be requested.', true) }
    finally { button.disabled = false }
  }, true)
  document.addEventListener('submit', async (event) => {
    if (!event.target.matches('[data-license-download]')) return
    event.preventDefault()
    const input = event.target.elements.namedItem('licenseKey')
    try {
      const body = await request('/v1/download-by-license', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ licenseKey: input.value }) })
      const node = banner('License verified. ', false, true)
      const link = document.createElement('a')
      link.href = body.url
      link.textContent = 'Download the Windows installer'
      link.style.cssText = 'color:#c8d5bb'
      node.appendChild(link)
      input.value = ''
    } catch (error) { banner(error instanceof Error ? error.message : 'License could not be verified.', true) }
  }, true)
  void finishPurchase()
}())
