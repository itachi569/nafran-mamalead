import { readFileSync } from 'node:fs'

// No browser-supplied URL or credentials; only the local billing writer.
export function createLicenseWriter() {
  let key
  try { key = readFileSync(new URL('../../app/.admin-license-key', import.meta.url), 'utf8').trim() }
  catch (error) { if (error.code === 'ENOENT') return null; throw error }
  if (!/^[a-f0-9]{64}$/.test(key)) throw new Error('Invalid private admin licence credential.')
  return async (payload) => {
    const response = await fetch('http://127.0.0.1:38749/licenses/cancel', {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10_000),
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const result = await response.json()
    if (!response.ok) throw Object.assign(new Error(result.error || 'Cancellation failed.'), { status: response.status })
    return result
  }
}
