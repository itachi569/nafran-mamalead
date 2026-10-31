import { neon } from '@neondatabase/serverless'

/** Persistent installation identity and Stripe references for Vercel Functions. */
export function createNeonStore(databaseUrl) {
  if (!databaseUrl || !/^postgres(?:ql)?:\/\//.test(databaseUrl)) throw new Error('DATABASE_URL must be a Postgres connection URL.')
  const sql = neon(databaseUrl)
  let schemaReady
  const ready = () => {
    schemaReady ??= sql`
      create table if not exists billing_installations (
        id text primary key,
        token_hash text not null unique,
        customer_id text,
        lifetime_session_id text,
        decision_subscription_id text,
        decision_pass_session_id text,
        decision_pass_started_at timestamptz,
        decision_pass_expires_at timestamptz,
        pending_lifetime_session_id text,
        pending_decision_session_id text,
        license_id text,
        license_slot integer,
        created_at timestamptz not null
      )
    `.then(async () => {
      await sql`alter table billing_installations add column if not exists pending_lifetime_session_id text`
      await sql`alter table billing_installations add column if not exists pending_decision_session_id text`
      await sql`alter table billing_installations add column if not exists decision_pass_session_id text`
      await sql`alter table billing_installations add column if not exists decision_pass_started_at timestamptz`
      await sql`alter table billing_installations add column if not exists decision_pass_expires_at timestamptz`
      await sql`alter table billing_installations add column if not exists license_id text`
      await sql`alter table billing_installations add column if not exists license_slot integer`
      await sql`alter table billing_installations add column if not exists decision_license_id text`
      await sql`alter table billing_installations add column if not exists decision_license_slot integer`
      await sql`alter table billing_installations add column if not exists purchase_error text`
      await sql`alter table billing_installations add column if not exists refunded_duplicate_session_id text`
      await sql`alter table billing_installations add column if not exists device_id text`
      await sql`alter table billing_installations add column if not exists device_platform text`
      await sql`create unique index if not exists billing_license_slot on billing_installations (license_id, license_slot) where license_id is not null and license_slot is not null`
      await sql`create unique index if not exists billing_decision_license_slot on billing_installations (decision_license_id, decision_license_slot) where decision_license_id is not null and decision_license_slot is not null`
      await sql`
        create table if not exists billing_licenses (
          id text primary key,
          installation_id text not null,
          key_hash text not null unique,
          key_last4 text not null,
          email text not null,
          created_at timestamptz not null,
          sent_at timestamptz,
          revoked_at timestamptz,
          activated_at timestamptz
        )
      `
      await sql`create unique index if not exists billing_licenses_one_per_purchase on billing_licenses (installation_id)`
      await sql`create unique index if not exists billing_licenses_one_per_email on billing_licenses (lower(email))`
      await sql`create table if not exists billing_lifetime_checkout_emails (email text primary key, installation_id text not null unique, session_id text, customer_id text, created_at timestamptz not null default now())`
      await sql`alter table billing_lifetime_checkout_emails add column if not exists created_at timestamptz`
      await sql`
        create table if not exists billing_trial_licenses (
          id text primary key,
          installation_id text not null unique,
          key_hash text not null unique,
          key_last4 text not null,
          email text not null unique,
          created_at timestamptz not null,
          sent_at timestamptz,
          revoked_at timestamptz,
          activated_at timestamptz,
          expires_at timestamptz,
          bound_installation_id text unique,
          correction_count integer not null default 0
        )
      `
      await sql`alter table billing_trial_licenses add column if not exists correction_count integer not null default 0`
      await sql`create table if not exists billing_events (event_id text primary key, received_at timestamptz not null)`
      await sql`create table if not exists billing_public_downloads (id text primary key, created_at timestamptz not null)`
      await sql`create table if not exists billing_decision_lead_uses (
        owner_id text not null, period_key text not null, subject_hash text not null,
        slot integer not null, created_at timestamptz not null,
        primary key (owner_id, period_key, subject_hash),
        unique (owner_id, period_key, slot)
      )`
      await sql`create table if not exists billing_decision_passes (session_id text primary key, owner_id text not null, customer_id text not null, started_at timestamptz not null, expires_at timestamptz not null)`
      await sql`create table if not exists billing_decision_licenses (id text primary key, installation_id text not null unique, purchase_session_id text not null unique, key_hash text not null unique, key_last4 text not null, encrypted_key text, email text not null unique, created_at timestamptz not null, sent_at timestamptz, revoked_at timestamptz, activated_at timestamptz)`
    }).catch((error) => { schemaReady = undefined; throw error })
    return schemaReady
  }
  return {
    async create(id, tokenHash, createdAt, deviceId, devicePlatform) {
      await ready()
      await sql`insert into billing_installations (id, token_hash, created_at, device_id, device_platform) values (${id}, ${tokenHash}, ${createdAt}, ${deviceId}, ${devicePlatform})`
    },
    async bindDevice(id, deviceId, devicePlatform) {
      await ready()
      const rows = await sql`update billing_installations set device_id = ${deviceId}, device_platform = coalesce(device_platform, ${devicePlatform}) where id = ${id} and (device_id is null or device_id = ${deviceId}) returning id`
      return rows.length > 0
    },
    async byTokenHash(tokenHash) {
      await ready()
      return (await sql`select * from billing_installations where token_hash = ${tokenHash} limit 1`)[0] ?? null
    },
    async byId(id) {
      await ready()
      return (await sql`select * from billing_installations where id = ${id} limit 1`)[0] ?? null
    },
    async savePending(id, product, sessionId) {
      await ready()
      if (product === 'lifetime') await sql`update billing_installations set pending_lifetime_session_id = ${sessionId} where id = ${id}`
      else await sql`update billing_installations set pending_decision_session_id = ${sessionId} where id = ${id}`
    },
    async markDuplicateDecision(id, sessionId) {
      await ready()
      await sql`update billing_installations set pending_decision_session_id = null, purchase_error = ${'This email already has a Decision Makers key. The duplicate payment was refunded; use the original key.'}, refunded_duplicate_session_id = ${sessionId} where id = ${id}`
    },
    async reserveLifetimeEmail(email, installationId) {
      await ready()
      const inserted = await sql`insert into billing_lifetime_checkout_emails (email, installation_id, created_at) values (${email}, ${installationId}, ${new Date().toISOString()}) on conflict do nothing returning email`
      const row = (await sql`select * from billing_lifetime_checkout_emails where email = ${email} and installation_id = ${installationId} limit 1`)[0]
      return row ? { ...row, newlyCreated: inserted.length > 0 } : null
    },
    async lifetimeCheckoutByEmail(email) {
      await ready()
      return (await sql`select * from billing_lifetime_checkout_emails where email = ${email} limit 1`)[0] ?? null
    },
    async releaseLifetimeEmail(email, installationId) {
      await ready()
      await sql`delete from billing_lifetime_checkout_emails where email = ${email} and installation_id = ${installationId}`
    },
    async saveLifetimeCheckout(email, installationId, sessionId, customerId) {
      await ready()
      await sql`update billing_lifetime_checkout_emails set session_id = ${sessionId}, customer_id = ${customerId} where email = ${email} and installation_id = ${installationId}`
      await sql`update billing_installations set pending_lifetime_session_id = ${sessionId}, customer_id = ${customerId} where id = ${installationId}`
    },
    async lifetimeCheckoutForInstallation(installationId) {
      await ready()
      return (await sql`select * from billing_lifetime_checkout_emails where installation_id = ${installationId} limit 1`)[0] ?? null
    },
    async lifetimeLicenseByEmail(email) {
      await ready()
      return (await sql`select * from billing_licenses where lower(email) = ${email} limit 1`)[0] ?? null
    },
    async saveLifetime(id, sessionId, customerId) {
      await ready()
      await sql`update billing_installations set lifetime_session_id = ${sessionId}, pending_lifetime_session_id = null, customer_id = ${customerId} where id = ${id}`
    },
    async saveDecision(id, subscriptionId, customerId) {
      await ready()
      await sql`update billing_installations set decision_subscription_id = ${subscriptionId}, pending_decision_session_id = null, customer_id = ${customerId} where id = ${id}`
    },
    async saveDecisionPass(id, sessionId, customerId, startedAt, expiresAt) {
      await ready()
      await sql`insert into billing_decision_passes (session_id, owner_id, customer_id, started_at, expires_at) values (${sessionId}, ${id}, ${customerId}, ${startedAt}, ${expiresAt}) on conflict do nothing`
      await sql`update billing_installations set decision_pass_session_id = ${sessionId}, decision_pass_started_at = ${startedAt}, decision_pass_expires_at = ${expiresAt}, pending_decision_session_id = null, customer_id = ${customerId} where id = ${id} and (pending_decision_session_id = ${sessionId} or decision_pass_session_id = ${sessionId})`
    },
    async countDecisionUses(ownerId, periodKey) {
      await ready()
      return Number((await sql`select count(*)::int as n from billing_decision_lead_uses where owner_id = ${ownerId} and period_key = ${periodKey}`)[0]?.n ?? 0)
    },
    async reserveDecisionUse(ownerId, periodKey, subjectHash, limit) {
      await ready()
      for (let attempt = 0; attempt < 20; attempt += 1) {
        const existing = (await sql`select slot from billing_decision_lead_uses where owner_id = ${ownerId} and period_key = ${periodKey} and subject_hash = ${subjectHash} limit 1`)[0]
        if (existing) return { used: await this.countDecisionUses(ownerId, periodKey), new: false }
        const rows = await sql`
          insert into billing_decision_lead_uses (owner_id, period_key, subject_hash, slot, created_at)
          select ${ownerId}, ${periodKey}, ${subjectHash}, candidate.slot, ${new Date().toISOString()}
          from generate_series(1, ${limit}) as candidate(slot)
          where not exists (select 1 from billing_decision_lead_uses used where used.owner_id = ${ownerId} and used.period_key = ${periodKey} and used.slot = candidate.slot)
          order by candidate.slot limit 1
          on conflict do nothing returning slot
        `
        if (rows.length) return { used: await this.countDecisionUses(ownerId, periodKey), new: true }
        if (await this.countDecisionUses(ownerId, periodKey) >= limit) return null
      }
      throw new Error('Decision Maker capacity is busy. Retry shortly.')
    },
    async licenseForInstallation(installationId) {
      await ready()
      const paid = (await sql`select l.* from billing_licenses l join billing_installations i on i.license_id = l.id where i.id = ${installationId} limit 1`)[0]
      if (paid) return { ...paid, kind: 'lifetime' }
      const trial = (await sql`select t.* from billing_trial_licenses t join billing_installations i on i.license_id = t.id where i.id = ${installationId} limit 1`)[0]
      return trial ? { ...trial, kind: 'trial' } : null
    },
    async decisionLicenseForInstallation(installationId) {
      await ready()
      return (await sql`select l.* from billing_decision_licenses l join billing_installations i on i.decision_license_id = l.id where i.id = ${installationId} limit 1`)[0] ?? null
    },
    async decisionLicenseForPurchase(installationId) {
      await ready()
      return (await sql`select * from billing_decision_licenses where installation_id = ${installationId} limit 1`)[0] ?? null
    },
    async decisionLicenseByEmail(email) {
      await ready()
      return (await sql`select * from billing_decision_licenses where lower(email) = ${email} limit 1`)[0] ?? null
    },
    async createDecisionLicense({ id, installationId, purchaseSessionId, keyHash, keyLast4, encryptedKey, email, createdAt }) {
      await ready()
      return (await sql`insert into billing_decision_licenses (id, installation_id, purchase_session_id, key_hash, key_last4, encrypted_key, email, created_at) values (${id}, ${installationId}, ${purchaseSessionId}, ${keyHash}, ${keyLast4}, ${encryptedKey}, ${email}, ${createdAt}) returning *`)[0]
    },
    async markDecisionLicenseSent(id, sentAt) {
      await ready()
      await sql`update billing_decision_licenses set sent_at = ${sentAt}, encrypted_key = null where id = ${id}`
    },
    async countDecisionLicenseActivations(licenseId) {
      await ready()
      return Number((await sql`select count(*)::int as n from billing_installations where decision_license_id = ${licenseId}`)[0]?.n ?? 0)
    },
    async attachDecisionLicense(installationId, licenseId, activatedAt, max) {
      await ready()
      for (let slot = 1; slot <= max; slot += 1) {
        const updated = await sql`update billing_installations set decision_license_id = ${licenseId}, decision_license_slot = ${slot} where id = ${installationId} and not exists (select 1 from billing_installations where decision_license_id = ${licenseId} and decision_license_slot = ${slot}) returning id`
        if (updated.length) {
          await sql`update billing_decision_licenses set activated_at = coalesce(activated_at, ${activatedAt}) where id = ${licenseId}`
          return true
        }
      }
      return false
    },
    async licenseForPurchase(installationId) {
      await ready()
      return (await sql`select * from billing_licenses where installation_id = ${installationId} limit 1`)[0] ?? null
    },
    async licenseByHash(keyHash) {
      await ready()
      const paid = (await sql`select * from billing_licenses where key_hash = ${keyHash} limit 1`)[0]
      if (paid) return { ...paid, kind: 'lifetime' }
      const trial = (await sql`select * from billing_trial_licenses where key_hash = ${keyHash} limit 1`)[0]
      if (trial) return { ...trial, kind: 'trial' }
      const decision = (await sql`select * from billing_decision_licenses where key_hash = ${keyHash} limit 1`)[0]
      return decision ? { ...decision, kind: 'decision' } : null
    },
    async trialById(id) {
      await ready()
      return (await sql`select * from billing_trial_licenses where id = ${id} limit 1`)[0] ?? null
    },
    async trialByEmail(email) {
      await ready()
      return (await sql`select * from billing_trial_licenses where email = ${email} limit 1`)[0] ?? null
    },
    async trialForInstallation(installationId) {
      await ready()
      return (await sql`select * from billing_trial_licenses where installation_id = ${installationId} limit 1`)[0] ?? null
    },
    async createTrial({ id, installationId, keyHash, keyLast4, email, createdAt }) {
      await ready()
      await sql`insert into billing_trial_licenses (id, installation_id, key_hash, key_last4, email, created_at) values (${id}, ${installationId}, ${keyHash}, ${keyLast4}, ${email}, ${createdAt})`
    },
    async replaceUnactivatedTrial({ id, installationId, keyHash, keyLast4, email, previousHash }) {
      await ready()
      const rows = await sql`
        update billing_trial_licenses set key_hash = ${keyHash}, key_last4 = ${keyLast4},
          email = ${email}, sent_at = null, correction_count = correction_count + 1
        where id = ${id} and installation_id = ${installationId} and key_hash = ${previousHash}
          and sent_at is not null and activated_at is null and bound_installation_id is null and revoked_at is null
        returning id
      `
      return rows.length > 0
    },
    async restoreTrialCorrection({ id, replacementHash, previous }) {
      await ready()
      const rows = await sql`
        update billing_trial_licenses set key_hash = ${previous.key_hash}, key_last4 = ${previous.key_last4},
          email = ${previous.email}, sent_at = ${previous.sent_at}, correction_count = ${previous.correction_count ?? 0}
        where id = ${id} and key_hash = ${replacementHash} and sent_at is null
          and activated_at is null and bound_installation_id is null
        returning id
      `
      return rows.length > 0
    },
    async markTrialSent(id, sentAt) {
      await ready()
      await sql`update billing_trial_licenses set sent_at = ${sentAt} where id = ${id}`
    },
    async deleteUnsentTrial(id) {
      await ready()
      await sql`delete from billing_trial_licenses where id = ${id} and sent_at is null`
    },
    async activateTrial(installationId, trialId, activatedAt, expiresAt) {
      await ready()
      const rows = await sql`
        update billing_trial_licenses
        set bound_installation_id = coalesce(bound_installation_id, ${installationId}),
            activated_at = coalesce(activated_at, ${activatedAt}),
            expires_at = coalesce(expires_at, ${expiresAt})
        where id = ${trialId} and sent_at is not null and revoked_at is null
          and (bound_installation_id is null or bound_installation_id = ${installationId})
          and (expires_at is null or expires_at > ${activatedAt})
          and not exists (
            select 1 from billing_trial_licenses prior
            join billing_installations used on used.id = prior.bound_installation_id
            join billing_installations target on target.id = ${installationId}
            where prior.id <> ${trialId} and prior.activated_at is not null
              and (used.id = target.id or (target.device_id is not null and used.device_id = target.device_id))
          )
        returning activated_at, expires_at
      `
      if (!rows.length) return null
      try {
        const installed = await sql`update billing_installations set license_id = ${trialId}, license_slot = 1 where id = ${installationId} returning id`
        return installed.length ? rows[0] : null
      } catch (error) {
        if (error?.code === '23505') return null
        throw error
      }
    },
    async createLicense({ id, installationId, keyHash, keyLast4, email, createdAt }) {
      await ready()
      await sql`insert into billing_licenses (id, installation_id, key_hash, key_last4, email, created_at) values (${id}, ${installationId}, ${keyHash}, ${keyLast4}, ${email}, ${createdAt})`
      return (await sql`select * from billing_licenses where id = ${id} limit 1`)[0]
    },
    async markLicenseSent(id, sentAt) {
      await ready()
      await sql`update billing_licenses set sent_at = ${sentAt} where id = ${id}`
    },
    async countLicenseActivations(licenseId) {
      await ready()
      return Number((await sql`select count(*)::int as count from billing_installations where license_id = ${licenseId}`)[0]?.count ?? 0)
    },
    async attachLicense(installationId, licenseId, activatedAt, max) {
      await ready()
      for (let slot = 1; slot <= max; slot += 1) {
        try {
          const updated = await sql`update billing_installations set license_id = ${licenseId}, license_slot = ${slot} where id = ${installationId} returning id`
          if (!updated.length) return false
          await sql`update billing_licenses set activated_at = coalesce(activated_at, ${activatedAt}) where id = ${licenseId}`
          return true
        } catch (error) {
          if (error?.code !== '23505') throw error
        }
      }
      return false
    },
    async claimWebhookEvent(eventId) {
      await ready()
      try { await sql`insert into billing_events (event_id, received_at) values (${eventId}, ${new Date().toISOString()})`; return true } catch { return false }
    },
    async recordPublicDownload(id, createdAt) {
      await ready()
      await sql`insert into billing_public_downloads (id, created_at) values (${id}, ${createdAt})`
    },
    async revokeDecision(subscriptionId) {
      await ready()
      await sql`update billing_installations set decision_subscription_id = null where decision_subscription_id = ${subscriptionId}`
    },
  }
}
