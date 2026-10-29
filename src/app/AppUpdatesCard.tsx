import type { AppValues } from './useAppValues'

export function AppUpdatesCard({V}:{V:AppValues}) {
  const downloading=V.updateState==='downloading'
  const ready=V.updateState==='ready'
  return <section data-card="1" className="app-updates" id="app-updates">
    <div className="app-updates-heading">
      <div><p className="app-updates-eyebrow">KEEP MAMALEAD UP TO DATE</p><h2>App updates</h2></div>
      <span className="app-updates-version">{V.appVersion}</span>
    </div>
    <div className="app-updates-toggle-row">
      <div><h3 id="auto-updates-label">Automatic updates</h3><p id="auto-updates-description">Download new versions in the background. Install when you close MamaLead, or restart when you’re ready.</p></div>
      <button type="button" role="switch" aria-labelledby="auto-updates-label" aria-describedby="auto-updates-description" aria-checked={Boolean(V.autoUpdatesEnabled)} disabled={!V.updateSupported || V.updatePreferenceSaving} onClick={V.toggleAutoUpdates} className="app-updates-switch"><span /></button>
    </div>
    <p className="app-updates-reminder">You’ll be notified about new releases even when automatic updates are off. Your saved leads and settings stay on this device.</p>
    <div className={`app-updates-status${ready?' is-ready':''}`} role="status" aria-live="polite">
      <span className="app-updates-status-dot" aria-hidden="true"/><span>{V.updateMessage}</span>
    </div>
    {downloading && <div className="app-updates-progress" role="progressbar" aria-label="Update download" aria-valuemin={0} aria-valuemax={100} aria-valuenow={V.updatePercent}><span style={{width:`${V.updatePercent}%`}}/></div>}
    <div className="app-updates-actions">
      <div>{V.updateVersion && <strong>New version · {V.updateVersion}</strong>}<small>{V.updateLastChecked?`Last checked ${V.updateLastChecked}`:'Checks automatically when you open MamaLead and every 4 hours while it is open.'}</small></div>
      <button type="button" onClick={V.runUpdateAction} disabled={V.updateActionDisabled==='1'} className="app-updates-action">{V.updateActionLabel}</button>
    </div>
  </section>
}
