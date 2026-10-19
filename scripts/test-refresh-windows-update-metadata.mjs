import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { refreshWindowsUpdateMetadata } from './refresh-windows-update-metadata.mjs'

const require = createRequire(import.meta.url)
const yaml = require('js-yaml')
const directory = await mkdtemp(join(tmpdir(), 'mamalead-update-metadata-'))

try {
  const payload = Buffer.alloc(96_000)
  for (let index = 0; index < payload.length; index += 1) payload[index] = index % 251
  const installer = join(directory, 'MamaLead Setup 9.9.9.exe')
  await writeFile(installer, payload)
  await writeFile(join(directory, 'latest.yml'), 'version: 9.9.9\nfiles:\n  - url: MamaLead-Setup-9.9.9.exe\n    sha512: old\n    size: 1\npath: MamaLead-Setup-9.9.9.exe\nsha512: old\nreleaseDate: old\n')

  const result = await refreshWindowsUpdateMetadata(directory)
  const expectedHash = createHash('sha512').update(payload).digest('base64')
  const info = yaml.load(await readFile(join(directory, 'latest.yml'), 'utf8'))
  assert.equal(result.size, payload.length)
  assert.equal(result.sha512, expectedHash)
  assert.equal(info.sha512, expectedHash)
  assert.equal(info.files[0].sha512, expectedHash)
  assert.equal(info.files[0].size, payload.length)
  assert.ok((await readFile(`${installer}.blockmap`)).length > 0)
  console.log('PASS  signed-installer metadata refreshes the blockmap, size and SHA-512')
} finally {
  await rm(directory, { recursive: true, force: true })
}
