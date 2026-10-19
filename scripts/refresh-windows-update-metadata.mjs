import { createRequire } from 'node:module'
import { readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { buildBlockMap } = require('app-builder-lib/out/targets/blockmap/blockmap.js')
const yaml = require('js-yaml')

export async function refreshWindowsUpdateMetadata(releaseDir = resolve('release')) {
  const names = await readdir(releaseDir)
  const installers = names.filter((name) => /^MamaLead Setup .+\.exe$/i.test(name) && !name.includes('__uninstaller'))
  if (installers.length !== 1) throw new Error(`Expected one MamaLead Setup installer, found ${installers.length}.`)

  const installer = resolve(releaseDir, installers[0])
  const blockmap = `${installer}.blockmap`
  const update = await buildBlockMap(installer, 'gzip', blockmap)
  const infoPath = resolve(releaseDir, 'latest.yml')
  const info = yaml.load(await readFile(infoPath, 'utf8'))
  if (!info || typeof info !== 'object' || !Array.isArray(info.files) || !info.files[0]) {
    throw new Error('latest.yml does not contain a Windows installer entry.')
  }

  info.files[0].sha512 = update.sha512
  info.files[0].size = update.size
  info.sha512 = update.sha512
  info.releaseDate = new Date().toISOString()
  await writeFile(infoPath, yaml.dump(info, { lineWidth: -1, noRefs: true }), 'utf8')

  const blockmapInfo = await stat(blockmap)
  return { installer, blockmap, size: update.size, blockmapSize: blockmapInfo.size, sha512: update.sha512 }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await refreshWindowsUpdateMetadata()
  console.log(`refreshed ${result.blockmap} (${result.blockmapSize} bytes)`)
  console.log(`installer size ${result.size}; sha512 ${result.sha512}`)
}
