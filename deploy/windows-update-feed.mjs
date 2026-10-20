import { createReadStream } from 'node:fs'
import { realpath, stat } from 'node:fs/promises'
import { resolve, sep } from 'node:path'

const prefix = '/updates/windows/'
const allowedName = /^(?:latest\.yml|MamaLead(?: Setup |[-]Setup[-])\d+\.\d+\.\d+\.exe(?:\.blockmap)?)$/

// Only release metadata and versioned Windows artifacts are public.
export async function serveWindowsUpdate(request, response, pathname, directory) {
  if (!pathname.startsWith(prefix)) return false
  const name = pathname.slice(prefix.length)
  if (!allowedName.test(name)) {
    response.writeHead(404).end()
    return true
  }
  let file, info
  try {
    const root = await realpath(directory)
    file = await realpath(resolve(root, name))
    if (!file.startsWith(root + sep)) throw new Error('Outside feed directory')
    info = await stat(file)
    if (!info.isFile()) throw new Error('Not a file')
  } catch {
    response.writeHead(404, { 'cache-control': 'no-store' }).end()
    return true
  }
  const metadata = name === 'latest.yml'
  const headers = {
    'content-type': metadata ? 'text/yaml; charset=utf-8' : 'application/octet-stream',
    'cache-control': metadata ? 'no-store' : 'public, max-age=31536000, immutable',
    'x-content-type-options': 'nosniff',
    'accept-ranges': 'bytes',
    'content-length': info.size,
  }
  let start = 0
  let end = info.size - 1
  let status = 200
  if (request.headers.range && request.method === 'GET') {
    const match = /^bytes=(\d*)-(\d*)$/.exec(request.headers.range)
    if (!match || (!match[1] && !match[2])) {
      response.writeHead(416, { 'content-range': `bytes */${info.size}` }).end()
      return true
    }
    if (!match[1]) {
      start = Math.max(0, info.size - Number(match[2]))
    } else {
      start = Number(match[1])
      if (match[2]) end = Math.min(end, Number(match[2]))
    }
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= info.size) {
      response.writeHead(416, { 'content-range': `bytes */${info.size}` }).end()
      return true
    }
    status = 206
    headers['content-length'] = end - start + 1
    headers['content-range'] = `bytes ${start}-${end}/${info.size}`
  }
  response.writeHead(status, headers)
  if (request.method === 'HEAD') response.end()
  else {
    const stream = createReadStream(file, { start, end })
    stream.on('error', () => response.destroy())
    response.on('close', () => stream.destroy())
    stream.pipe(response)
  }
  return true
}
