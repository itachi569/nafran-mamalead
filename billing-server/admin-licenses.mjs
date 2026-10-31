// Dedicated loopback-only writer. The public admin service keeps its read-only DB.
import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
import { timingSafeEqual, randomUUID } from 'node:crypto'
import {createAdminSupport} from './admin-support.mjs'
import {SupportError} from './support-contract.mjs'

export function createLicenseAdminServer(db, options = {}) {
  let key
  try { key = readFileSync(options.keyFile || new URL('./.admin-license-key', import.meta.url), 'utf8').trim() }
  catch (error) { if (error.code === 'ENOENT') return null; throw error }
  if (!/^[a-f0-9]{64}$/.test(key)) throw new Error('Invalid private admin licence credential.')
  db.exec(`create table if not exists admin_license_actions (
    id text primary key, license_id text not null, action text not null,
    actor text not null, reason text not null, created_at text not null
  )`)
  const support=createAdminSupport(db,options)
  return createServer(async (req, res) => {
    const reply = (status, value) => {
      res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' })
      res.end(JSON.stringify(value))
    }
    try {
      const supplied = Buffer.from(String(req.headers.authorization ?? ''))
      const expected = Buffer.from(`Bearer ${key}`)
      if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return reply(401, { error: 'Unauthorized.' })
      if(req.method==='POST'&&req.url?.startsWith('/support/')){
        let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>16384)return reply(413,{error:'Request too large.'})}
        let input;try{input=JSON.parse(raw)}catch{return reply(400,{error:'Invalid JSON.'})}
        try{return reply(200,await support(req.url.slice('/support/'.length),input))}catch(e){return reply(e instanceof SupportError?e.status:503,{error:e instanceof SupportError?e.message:'Support is temporarily unavailable.'})}
      }
      if (req.method !== 'POST' || req.url !== '/licenses/cancel') return reply(404, { error: 'Not found.' })
      let raw = ''
      for await (const chunk of req) {
        raw += chunk
        if (raw.length > 4096) return reply(413, { error: 'Request too large.' })
      }
      let input
      try { input = JSON.parse(raw) } catch { return reply(400, { error: 'Invalid JSON.' }) }
      const { id, last4, confirmation, reason, actor } = input ?? {}
      if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(id) ||
          typeof last4 !== 'string' || last4.length !== 4 || confirmation !== 'CANCEL LIFETIME' ||
          typeof reason !== 'string' || reason.trim().length < 3 || reason.length > 300 ||
          typeof actor !== 'string' || !actor || actor.length > 254) return reply(400, { error: 'Confirm the licence and provide a reason (3–300 characters).' })
      db.exec('BEGIN IMMEDIATE')
      let result
      try {
        const license = db.prepare('select id, key_last4, revoked_at from licenses where id = ?').get(id)
        if (!license) { db.exec('ROLLBACK'); return reply(404, { error: 'Lifetime licence not found.' }) }
        if (license.key_last4 !== last4) { db.exec('ROLLBACK'); return reply(409, { error: 'The selected licence does not match the confirmation.' }) }
        if (license.revoked_at) result = { ok: true, revokedAt: license.revoked_at, alreadyCancelled: true }
        else {
          const now = new Date().toISOString()
          db.prepare('update licenses set revoked_at = ? where id = ? and revoked_at is null').run(now, id)
          db.prepare('insert into admin_license_actions (id, license_id, action, actor, reason, created_at) values (?, ?, ?, ?, ?, ?)')
            .run(randomUUID(), id, 'cancel_lifetime', actor, reason.trim(), now)
          result = { ok: true, revokedAt: now, alreadyCancelled: false }
        }
        db.exec('COMMIT')
      } catch (error) { db.exec('ROLLBACK'); throw error }
      reply(200, result)
    } catch {
      reply(503, { error: 'Lifetime cancellation is unavailable. Refresh the licence status before retrying.' })
    }
  })
}
