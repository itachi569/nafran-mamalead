// The only server route. The API key is read here and never sent to the browser, which is the
// whole reason the search runs on the server rather than in the page.
import { NextResponse } from 'next/server'
import { PlacesError, estimateCost, searchPlaces } from '@/lib/places'

export const runtime = 'nodejs'

/** A malformed request is rejected before it costs anything. */
function parse(body: unknown): { keyword: string; location: string; limit: number; regionCode?: string } {
  const input = (body ?? {}) as Record<string, unknown>
  const keyword = typeof input.keyword === 'string' ? input.keyword.trim() : ''
  const location = typeof input.location === 'string' ? input.location.trim() : ''
  const rawLimit = typeof input.limit === 'number' ? input.limit : Number(input.limit ?? 20)
  const limit = Number.isFinite(rawLimit) ? Math.min(20, Math.max(1, Math.round(rawLimit))) : 20
  const regionCode = typeof input.regionCode === 'string' && input.regionCode.trim() ? input.regionCode.trim() : undefined
  return { keyword, location, limit, regionCode }
}

export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Send a JSON body.' }, { status: 400 })
  }

  const options = parse(body)
  if (!options.keyword) {
    return NextResponse.json({ error: 'A keyword is required.' }, { status: 400 })
  }

  try {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY ?? ''
    const result = await searchPlaces(options, apiKey)
    return NextResponse.json({
      ...result,
      // Surfaced so the cost of what just happened is visible while testing rather than arriving
      // as a bill at the end of the month.
      estimatedCostUsd: estimateCost(1),
    })
  } catch (error) {
    if (error instanceof PlacesError) {
      const status = error.kind === 'config' ? 500 : error.kind === 'denied' ? 403 : error.kind === 'quota' ? 429 : 502
      return NextResponse.json({ error: error.message, kind: error.kind }, { status })
    }
    const message = error instanceof Error ? error.message : 'The search failed.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
