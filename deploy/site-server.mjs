import { createReadStream } from 'node:fs'
import { realpath, stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, resolve, sep } from 'node:path'

const root = await realpath(process.env.SITE_ROOT || '/opt/billing/site')
const host = process.env.SITE_HOST || '127.0.0.1'
const port = Number(process.env.SITE_PORT || 38748)
const mime = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.svg', 'image/svg+xml'],
  ['.woff2', 'font/woff2'],
  ['.webp', 'image/webp'],
])

function respond(res, status, body) {
  res.writeHead(status, { 'content-type': 'text/plain; charset=utf-8', 'content-length': Buffer.byteLength(body), 'cache-control': 'no-store' })
  res.end(body)
}

createServer(async (req, res) => {
  res.setHeader('x-content-type-options', 'nosniff')
  res.setHeader('x-frame-options', 'DENY')
  res.setHeader('referrer-policy', 'strict-origin-when-cross-origin')
  if (req.method !== 'GET' && req.method !== 'HEAD') return respond(res, 405, 'Method not allowed')

  try {
    const pathname = new URL(req.url, 'http://localhost').pathname
    const decoded = decodeURIComponent(pathname)
    if (decoded.includes('\0') || decoded.includes('\\')) return respond(res, 400, 'Bad request')
    const requested = resolve(root, decoded.replace(/^\/+/, '') || 'index.html')
    if (requested !== root && !requested.startsWith(root + sep)) return respond(res, 404, 'Not found')
    const file = await realpath(requested)
    if (file !== root && !file.startsWith(root + sep)) return respond(res, 404, 'Not found')
    const info = await stat(file)
    if (!info.isFile()) return respond(res, 404, 'Not found')
    const extension = extname(file).toLowerCase()
    res.writeHead(200, {
      'content-type': mime.get(extension) || 'application/octet-stream',
      'content-length': info.size,
      'cache-control': extension === '.html' ? 'no-store' : 'public, max-age=3600',
    })
    if (req.method === 'HEAD') return res.end()
    createReadStream(file).on('error', () => res.destroy()).pipe(res)
  } catch {
    respond(res, 404, 'Not found')
  }
}).listen(port, host, () => console.log(`Nafran static site listening on ${host}:${port}`))
