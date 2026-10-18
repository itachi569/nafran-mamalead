import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const scrypt = promisify(scryptCallback)
const COST = 16384
const BLOCK_SIZE = 8
const PARALLELISM = 1
const KEY_BYTES = 32
const MAX_PASSWORD_BYTES = 256

export function normalizeOwnerEmail(value) {
  const email = String(value ?? '').trim().toLowerCase()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254 ? email : ''
}

export function validOwnerPasswordHash(value) {
  return /^scrypt-v1\$16384\$8\$1\$[0-9a-f]{32}\$[0-9a-f]{64}$/i.test(String(value ?? ''))
}

export async function hashOwnerPassword(password) {
  if (typeof password !== 'string' || password.length < 12 || Buffer.byteLength(password, 'utf8') > MAX_PASSWORD_BYTES) {
    throw new Error('Owner password must have at least 12 characters and be at most 256 UTF-8 bytes.')
  }
  const salt = randomBytes(16)
  const hash = await scrypt(password, salt, KEY_BYTES, { N: COST, r: BLOCK_SIZE, p: PARALLELISM, maxmem: 64 * 1024 * 1024 })
  return `scrypt-v1$${COST}$${BLOCK_SIZE}$${PARALLELISM}$${salt.toString('hex')}$${hash.toString('hex')}`
}

export async function verifyOwnerPassword(password, stored) {
  if (typeof password !== 'string' || Buffer.byteLength(password, 'utf8') > MAX_PASSWORD_BYTES || !validOwnerPasswordHash(stored)) return false
  const parts = stored.split('$')
  const salt = Buffer.from(parts[4], 'hex')
  const expected = Buffer.from(parts[5], 'hex')
  const actual = await scrypt(password, salt, KEY_BYTES, { N: COST, r: BLOCK_SIZE, p: PARALLELISM, maxmem: 64 * 1024 * 1024 })
  return timingSafeEqual(actual, expected)
}
