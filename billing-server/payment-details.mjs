// Only display metadata is returned. Full card numbers, addresses, fingerprints,
// client secrets and raw Stripe objects must never reach the desktop renderer.
export async function paymentDetails(stripe, owner) {
  if (!owner?.customer_id) return { card: null }
  const id = value => typeof value === 'string' ? value : value?.id
  let method, customer
  if (owner.lifetime_session_id) {
    const session = await stripe(`checkout/sessions/${encodeURIComponent(owner.lifetime_session_id)}?expand[]=customer.invoice_settings.default_payment_method&expand[]=payment_intent.payment_method`)
    if (id(session.customer) !== owner.customer_id) throw new Error('Payment customer did not match this installation.')
    customer = typeof session.customer === 'object' ? session.customer : null
    method = customer?.invoice_settings?.default_payment_method
    if ((!method || typeof method === 'string') && session.payment_status === 'paid') method = session.payment_intent?.payment_method
  } else {
    customer = await stripe(`customers/${encodeURIComponent(owner.customer_id)}?expand[]=invoice_settings.default_payment_method`)
    if (customer.id !== owner.customer_id) throw new Error('Payment customer did not match this installation.')
    method = customer.invoice_settings?.default_payment_method
  }
  if (!method || typeof method !== 'object' || !method.card) return { card: null }
  if (method.customer && id(method.customer) !== owner.customer_id) throw new Error('Payment method did not match this installation.')
  const card = method.card
  if (!/^\d{4}$/.test(String(card.last4))) return { card: null }
  return { card: {
    brand: String(card.brand || 'Card').slice(0, 30), last4: String(card.last4),
    expiryMonth: Number.isInteger(card.exp_month) && card.exp_month >= 1 && card.exp_month <= 12 ? card.exp_month : null,
    expiryYear: Number.isInteger(card.exp_year) && card.exp_year >= 2000 && card.exp_year <= 2200 ? card.exp_year : null,
    holder: String(method.billing_details?.name || customer?.name || '').slice(0, 150),
  } }
}
