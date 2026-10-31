import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { buildLicenseEmail } from './license-email.mjs'
import { createAssistService } from './assist.mjs'
import { billingPage as page } from './payment-page.mjs'
import {sendSupport,supportConfig} from './support.mjs'
import {SupportError} from './support-contract.mjs'
import {paymentDetails} from './payment-details.mjs'

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status }
}

const hash = (token) => createHash('sha256').update(token).digest('hex')
const normalizeLicense = (value) => String(value ?? '').trim().toUpperCase().replace(/\s+/g, '')
const licensePattern = /^NF(?:-[A-Z0-9]{4}){10}$/
const TRIAL_MAP_LEADS_LIMIT = 300
const INCLUDED_DECISION_DAYS = 30
const DECISION_MONTHLY_LIMIT = 1000
const LIFETIME_PRICE = { amount: 1000000, currency: 'pkr' }
const DECISION_PRICE = { amount: 100000, currency: 'pkr', interval: null, periodDays: 30 }
const testLifetimePriceFile = new URL('./.lifetime-price-test', import.meta.url)
const configuredLifetimePrice = (env) => {
  if (!/^(sk|rk)_test_/.test(env.STRIPE_SECRET_KEY ?? '')) return env.STRIPE_PRICE_LIFETIME ?? ''
  try {
    const id = readFileSync(testLifetimePriceFile, 'utf8').trim()
    if (!/^price_[A-Za-z0-9]+$/.test(id)) throw new Error('The server test Lifetime Price file is invalid.')
    return id
  } catch (error) {
    if (error?.code === 'ENOENT') return env.STRIPE_PRICE_LIFETIME ?? ''
    throw error
  }
}
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
export function createBillingHandler({ env = process.env, store, fetch: stripeFetch = fetch, getBlob = null, getLocalInstaller = null, hasLocalInstaller = null, sendEmail = null }) {
  const port = Number(env.BILLING_PORT ?? 38747)
  const publicUrl = new URL(env.BILLING_PUBLIC_URL ?? `http://127.0.0.1:${port}`)
  const key = env.STRIPE_SECRET_KEY ?? ''
  const mode = key.includes('_live_') ? 'live' : 'test'
  const prices = { lifetime: configuredLifetimePrice(env), decisionMaker: env.STRIPE_PRICE_DECISION_MAKER ?? '' }
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

  async function stripe(path, fields, idempotencyKey) {
    const response = await stripeFetch(`https://api.stripe.com/v1/${path}`, {
      method: fields ? 'POST' : 'GET',
      headers: { authorization: `Bearer ${key}`, ...(fields ? { 'content-type': 'application/x-www-form-urlencoded' } : {}), ...(idempotencyKey ? { 'idempotency-key': idempotencyKey } : {}) },
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
    if (!item.active || item.currency !== 'pkr') throw new HttpError(502, 'The configured Stripe Price is not active in PKR.')
    return { amount: item.unit_amount, currency: item.currency, interval: item.recurring?.interval ?? null }
  }

  async function verifiedCheckoutCharge(session, installationId) {
    if (session?.mode !== 'payment' || session?.status !== 'complete' || session?.payment_status !== 'paid' ||
      session?.client_reference_id !== installationId || session?.livemode !== (mode === 'live') ||
      !/^pi_[A-Za-z0-9]+$/.test(session?.payment_intent ?? '')) return null
    const intent = await stripe(`payment_intents/${encodeURIComponent(session.payment_intent)}`)
    if (intent.status !== 'succeeded' || !/^ch_[A-Za-z0-9]+$/.test(intent.latest_charge ?? '')) return null
    const charge = await stripe(`charges/${encodeURIComponent(intent.latest_charge)}`)
    return charge.paid === true && charge.refunded !== true && Number(charge.amount_refunded ?? 0) === 0 && charge.disputed !== true ? charge : null
  }

  async function paidLifetimeSession(session, installationId) {
    return Boolean(await verifiedCheckoutCharge(session, installationId))
  }

  async function activeDecisionPass(owner) {
    if (!owner?.decision_pass_session_id || !owner.decision_pass_started_at || !owner.decision_pass_expires_at) return null
    const start = Date.parse(owner.decision_pass_started_at)
    const end = Date.parse(owner.decision_pass_expires_at)
    if (!Number.isFinite(start) || !Number.isFinite(end) || start > Date.now() || end <= Date.now() ||
      end - start !== DECISION_PRICE.periodDays * 86_400_000) return null
    const session = await stripe(`checkout/sessions/${encodeURIComponent(owner.decision_pass_session_id)}`)
    if (session.customer !== owner.customer_id || session.metadata?.product !== 'decisionMaker' ||
      Number(session.amount_total) !== DECISION_PRICE.amount || session.currency !== 'pkr' ||
      !(await verifiedCheckoutCharge(session, owner.id))) return null
    return { key: `pass:${session.id}`, renewsAt: new Date(end).toISOString(), source: 'paid' }
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

  function includedDecisionPeriod(license) {
    if (!license || license.kind === 'trial' || !license.activated_at) return null
    const activated = new Date(license.activated_at).getTime()
    if (!Number.isFinite(activated) || activated > Date.now()) return null
    const ends = activated + INCLUDED_DECISION_DAYS * 24 * 60 * 60 * 1000
    if (ends <= Date.now()) return null
    return { key: `included:${license.id}:${new Date(activated).toISOString()}`, renewsAt: new Date(ends).toISOString(), source: 'included' }
  }

  async function verifiedStatus(row) {
    for (const sessionId of [row.pending_lifetime_session_id, row.pending_decision_session_id]) {
      if (!sessionId) continue
      const pending = await stripe(`checkout/sessions/${encodeURIComponent(sessionId)}`)
      if (pending.status === 'complete' && pending.payment_status === 'paid') {
        const purchase = await reconcile(sessionId)
        if (purchase.product === 'lifetime' && !purchase.duplicate && ['desktop', 'website'].includes(pending.metadata?.checkoutFlow)) await issueLicense(purchase)
        if (purchase.product === 'decisionMaker' && !purchase.duplicate && pending.metadata?.checkoutFlow === 'desktop-standalone') await issueDecisionLicense(purchase)
      }
    }
    row = await store.byId(row.id)
    if (row.decision_pass_session_id && !row.refunded_duplicate_session_id) {
      const unsentDecisionKey = await store.decisionLicenseForPurchase?.(row.id)
      if (unsentDecisionKey && !unsentDecisionKey.sent_at) await issueDecisionLicense(row)
    }
    if (row.lifetime_session_id && !row.refunded_duplicate_session_id) {
      const delivery = await store.licenseForPurchase?.(row.id)
      if (delivery && !delivery.sent_at) {
        const session = await stripe(`checkout/sessions/${encodeURIComponent(row.lifetime_session_id)}`)
        if (await paidLifetimeSession(session, row.id)) await issueLicense(row)
      }
    }
    const lifetimePrice = await price(prices.lifetime)
    if (lifetimePrice.amount !== LIFETIME_PRICE.amount || lifetimePrice.interval) throw new HttpError(502, 'The configured Lifetime Price must be Rs 10,000 PKR one-time.')
    let lifetimeActive = false
    const linkedLicense = typeof store.licenseForInstallation === 'function' ? await store.licenseForInstallation(row.id) : null
    const linkedDecisionLicense = typeof store.decisionLicenseForInstallation === 'function' ? await store.decisionLicenseForInstallation(row.id) : null
    const purchasedLicense = typeof store.licenseForPurchase === 'function' ? await store.licenseForPurchase(row.id) : null
    const purchasedDecisionLicense = typeof store.decisionLicenseForPurchase === 'function' ? await store.decisionLicenseForPurchase(row.id) : null
    const isTrial = linkedLicense?.kind === 'trial'
    const isOwnerGrant = linkedLicense?.owner_issued === true
    const purchaseRow = linkedLicense && !isTrial && !isOwnerGrant ? await store.byId(linkedLicense.installation_id) : row
    if (isOwnerGrant && !isTrial) {
      lifetimeActive = Boolean(!linkedLicense.revoked_at && linkedLicense.activated_at && linkedLicense.bound_installation_id === row.id)
    } else if (purchaseRow?.lifetime_session_id) {
      const session = await stripe(`checkout/sessions/${encodeURIComponent(purchaseRow.lifetime_session_id)}`)
      lifetimeActive = await paidLifetimeSession(session, purchaseRow.id)
    }
    const trialExpiry = isTrial && linkedLicense.expires_at ? Date.parse(linkedLicense.expires_at) : 0
    const trialActive = Boolean(isTrial && !linkedLicense.revoked_at && linkedLicense.bound_installation_id === row.id && trialExpiry > Date.now())
    const licenseActive = Boolean(linkedLicense && !linkedLicense.revoked_at && (isTrial ? trialActive : lifetimeActive))
    const decisionPurchaseRow = linkedDecisionLicense ? await store.byId(linkedDecisionLicense.installation_id) : null
    const decisionPurchaseSession = decisionPurchaseRow && linkedDecisionLicense?.purchase_session_id
      ? await stripe(`checkout/sessions/${encodeURIComponent(linkedDecisionLicense.purchase_session_id)}`) : null
    const decisionLicenseActive = Boolean(linkedDecisionLicense?.sent_at && !linkedDecisionLicense.revoked_at && decisionPurchaseRow &&
      decisionPurchaseSession?.metadata?.product === 'decisionMaker' && decisionPurchaseSession.customer === decisionPurchaseRow.customer_id &&
      await verifiedCheckoutCharge(decisionPurchaseSession, decisionPurchaseRow.id))
    const trialMapUsage = isTrial && typeof store.trialMapUsage === 'function'
      ? await store.trialMapUsage(linkedLicense.id, TRIAL_MAP_LEADS_LIMIT)
      : null
    const standalonePeriod = decisionLicenseActive ? await activeDecisionPass(decisionPurchaseRow) : null
    const directPeriod = row.device_id && !linkedDecisionLicense && (!linkedLicense || isTrial) ? await activeDecisionPass(row) : null
    const lifetimePaidPeriod = licenseActive && !isTrial && !isOwnerGrant ? await activeDecisionPass(purchaseRow) ?? await activeDecisionPeriod(purchaseRow) : null
    const paidDecisionPeriod = standalonePeriod ?? directPeriod ?? lifetimePaidPeriod
    const decisionPeriod = paidDecisionPeriod ?? (licenseActive && !isTrial && !isOwnerGrant ? includedDecisionPeriod(linkedLicense) : null)
    const decisionOwner = standalonePeriod ? decisionPurchaseRow : directPeriod ? row : purchaseRow
    const used = decisionPeriod ? await store.countDecisionUses(decisionOwner.id, decisionPeriod.key) : 0
    const decisionRemaining = decisionPeriod ? Math.max(0, DECISION_MONTHLY_LIMIT - used) : 0
    const decisionActive = Boolean(decisionPeriod && decisionRemaining > 0)
    const requestedTrial = await store.trialForInstallation?.(row.id)
    return {
      configured: true, connected: true, mode,
      lifetime: { ...lifetimePrice, active: lifetimeActive },
      purchaseError: row.purchase_error ?? null,
      purchaseEmail: purchasedLicense?.sent_at ? purchasedLicense.email : null,
      decisionKeyEmail: purchasedDecisionLicense?.sent_at ? purchasedDecisionLicense.email : null,
      trial: { active: trialActive, expiresAt: isTrial ? linkedLicense.expires_at ?? null : null },
      trialRequest: { requested: Boolean(requestedTrial), emailSent: Boolean(requestedTrial?.sent_at && !requestedTrial.revoked_at), email: requestedTrial?.email ?? null,
        canChangeEmail: Boolean(requestedTrial?.sent_at && !requestedTrial.activated_at && !requestedTrial.bound_installation_id && !requestedTrial.revoked_at) },
      coreLicenseActive: licenseActive,
      decisionKeyActive: decisionLicenseActive || Boolean(directPeriod),
      mapsLeads: isTrial
        ? { used: trialMapUsage?.used ?? 0, limit: TRIAL_MAP_LEADS_LIMIT, remaining: trialActive ? trialMapUsage?.remaining ?? 0 : 0 }
        : { used: null, limit: null, remaining: null },
      decisionMaker: { ...DECISION_PRICE, available: true, active: decisionActive, status: decisionPeriod ? paidDecisionPeriod ? decisionActive ? 'paid' : 'paid_exhausted' : decisionActive ? 'included' : 'included_exhausted' : 'not_subscribed', ownerKind: standalonePeriod || directPeriod ? 'decision' : 'lifetime', includedPeople: 0, monthlyLimit: DECISION_MONTHLY_LIMIT, monthlyUsed: used, monthlyRemaining: decisionRemaining, renewsAt: decisionPeriod?.renewsAt ?? null, periodId: decisionPeriod ? hash(decisionPeriod.key).slice(0, 16) : null },
      hasCustomer: Boolean(purchaseRow?.customer_id),
      license: licenseActive && linkedLicense ? { active: true, kind: isTrial ? 'trial' : 'lifetime', email: linkedLicense.email, last4: linkedLicense.key_last4, activatedAt: linkedLicense.activated_at ?? null, expiresAt: isTrial ? linkedLicense.expires_at ?? null : null }
        : directPeriod ? { active: true, kind: 'decision', activatedAt: row.decision_pass_started_at, expiresAt: row.decision_pass_expires_at }
        : linkedDecisionLicense ? { active: decisionLicenseActive, kind: 'decision', email: linkedDecisionLicense.email, last4: linkedDecisionLicense.key_last4, activatedAt: linkedDecisionLicense.activated_at ?? null, expiresAt: null }
          : linkedLicense ? { active: false, kind: isTrial ? 'trial' : 'lifetime', email: linkedLicense.email, last4: linkedLicense.key_last4 } : { active: false },
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
    const line = items.data?.[0]
    if (product === 'lifetime' && line?.price?.id !== prices.lifetime) throw new HttpError(400, 'Checkout Price does not match this product.')
    if (product === 'decisionMaker') {
      if (row.refunded_duplicate_session_id === session.id) return { ...row, product, duplicate: true }
      const standalone = session.metadata?.checkoutFlow === 'desktop-standalone'
      const direct = session.metadata?.checkoutFlow === 'desktop-direct' && Boolean(row.device_id)
      if (session.mode !== 'payment' || session.status !== 'complete' || session.payment_status !== 'paid' ||
        session.client_reference_id !== row.id || !/^cus_[A-Za-z0-9]+$/.test(session.customer ?? '') ||
        (row.customer_id && session.customer !== row.customer_id) ||
        session.currency !== 'pkr' || Number(session.amount_total) !== DECISION_PRICE.amount ||
        line?.price?.currency !== 'pkr' || Number(line.price.unit_amount) !== DECISION_PRICE.amount ||
        line.price.recurring || Number(line.quantity) !== 1) throw new HttpError(409, 'Decision Makers payment is not valid.')
      if (!standalone && !direct && !await verifiedStatusForDecisionCheckout(row) && !await store.decisionLicenseForPurchase?.(row.id)) throw new HttpError(403, 'Activate a lifetime or Decision Makers key first.')
      const charge = await verifiedCheckoutCharge(session, row.id)
      if (!charge || !Number.isSafeInteger(Number(charge.created))) throw new HttpError(409, 'Decision Makers payment has not settled.')
      if (standalone) {
        const email = String(session.customer_details?.email || session.customer_email || '').trim().toLowerCase()
        if (email.length > 254 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new HttpError(409, 'Stripe did not provide a valid email for your Decision Makers key.')
        const existing = await store.decisionLicenseByEmail?.(email)
        if (existing && existing.installation_id !== row.id) {
          await stripe('refunds', { payment_intent: session.payment_intent, reason: 'duplicate' }, `duplicate-decision-${session.id}`)
          await store.markDuplicateDecision(row.id, session.id)
          return { ...row, product, duplicate: true }
        }
      }
      const startedAt = new Date(Number(charge.created) * 1000).toISOString()
      const expiresAt = new Date(Date.parse(startedAt) + DECISION_PRICE.periodDays * 86_400_000).toISOString()
      await store.saveDecisionPass(row.id, session.id, session.customer, startedAt, expiresAt)
      return { ...row, product, checkoutFlow: session.metadata?.checkoutFlow }
    }
    if (row.refunded_duplicate_session_id === session.id) return { ...row, product, duplicate: true }
    if (!(await paidLifetimeSession(session, row.id))) throw new HttpError(409, 'Payment is not active.')
    const email = String(session.customer_details?.email || session.customer_email || '').trim().toLowerCase()
    if (email.length > 254 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new HttpError(409, 'Stripe did not provide a valid customer email for this purchase.')
    const reserved = typeof store.lifetimeCheckoutForInstallation === 'function' ? await store.lifetimeCheckoutForInstallation(row.id) : null
    if (reserved && (reserved.session_id !== session.id || reserved.customer_id !== session.customer ||
      reserved.email !== email)) {
      throw new HttpError(409, 'Checkout email does not match this purchase.')
    }
    if (!reserved) {
      const existingLicense = await store.lifetimeLicenseByEmail(email)
      const existingCheckout = await store.lifetimeCheckoutByEmail(email)
      if (existingLicense || (existingCheckout && existingCheckout.installation_id !== row.id)) {
        if (typeof store.markDuplicateLifetime !== 'function') throw new HttpError(503, 'Duplicate purchase protection is unavailable.')
        await stripe('refunds', { payment_intent: session.payment_intent, reason: 'duplicate' }, `duplicate-lifetime-${session.id}`)
        await store.markDuplicateLifetime(row.id, session.id)
        return { ...row, product, duplicate: true }
      }
      const reservation = await store.reserveLifetimeEmail(email, row.id)
      if (!reservation) {
        if (typeof store.markDuplicateLifetime !== 'function') throw new HttpError(503, 'Duplicate purchase protection is unavailable.')
        await stripe('refunds', { payment_intent: session.payment_intent, reason: 'duplicate' }, `duplicate-lifetime-${session.id}`)
        await store.markDuplicateLifetime(row.id, session.id)
        return { ...row, product, duplicate: true }
      }
      await store.saveLifetimeCheckout(email, row.id, session.id, session.customer)
    }
    await store.saveLifetime(row.id, session.id, session.customer)
    return { ...row, product, checkoutFlow: session.metadata?.checkoutFlow }
  }

  async function verifiedStatusForDecisionCheckout(row) {
    if (!row.lifetime_session_id || !row.customer_id) return false
    const session = await stripe(`checkout/sessions/${encodeURIComponent(row.lifetime_session_id)}`)
    return paidLifetimeSession(session, row.id)
  }

  async function sendLicenseEmail(to, licenseKey, kind = 'lifetime', deliveryId = '') {
    const download = new URL('/#download', env.APP_PUBLIC_URL || publicUrl).toString()
    const content = buildLicenseEmail({ to, licenseKey, kind, download })
    if (sendEmail) return Boolean(await sendEmail({ to, licenseKey, download, kind, deliveryId, ...content }))
    const apiKey = env.RESEND_API_KEY?.trim()
    const from = env.EMAIL_FROM?.trim()
    if (!apiKey || !from) return false
    const response = await stripeFetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json', 'idempotency-key': `nafran-${kind}-${deliveryId}` },
      body: JSON.stringify({
        from,
        to: [to],
        ...content,
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

  async function issueDecisionLicense(row) {
    if (!store.decisionLicenseForPurchase || !store.createDecisionLicense) throw new HttpError(503, 'Decision Makers license storage is not configured.')
    const existing = await store.decisionLicenseForPurchase(row.id)
    if (existing) {
      if (!existing.sent_at) {
        const pendingKey = decryptLicenseKey(existing.encrypted_key)
        if (!await sendLicenseEmail(existing.email, pendingKey, 'decision', existing.id).catch(() => false)) throw new HttpError(503, 'Decision Makers key email could not be delivered. Please try again later.')
        await store.markDecisionLicenseSent(existing.id, new Date().toISOString())
      }
      return { email: existing.email, emailSent: true, last4: existing.key_last4 }
    }
    const fresh = await store.byId(row.id)
    if (!fresh?.decision_pass_session_id) throw new HttpError(409, 'Complete the Decision Makers payment first.')
    const session = await stripe(`checkout/sessions/${encodeURIComponent(fresh.decision_pass_session_id)}`)
    if (!await verifiedCheckoutCharge(session, row.id)) throw new HttpError(409, 'Decision Makers payment is not active.')
    const email = String(session.customer_details?.email || session.customer_email || '').trim().toLowerCase()
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new HttpError(409, 'Stripe did not provide an email for the Decision Makers key.')
    const licenseKey = createLicenseKey()
    let created
    try {
      created = await store.createDecisionLicense({ id: randomUUID(), installationId: row.id, purchaseSessionId: session.id, keyHash: hash(normalizeLicense(licenseKey)), keyLast4: licenseKey.slice(-4), encryptedKey: encryptLicenseKey(licenseKey), email, createdAt: new Date().toISOString() })
    } catch (error) {
      if (await store.decisionLicenseForPurchase(row.id)) return issueDecisionLicense(row)
      const ownedByAnotherBuyer = await store.decisionLicenseByEmail?.(email)
      if (ownedByAnotherBuyer && ownedByAnotherBuyer.installation_id !== row.id) {
        await stripe('refunds', { payment_intent: session.payment_intent, reason: 'duplicate' }, `duplicate-decision-${session.id}`)
        await store.markDuplicateDecision(row.id, session.id)
        return { duplicate: true, emailSent: false }
      }
      throw error
    }
    if (!await sendLicenseEmail(email, licenseKey, 'decision', created.id).catch(() => false)) throw new HttpError(503, 'Decision Makers key email could not be delivered. Please try again later.')
    await store.markDecisionLicenseSent(created.id, new Date().toISOString())
    return { email, emailSent: true, last4: licenseKey.slice(-4) }
  }

  async function rejectLifetimeTrial(row) {
    const linked = await store.licenseForInstallation?.(row.id)
    if ((linked?.kind === 'lifetime' || row.lifetime_session_id) && (await verifiedStatus(row)).lifetime?.active) {
      throw new HttpError(409, 'This installation already has Lifetime access. A trial cannot replace it.')
    }
  }

  async function issueTrial(row, rawEmail, replaceExisting = false) {
    await rejectLifetimeTrial(row)
    if (!sendEmail && (!env.RESEND_API_KEY?.trim() || !env.EMAIL_FROM?.trim())) throw new HttpError(503, 'Trial email delivery is not configured yet.')
    const email = String(rawEmail ?? '').trim().toLowerCase()
    if (email.length > 254 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new HttpError(400, 'Enter a valid email address for your trial key.')
    if (typeof store.trialByEmail !== 'function' || typeof store.createTrial !== 'function') throw new HttpError(503, 'Trial storage is not configured.')
    const existing = await store.trialForInstallation(row.id)
    const emailTrial = await store.trialByEmail(email)
    if (emailTrial && emailTrial.installation_id !== row.id) throw new HttpError(409, 'This email is already used for a 1-day trial. Use the key already emailed to you.')
    if (existing && replaceExisting && existing.email === email) throw new HttpError(409, 'This email is already used for a 1-day trial. Enter a different email only to correct an unactivated key.')
    if (existing && !replaceExisting) throw new HttpError(409, existing.email === email ? 'This email is already used for a 1-day trial. Use the key already emailed to you.' : 'This browser already requested its trial. Correct the email for the existing unactivated key instead.')
    if (!existing && replaceExisting) throw new HttpError(409, 'Request a trial key before changing its email.')
    if (existing && (existing.activated_at || existing.bound_installation_id || existing.revoked_at)) {
      throw new HttpError(409, 'This device has already activated or closed its trial. Changing email does not start another free trial.')
    }
    if (existing && (typeof store.replaceUnactivatedTrial !== 'function' || typeof store.restoreTrialCorrection !== 'function')) {
      throw new HttpError(503, 'Trial email correction is unavailable.')
    }
    const licenseKey = createLicenseKey()
    const id = existing?.id ?? randomUUID()
    const keyHash = hash(normalizeLicense(licenseKey))
    try {
      if (existing) {
        const replaced = await store.replaceUnactivatedTrial({ id, installationId: row.id, keyHash, keyLast4: licenseKey.slice(-4), email, previousHash: existing.key_hash })
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
    if (!licensePattern.test(normalized)) throw new HttpError(400, 'Enter your MamaLead license key exactly as provided.')
    const license = await store.licenseByHash(hash(normalized))
    if (!license || license.revoked_at) throw new HttpError(401, 'This license key is invalid or revoked.')
    if (license.kind === 'trial') await rejectLifetimeTrial(row)
    if (license.owner_issued) {
      const activated = await store.activateOwnerLicense?.(row.id, license.id, new Date().toISOString())
      if (!activated) throw new HttpError(409, 'This owner-issued key is revoked, expired, or already active on another installation.')
      return { active: true, kind: activated.kind, email: activated.email ?? undefined, last4: activated.key_last4,
        activatedAt: activated.activated_at, expiresAt: activated.expires_at }
    }
    const isTrial = license.kind === 'trial'
    const isDecision = license.kind === 'decision'
    if (isTrial) {
      if (!license.sent_at) throw new HttpError(403, 'This trial key has not been delivered.')
      if (license.expires_at && Date.parse(license.expires_at) <= Date.now()) throw new HttpError(403, 'This 1-day trial has expired.')
      if (license.bound_installation_id && license.bound_installation_id !== row.id) throw new HttpError(409, 'This trial key is already active on another machine.')
    } else if (isDecision) {
      if (!license.sent_at) throw new HttpError(403, 'This Decision Makers key has not been delivered.')
      const original = await store.byId(license.installation_id)
      const session = original && await stripe(`checkout/sessions/${encodeURIComponent(license.purchase_session_id)}`)
      if (!original || session?.metadata?.product !== 'decisionMaker' || session.customer !== original.customer_id || !await verifiedCheckoutCharge(session, original.id)) throw new HttpError(403, 'The payment behind this Decision Makers key is not active.')
    } else {
      const originalInstallation = await store.byId(license.installation_id)
      if (!originalInstallation || !(await verifiedStatus(originalInstallation)).lifetime.active) throw new HttpError(403, 'The purchase behind this license is not active.')
    }
    const current = await store.licenseForInstallation(row.id)
    const currentDecision = isDecision ? await store.decisionLicenseForInstallation(row.id) : null
    if (currentDecision?.id === license.id) return { active: true, kind: 'decision', email: license.email, last4: license.key_last4, activatedAt: license.activated_at ?? null, expiresAt: null }
    if (current?.id === license.id) return { active: true, kind: isTrial ? 'trial' : 'lifetime', email: license.email, last4: license.key_last4, activatedAt: license.activated_at ?? null, expiresAt: isTrial ? license.expires_at : null }
    if (isDecision) {
      const max = Math.max(1, Math.min(20, Number(env.LICENSE_MAX_ACTIVATIONS ?? 2)))
      if (await store.countDecisionLicenseActivations(license.id) >= max || !await store.attachDecisionLicense(row.id, license.id, new Date().toISOString(), max)) throw new HttpError(409, `This Decision Makers key is already active on ${max} machines.`)
      return { active: true, kind: 'decision', email: license.email, last4: license.key_last4, activatedAt: new Date().toISOString(), expiresAt: null }
    }
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

  const assist = createAssistService({ env, store, ErrorType: HttpError })

  async function handle({ method, url: rawUrl, authorization, deviceId: rawDeviceId, devicePlatform: rawDevicePlatform, stripeSignature, ip = '', readBody = async () => '' }) {
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
        const purchase = await reconcile(url.searchParams.get('session_id') ?? '')
        if (purchase.duplicate) return page('Duplicate payment refunded', purchase.product === 'decisionMaker' ? 'This email already has a Decision Makers key. Use the original key in MamaLead.' : 'This email already has a lifetime account. Use the original license key in MamaLead.')
        const keyDelivered = purchase.product === 'lifetime' && purchase.checkoutFlow === 'desktop' ? Boolean((await issueLicense(purchase)).emailSent) : false
        if (purchase.product === 'decisionMaker' && purchase.checkoutFlow === 'desktop-standalone') {
          const delivered = await issueDecisionLicense(purchase)
          return delivered.duplicate ? page('Duplicate payment refunded', 'This email already has a Decision Makers key. Use the original key in MamaLead.') : page('Decision Makers key sent', 'Your payment was verified. Your Decision Makers key was emailed to you. Open Settings → Account in MamaLead and activate it.', { product: 'decisionMaker', verified: true, keyDelivered: true })
        }
        if (purchase.product === 'decisionMaker') return page('Decision Makers ready', 'Your payment was verified. Return to MamaLead; 1,000 Decision Maker searches are available for 30 days from payment. The app will refresh automatically.', { product: 'decisionMaker', verified: true })
        return page('Purchase confirmed', 'Your Stripe payment was verified. Return to MamaLead; the app will open the license field automatically once your license key has been emailed.', { product: 'lifetime', verified: true, keyDelivered })
      }
      if (method === 'POST' && url.pathname === '/webhooks/stripe') {
        const raw = await readBody()
        verifyWebhookSignature(raw, stripeSignature)
        const event = JSON.parse(raw)
        if (event.type === 'checkout.session.completed' && event.data?.object?.id) {
          const purchase = await reconcile(event.data.object.id)
          if (purchase.product === 'lifetime' && !purchase.duplicate) await issueLicense(purchase)
          if (purchase.product === 'decisionMaker' && !purchase.duplicate && purchase.checkoutFlow === 'desktop-standalone') await issueDecisionLicense(purchase)
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
        if (!licensePattern.test(normalized)) throw new HttpError(400, 'Enter a valid MamaLead license key.')
        const license = await store.licenseByHash(hash(normalized))
        if (!license || license.revoked_at) throw new HttpError(401, 'This license key is invalid or revoked.')
        if (license.owner_issued) {
          const bound = license.bound_installation_id && await store.byId(license.bound_installation_id)
          if (!bound || bound.license_id !== license.id) throw new HttpError(403, 'Activate this owner-issued key in MamaLead first.')
          return json(200, await downloadLink(bound))
        }
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
        if(method==='GET' && url.pathname==='/v1/support/config')return json(200,supportConfig(env,store))
        if(method==='POST' && url.pathname==='/v1/support'){
          const raw=await readBody()
          if(Buffer.byteLength(raw)>32768)throw new SupportError(413,'Message is too long.')
          let input;try{input=JSON.parse(raw)}catch{throw new SupportError(400,'Invalid support message.')}
          return json(200,await sendSupport({env,store,installation:row,input,ip,fetcher:stripeFetch}))
        }
        if (method === 'GET' && url.pathname === '/v1/assist/status') return json(200, assist.configuration())
        if (method === 'POST' && url.pathname === '/v1/assist/chat') {
          const payload = await jsonBody(readBody)
          const status = await verifiedStatus(row)
          return json(200, await assist.chat(row, status, payload))
        }
        if (method === 'GET' && url.pathname === '/v1/status') {
          if ((row.license_id || row.decision_license_id) && !deviceId) throw new HttpError(403, 'Update the app to verify this device before using a license.')
          const status = await verifiedStatus(row)
          if (typeof store.markSeen === 'function') { try { await store.markSeen(row.id, new Date().toISOString()) } catch {} }
          return json(200, status)
        }
        if (method === 'POST' && url.pathname === '/v1/maps/reserve') {
          if (!deviceId) throw new HttpError(400, 'A device identity is required for Maps leads.')
          const { requested } = await jsonBody(readBody)
          if (!Number.isSafeInteger(requested) || requested < 1 || requested > 1600) throw new HttpError(400, 'Request between 1 and 1,600 Maps leads.')
          const status = await verifiedStatus(row)
          if (!status.license?.active || !['trial', 'lifetime'].includes(status.license.kind)) throw new HttpError(403, 'Activate an active trial or lifetime license first.')
          if (status.license.kind === 'lifetime') return json(200, { reservationId: null, allowed: requested, used: null, remaining: null })
          if (typeof store.reserveTrialMapLeads !== 'function') throw new HttpError(503, 'Trial Maps limit is not configured on this server.')
          const license = await store.licenseForInstallation(row.id)
          const reserved = await store.reserveTrialMapLeads(license.id, row.id, requested, TRIAL_MAP_LEADS_LIMIT)
          if (!reserved) throw new HttpError(429, 'The trial’s 300 Maps leads are used. Activate a lifetime key to continue.')
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
          if (!status.license?.active || !status.decisionMaker?.renewsAt) throw new HttpError(403, 'Decision Makers access has ended. Buy a new Rs 1,000 pass to continue.')
          const linkedLicense = status.decisionMaker.ownerKind === 'decision' ? await store.decisionLicenseForInstallation(row.id) : await store.licenseForInstallation(row.id)
          const ownerId = linkedLicense?.installation_id ?? (status.decisionMaker.ownerKind === 'decision' && row.device_id && row.decision_pass_session_id ? row.id : null)
          if (!ownerId) throw new HttpError(403, 'Buy a Decision Makers pass or activate a lifetime key first.')
          const owner = await store.byId(ownerId)
          const period = await activeDecisionPass(owner) ?? (status.decisionMaker.ownerKind === 'lifetime' ? await activeDecisionPeriod(owner) ?? includedDecisionPeriod(linkedLicense) : null)
          if (!period) throw new HttpError(403, 'Decision Makers access is not active.')
          const subject = hash(`${deviceId}:${leadId}`)
          const reserved = await store.reserveDecisionUse(ownerId, period.key, subject, DECISION_MONTHLY_LIMIT)
          if (!reserved) throw new HttpError(429, period.source === 'included' ? 'Your included 1,000 Decision Maker searches are used. Buy a new 30-day pass in Settings → Usage to continue.' : 'Your 1,000 Decision Maker searches are used. Buy a new 30-day pass in Settings → Usage to continue.')
          return json(200, { used: reserved.used, remaining: Math.max(0, DECISION_MONTHLY_LIMIT - reserved.used), renewsAt: period.renewsAt, periodId: hash(period.key).slice(0, 16) })
        }
        if (method === 'POST' && url.pathname === '/v1/trial') {
          const { email, replaceExisting } = await jsonBody(readBody)
          return json(200, await issueTrial(row, email, replaceExisting === true))
        }
        if (method === 'POST' && url.pathname === '/v1/checkout') {
          if (mode === 'live' && publicUrl.protocol !== 'https:') throw new HttpError(503, 'Live Checkout requires a hosted HTTPS billing URL.')
          const { product, email: rawEmail, channel } = await jsonBody(readBody)
          if (product === 'decisionMaker') {
            if (!deviceId) throw new HttpError(403, 'Open the MamaLead desktop app to subscribe to Decision Makers.')
            const status = await verifiedStatus(row)
            const lifetimeLicense = status.license?.active && status.license.kind === 'lifetime' ? await store.licenseForInstallation(row.id) : null
            const decisionLicense = await store.decisionLicenseForInstallation?.(row.id)
            const direct = !lifetimeLicense && !decisionLicense && Boolean(row.device_id)
            const standaloneNew = !lifetimeLicense && !decisionLicense && !direct
            if (standaloneNew && await store.decisionLicenseForPurchase?.(row.id)) throw new HttpError(409, 'Your Decision Makers key was emailed to you. Activate it in Settings → Account before renewing.')
            const owner = standaloneNew || direct ? row : await store.byId((lifetimeLicense ?? decisionLicense).installation_id)
            if (!owner || (!standaloneNew && !direct && !owner.customer_id)) throw new HttpError(409, 'No Stripe customer is connected to this licence.')
            if (status.decisionMaker?.active) throw new HttpError(409, status.decisionMaker.status === 'included' ? 'Your included Decision Makers searches are still available. Buy the next pass when these are used or 30 days end.' : 'This Decision Makers pass is still active. Buy the next pass when its searches are used or 30 days end.')
            if (owner.pending_decision_session_id) {
              const pending = await stripe(`checkout/sessions/${encodeURIComponent(owner.pending_decision_session_id)}`)
              if (pending.status === 'open' && pending.mode === 'payment' && pending.metadata?.product === 'decisionMaker' && /^https:\/\/checkout\.stripe\.com\//.test(pending.url ?? '')) return json(200, { url: pending.url })
              if (pending.status === 'open') await stripe(`checkout/sessions/${encodeURIComponent(pending.id)}/expire`, {})
              if (pending.status === 'complete') throw new HttpError(409, 'Decision Makers pass payment is processing. Refresh billing shortly.')
            }
            const session = await stripe('checkout/sessions', {
              mode: 'payment', ...(!owner.customer_id ? { customer_creation: 'always', 'payment_method_types[0]': 'card' } : { customer: owner.customer_id }),
              'line_items[0][price_data][currency]': 'pkr',
              'line_items[0][price_data][unit_amount]': String(DECISION_PRICE.amount),
              'line_items[0][price_data][product_data][name]': 'MamaLead Decision Makers · 1,000 searches for 30 days',
              'line_items[0][quantity]': '1',
              client_reference_id: owner.id, 'metadata[product]': product,
              ...(standaloneNew ? { 'metadata[checkoutFlow]': 'desktop-standalone' } : direct ? { 'metadata[checkoutFlow]': 'desktop-direct' } : {}),
              success_url: new URL('/return?session_id={CHECKOUT_SESSION_ID}', publicUrl).toString(),
              cancel_url: new URL('/cancel', publicUrl).toString(),
            })
            if (!/^https:\/\/checkout\.stripe\.com\//.test(session.url ?? '')) throw new HttpError(502, 'Stripe did not return a Checkout URL.')
            await store.savePending(owner.id, product, session.id)
            return json(200, { url: session.url })
          }
          if (product !== 'lifetime') throw new HttpError(400, 'Only the Rs 10,000 PKR Lifetime Deal is available.')
          const email = String(rawEmail ?? '').trim().toLowerCase()
          if (!email) {
            const current = await verifiedStatus(row)
            if (current.lifetime.active) throw new HttpError(409, 'The Lifetime Deal is already purchased for this installation.')
            const fresh = await store.byId(row.id)
            if (fresh.pending_lifetime_session_id) {
              const pending = await stripe(`checkout/sessions/${encodeURIComponent(fresh.pending_lifetime_session_id)}`)
              if (pending.status === 'open') {
                const items = await stripe(`checkout/sessions/${encodeURIComponent(pending.id)}/line_items?limit=1`)
                if (items.data?.[0]?.price?.id === prices.lifetime && /^https:\/\/checkout\.stripe\.com\//.test(pending.url ?? '')) return json(200, { url: pending.url })
                await stripe(`checkout/sessions/${encodeURIComponent(pending.id)}/expire`, {})
              }
              if (pending.status === 'complete') throw new HttpError(409, 'A payment is processing. Refresh billing shortly.')
            }
            const session = await stripe('checkout/sessions', {
              mode: 'payment', ...(row.customer_id ? { customer: row.customer_id } : { customer_creation: 'always' }),
              'payment_method_types[0]': 'card',
              'line_items[0][price]': prices.lifetime, 'line_items[0][quantity]': '1',
              client_reference_id: row.id, 'metadata[product]': product, 'metadata[checkoutFlow]': channel === 'website' ? 'website' : 'desktop',
              'invoice_creation[enabled]': 'true',
              success_url: channel === 'website' ? new URL('/?checkout=success&session_id={CHECKOUT_SESSION_ID}', env.APP_PUBLIC_URL || 'https://mamalead.com').toString() : new URL('/return?session_id={CHECKOUT_SESSION_ID}', publicUrl).toString(),
              cancel_url: channel === 'website' ? new URL('/?checkout=cancelled#pricing', env.APP_PUBLIC_URL || 'https://mamalead.com').toString() : new URL('/cancel', publicUrl).toString(),
            })
            if (!/^https:\/\/checkout\.stripe\.com\//.test(session.url ?? '')) throw new HttpError(502, 'Stripe did not return a Checkout URL.')
            if (typeof store.clearPurchaseError === 'function') await store.clearPurchaseError(row.id)
            await store.savePending(row.id, product, session.id)
            return json(200, { url: session.url })
          }
          if (email.length > 254 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new HttpError(400, 'Enter a valid email address for your lifetime key.')
          if (!store.reserveLifetimeEmail || !store.lifetimeCheckoutByEmail || !store.lifetimeCheckoutForInstallation || !store.lifetimeLicenseByEmail || !store.saveLifetimeCheckout || !store.releaseLifetimeEmail) {
            throw new HttpError(503, 'Lifetime email storage is not configured.')
          }
          if (await store.lifetimeLicenseByEmail(email)) throw new HttpError(409, 'This email is already used for Lifetime access. Use the key already emailed to you.')
          const current = await verifiedStatus(row)
          if (current.lifetime.active) throw new HttpError(409, 'The Lifetime Deal is already purchased for this installation.')
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
          if (!reservation) throw new HttpError(409, 'This email is already used or has a Lifetime checkout in progress. Complete the existing checkout or use your emailed key.')
          if (!reservation.newlyCreated && !reservation.session_id) throw new HttpError(409, 'A checkout is already starting for this email. Try again shortly.')
          const fields = {
            mode: 'payment',
            'line_items[0][price]': prices.lifetime, 'line_items[0][quantity]': '1',
            client_reference_id: row.id, 'metadata[product]': product,
            ...(channel === 'website' ? { 'metadata[checkoutFlow]': 'website' } : {}),
            success_url: new URL(channel === 'website' ? '/?checkout=success&session_id={CHECKOUT_SESSION_ID}' : '/?purchase=success&session_id={CHECKOUT_SESSION_ID}', env.APP_PUBLIC_URL || (channel === 'website' ? 'https://mamalead.com' : publicUrl)).toString(),
            cancel_url: channel === 'website' ? new URL('/?checkout=cancelled#pricing', env.APP_PUBLIC_URL || 'https://mamalead.com').toString() : new URL('/cancel', publicUrl).toString(),
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
        if (method === 'GET' && url.pathname === '/v1/payment-details') {
          const linked = await store.licenseForInstallation(row.id)
          const owner = linked?.kind === 'lifetime' && !linked.owner_issued ? await store.byId(linked.installation_id) : row
          return json(200, await paymentDetails(stripe, owner))
        }
        if (method === 'GET' && url.pathname === '/v1/invoices') {
          const linked = await store.licenseForInstallation(row.id)
          const owner = linked?.kind === 'lifetime' ? await store.byId(linked.installation_id) : row
          if (!owner?.customer_id) return json(200, { invoices: [] })
          const data = await stripe(`invoices?customer=${encodeURIComponent(owner.customer_id)}&limit=100`)
          const invoices = (data.data ?? []).map((invoice) => ({ id: invoice.id, number: invoice.number ?? '', issued: invoice.created ? new Date(invoice.created * 1000).toISOString().slice(0, 10) : '', total: invoice.total ?? 0, currency: invoice.currency ?? 'pkr', status: invoice.status ?? '', url: invoice.hosted_invoice_url ?? '', pdfUrl: invoice.invoice_pdf ?? '', amountPaid: invoice.amount_paid ?? (invoice.status === 'paid' ? invoice.total ?? 0 : 0), description: invoice.description || invoice.lines?.data?.[0]?.description || 'MamaLead purchase' }))
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
      if ((method === 'GET' || method === 'HEAD') && url.pathname === '/v1/download') {
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
          if (method === 'HEAD') return
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
          if (method === 'HEAD') await blob.stream.cancel?.()
          return { status: 200, body: method === 'HEAD' ? '' : blob.stream, headers: { 'content-type': blob.blob?.contentType || 'application/octet-stream', 'content-disposition': `attachment; filename="${source.filename}"`, 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' } }
        }
        if (source.localPath) {
          const local = await getLocalInstaller?.(source.localPath, {head:method === 'HEAD'})
          if (!local || (method !== 'HEAD' && !local.stream) || !Number.isSafeInteger(local.size) || local.size < 1) throw new HttpError(503, 'The protected installer is not available yet.')
          await recordDownload()
          if (method === 'HEAD') await local.stream?.cancel?.()
          return { status: 200, body: method === 'HEAD' ? '' : local.stream, headers: { 'content-type': 'application/octet-stream', 'content-length': String(local.size), 'content-disposition': `attachment; filename="${source.filename}"`, 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' } }
        }
        await recordDownload()
        return { status: 302, body: '', headers: { location: source.redirectUrl, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } }
      }
      throw new HttpError(404, 'Endpoint not found.')
    } catch (error) {
      if(error instanceof SupportError){const result=json(error.status,{error:error.status===429?'rate_limited':error.status===503?'support_unavailable':'validation',message:error.message,field:error.field,retryAfterSeconds:error.retryAfterSeconds});if(error.retryAfterSeconds)result.headers['retry-after']=String(error.retryAfterSeconds);return result}
      return json(error instanceof HttpError ? error.status : 500, { error: error instanceof HttpError ? error.message : 'Billing server error.' })
    }
  }

  return { handle, mode, publicUrl }
}
