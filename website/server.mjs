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
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
}

const allowedFile = /^(?:index\.html|thank-you\.html|thank-you\.js|copy-key\.(?:html|js|css)|privacy\.html|terms\.html|support\.html|support\.js|sales\.js|billing\.js|mama-ai\.(?:js|css)|vendor\/[\w.-]+|uploads\/[\w .-]+|fonts\/[\w.-]+|img\/[\w.\/-]+|lottie\/[\w.-]+)$/

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

  if (pathname === '/contact' || pathname === '/contact/') {
    const query = new URL(request.url,'http://localhost').search
    response.writeHead(301,{location:'/support'+query,'cache-control':'no-store'}).end()
    return
  }
  const aliases={'/support':'support.html','/privacy':'privacy.html','/terms':'terms.html','/thank-you':'thank-you.html','/copy-key':'copy-key.html'}
  const cleanPath=pathname==='/index.html' ? '/' : Object.keys(aliases).find(key=>'/'+aliases[key]===pathname)
  if(cleanPath){
    response.writeHead(301,{location:cleanPath+new URL(request.url,'http://localhost').search,'cache-control':'no-store'}).end()
    return
  }
  if(pathname.endsWith('/') && aliases[pathname.slice(0,-1)]){
    response.writeHead(301,{location:pathname.slice(0,-1)+new URL(request.url,'http://localhost').search,'cache-control':'no-store'}).end()
    return
  }
  const file = pathname === '/' ? 'index.html' : aliases[pathname.replace(/\/$/,'')] || pathname.slice(1)
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
    'cache-control': extension === '.html' || file.startsWith('copy-key.') || ['sales.js','billing.js','thank-you.js','support.js','mama-ai.js','mama-ai.css'].includes(file) ? 'no-store' : 'public, max-age=86400',
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'referrer-policy': file.startsWith('copy-key.') ? 'no-referrer' : 'strict-origin-when-cross-origin',
    ...(file === 'copy-key.html' ? {
      'content-security-policy': "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
      'x-robots-tag': 'noindex, nofollow, noarchive',
    } : {}),
  })
  if (request.method === 'HEAD') response.end()
  else {
    const stream=createReadStream(full)
    stream.on('error',()=>response.destroy())
    response.on('close',()=>stream.destroy())
    stream.pipe(response)
  }
})

server.listen(port, host, () => console.log(`Nafran landing page listening on ${host}:${port}`))
