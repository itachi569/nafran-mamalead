import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status }
}

const hash = (token) => createHash('sha256').update(token).digest('hex')
const normalizeLicense = (value) => String(value ?? '').trim().toUpperCase().replace(/\s+/g, '')
const licensePattern = /^NF(?:-[A-Z0-9]{4}){10}$/
const TRIAL_MAP_LEADS_LIMIT = 500
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

export function createBillingHandler({ env = process.env, store, fetch: stripeFetch = fetch, getBlob = null, getLocalInstaller = null, hasLocalInstaller = null, sendEmail = null }) {
  const port = Number(env.BILLING_PORT ?? 38747)
  const publicUrl = new URL(env.BILLING_PUBLIC_URL ?? `http://127.0.0.1:${port}`)
  const key = env.STRIPE_SECRET_KEY ?? ''
  const mode = key.includes('_live_') ? 'live' : 'test'
  const prices = { lifetime: env.STRIPE_PRICE_LIFETIME ?? '', decisionMaker: env.STRIPE_PRICE_DECISION_MAKER ?? '' }
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

  async function activeDecisionPeriod(owner) {
    if (!owner?.decision_subscription_id || !prices.decisionMaker) return null
    const subscription = await stripe(`subscriptions/${encodeURIComponent(owner.decision_subscription_id)}`)
    if (subscription.id !== owner.decision_subscription_id || subscription.status !== 'active' ||
      subscription.livemode !== (mode === 'live') || subscription.customer !== owner.customer_id) return null
    const item = subscription.items?.data?.find((entry) => entry.price?.id === prices.decisionMaker)
    const start = Number(item?.current_period_start)
    const end = Number(item?.current_period_end)
    const now = Math.floor(Date.now() / 1000)
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > now || end <= now ||
      !/^in_[A-Za-z0-9]+$/.test(subscription.latest_invoice ?? '')) return null
    const invoice = await stripe(`invoices/${encodeURIComponent(subscription.latest_invoice)}`)
    if (invoice.status !== 'paid' || invoice.subscription !== subscription.id) return null
    return { key: `${subscription.id}:${start}`, renewsAt: new Date(end * 1000).toISOString() }
  }

  async function verifiedStatus(row) {
    for (const sessionId of [row.pending_lifetime_session_id, row.pending_decision_session_id]) {
      if (!sessionId) continue
      const pending = await stripe(`checkout/sessions/${encodeURIComponent(sessionId)}`)
      if (pending.status === 'complete' && pending.payment_status === 'paid') await reconcile(sessionId)
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
    const trialMapUsage = isTrial && typeof store.trialMapUsage === 'function'
      ? await store.trialMapUsage(linkedLicense.id, TRIAL_MAP_LEADS_LIMIT)
      : null
    let decisionPrice = { amount: 300, currency: 'usd', interval: 'month' }
    if (prices.decisionMaker) {
      decisionPrice = await price(prices.decisionMaker)
      if (decisionPrice.amount !== 300 || decisionPrice.interval !== 'month') throw new HttpError(502, 'The configured Decision Makers Price must be $3 per month.')
    }
    const decisionPeriod = licenseActive && !isTrial ? await activeDecisionPeriod(purchaseRow) : null
    const used = decisionPeriod ? await store.countDecisionUses(purchaseRow.id, decisionPeriod.key) : 0
    return {
      configured: true, connected: true, mode,
      lifetime: { ...lifetimePrice, active: lifetimeActive },
      trial: { active: trialActive, expiresAt: isTrial ? linkedLicense.expires_at ?? null : null },
      mapsLeads: isTrial
        ? { used: trialMapUsage?.used ?? 0, limit: TRIAL_MAP_LEADS_LIMIT, remaining: trialActive ? trialMapUsage?.remaining ?? 0 : 0 }
        : { used: null, limit: null, remaining: null },
      decisionMaker: { ...decisionPrice, available: Boolean(prices.decisionMaker), active: Boolean(decisionPeriod), status: decisionPeriod ? 'active' : 'not_subscribed', includedPeople: 0, monthlyLimit: 1000, monthlyUsed: used, monthlyRemaining: decisionPeriod ? Math.max(0, 1000 - used) : 0, renewsAt: decisionPeriod?.renewsAt ?? null },
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
    if (!['lifetime', 'decisionMaker'].includes(product)) throw new HttpError(400, 'Unknown Checkout product.')
    const items = await stripe(`checkout/sessions/${encodeURIComponent(sessionId)}/line_items?limit=1`)
    if (items.data?.[0]?.price?.id !== prices[product]) throw new HttpError(400, 'Checkout Price does not match this product.')
    if (product === 'decisionMaker') {
      if (session.mode !== 'subscription' || session.status !== 'complete' || session.payment_status !== 'paid' ||
        session.client_reference_id !== row.id || !/^sub_[A-Za-z0-9]+$/.test(session.subscription ?? '')) throw new HttpError(409, 'Subscription payment is not active.')
      const ownerStatus = await verifiedStatusForDecisionCheckout(row)
      if (!ownerStatus) throw new HttpError(403, 'A lifetime licence is required for Decision Makers.')
      const subscription = await stripe(`subscriptions/${encodeURIComponent(session.subscription)}`)
      if (subscription.status !== 'active' || subscription.customer !== row.customer_id || subscription.livemode !== (mode === 'live') ||
        !subscription.items?.data?.some((entry) => entry.price?.id === prices.decisionMaker) ||
        !/^in_[A-Za-z0-9]+$/.test(subscription.latest_invoice ?? '')) throw new HttpError(409, 'Subscription is not active.')
      const invoice = await stripe(`invoices/${encodeURIComponent(subscription.latest_invoice)}`)
      if (invoice.status !== 'paid' || invoice.subscription !== subscription.id) throw new HttpError(409, 'Subscription invoice is not paid.')
      await store.saveDecision(row.id, subscription.id, row.customer_id)
      return { ...row, product }
    }
    if (!(await paidLifetimeSession(session, row.id))) throw new HttpError(409, 'Payment is not active.')
    const reserved = typeof store.lifetimeCheckoutForInstallation === 'function' ? await store.lifetimeCheckoutForInstallation(row.id) : null
    if (reserved && (reserved.session_id !== session.id || reserved.customer_id !== session.customer ||
      reserved.email !== String(session.customer_details?.email || session.customer_email || '').trim().toLowerCase())) {
      throw new HttpError(409, 'Checkout email does not match this purchase.')
    }
    await store.saveLifetime(row.id, session.id, session.customer)
    return { ...row, product }
  }

  async function verifiedStatusForDecisionCheckout(row) {
    if (!row.lifetime_session_id || !row.customer_id) return false
    const session = await stripe(`checkout/sessions/${encodeURIComponent(row.lifetime_session_id)}`)
    return paidLifetimeSession(session, row.id)
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
    const email = String(session.customer_details?.email || session.customer_email || '').trim().toLowerCase()
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

  async function issueTrial(row, rawEmail, replaceExisting = false) {
    if (!sendEmail && (!env.RESEND_API_KEY?.trim() || !env.EMAIL_FROM?.trim())) throw new HttpError(503, 'Trial email delivery is not configured yet.')
    const email = String(rawEmail ?? '').trim().toLowerCase()
    if (email.length > 254 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new HttpError(400, 'Enter a valid email address for your trial key.')
    if (typeof store.trialByEmail !== 'function' || typeof store.createTrial !== 'function') throw new HttpError(503, 'Trial storage is not configured.')
    const existing = await store.trialForInstallation(row.id)
    const emailTrial = await store.trialByEmail(email)
    if (emailTrial && emailTrial.installation_id !== row.id) throw new HttpError(409, 'A 1-day trial has already been requested for this email.')
    if (existing && replaceExisting && existing.email === email) throw new HttpError(409, 'Enter a different email address. This email already received its one trial key.')
    if (existing && !replaceExisting) throw new HttpError(409, 'A 1-day trial has already been requested for this email or browser.')
    if (!existing && replaceExisting) throw new HttpError(409, 'Request a trial key before changing its email.')
    if (existing && (existing.activated_at || existing.bound_installation_id || existing.revoked_at || Number(existing.correction_count) >= 1)) {
      throw new HttpError(409, 'This trial email can no longer be changed. Contact support if you cannot access the key.')
    }
    if (existing && (typeof store.replaceUnactivatedTrial !== 'function' || typeof store.restoreTrialCorrection !== 'function')) {
      throw new HttpError(503, 'Trial email correction is unavailable.')
    }
    const licenseKey = createLicenseKey()
    const id = existing?.id ?? randomUUID()
    const keyHash = hash(normalizeLicense(licenseKey))
    try {
      if (existing) {
        const replaced = await store.replaceUnactivatedTrial({ id, installationId: row.id, keyHash, keyLast4: licenseKey.slice(-4), email })
        if (!replaced) throw new HttpError(409, 'This trial email can no longer be changed.')
      } else await store.createTrial({ id, installationId: row.id, keyHash, keyLast4: licenseKey.slice(-4), email, createdAt: new Date().toISOString() })
    } catch {
      throw new HttpError(409, 'This trial email is already used or can no longer be changed.')
    }
    let sent = false
    try { sent = await sendLicenseEmail(email, licenseKey, 'trial', id) } catch { sent = false }
    if (!sent) {
      if (existing) await store.restoreTrialCorrection({ id, replacementHash: keyHash, previous: existing })
      else await store.deleteUnsentTrial(id)
      throw new HttpError(503, 'Trial email could not be delivered. Please try again later.')
    }
    await store.markTrialSent(id, new Date().toISOString())
    return { emailSent: true, message: `${existing ? 'A replacement' : 'Your 1-day trial'} key was emailed to you. It starts when first activated in the app.` }
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

  function downloadSource(platform = 'windows') {
    const appleSilicon = platform === 'mac' || platform === 'mac-arm64'
    const prefix = appleSilicon ? 'MAC_ARM64_' : platform === 'mac-x64' ? 'MAC_X64_' : ''
    const setting = (name) => env[`${prefix}${name}`]?.trim() || (appleSilicon ? env[`MAC_${name}`]?.trim() : '')
    const blobPath = setting('BLOB_DOWNLOAD_PATH')
    const localPath = setting('LOCAL_DOWNLOAD_PATH')
    const redirectUrl = setting('DOWNLOAD_URL')
    const filename = (setting('LOCAL_DOWNLOAD_FILENAME') || setting('BLOB_DOWNLOAD_FILENAME') ||
      (platform === 'mac-x64' ? 'Nafran-Leads-Scraper-Intel.dmg' : appleSilicon ? 'Nafran-Leads-Scraper-Apple-Silicon.dmg' : 'Nafran-Leads-Scraper-Setup.exe')).replace(/["\\\r\n]/g, '_')
    return { blobPath, localPath, redirectUrl, filename }
  }

  function downloadConfigured(platform = 'windows') {
    const source = downloadSource(platform)
    if (source.blobPath) return true
    if (source.localPath && getLocalInstaller) return true
    return ['localhost', '127.0.0.1'].includes(publicUrl.hostname) && /^https:\/\//.test(source.redirectUrl ?? '')
  }

  async function downloadReady(platform) {
    if (!downloadConfigured(platform)) return false
    const source = downloadSource(platform)
    if (source.localPath && hasLocalInstaller) return hasLocalInstaller(source.localPath)
    return true
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
      if (method === 'GET' && url.pathname === '/v1/download-options') {
        const [windows, macArm64, macX64] = await Promise.all([downloadReady('windows'), downloadReady('mac-arm64'), downloadReady('mac-x64')])
        return json(200, { windows, mac: macArm64, macArm64, macX64 })
      }
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
          if (purchase.product === 'lifetime') await issueLicense(purchase)
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
        if (method === 'POST' && url.pathname === '/v1/maps/reserve') {
          if (!deviceId) throw new HttpError(400, 'A device identity is required for Maps leads.')
          const { requested } = await jsonBody(readBody)
          if (!Number.isSafeInteger(requested) || requested < 1 || requested > 1600) throw new HttpError(400, 'Request between 1 and 1,600 Maps leads.')
          const status = await verifiedStatus(row)
          if (!status.license?.active) throw new HttpError(403, 'Activate an active trial or lifetime license first.')
          if (status.license.kind === 'lifetime') return json(200, { reservationId: null, allowed: requested, used: null, remaining: null })
          if (typeof store.reserveTrialMapLeads !== 'function') throw new HttpError(503, 'Trial Maps limit is not configured on this server.')
          const license = await store.licenseForInstallation(row.id)
          const reserved = await store.reserveTrialMapLeads(license.id, row.id, requested, TRIAL_MAP_LEADS_LIMIT)
          if (!reserved) throw new HttpError(429, 'The trial’s 500 Maps leads are used. Activate a lifetime key to continue.')
          return json(200, reserved)
        }
        if (method === 'POST' && url.pathname === '/v1/maps/heartbeat') {
          const { reservationId } = await jsonBody(readBody)
          if (typeof reservationId !== 'string' || !/^[0-9a-f-]{36}$/i.test(reservationId)) throw new HttpError(400, 'Invalid Maps reservation.')
          if (typeof store.heartbeatTrialMapRun !== 'function' || !await store.heartbeatTrialMapRun(row.id, reservationId)) throw new HttpError(409, 'The Maps run reservation has expired.')
          return json(200, { active: true })
        }
        if (method === 'POST' && url.pathname === '/v1/maps/settle') {
          const { reservationId, captured } = await jsonBody(readBody)
          if (typeof reservationId !== 'string' || !/^[0-9a-f-]{36}$/i.test(reservationId) || !Number.isSafeInteger(captured) || captured < 0 || captured > 1600) throw new HttpError(400, 'Invalid Maps run result.')
          if (typeof store.settleTrialMapRun !== 'function') throw new HttpError(503, 'Trial Maps limit is not configured on this server.')
          const result = await store.settleTrialMapRun(row.id, reservationId, captured, TRIAL_MAP_LEADS_LIMIT)
          if (!result) throw new HttpError(409, 'The Maps run reservation has expired.')
          return json(200, result)
        }
        if (method === 'POST' && url.pathname === '/v1/decision-maker/consume') {
          if (!deviceId) throw new HttpError(400, 'A device identity is required for Decision Makers.')
          const { leadId } = await jsonBody(readBody)
          if (typeof leadId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(leadId)) throw new HttpError(400, 'Invalid lead identity.')
          const status = await verifiedStatus(row)
          if (!status.license?.active || !status.decisionMaker?.active) throw new HttpError(403, 'Decision Makers requires an active $3/month subscription and lifetime licence.')
          const linkedLicense = await store.licenseForInstallation(row.id)
          const ownerId = linkedLicense.installation_id
          const owner = await store.byId(ownerId)
          const period = await activeDecisionPeriod(owner)
          if (!period) throw new HttpError(403, 'Decision Makers subscription is not active.')
          const subject = hash(`${deviceId}:${leadId}`)
          const reserved = await store.reserveDecisionUse(ownerId, period.key, subject, 1000)
          if (!reserved) throw new HttpError(429, 'This month’s 1,000 Decision Maker leads are used. Wait for renewal.')
          return json(200, { used: reserved.used, remaining: Math.max(0, 1000 - reserved.used), renewsAt: period.renewsAt })
        }
        if (method === 'POST' && url.pathname === '/v1/trial') {
          const { email, replaceExisting } = await jsonBody(readBody)
          return json(200, await issueTrial(row, email, replaceExisting === true))
        }
        if (method === 'POST' && url.pathname === '/v1/checkout') {
          if (mode === 'live' && publicUrl.protocol !== 'https:') throw new HttpError(503, 'Live Checkout requires a hosted HTTPS billing URL.')
          const { product, email: rawEmail } = await jsonBody(readBody)
          if (product === 'decisionMaker') {
            if (!prices.decisionMaker || !/^price_[A-Za-z0-9]+$/.test(prices.decisionMaker)) throw new HttpError(503, 'Decision Makers subscription is not configured.')
            const configuredPrice = await price(prices.decisionMaker)
            if (configuredPrice.amount !== 300 || configuredPrice.interval !== 'month') throw new HttpError(502, 'Decision Makers must be $3 per month.')
            const status = await verifiedStatus(row)
            if (!status.license?.active || status.license.kind !== 'lifetime') throw new HttpError(403, 'Activate a lifetime licence before subscribing to Decision Makers.')
            const license = await store.licenseForInstallation(row.id)
            const owner = await store.byId(license.installation_id)
            if (!owner?.customer_id) throw new HttpError(409, 'No Stripe customer is connected to this lifetime licence.')
            if (status.decisionMaker?.active) throw new HttpError(409, 'Decision Makers is already subscribed.')
            if (owner.pending_decision_session_id) {
              const pending = await stripe(`checkout/sessions/${encodeURIComponent(owner.pending_decision_session_id)}`)
              if (pending.status === 'open' && /^https:\/\/checkout\.stripe\.com\//.test(pending.url ?? '')) return json(200, { url: pending.url })
              if (pending.status === 'complete') throw new HttpError(409, 'Subscription payment is processing. Refresh billing shortly.')
            }
            const session = await stripe('checkout/sessions', {
              mode: 'subscription', customer: owner.customer_id,
              'line_items[0][price]': prices.decisionMaker, 'line_items[0][quantity]': '1',
              client_reference_id: owner.id, 'metadata[product]': product,
              success_url: new URL('/?subscription=success&session_id={CHECKOUT_SESSION_ID}', env.APP_PUBLIC_URL || publicUrl).toString(),
              cancel_url: new URL('/cancel', publicUrl).toString(),
            })
            if (!/^https:\/\/checkout\.stripe\.com\//.test(session.url ?? '')) throw new HttpError(502, 'Stripe did not return a Checkout URL.')
            await store.savePending(owner.id, product, session.id)
            return json(200, { url: session.url })
          }
          if (product !== 'lifetime') throw new HttpError(400, 'Only the $30 Lifetime Deal is available.')
          const email = String(rawEmail ?? '').trim().toLowerCase()
          if (email.length > 254 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new HttpError(400, 'Enter a valid email address for your lifetime key.')
          if (!store.reserveLifetimeEmail || !store.lifetimeCheckoutByEmail || !store.lifetimeCheckoutForInstallation || !store.lifetimeLicenseByEmail || !store.saveLifetimeCheckout || !store.releaseLifetimeEmail) {
            throw new HttpError(503, 'Lifetime email storage is not configured.')
          }
          const current = await verifiedStatus(row)
          if (current.lifetime.active) throw new HttpError(409, 'The Lifetime Deal is already purchased for this installation.')
          if (await store.lifetimeLicenseByEmail(email)) throw new HttpError(409, 'An account already exists for this email. Use its lifetime license key.')
          const sameEmailReservation = await store.lifetimeCheckoutByEmail(email)
          if (sameEmailReservation && sameEmailReservation.installation_id !== row.id) {
            let expired = !sameEmailReservation.session_id && Date.now() - Date.parse(sameEmailReservation.created_at) > 120_000
            if (sameEmailReservation.session_id) {
              const otherSession = await stripe(`checkout/sessions/${encodeURIComponent(sameEmailReservation.session_id)}`)
              expired = otherSession.status === 'expired'
            }
            if (expired) await store.releaseLifetimeEmail(email, sameEmailReservation.installation_id)
          }
          let reservation = await store.lifetimeCheckoutForInstallation(row.id)
          if (reservation && !reservation.session_id && Date.now() - Date.parse(reservation.created_at) > 120_000) {
            await store.releaseLifetimeEmail(reservation.email, row.id)
            reservation = null
          }
          if (reservation?.session_id) {
            const pending = await stripe(`checkout/sessions/${encodeURIComponent(reservation.session_id)}`)
            if (pending.status === 'open') {
              if (reservation.email !== email) throw new HttpError(409, 'Finish or cancel the existing checkout before using another email.')
              if (/^https:\/\/checkout\.stripe\.com\//.test(pending.url ?? '')) return json(200, { url: pending.url })
            }
            if (pending.status === 'complete') throw new HttpError(409, 'A payment is processing. Refresh billing before starting another checkout.')
            await store.releaseLifetimeEmail(reservation.email, row.id)
            reservation = null
          }
          if (reservation && reservation.email !== email) {
            throw new HttpError(409, 'A checkout is already starting for another email. Try again shortly.')
          }
          reservation = await store.reserveLifetimeEmail(email, row.id)
          if (!reservation) throw new HttpError(409, 'An account already exists or a lifetime checkout is in progress for this email.')
          if (!reservation.newlyCreated && !reservation.session_id) throw new HttpError(409, 'A checkout is already starting for this email. Try again shortly.')
          const fields = {
            mode: 'payment',
            'line_items[0][price]': prices.lifetime, 'line_items[0][quantity]': '1',
            client_reference_id: row.id, 'metadata[product]': product,
            success_url: new URL(`/` + `?purchase=success&session_id={CHECKOUT_SESSION_ID}`, env.APP_PUBLIC_URL || publicUrl).toString(),
            cancel_url: new URL('/cancel', publicUrl).toString(),
          }
          try {
            const customer = await stripe('customers', { email })
            if (!/^cus_[A-Za-z0-9]+$/.test(customer.id ?? '')) throw new HttpError(502, 'Stripe did not return a customer ID.')
            fields.customer = customer.id
            fields['invoice_creation[enabled]'] = 'true'
            const session = await stripe('checkout/sessions', fields)
            if (!/^https:\/\/checkout\.stripe\.com\//.test(session.url ?? '')) throw new HttpError(502, 'Stripe did not return a Checkout URL.')
            await store.saveLifetimeCheckout(email, row.id, session.id, customer.id)
            return json(200, { url: session.url })
          } catch (error) {
            const latest = await store.lifetimeCheckoutForInstallation(row.id)
            if (latest && !latest.session_id) await store.releaseLifetimeEmail(email, row.id)
            throw error
          }
        }
        if (method === 'POST' && url.pathname === '/v1/portal') {
          const linked = await store.licenseForInstallation(row.id)
          const owner = linked?.kind === 'lifetime' ? await store.byId(linked.installation_id) : row
          if (!owner?.customer_id) throw new HttpError(409, 'No Stripe customer is connected yet.')
          const portal = await stripe('billing_portal/sessions', { customer: owner.customer_id, return_url: new URL('/', publicUrl).toString() })
          if (!/^https:\/\/billing\.stripe\.com\//.test(portal.url ?? '')) throw new HttpError(502, 'Stripe did not return a portal URL.')
          return json(200, { url: portal.url })
        }
        if (method === 'GET' && url.pathname === '/v1/invoices') {
          const linked = await store.licenseForInstallation(row.id)
          const owner = linked?.kind === 'lifetime' ? await store.byId(linked.installation_id) : row
          if (!owner?.customer_id) return json(200, { invoices: [] })
          const data = await stripe(`invoices?customer=${encodeURIComponent(owner.customer_id)}&limit=100`)
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
        const platform = url.searchParams.get('platform') || 'windows'
        if (!['windows', 'mac', 'mac-arm64', 'mac-x64'].includes(platform)) throw new HttpError(400, 'Choose Windows, Mac Apple Silicon, or Mac Intel for the download.')
        // No grant means the installer is free to download. A supplied but invalid
        // grant still fails, so old signed links retain their existing semantics.
        const subjectId = url.searchParams.has('grant') ? verifyDownloadGrant(url.searchParams.get('grant')) : null
        const source = downloadSource(platform)
        if (!downloadConfigured(platform)) throw new HttpError(503, `The ${platform.startsWith('mac') ? 'Mac' : 'Windows'} installer is not available yet.`)
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
        if (source.blobPath) {
          if (!getBlob) throw new HttpError(503, 'Private installer storage is unavailable.')
          const blob = await getBlob(source.blobPath, { access: 'private' })
          if (blob?.statusCode !== 200 || !blob.stream) throw new HttpError(503, 'The protected installer is not available yet.')
          await recordDownload()
          return { status: 200, body: blob.stream, headers: { 'content-type': blob.blob?.contentType || 'application/octet-stream', 'content-disposition': `attachment; filename="${source.filename}"`, 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' } }
        }
        if (source.localPath) {
          const local = await getLocalInstaller?.(source.localPath)
          if (!local?.stream || !Number.isSafeInteger(local.size) || local.size < 1) throw new HttpError(503, 'The protected installer is not available yet.')
          await recordDownload()
          return { status: 200, body: local.stream, headers: { 'content-type': 'application/octet-stream', 'content-length': String(local.size), 'content-disposition': `attachment; filename="${source.filename}"`, 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' } }
        }
        await recordDownload()
        return { status: 302, body: '', headers: { location: source.redirectUrl, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } }
      }
      throw new HttpError(404, 'Endpoint not found.')
    } catch (error) {
      return json(error instanceof HttpError ? error.status : 500, { error: error instanceof HttpError ? error.message : 'Billing server error.' })
    }
  }

  return { handle, mode, publicUrl }
}
