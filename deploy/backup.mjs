import { randomUUID } from 'node:crypto'
import { chmod, mkdir, rename, stat, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { backup, DatabaseSync } from 'node:sqlite'

const sourcePath = process.env.BILLING_DB_PATH
const backupDir = process.env.BILLING_BACKUP_DIR || '/var/backups/nafran-billing'
if (!sourcePath) throw new Error('BILLING_DB_PATH is required.')

await mkdir(backupDir, { recursive: true, mode: 0o700 })
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const target = join(backupDir, `billing-${stamp}-${randomUUID()}.db`)
const temporary = `${target}.partial`
const source = new DatabaseSync(sourcePath, { readOnly: true })

try {
  await backup(source, temporary)
  const copied = new DatabaseSync(temporary, { readOnly: true })
  try {
    const check = copied.prepare('pragma quick_check').get()
    if (check.quick_check !== 'ok') throw new Error('Backup integrity check failed.')
  } finally {
    copied.close()
  }
  await chmod(temporary, 0o600)
  await rename(temporary, target)
  console.log(JSON.stringify({ backup: target, bytes: (await stat(target)).size, integrity: 'ok' }))
} catch (error) {
  await unlink(temporary).catch(() => {})
  throw error
} finally {
  source.close()
}
