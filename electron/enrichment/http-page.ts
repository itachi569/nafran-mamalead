import { cleanWebsiteUrl } from '../website-domain'
import { userError } from '../user-errors'

export function websiteVariants(raw: string): string[] {
  const initial = new URL(cleanWebsiteUrl(raw) || raw)
  if (['localhost','127.0.0.1','[::1]'].includes(initial.hostname)) return [initial.href]
  const secure = new URL(initial); secure.protocol = 'https:'
  const primary = initial.protocol === 'http:' ? secure : initial
  const alternate = new URL(primary)
  alternate.hostname = alternate.hostname.startsWith('www.') ? alternate.hostname.slice(4) : 'www.' + alternate.hostname
  return [...new Set([primary.href, alternate.href, ...(initial.protocol === 'http:' ? [initial.href] : [])])]
}

/** Bounded same-site reads. HTTPS first, no challenge bypass or TLS downgrade. */
export async function readWebsitePage(raw: string, options: { signal: AbortSignal; home?: boolean; timeoutMs?: number; maxBytes?: number }): Promise<{url:string;html:string}> {
  const initial = new URL(cleanWebsiteUrl(raw) || raw)
  const host = initial.hostname.replace(/^www\./i, '')
  const variants = options.home ? websiteVariants(initial.href) : [initial.href]
  const maxBytes = options.maxBytes ?? 2_000_000
  let failure: unknown = new Error(`${initial.host} could not be read. Retry this website.`)
  let recordedFailure = false
  for (let index = 0; index < variants.length && !options.signal.aborted; index++) {
    for (let attempt = 0; attempt < 1; attempt++) {
      let url = variants[index]
      // Give the first homepage enough time for a slow TLS/server response. One deadline covers
      // redirects and the body too; alternate hosts and optional pages keep a short budget.
      const timeoutMs = options.home && index === 0 ? Math.max(12_000, options.timeoutMs ?? 0) : options.timeoutMs ?? 5000
      const deadline = AbortSignal.timeout(Math.min(timeoutMs, options.home && index > 0 ? 5000 : timeoutMs))
      const signal = AbortSignal.any([options.signal, deadline])
      try {
        for (let redirects = 0; redirects < 5; redirects++) {
          const response = await fetch(url, { redirect:'manual', signal, headers:{accept:'text/html,application/xhtml+xml,application/xml,text/plain','user-agent':'MamaLead contact scanner/1.5'} })
          if (response.status >= 300 && response.status < 400) {
            const next = new URL(response.headers.get('location') || '', url)
            await response.body?.cancel()
            if (!/^https?:$/.test(next.protocol) || next.hostname.replace(/^www\./i,'') !== host || new URL(url).protocol === 'https:' && next.protocol !== 'https:') throw new Error('The website redirects outside its own domain. Check its current website address.')
            url = next.href; continue
          }
          if (!response.ok) {
            await response.body?.cancel()
            const error = new Error(`${initial.host} could not be read (HTTP ${response.status}). Retry this website.`)
            if ([401,403,429].includes(response.status)) throw Object.assign(error,{stopVariants:true})
            throw error
          }
          const final = cleanWebsiteUrl(response.url || url) || url
          const reader = response.body?.getReader()
          if (!reader) return {url:final,html:''}
          const decoder = new TextDecoder(); let html = '', bytes = 0
          try {
            while (bytes < maxBytes) {
              const chunk = await reader.read(); if (chunk.done) break
              const take = chunk.value.subarray(0,maxBytes-bytes); bytes += take.length
              html += decoder.decode(take,{stream:true})
            }
          } finally { await reader.cancel().catch(()=>undefined) }
          return {url:final,html:html+decoder.decode()}
        }
        throw new Error('The website redirected too many times. Check its current address.')
      } catch (error) {
        if (options.signal.aborted) throw options.signal.reason
        const detail = error as Error & {cause?:{code?:string};stopVariants?:boolean}
        if (detail.stopVariants || /CERT|TLS|SSL/.test(detail.cause?.code || '')) throw new Error(userError(error))
        if (!recordedFailure) {
          failure = deadline.aborted ? new Error(`${initial.host} took too long to respond over ${new URL(variants[index]).protocol === 'https:' ? 'HTTPS' : 'HTTP'}. Retry this website.`) : error
          recordedFailure = true
        }
        if (attempt === 0 && !/HTTP (?:408|500|502|503|504)|fetch failed|timeout|timed out/i.test(detail.message)) break
      }
    }
  }
  if (options.signal.aborted) throw options.signal.reason
  throw new Error(userError(failure))
}
