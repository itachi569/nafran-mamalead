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
        pending_lifetime_session_id text,
        pending_decision_session_id text,
        license_id text,
        license_slot integer,
        created_at timestamptz not null
      )
    `.then(async () => {
      await sql`alter table billing_installations add column if not exists pending_lifetime_session_id text`
      await sql`alter table billing_installations add column if not exists pending_decision_session_id text`
      await sql`alter table billing_installations add column if not exists license_id text`
      await sql`alter table billing_installations add column if not exists license_slot integer`
      await sql`alter table billing_installations add column if not exists device_id text`
      await sql`alter table billing_installations add column if not exists device_platform text`
      await sql`create unique index if not exists billing_license_slot on billing_installations (license_id, license_slot) where license_id is not null and license_slot is not null`
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
          bound_installation_id text unique
        )
      `
      await sql`create table if not exists billing_events (event_id text primary key, received_at timestamptz not null)`
      await sql`create table if not exists billing_public_downloads (id text primary key, created_at timestamptz not null)`
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
    async saveLifetime(id, sessionId, customerId) {
      await ready()
      await sql`update billing_installations set lifetime_session_id = ${sessionId}, pending_lifetime_session_id = null, customer_id = ${customerId} where id = ${id}`
    },
    async saveDecision(id, subscriptionId, customerId) {
      await ready()
      await sql`update billing_installations set decision_subscription_id = ${subscriptionId}, pending_decision_session_id = null, customer_id = ${customerId} where id = ${id}`
    },
    async licenseForInstallation(installationId) {
      await ready()
      const paid = (await sql`select l.* from billing_licenses l join billing_installations i on i.license_id = l.id where i.id = ${installationId} limit 1`)[0]
      if (paid) return { ...paid, kind: 'lifetime' }
      const trial = (await sql`select t.* from billing_trial_licenses t join billing_installations i on i.license_id = t.id where i.id = ${installationId} limit 1`)[0]
      return trial ? { ...trial, kind: 'trial' } : null
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
      return trial ? { ...trial, kind: 'trial' } : null
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
