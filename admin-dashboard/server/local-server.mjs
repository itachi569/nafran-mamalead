import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { createHash, randomBytes } from 'node:crypto'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createAdminHandler } from './admin-core.mjs'
import { createSqliteAdminStore } from './stores.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const files = {
  '/admin': 'index.html', '/admin/': 'index.html', '/admin/support.js': 'support.js',
  '/admin/vendor/react.production.min.js': 'vendor/react.production.min.js',
  '/admin/vendor/react-dom.production.min.js': 'vendor/react-dom.production.min.js',
  '/admin/vendor/babel.min.js': 'vendor/babel.min.js',
}
const types = { html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8' }
const baseHeaders = {
  'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'x-frame-options': 'DENY',
  'referrer-policy': 'no-referrer', 'x-robots-tag': 'noindex',
  'content-security-policy': "default-src 'none'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'; object-src 'none'",
}

export async function createAdminServer({ env = process.env, fetch: outbound, store } = {}) {
  const adminStore = store ?? await createSqliteAdminStore(resolve(env.BILLING_DB_PATH ?? './billing-server/data/billing.db'))
  const handler = createAdminHandler({ env, store: adminStore, fetch: outbound })
  const server = createServer(async (req, res) => {
    const path = new URL(req.url, 'http://127.0.0.1').pathname
    if (req.method === 'GET' && files[path]) {
      const file = files[path]
      res.writeHead(200, { ...baseHeaders, 'content-type': types[file.split('.').pop()] })
      return res.end(await readFile(join(here, '..', file)))
    }
    const result = await handler.handle({
      method: req.method, url: req.url,
      authorization: req.headers.authorization, cookie: req.headers.cookie, csrf: req.headers['x-nafran-admin'],
      ip: req.socket.remoteAddress ?? 'local', secure: env.ADMIN_COOKIE_SECURE === '1',
      readBody: async () => {
        let raw = ''
        for await (const chunk of req) { raw += chunk; if (raw.length > 4096) break }
        return raw
      },
    })
    res.writeHead(result.status, { ...baseHeaders, ...result.headers })
    res.end(result.body)
    // Path and status only: no query strings, bodies, cookies or tokens in logs.
    if (env.ADMIN_LOG !== '0') console.log(`${req.method} ${path} ${result.status}`)
  })
  return { server, close: () => { server.close(); adminStore.close?.() } }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  if (process.argv.includes('--new-token')) {
    const token = randomBytes(32).toString('base64url')
    console.log(`Owner token (keep private, paste into the sign-in form):\n  ${token}\n`)
    console.log(`Add to your .env:\n  ADMIN_TOKEN_SHA256=${createHash('sha256').update(token).digest('hex')}\n  ADMIN_SESSION_SECRET=${randomBytes(32).toString('base64url')}`)
    process.exit(0)
  }
  const port = Number(process.env.ADMIN_PORT ?? 38750)
  const host = process.env.ADMIN_HOST ?? '127.0.0.1'
  const service = await createAdminServer()
  service.server.listen(port, host, () => console.log(`Owner dashboard: http://${host}:${port}/admin/`))
}
