import { useEffect, useState } from 'react'
import type { DesktopApi } from '../types/desktop'

type BillingStatus = Awaited<ReturnType<DesktopApi['billing']['status']>>
type Invoice = Awaited<ReturnType<DesktopApi['billing']['invoices']>>[number]
const invoiceMoney = (amount: number, currency: string) => currency.toLowerCase() === 'pkr'
  ? `Rs ${new Intl.NumberFormat('en-PK', { maximumFractionDigits: 2 }).format(amount / 100)}`
  : new Intl.NumberFormat('en-US', { style: 'currency', currency: currency.toUpperCase() }).format(amount / 100)
const dateParts = (issued: string) => {
  const date = new Date(`${issued.slice(0, 10)}T12:00:00`)
  return Number.isNaN(date.getTime()) ? { month: '—', day: '—', label: 'Date unavailable' }
    : { month: date.toLocaleDateString('en-GB', { month: 'short' }), day: String(date.getDate()), label: date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) }
}
function ReceiptIcon() {
  return <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 3.5h12v17l-2-1.4-2 1.4-2-1.4-2 1.4-2-1.4-2 1.4zM9 8.5h6M9 12h6M9 15.5h3.5"/></svg>
}

export function InvoicesPanel({ billing, revision, refreshing, onRefresh, onSupport }: { billing: BillingStatus; revision: number; refreshing: boolean; onRefresh: () => void; onSupport: (message: string) => void }) {
  const api = window.desktop?.billing
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [openInvoice, setOpenInvoice] = useState<string | null>(null)
  const [opening, setOpening] = useState(false)
  useEffect(() => {
    let current = true
    setError('')
    setInvoices([])
    if (!billing.connected || !api) { setLoading(false); return }
    if (!billing.hasCustomer) { setLoading(false); return }
    setLoading(true)
    void api.invoices().then(rows => {
      if (!current) return
      setInvoices(rows)
      setOpenInvoice(previous => rows.some(row => row.id === previous) ? previous : rows[0]?.id ?? null)
    }).catch(reason => { if (current) setError(reason instanceof Error ? reason.message : 'Invoices could not be loaded. Please try again.') })
      .finally(() => { if (current) setLoading(false) })
    return () => { current = false }
  }, [api, billing.connected, billing.hasCustomer, revision])
  const openReceipt = async (url: string) => {
    if (!api || opening) return
    setOpening(true); setError('')
    try { await api.openInvoice(url) }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'The Stripe receipt could not be opened.') }
    finally { setOpening(false) }
  }
  // Never add unlike currencies or count an open/void invoice as a payment.
  const paid = new Map<string, number>()
  for (const invoice of invoices) {
    const amount = invoice.amountPaid ?? (invoice.status === 'paid' ? invoice.total : 0)
    if (amount > 0) paid.set(invoice.currency.toLowerCase(), (paid.get(invoice.currency.toLowerCase()) ?? 0) + amount)
  }
  const paidLabel = [...paid].map(([currency, amount]) => invoiceMoney(amount, currency)).join(' · ') || 'No payments'
  return <section className="invoices-panel account-surface" aria-labelledby="invoices-title" aria-busy={loading}>
    <div className="invoices-heading"><div><h2 id="invoices-title">Invoices</h2><p>Invoices shown here come from Stripe for this installation.</p></div><span className="invoices-connection"><span className={`settings-connection-dot${billing.connected ? ' is-connected' : ''}`} aria-hidden="true"/>{billing.connected ? `Stripe${billing.mode ? ` · ${billing.mode}` : ''}` : 'Stripe unavailable'}</span></div>
    {error && <div role="alert" className="invoice-error">{error}</div>}
    {loading ? <div className="invoice-empty" role="status"><span className="invoice-empty-icon"><ReceiptIcon/></span><h3>Loading your invoices…</h3><p>Checking your payment history with Stripe.</p></div> : invoices.length ? <>
      <div className="invoice-summary"><div className="invoice-summary-paid"><span>Total paid</span><strong data-invoice-paid="1">{paidLabel}</strong></div><div><span>Plan</span><strong>{billing.lifetime?.active ? 'Lifetime' : 'Not active'}</strong></div><div><span>Next charge</span><strong>{billing.lifetime?.active ? 'Never' : '—'}</strong></div></div>
      <div className="invoice-list">{invoices.map((invoice, index) => {
        const date = dateParts(invoice.issued)
        const open = openInvoice === invoice.id
        const title = invoice.description || 'MamaLead purchase'
        const isPaid = invoice.status === 'paid'
        const status = ({ paid: 'Paid', open: 'Awaiting payment', draft: 'Draft', void: 'Void', uncollectible: 'Uncollectible' } as Record<string, string>)[invoice.status] || 'Status unavailable'
        return <article className="invoice-ticket" key={invoice.id}>
          <button type="button" className="invoice-toggle" aria-expanded={open} aria-controls={`invoice-details-${index}`} onClick={() => setOpenInvoice(open ? null : invoice.id)}>
            <span className="invoice-date"><span>{date.month}</span><strong>{date.day}</strong></span><span className="invoice-name"><strong>{title}</strong><small>{invoice.number || invoice.id} · {date.label}</small></span><span className={`invoice-status${isPaid ? ' is-paid' : ''}`}>{status}</span><strong className="invoice-amount">{invoiceMoney(invoice.total, invoice.currency)}</strong><svg className={open ? 'is-open' : undefined} viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
          </button>
          {open && <div className="invoice-details" id={`invoice-details-${index}`}><div className="invoice-perforation" aria-hidden="true"/><div className="invoice-detail-body">
            <dl><div><dt>{title}</dt><dd>{invoiceMoney(invoice.total, invoice.currency)}</dd></div><div className="invoice-total"><dt>{isPaid ? 'Total paid' : 'Invoice total'}</dt><dd>{invoiceMoney(isPaid ? invoice.amountPaid ?? invoice.total : invoice.total, invoice.currency)}</dd></div></dl><p>{status} · {date.label}</p>
            <div className="invoice-actions">{(invoice.pdfUrl || invoice.url) && <button type="button" className="invoice-download" disabled={opening} onClick={() => void openReceipt(invoice.pdfUrl || invoice.url)}><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M12 4v11m-4.5-4.5L12 15l4.5-4.5M5 19.5h14"/></svg>{opening ? 'Opening…' : invoice.pdfUrl ? 'Download PDF' : 'View invoice in Stripe'}</button>}<button type="button" className="account-button" onClick={() => onSupport(`I need help with my receipt for invoice ${invoice.number || invoice.id}.`)}>Help with receipt</button></div>
          </div></div>}
        </article>
      })}</div>
      <button type="button" className="account-button invoice-refresh" disabled={refreshing} onClick={onRefresh}>{refreshing ? 'Refreshing…' : 'Refresh invoices'}</button>
    </> : <div className="invoice-empty"><span className="invoice-empty-icon"><ReceiptIcon/></span><h3>{!billing.connected ? 'Connect to view your invoices' : error ? 'Invoices could not be loaded' : 'No invoices found in Stripe.'}</h3><p>{!billing.connected ? 'Refresh billing when your connection is available.' : error ? 'Try checking Stripe again in a moment.' : 'Invoices appear here after a payment goes through Stripe. Lifetime access is Rs 10,000, paid once.'}</p><button type="button" className="account-button" disabled={refreshing} onClick={onRefresh}>{refreshing ? 'Checking Stripe…' : 'Check Stripe again'}</button></div>}
  </section>
}
