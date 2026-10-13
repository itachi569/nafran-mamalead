import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import feedConfiguration from './update-feed-url.cjs'

const feedUrl = feedConfiguration.updateFeedUrl()
const output = join(process.cwd(), 'dist-electron', 'update-config.json')
mkdirSync(join(process.cwd(), 'dist-electron'), { recursive: true })
writeFileSync(output, `${JSON.stringify({ feedUrl }, null, 2)}\n`, 'utf8')
console.log(`wrote update config (${feedUrl ? 'configured' : 'disabled'}) -> ${output}`)
