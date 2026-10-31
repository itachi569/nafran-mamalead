import { createServer } from 'node:http'
import { Readable } from 'node:stream'
import { createReadStream, mkdirSync, readFileSync } from 'node:fs'
import { stat } from 'node:fs/promises'
import { basename, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import { randomUUID } from 'node:crypto'
import { createBillingHandler, HttpError } from './core.mjs'
import { createLicenseAdminServer } from './admin-licenses.mjs'
import { initializeOwnerLicenses, ownerLicense, activateOwnerLicense } from './owner-licenses.mjs'
import {retrySupportDelivery} from './support.mjs'
import {createSqliteSupportStore} from './support-store.mjs'

export function createBillingServer(options = {}) {
  const env = { ...(options.env ?? process.env) }
  try {
    const installerPath = readFileSync(new URL('./.installer-path', import.meta.url), 'utf8').trim()
    if (!/^\/opt\/billing\/artifacts\/[A-Za-z0-9._-]+\.exe$/.test(installerPath)) throw new Error('The server installer path file is invalid.')
    env.LOCAL_DOWNLOAD_PATH = installerPath
    env.LOCAL_DOWNLOAD_FILENAME = basename(installerPath)
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
  }
  for (const [arch, prefix] of [['arm64', 'MAC_ARM64'], ['x64', 'MAC_X64']]) {
    try {
      const installerPath = readFileSync(new URL(`./.mac-${arch}-path`, import.meta.url), 'utf8').trim()
      if (!/^\/opt\/billing\/artifacts\/[A-Za-z0-9._-]+\.dmg$/.test(installerPath)) throw new Error(`The server Mac ${arch} installer path file is invalid.`)
      env[`${prefix}_LOCAL_DOWNLOAD_PATH`] = installerPath
      env[`${prefix}_LOCAL_DOWNLOAD_FILENAME`] = basename(installerPath)
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error
    }
  }
  const port = Number(env.BILLING_PORT ?? 38747)
  const dbPath = resolve(env.BILLING_DB_PATH ?? './billing-server/data/billing.db')
  mkdirSync(dirname(dbPath), { recursive: true })
  const db = new DatabaseSync(dbPath)
  initializeOwnerLicenses(db)
  db.exec(`create table if not exists installations (
    id text primary key, token_hash text not null unique, customer_id text,
    lifetime_session_id text, decision_subscription_id text,
    decision_pass_session_id text, decision_pass_started_at text, decision_pass_expires_at text,
    pending_lifetime_session_id text, pending_decision_session_id text, license_id text, license_slot integer, created_at text not null
  )`)
  db.exec(`create table if not exists licenses (
    id text primary key, installation_id text not null, key_hash text not null unique,
    key_last4 text not null, encrypted_key text, email text not null, created_at text not null, sent_at text, revoked_at text,
    activated_at text
  )`)
  db.exec('create unique index if not exists licenses_one_per_purchase on licenses (installation_id)')
  // Older test data can contain multiple licenses for one email. The Checkout
  // reservation table below prevents new duplicates without breaking startup.
  const repeatedEmails = db.prepare('select 1 from licenses group by lower(email) having count(*) > 1 limit 1').get()
  if (!repeatedEmails) db.exec('create unique index if not exists licenses_one_per_email on licenses (lower(email))')
  db.exec(`create table if not exists lifetime_checkout_emails (
    email text primary key, installation_id text not null unique,
    session_id text, customer_id text, created_at text not null default CURRENT_TIMESTAMP
  )`)
  db.exec(`create table if not exists trial_licenses (
    id text primary key, installation_id text not null unique, key_hash text not null unique,
    key_last4 text not null, email text not null unique, created_at text not null,
    sent_at text, revoked_at text, activated_at text, expires_at text,
    bound_installation_id text unique, correction_count integer not null default 0
  )`)
  db.exec(`create table if not exists trial_map_runs (
    id text primary key, trial_id text not null, installation_id text not null,
    reserved integer not null check (reserved > 0 and reserved <= 300),
    delivered integer check (delivered >= 0 and delivered <= reserved),
    lease_until text not null, created_at text not null
  )`)
  db.exec('create index if not exists trial_map_runs_trial on trial_map_runs (trial_id)')
  db.exec(`create table if not exists billing_events (event_id text primary key, received_at text not null)`)
  db.exec('create table if not exists billing_downloads (id text primary key, installation_id text not null, created_at text not null)')
  db.exec('create table if not exists billing_public_downloads (id text primary key, created_at text not null)')
  db.exec(`create table if not exists decision_lead_uses (
    owner_id text not null, period_key text not null, subject_hash text not null,
    slot integer not null, created_at text not null,
    primary key (owner_id, period_key, subject_hash),
    unique (owner_id, period_key, slot)
  )`)
  db.exec(`create table if not exists decision_passes (
    session_id text primary key, owner_id text not null, customer_id text not null,
    started_at text not null, expires_at text not null
  )`)
  db.exec(`create table if not exists decision_licenses (
    id text primary key, installation_id text not null unique, purchase_session_id text not null unique, key_hash text not null unique,
    key_last4 text not null, encrypted_key text, email text not null unique,
    created_at text not null, sent_at text, revoked_at text, activated_at text
  )`)
  const columns = new Set(db.prepare('pragma table_info(installations)').all().map((column) => column.name))
  if (!columns.has('pending_lifetime_session_id')) db.exec('alter table installations add column pending_lifetime_session_id text')
  if (!columns.has('pending_decision_session_id')) db.exec('alter table installations add column pending_decision_session_id text')
  if (!columns.has('decision_pass_session_id')) db.exec('alter table installations add column decision_pass_session_id text')
  if (!columns.has('decision_pass_started_at')) db.exec('alter table installations add column decision_pass_started_at text')
  if (!columns.has('decision_pass_expires_at')) db.exec('alter table installations add column decision_pass_expires_at text')
  if (!columns.has('license_id')) db.exec('alter table installations add column license_id text')
  if (!columns.has('license_slot')) db.exec('alter table installations add column license_slot integer')
  if (!columns.has('decision_license_id')) db.exec('alter table installations add column decision_license_id text')
  if (!columns.has('decision_license_slot')) db.exec('alter table installations add column decision_license_slot integer')
  if (!columns.has('last_seen_at')) db.exec('alter table installations add column last_seen_at text')
  if (!columns.has('device_id')) db.exec('alter table installations add column device_id text')
  if (!columns.has('device_platform')) db.exec('alter table installations add column device_platform text')
  if (!columns.has('purchase_error')) db.exec('alter table installations add column purchase_error text')
  if (!columns.has('refunded_duplicate_session_id')) db.exec('alter table installations add column refunded_duplicate_session_id text')
  const licenseColumns = new Set(db.prepare('pragma table_info(licenses)').all().map((column) => column.name))
  if (!licenseColumns.has('encrypted_key')) db.exec('alter table licenses add column encrypted_key text')
  const trialColumns = new Set(db.prepare('pragma table_info(trial_licenses)').all().map((column) => column.name))
  if (!trialColumns.has('correction_count')) db.exec('alter table trial_licenses add column correction_count integer not null default 0')
  const checkoutColumns = new Set(db.prepare('pragma table_info(lifetime_checkout_emails)').all().map((column) => column.name))
  if (!checkoutColumns.has('created_at')) db.exec('alter table lifetime_checkout_emails add column created_at text')
  db.exec('create unique index if not exists installations_license_slot on installations (license_id, license_slot) where license_id is not null and license_slot is not null')
  db.exec('create unique index if not exists installations_decision_license_slot on installations (decision_license_id, decision_license_slot) where decision_license_id is not null and decision_license_slot is not null')
  db.exec('create table if not exists assist_usage (bucket text primary key, used integer not null, expires_at integer)')
  const store = {
    ...createSqliteSupportStore(db),
    reserveAssistUsage: async (buckets) => {
      db.exec('BEGIN IMMEDIATE')
      try {
        db.prepare('delete from assist_usage where expires_at is not null and expires_at < ?').run(Date.now())
        const usage = buckets.map(({ key }) => db.prepare('select used from assist_usage where bucket = ?').get(key)?.used ?? 0)
        if (usage.some((used, i) => used >= buckets[i].limit)) { db.exec('COMMIT'); return null }
        for (const bucket of buckets) db.prepare('insert into assist_usage (bucket, used, expires_at) values (?, 1, ?) on conflict(bucket) do update set used = used + 1').run(bucket.key, bucket.expires)
        db.exec('COMMIT')
        return usage.map((used, i) => buckets[i].limit - used - 1)
      } catch (error) { db.exec('ROLLBACK'); throw error }
    },
    create: async (id, tokenHash, createdAt, deviceId, devicePlatform) => { db.prepare('insert into installations (id, token_hash, created_at, device_id, device_platform) values (?, ?, ?, ?, ?)').run(id, tokenHash, createdAt, deviceId, devicePlatform) },
    bindDevice: async (id, deviceId, devicePlatform) => Boolean(db.prepare('update installations set device_id = ?, device_platform = coalesce(device_platform, ?) where id = ? and (device_id is null or device_id = ?)').run(deviceId, devicePlatform, id, deviceId).changes),
    byTokenHash: async (tokenHash) => db.prepare('select * from installations where token_hash = ?').get(tokenHash),
    byId: async (id) => db.prepare('select * from installations where id = ?').get(id),
    savePending: async (id, product, sessionId) => { db.prepare(product === 'lifetime' ? 'update installations set pending_lifetime_session_id = ? where id = ?' : 'update installations set pending_decision_session_id = ? where id = ?').run(sessionId, id) },
    clearPurchaseError: async (id) => { db.prepare('update installations set purchase_error = null where id = ?').run(id) },
    markDuplicateLifetime: async (id, sessionId) => { db.prepare('update installations set pending_lifetime_session_id = null, purchase_error = ?, refunded_duplicate_session_id = ? where id = ?').run('This email already has a lifetime account. The duplicate payment was refunded; use the original license key.', sessionId, id) },
    markDuplicateDecision: async (id, sessionId) => { db.prepare('update installations set pending_decision_session_id = null, purchase_error = ?, refunded_duplicate_session_id = ? where id = ?').run('This email already has a Decision Makers key. The duplicate payment was refunded; use the original key.', sessionId, id) },
    reserveLifetimeEmail: async (email, installationId) => {
      const inserted = db.prepare('insert or ignore into lifetime_checkout_emails (email, installation_id, created_at) values (?, ?, ?)').run(email, installationId, new Date().toISOString()).changes > 0
      const row = db.prepare('select * from lifetime_checkout_emails where email = ? and installation_id = ?').get(email, installationId)
      return row ? { ...row, newlyCreated: inserted } : null
    },
    lifetimeCheckoutByEmail: async (email) => db.prepare('select * from lifetime_checkout_emails where email = ?').get(email) ?? null,
    releaseLifetimeEmail: async (email, installationId) => { db.prepare('delete from lifetime_checkout_emails where email = ? and installation_id = ?').run(email, installationId) },
    saveLifetimeCheckout: async (email, installationId, sessionId, customerId) => {
      db.prepare('update lifetime_checkout_emails set session_id = ?, customer_id = ? where email = ? and installation_id = ?').run(sessionId, customerId, email, installationId)
      db.prepare('update installations set pending_lifetime_session_id = ?, customer_id = ? where id = ?').run(sessionId, customerId, installationId)
    },
    lifetimeCheckoutForInstallation: async (installationId) => db.prepare('select * from lifetime_checkout_emails where installation_id = ?').get(installationId),
    lifetimeLicenseByEmail: async (email) => db.prepare('select * from licenses where lower(email) = ? limit 1').get(email),
    saveLifetime: async (id, sessionId, customerId) => { db.prepare('update installations set lifetime_session_id = ?, pending_lifetime_session_id = null, customer_id = ? where id = ?').run(sessionId, customerId, id) },
    saveDecision: async (id, subscriptionId, customerId) => { db.prepare('update installations set decision_subscription_id = ?, pending_decision_session_id = null, customer_id = ? where id = ?').run(subscriptionId, customerId, id) },
    saveDecisionPass: async (id, sessionId, customerId, startedAt, expiresAt) => {
      db.exec('BEGIN IMMEDIATE')
      try {
        db.prepare('insert or ignore into decision_passes (session_id, owner_id, customer_id, started_at, expires_at) values (?, ?, ?, ?, ?)')
          .run(sessionId, id, customerId, startedAt, expiresAt)
        db.prepare('update installations set decision_pass_session_id = ?, decision_pass_started_at = ?, decision_pass_expires_at = ?, pending_decision_session_id = null, customer_id = ? where id = ? and (pending_decision_session_id = ? or decision_pass_session_id = ?)')
          .run(sessionId, startedAt, expiresAt, customerId, id, sessionId, sessionId)
        db.exec('COMMIT')
      } catch (error) { db.exec('ROLLBACK'); throw error }
    },
    countDecisionUses: async (ownerId, periodKey) => db.prepare('select count(*) as n from decision_lead_uses where owner_id = ? and period_key = ?').get(ownerId, periodKey).n,
    reserveDecisionUse: async (ownerId, periodKey, subjectHash, limit) => {
      db.exec('BEGIN IMMEDIATE')
      try {
        const existing = db.prepare('select slot from decision_lead_uses where owner_id = ? and period_key = ? and subject_hash = ?').get(ownerId, periodKey, subjectHash)
        const used = db.prepare('select count(*) as n from decision_lead_uses where owner_id = ? and period_key = ?').get(ownerId, periodKey).n
        if (!existing && used < limit) db.prepare('insert into decision_lead_uses (owner_id, period_key, subject_hash, slot, created_at) values (?, ?, ?, ?, ?)').run(ownerId, periodKey, subjectHash, used + 1, new Date().toISOString())
        db.exec('COMMIT')
        return existing || used < limit ? { used: existing ? used : used + 1, new: !existing } : null
      } catch (error) { db.exec('ROLLBACK'); throw error }
    },
    licenseForInstallation: async (installationId) => {
      const paid = db.prepare('select l.* from licenses l join installations i on i.license_id = l.id where i.id = ?').get(installationId)
      if (paid) return { ...paid, kind: 'lifetime' }
      const trial = db.prepare('select t.* from trial_licenses t join installations i on i.license_id = t.id where i.id = ?').get(installationId)
      if (trial) return { ...trial, kind: 'trial' }
      return ownerLicense(db.prepare('select l.* from owner_licenses l join installations i on i.license_id = l.id where i.id = ?').get(installationId))
    },
    decisionLicenseForInstallation: async (installationId) => db.prepare('select l.* from decision_licenses l join installations i on i.decision_license_id = l.id where i.id = ?').get(installationId) ?? null,
    decisionLicenseForPurchase: async (installationId) => db.prepare('select * from decision_licenses where installation_id = ?').get(installationId) ?? null,
    decisionLicenseByEmail: async (email) => db.prepare('select * from decision_licenses where lower(email) = ?').get(email) ?? null,
    createDecisionLicense: async ({ id, installationId, purchaseSessionId, keyHash, keyLast4, encryptedKey, email, createdAt }) => {
      db.prepare('insert into decision_licenses (id, installation_id, purchase_session_id, key_hash, key_last4, encrypted_key, email, created_at) values (?, ?, ?, ?, ?, ?, ?, ?)').run(id, installationId, purchaseSessionId, keyHash, keyLast4, encryptedKey, email, createdAt)
      return db.prepare('select * from decision_licenses where id = ?').get(id)
    },
    markDecisionLicenseSent: async (id, sentAt) => { db.prepare('update decision_licenses set sent_at = ?, encrypted_key = null where id = ?').run(sentAt, id) },
    countDecisionLicenseActivations: async (licenseId) => db.prepare('select count(*) as count from installations where decision_license_id = ?').get(licenseId).count,
    attachDecisionLicense: async (installationId, licenseId, activatedAt, max) => {
      for (let slot = 1; slot <= max; slot += 1) {
        try {
          const result = db.prepare('update installations set decision_license_id = ?, decision_license_slot = ? where id = ?').run(licenseId, slot, installationId)
          if (!result.changes) return false
          db.prepare('update decision_licenses set activated_at = coalesce(activated_at, ?) where id = ?').run(activatedAt, licenseId)
          return true
        } catch (error) { if (!String(error).includes('UNIQUE constraint failed')) throw error }
      }
      return false
    },
    licenseForPurchase: async (installationId) => db.prepare('select * from licenses where installation_id = ? limit 1').get(installationId),
    licenseByHash: async (keyHash) => {
      const paid = db.prepare('select * from licenses where key_hash = ?').get(keyHash)
      if (paid) return { ...paid, kind: 'lifetime' }
      const trial = db.prepare('select * from trial_licenses where key_hash = ?').get(keyHash)
      if (trial) return { ...trial, kind: 'trial' }
      const decision = db.prepare('select * from decision_licenses where key_hash = ?').get(keyHash)
      return decision ? { ...decision, kind: 'decision' } : ownerLicense(db.prepare('select * from owner_licenses where key_hash = ?').get(keyHash))
    },
    activateOwnerLicense: async (installationId, licenseId, activatedAt) => activateOwnerLicense(db, installationId, licenseId, activatedAt),
    trialById: async (id) => db.prepare('select * from trial_licenses where id = ?').get(id),
    trialByEmail: async (email) => db.prepare('select * from trial_licenses where email = ?').get(email),
    trialForInstallation: async (installationId) => db.prepare('select * from trial_licenses where installation_id = ?').get(installationId),
    trialMapUsage: async (trialId, limit) => {
      db.prepare('delete from trial_map_runs where delivered is null and lease_until <= ?').run(new Date().toISOString())
      const totals = db.prepare('select coalesce(sum(coalesce(delivered, 0)), 0) as used, coalesce(sum(case when delivered is null then reserved else 0 end), 0) as reserved from trial_map_runs where trial_id = ?').get(trialId)
      return { used: totals.used, remaining: Math.max(0, limit - totals.used - totals.reserved) }
    },
    reserveTrialMapLeads: async (trialId, installationId, requested, limit) => {
      db.exec('BEGIN IMMEDIATE')
      try {
        const now = new Date().toISOString()
        const trial = db.prepare('select expires_at, revoked_at, bound_installation_id from trial_licenses where id = ?').get(trialId)
          ?? db.prepare("select expires_at, revoked_at, bound_installation_id from owner_licenses where id = ? and kind = 'trial'").get(trialId)
        if (!trial || trial.revoked_at || trial.bound_installation_id !== installationId || !trial.expires_at || trial.expires_at <= now) { db.exec('COMMIT'); return null }
        db.prepare('delete from trial_map_runs where delivered is null and lease_until <= ?').run(now)
        const totals = db.prepare('select coalesce(sum(coalesce(delivered, 0)), 0) as used, coalesce(sum(case when delivered is null then reserved else 0 end), 0) as reserved from trial_map_runs where trial_id = ?').get(trialId)
        const allowed = Math.min(requested, Math.max(0, limit - totals.used - totals.reserved))
        if (!allowed) { db.exec('COMMIT'); return null }
        const id = randomUUID()
        db.prepare('insert into trial_map_runs (id, trial_id, installation_id, reserved, lease_until, created_at) values (?, ?, ?, ?, ?, ?)')
          .run(id, trialId, installationId, allowed, new Date(Date.now() + 120_000).toISOString(), now)
        db.exec('COMMIT')
        return { reservationId: id, allowed, used: totals.used, remaining: Math.max(0, limit - totals.used - totals.reserved - allowed) }
      } catch (error) { db.exec('ROLLBACK'); throw error }
    },
    heartbeatTrialMapRun: async (installationId, reservationId) => Boolean(db.prepare(`
      update trial_map_runs set lease_until = ? where id = ? and installation_id = ?
        and delivered is null and lease_until > ?
    `).run(new Date(Date.now() + 120_000).toISOString(), reservationId, installationId, new Date().toISOString()).changes),
    settleTrialMapRun: async (installationId, reservationId, captured, limit) => {
      db.exec('BEGIN IMMEDIATE')
      try {
        const row = db.prepare('select * from trial_map_runs where id = ? and installation_id = ?').get(reservationId, installationId)
        if (!row || (row.delivered === null && row.lease_until <= new Date().toISOString())) { db.exec('COMMIT'); return null }
        const accepted = row.delivered === null ? Math.min(captured, row.reserved) : row.delivered
        if (row.delivered === null) db.prepare('update trial_map_runs set delivered = ? where id = ?').run(accepted, reservationId)
        const used = db.prepare('select coalesce(sum(delivered), 0) as n from trial_map_runs where trial_id = ?').get(row.trial_id).n
        db.exec('COMMIT')
        return { accepted, used, remaining: Math.max(0, limit - used) }
      } catch (error) { db.exec('ROLLBACK'); throw error }
    },
    createTrial: async ({ id, installationId, keyHash, keyLast4, email, createdAt }) => {
      db.prepare('insert into trial_licenses (id, installation_id, key_hash, key_last4, email, created_at) values (?, ?, ?, ?, ?, ?)').run(id, installationId, keyHash, keyLast4, email, createdAt)
    },
    replaceUnactivatedTrial: async ({ id, installationId, keyHash, keyLast4, email, previousHash }) => Boolean(db.prepare(`
      update trial_licenses set key_hash = ?, key_last4 = ?, email = ?, sent_at = null, correction_count = correction_count + 1
      where id = ? and installation_id = ? and key_hash = ? and sent_at is not null
        and activated_at is null and bound_installation_id is null and revoked_at is null
    `).run(keyHash, keyLast4, email, id, installationId, previousHash).changes),
    restoreTrialCorrection: async ({ id, replacementHash, previous }) => Boolean(db.prepare(`
      update trial_licenses set key_hash = ?, key_last4 = ?, email = ?, sent_at = ?, correction_count = ?
      where id = ? and key_hash = ? and sent_at is null
        and activated_at is null and bound_installation_id is null
    `).run(previous.key_hash, previous.key_last4, previous.email, previous.sent_at, previous.correction_count ?? 0, id, replacementHash).changes),
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
        const previous = db.prepare(`select t.id from trial_licenses t
          join installations used on used.id = t.bound_installation_id
          join installations target on target.id = ?
          where t.id <> ? and t.activated_at is not null
          and (used.id = target.id or (target.device_id is not null and used.device_id = target.device_id)) limit 1`).get(installationId, trialId)
        if (previous) { db.exec('ROLLBACK'); return null }
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
  const getLocalInstaller = options.getLocalInstaller ?? (async (path, {head=false}={}) => {
    const file = await stat(path).catch(() => null)
    if (!file?.isFile()) return null
    return { size: file.size, stream: head ? null : Readable.toWeb(createReadStream(path)) }
  })
  const hasLocalInstaller = options.hasLocalInstaller ?? (async (path) => {
    const file = await stat(path).catch(() => null)
    return Boolean(file?.isFile() && file.size > 0)
  })
  try { handler = createBillingHandler({ env, store, fetch: options.fetch, getBlob: options.getBlob, getLocalInstaller, hasLocalInstaller, sendEmail: options.sendEmail }) }
  catch (error) { db.close(); throw error }
  const allowedOrigins = new Set((env.BILLING_ALLOWED_ORIGINS ?? '').split(',').map((origin) => origin.trim()).filter(Boolean))
  if(!env.RESEND_API_KEY || !env.EMAIL_FROM || !env.SUPPORT_INBOX)console.warn('Support email delivery is not configured: set RESEND_API_KEY, EMAIL_FROM and SUPPORT_INBOX. Saved tickets will remain queued.')
  const server = createServer(async (req, res) => {
    const origin = req.headers.origin
    if (origin && !allowedOrigins.has(origin)) {
      res.writeHead(403, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
      res.end(JSON.stringify({ error: 'Origin is not allowed.' }))
      return
    }
    const corsHeaders = origin ? {
      'access-control-allow-origin': origin,
      'access-control-allow-methods': 'GET, HEAD, POST, OPTIONS',
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
      ip: env.SUPPORT_TRUST_PROXY === '1' ? String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim() : req.socket.remoteAddress || '',
      readBody: async () => {
        let raw = ''
        for await (const chunk of req) {
          raw += chunk
          if (Buffer.byteLength(raw) > (['/v1/support','/v1/support/web'].includes(req.url?.split('?')[0]) ? 32768 : 16384)) throw new HttpError(413, 'Request is too large.')
        }
        return raw
      },
    })
    res.writeHead(result.status, { ...result.headers, ...corsHeaders })
    if (result.body instanceof ReadableStream) Readable.fromWeb(result.body).on('error', () => res.destroy()).pipe(res)
    else res.end(result.body)
  })
  let supportRetryBusy=false
  const supportTimer=setInterval(async()=>{if(supportRetryBusy)return;supportRetryBusy=true;try{await retrySupportDelivery({env,store,fetcher:options.fetch})}catch{}finally{supportRetryBusy=false}},60000)
  supportTimer.unref();server.once('close',()=>clearInterval(supportTimer))
  const licenseAdmin = createLicenseAdminServer(db, {env, fetch: options.fetch})
  if (licenseAdmin) {
    server.once('listening', () => licenseAdmin.listen(38749, '127.0.0.1'))
    server.once('close', () => licenseAdmin.close())
  }
  return { server, db, port, close: () => { server.close(); licenseAdmin?.close(); db.close() } }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const service = createBillingServer()
  const host = process.env.BILLING_HOST ?? '127.0.0.1'
  service.server.listen(service.port, host, () => {
    console.log(`Billing server ready on ${host}:${service.port} (${process.env.STRIPE_MODE ?? 'test'} mode)`)
  })
}
