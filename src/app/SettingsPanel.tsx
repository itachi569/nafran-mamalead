import { useCallback, useEffect, useRef, useState } from 'react'
import type { AppValues } from './useAppValues'
import type { DesktopApi } from '../types/desktop'

type BillingStatus = Awaited<ReturnType<DesktopApi['billing']['status']>>
type BillingInvoice = Awaited<ReturnType<DesktopApi['billing']['invoices']>>[number]
const money = (amount: number, currency: string) => new Intl.NumberFormat('en-US', { style: 'currency', currency: currency.toUpperCase() }).format(amount / 100)

const card = { padding: '22px 24px', borderRadius: '22px', background: '#F5F5F4' } as const
const muted = { color: '#5A5F5C', fontSize: '13px', lineHeight: 1.5 } as const
const row = { display: 'flex', flexWrap: 'wrap', gap: '12px', padding: '12px 0', borderTop: '1px solid #E4E5E2' } as const
const button = { border: 0, borderRadius: '999px', padding: '9px 15px', background: '#E5E5E5', color: '#1C1C1C', fontFamily: 'inherit', cursor: 'pointer' } as const

export function SettingsPanel({ V }: { V: AppValues }) {
  const billingApi = window.desktop?.billing
  const assistApi = window.desktop?.assist
  const [billing, setBilling] = useState<BillingStatus>({ configured: false, connected: false, message: 'Checking Stripe billing…' })
  const [invoices, setInvoices] = useState<BillingInvoice[]>([])
  const [billingBusy, setBillingBusy] = useState(false)
  const [billingError, setBillingError] = useState('')
  const [lifetimeEmail, setLifetimeEmail] = useState('')
  const [trialOpen, setTrialOpen] = useState(false)
  const [trialEmail, setTrialEmail] = useState('')
  const [trialBusy, setTrialBusy] = useState(false)
  const [trialSent, setTrialSent] = useState(false)
  const [trialCorrecting, setTrialCorrecting] = useState(false)
  const [trialCorrectionUsed, setTrialCorrectionUsed] = useState(false)
  const [trialNotice, setTrialNotice] = useState('')
  const trialEmailInput = useRef<HTMLInputElement>(null)
  const [licenseStepNotice, setLicenseStepNotice] = useState('')
  const [licenseKey, setLicenseKey] = useState('')
  const licenseKeyInput = useRef<HTMLInputElement>(null)
  const [licenseBusy, setLicenseBusy] = useState(false)
  const [licenseNotice, setLicenseNotice] = useState<{ kind: 'error' | 'success'; message: string } | null>(null)
  const [assistConfigured, setAssistConfigured] = useState(false)
  const [assistKey, setAssistKey] = useState('')
  const [assistBusy, setAssistBusy] = useState(false)
  const [assistNote, setAssistNote] = useState('')
  useEffect(() => {
    if (!V.tabAcct || !assistApi?.status) return
    void assistApi.status().then((status) => setAssistConfigured(status.configured))
      .catch((error) => setAssistNote(error instanceof Error ? error.message : 'Nafran Assist status is unavailable.'))
  }, [V.tabAcct, assistApi])
  const saveAssistKey = async () => {
    if (!assistApi?.saveKey) return
    setAssistBusy(true)
    try {
      const result = await assistApi.saveKey(assistKey)
      setAssistConfigured(result.configured)
      setAssistKey('')
      setAssistNote('Nafran Assist key saved securely on this device. Use Test connection to check it.')
    } catch (error) { setAssistNote(error instanceof Error ? error.message : 'The AI key could not be saved.') }
    finally { setAssistBusy(false) }
  }
  const testAssist = async () => {
    if (!assistApi?.test) return
    setAssistBusy(true)
    setAssistNote('Checking the AI connection…')
    try {
      const result = await assistApi.test()
      setAssistNote(`Nafran Assist is working on this device (${result.model}).`)
    } catch (error) { setAssistNote(error instanceof Error ? error.message : 'Nafran Assist could not connect.') }
    finally { setAssistBusy(false) }
  }
  const removeAssistKey = async () => {
    if (!assistApi?.removeKey) return
    setAssistBusy(true)
    try {
      const result = await assistApi.removeKey()
      setAssistConfigured(result.configured)
      setAssistNote(result.configured ? 'A process environment key is still configured.' : 'Nafran Assist key removed from this device.')
    } catch (error) { setAssistNote(error instanceof Error ? error.message : 'The AI key could not be removed.') }
    finally { setAssistBusy(false) }
  }
  useEffect(() => {
    if (!licenseNotice) return
    const timer = window.setTimeout(() => setLicenseNotice(null), 6000)
    return () => window.clearTimeout(timer)
  }, [licenseNotice])
  const refreshBilling = useCallback(async () => {
    setBillingError('')
    if (!billingApi) return setBilling({ configured: false, connected: false, message: 'Desktop billing bridge is unavailable.' })
    try { setBilling(await billingApi.status()) }
    catch (error) { setBilling({ configured: true, connected: false, message: error instanceof Error ? error.message : 'Billing status could not be loaded.' }) }
  }, [billingApi])
  useEffect(() => { void refreshBilling() }, [refreshBilling])
  useEffect(() => {
    if (V.licenseNextStep) void refreshBilling()
  }, [V.licenseNextStep, refreshBilling])
  useEffect(() => {
    if (V.tabAcct && (licenseStepNotice || V.licenseNextStep)) licenseKeyInput.current?.focus()
  }, [V.tabAcct, V.licenseNextStep, licenseStepNotice])
  useEffect(() => {
    if (V.tabPlan && trialOpen && trialCorrecting) {
      trialEmailInput.current?.focus()
      trialEmailInput.current?.select()
    }
  }, [V.tabPlan, trialOpen, trialCorrecting])
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
    setBillingBusy(true)
    setBillingError('')
    try {
      const result = await billingApi.checkout('lifetime', lifetimeEmail)
      if (!result.opened) throw new Error('Stripe Checkout could not be opened.')
      V.startLifetimeCheckoutWatch()
      setBillingError('Finish payment in Stripe. The licence field will open here automatically after payment is verified.')
    } catch (error) {
      setBillingError(error instanceof Error ? error.message : 'Stripe could not be opened.')
    } finally {
      setBillingBusy(false)
    }
  }
  const startDecisionCheckout = async () => {
    if (!billingApi) return
    setBillingBusy(true)
    setBillingError('')
    try {
      const result = await billingApi.checkout('decisionMaker', '')
      if (!result.opened) throw new Error('Stripe Checkout could not be opened.')
      setBillingError('Finish the $3/month subscription in Stripe, then refresh billing here.')
    } catch (error) {
      setBillingError(error instanceof Error ? error.message : 'Subscription checkout could not be opened.')
    } finally { setBillingBusy(false) }
  }
  const activateLicense = async () => {
    const key = licenseKey.trim()
    if (!key) {
      setLicenseNotice({ kind: 'error', message: 'Enter your Nafran license key first.' })
      return
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
      await refreshBilling()
      setLicenseStepNotice('')
      V.clearLicenseNextStep()
      setLicenseNotice({ kind: 'success', message: 'License activated on this machine.' })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'License could not be activated.'
      setLicenseNotice({
        kind: 'error',
        message: /invalid|revoked|exactly as it appears|valid Nafran license key/i.test(message)
          ? 'Invalid license key. Check the key in your email and try again.'
          : message,
      })
    }
    finally { setLicenseBusy(false) }
  }
  const requestTrial = async () => {
    if (!billingApi) return
    setTrialBusy(true)
    setTrialNotice('')
    try {
      const result = await billingApi.requestTrial(trialEmail, trialCorrecting)
      if (!result.emailSent) throw new Error('Trial email could not be delivered. Please try again.')
      if (trialCorrecting) setTrialCorrectionUsed(true)
      setTrialCorrecting(false)
      setTrialSent(true)
      setTrialOpen(false)
      setTrialNotice(`Trial key sent to ${trialEmail.trim()}. Open that email, then enter the key in Account. Your 24 hours start when you activate it.`)
      setLicenseStepNotice(`Trial key sent to ${trialEmail.trim()}. Paste it below when the email arrives. Your 24 hours start when you activate it.${trialCorrecting ? ' The previous key is no longer valid.' : ''}`)
      V.goTabAcct()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Trial key could not be requested.'
      if (!trialCorrecting && message.includes('already been requested')) {
        setTrialSent(true)
        setTrialOpen(false)
        setTrialNotice('A trial key was already requested for this email or device. Check the original email, then enter the key in Account.')
        setLicenseStepNotice('A trial key was already requested. Check your original email and paste that key below.')
        V.goTabAcct()
      } else setTrialNotice(message)
    } finally { setTrialBusy(false) }
  }
  const tabs = [
    ['plan', 'Usage', V.goTabPlan],
    ['pay', 'Payment', V.goTabPay],
    ['inv', 'Invoices', V.goTabInv],
    ['acct', 'Account', V.goTabAcct],
    ['team', 'Members', V.goTabTeam],
  ] as const
  const lookups = [
    ['Email lookups', V.usedEmailLookups, V.meterEmail],
    ['Phone lookups', V.usedPhoneLookups, V.meterPhone],
    ['Social lookups', V.usedSocialLookups, V.meterSocial],
    ['Decision-maker lookups', V.usedDmLookups, V.meterDm],
  ] as const
  const decisionPlanSupported = billing.decisionMaker?.available !== false && billing.decisionMaker?.amount === 300 && billing.decisionMaker.interval === 'month' && billing.decisionMaker.monthlyLimit === 1000
  const decisionActive = Boolean(decisionPlanSupported && billing.decisionMaker?.active)
  return <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
    {licenseNotice && <div data-license-notice="1" role={licenseNotice.kind === 'error' ? 'alert' : 'status'} style={{ position: 'fixed', top: '20px', right: '20px', zIndex: 220, display: 'flex', alignItems: 'flex-start', gap: '12px', width: 'min(400px,calc(100vw - 40px))', padding: '14px 16px', borderRadius: '16px', background: licenseNotice.kind === 'error' ? '#F9E8E5' : '#E7EFE2', border: `1px solid ${licenseNotice.kind === 'error' ? '#D78278' : '#9DB58D'}`, color: '#1C1C1C', boxShadow: '0 18px 44px -22px rgba(28,28,28,.55)', fontSize: '13px', lineHeight: 1.5 }}>
      <strong style={{ flex: 1 }}>{licenseNotice.message}</strong><button type="button" aria-label="Dismiss license notice" onClick={() => setLicenseNotice(null)} style={{ border: 0, background: 'transparent', font: 'inherit', cursor: 'pointer', lineHeight: 1 }}>×</button>
    </div>}
    <header>
      <h1 style={{ margin: 0, fontSize: '32px', fontWeight: 400 }}>Workspace &amp; Settings</h1>
      <p style={{ ...muted, margin: '7px 0 0' }}>{V.workspaceName} · local workspace on this device</p>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '12px' }}><span data-billing-status="1" style={muted}>{billing.connected ? `Stripe ${billing.mode} mode connected` : billing.message}</span><button type="button" onClick={() => void refreshBilling()} style={button}>Refresh billing</button></div>
      {billingError && <p role="status" style={muted}>{billingError}</p>}
    </header>
    <div data-settings="1" style={{ display: 'grid', gridTemplateColumns: 'minmax(170px,220px) minmax(0,1fr)', gap: '16px', alignItems: 'start' }}>
      <nav data-tabs="1" data-active={V.activeTab} aria-label="Settings sections" style={{ ...card, padding: '12px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
        {tabs.map(([id, label, click]) => <button key={id} data-stab={id} type="button" onClick={click} aria-current={V.activeTab === id ? 'page' : undefined} style={{ ...button, textAlign: 'left', borderRadius: '12px', background: V.activeTab === id ? '#DDE3D6' : 'transparent' }}>{label}</button>)}
      </nav>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', minWidth: 0 }}>
        {V.tabPlan && <>
          {billing.connected && billing.lifetime && <section data-card="1" style={card}>
            <h2 style={{ margin: 0, fontSize: '19px', fontWeight: 500 }}>MamaLead billing</h2>
            <p style={muted}>Prices and purchase status are verified with Stripe{billing.mode === 'test' ? ' test mode' : ''}.</p>
            <div style={row}><span style={{ flex: 1 }}>Lifetime · core features · one-time</span><strong>{money(billing.lifetime.amount, billing.lifetime.currency)}</strong><span>{billing.lifetime.active ? 'Purchased' : 'Not purchased'}</span>{!billing.lifetime.active && <form onSubmit={(event) => { event.preventDefault(); void startLifetimeCheckout() }} style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}><input aria-label="Email for lifetime key" type="email" autoComplete="email" required value={lifetimeEmail} onChange={(event) => setLifetimeEmail(event.target.value)} placeholder="Email for lifetime key" style={{ padding: '9px 12px', border: '1px solid #CBD2C6', borderRadius: '10px', background: '#FFFFFF', font: 'inherit' }} /><button type="submit" disabled={billingBusy || !billingApi || V.lifetimeCheckoutPending} style={button}>{V.lifetimeCheckoutPending ? 'Waiting for payment…' : 'Buy Lifetime'}</button></form>}</div>
            <div style={row}><span style={{ flex: 1 }}>Decision Makers · 1,000 leads each month</span><strong>$3/month</strong><span>{decisionActive ? `${billing.decisionMaker!.monthlyRemaining} left this month` : !decisionPlanSupported ? 'Server update pending' : 'Not subscribed'}</span>{!decisionActive && <button type="button" disabled={billingBusy || !billingApi || !decisionPlanSupported || billing.license?.kind !== 'lifetime' || !billing.license?.active} onClick={() => void startDecisionCheckout()} style={button}>Subscribe</button>}</div>
            {decisionActive && billing.decisionMaker?.renewsAt && <p style={muted}>Decision Makers renews {new Date(billing.decisionMaker.renewsAt).toLocaleDateString()}.</p>}
            <div style={row}><span style={{ flex: 1 }}>1-day trial · core features</span><strong>Free</strong>{billing.trial?.active ? <span>Active until {new Date(billing.trial.expiresAt!).toLocaleString()}</span> : trialSent ? <button type="button" onClick={V.goTabAcct} style={button}>Enter key in Account</button> : <button type="button" data-trial-open="1" disabled={trialBusy} onClick={() => setTrialOpen(true)} style={button}>Get 1-day trial key</button>}</div>
            {!billing.trial?.active && <p style={{ ...muted, margin: '4px 0 0' }}>Enter your email, receive a trial key, then activate it in Account. The 24 hours start at activation.</p>}
            {!billing.trial?.active && trialOpen && (!trialSent || trialCorrecting) && <form data-trial-form="1" onSubmit={(event) => { event.preventDefault(); void requestTrial() }} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'end', gap: '10px', marginTop: '12px' }}>
              <label htmlFor="desktop-trial-email" style={{ display: 'flex', flex: '1 1 240px', flexDirection: 'column', gap: '6px', fontSize: '13px' }}>{trialCorrecting ? 'Correct email for your trial key' : 'Email for your trial key'}<input id="desktop-trial-email" ref={trialEmailInput} type="email" autoComplete="email" required value={trialEmail} onChange={(event) => setTrialEmail(event.target.value)} placeholder="you@example.com" style={{ padding: '10px', border: '1px solid #CBD2C6', borderRadius: '10px', background: '#FFFFFF', font: 'inherit' }} /></label>
              <button type="submit" disabled={trialBusy} style={button}>{trialBusy ? 'Sending…' : trialCorrecting ? 'Send replacement key' : 'Email my 1-day key'}</button>
            </form>}
            {trialNotice && <p data-trial-notice="1" role="status" style={{ ...muted, margin: '10px 0 0' }}>{trialNotice}</p>}
          </section>}
          <section data-card="1" style={{ ...card, background: 'linear-gradient(160deg,#E9EDE4,#CBD8BC)' }}>
            <h2 style={{ margin: 0, fontSize: '21px', fontWeight: 500 }}>Local usage</h2>
            <p style={muted}>{V.planSummary}</p>
            <p style={{ margin: '8px 0' }}><strong>{V.usedScrapes.toLocaleString('en-GB')}</strong> of <strong>{V.scrapeLimit}</strong> Maps scrapes</p>
            <div style={{ height: '10px', borderRadius: '8px', background: '#E4E6E1' }}><span style={{ display: 'block', width: V.meterScrapes, height: '100%', borderRadius: '8px', background: '#1C1C1C' }} /></div>
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
          <section data-card="1" style={card}>
            <h2 style={{ margin: 0, fontSize: '19px', fontWeight: 500 }}>Nafran license</h2>
            <p style={muted}>{billing.license?.active ? `${billing.license.kind === 'trial' ? '1-day trial' : 'Lifetime license'} active on this machine${billing.license.expiresAt ? ` until ${new Date(billing.license.expiresAt).toLocaleString()}` : ''}${billing.license.last4 ? ` · ending ${billing.license.last4}` : ''}${billing.license.email ? ` · ${billing.license.email}` : ''}.` : 'Paste the trial or lifetime key from your email to unlock this machine.'}</p>
            {(licenseStepNotice || V.licenseNextStep) && <p data-license-next-step="1" role="status" style={{ ...muted, margin: '10px 0', color: '#315F2D' }}>{licenseStepNotice || V.licenseNextStep}</p>}
            {trialSent && !trialCorrectionUsed && !billing.trial?.active && <button type="button" data-trial-change-email="1" onClick={() => { setTrialCorrecting(true); setTrialOpen(true); setTrialNotice(''); V.goTabPlan() }} style={{ ...button, marginBottom: '10px' }}>Wrong email? Change it</button>}
            <form onSubmit={(event) => { event.preventDefault(); void activateLicense() }} style={row}><label htmlFor="nafran-license-key">License key</label><input id="nafran-license-key" ref={licenseKeyInput} type="password" value={licenseKey} onChange={(event) => { setLicenseKey(event.target.value); setLicenseNotice(null) }} autoComplete="off" placeholder="NF-XXXX-XXXX-…" style={{ flex: '1 1 280px', minWidth: 0, padding: '10px', border: 0, borderRadius: '10px', background: '#EAEAE8' }} /><button type="submit" disabled={licenseBusy} style={button}>{licenseBusy ? 'Activating…' : 'Activate'}</button></form>
          </section>
          <section data-card="1" style={card}>
            <h2 style={{ margin: 0, fontSize: '19px', fontWeight: 500 }}>Local account</h2>
            <div style={row}><span>Workspace name</span><strong style={{ marginLeft: 'auto' }}>{V.workspaceName}</strong></div>
            <div style={row}><span>Time zone</span><strong style={{ marginLeft: 'auto' }}>{V.localTimeZone}</strong></div>
            <div style={row}><span>Data location</span><span style={{ marginLeft: 'auto', overflowWrap: 'anywhere' }}>{V.localDataPath}</span></div>
            <div style={row}><span>Session</span><span style={{ marginLeft: 'auto' }}>Local workspace on this device</span></div>
          </section>
          <section data-card="1" style={card}>
            <h2 style={{ margin: 0, fontSize: '19px', fontWeight: 500 }}>Enrichment keys</h2>
            <div style={row}><label htmlFor="deep-key">DataForSEO key</label><span>{V.deepKeyLabel}</span><input id="deep-key" data-deepkey="1" type="password" aria-label="DataForSEO API key" value={V.deepKeyDraft} onInput={V.onDeepKeyInput} autoComplete="off" style={{ width: '100%', padding: '10px', border: 0, borderRadius: '10px', background: '#EAEAE8' }} /><button data-deepsave="1" type="button" onClick={V.saveDeepKey} style={button}>Save</button><button data-deeptest="1" type="button" onClick={V.testDeepKey} style={button}>Test</button><span data-deepnote="1" style={muted}>{V.deepKeyNote}</span></div>
            <div style={row}><span>LeadsAngel SMTP licence</span><span data-leadsangel-status="1">{V.leadsAngelLabel}</span><button data-leadsangel-import="1" type="button" onClick={V.importLeadsAngelZip} style={button}>Import ZIP</button>{V.leadsAngelConfigured && <button data-leadsangel-remove="1" type="button" onClick={V.removeLeadsAngel} style={button}>Remove</button>}</div>
          </section>
          <section data-card="1" data-assist-settings="1" style={card}>
            <h2 style={{ margin: 0, fontSize: '19px', fontWeight: 500 }}>Nafran Assist</h2>
            <p style={muted}>{assistConfigured ? 'AI key configured on this device.' : 'Add a Cerebras API key to enable AI answers on this device.'} Each installation needs its own key.</p>
            <div style={row}>
              <label htmlFor="nafran-assist-key">Cerebras API key</label>
              <input id="nafran-assist-key" type="password" value={assistKey} onChange={(event) => setAssistKey(event.target.value)} autoComplete="off" placeholder="Paste your key" style={{ flex: '1 1 250px', minWidth: 0, padding: '10px', border: 0, borderRadius: '10px', background: '#EAEAE8' }} />
              <button type="button" disabled={assistBusy || !assistKey.trim()} onClick={() => void saveAssistKey()} style={button}>Save key</button>
              <button type="button" disabled={assistBusy || !assistConfigured} onClick={() => void testAssist()} style={button}>Test connection</button>
              {assistConfigured && <button type="button" disabled={assistBusy} onClick={() => void removeAssistKey()} style={button}>Remove key</button>}
            </div>
            {assistNote && <p data-assist-settings-note="1" role="status" style={muted}>{assistNote}</p>}
          </section>
          <section data-card="1" style={card}><h2 style={{ margin: 0, fontSize: '19px', fontWeight: 500 }}>App updates</h2><p style={muted}>{V.updateMessage}</p>{V.updateVersion && <p style={muted}>Version {V.updateVersion}</p>}<button type="button" onClick={V.runUpdateAction} disabled={V.updateActionDisabled === '1'} style={button}>{V.updateActionLabel}</button></section>
          <section data-card="1" style={card}><h2 style={{ margin: 0, fontSize: '19px', fontWeight: 500 }}>Your data</h2><p style={muted}>Export your saved leads and lists from this device.</p><button type="button" onClick={V.openExpAll} style={button}>Export everything</button></section>
        </>}
        {V.tabTeam && <section data-card="1" style={card}>
          <h2 style={{ margin: 0, fontSize: '19px', fontWeight: 500 }}>Local members</h2>
          <p style={muted}>These records are stored in this workspace. Invitations and remote access are not available in this local app.</p>
          <div data-workspace-members="1"><strong>{V.workspaceMembers.length} recorded members</strong><ul style={{ listStyle: 'none', padding: 0, margin: '12px 0 0' }}>{V.workspaceMembers.map((member) => <li key={member.user_id} style={row}><span>{member.user_id === 'local' ? 'Local owner' : member.user_id}</span><span style={{ marginLeft: 'auto' }}>{member.role}</span></li>)}</ul></div>
        </section>}
      </div>
    </div>
  </div>
}
