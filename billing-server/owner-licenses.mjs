// Private operator grants. There is deliberately no public issuance endpoint.
export function initializeOwnerLicenses(db) {
  db.exec(`create table if not exists owner_licenses (
    id text primary key, kind text not null check (kind in ('lifetime', 'trial')),
    key_hash text not null unique, key_last4 text not null,
    email text, label text not null, created_by text not null, reason text not null,
    created_at text not null, activated_at text, expires_at text, revoked_at text,
    bound_installation_id text
  )`)
  db.exec(`create table if not exists admin_license_actions (
    id text primary key, license_id text not null, action text not null,
    actor text not null, reason text not null, created_at text not null
  )`)
}

export function ownerLicense(row) {
  return row ? { ...row, owner_issued: true } : null
}

export function activateOwnerLicense(db, installationId, licenseId, activatedAt) {
  db.exec('BEGIN IMMEDIATE')
  try {
    const license = db.prepare('select * from owner_licenses where id = ?').get(licenseId)
    const installation = db.prepare('select id from installations where id = ?').get(installationId)
    if (!license || !installation || license.revoked_at ||
        (license.bound_installation_id && license.bound_installation_id !== installationId) ||
        (license.expires_at && Date.parse(license.expires_at) <= Date.parse(activatedAt))) {
      db.exec('ROLLBACK')
      return null
    }
    // Repeat activation must never extend an existing trial.
    if (!license.activated_at) {
      const expiresAt = license.kind === 'trial' ? new Date(Date.parse(activatedAt) + 86_400_000).toISOString() : null
      db.prepare('update owner_licenses set bound_installation_id = ?, activated_at = ?, expires_at = ? where id = ?')
        .run(installationId, activatedAt, expiresAt, licenseId)
    }
    db.prepare('update installations set license_id = ?, license_slot = 1 where id = ?').run(licenseId, installationId)
    const result = ownerLicense(db.prepare('select * from owner_licenses where id = ?').get(licenseId))
    db.exec('COMMIT')
    return result
  } catch (error) { db.exec('ROLLBACK'); throw error }
}
