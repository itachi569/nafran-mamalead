import { readFileSync } from 'node:fs'

/**
 * Reads the DataForSEO credential at process start without putting it in the renderer bundle,
 * source tree, or packaged asar. Production may provide the value directly through the process
 * environment, or point DATAFORSEO_API_KEY_FILE at a secret mounted by the host.
 */
export type RuntimeCredential = {
  value: string
  fromEnvironment: boolean
}

function clean(value: string): string {
  return value.replace(/^\uFEFF/, '').trim().replace(/^['"]|['"]$/g, '').trim()
}

function readCredentialFile(path: string): string {
  try {
    const text = readFileSync(path, 'utf8')
    const lines = text.split(/\r?\n/)
    for (const line of lines) {
      if (!line.trim() || /^\s*#/.test(line)) continue
      const named = line.match(/^\s*(?:DATAFORSEO_API_KEY|APIFY_API_TOKEN|APIFY_TOKEN|MAILVERIFIER_API_KEY|NAFRAN_ASSIST_API_KEY|OPENAI_API_KEY|CEREBRAS_API_KEY|KEY)\s*=\s*(.*?)\s*$/i)
      if (named) return clean(named[1])
    }
    // A mounted secret may contain only the credential, with no KEY= wrapper.
    const raw = text.trim()
    return lines.filter((line) => line.trim() && !/^\s*#/.test(line)).length === 1 ? clean(raw) : ''
  } catch {
    // A missing or unreadable secret behaves like no configured credential. The UI can then give
    // the normal Settings guidance without exposing a filesystem path or secret contents.
    return ''
  }
}

export function readDataForSeoCredential(): RuntimeCredential {
  const direct = clean(process.env.DATAFORSEO_API_KEY ?? '')
  if (direct) return { value: direct, fromEnvironment: true }

  const file = clean(process.env.DATAFORSEO_API_KEY_FILE ?? '')
  if (file) {
    const mounted = readCredentialFile(file)
    if (mounted) return { value: mounted, fromEnvironment: true }
  }

  return { value: '', fromEnvironment: false }
}

/**
 * Reads the Nafran Assist provider credential without exposing it to the renderer or bundling it
 * into the app. The explicit NAFRAN names are preferred; the OPENAI aliases make a standard
 * OpenAI deployment work without another copy of the secret in the host environment.
 */
export function readAssistCredential(defaultFile = ''): RuntimeCredential {
  const direct = clean(process.env.CEREBRAS_API_KEY ?? '') || clean(process.env.NAFRAN_ASSIST_API_KEY ?? '') || clean(process.env.OPENAI_API_KEY ?? '')
  if (direct) return { value: direct, fromEnvironment: true }

  const file = clean(process.env.CEREBRAS_API_KEY_FILE ?? '') || clean(process.env.NAFRAN_ASSIST_API_KEY_FILE ?? '') || clean(process.env.OPENAI_API_KEY_FILE ?? '') || clean(defaultFile)
  if (file) {
    const mounted = readCredentialFile(file)
    if (mounted) return { value: mounted, fromEnvironment: true }
  }

  return { value: '', fromEnvironment: false }
}

/** Reads MailVerifier's credential only in Electron's main process. */
export function readMailVerifierCredential(defaultFile = ''): RuntimeCredential {
  const direct = clean(process.env.MAILVERIFIER_API_KEY ?? '')
  if (direct) return { value: direct, fromEnvironment: true }

  const file = clean(process.env.MAILVERIFIER_API_KEY_FILE ?? defaultFile)
  if (file) {
    const mounted = readCredentialFile(file)
    if (mounted) return { value: mounted, fromEnvironment: true }
  }

  return { value: '', fromEnvironment: false }
}

/** Reads the Apify token only in Electron's main process. */
export function readApifyCredential(defaultFile = ''): RuntimeCredential {
  const direct = clean(process.env.APIFY_API_TOKEN ?? process.env.APIFY_TOKEN ?? '')
  if (direct) return { value: direct, fromEnvironment: true }

  const file = clean(process.env.APIFY_API_TOKEN_FILE ?? defaultFile)
  if (file) {
    const mounted = readCredentialFile(file)
    if (mounted) return { value: mounted, fromEnvironment: true }
  }

  return { value: '', fromEnvironment: false }
}
