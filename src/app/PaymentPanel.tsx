import { useEffect, useState } from 'react'
import type { DesktopApi } from '../types/desktop'

type BillingStatus = Awaited<ReturnType<DesktopApi['billing']['status']>>
type Card = Awaited<ReturnType<DesktopApi['billing']['paymentDetails']>>['card']
export function PaymentPanel({ billing, revision, busy, onPortal, onAccount, onInvoices }: { billing: BillingStatus; revision: number; busy: boolean; onPortal: () => void; onAccount: () => void; onInvoices: () => void }) {
  const [card, setCard] = useState<Card>(null)
  const [loading, setLoading] = useState(false)
  useEffect(() => {
    let current = true
    setCard(null)
    const api = window.desktop?.billing
    if (!billing.connected || !billing.hasCustomer || !api) { setLoading(false); return }
    setLoading(true)
    api.paymentDetails().then(result => {
      if (current) setCard(result.card)
    }).catch(() => {
      // Older servers and unavailable card details must not block the Stripe portal.
    }).finally(() => { if (current) setLoading(false) })
    return () => { current = false }
  }, [billing.connected, billing.hasCustomer, revision])
  const lifetime = Boolean(billing.lifetime?.active)
  const activated = Boolean(billing.coreLicenseActive && billing.license?.active && billing.license.kind === 'lifetime')
  const email = billing.purchaseEmail || (activated ? billing.license?.email : '')
  const steps = [
    { done: lifetime, title: lifetime ? 'Lifetime purchase verified' : 'Lifetime purchase pending', detail: lifetime ? 'Verified with your connected Stripe customer' : 'Complete checkout to receive your Lifetime key' },
    { done: activated || Boolean(billing.purchaseEmail), title: activated ? 'License key linked' : billing.purchaseEmail ? 'License key emailed' : 'License key', detail: email ? `For ${email}` : 'Your key is sent after payment is confirmed' },
    { done: activated, title: activated ? 'Active on this machine' : 'Activate on this machine', detail: activated ? 'Lifetime access · no renewals' : 'Paste your Lifetime key in Account' },
  ]
  return <section className="payment-panel account-surface" aria-labelledby="payment-title">
    <div className="invoices-heading"><div><h2 id="payment-title">Payment</h2><p>Your lifetime purchase and payment method are managed securely on Stripe.</p></div><span className="invoices-connection"><span className={`settings-connection-dot${billing.connected ? ' is-connected' : ''}`} aria-hidden="true"/>{billing.connected ? billing.hasCustomer ? `Stripe${billing.mode ? ` · ${billing.mode}` : ''}` : 'No linked customer' : 'Stripe unavailable'}</span></div>
    {billing.connected && billing.hasCustomer ? <>
      <div className="payment-grid">
        <div className="payment-card-column"><div className="payment-card" aria-busy={loading}><div className="payment-card-top"><svg viewBox="0 0 38 28" width="38" height="28" fill="none" aria-hidden="true"><rect x=".5" y=".5" width="37" height="27" rx="7" fill="#c8d5bb"/><path d="M13 1v8H1m36 0H25V1M13 27v-8H1m36 0H25v8M13 9h12v10H13z" stroke="#819274"/></svg><strong>{card?.brand.toUpperCase() || 'stripe'}</strong></div><div className="payment-card-mask" aria-label={card ? `Card ending ${card.last4}` : 'Card details are managed in Stripe'}>•••• •••• •••• {card?.last4 || '••••'}</div><div className="payment-card-footer"><span>{card?.holder || (loading ? 'Loading card details…' : 'Payment method')}</span><span>{card?.expiryMonth && card.expiryYear ? `${String(card.expiryMonth).padStart(2, '0')} / ${String(card.expiryYear).slice(-2)}` : 'Managed in Stripe ↗'}</span></div></div><p className="payment-security"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><rect x="5" y="10.5" width="14" height="9.5" rx="2.5"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/></svg>View or update your card securely in Stripe.</p></div>
        <div className="payment-purchase"><p className="payment-eyebrow">Lifetime access</p><div className="payment-price"><strong>Rs 10,000</strong><span>one-time price</span></div><ol className="payment-timeline">{steps.map(step => <li key={step.title} className={step.done ? 'is-complete' : ''}><span className="payment-step-icon" aria-hidden="true">{step.done ? '✓' : '·'}</span><div><strong>{step.title}</strong><small>{step.detail}</small></div></li>)}</ol></div>
      </div>
      <div className="payment-actions"><button type="button" className="invoice-download" disabled={busy} onClick={onPortal}>{busy ? 'Opening Stripe…' : 'Update card in Stripe'}</button><button type="button" className="account-button" disabled={busy} onClick={onPortal}>Open billing portal</button><button type="button" className="account-button" onClick={onInvoices}>View invoices</button></div><p className="payment-footnote">Your receipts show the amount actually paid. The current Lifetime price is Rs 10,000.</p>
    </> : <div className="invoice-empty"><span className="invoice-empty-icon"><svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><rect x="3" y="6" width="18" height="12.5" rx="2.5"/><path d="M3 10h18M7 15h3"/></svg></span><h3>{billing.connected ? 'No Stripe customer connected to this installation.' : 'Payment details are unavailable'}</h3><p>{!billing.connected ? 'Refresh billing when you are back online to manage your payment.' : activated ? 'Your Lifetime key is active. This licence does not have a linked Stripe purchase.' : 'Already purchased? Activate the key from your email in Account to link your purchase. Lifetime access is Rs 10,000, paid once.'}</p><button type="button" className="invoice-download" onClick={onAccount}>Go to Account</button></div>}
  </section>
}
