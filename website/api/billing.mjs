import { createBillingHandler } from '../core.mjs'
import { createNeonStore } from '../neon-store.mjs'

let blobGetter
async function optionalBlobGetter() {
  if (blobGetter !== undefined) return blobGetter
  try { blobGetter = (await import('@vercel/blob')).get } catch { blobGetter = null }
  return blobGetter
}

const routes = {
  home: '/',
  health: '/health',
  cancel: '/cancel',
  return: '/return',
  installations: '/v1/installations',
  status: '/v1/status',
  trial: '/v1/trial',
  checkout: '/v1/checkout',
  portal: '/v1/portal',
  invoices: '/v1/invoices',
  license: '/v1/license',
  activate: '/v1/activate',
  downloadLink: '/v1/download-link',
  downloadByLicense: '/v1/download-by-license',
  download: '/v1/download',
  stripeWebhook: '/webhooks/stripe',
}

export function createCloudFunction({ env = process.env, storeFactory = createNeonStore, fetch: stripeFetch = fetch, getBlob: blobFetcher } = {}) {
  let handler
  return { async fetch(request) {
    const url = new URL(request.url)
    const route = routes[url.searchParams.get('endpoint')]
    if (!route) return new Response(JSON.stringify({ error: 'Endpoint not found.' }), { status: 404, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } })
    const publicUrl = env.BILLING_PUBLIC_URL || (env.VERCEL_URL ? `https://${env.VERCEL_URL}` : '')
    if (!publicUrl) return new Response(JSON.stringify({ error: 'Billing public URL is not configured.' }), { status: 503, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } })
    const target = new URL(route, publicUrl)
    url.searchParams.delete('endpoint')
    target.search = url.search
    try {
      handler ??= createBillingHandler({ env: { ...env, BILLING_PUBLIC_URL: publicUrl }, store: storeFactory(env.DATABASE_URL), fetch: stripeFetch, getBlob: blobFetcher ?? await optionalBlobGetter() })
      const result = await handler.handle({
        method: request.method,
        url: target.toString(),
        authorization: request.headers.get('authorization'),
        stripeSignature: request.headers.get('stripe-signature'),
        readBody: () => request.text(),
      })
      return new Response(result.body, { status: result.status, headers: result.headers })
    } catch {
      return new Response(JSON.stringify({ error: 'Billing service is not configured.' }), { status: 503, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } })
    }
  } }
}

export default createCloudFunction()
