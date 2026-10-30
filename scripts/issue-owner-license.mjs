#!/usr/bin/env node
// Operator-only CLI: requires the existing SSH database permission (or a local DB).
// No mail, Checkout session, payment record, or customer licence is created.
import { randomBytes, randomUUID, createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { parseArgs } from 'node:util'
import { resolve } from 'node:path'

const { values: args } = parseArgs({ options: {
  kind: { type: 'string' }, reason: { type: 'string' }, label: { type: 'string', default: 'Owner testing' },
  email: { type: 'string' }, db: { type: 'string' }, ssh: { type: 'string' },
  'ssh-key': { type: 'string' }, port: { type: 'string', default: '2213' },
  revoke: { type: 'string' }, help: { type: 'boolean' },
} })
if (args.help) {
  console.log('Issue: --kind lifetime|trial --reason "..." [--label "..."] [--email optional@example.com]\nRevoke: --revoke LICENSE_ID --reason "..."\nTransport: --ssh ahmed@65.109.114.243 --ssh-key PATH [--port 2213], or --db PATH\nThe key is displayed once. Save it privately; only its hash is stored.')
  process.exit(0)
}
const quote = value => value == null ? 'NULL' : "'" + String(value).replaceAll("'", "''") + "'"
try {
  if (Boolean(args.db) === Boolean(args.ssh)) throw Error('Choose exactly one database transport: --db or --ssh.')
  if (!args.reason?.trim() || args.reason.length > 300 || args.label.length > 120) throw Error('Provide a reason (1–300 characters) and a label up to 120 characters.')
  if (args.revoke ? args.kind || !/^[a-f0-9-]{36}$/.test(args.revoke) : !['lifetime', 'trial'].includes(args.kind)) throw Error('Choose --kind lifetime|trial or --revoke LICENSE_ID.')
  const email = args.email?.trim().toLowerCase() || null
  if (email && (email.length > 254 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))) throw Error('The optional email is invalid.')
  let query
  let close = () => {}
  if (args.db) {
    const { DatabaseSync } = await import('node:sqlite')
    const db = new DatabaseSync(resolve(args.db))
    db.exec('pragma busy_timeout=10000')
    close = () => db.close()
    query = sql => { db.exec(sql); return db.prepare('select id,kind,key_last4,email,label,created_at,revoked_at from owner_licenses where id = ?').get(id) }
  } else {
    if (!args['ssh-key'] || !/^[a-z_][a-z0-9_-]*@[a-z0-9.-]+$/i.test(args.ssh) || !/^\d{1,5}$/.test(args.port) || Number(args.port) > 65535) throw Error('Provide a valid SSH destination, port and identity file.')
    query = sql => {
      const output = execFileSync('ssh', ['-i', resolve(args['ssh-key']), '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes', '-o', 'ConnectTimeout=10', '-p', args.port, args.ssh, 'fleet-dev db mamalead'], {
        input: '.bail on\n.mode json\n.timeout 10000\n' + sql + '\nselect id,kind,key_last4,email,label,created_at,revoked_at from owner_licenses where id=' + quote(id) + ';\n',
        encoding: 'utf8', timeout: 30000, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
      })
      return JSON.parse(output.trim())[0]
    }
  }
  const id = args.revoke || randomUUID()
  const now = new Date().toISOString(), actor = args.ssh ? 'ssh:' + args.ssh.split('@')[0] : 'local-operator'
  const key = args.revoke ? null : 'NF-' + randomBytes(20).toString('hex').toUpperCase().match(/.{4}/g).join('-')
  const keyHash = key && createHash('sha256').update(key).digest('hex')
  const action = args.revoke ? 'revoke_owner_key' : 'issue_owner_' + args.kind
  const mutation = args.revoke
    ? `update owner_licenses set revoked_at=coalesce(revoked_at,${quote(now)}) where id=${quote(id)};`
    : `insert into owner_licenses (id,kind,key_hash,key_last4,email,label,created_by,reason,created_at) values (${[id,args.kind,keyHash,key.slice(-4),email,args.label,actor,args.reason.trim(),now].map(quote).join(',')});`
  try {
    const result = query(`BEGIN IMMEDIATE;\n${mutation}\ninsert into admin_license_actions (id,license_id,action,actor,reason,created_at) select ${[randomUUID(),id,action,actor,args.reason.trim(),now].map(quote).join(',')} where exists (select 1 from owner_licenses where id=${quote(id)});\nCOMMIT;`)
    if (!result || (args.revoke ? !result.revoked_at : result.key_last4 !== key.slice(-4))) throw Error('Owner key result could not be confirmed.')
    console.log(JSON.stringify({ ok: true, id, kind: result.kind, ...(key ? { licenseKey: key } : { revoked: true }), email: result.email, label: result.label,
      ownerIssued: true, maxInstallations: 1, trialHours: result.kind === 'trial' ? 24 : null, trialStartsAtActivation: result.kind === 'trial', emailsSent: 0, paymentsCreated: 0 }, null, 2))
  } finally { close() }
} catch (error) {
  // Do not print SSH buffers, SQL, keys, or secrets on transport failures.
  console.error('Owner key operation stopped: ' + (error.status != null ? 'SSH/database command failed. Check deployment and operator access.' : String(error.message).slice(0,250)))
  process.exitCode = 1
}
