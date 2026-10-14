import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status }
}

const hash = (token) => createHash('sha256').update(token).digest('hex')
const normalizeLicense = (value) => String(value ?? '').trim().toUpperCase().replace(/\s+/g, '')
const licensePattern = /^NF(?:-[A-Z0-9]{4}){10}$/
const createLicenseKey = () => {
  const hex = randomBytes(20).toString('hex').toUpperCase()
  return `NF-${hex.match(/.{4}/g).join('-')}`
}
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]))
const json = (status, body) => ({
  status,
  body: JSON.stringify(body),
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' },
})
const page = (title, message) => ({
  status: 200,
  body: `<!doctype html><html><meta charset="utf-8"><title>${title}</title><body style="font:16px system-ui;max-width:38rem;margin:5rem auto;padding:1rem"><h1>${title}</h1><p>${message}</p></body></html>`,
  headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'", 'x-content-type-options': 'nosniff' },
})

export function createBillingHandler({ env = process.env, store, fetch: stripeFetch = fetch, getBlob = null, getLocalInstaller = null, sendEmail = null }) {
  const port = Number(env.BILLING_PORT ?? 38747)
  const publicUrl = new URL(env.BILLING_PUBLIC_URL ?? `http://127.0.0.1:${port}`)
  const key = env.STRIPE_SECRET_KEY ?? ''
  const mode = key.includes('_live_') ? 'live' : 'test'
  const prices = { lifetime: env.STRIPE_PRICE_LIFETIME ?? '' }
  if (!/^(sk|rk)_(test|live)_[A-Za-z0-9]+$/.test(key)) throw new Error('A server-side Stripe key is required.')
  if (!/^price_[A-Za-z0-9]+$/.test(prices.lifetime)) throw new Error('The Lifetime Stripe Price ID is required.')
  if (publicUrl.username || publicUrl.password || publicUrl.search || publicUrl.hash || publicUrl.pathname !== '/' ||
    (publicUrl.protocol !== 'https:' && !(publicUrl.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(publicUrl.hostname)))) {
    throw new Error('Billing public URL must be an HTTPS origin, or localhost for testing.')
  }

  function deliveryCipherKey() {
    const secret = env.DOWNLOAD_SIGNING_KEY?.trim()
    if (!secret || secret.length < 32) throw new HttpError(503, 'License delivery encryption is not configured.')
    return createHmac('sha256', secret).update('nafran-license-delivery-v1').digest()
  }

  function encryptLicenseKey(licenseKey) {
    const nonce = randomBytes(12)
    const cipher = createCipheriv('aes-256-gcm', deliveryCipherKey(), nonce)
    const encrypted = Buffer.concat([cipher.update(licenseKey, 'utf8'), cipher.final()])
    return [nonce, cipher.getAuthTag(), encrypted].map((part) => part.toString('base64url')).join('.')
  }

  function decryptLicenseKey(value) {
    if (!value) throw new HttpError(503, 'This license needs manual delivery recovery.')
    try {
      const [nonce, tag, encrypted] = value.split('.').map((part) => Buffer.from(part, 'base64url'))
      if (nonce.length !== 12 || tag.length !== 16 || !encrypted.length) throw new Error('Invalid ciphertext')
      const decipher = createDecipheriv('aes-256-gcm', deliveryCipherKey(), nonce)
      decipher.setAuthTag(tag)
      return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8')
    } catch {
      throw new HttpError(503, 'License delivery recovery failed.')
    }
  }

  async function stripe(path, fields) {
    const response = await stripeFetch(`https://api.stripe.com/v1/${path}`, {
      method: fields ? 'POST' : 'GET',
      headers: { authorization: `Bearer ${key}`, ...(fields ? { 'content-type': 'application/x-www-form-urlencoded' } : {}) },
      body: fields ? new URLSearchParams(fields) : undefined,
      signal: AbortSignal.timeout(20_000),
    })
    const result = await response.json()
    if (!response.ok) throw new HttpError(502, result?.error?.message || 'Stripe request failed.')
    return result
  }

  async function installation(authorization, deviceId, devicePlatform) {
    const token = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(authorization ?? '')?.[1]
    if (!token) throw new HttpError(401, 'Billing installation token is missing.')
    const row = await store.byTokenHash(hash(token))
    if (!row) throw new HttpError(401, 'Billing installation token is invalid.')
    if (row.device_id) {
      if (deviceId !== row.device_id) throw new HttpError(403, 'This installation belongs to a different device.')
    } else if (deviceId) {
      if (typeof store.bindDevice !== 'function' || !(await store.bindDevice(row.id, deviceId, devicePlatform))) {
        throw new HttpError(403, 'This installation belongs to a different device.')
      }
      row.device_id = deviceId
    }
    return row
  }

  async function price(id) {
    const item = await stripe(`prices/${encodeURIComponent(id)}`)
    if (!item.active || item.currency !== 'usd') throw new HttpError(502, 'The configured Stripe Price is not active in USD.')
    return { amount: item.unit_amount, currency: item.currency, interval: item.recurring?.interval ?? null }
  }

  async function paidLifetimeSession(session, installationId) {
    if (session?.mode !== 'payment' || session?.status !== 'complete' || session?.payment_status !== 'paid' ||
      session?.client_reference_id !== installationId || session?.livemode !== (mode === 'live') ||
      !/^pi_[A-Za-z0-9]+$/.test(session?.payment_intent ?? '')) return false
    const intent = await stripe(`payment_intents/${encodeURIComponent(session.payment_intent)}`)
    if (intent.status !== 'succeeded' || !/^ch_[A-Za-z0-9]+$/.test(intent.latest_charge ?? '')) return false
    const charge = await stripe(`charges/${encodeURIComponent(intent.latest_charge)}`)
    return charge.paid === true && charge.refunded !== true && Number(charge.amount_refunded ?? 0) === 0 && charge.disputed !== true
  }

  async function verifiedStatus(row) {
    for (const sessionId of [row.pending_lifetime_session_id]) {
      if (!sessionId) continue
      const pending = await stripe(`checkout/sessions/${encodeURIComponent(sessionId)}`)
      if (pending.status === 'complete' && pending.payment_status === 'paid' &&
        (pending.metadata?.product !== 'lifetime' || await paidLifetimeSession(pending, row.id))) await reconcile(sessionId)
    }
    row = await store.byId(row.id)
    const lifetimePrice = await price(prices.lifetime)
    if (lifetimePrice.amount !== 3000 || lifetimePrice.interval) throw new HttpError(502, 'The configured Lifetime Price must be $30 one-time.')
    let lifetimeActive = false
    const linkedLicense = typeof store.licenseForInstallation === 'function' ? await store.licenseForInstallation(row.id) : null
    const isTrial = linkedLicense?.kind === 'trial'
    const purchaseRow = linkedLicense && !isTrial ? await store.byId(linkedLicense.installation_id) : row
    if (purchaseRow?.lifetime_session_id) {
      const session = await stripe(`checkout/sessions/${encodeURIComponent(purchaseRow.lifetime_session_id)}`)
      lifetimeActive = await paidLifetimeSession(session, purchaseRow.id)
    }
    const trialExpiry = isTrial && linkedLicense.expires_at ? Date.parse(linkedLicense.expires_at) : 0
    const trialActive = Boolean(isTrial && !linkedLicense.revoked_at && linkedLicense.bound_installation_id === row.id && trialExpiry > Date.now())
    const licenseActive = Boolean(linkedLicense && !linkedLicense.revoked_at && (isTrial ? trialActive : lifetimeActive))
    return {
      configured: true, connected: true, mode,
      lifetime: { ...lifetimePrice, active: lifetimeActive },
      trial: { active: trialActive, expiresAt: isTrial ? linkedLicense.expires_at ?? null : null },
      decisionMaker: { amount: 0, currency: 'usd', interval: null, active: licenseActive, status: 'included', includedPeople: 1000 },
      hasCustomer: Boolean(purchaseRow?.customer_id),
      license: linkedLicense ? { active: licenseActive, kind: isTrial ? 'trial' : 'lifetime', email: linkedLicense.email, last4: linkedLicense.key_last4, activatedAt: linkedLicense.activated_at ?? null, expiresAt: isTrial ? linkedLicense.expires_at ?? null : null } : { active: false },
    }
  }

  async function reconcile(sessionId) {
    if (!/^cs_(test_|live_)?[A-Za-z0-9]+$/.test(sessionId)) throw new HttpError(400, 'Invalid Checkout Session ID.')
    const session = await stripe(`checkout/sessions/${encodeURIComponent(sessionId)}`)
    const row = await store.byId(session.client_reference_id)
    if (!row || session.livemode !== (mode === 'live')) throw new HttpError(400, 'Checkout Session does not belong to this billing server.')
    const product = session.metadata?.product
    if (product !== 'lifetime') throw new HttpError(400, 'Unknown Checkout product.')
    const items = await stripe(`checkout/sessions/${encodeURIComponent(sessionId)}/line_items?limit=1`)
    if (items.data?.[0]?.price?.id !== prices.lifetime) throw new HttpError(400, 'Checkout Price does not match this product.')
    if (!(await paidLifetimeSession(session, row.id))) throw new HttpError(409, 'Payment is not active.')
    await store.saveLifetime(row.id, session.id, session.customer)
    return row
  }

  async function sendLicenseEmail(to, licenseKey, kind = 'lifetime', deliveryId = '') {
    const download = new URL('/#download', env.APP_PUBLIC_URL || publicUrl).toString()
    if (sendEmail) return Boolean(await sendEmail({ to, licenseKey, download, kind, deliveryId }))
    const apiKey = env.RESEND_API_KEY?.trim()
    const from = env.EMAIL_FROM?.trim()
    if (!apiKey || !from) return false
    const response = await stripeFetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json', 'idempotency-key': `nafran-${kind}-${deliveryId}` },
      body: JSON.stringify({
        from,
        to: [to],
        subject: kind === 'trial' ? 'Your Nafran 1-day trial key' : 'Your Nafran Leads Scraper lifetime license',
        text: `${kind === 'trial' ? 'Your trial lasts 24 hours from its first activation on one machine.' : 'Thank you for your purchase. Your lifetime license works on up to two machines.'}\n\nLicense key: ${licenseKey}\n\nDownload the installer at ${download}, then enter the key in Nafran Leads Scraper → Settings → Account.\n`,
        html: `<p>${kind === 'trial' ? 'Your trial lasts 24 hours from its first activation on one machine.' : 'Thank you for your purchase. Your lifetime license works on up to two machines.'}</p><p><strong>License key:</strong> <code>${escapeHtml(licenseKey)}</code></p><p><a href="${escapeHtml(download)}">Download the installer</a>, then enter the key in Nafran Leads Scraper → Settings → Account.</p>`,
      }),
      signal: AbortSignal.timeout(20_000),
    })
    return response.ok
  }

  async function issueLicense(row) {
    if (typeof store.licenseForPurchase !== 'function' || typeof store.createLicense !== 'function') throw new HttpError(503, 'License storage is not configured.')
    const existing = await store.licenseForPurchase(row.id)
    if (existing) {
      if (!existing.sent_at) {
        const pendingKey = decryptLicenseKey(existing.encrypted_key)
        const delivered = await sendLicenseEmail(existing.email, pendingKey, 'lifetime', existing.id).catch(() => false)
        if (!delivered) throw new HttpError(503, 'License email could not be delivered. Please try again later.')
        await store.markLicenseSent(existing.id, new Date().toISOString())
      }
      return { licenseKey: null, email: existing.email, emailSent: true, last4: existing.key_last4, downloadAvailable: downloadConfigured() }
    }
    const fresh = await store.byId(row.id)
    if (!fresh?.lifetime_session_id) throw new HttpError(409, 'Complete the Lifetime purchase before requesting a license.')
    const session = await stripe(`checkout/sessions/${encodeURIComponent(fresh.lifetime_session_id)}`)
    const email = session.customer_details?.email || session.customer_email || ''
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new HttpError(409, 'Stripe did not provide a valid customer email for this purchase.')
    const licenseKey = createLicenseKey()
    let created
    try {
      created = await store.createLicense({ id: randomUUID(), installationId: row.id, keyHash: hash(normalizeLicense(licenseKey)), keyLast4: licenseKey.slice(-4), encryptedKey: encryptLicenseKey(licenseKey), email, createdAt: new Date().toISOString() })
    } catch (error) {
      const concurrent = await store.licenseForPurchase(row.id)
      if (concurrent) return issueLicense(row)
      throw error
    }
    const emailSent = await sendLicenseEmail(email, licenseKey, 'lifetime', created.id).catch(() => false)
    if (!emailSent) throw new HttpError(503, 'License email could not be delivered. Please try again later.')
    await store.markLicenseSent(created.id, new Date().toISOString())
    return { licenseKey, email, emailSent: true, last4: licenseKey.slice(-4), downloadAvailable: downloadConfigured() }
  }

  async function issueTrial(row, rawEmail) {
    if (!sendEmail && (!env.RESEND_API_KEY?.trim() || !env.EMAIL_FROM?.trim())) throw new HttpError(503, 'Trial email delivery is not configured yet.')
    const email = String(rawEmail ?? '').trim().toLowerCase()
    if (email.length > 254 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new HttpError(400, 'Enter a valid email address for your trial key.')
    if (typeof store.trialByEmail !== 'function' || typeof store.createTrial !== 'function') throw new HttpError(503, 'Trial storage is not configured.')
    if (await store.trialByEmail(email) || await store.trialForInstallation(row.id)) throw new HttpError(409, 'A 1-day trial has already been requested for this email or browser.')
    const licenseKey = createLicenseKey()
    const id = randomUUID()
    try {
      await store.createTrial({ id, installationId: row.id, keyHash: hash(normalizeLicense(licenseKey)), keyLast4: licenseKey.slice(-4), email, createdAt: new Date().toISOString() })
    } catch {
      throw new HttpError(409, 'A 1-day trial has already been requested for this email or browser.')
    }
    let sent = false
    try { sent = await sendLicenseEmail(email, licenseKey, 'trial', id) } catch { sent = false }
    if (!sent) {
      await store.deleteUnsentTrial(id)
      throw new HttpError(503, 'Trial email could not be delivered. Please try again later.')
    }
    await store.markTrialSent(id, new Date().toISOString())
    return { emailSent: true, message: 'Your 1-day trial key was emailed to you. It starts when first activated in the app.' }
  }

  async function activateLicense(row, licenseKey) {
    if (typeof store.licenseByHash !== 'function' || typeof store.attachLicense !== 'function') throw new HttpError(503, 'License storage is not configured.')
    const normalized = normalizeLicense(licenseKey)
    if (!licensePattern.test(normalized)) throw new HttpError(400, 'Enter the license key exactly as it appears in the email.')
    const license = await store.licenseByHash(hash(normalized))
    if (!license || license.revoked_at) throw new HttpError(401, 'This license key is invalid or revoked.')
    const isTrial = license.kind === 'trial'
    if (isTrial) {
      if (!license.sent_at) throw new HttpError(403, 'This trial key has not been delivered.')
      if (license.expires_at && Date.parse(license.expires_at) <= Date.now()) throw new HttpError(403, 'This 1-day trial has expired.')
      if (license.bound_installation_id && license.bound_installation_id !== row.id) throw new HttpError(409, 'This trial key is already active on another machine.')
    } else {
      const originalInstallation = await store.byId(license.installation_id)
      if (!originalInstallation || !(await verifiedStatus(originalInstallation)).lifetime.active) throw new HttpError(403, 'The purchase behind this license is not active.')
    }
    const current = await store.licenseForInstallation(row.id)
    if (current?.id === license.id) return { active: true, kind: isTrial ? 'trial' : 'lifetime', email: license.email, last4: license.key_last4, activatedAt: license.activated_at ?? null, expiresAt: isTrial ? license.expires_at : null }
    if (isTrial) {
      const activatedAt = new Date().toISOString()
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      const activated = await store.activateTrial(row.id, license.id, activatedAt, expiresAt)
      if (!activated) throw new HttpError(409, 'This trial key is already used or expired.')
      return { active: true, kind: 'trial', email: license.email, last4: license.key_last4, activatedAt: activated.activated_at, expiresAt: activated.expires_at }
    }
    const max = Math.max(1, Math.min(20, Number(env.LICENSE_MAX_ACTIVATIONS ?? 2)))
    const count = typeof store.countLicenseActivations === 'function' ? await store.countLicenseActivations(license.id) : 0
    if (count >= max) throw new HttpError(409, `This license is already active on ${max} machines.`)
    if (await store.attachLicense(row.id, license.id, new Date().toISOString(), max) === false) {
      throw new HttpError(409, `This license is already active on ${max} machines.`)
    }
    return { active: true, kind: 'lifetime', email: license.email, last4: license.key_last4, activatedAt: new Date().toISOString(), expiresAt: null }
  }

  function signedDownloadGrant(subjectId) {
    const secret = env.DOWNLOAD_SIGNING_KEY?.trim()
    if (!secret) throw new HttpError(503, 'Protected downloads are not configured yet.')
    const expires = Math.floor(Date.now() / 1000) + 5 * 60
    const payload = `${subjectId}.${expires}.${randomBytes(10).toString('base64url')}`
    const signature = createHmac('sha256', secret).update(payload).digest('base64url')
    return `${payload}.${signature}`
  }

  function verifyDownloadGrant(grant) {
    const secret = env.DOWNLOAD_SIGNING_KEY?.trim()
    const parts = String(grant ?? '').split('.')
    if (!secret || parts.length !== 4 || !/^(?:trial-)?[0-9a-f-]{20,}$/.test(parts[0])) throw new HttpError(401, 'Download link is invalid.')
    const [subjectId, expiry, nonce, signature] = parts
    const expected = createHmac('sha256', secret).update(`${subjectId}.${expiry}.${nonce}`).digest('base64url')
    if (signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected)) || Number(expiry) < Math.floor(Date.now() / 1000)) throw new HttpError(401, 'Download link has expired.')
    return subjectId
  }

  function downloadConfigured() {
    if (env.BLOB_DOWNLOAD_PATH?.trim()) return true
    if (env.LOCAL_DOWNLOAD_PATH?.trim() && getLocalInstaller) return true
    return ['localhost', '127.0.0.1'].includes(publicUrl.hostname) && /^https:\/\//.test(env.DOWNLOAD_URL?.trim() ?? '')
  }

  async function downloadLink(row) {
    const status = await verifiedStatus(row)
    if (!status.license?.active && !status.lifetime?.active) throw new HttpError(403, 'An active trial or lifetime purchase is required to download the app.')
    if (!downloadConfigured()) throw new HttpError(503, 'The protected installer is not configured yet.')
    return { url: new URL(`/v1/download?grant=${encodeURIComponent(signedDownloadGrant(row.id))}`, publicUrl).toString() }
  }

  function verifyWebhookSignature(raw, signature) {
    const secret = env.STRIPE_WEBHOOK_SECRET?.trim()
    if (!secret) throw new HttpError(503, 'Stripe webhook signing secret is not configured.')
    const pieces = String(signature ?? '').split(',')
    const timestamp = pieces.find((part) => part.startsWith('t='))?.slice(2)
    const signed = pieces.find((part) => part.startsWith('v1='))?.slice(3)
    if (!timestamp || !signed || Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp)) > 300) throw new HttpError(400, 'Invalid Stripe webhook signature.')
    const expected = createHmac('sha256', secret).update(`${timestamp}.${raw}`).digest('hex')
    if (signed.length !== expected.length || !timingSafeEqual(Buffer.from(signed), Buffer.from(expected))) throw new HttpError(400, 'Invalid Stripe webhook signature.')
  }

  async function jsonBody(readBody) {
    const raw = await readBody()
    if (raw.length > 16_384) throw new HttpError(413, 'Request is too large.')
    try { return raw ? JSON.parse(raw) : {} } catch { throw new HttpError(400, 'Invalid JSON.') }
  }

  async function handle({ method, url: rawUrl, authorization, deviceId: rawDeviceId, devicePlatform: rawDevicePlatform, stripeSignature, readBody = async () => '' }) {
    try {
      const url = new URL(rawUrl, publicUrl)
      const deviceId = rawDeviceId && /^[a-f0-9]{64}$/.test(rawDeviceId) ? rawDeviceId : null
      const devicePlatform = rawDevicePlatform && /^[A-Za-z0-9 ._()-]{1,64}$/.test(rawDevicePlatform) ? rawDevicePlatform : null
      if (rawDeviceId && !deviceId) throw new HttpError(400, 'Invalid device identity.')
      if (method === 'GET' && url.pathname === '/health') return json(200, { ok: true, mode })
      if (method === 'GET' && url.pathname === '/') return page('MamaLead billing', 'Return to MamaLead to view your billing status.')
      if (method === 'GET' && url.pathname === '/cancel') return page('Checkout cancelled', 'No purchase was completed. You can return to MamaLead.')
      if (method === 'GET' && url.pathname === '/return') {
        await reconcile(url.searchParams.get('session_id') ?? '')
        return page('Purchase confirmed', 'Your Stripe payment was verified. Return to MamaLead and refresh Billing.')
      }
      if (method === 'POST' && url.pathname === '/webhooks/stripe') {
        const raw = await readBody()
        verifyWebhookSignature(raw, stripeSignature)
        const event = JSON.parse(raw)
        if (event.type === 'checkout.session.completed' && event.data?.object?.id) {
          const purchase = await reconcile(event.data.object.id)
          await issueLicense(purchase)
        }
        if (event.type === 'customer.subscription.deleted' && event.data?.object?.id && typeof store.revokeDecision === 'function') await store.revokeDecision(event.data.object.id)
        if (event.id && typeof store.claimWebhookEvent === 'function') await store.claimWebhookEvent(event.id)
        return json(200, { received: true })
      }
      if (method === 'POST' && url.pathname === '/v1/installations') {
        const token = randomBytes(32).toString('base64url')
        const id = randomUUID()
        await store.create(id, hash(token), new Date().toISOString(), deviceId, devicePlatform)
        return json(201, { token })
      }
      if (method === 'POST' && url.pathname === '/v1/download-by-license') {
        const { licenseKey } = await jsonBody(readBody)
        const normalized = normalizeLicense(licenseKey)
        if (!licensePattern.test(normalized)) throw new HttpError(400, 'Enter a valid Nafran license key.')
        const license = await store.licenseByHash(hash(normalized))
        if (!license || license.revoked_at) throw new HttpError(401, 'This license key is invalid or revoked.')
        if (license.kind === 'trial') {
          if (!license.sent_at || (license.expires_at && Date.parse(license.expires_at) <= Date.now())) throw new HttpError(403, 'This trial key is not active.')
          if (!downloadConfigured()) throw new HttpError(503, 'The protected installer is not configured yet.')
          return json(200, { url: new URL(`/v1/download?grant=${encodeURIComponent(signedDownloadGrant(`trial-${license.id}`))}`, publicUrl).toString() })
        }
        const purchasedInstallation = await store.byId(license.installation_id)
        if (!purchasedInstallation) throw new HttpError(401, 'This license key is invalid or revoked.')
        return json(200, await downloadLink(purchasedInstallation))
      }
      if (url.pathname.startsWith('/v1/') && url.pathname !== '/v1/download') {
        const row = await installation(authorization, deviceId, devicePlatform)
        if (method === 'GET' && url.pathname === '/v1/status') {
          if (row.license_id && !deviceId) throw new HttpError(403, 'Update the app to verify this device before using a license.')
          const status = await verifiedStatus(row)
          if (typeof store.markSeen === 'function') { try { await store.markSeen(row.id, new Date().toISOString()) } catch {} }
          return json(200, status)
        }
        if (method === 'POST' && url.pathname === '/v1/trial') {
          const { email } = await jsonBody(readBody)
          return json(200, await issueTrial(row, email))
        }
        if (method === 'POST' && url.pathname === '/v1/checkout') {
          if (mode === 'live' && publicUrl.protocol !== 'https:') throw new HttpError(503, 'Live Checkout requires a hosted HTTPS billing URL.')
          const { product } = await jsonBody(readBody)
          if (product !== 'lifetime') throw new HttpError(400, 'Only the $30 Lifetime Deal is available.')
          const current = await verifiedStatus(row)
          if (current.lifetime.active) throw new HttpError(409, 'The Lifetime Deal is already purchased for this installation.')
          const fresh = await store.byId(row.id)
          const pendingId = fresh.pending_lifetime_session_id
          if (pendingId) {
            const pending = await stripe(`checkout/sessions/${encodeURIComponent(pendingId)}`)
            if (pending.status === 'open' && /^https:\/\/checkout\.stripe\.com\//.test(pending.url ?? '')) return json(200, { url: pending.url })
            if (pending.status === 'complete') throw new HttpError(409, 'A payment is processing. Refresh billing before starting another checkout.')
          }
          const fields = {
            mode: 'payment',
            'line_items[0][price]': prices.lifetime, 'line_items[0][quantity]': '1',
            client_reference_id: row.id, 'metadata[product]': product,
            success_url: new URL(`/` + `?purchase=success&session_id={CHECKOUT_SESSION_ID}`, env.APP_PUBLIC_URL || publicUrl).toString(),
            cancel_url: new URL('/cancel', publicUrl).toString(),
          }
          if (row.customer_id) fields.customer = row.customer_id
          else fields.customer_creation = 'always'
          fields['invoice_creation[enabled]'] = 'true'
          const session = await stripe('checkout/sessions', fields)
          if (!/^https:\/\/checkout\.stripe\.com\//.test(session.url ?? '')) throw new HttpError(502, 'Stripe did not return a Checkout URL.')
          await store.savePending(row.id, product, session.id)
          return json(200, { url: session.url })
        }
        if (method === 'POST' && url.pathname === '/v1/portal') {
          if (!row.customer_id) throw new HttpError(409, 'No Stripe customer is connected yet.')
          const portal = await stripe('billing_portal/sessions', { customer: row.customer_id, return_url: new URL('/', publicUrl).toString() })
          if (!/^https:\/\/billing\.stripe\.com\//.test(portal.url ?? '')) throw new HttpError(502, 'Stripe did not return a portal URL.')
          return json(200, { url: portal.url })
        }
        if (method === 'GET' && url.pathname === '/v1/invoices') {
          if (!row.customer_id) return json(200, { invoices: [] })
          const data = await stripe(`invoices?customer=${encodeURIComponent(row.customer_id)}&limit=100`)
          const invoices = (data.data ?? []).map((invoice) => ({ id: invoice.id, number: invoice.number ?? '', issued: invoice.created ? new Date(invoice.created * 1000).toISOString().slice(0, 10) : '', total: invoice.total ?? 0, currency: invoice.currency ?? 'usd', status: invoice.status ?? '', url: invoice.hosted_invoice_url ?? '' }))
          return json(200, { invoices })
        }
        if (method === 'POST' && url.pathname === '/v1/license') {
          const status = await verifiedStatus(row)
          if (!status.lifetime?.active) throw new HttpError(409, 'Complete the Lifetime purchase before requesting a license.')
          return json(200, await issueLicense(row))
        }
        if (method === 'POST' && url.pathname === '/v1/activate') {
          if (!deviceId) throw new HttpError(400, 'A device identity is required to activate a license.')
          const body = await jsonBody(readBody)
          return json(200, await activateLicense(row, body.licenseKey))
        }
        if (method === 'POST' && url.pathname === '/v1/download-link') {
          return json(200, await downloadLink(row))
        }
      }
      if (method === 'GET' && url.pathname === '/v1/download') {
        // No grant means the installer is free to download. A supplied but invalid
        // grant still fails, so old signed links retain their existing semantics.
        const subjectId = url.searchParams.has('grant') ? verifyDownloadGrant(url.searchParams.get('grant')) : null
        const download = env.DOWNLOAD_URL?.trim()
        if (!downloadConfigured()) throw new HttpError(503, 'The protected installer is not configured yet.')
        let downloadInstallationId = subjectId
        if (subjectId?.startsWith('trial-')) {
          const trial = await store.trialById(subjectId.slice(6))
          if (!trial || !trial.sent_at || trial.revoked_at || (trial.expires_at && Date.parse(trial.expires_at) <= Date.now())) throw new HttpError(403, 'This trial download grant is no longer active.')
          downloadInstallationId = trial.installation_id
        } else if (subjectId) {
          const row = await store.byId(subjectId)
          const status = row ? await verifiedStatus(row) : null
          if (!status?.license?.active && !status?.lifetime?.active) throw new HttpError(403, 'This download grant is no longer active.')
        }
        const recordDownload = async () => {
          try {
            if (subjectId && typeof store.recordDownload === 'function') await store.recordDownload(randomUUID(), downloadInstallationId, new Date().toISOString())
            else if (!subjectId && typeof store.recordPublicDownload === 'function') await store.recordPublicDownload(randomUUID(), new Date().toISOString())
          } catch {}
        }
        if (env.BLOB_DOWNLOAD_PATH?.trim()) {
          if (!getBlob) throw new HttpError(503, 'Private installer storage is unavailable.')
          const blob = await getBlob(env.BLOB_DOWNLOAD_PATH.trim(), { access: 'private' })
          if (blob?.statusCode !== 200 || !blob.stream) throw new HttpError(503, 'The protected installer is not available yet.')
          await recordDownload()
          return { status: 200, body: blob.stream, headers: { 'content-type': blob.blob?.contentType || 'application/octet-stream', 'content-disposition': `attachment; filename="${env.BLOB_DOWNLOAD_FILENAME?.trim() || 'Nafran-Leads-Scraper-Setup.exe'}"`, 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' } }
        }
        if (env.LOCAL_DOWNLOAD_PATH?.trim()) {
          const local = await getLocalInstaller?.(env.LOCAL_DOWNLOAD_PATH.trim())
          if (!local?.stream || !Number.isSafeInteger(local.size) || local.size < 1) throw new HttpError(503, 'The protected installer is not available yet.')
          const filename = (env.LOCAL_DOWNLOAD_FILENAME?.trim() || 'Nafran-Leads-Scraper-Setup.exe').replace(/["\\\r\n]/g, '_')
          await recordDownload()
          return { status: 200, body: local.stream, headers: { 'content-type': 'application/octet-stream', 'content-length': String(local.size), 'content-disposition': `attachment; filename="${filename}"`, 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' } }
        }
        await recordDownload()
        return { status: 302, body: '', headers: { location: download, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } }
      }
      throw new HttpError(404, 'Endpoint not found.')
    } catch (error) {
      return json(error instanceof HttpError ? error.status : 500, { error: error instanceof HttpError ? error.message : 'Billing server error.' })
    }
  }

  return { handle, mode, publicUrl }
}
