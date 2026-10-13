// The reference document still contains a sample billing screen. Keep the generated
// shell, but render the local workspace Settings component and the working search UI.
export function applyReferenceUiOverrides(source) {
  function replaceOnce(oldText, newText) {
    if (!source.includes(oldText)) throw new Error(`reference UI override anchor missing: ${oldText.slice(0, 90)}`)
    source = source.replace(oldText, newText)
  }

  replaceOnce("import type { AppValues } from './useAppValues'", "import type { AppValues } from './useAppValues'\nimport { SettingsPanel } from './SettingsPanel'")

  replaceOnce(
    '<div style={{display: "flex", alignItems: "center", gap: "10px", flex: "1", minWidth: "240px", height: "46px", padding: "0 8px 0 18px", borderRadius: "999px", background: "#E5E5E5"}}>',
    '<div data-global-search-root="1" style={{display: "flex", alignItems: "center", gap: "10px", flex: "1", minWidth: "240px", height: "46px", padding: "0 8px 0 18px", borderRadius: "999px", background: "#E5E5E5", position: "relative", zIndex: 50}}>',
  )
  replaceOnce(
    '<input type="search" placeholder="Search leads, scrapers, runs..." aria-label="Search leads, scrapers, runs" style={{flex: "1", minWidth: "0", height: "100%", border: "0", background: "transparent", fontSize: "14px", color: "#1C1C1C", outline: "none"}} />',
    '<input data-global-search="1" type="search" placeholder="Search leads, scrapers, runs..." aria-label="Search leads, scrapers, runs" role="combobox" aria-expanded={V.globalOpen} aria-controls="global-search-results" value={V.globalQuery} onInput={V.onGlobalInput} onFocus={V.onGlobalFocus} onKeyDown={V.onGlobalKey} style={{flex: "1", minWidth: "0", height: "100%", border: "0", background: "transparent", fontSize: "14px", color: "#1C1C1C", outline: "none"}} />',
  )
  replaceOnce(
    '<span aria-hidden="true" style={{display: "grid", placeItems: "center", height: "26px", padding: "0 9px", borderRadius: "8px", background: "#D7D8D5", color: "#4A4F4B", fontSize: "11.5px", fontWeight: "500", flex: "none"}}>⌘K</span>',
    `<span aria-hidden="true" style={{display: "grid", placeItems: "center", height: "26px", padding: "0 9px", borderRadius: "8px", background: "#D7D8D5", color: "#4A4F4B", fontSize: "11.5px", fontWeight: "500", flex: "none"}}>⌘K</span>
                {V.globalOpen && <div id="global-search-results" data-global-results="1" role="listbox" style={{position: "absolute", top: "calc(100% + 8px)", left: 0, right: 0, maxHeight: "min(440px,60vh)", overflowY: "auto", padding: "8px", borderRadius: "18px", background: "#F5F5F4", boxShadow: "0 20px 48px -25px rgba(28,28,28,.55)"}}>
                  {V.globalResults.length ? V.globalResults.map((result) => <button key={result.key} type="button" role="option" aria-selected={result.active} data-global-result={result.kind.toLowerCase()} onMouseDown={(event) => event.preventDefault()} onClick={result.pick} style={{display: "flex", width: "100%", gap: "12px", alignItems: "center", padding: "10px 12px", border: 0, borderRadius: "11px", background: result.active ? "#DDE3D6" : "transparent", color: "#1C1C1C", fontFamily: "inherit", textAlign: "left", cursor: "pointer"}}>
                    <span style={{minWidth: "54px", fontSize: "10px", fontWeight: 700, color: "#4C554A", textTransform: "uppercase"}}>{result.kind}</span>
                    <span style={{minWidth: 0}}><strong style={{display: "block", fontSize: "13px", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"}}>{result.title}</strong><small style={{display: "block", fontSize: "11px", color: "#5A5F5C"}}>{result.detail}</small></span>
                  </button>) : <p style={{margin: 0, padding: "14px", color: "#5A5F5C", fontSize: "13px"}}>No matching leads, runs or pages.</p>}
                </div>}`,
  )

  const settingsStart = source.indexOf('            {shows(V.isSettings) ? (')
  const settingsEnd = source.indexOf('            {shows(V.gWin) ? (', settingsStart)
  if (settingsStart < 0 || settingsEnd < 0) throw new Error('reference Settings section not found')
  source = source.slice(0, settingsStart) + '            {shows(V.isSettings) ? <SettingsPanel V={V} /> : null}\n' + source.slice(settingsEnd)

  replaceOnce("                        IDLE{' '}", "                        {V.fPhone.scanning ? 'CHECKING' : 'IDLE'}{' '}")
  source = source.replaceAll('<button data-action="Find phones for missing" data-goto="phone"', '<button onClick={V.queuePhone}')
  replaceOnce('background: "#1C1C1C", fontWeight: "500", color: "#F0F0F0", fontSize: "11.5px", textAlign: "center", whiteSpace: "nowrap"}}>Reception</span>', 'background: "#1C1C1C", fontWeight: "500", color: "#F0F0F0", fontSize: "11.5px", textAlign: "center", whiteSpace: "nowrap"}}>Direct line</span>')
  replaceOnce('background: "#EAEAE8", fontWeight: "400", color: "#4A4F4B", fontSize: "11.5px", textAlign: "center", whiteSpace: "nowrap"}}>Reception</span>', 'background: "#EAEAE8", fontWeight: "400", color: "#4A4F4B", fontSize: "11.5px", textAlign: "center", whiteSpace: "nowrap"}}>Missing</span>')
  replaceOnce('                              {shows(p.isMissing) ? (', `                              {shows(p.isMobile) ? (
                                <>
                                <span style={{display: "block", padding: "5px 10px", borderRadius: "999px", background: "#DDE3D6", fontWeight: "500", fontSize: "11.5px", textAlign: "center", whiteSpace: "nowrap"}}>Mobile</span>
                                </>
                              ) : null}
                              {shows(p.isMissing) ? (`)
  replaceOnce('Showing {V.leadsShowing} of {V.leadsOnFileTotal} saved leads', 'Showing {V.leadsShowing} of {V.leadsOnFileTotal} {V.leadsResultLabel}')
  replaceOnce('onClick={rc.pick} data-chip="1" data-on={rc.on}', 'onClick={rc.pick} data-run-chip={rc.label} data-chip="1" data-on={rc.on}')
  replaceOnce('data-action="Nafran" type="button" onClick={V.goSettings} aria-label="Open billing and account settings"', 'type="button" onClick={V.goSettings} aria-label="Open workspace settings"')
  replaceOnce('PRO · {V.sideStatus}', '{V.sideStatus}')
  const footerStart = source.indexOf('            <footer data-status="1"')
  const footerEnd = source.indexOf('            </footer>', footerStart)
  if (footerStart < 0 || footerEnd < 0) throw new Error('reference status footer not found')
  source = source.slice(0, footerStart) + `            <footer data-status="1" style={{display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px", padding: "10px 18px", borderRadius: "999px", background: "#E5E5E5", fontSize: "11.5px", letterSpacing: ".06em", color: "#4A4F4B"}}>
              <span>LOCAL WORKSPACE</span><span aria-hidden="true">·</span><span>{V.sideStatus}</span>
              <span style={{marginLeft: "auto"}}>{V.buildLabel}</span>
            </footer>` + source.slice(footerEnd + '            </footer>'.length)
  return source
}
