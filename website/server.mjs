import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, join } from 'node:path'

const root = process.env.LANDING_ROOT || '/opt/billing/landing'
const host = process.env.LANDING_HOST || '127.0.0.1'
const port = Number(process.env.LANDING_PORT || 38751)
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
}

const allowedFile = /^(?:index\.html|privacy\.html|terms\.html|support\.html|support\.js|sales\.js|billing\.js|uploads\/[\w .-]+|fonts\/[\w.-]+|img\/[\w.\/-]+|lottie\/[\w.-]+)$/

const server = createServer(async (request, response) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { allow: 'GET, HEAD' }).end()
    return
  }

  let pathname
  try {
    pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname)
  } catch {
    response.writeHead(400).end()
    return
  }

  const file = pathname === '/' ? 'index.html' : pathname.slice(1)
  if (file.includes('..') || !allowedFile.test(file)) {
    response.writeHead(404).end()
    return
  }

  const full = join(root, file)
  let info
  try {
    info = await stat(full)
  } catch {
    response.writeHead(404).end()
    return
  }
  if (!info.isFile()) {
    response.writeHead(404).end()
    return
  }

  const extension = extname(file)
  response.writeHead(200, {
    'content-type': types[extension] || 'application/octet-stream',
    'content-length': info.size,
    'cache-control': extension === '.html' || ['sales.js','billing.js'].includes(file) ? 'no-store' : 'public, max-age=86400',
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'referrer-policy': 'strict-origin-when-cross-origin',
  })
  if (request.method === 'HEAD') response.end()
  else createReadStream(full).pipe(response)
})

server.listen(port, host, () => console.log(`Nafran landing page listening on ${host}:${port}`))
