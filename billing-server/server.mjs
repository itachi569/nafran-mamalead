import { createServer } from 'node:http'
import { Readable } from 'node:stream'
import { createReadStream, mkdirSync } from 'node:fs'
import { stat } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import { createBillingHandler, HttpError } from './core.mjs'

export function createBillingServer(options = {}) {
  const env = options.env ?? process.env
  const port = Number(env.BILLING_PORT ?? 38747)
  const dbPath = resolve(env.BILLING_DB_PATH ?? './billing-server/data/billing.db')
  mkdirSync(dirname(dbPath), { recursive: true })
  const db = new DatabaseSync(dbPath)
  db.exec(`create table if not exists installations (
    id text primary key, token_hash text not null unique, customer_id text,
    lifetime_session_id text, decision_subscription_id text,
    pending_lifetime_session_id text, pending_decision_session_id text, license_id text, license_slot integer, created_at text not null
  )`)
  db.exec(`create table if not exists licenses (
    id text primary key, installation_id text not null, key_hash text not null unique,
    key_last4 text not null, encrypted_key text, email text not null, created_at text not null, sent_at text, revoked_at text,
    activated_at text
  )`)
  db.exec('create unique index if not exists licenses_one_per_purchase on licenses (installation_id)')
  db.exec(`create table if not exists trial_licenses (
    id text primary key, installation_id text not null unique, key_hash text not null unique,
    key_last4 text not null, email text not null unique, created_at text not null,
    sent_at text, revoked_at text, activated_at text, expires_at text,
    bound_installation_id text unique
  )`)
  db.exec(`create table if not exists billing_events (event_id text primary key, received_at text not null)`)
  db.exec('create table if not exists billing_downloads (id text primary key, installation_id text not null, created_at text not null)')
  db.exec('create table if not exists billing_public_downloads (id text primary key, created_at text not null)')
  const columns = new Set(db.prepare('pragma table_info(installations)').all().map((column) => column.name))
  if (!columns.has('pending_lifetime_session_id')) db.exec('alter table installations add column pending_lifetime_session_id text')
  if (!columns.has('pending_decision_session_id')) db.exec('alter table installations add column pending_decision_session_id text')
  if (!columns.has('license_id')) db.exec('alter table installations add column license_id text')
  if (!columns.has('license_slot')) db.exec('alter table installations add column license_slot integer')
  if (!columns.has('last_seen_at')) db.exec('alter table installations add column last_seen_at text')
  if (!columns.has('device_id')) db.exec('alter table installations add column device_id text')
  if (!columns.has('device_platform')) db.exec('alter table installations add column device_platform text')
  const licenseColumns = new Set(db.prepare('pragma table_info(licenses)').all().map((column) => column.name))
  if (!licenseColumns.has('encrypted_key')) db.exec('alter table licenses add column encrypted_key text')
  db.exec('create unique index if not exists installations_license_slot on installations (license_id, license_slot) where license_id is not null and license_slot is not null')
  const store = {
    create: async (id, tokenHash, createdAt, deviceId, devicePlatform) => { db.prepare('insert into installations (id, token_hash, created_at, device_id, device_platform) values (?, ?, ?, ?, ?)').run(id, tokenHash, createdAt, deviceId, devicePlatform) },
    bindDevice: async (id, deviceId, devicePlatform) => Boolean(db.prepare('update installations set device_id = ?, device_platform = coalesce(device_platform, ?) where id = ? and (device_id is null or device_id = ?)').run(deviceId, devicePlatform, id, deviceId).changes),
    byTokenHash: async (tokenHash) => db.prepare('select * from installations where token_hash = ?').get(tokenHash),
    byId: async (id) => db.prepare('select * from installations where id = ?').get(id),
    savePending: async (id, product, sessionId) => { db.prepare(product === 'lifetime' ? 'update installations set pending_lifetime_session_id = ? where id = ?' : 'update installations set pending_decision_session_id = ? where id = ?').run(sessionId, id) },
    saveLifetime: async (id, sessionId, customerId) => { db.prepare('update installations set lifetime_session_id = ?, pending_lifetime_session_id = null, customer_id = ? where id = ?').run(sessionId, customerId, id) },
    saveDecision: async (id, subscriptionId, customerId) => { db.prepare('update installations set decision_subscription_id = ?, pending_decision_session_id = null, customer_id = ? where id = ?').run(subscriptionId, customerId, id) },
    licenseForInstallation: async (installationId) => {
      const paid = db.prepare('select l.* from licenses l join installations i on i.license_id = l.id where i.id = ?').get(installationId)
      if (paid) return { ...paid, kind: 'lifetime' }
      const trial = db.prepare('select t.* from trial_licenses t join installations i on i.license_id = t.id where i.id = ?').get(installationId)
      return trial ? { ...trial, kind: 'trial' } : null
    },
    licenseForPurchase: async (installationId) => db.prepare('select * from licenses where installation_id = ? limit 1').get(installationId),
    licenseByHash: async (keyHash) => {
      const paid = db.prepare('select * from licenses where key_hash = ?').get(keyHash)
      if (paid) return { ...paid, kind: 'lifetime' }
      const trial = db.prepare('select * from trial_licenses where key_hash = ?').get(keyHash)
      return trial ? { ...trial, kind: 'trial' } : null
    },
    trialById: async (id) => db.prepare('select * from trial_licenses where id = ?').get(id),
    trialByEmail: async (email) => db.prepare('select * from trial_licenses where email = ?').get(email),
    trialForInstallation: async (installationId) => db.prepare('select * from trial_licenses where installation_id = ?').get(installationId),
    createTrial: async ({ id, installationId, keyHash, keyLast4, email, createdAt }) => {
      db.prepare('insert into trial_licenses (id, installation_id, key_hash, key_last4, email, created_at) values (?, ?, ?, ?, ?, ?)').run(id, installationId, keyHash, keyLast4, email, createdAt)
    },
    markTrialSent: async (id, sentAt) => { db.prepare('update trial_licenses set sent_at = ? where id = ?').run(sentAt, id) },
    deleteUnsentTrial: async (id) => { db.prepare('delete from trial_licenses where id = ? and sent_at is null').run(id) },
    activateTrial: async (installationId, trialId, activatedAt, expiresAt) => {
      db.exec('BEGIN IMMEDIATE')
      try {
        const trial = db.prepare('select * from trial_licenses where id = ?').get(trialId)
        if (!trial || !trial.sent_at || trial.revoked_at || (trial.bound_installation_id && trial.bound_installation_id !== installationId) || (trial.expires_at && trial.expires_at <= activatedAt)) {
          db.exec('ROLLBACK')
          return null
        }
        if (!trial.bound_installation_id) db.prepare('update trial_licenses set bound_installation_id = ?, activated_at = ?, expires_at = ? where id = ?').run(installationId, activatedAt, expiresAt, trialId)
        const installed = db.prepare('update installations set license_id = ?, license_slot = 1 where id = ? returning id').get(trialId, installationId)
        if (!installed) { db.exec('ROLLBACK'); return null }
        const result = db.prepare('select activated_at, expires_at from trial_licenses where id = ?').get(trialId)
        db.exec('COMMIT')
        return result
      } catch (error) { db.exec('ROLLBACK'); throw error }
    },
    createLicense: async ({ id, installationId, keyHash, keyLast4, encryptedKey, email, createdAt }) => { db.prepare('insert into licenses (id, installation_id, key_hash, key_last4, encrypted_key, email, created_at) values (?, ?, ?, ?, ?, ?, ?)').run(id, installationId, keyHash, keyLast4, encryptedKey, email, createdAt); return db.prepare('select * from licenses where id = ?').get(id) },
    markLicenseSent: async (id, sentAt) => { db.prepare('update licenses set sent_at = ?, encrypted_key = null where id = ?').run(sentAt, id) },
    countLicenseActivations: async (licenseId) => db.prepare('select count(*) as count from installations where license_id = ?').get(licenseId).count,
    attachLicense: async (installationId, licenseId, activatedAt, max) => {
      for (let slot = 1; slot <= max; slot += 1) {
        try {
          const result = db.prepare('update installations set license_id = ?, license_slot = ? where id = ?').run(licenseId, slot, installationId)
          if (!result.changes) return false
          db.prepare('update licenses set activated_at = coalesce(activated_at, ?) where id = ?').run(activatedAt, licenseId)
          return true
        } catch (error) {
          if (!String(error).includes('UNIQUE constraint failed')) throw error
        }
      }
      return false
    },
    claimWebhookEvent: async (eventId) => { try { db.prepare('insert into billing_events (event_id, received_at) values (?, ?)').run(eventId, new Date().toISOString()); return true } catch { return false } },
    markSeen: async (id, seenAt) => { db.prepare('update installations set last_seen_at = ? where id = ? and (last_seen_at is null or last_seen_at < ?)').run(seenAt, id, new Date(Date.parse(seenAt) - 600_000).toISOString()) },
    recordDownload: async (id, installationId, createdAt) => { db.prepare('insert into billing_downloads (id, installation_id, created_at) values (?, ?, ?)').run(id, installationId, createdAt) },
    recordPublicDownload: async (id, createdAt) => { db.prepare('insert into billing_public_downloads (id, created_at) values (?, ?)').run(id, createdAt) },
    revokeDecision: async (subscriptionId) => { db.prepare('update installations set decision_subscription_id = null where decision_subscription_id = ?').run(subscriptionId) },
  }
  let handler
  const getLocalInstaller = options.getLocalInstaller ?? (async (path) => {
    const file = await stat(path).catch(() => null)
    if (!file?.isFile()) return null
    return { size: file.size, stream: Readable.toWeb(createReadStream(path)) }
  })
  try { handler = createBillingHandler({ env, store, fetch: options.fetch, getBlob: options.getBlob, getLocalInstaller, sendEmail: options.sendEmail }) }
  catch (error) { db.close(); throw error }
  const allowedOrigins = new Set((env.BILLING_ALLOWED_ORIGINS ?? '').split(',').map((origin) => origin.trim()).filter(Boolean))
  const server = createServer(async (req, res) => {
    const origin = req.headers.origin
    if (origin && !allowedOrigins.has(origin)) {
      res.writeHead(403, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
      res.end(JSON.stringify({ error: 'Origin is not allowed.' }))
      return
    }
    const corsHeaders = origin ? {
      'access-control-allow-origin': origin,
      'access-control-allow-methods': 'GET, POST, OPTIONS',
      'access-control-allow-headers': 'Authorization, Content-Type',
      'access-control-max-age': '600',
      vary: 'Origin',
    } : {}
    if (req.method === 'OPTIONS') {
      res.writeHead(204, corsHeaders)
      res.end()
      return
    }
    const result = await handler.handle({
      method: req.method,
      url: req.url,
      authorization: req.headers.authorization,
      deviceId: req.headers['x-nafran-device-id'],
      devicePlatform: req.headers['x-nafran-device-platform'],
      stripeSignature: req.headers['stripe-signature'],
      readBody: async () => {
        let raw = ''
        for await (const chunk of req) {
          raw += chunk
          if (raw.length > 16_384) throw new HttpError(413, 'Request is too large.')
        }
        return raw
      },
    })
    res.writeHead(result.status, { ...result.headers, ...corsHeaders })
    if (result.body instanceof ReadableStream) Readable.fromWeb(result.body).on('error', () => res.destroy()).pipe(res)
    else res.end(result.body)
  })
  return { server, db, port, close: () => { server.close(); db.close() } }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const service = createBillingServer()
  const host = process.env.BILLING_HOST ?? '127.0.0.1'
  service.server.listen(service.port, host, () => {
    console.log(`Billing server ready on ${host}:${service.port} (${process.env.STRIPE_MODE ?? 'test'} mode)`)
  })
}
