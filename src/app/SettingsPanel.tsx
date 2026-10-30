import { useCallback, useEffect, useRef, useState } from 'react'
import type { AppValues } from './useAppValues'
import type { DesktopApi } from '../types/desktop'
import './settings.css'
import { AppUpdatesCard } from './AppUpdatesCard'

type BillingStatus = Awaited<ReturnType<DesktopApi['billing']['status']>>
type BillingInvoice = Awaited<ReturnType<DesktopApi['billing']['invoices']>>[number]
const money = (amount: number, currency: string) => new Intl.NumberFormat('en-US', { style: 'currency', currency: currency.toUpperCase() }).format(amount / 100)
const pkr = (amount: number) => new Intl.NumberFormat('en-PK', { maximumFractionDigits: 0 }).format(amount / 100)

const card = { padding: '22px 24px', borderRadius: '22px', background: '#F5F5F4' } as const
const muted = { color: '#5A5F5C', fontSize: '13px', lineHeight: 1.5 } as const
const row = { display: 'flex', flexWrap: 'wrap', gap: '12px', padding: '12px 0', borderTop: '1px solid #E4E5E2' } as const
const button = { border: 0, borderRadius: '999px', padding: '9px 15px', background: '#E5E5E5', color: '#1C1C1C', fontFamily: 'inherit', cursor: 'pointer' } as const

export function SettingsPanel({ V }: { V: AppValues }) {
  const tabScroll=useRef<Record<string,number>>({})
  const switchTab=(click:()=>void,id:string)=>{tabScroll.current[V.activeTab]=window.scrollY;click();requestAnimationFrame(()=>window.scrollTo({top:tabScroll.current[id] ?? (document.querySelector('.settings-header')?.getBoundingClientRect().top ?? 0)+window.scrollY,behavior:'instant'}))}
  const billingApi = window.desktop?.billing
  const [billing, setBilling] = useState<BillingStatus>({ configured: false, connected: false, message: 'Checking Stripe billing…' })
  const [invoices, setInvoices] = useState<BillingInvoice[]>([])
  const [billingBusy, setBillingBusy] = useState(false)
  const [billingError, setBillingError] = useState('')
  const [trialOpen, setTrialOpen] = useState(false)
  const [trialEmail, setTrialEmail] = useState('')
  const [trialBusy, setTrialBusy] = useState(false)
  const [trialSent, setTrialSent] = useState(false)
  const [trialCorrecting, setTrialCorrecting] = useState(false)
  const [trialEmailConflict, setTrialEmailConflict] = useState(false)
  const [trialChangeBlocked, setTrialChangeBlocked] = useState(false)
  const [trialEmailReset, setTrialEmailReset] = useState(0)
  const [trialNotice, setTrialNotice] = useState('')
  const [trialInvalid, setTrialInvalid] = useState(false)
  const trialEmailInput = useRef<HTMLInputElement>(null)
  const [licenseStepNotice, setLicenseStepNotice] = useState('')
  const [licenseKey, setLicenseKey] = useState('')
  const [showKey,setShowKey] = useState(false)
  const [changeKey,setChangeKey] = useState(false)
  const licenseKeyInput = useRef<HTMLInputElement>(null)
  const [licenseBusy, setLicenseBusy] = useState(false)
  const [licenseNotice, setLicenseNotice] = useState<{ kind: 'error' | 'success'; message: string } | null>(null)
  useEffect(() => {
    if (!licenseNotice) return
    const timer = window.setTimeout(() => setLicenseNotice(null), 6000)
    return () => window.clearTimeout(timer)
  }, [licenseNotice])
  useEffect(() => {
    const jump = V.billingJump
    if (!jump || (jump.target === 'license' ? !V.tabAcct : !V.tabPlan)) return
    if (jump.target==='license') setChangeKey(true)
    if (jump.target === 'trial' && !trialOpen) { setTrialOpen(true); return }
    // Billing cards arrive asynchronously. Keep the requested destination until it exists.
    const section = document.getElementById(`${jump.target}-section`)
    if (!section) return
    const timer = window.setTimeout(() => {
      section.scrollIntoView({behavior:'smooth',block:jump.target === 'lifetime' ? 'start' : 'center'})
      const focus = jump.target === 'trial' ? trialEmailInput.current : jump.target === 'license' ? licenseKeyInput.current : section.querySelector<HTMLElement>('[data-lifetime-buy]:not(:disabled)') ?? section
      focus?.focus({preventScroll:true})
      V.clearBillingJump()
    },150)
    return () => window.clearTimeout(timer)
  },[V.billingJump,V.tabPlan,V.tabAcct,V.clearBillingJump,billing.connected,billing.lifetime,trialOpen])
  const refreshBilling = useCallback(async () => {
    setBillingError('')
    if (!billingApi) return setBilling({ configured: false, connected: false, message: 'Desktop billing bridge is unavailable.' })
    try {
      const status = await billingApi.status()
      setBilling(status)
      if (status.trialRequest) {
        setTrialSent(status.trialRequest.requested)
        setTrialChangeBlocked(status.trialRequest.requested && !status.trialRequest.canChangeEmail)
      }
      window.dispatchEvent(new Event('nafran:billing-updated'))
      return status
    }
    catch (error) { setBilling({ configured: true, connected: false, message: error instanceof Error ? error.message : 'Billing status could not be loaded.' }) }
  }, [billingApi])
  useEffect(() => { void refreshBilling() }, [refreshBilling])
  useEffect(() => {
    const onFocus = () => { void refreshBilling() }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [refreshBilling])

  useEffect(() => {
    const onBillingError = (event: Event) => setBillingError((event as CustomEvent<string>).detail)
    window.addEventListener('nafran:billing-error', onBillingError)
    return () => window.removeEventListener('nafran:billing-error', onBillingError)
  }, [])
  useEffect(() => {
    if (V.licenseNextStep) void refreshBilling()
  }, [V.licenseNextStep, refreshBilling])
  useEffect(() => {
    if (V.tabAcct && (licenseStepNotice || V.licenseNextStep)) licenseKeyInput.current?.focus()
  }, [V.tabAcct, V.licenseNextStep, licenseStepNotice])
  useEffect(() => {
    if (V.tabPlan && trialOpen && trialEmailReset) {
      trialEmailInput.current?.focus()
      trialEmailInput.current?.select()
    }
  }, [V.tabPlan, trialOpen, trialEmailReset])
  useEffect(() => {
    if (!V.tabInv || !billing.connected || !billing.hasCustomer || !billingApi) return
    let active = true
    void billingApi.invoices().then((rows) => { if (active) setInvoices(rows) }).catch((error) => { if (active) setBillingError(error instanceof Error ? error.message : 'Invoices could not be loaded.') })
    return () => { active = false }
  }, [V.tabInv, billing.connected, billing.hasCustomer, billingApi])
  const openBilling = async (action: () => Promise<{ opened: boolean }>) => {
    setBillingBusy(true)
    setBillingError('')
    try { await action(); setBillingError('Stripe opened in your browser. Refresh billing here after you return.') }
    catch (error) { setBillingError(error instanceof Error ? error.message : 'Stripe could not be opened.') }
    finally { setBillingBusy(false) }
  }
  const startLifetimeCheckout = async () => {
    if (!billingApi) return
    if (!lifetimePlanReady) { setBillingError('PKR Checkout is not ready on the billing server yet. No payment was opened.'); return }
    setBillingBusy(true)
    setBillingError('')
    try {
      const result = await billingApi.checkout('lifetime', '')
      if (!result.opened) throw new Error('Stripe Checkout could not be opened.')
      V.startLifetimeCheckoutWatch()
      setBillingError('Enter your email and card on Stripe Checkout. Once your key is emailed, Account will open automatically.')
    } catch (error) {
      setBillingError(error instanceof Error ? error.message : 'Stripe Checkout could not be opened.')
    } finally {
      setBillingBusy(false)
    }
  }

  const activateLicense = async () => {
    const key = licenseKey.trim().toUpperCase().replace(/\s/g,'')
    if (!key) {
      setLicenseNotice({ kind: 'error', message: 'Enter your MamaLead license key first.' })
      return
    }
    if (!/^NF(?:-[A-Z0-9]{4}){10}$/.test(key)) {
      setLicenseNotice({kind:'error',message:'Paste the complete key: NF followed by 10 groups of 4 characters. Spaces are removed automatically.'}); return
    }
    if (!billingApi) {
      setLicenseNotice({ kind: 'error', message: 'License verification is unavailable in this app session.' })
      return
    }
    setLicenseBusy(true)
    setBillingError('')
    setLicenseNotice(null)
    try {
      await billingApi.activate(key)
      setLicenseKey('')
      setChangeKey(false)
      const status = await refreshBilling()
      if (!status?.coreLicenseActive && !(status?.license?.active && status.license.kind !== 'decision')) {
        throw new Error('This key does not activate this build. Use a 1-day trial or Lifetime key.')
      }
      setLicenseStepNotice('')
      V.clearLicenseNextStep()
      setLicenseNotice({ kind: 'success', message: 'License activated on this machine.' })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'License could not be activated.'
      setLicenseNotice({
        kind: 'error',
        message: /invalid|revoked|exactly as it appears|valid MamaLead license key/i.test(message)
          ? 'Invalid license key. Check the key in your email and try again.'
          : message,
      })
    }
    finally { setLicenseBusy(false) }
  }
  const changeTrialEmail = () => {
    setTrialCorrecting(billing.trialRequest?.requested ?? trialSent)
    setTrialEmail('')
    setTrialNotice('')
    setTrialEmailConflict(false)
    setLicenseStepNotice('')
    V.clearLicenseNextStep()
    setTrialOpen(true)
    setTrialEmailReset(value => value + 1)
    V.goTabPlan()
    window.setTimeout(() => document.getElementById('trial-section')?.scrollIntoView({ behavior:'smooth', block:'center' }), 150)
  }
  const requestTrial = async () => {
    if (!billingApi || trialBusy) return
    if (billing.lifetime?.active || (billing.license?.active && billing.license.kind==='lifetime')) return
    const email = trialEmail.trim().toLowerCase()
    if (email.length > 254 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { setTrialInvalid(true); setTrialNotice('Enter a valid email address for your trial key.'); trialEmailInput.current?.focus(); return }
    setTrialInvalid(false)
    const replacing = trialCorrecting || Boolean(billing.trialRequest?.requested && billing.trialRequest.canChangeEmail)
    setTrialBusy(true)
    setTrialNotice('')
    try {
      const result = await billingApi.requestTrial(email, replacing)
      if (!result.emailSent) throw new Error('Trial email could not be delivered. Please try again.')
      setTrialCorrecting(false)
      setTrialEmailConflict(false)
      setTrialSent(true)
      setTrialOpen(false)
      setTrialNotice(`Trial key sent to ${email}. Open that email, then enter the key in Account. Your 24 hours start when you activate it.`)
      setLicenseStepNotice(`Trial key sent to ${email}. Paste it below when the email arrives. Your 24 hours start when you activate it.${replacing ? ' The previous key is no longer valid.' : ''}`)
      await refreshBilling()
      V.goTabAcct()
    } catch (error) {
      const message = (error instanceof Error ? error.message : 'Trial key could not be requested.').replace(/^Error invoking remote method '[^']+': (?:Error:\s*)?/i, '')
      if (/already been requested|already received its one trial key/i.test(message)) {
        if (/or browser|or device|already received/i.test(message)) setTrialSent(true)
        setTrialEmailConflict(true)
        setTrialOpen(true)
        setTrialNotice('A trial key has already been requested. Use the key from your email, or choose Change email to enter a different address before activation.')
      } else if (/can no longer be changed|already activated or closed/i.test(message)) {
        setTrialChangeBlocked(true)
        setTrialCorrecting(false)
        setTrialOpen(false)
        setTrialNotice('This device’s trial email cannot be changed. Use your existing key or contact support if you cannot access it. Changing email does not restart an activated trial.')
      } else setTrialNotice(message)
    } finally { setTrialBusy(false) }
  }
  const tabs = [
    ['plan', 'Usage', V.goTabPlan],
    ['pay', 'Payment', V.goTabPay],
    ['inv', 'Invoices', V.goTabInv],
    ['acct', 'Account', V.goTabAcct],
  ] as const
  const lookups = [
    ['Email lookups', V.usedEmailLookups, V.meterEmail],
    ['Phone lookups', V.usedPhoneLookups, V.meterPhone],
    ['Social lookups', V.usedSocialLookups, V.meterSocial],
  ] as const
  const lifetimeActive=Boolean(billing.lifetime?.active || (billing.license?.active && billing.license.kind==='lifetime'))
  const activeLicense=Boolean(billing.coreLicenseActive && billing.license?.active)
  const lifetimePlanReady = billing.lifetime?.currency === 'pkr' && billing.lifetime.amount === 1000000 && billing.lifetime.interval === null

  const paymentSetupMessage = billing.connected && !lifetimePlanReady
    ? 'Payments are paused until the billing server has the Rs 10,000 PKR Lifetime price.'
    : ''
  return <div className="settings-page">
    {licenseNotice && <div data-license-notice="1" role={licenseNotice.kind === 'error' ? 'alert' : 'status'} style={{ position: 'fixed', top: '20px', right: '20px', zIndex: 220, display: 'flex', alignItems: 'flex-start', gap: '12px', width: 'min(400px,calc(100vw - 40px))', padding: '14px 16px', borderRadius: '16px', background: licenseNotice.kind === 'error' ? '#F9E8E5' : '#E7EFE2', border: `1px solid ${licenseNotice.kind === 'error' ? '#D78278' : '#9DB58D'}`, color: '#1C1C1C', boxShadow: '0 18px 44px -22px rgba(28,28,28,.55)', fontSize: '13px', lineHeight: 1.5 }}>
      <strong style={{ flex: 1 }}>{licenseNotice.message}</strong><button type="button" aria-label="Dismiss license notice" onClick={() => setLicenseNotice(null)} style={{ border: 0, background: 'transparent', font: 'inherit', cursor: 'pointer', lineHeight: 1 }}>×</button>
    </div>}
    <header className="settings-header">
      <h1>Workspace &amp; Settings</h1>
      <p>{V.workspaceName} · local workspace on this device</p>
      <div className="settings-header-status"><span data-billing-status="1">{billing.connected ? `Stripe ${billing.mode} mode connected` : billing.message}</span><button type="button" onClick={() => void refreshBilling()}>Refresh billing</button></div>
      {billingError && <p className="settings-billing-message" role="status">{billingError}</p>}
    </header>
    <div data-settings="1" className="settings-layout">
      <nav data-tabs="1" data-active={V.activeTab} aria-label="Settings sections" className="settings-tabs">
        {tabs.map(([id, label, click]) => <button key={id} data-stab={id} type="button" onClick={()=>switchTab(click,id)} aria-current={V.activeTab === id ? 'page' : undefined}>{label}</button>)}
      </nav>
      <div className="settings-content">
        {V.tabPlan && <>
          {!lifetimeActive && <section data-card="1" className="billing-stage">
            <div className="billing-stage-heading">
              <div><h2>MamaLead billing</h2><p>{lifetimePlanReady ? `Prices and purchase status are verified with Stripe${billing.mode === 'test' ? ' test mode' : ''}.` : 'PKR Checkout update pending on the billing server. Payment is paused until the prices match.'}</p></div>
              <span className="billing-status-pill">{billing.lifetime?.active ? 'Purchased' : lifetimePlanReady ? 'Not purchased' : 'PKR setup pending'}</span>
            </div>
            {paymentSetupMessage && <p data-checkout-setup-alert="1" role="status" className="billing-setup-alert">{paymentSetupMessage}</p>}
            <div id="lifetime-section" tabIndex={-1} className="billing-offer" style={{scrollMarginTop:24}}>
              <div className="billing-offer-top"><span className="billing-offer-badge"><span aria-hidden="true" className="billing-offer-dot" />LIFETIME ACCESS</span><span>Unlimited Maps, email, phone and social lookups</span></div>
              <div className="billing-offer-body">
                <div className="billing-offer-price-block">
                  <div className="billing-offer-price-line"><div className="billing-offer-price"><span>Rs</span>{pkr(1000000)}</div><span className="billing-offer-price-unit">PKR · one-time</span></div>
                  <p>Pay once for unlimited Maps, email, phone and social lookups. Your lifetime key arrives by email after payment.</p>
                </div>
                <div className="billing-offer-steps">
                  <div className="billing-offer-eyebrow">HOW IT WORKS</div>
                  <div><span>01</span> Enter your email and card on Stripe</div>
                  <div><span>02</span> Receive your lifetime key by email</div>
                  <div><span>03</span> Paste the key in Account to activate</div>
                </div>
              </div>
              <p className="billing-plan-note">By continuing, review our <a href="https://mamalead.com/terms.html" target="_blank" rel="noreferrer">Terms of use</a> and <a href="https://mamalead.com/privacy.html" target="_blank" rel="noreferrer">Privacy Policy</a>.</p><div className="billing-offer-benefits" aria-label="Lifetime plan benefits"><span>✓ Unlimited Maps leads</span><span>✓ Unlimited email lookups</span><span>✓ Unlimited phone lookups</span><span>✓ Unlimited social lookups</span></div>
              <div className="billing-offer-bottom">
                {billing.lifetime?.active ? <button type="button" onClick={V.goTabAcct} className="billing-offer-button">Open Account <span aria-hidden="true">↗</span></button> : <button type="button" data-lifetime-buy="1" disabled={billingBusy || !billingApi || !lifetimePlanReady} onClick={() => void startLifetimeCheckout()} className="billing-offer-button">{!lifetimePlanReady ? 'Payment setup pending' : billingBusy ? 'Opening Stripe…' : 'Buy now'} <span aria-hidden="true">↗</span></button>}
                <p>{billing.lifetime?.active ? 'Your lifetime purchase is verified. Enter the emailed key in Account to activate this machine.' : lifetimePlanReady ? 'Enter your email and card directly on Stripe Checkout. Your lifetime key will be sent to that email after payment.' : 'Checkout will be available after the billing server has the Rs 10,000 PKR Stripe price.'}</p>
              </div>
            </div>
            <div className="billing-plan-grid">

              <div id="trial-section" className="billing-plan-card">
                <div className="billing-plan-heading"><h3>1-day trial · up to 300 Maps leads across all keywords</h3>{billing.trial?.active && <span className="billing-plan-pill">Active</span>}</div>
                <div className="billing-plan-action"><strong>Free</strong>{billing.trial?.active ? <span className="billing-plan-date">Until {new Date(billing.trial.expiresAt!).toLocaleString()}</span> : trialSent ? <button type="button" onClick={V.goTabAcct}>Enter key in Account</button> : <button type="button" data-trial-open="1" disabled={trialBusy} onClick={() => setTrialOpen(true)}>Get 1-day trial key</button>}</div>
                {billing.trial?.active && billing.mapsLeads?.limit != null ? <p data-trial-maps-usage="1" className="billing-plan-note">{billing.mapsLeads.used ?? 0} of {billing.mapsLeads.limit} Maps leads used · {billing.mapsLeads.remaining ?? 0} remaining.</p> : <p className="billing-plan-note">Enter your email, receive a trial key, then activate it in Account. The 24 hours start at activation.</p>}
                {!billing.trial?.active && !trialChangeBlocked && trialOpen && <form noValidate data-trial-form="1" className="billing-trial-form" onSubmit={(event) => { event.preventDefault(); void requestTrial() }}>
                  <label htmlFor="desktop-trial-email">{trialCorrecting ? 'New email for your trial key' : 'Email for your trial key'}<input id="desktop-trial-email" aria-invalid={trialInvalid} aria-describedby="trial-email-notice" ref={trialEmailInput} type="email" autoComplete="email" required disabled={trialBusy} value={trialEmail} onChange={(event) => { setTrialEmail(event.target.value); setTrialInvalid(false); setTrialNotice(''); setTrialEmailConflict(false) }} placeholder="you@example.com" /></label>
                  <button type="submit" disabled={trialBusy} style={{ ...button, background: "#1C1C1C", color: "white", padding: "13px 22px", fontWeight: 600 }}>{trialBusy ? 'Sending…' : trialCorrecting ? 'Send replacement key' : 'Send trial key'}</button>
                </form>}
                {trialNotice && <p id="trial-email-notice" data-trial-notice="1" role={trialInvalid ? "alert" : "status"} className="billing-plan-note">{trialNotice}</p>}
                {(trialSent || trialEmailConflict) && !trialChangeBlocked && !billing.trial?.active && <button type="button" data-trial-change-email="1" disabled={trialBusy} onClick={changeTrialEmail} style={button}>Change email</button>}
              </div>
            </div>
          </section>}
          <section data-maps-plan-guide="1" style={{ ...card, background: '#F5F5F4', border: '1px solid #E4E7DF' }}>
            <p style={{ ...muted, margin: 0, fontSize: '11px', fontWeight: 600, letterSpacing: '.16em', textTransform: 'uppercase' }}>Maps scraper allowance</p>
            <h2 style={{ margin: '7px 0 5px', fontSize: '21px', fontWeight: 500 }}>Your Maps allowance</h2>
            <p style={{ ...muted, margin: '0 0 17px' }}>Your activated key sets the total number of Google Maps leads you can collect.</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
              {!lifetimeActive && <div data-maps-plan="trial" style={{ padding: '18px 19px', borderRadius: '18px', background: '#E5ECDF', border: '1px solid #C8D5BB' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                  <strong style={{ fontSize: '13px', fontWeight: 600 }}>1-day trial</strong>
                  {billing.trial?.active && <span style={{ padding: '4px 9px', borderRadius: '999px', background: '#D1DFC8', color: '#24452A', fontSize: '10px', fontWeight: 600 }}>ACTIVE</span>}
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: '12px' }}><strong style={{ fontSize: '38px', lineHeight: 1, letterSpacing: '-.05em' }}>300</strong><span style={{ fontSize: '13px' }}>Maps leads total</span></div>
                <p style={{ ...muted, margin: '10px 0 0' }}>Shared across every keyword and search during your 24-hour trial.</p>
                {billing.trial?.active && billing.mapsLeads?.limit === 300 && <p style={{ margin: '12px 0 0', fontSize: '12px', fontWeight: 600, color: '#24452A' }}>{billing.mapsLeads.remaining ?? 0} leads remaining</p>}
              </div>
              }<div data-maps-plan="lifetime" style={{ padding: '18px 19px', borderRadius: '18px', background: '#FFFFFF', border: '1px solid #E0E4DC' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                  <strong style={{ fontSize: '13px', fontWeight: 600 }}>Lifetime</strong>
                  {billing.license?.active && billing.license.kind === 'lifetime' && <span style={{ padding: '4px 9px', borderRadius: '999px', background: '#E5ECDF', color: '#24452A', fontSize: '10px', fontWeight: 600 }}>ACTIVE</span>}
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: '12px' }}><strong style={{ fontSize: '38px', lineHeight: 1, letterSpacing: '-.05em' }}>∞</strong><span style={{ fontSize: '13px' }}>Maps leads</span></div>
                <p style={{ ...muted, margin: '10px 0 0' }}>No total Maps lead limit after activating your lifetime key.</p>
              </div>
            </div>
          </section>
          <section data-card="1" style={{ ...card, background: 'linear-gradient(160deg,#E9EDE4,#CBD8BC)' }}>
            <h2 style={{ margin: 0, fontSize: '21px', fontWeight: 500 }}>Local usage</h2>
            <p style={muted}>{billing.license?.active && billing.license.kind === 'lifetime' ? 'Unlimited Maps leads with your lifetime key.' : billing.trial?.active ? `${billing.mapsLeads?.remaining ?? 0} of 300 trial Maps leads remaining across all keywords.` : 'Activate a trial or lifetime key to see your Maps lead allowance.'}</p>
            <p style={{ margin: '8px 0' }}><strong>{V.usedScrapes.toLocaleString('en-GB')}</strong> Maps run attempts recorded on this device this month</p>
            <p style={muted}>Usage window: {V.cycleRange}</p>
          </section>
          <section data-card="1" style={card}>
            <h2 style={{ margin: 0, fontSize: '19px', fontWeight: 500 }}>Lookups this month</h2>
            <p style={muted}>These are completed jobs recorded on this device. Bars compare each type with the busiest type.</p>
            {lookups.map(([label, count, width]) => <div key={label} style={{ marginTop: '16px' }}><div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px' }}><span>{label}</span><strong>{count.toLocaleString('en-GB')}</strong></div><div style={{ height: '8px', marginTop: '7px', borderRadius: '8px', background: '#E4E6E1' }}><span style={{ display: 'block', width, height: '100%', borderRadius: '8px', background: '#8FA382' }} /></div></div>)}
          </section>
        </>}
        {V.tabPay && <section data-card="1" style={card}><h2 style={{ margin: 0, fontSize: '19px', fontWeight: 500 }}>Payment</h2><p style={muted}>{billing.connected ? 'Your lifetime purchase and payment method are managed securely on Stripe.' : 'Connect the billing server to manage Stripe payments.'}</p>{billing.hasCustomer ? <button type="button" disabled={billingBusy || !billingApi} onClick={() => void openBilling(() => billingApi!.portal())} style={button}>Open Stripe billing portal</button> : <div style={row}>No Stripe customer connected to this installation.</div>}</section>}
        {V.tabInv && <section data-card="1" style={card}><h2 style={{ margin: 0, fontSize: '19px', fontWeight: 500 }}>Invoices</h2><p style={muted}>Invoices shown here come from Stripe for this installation.</p>{invoices.length ? <ul style={{ listStyle: 'none', padding: 0 }}>{invoices.map((invoice) => <li key={invoice.id} style={row}><span style={{ flex: 1 }}>{invoice.number || invoice.id} · {invoice.issued}</span><strong>{money(invoice.total, invoice.currency)}</strong><span>{invoice.status}</span>{invoice.url && <button type="button" onClick={() => void openBilling(() => billingApi!.openInvoice(invoice.url))} style={button}>Open invoice</button>}</li>)}</ul> : <div style={row}>No invoices found in Stripe.</div>}</section>}
        {V.tabAcct && <>
          <section id="license-section" data-card="1" style={card}>
            <h2 style={{ margin: 0, fontSize: '19px', fontWeight: 500 }}>MamaLead license</h2>
            <p style={muted}>{billing.coreLicenseActive && billing.license?.active ? `${billing.license.kind === 'trial' ? '1-day trial' : 'Lifetime license'} active on this machine${billing.license.expiresAt ? ` until ${new Date(billing.license.expiresAt).toLocaleString()}` : ''}${billing.license.last4 ? ` · ending ${billing.license.last4}` : ''}${billing.license.email ? ` · ${billing.license.email}` : ''}.` : 'Paste a trial or lifetime key from your email to unlock this machine.'}</p>
            {(licenseStepNotice || V.licenseNextStep) && <p data-license-next-step="1" role="status" style={{ ...muted, margin: '10px 0', color: '#315F2D' }}>{licenseStepNotice || V.licenseNextStep}</p>}
            {trialSent && !trialChangeBlocked && !billing.trial?.active && <button type="button" data-trial-change-email="1" disabled={trialBusy} onClick={changeTrialEmail} style={{ ...button, marginBottom: '10px' }}>Change email</button>}
            {activeLicense && !changeKey && <button type="button" onClick={()=>setChangeKey(true)} style={button}>Use a different key</button>}
            {(!activeLicense || changeKey) && <form onSubmit={(event) => { event.preventDefault(); void activateLicense() }} style={row}><label htmlFor="nafran-license-key">License key</label><input id="nafran-license-key" ref={licenseKeyInput} type={showKey ? "text" : "password"} value={licenseKey} onChange={(event) => { setLicenseKey(event.target.value.toUpperCase().replace(/\s/g,'')); setLicenseNotice(null) }} autoComplete="off" placeholder="NF-XXXX-XXXX-…" style={{ flex: '1 1 280px', minWidth: 0, padding: '10px', border: 0, borderRadius: '10px', background: '#EAEAE8' }} /><button type="button" aria-pressed={showKey} onClick={()=>setShowKey(value=>!value)} style={button}>{showKey?'Hide key':'Show key'}</button><button type="submit" disabled={licenseBusy} style={button}>{licenseBusy ? 'Activating…' : 'Activate'}</button></form>}
          </section>
          <section data-card="1" style={card}>
            <h2 style={{ margin: 0, fontSize: '19px', fontWeight: 500 }}>Local account</h2>
            <div style={row}><span>Workspace name</span><strong style={{ marginLeft: 'auto' }}>{V.workspaceName}</strong></div>
            <div style={row}><span>Time zone</span><strong style={{ marginLeft: 'auto' }}>{V.localTimeZone}</strong></div>
            <div style={row}><span>Data location</span><span style={{ marginLeft: 'auto', overflowWrap: 'anywhere' }}>{V.localDataPath}</span></div>
            <div style={row}><span>Session</span><span style={{ marginLeft: 'auto' }}>Local workspace on this device</span></div>
          </section>
          <AppUpdatesCard V={V}/>
          <section data-card="1" style={card}><h2 style={{ margin: 0, fontSize: '19px', fontWeight: 500 }}>Your data</h2><p style={muted}>Export your saved leads and lists from this device.</p><button type="button" onClick={V.openExpAll} style={button}>Export everything</button></section>
        </>}
      </div>
    </div>
  </div>
}
