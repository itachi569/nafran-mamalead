import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { normalizeOwnerEmail, validOwnerPasswordHash, verifyOwnerPassword } from './owner-password.mjs'
import {supportApi} from './support-api.mjs'

// Owner API with read-only views and an optional narrow Lifetime cancellation bridge.
// Never returns token_hash / key_hash / full license keys, and never sends email.

export class AdminError extends Error {
  constructor(status, message) { super(message); this.status = status }
}

const COOKIE = 'nf_admin'
const SESSION_SECONDS = 8 * 60 * 60
const DAY = 86_400_000
const MAX_STRIPE_OBJECTS = 300
const sha256 = (value) => createHash('sha256').update(String(value)).digest()
const equal = (a, b) => a.length === b.length && timingSafeEqual(a, b)
const tail = (value, n = 6) => (value ? `…${String(value).slice(-n)}` : null)
const iso = (value) => (value ? new Date(value).toISOString() : null)
const short = (id) => String(id ?? '').slice(0, 8)
const newest = (a, b) => String(b.created ?? '').localeCompare(String(a.created ?? ''))
const within = (value, days) => Boolean(value) && Date.now() - Date.parse(value) <= days * DAY

function maskEmail(email) {
  const [user = '', domain = ''] = String(email ?? '').split('@')
  return domain ? `${user.slice(0, 1)}${'•'.repeat(Math.min(6, Math.max(1, user.length - 1)))}@${domain}` : ''
}

async function pool(items, worker, size = 6) {
  const queue = [...items]
  await Promise.all(Array.from({ length: Math.min(size, queue.length) }, async () => { while (queue.length) await worker(queue.shift()) }))
}

function respond(status, body, headers = {}) {
  return {
    status,
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'x-frame-options': 'DENY', 'referrer-policy': 'no-referrer', ...headers },
  }
}

export function createAdminHandler({ env = process.env, store, fetch: outbound = fetch, probeBlob = null, cancelLifetime = null, supportWriter = null }) {
  const ownerHash = /^[0-9a-f]{64}$/i.test(env.ADMIN_TOKEN_SHA256 ?? '') ? Buffer.from(env.ADMIN_TOKEN_SHA256, 'hex') : null
  const tokenLoginEnabled = Boolean(ownerHash && env.ADMIN_ALLOW_TOKEN_LOGIN !== '0')
  const ownerEmail = normalizeOwnerEmail(env.ADMIN_OWNER_EMAIL)
  const passwordHash = env.ADMIN_PASSWORD_HASH ?? ''
  const emailLoginEnabled = Boolean(ownerEmail && passwordHash)
  const sessionSecret = env.ADMIN_SESSION_SECRET ?? ''
  if (Boolean(env.ADMIN_OWNER_EMAIL) !== Boolean(passwordHash) || (passwordHash && (!ownerEmail || !validOwnerPasswordHash(passwordHash)))) {
    throw new Error('ADMIN_OWNER_EMAIL and a valid ADMIN_PASSWORD_HASH must both be set for email sign-in.')
  }
  if (!tokenLoginEnabled && !emailLoginEnabled) throw new Error('Set ADMIN_TOKEN_SHA256 or configure ADMIN_OWNER_EMAIL and ADMIN_PASSWORD_HASH.')
  if (sessionSecret.length < 32) throw new Error('ADMIN_SESSION_SECRET must be at least 32 characters.')
  if (!store) throw new Error('An admin store is required.')

  const stripeKey = env.STRIPE_SECRET_KEY ?? ''
  const mode = /^(sk|rk)_live_/.test(stripeKey) ? 'live' : /^(sk|rk)_test_/.test(stripeKey) ? 'test' : 'missing'
  const cap = Math.max(1, Math.min(20, Number(env.LICENSE_MAX_ACTIVATIONS ?? 2)))
  const email = (value) => (env.ADMIN_SHOW_EMAILS === '1' ? String(value ?? '') : maskEmail(value))
  const pricesSet = /^price_[A-Za-z0-9]+$/.test(env.STRIPE_PRICE_LIFETIME ?? '')
  const stripeReadsAllowed = mode === 'test' || (mode === 'live' && env.ADMIN_ALLOW_LIVE_READS === '1')
  const failures = new Map()
  let revenueCache = null
  let revenueRun = null

  // ---- authentication: owner email/password or owner token, then signed HttpOnly cookie ----
  const credentialVersion = createHash('sha256').update(ownerHash ?? '').update(passwordHash).update(tokenLoginEnabled ? 'token-on' : 'token-off').digest('hex')
  const sign = (payload) => createHmac('sha256', sessionSecret).update(credentialVersion).update(payload).digest('base64url')
  function sessionCookie(secure) {
    const payload = `${Math.floor(Date.now() / 1000) + SESSION_SECONDS}.${randomBytes(12).toString('base64url')}`
    return `${COOKIE}=${payload}.${sign(payload)}; Path=/admin; HttpOnly; SameSite=Strict; Max-Age=${SESSION_SECONDS}${secure ? '; Secure' : ''}`
  }
  function validSession(cookieHeader) {
    const raw = String(cookieHeader ?? '').split(/;\s*/).find((part) => part.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1)
    const [expiry, nonce, signature, extra] = String(raw ?? '').split('.')
    if (!expiry || !nonce || !signature || extra !== undefined) return false
    return equal(Buffer.from(signature), Buffer.from(sign(`${expiry}.${nonce}`))) && Number(expiry) > Math.floor(Date.now() / 1000)
  }
  const validToken = (token) => tokenLoginEnabled && typeof token === 'string' && token.length >= 24 && token.length <= 256 && equal(sha256(token), ownerHash)
  function throttle(ip) {
    const entry = failures.get(ip)
    if (entry && entry.until > Date.now() && entry.count >= 5) throw new AdminError(429, 'Too many sign-in attempts. Wait a minute and try again.')
  }
  function recordFailure(ip) {
    const entry = failures.get(ip)
    if (!entry || entry.until < Date.now()) failures.set(ip, { count: 1, until: Date.now() + 60_000 })
    else entry.count += 1
  }

  // ---- data views built from existing tables ----
  async function snapshot() {
    let installs, licenses, trials, webhooks, downloads, tracking, planMetrics
    try {
      [installs, licenses, trials, webhooks, downloads, tracking, planMetrics] = await Promise.all([
        store.installations(), store.licenses(), store.trialLicenses ? store.trialLicenses() : [],
        store.webhooks ? store.webhooks() : null, store.downloads ? store.downloads() : null,
        store.seenTracking ? store.seenTracking() : false,
        store.planMetrics ? store.planMetrics() : null,
      ])
    } catch { throw new AdminError(503, 'The billing tables could not be read yet.') }
    const attached = new Map()
    for (const row of installs) if (row.license_id) attached.set(row.license_id, [...(attached.get(row.license_id) ?? []), row])
    return { installs, licenses, trials, webhooks, downloads, planMetrics, tracking: Boolean(tracking), attached, licenseById: new Map(licenses.map((row) => [row.id, row])), trialById: new Map(trials.map((row) => [row.id, row])), issued: new Map(licenses.map((row) => [row.installation_id, row])) }
  }

  const purchases = (d) => d.installs.filter((r) => r.lifetime_session_id || r.pending_lifetime_session_id).map((r) => {
    const license = d.issued.get(r.id)
    return {
      id: short(r.id), created: iso(r.created_at),
      status: r.lifetime_session_id ? 'paid' : 'checkout_started',
      session: tail(r.lifetime_session_id ?? r.pending_lifetime_session_id), customer: tail(r.customer_id),
      license: license ? { last4: license.key_last4, revoked: Boolean(license.revoked_at) } : null,
      email: license ? email(license.email) : null,
    }
  }).sort(newest)

  const licenseRows = (d) => d.licenses.map((l) => ({
    id: short(l.id), last4: l.key_last4, email: email(l.email), created: iso(l.created_at),
    actionId: cancelLifetime ? l.id : null,
    sentAt: iso(l.sent_at), revokedAt: iso(l.revoked_at), activatedAt: iso(l.activated_at),
    slotsUsed: (d.attached.get(l.id) ?? []).length, cap,
  })).sort(newest)

  const activationRows = (d) => d.licenses.map((l) => ({
    license: l.key_last4, email: email(l.email), revoked: Boolean(l.revoked_at), created: iso(l.created_at),
    slots: Array.from({ length: cap }, (_, i) => {
      const row = (d.attached.get(l.id) ?? []).find((r) => Number(r.license_slot) === i + 1)
      return { slot: i + 1, installation: row ? short(row.id) : null, device: row?.device_id ? short(row.device_id) : null,
        platform: row?.device_platform || null, since: row ? iso(row.created_at) : null, lastSeen: row ? iso(row.last_seen_at) : null }
    }),
  })).sort(newest)

  // Only the desktop app calls /v1/status (the website never does), so last_seen_at marks desktop use.
  const userRows = (d) => d.installs.map((r) => {
    const desktop = Boolean(r.license_id || r.last_seen_at)
    const checkout = Boolean(r.lifetime_session_id || r.pending_lifetime_session_id)
    const trial = r.license_id ? d.trialById.get(r.license_id) : null
    const license = r.license_id ? (d.licenseById.get(r.license_id) ?? trial) : d.issued.get(r.id)
    const trialActive = trial && trial.sent_at && !trial.revoked_at && trial.bound_installation_id === r.id && (!trial.expires_at || Date.parse(trial.expires_at) > Date.now())
    return {
      id: short(r.id), kind: desktop ? 'desktop' : checkout ? 'checkout' : 'unseen',
      created: iso(r.created_at), lastSeen: iso(r.last_seen_at),
      device: r.device_id ? short(r.device_id) : null, platform: r.device_platform || null,
      licensed: Boolean(trial ? trialActive : r.license_id && license && !license.revoked_at), license: license?.key_last4 ?? null, slot: r.license_slot ?? null,
      licenseType: trial ? 'trial' : license ? 'lifetime' : null,
      buyer: Boolean(r.lifetime_session_id),
      email: license ? email(license.email) : null,
    }
  }).sort(newest)

  function usage(d) {
    const rows = userRows(d)
    const count = (test) => rows.filter(test).length
    return {
      tracking: d.tracking, registered: rows.length,
      desktop: count((r) => r.kind === 'desktop'), checkout: count((r) => r.kind === 'checkout'), unseen: count((r) => r.kind === 'unseen'),
      licensed: count((r) => r.licensed),
      active24h: count((r) => within(r.lastSeen, 1)), active7d: count((r) => within(r.lastSeen, 7)), active30d: count((r) => within(r.lastSeen, 30)),
    }
  }

  function pick(rows, url, fields, filters) {
    const q = (url.searchParams.get('q') ?? '').trim().toLowerCase().slice(0, 80)
    const test = filters[url.searchParams.get('filter') ?? 'all']
    if (!test) throw new AdminError(400, 'Unknown filter.')
    return rows.filter(test).filter((row) => !q || fields.some((key) => String(row[key] ?? '').toLowerCase().includes(q)))
  }

  function installer() {
    const blob = env.BLOB_DOWNLOAD_PATH?.trim()
    const localPath = env.LOCAL_DOWNLOAD_PATH?.trim()
    const filename = env.LOCAL_DOWNLOAD_FILENAME?.trim() || env.BLOB_DOWNLOAD_FILENAME?.trim() || 'Nafran-Leads-Scraper-Setup.exe'
    const signing = Boolean(env.DOWNLOAD_SIGNING_KEY?.trim())
    if (blob) return { storage: 'blob', filename, signing, ready: signing, detail: signing ? 'Private Blob path is set. Run live checks to confirm the upload.' : 'Blob path is set, but DOWNLOAD_SIGNING_KEY is missing.' }
    if (localPath) return { storage: 'local-file', filename, signing, ready: signing, detail: signing ? 'Private installer path is set on the billing server.' : 'Private installer path is set, but DOWNLOAD_SIGNING_KEY is missing.' }
    if (/^https:\/\//.test(env.DOWNLOAD_URL?.trim() ?? '')) return { storage: 'local-url', filename, signing, ready: false, detail: 'DOWNLOAD_URL is only honoured while billing runs on localhost.' }
    return { storage: 'none', filename, signing, ready: false, detail: 'No private installer is configured.' }
  }
  const emailConfig = () => ({ provider: env.RESEND_API_KEY?.trim() && env.EMAIL_FROM?.trim() ? 'resend' : 'none' })

  function configChecks() {
    const checks = []
    const add = (id, label, state, detail) => checks.push({ id, label, state, detail })
    add('stripe_key', 'Stripe secret key', mode === 'test' ? 'ok' : mode === 'live' ? 'warn' : 'missing',
      mode === 'test' ? 'Test-mode key is set.' : mode === 'live' ? 'A live key is set. Keep test keys until live payments are approved.' : 'STRIPE_SECRET_KEY is not set.')
    add('stripe_prices', 'Stripe Lifetime Price ID', pricesSet ? 'ok' : 'missing', pricesSet ? 'The Rs 10,000 PKR Lifetime price ID is set.' : 'Set STRIPE_PRICE_LIFETIME.')
    add('webhook', 'Stripe webhook secret', env.STRIPE_WEBHOOK_SECRET?.trim() ? 'ok' : 'missing', env.STRIPE_WEBHOOK_SECRET?.trim() ? 'Signed webhooks can be verified.' : 'STRIPE_WEBHOOK_SECRET is not set.')
    const publicUrl = env.BILLING_PUBLIC_URL || (env.VERCEL_URL ? `https://${env.VERCEL_URL}` : '')
    const https = /^https:\/\/[^/]+\/?$/.test(publicUrl)
    const local = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?$/.test(publicUrl)
    add('public_url', 'Billing public URL', https ? 'ok' : local ? 'warn' : 'missing', https ? 'HTTPS origin is set.' : local ? 'Localhost only. Fine for local testing.' : 'BILLING_PUBLIC_URL is not set.')
    add('signing', 'Download signing key', env.DOWNLOAD_SIGNING_KEY?.trim() ? 'ok' : 'missing', env.DOWNLOAD_SIGNING_KEY?.trim() ? 'Short-lived download grants can be signed.' : 'DOWNLOAD_SIGNING_KEY is not set.')
    const inst = installer()
    add('installer', 'Private installer', ['blob', 'local-file'].includes(inst.storage) ? (inst.ready ? 'ok' : 'warn') : inst.storage === 'local-url' ? 'warn' : 'missing', inst.detail)
    add('email', 'License email delivery', emailConfig().provider === 'resend' ? 'ok' : 'missing',
      emailConfig().provider === 'resend' ? 'Resend key and sender address are set.' : 'Not configured. License keys are shown once on the purchase return page.')
    add('support', 'Support inbox', supportWriter && env.SUPPORT_INBOX && env.RESEND_API_KEY ? 'ok' : 'missing', 'Tickets are saved by billing. Replies require the loopback writer, SUPPORT_INBOX and Resend configuration.')
    return checks
  }

  function dataChecks(d) {
    const checks = []
    const add = (id, label, state, detail) => checks.push({ id, label, state, detail })
    add('usage_tracking', 'Usage and download tracking', d.tracking && d.downloads ? 'ok' : 'missing',
      d.tracking && d.downloads ? 'Desktop last-seen and installer downloads are recorded.' : 'Deploy the updated billing server to record desktop activity and downloads.')
    const hooks = d.webhooks
    add('webhooks', 'Stripe webhooks received', hooks && Number(hooks.count) > 0 ? 'ok' : 'warn',
      hooks && Number(hooks.count) > 0 ? `${hooks.count} received, last ${String(iso(hooks.last)).slice(0, 16).replace('T', ' ')} UTC.` : 'No signed Stripe webhook has been recorded yet.')
    return checks
  }

  async function stripe(path) {
    const response = await outbound(`https://api.stripe.com/v1/${path}`, { headers: { authorization: `Bearer ${stripeKey}` }, signal: AbortSignal.timeout(15_000) })
    const result = await response.json().catch(() => ({}))
    if (!response.ok) throw new AdminError(502, 'Stripe request failed.')
    return result
  }

  async function liveChecks() {
    const checks = []
    const add = (id, label, state, detail) => checks.push({ id, label, state, detail })
    try { await store.ping(); add('database', 'Billing database', 'ok', store.kind === 'neon' ? 'Neon Postgres answered.' : 'Local SQLite file is readable.') }
    catch { add('database', 'Billing database', 'error', 'The billing tables could not be read.') }
    if (mode !== 'missing' && pricesSet) {
      try {
        const price = await stripe(`prices/${encodeURIComponent(env.STRIPE_PRICE_LIFETIME)}`)
        const ok = price.active && price.currency === 'pkr' && price.unit_amount === 1000000 && !price.recurring
        add('stripe_api', 'Stripe API', ok ? 'ok' : 'warn', ok ? `Lifetime price answers in ${mode} mode.` : 'Lifetime price does not match the approved Rs 10,000 PKR one-time product.')
      } catch { add('stripe_api', 'Stripe API', 'error', 'Stripe did not answer the price lookup.') }
    }
    const site = env.ADMIN_PROBE_SITE_URL?.trim()
    if (/^https:\/\//.test(site ?? '')) {
      try {
        const response = await outbound(new URL('/health', site).toString(), { signal: AbortSignal.timeout(8_000) })
        const body = await response.json().catch(() => null)
        add('public_site', 'Public billing routes', response.ok && body?.ok ? 'ok' : 'error',
          response.ok && body?.ok ? `${new URL(site).host}/health answers.` : `${new URL(site).host}/health returned ${response.status}.`)
      } catch { add('public_site', 'Public billing routes', 'error', 'The public site did not answer.') }
    }
    if (probeBlob && env.BLOB_DOWNLOAD_PATH?.trim()) {
      try { await probeBlob(env.BLOB_DOWNLOAD_PATH.trim()); add('installer_blob', 'Installer upload', 'ok', 'The private installer object exists.') }
      catch { add('installer_blob', 'Installer upload', 'error', 'The private installer object was not found.') }
    }
    return checks
  }

  // Revenue is read from Stripe (the billing tables store no amounts). Only customers
  // recorded by this billing server are read, so other Stripe activity is not counted.
  async function computeRevenue(d) {
    const customers = [...new Set(d.installs.map((r) => r.customer_id).filter((id) => /^cus_[A-Za-z0-9]+$/.test(id ?? '')))]
    const emailByCustomer = new Map()
    for (const r of d.installs) { const license = d.issued.get(r.id); if (r.customer_id && license) emailByCustomer.set(r.customer_id, license.email) }
    let errors = 0
    const safe = (worker) => async (item) => { try { await worker(item) } catch { errors += 1 } }
    const lifetimeIntents = new Set()
    await pool(d.installs.filter((r) => r.lifetime_session_id).slice(0, MAX_STRIPE_OBJECTS), safe(async (r) => {
      const session = await stripe(`checkout/sessions/${encodeURIComponent(r.lifetime_session_id)}`)
      if (/^pi_[A-Za-z0-9]+$/.test(session.payment_intent ?? '')) lifetimeIntents.add(session.payment_intent)
    }))
    const charges = new Map()
    await pool(customers.slice(0, MAX_STRIPE_OBJECTS), safe(async (customer) => {
      let after = ''
      for (let page = 0; page < 5; page += 1) {
        const list = await stripe(`charges?customer=${encodeURIComponent(customer)}&limit=100${after ? `&starting_after=${encodeURIComponent(after)}` : ''}`)
        for (const charge of list.data ?? []) charges.set(charge.id, charge)
        if (!list.has_more || !list.data?.length) break
        after = list.data.at(-1).id
      }
    }))
    const now = new Date()
    const months = Array.from({ length: 12 }, (_, i) => ({ key: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11 + i, 1)).toISOString().slice(0, 7), net: 0 }))
    const monthIndex = new Map(months.map((m, i) => [m.key, i]))
    const totals = { gross: 0, refunded: 0, net: 0, lifetimeSales: 0, lifetimeNet: 0, otherCharges: 0, otherNet: 0, disputed: 0, otherCurrency: 0 }
    const payments = []
    for (const charge of charges.values()) {
      if (charge.livemode !== (mode === 'live')) continue
      if (charge.currency !== 'pkr') { totals.otherCurrency += 1; continue }
      const ok = charge.paid === true && charge.status === 'succeeded'
      const captured = ok ? Number(charge.amount_captured ?? charge.amount ?? 0) : 0
      const refunded = ok ? Number(charge.amount_refunded ?? 0) : 0
      const product = lifetimeIntents.has(charge.payment_intent) ? 'lifetime' : 'other'
      if (ok) {
        totals.gross += captured; totals.refunded += refunded; totals.net += captured - refunded
        if (product === 'lifetime') { totals.lifetimeNet += captured - refunded; if (refunded < captured) totals.lifetimeSales += 1 }
        else { totals.otherCharges += 1; totals.otherNet += captured - refunded }
        if (charge.disputed) totals.disputed += 1
        const key = new Date(charge.created * 1000).toISOString().slice(0, 7)
        if (monthIndex.has(key)) months[monthIndex.get(key)].net += captured - refunded
      }
      payments.push({
        id: tail(charge.id), created: iso(charge.created * 1000), product, amount: Number(charge.amount ?? 0), refunded, currency: 'pkr',
        status: charge.disputed ? 'disputed' : !ok ? (charge.status === 'failed' ? 'failed' : 'pending') : refunded >= captured && captured > 0 ? 'refunded' : refunded > 0 ? 'partial_refund' : 'paid',
        email: email(emailByCustomer.get(charge.customer) || charge.billing_details?.email || ''),
      })
    }
    payments.sort(newest)
    return { available: true, mode, currency: 'pkr', ...totals, months, payments: payments.slice(0, 500), paymentCount: payments.length, partial: errors > 0, truncated: customers.length > MAX_STRIPE_OBJECTS, computedAt: new Date().toISOString() }
  }

  async function verifyPurchase(d, id) {
    if (mode !== 'test' && env.ADMIN_ALLOW_LIVE_READS !== '1') throw new AdminError(409, 'Stripe verification is limited to test mode.')
    if (!/^[0-9a-f-]{8}$/.test(String(id ?? ''))) throw new AdminError(400, 'Unknown purchase.')
    const matches = d.installs.filter((r) => String(r.id).startsWith(id) && r.lifetime_session_id)
    if (matches.length !== 1) throw new AdminError(404, 'Unknown purchase.')
    const session = await stripe(`checkout/sessions/${encodeURIComponent(matches[0].lifetime_session_id)}`)
    let charge = null
    if (/^pi_/.test(session.payment_intent ?? '')) {
      const intent = await stripe(`payment_intents/${encodeURIComponent(session.payment_intent)}`)
      if (/^ch_/.test(intent.latest_charge ?? '')) charge = await stripe(`charges/${encodeURIComponent(intent.latest_charge)}`)
    }
    return {
      id, amount: session.amount_total ?? null, currency: session.currency ?? null, livemode: Boolean(session.livemode),
      paymentStatus: session.payment_status ?? 'unknown', paid: charge?.paid === true,
      refunded: Boolean(charge?.refunded) || Number(charge?.amount_refunded ?? 0) > 0, disputed: charge?.disputed === true,
      checkedAt: new Date().toISOString(),
    }
  }

  async function body(readBody,limit=4096) {
    const raw = await readBody()
    if (Buffer.byteLength(raw) > limit) throw new AdminError(413, 'Request is too large.')
    try { return raw ? JSON.parse(raw) : {} } catch { throw new AdminError(400, 'Invalid JSON.') }
  }

  async function handle({ method, url: rawUrl, authorization, cookie, csrf, ip = 'unknown', secure = false, readBody = async () => '' }) {
    try {
      const url = new URL(rawUrl, 'http://admin.invalid')
      const path = url.pathname.replace(/\/+$/, '')
      if (!path.startsWith('/admin/api/')) throw new AdminError(404, 'Endpoint not found.')
      if (path === '/admin/api/auth-config' && method === 'GET') {
        return respond(200, { emailLoginEnabled, tokenLoginEnabled })
      }
      if (path === '/admin/api/session' && method === 'POST') {
        throttle(ip)
        const { token, email, password } = await body(readBody)
        const passwordValid = emailLoginEnabled && await verifyOwnerPassword(password, passwordHash)
        const accepted = token !== undefined ? validToken(token) : Boolean(passwordValid && normalizeOwnerEmail(email) === ownerEmail)
        if (!accepted) { recordFailure(ip); throw new AdminError(401, 'Invalid owner sign-in details.') }
        failures.delete(ip)
        return respond(200, { ok: true, mode }, { 'set-cookie': sessionCookie(secure) })
      }
      if (path === '/admin/api/session' && method === 'DELETE') {
        return respond(200, { ok: true }, { 'set-cookie': `${COOKIE}=; Path=/admin; HttpOnly; SameSite=Strict; Max-Age=0${secure ? '; Secure' : ''}` })
      }
      throttle(ip)
      const bearer = /^Bearer (\S+)$/.exec(authorization ?? '')?.[1]
      if (!(bearer ? validToken(bearer) : validSession(cookie))) {
        if (bearer) recordFailure(ip)
        throw new AdminError(401, 'Owner sign-in required.')
      }
      if (method !== 'GET' && csrf !== '1') throw new AdminError(403, 'Missing admin request header.')
      if(path==='/admin/api/support'||path.startsWith('/admin/api/support/')){
        try{return respond(200,await supportApi({method,url,store,writer:supportWriter,body:()=>body(readBody,16384),email,actor:bearer?'owner-token':ownerEmail||'owner',cap}))}
        catch(e){throw new AdminError([400,404,405,409,413,429,502,503].includes(e.status)?e.status:503,[400,404,405,409,413,429,502,503].includes(e.status)?e.message:'Support is temporarily unavailable.')}
      }

      if (method === 'POST' && path === '/admin/api/licenses/cancel') {
        if (!cancelLifetime) throw new AdminError(503, 'Lifetime cancellation is not configured on this server.')
        const input = await body(readBody)
        if (!input || typeof input.id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(input.id) ||
            typeof input.last4 !== 'string' || input.last4.length !== 4 || input.confirmation !== 'CANCEL LIFETIME' ||
            typeof input.reason !== 'string' || input.reason.trim().length < 3 || input.reason.length > 300) {
          throw new AdminError(400, 'Confirm the licence and provide a reason (3–300 characters).')
        }
        try {
          return respond(200, await cancelLifetime({ id: input.id, last4: input.last4, confirmation: input.confirmation,
            reason: input.reason.trim(), actor: bearer ? 'owner-token' : ownerEmail || 'owner' }))
        } catch (error) {
          const safe = [400, 404, 409].includes(error.status)
          throw new AdminError(safe ? error.status : 503, safe ? error.message : 'Cancellation could not be confirmed. Refresh the licence status before retrying.')
        }
      }

      if (method === 'GET' && path === '/admin/api/session') return respond(200, { ok: true, mode })
      if (method === 'GET' && path === '/admin/api/health') {
        let fromData = []
        try { fromData = dataChecks(await snapshot()) } catch {}
        return respond(200, { mode, checks: [...configChecks(), ...fromData, ...(url.searchParams.get('probe') === '1' ? await liveChecks() : [])], checkedAt: new Date().toISOString() })
      }
      const d = await snapshot()
      if (method === 'GET' && path === '/admin/api/summary') {
        const lic = licenseRows(d)
        const live = lic.filter((l) => !l.revokedAt)
        const paid = d.installs.filter((r) => r.lifetime_session_id)
        const metrics = d.planMetrics ?? {
          lifetimePurchases: paid.length,
          lifetimeCustomers: new Set(paid.map((r) => r.customer_id || r.id)).size,
          trialKeysSent: d.trials.filter((r) => r.sent_at).length,
          trialActivated: d.trials.filter((r) => r.bound_installation_id).length,
          trialActive: d.trials.filter((r) => r.sent_at && !r.revoked_at && r.expires_at && Date.parse(r.expires_at) > Date.now()).length,
        }
        return respond(200, {
          mode, cap, generatedAt: new Date().toISOString(),
          counts: {
            installations: d.installs.length,
            purchases: metrics.lifetimePurchases,
            customers: metrics.lifetimeCustomers,
            checkoutsStarted: d.installs.filter((r) => !r.lifetime_session_id && r.pending_lifetime_session_id).length,
            licenses: lic.length, revoked: lic.length - live.length, trials: metrics.trialKeysSent,
            trialActivated: metrics.trialActivated, trialActive: metrics.trialActive,
            emailed: lic.filter((l) => l.sentAt).length, activated: live.filter((l) => l.slotsUsed > 0).length,
            slotsUsed: live.reduce((sum, l) => sum + Math.min(l.slotsUsed, cap), 0), slotsTotal: live.length * cap,
          },
          usage: usage(d),
          downloads: d.downloads ? { tracking: true, total: Number(d.downloads.total ?? 0), public: Number(d.downloads.public ?? 0), buyers: Number(d.downloads.buyers ?? 0), last30d: Number(d.downloads.last30d ?? 0), last: iso(d.downloads.last) } : { tracking: false },
          webhooks: d.webhooks ? { count: Number(d.webhooks.count ?? 0), last: iso(d.webhooks.last) } : null,
          revenueReadable: stripeReadsAllowed,
          installer: installer(), email: emailConfig(), checks: [...configChecks(), ...dataChecks(d)],
        })
      }
      if (method === 'GET' && path === '/admin/api/users') {
        return respond(200, { tracking: d.tracking, rows: pick(userRows(d), url, ['id', 'email', 'license'], {
          all: () => true, desktop: (r) => r.kind === 'desktop', active7: (r) => within(r.lastSeen, 7),
          inactive: (r) => r.kind === 'desktop' && !within(r.lastSeen, 30), licensed: (r) => r.licensed,
          checkout: (r) => r.kind === 'checkout', unseen: (r) => r.kind === 'unseen',
        }) })
      }
      if (method === 'GET' && path === '/admin/api/revenue') {
        if (mode === 'missing') return respond(200, { available: false, mode, reason: 'STRIPE_SECRET_KEY is not set, so revenue cannot be read from Stripe.' })
        if (!stripeReadsAllowed) return respond(200, { available: false, mode, reason: 'A live Stripe key is set. Revenue reads stay off until you set ADMIN_ALLOW_LIVE_READS=1.' })
        if (!revenueCache || Date.now() - revenueCache.at > 300_000 || url.searchParams.get('refresh') === '1') {
          revenueRun ??= computeRevenue(d).then((value) => { revenueCache = { at: Date.now(), value }; return value }).finally(() => { revenueRun = null })
          try { await revenueRun } catch { throw new AdminError(502, 'Stripe revenue could not be read.') }
        }
        return respond(200, revenueCache.value)
      }
      if (method === 'GET' && path === '/admin/api/purchases') {
        return respond(200, { rows: pick(purchases(d), url, ['id', 'email', 'session', 'customer'], {
          all: () => true, paid: (r) => r.status === 'paid', checkout_started: (r) => r.status === 'checkout_started',
          unlicensed: (r) => r.status === 'paid' && !r.license,
        }) })
      }
      if (method === 'GET' && path === '/admin/api/licenses') {
        return respond(200, { cap, rows: pick(licenseRows(d), url, ['id', 'last4', 'email'], {
          all: () => true, active: (r) => !r.revokedAt, revoked: (r) => Boolean(r.revokedAt), unsent: (r) => !r.sentAt,
          unactivated: (r) => r.slotsUsed === 0, full: (r) => r.slotsUsed >= r.cap,
        }) })
      }
      if (method === 'GET' && path === '/admin/api/activations') {
        return respond(200, { cap, rows: pick(activationRows(d), url, ['license', 'email'], {
          all: () => true, used: (r) => r.slots.some((s) => s.installation), free: (r) => r.slots.some((s) => !s.installation),
        }) })
      }
      if (method === 'POST' && path === '/admin/api/purchases/verify') {
        return respond(200, await verifyPurchase(d, (await body(readBody)).id))
      }
      throw new AdminError(404, 'Endpoint not found.')
    } catch (error) {
      return respond(error instanceof AdminError ? error.status : 500, { error: error instanceof AdminError ? error.message : 'Admin server error.' })
    }
  }

  return { handle, mode }
}
