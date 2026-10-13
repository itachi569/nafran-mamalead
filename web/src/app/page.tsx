'use client'

import { useCallback, useMemo, useState } from 'react'
import { COLUMNS, csvFileName, toCsv } from '@/lib/csv'
import type { Lead } from '@/lib/places'

interface SearchResponse {
  leads?: Lead[]
  truncated?: boolean
  estimatedCostUsd?: number
  error?: string
}

/** Triggers a download of `text` without a server round trip. */
function download(name: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  document.body.appendChild(link)
  link.click()
  link.remove()
  // Revoking immediately can cancel the download in some browsers, so it waits a tick.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export default function Page() {
  const [keyword, setKeyword] = useState('physiotherapist')
  const [location, setLocation] = useState('Lahore, Pakistan')
  const [limit, setLimit] = useState(20)
  const [leads, setLeads] = useState<Lead[] | null>(null)
  const [truncated, setTruncated] = useState(false)
  const [cost, setCost] = useState(0)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const search = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault()
      if (busy) return
      setBusy(true)
      setError('')
      try {
        const response = await fetch('/api/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ keyword, location, limit }),
        })
        const payload = (await response.json()) as SearchResponse
        if (!response.ok) {
          setError(payload.error ?? `The search failed (${response.status}).`)
          setLeads(null)
          return
        }
        setLeads(payload.leads ?? [])
        setTruncated(Boolean(payload.truncated))
        setCost(payload.estimatedCostUsd ?? 0)
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'The search failed.')
        setLeads(null)
      } finally {
        setBusy(false)
      }
    },
    [busy, keyword, location, limit],
  )

  const stats = useMemo(() => {
    if (!leads) return null
    return {
      total: leads.length,
      withPhone: leads.filter((lead) => lead.phone).length,
      withWebsite: leads.filter((lead) => lead.website).length,
    }
  }, [leads])

  return (
    <main className="shell">
      <header className="masthead">
        <h1>Nafran Leads</h1>
        <p>Local businesses by keyword and place — from the official Places API.</p>
      </header>

      <section className="card">
        <form className="form" onSubmit={search}>
          <label className="field">
            <span>Keyword</span>
            <input
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="physiotherapist"
              aria-label="Keyword"
            />
          </label>
          <label className="field">
            <span>Location</span>
            <input
              value={location}
              onChange={(event) => setLocation(event.target.value)}
              placeholder="Lahore, Pakistan"
              aria-label="Location"
            />
          </label>
          <label className="field">
            <span>Max results</span>
            <input
              type="number"
              min={1}
              max={20}
              value={limit}
              onChange={(event) => setLimit(Number(event.target.value))}
              aria-label="Max results"
            />
          </label>
          <button className="primary" type="submit" disabled={busy || !keyword.trim()}>
            {busy ? 'Searching…' : 'Search'}
          </button>
        </form>
        <p className="note">
          Each search is one billed request and returns up to 20 places. The API caps a page at 20, so
          narrow the location to collect more of a large city.
        </p>
      </section>

      {error ? (
        <div className="error" role="alert">
          {error}
        </div>
      ) : null}

      {leads && stats ? (
        <section className="card">
          <div className="row-between">
            <div>
              <strong>
                {stats.total} {stats.total === 1 ? 'business' : 'businesses'}
              </strong>{' '}
              <span className="muted">
                for “{keyword}”{location ? ` near ${location}` : ''}
              </span>
            </div>
            <button
              className="ghost"
              type="button"
              onClick={() => download(csvFileName(keyword, location), toCsv(leads, COLUMNS))}
              disabled={!leads.length}
            >
              Export CSV
            </button>
          </div>

          <div className="stats">
            <span className="stat">{stats.withPhone} with a phone</span>
            <span className="stat">{stats.withWebsite} with a website</span>
            <span className="stat">≈ ${cost.toFixed(4)} this search</span>
            {truncated ? <span className="stat">More results available — narrow the location</span> : null}
          </div>

          {leads.length ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Business</th>
                    <th>Category</th>
                    <th>Address</th>
                    <th>Town</th>
                    <th>Phone</th>
                    <th>Website</th>
                    <th>Rating</th>
                  </tr>
                </thead>
                <tbody>
                  {leads.map((lead) => (
                    <tr key={lead.id || `${lead.name}-${lead.address}`}>
                      <td>
                        {lead.mapsUrl ? (
                          <a href={lead.mapsUrl} target="_blank" rel="noreferrer noopener">
                            {lead.name}
                          </a>
                        ) : (
                          lead.name
                        )}
                      </td>
                      <td>{lead.category || '—'}</td>
                      <td className="wrap">{lead.address || '—'}</td>
                      <td>{lead.town || '—'}</td>
                      <td>{lead.phone || '—'}</td>
                      <td>
                        {lead.website ? (
                          <a href={lead.website} target="_blank" rel="noreferrer noopener">
                            {lead.website.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                          </a>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td>
                        {lead.rating === null
                          ? '—'
                          : `${lead.rating} ★${lead.reviewCount === null ? '' : ` (${lead.reviewCount})`}`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty">No places matched that search. Try a different keyword or location.</div>
          )}
        </section>
      ) : null}
    </main>
  )
}
