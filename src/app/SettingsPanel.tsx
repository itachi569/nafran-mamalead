import { useCallback, useEffect, useState } from 'react'
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
  const [billing, setBilling] = useState<BillingStatus>({ configured: false, connected: false, message: 'Checking Stripe billing…' })
  const [invoices, setInvoices] = useState<BillingInvoice[]>([])
  const [billingBusy, setBillingBusy] = useState(false)
  const [billingError, setBillingError] = useState('')
  const [licenseKey, setLicenseKey] = useState('')
  const [licenseBusy, setLicenseBusy] = useState(false)
  const refreshBilling = useCallback(async () => {
    setBillingError('')
    if (!billingApi) return setBilling({ configured: false, connected: false, message: 'Desktop billing bridge is unavailable.' })
    try { setBilling(await billingApi.status()) }
    catch (error) { setBilling({ configured: true, connected: false, message: error instanceof Error ? error.message : 'Billing status could not be loaded.' }) }
  }, [billingApi])
  useEffect(() => { void refreshBilling() }, [refreshBilling])
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
  const activateLicense = async () => {
    if (!billingApi) return
    setLicenseBusy(true)
    setBillingError('')
    try {
      await billingApi.activate(licenseKey)
      setLicenseKey('')
      await refreshBilling()
      setBillingError('License activated on this machine.')
    } catch (error) { setBillingError(error instanceof Error ? error.message : 'License could not be activated.') }
    finally { setLicenseBusy(false) }
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
  return <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
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
            <div style={row}><span style={{ flex: 1 }}>Lifetime · all built-in features · one-time</span><strong>{money(billing.lifetime.amount, billing.lifetime.currency)}</strong><span>{billing.lifetime.active ? 'Purchased' : 'Not purchased'}</span>{!billing.lifetime.active && <button type="button" disabled={billingBusy || !billingApi} onClick={() => void openBilling(() => billingApi!.checkout('lifetime'))} style={button}>Buy Lifetime</button>}</div>
            <div style={row}><span style={{ flex: 1 }}>1-day trial · all built-in features</span><strong>Free</strong><span>{billing.trial?.active ? `Active until ${new Date(billing.trial.expiresAt!).toLocaleString()}` : 'Enter a trial key in Account'}</span></div>
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
            <div style={row}><label htmlFor="nafran-license-key">License key</label><input id="nafran-license-key" type="password" value={licenseKey} onChange={(event) => setLicenseKey(event.target.value)} autoComplete="off" placeholder="NF-XXXX-XXXX-…" style={{ flex: '1 1 280px', minWidth: 0, padding: '10px', border: 0, borderRadius: '10px', background: '#EAEAE8' }} /><button type="button" disabled={licenseBusy || !licenseKey.trim() || !billingApi} onClick={() => void activateLicense()} style={button}>{licenseBusy ? 'Activating…' : 'Activate'}</button></div>
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
