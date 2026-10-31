// Copy the writer to a temporary directory with a dummy credential; no production key or DB.
import assert from 'node:assert/strict'
import { mkdtempSync, copyFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
const directory = mkdtempSync(join(tmpdir(), 'mamalead-admin-audit-'))
for(const file of ['admin-licenses.mjs','admin-support.mjs','support-contract.mjs','support-email.mjs'])copyFileSync(resolve('billing-server/'+file),join(directory,file))
writeFileSync(join(directory, '.admin-license-key'), 'a'.repeat(64))
const { createLicenseAdminServer } = await import(pathToFileURL(join(directory, 'admin-licenses.mjs')))
const db = new DatabaseSync(':memory:')
db.exec("create table licenses (id text primary key, key_last4 text, revoked_at text); insert into licenses values ('fixture-license','1234',null); insert into licenses values ('untouched','5678',null)")
const server = createLicenseAdminServer(db)
try {
  await new Promise(done => server.listen(0, '127.0.0.1', done))
  const url = `http://127.0.0.1:${server.address().port}/licenses/cancel`
  const body = { id: 'fixture-license', last4: '1234', confirmation: 'CANCEL LIFETIME', reason: 'Audit fixture cancellation', actor: 'audit@fixture.test' }
  const call = async (payload, token = 'a'.repeat(64)) => fetch(url, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(payload) })
  assert.equal((await call(body, 'wrong')).status, 401)
  assert.equal((await call({ ...body, confirmation: '' })).status, 400)
  assert.equal((await call({ ...body, last4: 'wrong' })).status, 400)
  assert.equal((await call({ ...body, last4: '0000' })).status, 409)
  assert.equal((await call({ ...body, id: 'not-found' })).status, 404)
  assert.equal((await (await call(body)).json()).alreadyCancelled, false)
  assert.equal((await (await call(body)).json()).alreadyCancelled, true)
  assert.ok(db.prepare("select revoked_at from licenses where id='fixture-license'").get().revoked_at)
  assert.equal(db.prepare("select revoked_at from licenses where id='untouched'").get().revoked_at, null)
  assert.equal(db.prepare('select count(*) n from admin_license_actions').get().n, 1)
  console.log('PASS admin cancellation: authentication, confirmation, target matching, revocation, idempotency, audit trail and unrelated licence preservation (10 assertions)')
} finally { await new Promise(done => server.close(done)); db.close() }
