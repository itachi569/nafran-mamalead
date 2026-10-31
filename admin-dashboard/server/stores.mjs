// Read-only views of the existing billing tables. Column lists are explicit so
// token_hash and key_hash can never leave the database through the admin API.
// last_seen_at and billing_downloads come from the updated billing server; both are optional.

const LIMIT = 2000
import {createSupportReads} from './support-reads.mjs'
const INSTALL_COLS = 'id, customer_id, lifetime_session_id, decision_subscription_id, pending_lifetime_session_id, pending_decision_session_id, license_id, license_slot, created_at'
const LICENSE_COLS = 'id, installation_id, key_last4, email, created_at, sent_at, revoked_at, activated_at'

export async function createSqliteAdminStore(path) {
  const { DatabaseSync } = await import('node:sqlite')
  let db
  try { db = new DatabaseSync(path, { readOnly: true }) }
  catch { throw new Error(`Billing database not found at ${path}. Start the billing server once or set BILLING_DB_PATH.`) }
  const all = (sql, ...args) => db.prepare(sql).all(...args)
  const optional = (sql, ...args) => { try { return all(sql, ...args)[0] ?? null } catch { return null } }
  const installationColumns = () => new Set(all('pragma table_info(installations)').map((column) => column.name))
  const hasSeen = () => installationColumns().has('last_seen_at')
  return {
    kind: 'sqlite',
    ...createSupportReads(async(sql,args)=>all(sql,...args)),
    ping: async () => { all('select 1 from installations limit 1'); all('select 1 from licenses limit 1') },
    seenTracking: async () => hasSeen(),
    installations: async () => {
      const columns = installationColumns()
      return all(`select ${INSTALL_COLS}, ${columns.has('decision_pass_session_id') ? 'decision_pass_session_id' : 'null as decision_pass_session_id'}, ${columns.has('last_seen_at') ? 'last_seen_at' : 'null as last_seen_at'}, ${columns.has('device_id') ? 'device_id' : 'null as device_id'}, ${columns.has('device_platform') ? 'device_platform' : 'null as device_platform'} from installations order by created_at desc limit ${LIMIT}`)
    },
    licenses: async () => all(`select ${LICENSE_COLS} from licenses order by created_at desc limit ${LIMIT}`),
    trialLicenses: async () => all(`select id, key_last4, email, sent_at, revoked_at, expires_at, bound_installation_id from trial_licenses order by created_at desc limit ${LIMIT}`),
    planMetrics: async () => {
      const lifetime = all(`select count(*) as purchases, count(distinct coalesce(customer_id, id)) as customers from installations where lifetime_session_id is not null`)[0]
      const decision = optional('select count(*) as passes from decision_passes')
      const legacyDecision = optional('select count(*) as subscriptions from installations where decision_subscription_id is not null')
      const trials = optional(`select count(*) filter (where sent_at is not null) as issued,
        count(*) filter (where activated_at is not null) as activated,
        count(*) filter (where sent_at is not null and revoked_at is null and expires_at > ?) as active
        from trial_licenses`, new Date().toISOString())
      return { lifetimePurchases: Number(lifetime.purchases), lifetimeCustomers: Number(lifetime.customers),
        decisionSubscriptions: Number(decision?.passes ?? 0) + Number(legacyDecision?.subscriptions ?? 0), trialKeysSent: Number(trials?.issued ?? 0),
        trialActivated: Number(trials?.activated ?? 0), trialActive: Number(trials?.active ?? 0) }
    },
    webhooks: async () => optional('select count(*) as count, max(received_at) as last from billing_events'),
    downloads: async () => {
      const cutoff = new Date(Date.now() - 30 * 86_400_000).toISOString()
      const protectedDownloads = optional('select count(*) as total, count(distinct installation_id) as buyers, sum(case when created_at >= ? then 1 else 0 end) as last30d, max(created_at) as last from billing_downloads', cutoff)
      const publicDownloads = optional('select count(*) as total, sum(case when created_at >= ? then 1 else 0 end) as last30d, max(created_at) as last from billing_public_downloads', cutoff)
      if (!protectedDownloads) return null
      return { total: Number(protectedDownloads.total || 0) + Number(publicDownloads?.total || 0), public: Number(publicDownloads?.total || 0),
        buyers: Number(protectedDownloads.buyers || 0), last30d: Number(protectedDownloads.last30d || 0) + Number(publicDownloads?.last30d || 0),
        last: [protectedDownloads.last, publicDownloads?.last].filter(Boolean).sort().at(-1) || null }
    },
    close: () => db.close(),
  }
}

export async function createNeonAdminStore(databaseUrl) {
  if (!/^postgres(?:ql)?:\/\//.test(databaseUrl ?? '')) throw new Error('DATABASE_URL must be a Postgres connection URL.')
  const { neon } = await import('@neondatabase/serverless')
  const sql = neon(databaseUrl)
  let seen = false
  const hasSeen = async () => {
    if (!seen) seen = (await sql`select 1 from information_schema.columns where table_name = 'billing_installations' and column_name = 'last_seen_at' limit 1`).length > 0
    return seen
  }
  let deviceColumns = false
  const hasDevices = async () => {
    if (!deviceColumns) deviceColumns = (await sql`select 1 from information_schema.columns where table_name = 'billing_installations' and column_name = 'device_id' limit 1`).length > 0
    return deviceColumns
  }
  const optional = async (query) => { try { return (await query())[0] ?? null } catch { return null } }
  return {
    kind: 'neon',
    ...createSupportReads((text,args)=>sql.query(text,args),'neon'),
    ping: async () => { await sql`select 1 from billing_installations limit 1`; await sql`select 1 from billing_licenses limit 1` },
    seenTracking: hasSeen,
    installations: async () => {
      const rows = (await hasSeen())
        ? await sql`select id, customer_id, lifetime_session_id, decision_subscription_id, pending_lifetime_session_id, pending_decision_session_id, license_id, license_slot, created_at, last_seen_at from billing_installations order by created_at desc limit 2000`
        : await sql`select id, customer_id, lifetime_session_id, decision_subscription_id, pending_lifetime_session_id, pending_decision_session_id, license_id, license_slot, created_at, null as last_seen_at from billing_installations order by created_at desc limit 2000`
      let passRows = []
      try { passRows = await sql`select id, decision_pass_session_id from billing_installations order by created_at desc limit 2000` } catch { /* Older billing schema. */ }
      const passById = new Map(passRows.map((row) => [row.id, row.decision_pass_session_id]))
      for (const row of rows) row.decision_pass_session_id = passById.get(row.id) ?? null
      if (!(await hasDevices())) return rows.map((row) => ({ ...row, device_id: null, device_platform: null }))
      const devices = await sql`select id, device_id, device_platform from billing_installations order by created_at desc limit 2000`
      const byId = new Map(devices.map((row) => [row.id, row]))
      return rows.map((row) => ({ ...row, device_id: byId.get(row.id)?.device_id ?? null, device_platform: byId.get(row.id)?.device_platform ?? null }))
    },
    licenses: async () => sql`select id, installation_id, key_last4, email, created_at, sent_at, revoked_at, activated_at from billing_licenses order by created_at desc limit 2000`,
    trialLicenses: async () => sql`select id, key_last4, email, sent_at, revoked_at, expires_at, bound_installation_id from billing_trial_licenses order by created_at desc limit 2000`,
    planMetrics: async () => {
      const [lifetime] = await sql`select count(*)::int as purchases, count(distinct coalesce(customer_id, id))::int as customers from billing_installations where lifetime_session_id is not null`
      const decision = await optional(() => sql`select count(*)::int as passes from billing_decision_passes`)
      const legacyDecision = await optional(() => sql`select count(*)::int as subscriptions from billing_installations where decision_subscription_id is not null`)
      const [trials] = await sql`select count(*) filter (where sent_at is not null)::int as issued,
        count(*) filter (where activated_at is not null)::int as activated,
        count(*) filter (where sent_at is not null and revoked_at is null and expires_at > now())::int as active
        from billing_trial_licenses`
      return { lifetimePurchases: Number(lifetime.purchases), lifetimeCustomers: Number(lifetime.customers),
        decisionSubscriptions: Number(decision?.passes ?? 0) + Number(legacyDecision?.subscriptions ?? 0), trialKeysSent: Number(trials.issued),
        trialActivated: Number(trials.activated), trialActive: Number(trials.active) }
    },
    webhooks: () => optional(() => sql`select count(*)::int as count, max(received_at) as last from billing_events`),
    downloads: async () => {
      const protectedDownloads = await optional(() => sql`select count(*)::int as total, count(distinct installation_id)::int as buyers, count(*) filter (where created_at >= now() - interval '30 days')::int as last30d, max(created_at) as last from billing_downloads`)
      const publicDownloads = await optional(() => sql`select count(*)::int as total, count(*) filter (where created_at >= now() - interval '30 days')::int as last30d, max(created_at) as last from billing_public_downloads`)
      if (!protectedDownloads) return null
      return { total: Number(protectedDownloads.total || 0) + Number(publicDownloads?.total || 0), public: Number(publicDownloads?.total || 0),
        buyers: Number(protectedDownloads.buyers || 0), last30d: Number(protectedDownloads.last30d || 0) + Number(publicDownloads?.last30d || 0),
        last: [protectedDownloads.last, publicDownloads?.last].filter(Boolean).sort().at(-1) || null }
    },
  }
}
