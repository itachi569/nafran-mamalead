import { useCallback, useEffect, useRef, useState } from 'react'
import type { AppValues } from './useAppValues'
import type { DesktopApi } from '../types/desktop'
import './settings.css'
import './account-settings.css'
import { AppUpdatesCard } from './AppUpdatesCard'
import { InvoicesPanel } from './InvoicesPanel'
import { PaymentPanel } from './PaymentPanel'

type BillingStatus = Awaited<ReturnType<DesktopApi['billing']['status']>>

const card = { padding: '22px 24px', borderRadius: '22px', background: '#F5F5F4' } as const
const muted = { color: '#5A5F5C', fontSize: '13px', lineHeight: 1.5 } as const
const button = { border: 0, borderRadius: '999px', padding: '9px 15px', background: '#E5E5E5', color: '#1C1C1C', fontFamily: 'inherit', cursor: 'pointer' } as const

export function SettingsPanel({ V }: { V: AppValues }) {
  const tabScroll=useRef<Record<string,number>>({})
  const switchTab=(click:()=>void,id:string)=>{tabScroll.current[V.activeTab]=window.scrollY;click();requestAnimationFrame(()=>window.scrollTo({top:tabScroll.current[id] ?? (document.querySelector('.settings-header')?.getBoundingClientRect().top ?? 0)+window.scrollY,behavior:'instant'}))}
  const billingApi = window.desktop?.billing
  const [billing, setBilling] = useState<BillingStatus>({ configured: false, connected: false, message: 'Checking Stripe billing…' })
  const [billingRefreshing, setBillingRefreshing] = useState(false)
  const [billingRevision, setBillingRevision] = useState(0)
  const [billingBusy, setBillingBusy] = useState(false)
  const [billingError, setBillingError] = useState('')
  const [licenseStepNotice, setLicenseStepNotice] = useState('')
  const [validityInfo,setValidityInfo]=useState<Awaited<ReturnType<DesktopApi['emailValidity']['status']>>|null>(null)
  useEffect(()=>{if(V.tabAcct)void window.desktop?.emailValidity.status().then(setValidityInfo).catch(()=>undefined)},[V.tabAcct])
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
    // Billing cards arrive asynchronously. Keep the requested destination until it exists.
    const section = document.getElementById(`${jump.target}-section`)
    if (!section) return
    const timer = window.setTimeout(() => {
      section.scrollIntoView({behavior:'smooth',block:jump.target === 'lifetime' ? 'start' : 'center'})
      const focus = jump.target === 'license' ? licenseKeyInput.current : section.querySelector<HTMLElement>('button') ?? section
      focus?.focus({preventScroll:true})
      V.clearBillingJump()
    },150)
    return () => window.clearTimeout(timer)
  },[V.billingJump,V.tabPlan,V.tabAcct,V.clearBillingJump,billing.connected,billing.lifetime])
  const refreshBilling = useCallback(async () => {
    setBillingError('')
    if (!billingApi) return setBilling({ configured: false, connected: false, message: 'Desktop billing bridge is unavailable.' })
    setBillingRefreshing(true)
    try {
      const status = await billingApi.status()
      setBilling(status)
      setBillingRevision(value => value + 1)
      window.dispatchEvent(new Event('nafran:billing-updated'))
      return status
    }
    catch (error) { setBilling({ configured: true, connected: false, message: error instanceof Error ? error.message : 'Billing status could not be loaded.' }) }
    finally { setBillingRefreshing(false) }
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
  const openBilling = async (action: () => Promise<{ opened: boolean }>) => {
    setBillingBusy(true)
    setBillingError('')
    try { await action(); setBillingError('Stripe opened in your browser. Refresh billing here after you return.') }
    catch (error) { setBillingError(error instanceof Error ? error.message : 'Stripe could not be opened.') }
    finally { setBillingBusy(false) }
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
    if (changeKey && activeLicense && !window.confirm('Replace the active license on this device? Your existing access stays active unless the new key is accepted.')) return
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
  const tabs = [
    ['plan', 'Usage', V.goTabPlan, 'Leads, runs and lookups'],
    ['pay', 'Payment', V.goTabPay, 'Payments and Stripe'],
    ['inv', 'Invoices', V.goTabInv, 'Receipts to download'],
    ['acct', 'Account', V.goTabAcct, 'License and support'],
  ] as const
  const lookups = [
    ['Email lookups', V.usedEmailLookups, V.meterEmail],
    ['Phone lookups', V.usedPhoneLookups, V.meterPhone],
    ['Social lookups', V.usedSocialLookups, V.meterSocial],
  ] as const
  const lifetimeActive=Boolean(billing.lifetime?.active || (billing.license?.active && billing.license.kind==='lifetime'))
  const activeLicense=Boolean(billing.coreLicenseActive && billing.license?.active)
  return <div className="settings-page">
    {licenseNotice && <div data-license-notice="1" role={licenseNotice.kind === 'error' ? 'alert' : 'status'} style={{ position: 'fixed', top: '20px', right: '20px', zIndex: 220, display: 'flex', alignItems: 'flex-start', gap: '12px', width: 'min(400px,calc(100vw - 40px))', padding: '14px 16px', borderRadius: '16px', background: licenseNotice.kind === 'error' ? '#F9E8E5' : '#E7EFE2', border: `1px solid ${licenseNotice.kind === 'error' ? '#D78278' : '#9DB58D'}`, color: '#1C1C1C', boxShadow: '0 18px 44px -22px rgba(28,28,28,.55)', fontSize: '13px', lineHeight: 1.5 }}>
      <strong style={{ flex: 1 }}>{licenseNotice.message}</strong><button type="button" aria-label="Dismiss license notice" onClick={() => setLicenseNotice(null)} style={{ border: 0, background: 'transparent', font: 'inherit', cursor: 'pointer', lineHeight: 1 }}>×</button>
    </div>}
    <header className="settings-header">
      <div className="settings-heading"><h1>Workspace &amp; Settings</h1><p>{V.workspaceName} · local workspace on this device</p></div>
      <div className="settings-header-status"><span className={`settings-connection-dot${billing.connected ? ' is-connected' : ''}`} aria-hidden="true"/><span data-billing-status="1">{billing.connected ? `Stripe ${billing.mode ? `${billing.mode} mode ` : ''}connected` : billing.message}</span><button type="button" disabled={billingRefreshing} onClick={() => void refreshBilling()}><svg className={billingRefreshing ? 'settings-spin' : undefined} viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4.5v4h-4"/></svg>{billingRefreshing ? 'Refreshing…' : 'Refresh billing'}</button></div>
      {billingError && <p className="settings-billing-message" role="status">{billingError}</p>}
    </header>
    <div data-settings="1" className="settings-layout">
      <nav data-tabs="1" data-active={V.activeTab} aria-label="Settings sections" className="settings-tabs">
        {tabs.map(([id, label, click, hint]) => <button key={id} data-stab={id} type="button" aria-label={label} onClick={()=>switchTab(click,id)} aria-current={V.activeTab === id ? 'page' : undefined}><span className="settings-tab-dot" aria-hidden="true"/><span><span className="settings-tab-label">{label}</span><small>{hint}</small></span></button>)}
      </nav>
      <div className="settings-content">
        {V.tabPlan && <>
          {!lifetimeActive && <section data-website-access="1" className="account-surface">
            <h2>Get started on mamalead.com</h2>
            <p>Get your free 1-day trial or buy Lifetime access on our website. We email your key; paste it in Account to activate this device.</p>
            <div className="account-license-actions">
              <span id="trial-section"><button type="button" onClick={V.startTrial}>Get 1-day trial ↗</button></span>
              <span id="lifetime-section"><button type="button" onClick={V.getLifetimeKey}>Get Lifetime ↗</button></span>
              <button type="button" onClick={V.activateExistingKey}>I already have a key</button>
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
        {V.tabPay && <PaymentPanel billing={billing} revision={billingRevision} busy={billingBusy || !billingApi} onPortal={() => { if (billingApi) void openBilling(() => billingApi.portal()) }} onAccount={V.goTabAcct} onInvoices={V.goTabInv}/>}
        {V.tabInv && <InvoicesPanel billing={billing} revision={billingRevision} refreshing={billingRefreshing} onRefresh={() => void refreshBilling()} onSupport={message => V.openSupport({category:'licence',message})}/>}
        {V.tabAcct && <>
          <section id="license-section" className="account-license" aria-labelledby="account-license-title">
            <div className="account-license-top"><div><p className="account-eyebrow">MamaLead license</p><h2 id="account-license-title">{activeLicense ? billing.license?.kind === 'trial' ? '1-day trial' : 'Lifetime' : 'Activate MamaLead'}</h2></div><span className={`account-license-badge${activeLicense ? ' is-active' : ''}`}><span aria-hidden="true"/>{activeLicense ? 'Active on this machine' : billingRefreshing ? 'Checking license…' : billing.connected ? 'Activation needed' : 'Status unavailable'}</span></div>
            {activeLicense && billing.license?.last4 && <div className="account-masked-key" aria-label={`License key ending ${billing.license.last4}`}>NF-••••-••••-{billing.license.last4}</div>}
            <p className="account-license-description">{activeLicense ? `${billing.license?.kind === 'trial' ? '1-day trial' : 'Lifetime license'} active on this machine${billing.license?.expiresAt ? ` until ${new Date(billing.license.expiresAt).toLocaleString()}` : ''}${billing.license?.last4 ? ` · ending ${billing.license.last4}` : ''}${billing.license?.email ? ` · ${billing.license.email}` : ''}.` : 'Paste a trial or lifetime key from your email to unlock this machine.'}</p>
            {(licenseStepNotice || V.licenseNextStep) && <p data-license-next-step="1" role="status" className="account-license-note">{licenseStepNotice || V.licenseNextStep}</p>}
            <div className="account-license-actions">
              {activeLicense && !changeKey && <button type="button" onClick={()=>setChangeKey(true)}>Use a different key</button>}
              {changeKey && <button type="button" disabled={licenseBusy} onClick={()=>{setChangeKey(false);setLicenseKey('');setShowKey(false);setLicenseNotice(null)}}>Cancel key change</button>}
            </div>
            {(!activeLicense || changeKey) && <form className="account-license-form" onSubmit={(event) => { event.preventDefault(); if (!licenseBusy) void activateLicense() }}><label htmlFor="nafran-license-key">{changeKey ? 'New license key' : 'License key'}</label><div className="account-key-entry"><input id="nafran-license-key" ref={licenseKeyInput} type={showKey ? 'text' : 'password'} disabled={licenseBusy} value={licenseKey} onChange={(event) => { setLicenseKey(event.target.value.toUpperCase().replace(/\s/g,'')); setLicenseNotice(null) }} autoComplete="off" spellCheck={false} placeholder="NF-XXXX-XXXX-…" aria-describedby="account-key-help"/><button type="button" aria-pressed={showKey} onClick={()=>setShowKey(value=>!value)}>{showKey?'Hide key':'Show key'}</button><button className="account-activate" type="submit" disabled={licenseBusy}>{licenseBusy ? 'Activating…' : 'Activate'}</button></div><p id="account-key-help">{changeKey && activeLicense ? 'Your current access stays active until the new key is accepted.' : 'Paste the complete key from your email. Your trial starts when you activate it.'}</p></form>}
            {licenseNotice?.kind==='error' && <p className="account-key-error" role="alert">{licenseNotice.message} <button type="button" onClick={()=>V.openSupport({category:'licence',message:'Activation failed: '+licenseNotice.message})}>Contact support</button></p>}
          </section>
          <section id="help-support" className="account-support account-surface"><div><h2>Help &amp; support</h2><p>Send our team a message about your licence, a problem or an idea.</p></div><button type="button" className="account-button" onClick={()=>V.openSupport()}>Contact support</button></section>
          <section className="account-local account-surface">
            <h2>Local account</h2>
            <dl><div><dt>Workspace name</dt><dd>{V.workspaceName}</dd></div><div><dt>Time zone</dt><dd>{V.localTimeZone}</dd></div><div><dt>Data location</dt><dd data-account-data-path="1">{V.localDataPath}</dd></div><div><dt>Session</dt><dd>Local workspace on this device</dd></div></dl>
            {validityInfo?.provider==='local' && <p data-email-check-mode="dns" style={muted}>Basic email check — format, temporary inbox and domain checks are available. Mailbox delivery is not verified; a verification provider is needed for that check.</p>}
          </section>
          <AppUpdatesCard V={V}/>
          <section className="account-support account-surface"><div><h2>Your data</h2><p>Export your saved leads and lists from this device.</p></div><button type="button" onClick={V.openExpAll} className="account-button">Export everything</button></section>
        </>}
      </div>
    </div>
  </div>
}
