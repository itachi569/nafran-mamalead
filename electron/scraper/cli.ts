import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { ScrapeRunner } from './runner'
import type { Lead, ProviderId } from './types'
import { DEFAULT_QUERY } from './types'

interface CliOptions {
  keywords: string[]
  location: string
  limit: number
  provider: ProviderId
  headless: boolean
  detail: boolean
  out: string
  json: boolean
}

function readFlag(args: string[], name: string): string | undefined {
  const index = args.findIndex((a) => a === `--${name}`)
  return index >= 0 ? args[index + 1] : undefined
}

function parseArgs(argv: string[]): CliOptions {
  const args = argv.slice(2)
  const keywords = (readFlag(args, 'keywords') ?? readFlag(args, 'keyword') ?? '')
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean)
  return {
    keywords,
    location: readFlag(args, 'location') ?? DEFAULT_QUERY.location,
    limit: Number(readFlag(args, 'limit') ?? DEFAULT_QUERY.maxResultsPerKeyword),
    provider: (readFlag(args, 'provider') as ProviderId | undefined) ?? 'chromium-maps',
    headless: args.includes('--headless'),
    detail: !args.includes('--no-detail'),
    out: readFlag(args, 'out') ?? 'leads',
    json: args.includes('--json'),
  }
}

const CSV_COLUMNS: (keyof Lead)[] = [
  'name', 'category', 'address', 'area', 'postcode', 'phone', 'website',
  'rating', 'reviewCount', 'latitude', 'longitude', 'keyword', 'query', 'mapsUrl', 'capturedAt',
]

function toCsv(leads: Lead[]): string {
  const escape = (value: unknown): string => {
    const text = value === null || value === undefined ? '' : String(value)
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
  }
  const head = CSV_COLUMNS.join(',')
  const rows = leads.map((lead) => CSV_COLUMNS.map((column) => escape(lead[column])).join(','))
  return [head, ...rows].join('\n')
}

function stamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv)
  if (!options.keywords.length) {
    console.error('Usage: npm run scrape -- --keywords "physiotherapy,skin care" --location "Manchester, United Kingdom" --limit 20 [--headless] [--no-detail] [--provider mock]')
    process.exitCode = 1
    return
  }

  const runner = new ScrapeRunner()
  const handle = runner.start({
    provider: options.provider,
    query: {
      keywords: options.keywords,
      location: options.location,
      maxResultsPerKeyword: options.limit,
      headless: options.headless,
      detail: options.detail,
    },
    onProgress: (progress) => {
      const marker = progress.status === 'running' ? '·' : progress.status === 'done' ? '✓' : '×'
      console.log(`${marker} [${progress.keywordIndex + 1}/${progress.keywordTotal}] ${progress.message}`)
    },
  })

  const stop = () => {
    console.log('\nStopping run…')
    void handle.stop()
  }
  process.on('SIGINT', stop)

  const summary = await handle.result
  const base = resolve(process.cwd(), `${options.out}-${stamp()}`)
  mkdirSync(dirname(base), { recursive: true })
  writeFileSync(`${base}.csv`, toCsv(summary.leads), 'utf8')
  writeFileSync(`${base}.json`, JSON.stringify(summary, null, 2), 'utf8')

  console.log(`\nstatus: ${summary.status}`)
  console.log(`leads:  ${summary.leads.length}`)
  console.log(`took:   ${(summary.durationMs / 1000).toFixed(1)}s`)
  if (summary.error) console.log(`error:  ${summary.error}`)
  console.log(`files:  ${base}.csv`)
  console.log(`        ${base}.json`)
  if (options.json) console.log(JSON.stringify(summary.leads, null, 2))
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
