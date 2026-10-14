// GENERATED FILE · do not edit by hand.
// Source: .reference/markup.html (the Leads Scraper document bundled by the reference app).
// Regenerate with: node scripts/build-reference-ui.mjs
//
// Every {{ value }} binding resolves against the object returned by useAppValues(), so a
// missing or renamed binding fails the TypeScript build instead of silently rendering wrong.
import { Fragment, type ReactElement } from 'react'
import type { AppValues } from './useAppValues'
import { SettingsPanel } from './SettingsPanel'

/**
 * Whether a section the document guards with a binding is on screen.
 *
 * The document writes a false flag as the string '0' as often as it writes the boolean, and '0' is
 * truthy: without this, every section guarded that way would render at once. A missing or empty
 * binding counts as false too, so an unset value hides its section rather than showing it empty.
 */
function shows(value: unknown): boolean {
  return value !== false && value !== '0' && value !== '' && value != null
}

export function ReferenceApp({ V }: { V: AppValues }): ReactElement {
  // The recent-search callbacks: a chip names its own term, so they are held in a map beside the
  // values instead of the values carrying one action per search that was ever made.
  const socialPicks = V.socialPicks
  return (
    <>
      <div style={{display: "grid", gridTemplateColumns: "minmax(0,1fr)", minHeight: "100vh", padding: "clamp(10px,1.4vw,20px)"}}>
        <div data-shell="1" style={{display: "grid", gridTemplateColumns: "262px minmax(0,1fr)", gap: "clamp(10px,1.2vw,18px)", alignItems: "start"}}>
          <aside data-sidebar="1" style={{position: "sticky", top: "clamp(10px,1.4vw,20px)", display: "flex", flexDirection: "column", gap: "10px"}}>
            <div style={{display: "flex", alignItems: "center", gap: "11px", padding: "8px 6px 4px"}}>
              <span aria-hidden="true" style={{display: "grid", placeItems: "center", width: "34px", height: "34px", borderRadius: "11px", background: "#1C1C1C", color: "#C8D5BB", fontSize: "15px", fontWeight: "700", flex: "none"}}>L</span>
              <div style={{flex: "1", minWidth: "0"}}>
                <div style={{fontSize: "16.5px", fontWeight: "700", letterSpacing: "-.02em", lineHeight: "1.1"}}>Leads Scraper</div>
                <div style={{fontSize: "11px", color: "#555956", letterSpacing: ".02em"}}>{V.appVersion}</div>
              </div>
            </div>
            <div data-account="1" style={{padding: "14px 15px", borderRadius: "18px", background: "#F5F5F4"}}>
              <button type="button" onClick={V.goSettings} aria-label="Open workspace settings" style={{display: "flex", alignItems: "center", gap: "9px", width: "100%", padding: "0", border: "0", background: "transparent", fontFamily: "inherit", textAlign: "left", cursor: "pointer"}}>
                <span aria-hidden="true" style={{display: "grid", placeItems: "center", width: "30px", height: "30px", borderRadius: "10px", background: "#C8D5BB", fontSize: "12.5px", fontWeight: "700", flex: "none"}}>N</span>
                <span style={{flex: "1", minWidth: "0"}}>
                  <span style={{display: "block", fontSize: "13.5px", fontWeight: "500", lineHeight: "1.2"}}>Nafran Leads</span>
                  <span style={{display: "block", marginTop: "2px", fontSize: "10.5px", fontWeight: "500", letterSpacing: ".14em", color: "#555956"}}>{V.sideStatus}</span>
                </span>
                <span data-live="1" data-on={V.liveDot} aria-hidden="true" style={{width: "8px", height: "8px", borderRadius: "999px", flex: "none", animation: "lsPulse 2.4s ease-in-out infinite"}}></span>
              </button>
              <div style={{display: "flex", alignItems: "baseline", gap: "7px", marginTop: "14px"}}>
                <span style={{fontSize: "22px", fontWeight: "700", letterSpacing: "-.03em", lineHeight: "1", fontVariantNumeric: "tabular-nums"}}>{V.scrapeUsed}</span>
                <span style={{fontSize: "11.5px", color: "#555956"}}>of {V.scrapeLimit} Maps scrapes</span>
              </div>
              <div style={{display: "flex", gap: "3px", marginTop: "9px"}}>
                <span style={{flex: V.scrapeUsedFlex, height: "6px", borderRadius: "3px", background: "#1C1C1C"}}></span>
                <span style={{flex: V.scrapeFreeFlex, height: "6px", borderRadius: "3px", background: "#E2E5DE"}}></span>
              </div>
              <div style={{display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", marginTop: "9px", fontSize: "11.5px", color: "#555956"}}>
                <span>{V.sidebarLeads}</span>
                <span>{V.sidebarDays}</span>
              </div>
            </div>
            <nav data-nav="1" data-active={V.activeView} style={{display: "flex", flexDirection: "column", gap: "14px", marginTop: "4px"}}>
              <div style={{display: "flex", flexDirection: "column", gap: "6px"}}>
                <div style={{padding: "0 14px", fontSize: "10.5px", fontWeight: "500", letterSpacing: ".16em", textTransform: "uppercase", color: "#555956"}}>Home</div>
                <button type="button" data-view="dashboard" onClick={V.goDashboard} style={{display: "flex", alignItems: "center", gap: "10px", width: "100%", height: "42px", padding: "0 14px", border: "0", borderRadius: "999px", fontSize: "14px", fontFamily: "inherit", textAlign: "left", cursor: "pointer"}}>
                  <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{flex: "none"}}>
                    <rect x="3.5" y="3.5" width="7" height="7" rx="2"></rect>
                    <rect x="13.5" y="3.5" width="7" height="7" rx="2"></rect>
                    <rect x="3.5" y="13.5" width="7" height="7" rx="2"></rect>
                    <rect x="13.5" y="13.5" width="7" height="7" rx="2"></rect>
                  </svg>
                  <span style={{flex: "1"}}>Dashboard</span>
                  <span data-tail="1" aria-hidden="true" style={{color: "#6C766F"}}>→</span>
                  <span data-arrow="1" aria-hidden="true" style={{placeItems: "center", width: "30px", height: "30px", borderRadius: "999px", fontSize: "12px", flex: "none"}}>↘</span>
                </button>
              </div>
              <div style={{display: "flex", flexDirection: "column", gap: "6px"}}>
                <div style={{padding: "0 14px", fontSize: "10.5px", fontWeight: "500", letterSpacing: ".16em", textTransform: "uppercase", color: "#555956"}}>Scraper</div>
                <button type="button" data-view="maps" onClick={V.goMaps} style={{display: "flex", alignItems: "center", gap: "10px", width: "100%", height: "42px", padding: "0 14px", border: "0", borderRadius: "999px", fontSize: "14px", fontFamily: "inherit", textAlign: "left", cursor: "pointer"}}>
                  <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{flex: "none"}}>
                    <path d="M9 4.5L3.5 6.8v12.7L9 17.2l6 2.3 5.5-2.3V4.5L15 6.8z"></path>
                    <path d="M9 4.5v12.7M15 6.8v12.7"></path>
                  </svg>
                  <span style={{flex: "1"}}>Google Maps</span>
                  <span data-tail="1" aria-hidden="true" style={{color: "#6C766F"}}>→</span>
                  <span data-arrow="1" aria-hidden="true" style={{placeItems: "center", width: "30px", height: "30px", borderRadius: "999px", fontSize: "12px", flex: "none"}}>↘</span>
                </button>
              </div>
              <div style={{display: "flex", flexDirection: "column", gap: "6px"}}>
                <div style={{padding: "0 14px", fontSize: "10.5px", fontWeight: "500", letterSpacing: ".16em", textTransform: "uppercase", color: "#555956"}}>Add-ons</div>
                <button type="button" data-view="social" onClick={V.goSocial} style={{display: "flex", alignItems: "center", gap: "10px", width: "100%", height: "42px", padding: "0 14px", border: "0", borderRadius: "999px", fontSize: "14px", fontFamily: "inherit", textAlign: "left", cursor: "pointer"}}>
                  <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{flex: "none"}}>
                    <circle cx="12" cy="12" r="8.5"></circle>
                    <path d="M3.5 12h17M12 3.5c2.2 2.4 3.3 5.3 3.3 8.5S14.2 18.1 12 20.5c-2.2-2.4-3.3-5.3-3.3-8.5S9.8 5.9 12 3.5z"></path>
                  </svg>
                  <span style={{flex: "1"}}>Social Profiles</span>
                  <span data-addon="1" data-state={V.stSocial} aria-hidden="true" style={{display: "grid", placeItems: "center", height: "18px", flex: "none"}}>
                    <span data-spin="1" style={{width: "14px", height: "14px", borderRadius: "999px", border: "2px solid rgba(124,132,124,.35)", borderTopColor: "currentColor", animation: "lsSpin .8s linear infinite"}}></span>
                  </span>
                  <span data-tail="1" aria-hidden="true" style={{color: "#6C766F"}}>→</span>
                  <span data-arrow="1" aria-hidden="true" style={{placeItems: "center", width: "30px", height: "30px", borderRadius: "999px", fontSize: "12px", flex: "none"}}>↘</span>
                </button>
                <button type="button" data-view="email" onClick={V.goEmail} style={{display: "flex", alignItems: "center", gap: "10px", width: "100%", height: "42px", padding: "0 14px", border: "0", borderRadius: "999px", fontSize: "14px", fontFamily: "inherit", textAlign: "left", cursor: "pointer"}}>
                  <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{flex: "none"}}>
                    <rect x="3.5" y="5.5" width="17" height="13" rx="3"></rect>
                    <path d="M4 7.5l8 5.5 8-5.5"></path>
                  </svg>
                  <span style={{flex: "1"}}>Email Finder</span>
                  <span data-addon="1" data-state={V.stEmail} aria-hidden="true" style={{display: "grid", placeItems: "center", height: "18px", flex: "none"}}>
                    <span data-spin="1" style={{width: "14px", height: "14px", borderRadius: "999px", border: "2px solid rgba(124,132,124,.35)", borderTopColor: "currentColor", animation: "lsSpin .8s linear infinite"}}></span>
                  </span>
                  <span data-tail="1" aria-hidden="true" style={{color: "#6C766F"}}>→</span>
                  <span data-arrow="1" aria-hidden="true" style={{placeItems: "center", width: "30px", height: "30px", borderRadius: "999px", fontSize: "12px", flex: "none"}}>↘</span>
                </button>
                <button type="button" data-view="phone" onClick={V.goPhone} style={{display: "flex", alignItems: "center", gap: "10px", width: "100%", height: "42px", padding: "0 14px", border: "0", borderRadius: "999px", fontSize: "14px", fontFamily: "inherit", textAlign: "left", cursor: "pointer"}}>
                  <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{flex: "none"}}>
                    <path d="M7 3.8l2.6.5 1.2 3.4-2 1.5a11 11 0 0 0 5.9 5.9l1.5-2 3.4 1.2.5 2.6a2 2 0 0 1-2.2 2.3C11.4 18.8 5.2 12.6 4.7 6a2 2 0 0 1 2.3-2.2z"></path>
                  </svg>
                  <span style={{flex: "1"}}>Phone Finder</span>
                  <span data-addon="1" data-state={V.stPhone} aria-hidden="true" style={{display: "grid", placeItems: "center", height: "18px", flex: "none"}}>
                    <span data-spin="1" style={{width: "14px", height: "14px", borderRadius: "999px", border: "2px solid rgba(124,132,124,.35)", borderTopColor: "currentColor", animation: "lsSpin .8s linear infinite"}}></span>
                  </span>
                  <span data-tail="1" aria-hidden="true" style={{color: "#6C766F"}}>→</span>
                  <span data-arrow="1" aria-hidden="true" style={{placeItems: "center", width: "30px", height: "30px", borderRadius: "999px", fontSize: "12px", flex: "none"}}>↘</span>
                </button>
                <button type="button" data-view="dm" onClick={V.goDm} style={{display: "flex", alignItems: "center", gap: "10px", width: "100%", height: "42px", padding: "0 14px", border: "0", borderRadius: "999px", fontSize: "14px", fontFamily: "inherit", textAlign: "left", cursor: "pointer"}}>
                  <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{flex: "none"}}>
                    <circle cx="12" cy="8" r="3.4"></circle>
                    <path d="M5.5 19.5c1-3.1 3.4-4.7 6.5-4.7s5.5 1.6 6.5 4.7"></path>
                  </svg>
                  <span style={{flex: "1"}}>Decision Makers</span>
                  <span data-tail="1" aria-hidden="true" style={{color: "#6C766F"}}>→</span>
                  <span data-arrow="1" aria-hidden="true" style={{placeItems: "center", width: "30px", height: "30px", borderRadius: "999px", fontSize: "12px", flex: "none"}}>↘</span>
                </button>
                <button type="button" data-view="website" onClick={V.goWebsite} style={{display: "flex", alignItems: "center", gap: "10px", width: "100%", height: "42px", padding: "0 14px", border: "0", borderRadius: "999px", fontSize: "14px", fontFamily: "inherit", textAlign: "left", cursor: "pointer"}}>
                  <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{flex: "none"}}>
                    <path d="M9.5 14.5l-2 2a3.5 3.5 0 0 1-5-5l3-3a3.5 3.5 0 0 1 5 0"></path>
                    <path d="M14.5 9.5l2-2a3.5 3.5 0 0 1 5 5l-3 3a3.5 3.5 0 0 1-5 0"></path>
                  </svg>
                  <span style={{flex: "1"}}>Website Lookup</span>
                  <span data-tail="1" aria-hidden="true" style={{color: "#6C766F"}}>→</span>
                  <span data-arrow="1" aria-hidden="true" style={{placeItems: "center", width: "30px", height: "30px", borderRadius: "999px", fontSize: "12px", flex: "none"}}>↘</span>
                </button>
              </div>
              <div style={{display: "flex", flexDirection: "column", gap: "6px"}}>
                <div style={{padding: "0 14px", fontSize: "10.5px", fontWeight: "500", letterSpacing: ".16em", textTransform: "uppercase", color: "#555956"}}>Data</div>
                <button type="button" data-view="leads" onClick={V.goLeads} style={{display: "flex", alignItems: "center", gap: "10px", width: "100%", height: "42px", padding: "0 14px", border: "0", borderRadius: "999px", fontSize: "14px", fontFamily: "inherit", textAlign: "left", cursor: "pointer"}}>
                  <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{flex: "none"}}>
                    <circle cx="9" cy="8" r="3.2"></circle>
                    <path d="M3.5 19c.9-2.9 3-4.4 5.5-4.4s4.6 1.5 5.5 4.4"></path>
                    <path d="M16 6.5a3 3 0 0 1 0 5.6M18 19c-.3-1.6-.9-2.9-1.8-3.8"></path>
                  </svg>
                  <span style={{flex: "1"}}>All Leads</span>
                  <span data-tail="1" aria-hidden="true" style={{color: "#6C766F"}}>→</span>
                  <span data-arrow="1" aria-hidden="true" style={{placeItems: "center", width: "30px", height: "30px", borderRadius: "999px", fontSize: "12px", flex: "none"}}>↘</span>
                </button>
                <button type="button" data-view="lists" onClick={V.goLists} style={{display: "flex", alignItems: "center", gap: "10px", width: "100%", height: "42px", padding: "0 14px", border: "0", borderRadius: "999px", fontSize: "14px", fontFamily: "inherit", textAlign: "left", cursor: "pointer"}}>
                  <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{flex: "none"}}>
                    <path d="M6.5 3.5h11v17l-5.5-3.6-5.5 3.6z"></path>
                  </svg>
                  <span style={{flex: "1"}}>Saved Lists</span>
                  <span data-tail="1" aria-hidden="true" style={{color: "#6C766F"}}>→</span>
                  <span data-arrow="1" aria-hidden="true" style={{placeItems: "center", width: "30px", height: "30px", borderRadius: "999px", fontSize: "12px", flex: "none"}}>↘</span>
                </button>
                <button type="button" data-view="runs" onClick={V.goRuns} style={{display: "flex", alignItems: "center", gap: "10px", width: "100%", height: "42px", padding: "0 14px", border: "0", borderRadius: "999px", fontSize: "14px", fontFamily: "inherit", textAlign: "left", cursor: "pointer"}}>
                  <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{flex: "none"}}>
                    <circle cx="12" cy="12" r="8.5"></circle>
                    <path d="M12 7.5V12l3 1.8"></path>
                  </svg>
                  <span style={{flex: "1"}}>Run History</span>
                  <span data-tail="1" aria-hidden="true" style={{color: "#6C766F"}}>→</span>
                  <span data-arrow="1" aria-hidden="true" style={{placeItems: "center", width: "30px", height: "30px", borderRadius: "999px", fontSize: "12px", flex: "none"}}>↘</span>
                </button>
              </div>
              <div style={{display: "flex", flexDirection: "column", gap: "6px"}}>
                <div style={{padding: "0 14px", fontSize: "10.5px", fontWeight: "500", letterSpacing: ".16em", textTransform: "uppercase", color: "#555956"}}>System</div>
                <button type="button" data-view="settings" onClick={V.goSettings} style={{display: "flex", alignItems: "center", gap: "10px", width: "100%", height: "42px", padding: "0 14px", border: "0", borderRadius: "999px", fontSize: "14px", fontFamily: "inherit", textAlign: "left", cursor: "pointer"}}>
                  <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{flex: "none"}}>
                    <path d="M4 8h9M17 8h3M4 16h3M11 16h9"></path>
                    <circle cx="15" cy="8" r="2.2"></circle>
                    <circle cx="9" cy="16" r="2.2"></circle>
                  </svg>
                  <span style={{flex: "1"}}>Settings</span>
                  <span data-tail="1" aria-hidden="true" style={{color: "#6C766F"}}>→</span>
                  <span data-arrow="1" aria-hidden="true" style={{placeItems: "center", width: "30px", height: "30px", borderRadius: "999px", fontSize: "12px", flex: "none"}}>↘</span>
                </button>
              </div>
            </nav>
            <div style={{padding: "14px 18px", borderRadius: "18px", background: "#1C1C1C", color: "#F0F0F0"}}>
              <div style={{display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px"}}>
                <span style={{display: "flex", alignItems: "center", gap: "8px", fontSize: "13.5px", fontWeight: "500"}}>
                  <span aria-hidden="true" style={{width: "7px", height: "7px", borderRadius: "999px", background: "#C8D5BB", animation: "lsPulse 2.4s ease-in-out infinite"}}></span>
                  {' '}Local · Dev{' '}
                </span>
                <span style={{fontSize: "10px", fontWeight: "500", letterSpacing: ".14em", color: "#C8D5BB"}}>ACTIVE</span>
              </div>
              <p style={{margin: "8px 0 0", fontSize: "12px", lineHeight: "1.5", color: "#9BA29C", textWrap: "pretty"}}>No cloud — all data on your machine</p>
            </div>
            <button type="button" onClick={V.openChat} data-assist="1" style={{display: "flex", alignItems: "center", gap: "10px", width: "100%", padding: "10px 14px 10px 8px", border: "0", borderRadius: "20px", fontFamily: "inherit", textAlign: "left", cursor: "pointer", transition: "background .25s linear,transform .3s cubic-bezier(.22,1,.36,1)"}}>
              <span data-chatlottie="1" aria-hidden="true" style={{display: "block", width: "54px", height: "54px", flex: "none"}}></span>
              <span style={{flex: "1", minWidth: "0"}}>
                <span style={{display: "block", fontSize: "14px", fontWeight: "500"}}>Ask Nafran Assist</span>
                <span style={{display: "block", marginTop: "2px", fontSize: "12px", color: "#5A5F5C"}}>Setup help, or email us</span>
              </span>
              <span aria-hidden="true" style={{fontSize: "13px", color: "#4A4F4B"}}>→</span>
            </button>
          </aside>
          <div style={{display: "flex", flexDirection: "column", gap: "clamp(12px,1.5vw,20px)", minWidth: "0"}}>
            <header style={{display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap"}}>
              <div data-global-search-root="1" style={{display: "flex", alignItems: "center", gap: "10px", flex: "1", minWidth: "240px", height: "46px", padding: "0 8px 0 18px", borderRadius: "999px", background: "#E5E5E5", position: "relative", zIndex: 50}}>
                <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="#3A3D3B" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true" style={{flex: "none"}}>
                  <circle cx="11" cy="11" r="6.5"></circle>
                  <path d="M16 16l4.5 4.5"></path>
                </svg>
                <input data-global-search="1" type="search" placeholder="Search leads, scrapers, runs..." aria-label="Search leads, scrapers, runs" role="combobox" aria-expanded={V.globalOpen} aria-controls="global-search-results" value={V.globalQuery} onInput={V.onGlobalInput} onFocus={V.onGlobalFocus} onKeyDown={V.onGlobalKey} style={{flex: "1", minWidth: "0", height: "100%", border: "0", background: "transparent", fontSize: "14px", color: "#1C1C1C", outline: "none"}} />
                <span aria-hidden="true" style={{display: "grid", placeItems: "center", height: "26px", padding: "0 9px", borderRadius: "8px", background: "#D7D8D5", color: "#4A4F4B", fontSize: "11.5px", fontWeight: "500", flex: "none"}}>⌘K</span>
                {V.globalOpen && <div id="global-search-results" data-global-results="1" role="listbox" style={{position: "absolute", top: "calc(100% + 8px)", left: 0, right: 0, maxHeight: "min(440px,60vh)", overflowY: "auto", padding: "8px", borderRadius: "18px", background: "#F5F5F4", boxShadow: "0 20px 48px -25px rgba(28,28,28,.55)"}}>
                  {V.globalResults.length ? V.globalResults.map((result) => <button key={result.key} type="button" role="option" aria-selected={result.active} data-global-result={result.kind.toLowerCase()} onMouseDown={(event) => event.preventDefault()} onClick={result.pick} style={{display: "flex", width: "100%", gap: "12px", alignItems: "center", padding: "10px 12px", border: 0, borderRadius: "11px", background: result.active ? "#DDE3D6" : "transparent", color: "#1C1C1C", fontFamily: "inherit", textAlign: "left", cursor: "pointer"}}>
                    <span style={{minWidth: "54px", fontSize: "10px", fontWeight: 700, color: "#4C554A", textTransform: "uppercase"}}>{result.kind}</span>
                    <span style={{minWidth: 0}}><strong style={{display: "block", fontSize: "13px", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"}}>{result.title}</strong><small style={{display: "block", fontSize: "11px", color: "#5A5F5C"}}>{result.detail}</small></span>
                  </button>) : <p style={{margin: 0, padding: "14px", color: "#5A5F5C", fontSize: "13px"}}>No matching leads, runs or pages.</p>}
                </div>}
              </div>
              <div style={{display: "flex", alignItems: "center", gap: "8px", position: "relative"}}>
                <button type="button" aria-label={V.themeLabel} data-icon="1" style={{display: "grid", placeItems: "center", width: "46px", height: "46px", border: "0", borderRadius: "999px", background: "#F5F5F4", color: "#1C1C1C", cursor: "pointer", transition: "background .25s linear,color .25s linear"}} data-theme-btn="1" data-on={V.themeOn} onClick={V.toggleTheme} title={V.themeLabel}>
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
                    <circle cx="12" cy="12" r="4"></circle>
                    <path d="M12 2.5v2.6M12 18.9v2.6M4.9 4.9l1.9 1.9M17.2 17.2l1.9 1.9M2.5 12h2.6M18.9 12h2.6M4.9 19.1l1.9-1.9M17.2 6.8l1.9-1.9"></path>
                  </svg>
                </button>
                <button type="button" aria-label="Notifications" data-icon="1" style={{display: "grid", placeItems: "center", width: "46px", height: "46px", border: "0", borderRadius: "999px", background: "#F5F5F4", color: "#1C1C1C", cursor: "pointer", transition: "background .25s linear,color .25s linear", position: "relative"}} data-notifications-button="1" onClick={V.openNotifications} aria-expanded={V.notificationsOpen} aria-controls="notifications-panel">
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M6.5 10a5.5 5.5 0 0 1 11 0c0 4 1.5 5.5 1.5 5.5H5S6.5 14 6.5 10z"></path>
                    <path d="M10 18.5a2.2 2.2 0 0 0 4 0"></path>
                  </svg>
                  {shows(V.unreadNotifications) ? (
                    <>
                    <span data-notifications-badge="1" aria-label={`${V.unreadNotifications} unread notifications`} style={{position: "absolute", top: "-4px", right: "-4px", display: "grid", placeItems: "center", minWidth: "19px", height: "19px", padding: "0 4px", borderRadius: "999px", background: "#A9BC9B", color: "#1C1C1C", fontSize: "10px", fontWeight: "700", lineHeight: "1"}}>{V.unreadNotifications}</span>
                    </>
                  ) : null}
                </button>
                {shows(V.notificationsOpen) ? (
                  <>
                  <section id="notifications-panel" data-notifications-panel="1" aria-label="Notifications" style={{position: "absolute", top: "56px", right: "0", zIndex: "120", width: "min(380px,calc(100vw - 32px))", maxHeight: "min(490px,75vh)", display: "flex", flexDirection: "column", overflow: "hidden", border: "1px solid #E4E5E2", borderRadius: "20px", background: "#F5F5F4", boxShadow: "0 24px 58px -26px rgba(28,28,28,.42)"}}>
                    <div style={{display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", padding: "17px 18px", borderBottom: "1px solid #E4E5E2"}}>
                      <div style={{display: "flex", alignItems: "center", gap: "9px"}}>
                        <button type="button" data-notifications-close="1" aria-label="Back" title="Back to page" onClick={V.closeNotifications} style={{display: "grid", placeItems: "center", width: "30px", height: "30px", padding: "0", border: "0", borderRadius: "999px", background: "#E5E5E5", color: "#1C1C1C", fontFamily: "inherit", fontSize: "17px", lineHeight: "1", cursor: "pointer"}}>←</button>
                        <div>
                          <h2 style={{margin: "0", fontSize: "17px", fontWeight: "600"}}>Notifications</h2>
                          <span style={{fontSize: "11px", color: "#5A5F5C"}}>{V.notificationsCountLabel}</span>
                        </div>
                      </div>
                      {shows(V.unreadNotifications) ? (
                        <>
                        <button type="button" data-notifications-read="1" onClick={V.markNotificationsRead} style={{padding: "7px 10px", border: "0", borderRadius: "999px", background: "#E5E5E5", color: "#1C1C1C", fontFamily: "inherit", fontSize: "11px", cursor: "pointer"}}>Mark all read</button>
                        </>
                      ) : null}
                    </div>
                    {shows(V.notificationsEmpty) ? (
                      <>
                      <p data-notifications-empty="1" style={{margin: "0", padding: "28px 18px", color: "#5A5F5C", fontSize: "13px", lineHeight: "1.5"}}>No notifications yet. Finished scans and lookups will appear here.</p>
                      </>
                    ) : null}
                    <div style={{overflow: "auto", minHeight: "0"}}>
                      {(V.notificationRows ?? []).map((n, __in) => (
                        <Fragment key={__in}>
                          <div data-notification={n.id} data-unread={n.unread} style={{display: "flex", alignItems: "flex-start", gap: "10px", width: "100%", padding: "14px 18px", borderBottom: "1px solid #E4E5E2", background: "transparent", color: "#1C1C1C", fontFamily: "inherit", textAlign: "left"}}>
                            <span aria-hidden="true" data-level={n.level} style={{width: "8px", height: "8px", marginTop: "5px", borderRadius: "999px", background: n.color, flex: "none"}}></span>
                            <span style={{display: "block", minWidth: "0", flex: "1"}}>
                              <strong style={{display: "block", fontSize: "13px", fontWeight: "600", lineHeight: "1.35"}}>{n.title}</strong>
                              <span style={{display: "block", marginTop: "3px", color: "#5A5F5C", fontSize: "12px", lineHeight: "1.45"}}>{n.body}</span>
                              <time dateTime={n.at} style={{display: "block", marginTop: "7px", color: "#6C766F", fontSize: "10.5px"}}>{n.when}</time>
                            </span>
                            {shows(n.unread) ? (
                              <>
                              <span aria-label="Unread" style={{width: "6px", height: "6px", marginTop: "6px", borderRadius: "999px", background: "#6F8060", flex: "none"}}></span>
                              </>
                            ) : null}
                            <button type="button" data-notification-read={n.id} aria-label="Mark notification read" title="Mark as read" onClick={n.read} style={{alignSelf: "flex-start", padding: "3px 6px", border: "0", borderRadius: "6px", background: "transparent", color: "#6C766F", fontFamily: "inherit", fontSize: "10px", cursor: "pointer"}}>Read</button>
                            <button type="button" data-notification-delete={n.id} aria-label={`Delete notification: ${n.title}`} title="Delete notification" onClick={n.remove} style={{alignSelf: "flex-start", padding: "3px 6px", border: "0", borderRadius: "6px", background: "transparent", color: "#A85F59", fontFamily: "inherit", fontSize: "10px", fontWeight: "600", cursor: "pointer"}}>Delete</button>
                          </div>
                        </Fragment>
                      ))}
                    </div>
                  </section>
                  </>
                ) : null}
              </div>
            </header>
            {shows(V.isDashboard) ? (
              <>
              <div style={{display: "flex", flexDirection: "column", gap: "clamp(12px,1.5vw,20px)"}}>
                <div style={{display: "flex", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: "16px"}}>
                  <div>
                    <div style={{display: "flex", alignItems: "center", gap: "12px"}}>
                      <h1 style={{margin: "0", fontSize: "clamp(26px,2.6vw,36px)", lineHeight: "1.1", letterSpacing: "-.03em", fontWeight: "400"}}>Good Afternoon, Nafran</h1>
                      <span style={{padding: "6px 13px", borderRadius: "999px", background: "#E3E4E1", fontSize: "10.5px", fontWeight: "500", letterSpacing: ".14em", color: "#4A4F4B"}}>OVERVIEW</span>
                    </div>
                    <p style={{margin: "8px 0 0", fontSize: "14.5px", color: "#5A5F5C"}}>At-a-glance view of your lead database. Click any card to drill in.</p>
                  </div>
                  <div data-range="1" data-active={V.activeRange} style={{display: "flex", gap: "4px", padding: "4px", borderRadius: "999px", background: "#E5E5E5"}}>
                    <button type="button" data-r="7 Days" aria-pressed={V.activeRange === '7 Days'} onClick={V.set7} style={{padding: "8px 16px", border: "0", borderRadius: "999px", fontSize: "13px", fontWeight: "500", fontFamily: "inherit", cursor: "pointer"}}>7 Days</button>
                    <button type="button" data-r="30 Days" aria-pressed={V.activeRange === '30 Days'} onClick={V.set30} style={{padding: "8px 16px", border: "0", borderRadius: "999px", fontSize: "13px", fontWeight: "500", fontFamily: "inherit", cursor: "pointer"}}>30 Days</button>
                    <button type="button" data-r="All Time" aria-pressed={V.activeRange === 'All Time'} onClick={V.setAll} style={{padding: "8px 16px", border: "0", borderRadius: "999px", fontSize: "13px", fontWeight: "500", fontFamily: "inherit", cursor: "pointer"}}>All Time</button>
                  </div>
                </div>
                <div style={{display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,190px),1fr))", gap: "clamp(12px,1.4vw,20px)", alignItems: "end"}}>
                  <div style={{display: "flex", flexDirection: "column", gap: "8px"}}>
                    <div style={{display: "flex", alignItems: "flex-start", gap: "10px"}}>
                      <span style={{fontSize: "clamp(40px,4vw,54px)", lineHeight: ".9", fontWeight: "700", letterSpacing: "-.04em", backgroundImage: "radial-gradient(circle at 50% 50%,#1C1C1C 1.45px,transparent 1.55px)", backgroundSize: "3.2px 3.2px", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent", WebkitTextFillColor: "transparent", animation: "lsPop .7s cubic-bezier(.22,1,.36,1) both"}}>{V.dashTotal}</span>
                      <span style={{marginLeft: "auto", padding: "5px 11px", borderRadius: "999px", background: "#F5F5F4", fontSize: "11.5px", fontWeight: "500"}}>{V.dashTotalNote}</span>
                    </div>
                    <div style={{fontSize: "13.5px", color: "#4A4F4B"}}>Total Leads</div>
                    <div style={{display: "flex", gap: "4px"}}>
                      <span style={{flex: "1", height: "10px", borderRadius: "5px", background: "#A9BC9B"}}></span>
                      <span style={{flex: "1", height: "10px", borderRadius: "5px", background: "#C8D5BB"}}></span>
                      <span style={{flex: "1", height: "10px", borderRadius: "5px", background: "#C8D5BB"}}></span>
                      <span style={{flex: "1", height: "10px", borderRadius: "5px", background: "#D5DECB"}}></span>
                    </div>
                  </div>
                  <div style={{display: "flex", flexDirection: "column", gap: "8px"}}>
                    <div style={{display: "flex", alignItems: "flex-start", gap: "10px"}}>
                      <span style={{fontSize: "clamp(40px,4vw,54px)", lineHeight: ".9", fontWeight: "700", letterSpacing: "-.04em", backgroundImage: "radial-gradient(circle at 50% 50%,#1C1C1C 1.45px,transparent 1.55px)", backgroundSize: "3.2px 3.2px", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent", WebkitTextFillColor: "transparent", animation: "lsPop .7s cubic-bezier(.22,1,.36,1) both"}}>{V.dashEnriched}</span>
                      <span style={{fontSize: "17px", color: "#5A5F5C", marginTop: "8px"}}>/{V.dashTotal}</span>
                      <span style={{marginLeft: "auto", padding: "5px 11px", borderRadius: "999px", background: "#F5F5F4", fontSize: "11.5px", fontWeight: "500"}}>{V.dashEnrichedPct}</span>
                    </div>
                    <div style={{fontSize: "13.5px", color: "#4A4F4B"}}>Enriched</div>
                    <div style={{display: "flex", gap: "4px"}}>
                      <span style={{flex: "1", height: "10px", borderRadius: "5px", background: "#C8D5BB"}}></span>
                      <span style={{flex: "1", height: "10px", borderRadius: "5px", background: "#D5DECB"}}></span>
                      <span style={{flex: "1", height: "10px", borderRadius: "5px", background: "#E2E5DE"}}></span>
                      <span style={{flex: "1", height: "10px", borderRadius: "5px", background: "#E2E5DE"}}></span>
                    </div>
                  </div>
                  <div style={{display: "flex", flexDirection: "column", gap: "8px"}}>
                    <div style={{display: "flex", alignItems: "flex-start", gap: "10px"}}>
                      <span style={{fontSize: "clamp(40px,4vw,54px)", lineHeight: ".9", fontWeight: "700", letterSpacing: "-.04em", backgroundImage: "radial-gradient(circle at 50% 50%,#1C1C1C 1.45px,transparent 1.55px)", backgroundSize: "3.2px 3.2px", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent", WebkitTextFillColor: "transparent", animation: "lsPop .7s cubic-bezier(.22,1,.36,1) both"}}>{V.dashWithPhone}</span>
                      <span style={{fontSize: "17px", color: "#5A5F5C", marginTop: "8px"}}>/{V.dashTotal}</span>
                      <span style={{marginLeft: "auto", padding: "5px 11px", borderRadius: "999px", background: "#F5F5F4", fontSize: "11.5px", fontWeight: "500"}}>{V.dashPhoneNote}</span>
                    </div>
                    <div style={{fontSize: "13.5px", color: "#4A4F4B"}}>With Phone</div>
                    <div style={{display: "flex", gap: "4px"}}>
                      <span style={{flex: "1", height: "10px", borderRadius: "5px", background: "#A9BC9B"}}></span>
                      <span style={{flex: "1", height: "10px", borderRadius: "5px", background: "#C8D5BB"}}></span>
                      <span style={{flex: "1", height: "10px", borderRadius: "5px", background: "#C8D5BB"}}></span>
                      <span style={{flex: "1", height: "10px", borderRadius: "5px", background: "#E2E5DE"}}></span>
                    </div>
                  </div>
                  <div style={{display: "flex", flexDirection: "column", gap: "8px"}}>
                    <div style={{display: "flex", alignItems: "flex-start", gap: "10px"}}>
                      <span style={{fontSize: "clamp(40px,4vw,54px)", lineHeight: ".9", fontWeight: "700", letterSpacing: "-.04em", backgroundImage: "radial-gradient(circle at 50% 50%,#1C1C1C 1.45px,transparent 1.55px)", backgroundSize: "3.2px 3.2px", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent", WebkitTextFillColor: "transparent", animation: "lsPop .7s cubic-bezier(.22,1,.36,1) both"}}>{V.dashExportReady}</span>
                      <span style={{fontSize: "17px", color: "#5A5F5C", marginTop: "8px"}}>/{V.dashTotal}</span>
                      <span style={{marginLeft: "auto", padding: "5px 11px", borderRadius: "999px", background: "#F5F5F4", fontSize: "11.5px", fontWeight: "500"}}>{V.dashExportNote}</span>
                    </div>
                    <div style={{fontSize: "13.5px", color: "#4A4F4B"}}>Ready to Export</div>
                    <div style={{display: "flex", gap: "4px"}}>
                      <span style={{flex: "1", height: "10px", borderRadius: "5px", background: "#C8D5BB"}}></span>
                      <span style={{flex: "1", height: "10px", borderRadius: "5px", background: "#D5DECB"}}></span>
                      <span style={{flex: "1", height: "10px", borderRadius: "5px", background: "#E2E5DE"}}></span>
                      <span style={{flex: "1", height: "10px", borderRadius: "5px", background: "#E2E5DE"}}></span>
                    </div>
                  </div>
                </div>
                <div data-hero="1" style={{display: "grid", gridTemplateColumns: "minmax(0,1.7fr) minmax(0,1fr)", gap: "clamp(12px,1.4vw,20px)"}}>
                  <section data-card="1" style={{position: "relative", overflow: "hidden", padding: "22px 24px", borderRadius: "22px", background: "linear-gradient(160deg,#E9EDE4 0%,#CBD8BC 100%)", transition: "transform .5s cubic-bezier(.22,1,.36,1),box-shadow .5s linear"}}>
                    <div style={{display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px"}}>
                      <div>
                        <h2 style={{margin: "0", fontSize: "19px", fontWeight: "500", letterSpacing: "-.01em"}}>Scrape Volume</h2>
                        <p data-volume-period="1" style={{margin: "4px 0 0", fontSize: "13.5px", color: "#4C554A"}}>{V.dashVolumeLabel}</p>
                      </div>
                      <span data-open="1" aria-hidden="true" style={{display: "grid", placeItems: "center", width: "36px", height: "36px", borderRadius: "999px", background: "rgba(255,255,255,.6)", fontSize: "14px", flex: "none"}}>↗</span>
                    </div>
                    <div style={{position: "relative", marginTop: "18px"}}>
                      <span style={{position: "absolute", top: "0", left: "36%", display: "inline-flex", alignItems: "center", gap: "6px", padding: "6px 12px", borderRadius: "999px", background: "#1C1C1C", color: "#F0F0F0", fontSize: "11.5px", whiteSpace: "nowrap", zIndex: "2"}}>
                        <strong style={{fontWeight: "700"}}>{V.dashScrapeDelta}</strong>
                        {' '}{V.dashComparisonLabel}
                      </span>
                      <div data-volume-chart="1" style={{position: "relative", height: "clamp(140px,15vw,168px)", marginTop: "30px"}}>
                        {V.dashVolumeEmpty ? <span style={{position: "absolute", inset: "0", display: "grid", placeItems: "center", fontSize: "13px", color: "#4C554A"}}>{V.dashVolumeEmpty}</span> : null}
                        <div style={{position: "absolute", inset: "0", display: "flex", alignItems: "flex-end", gap: "3px"}}>
                          {(V.dashVolumeBars ?? []).map((bar, index) => <span key={index} title={`${bar.leads} leads`} style={{flex: "1", height: bar.height, borderRadius: "3px 3px 0 0", background: "rgba(247,249,245,.9)", transition: "height .25s ease"}} />)}
                        </div>
                      </div>
                    </div>
                    <div style={{display: "flex", flexWrap: "wrap", gap: "8px", marginTop: "14px"}}>
                      <div style={{flex: "1", minWidth: "98px", padding: "12px 14px", borderRadius: "14px", background: "rgba(255,255,255,.55)"}}>
                        <div style={{fontSize: "12px", color: "#4C554A"}}>This week</div>
                        <div style={{fontSize: "16px", fontWeight: "700", marginTop: "2px"}}>{V.dashWeekLeads}</div>
                      </div>
                      <div style={{flex: "1", minWidth: "98px", padding: "12px 14px", borderRadius: "14px", background: "rgba(255,255,255,.55)"}}>
                        <div style={{fontSize: "12px", color: "#4C554A"}}>Best run</div>
                        <div style={{fontSize: "16px", fontWeight: "700", marginTop: "2px"}}>{V.dashBestRun}</div>
                      </div>
                      <div style={{flex: "1", minWidth: "98px", padding: "12px 14px", borderRadius: "14px", background: "rgba(255,255,255,.55)"}}>
                        <div style={{fontSize: "12px", color: "#4C554A"}}>Avg / run</div>
                        <div style={{fontSize: "16px", fontWeight: "700", marginTop: "2px"}}>{V.dashAvgRun}</div>
                      </div>
                    </div>
                  </section>
                  <div style={{display: "grid", gap: "clamp(12px,1.4vw,20px)", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,155px),1fr))"}}>
                    <section data-card="1" style={{padding: "22px", borderRadius: "22px", background: "linear-gradient(180deg,#CBD8BC,#B4C6A2)", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", transition: "transform .5s cubic-bezier(.22,1,.36,1),box-shadow .5s linear"}}>
                      <h2 style={{margin: "0", fontSize: "17px", fontWeight: "500"}}>AI Insights</h2>
                      <span aria-hidden="true" style={{display: "grid", placeItems: "center", width: "128px", height: "128px", margin: "10px 0 8px", borderRadius: "999px", background: "radial-gradient(circle at 50% 42%,#F7F9F5 0%,#EEF2E9 62%,#E2E9DA 100%)", boxShadow: "inset 0 0 0 1px rgba(28,28,28,.07),0 14px 26px -18px rgba(28,28,28,.5)"}}>
                        <span style={{position: "relative", display: "block", width: "104px", height: "104px", overflow: "hidden"}}>
                          <span data-lottie="1" style={{position: "absolute", top: "-6px", left: "-6px", display: "block", width: "116px", height: "116px"}}></span>
                        </span>
                      </span>
                      <p style={{margin: "0", fontSize: "13px", lineHeight: "1.5", color: "#2C332A", textWrap: "pretty"}}>{V.dashInsight}</p>
                    </section>
                    <section data-card="1" style={{padding: "22px", borderRadius: "22px", background: "#F5F5F4", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", transition: "transform .5s cubic-bezier(.22,1,.36,1),box-shadow .5s linear"}}>
                      <h2 style={{margin: "0", fontSize: "17px", fontWeight: "500"}}>Data Quality</h2>
                      <div style={{fontSize: "clamp(52px,5.5vw,74px)", lineHeight: "1", fontWeight: "700", letterSpacing: "-.05em", marginTop: "14px", backgroundImage: "radial-gradient(circle at 50% 50%,#1C1C1C 1.45px,transparent 1.55px)", backgroundSize: "3.2px 3.2px", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent", WebkitTextFillColor: "transparent", animation: "lsPop .7s cubic-bezier(.22,1,.36,1) both"}}>{V.dashQuality}</div>
                      <div style={{width: "64px", height: "1px", background: "#D8DAD6", margin: "10px 0"}}></div>
                      <div style={{fontSize: "20px", fontWeight: "300", color: "#5A5F5C"}}>100</div>
                      <span style={{marginTop: "16px", padding: "8px 18px", borderRadius: "999px", background: "#1C1C1C", color: "#F0F0F0", fontSize: "12.5px", fontWeight: "500"}}>{V.dashQualityLabel}</span>
                    </section>
                  </div>
                </div>
                <div style={{display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,300px),1fr))", gap: "clamp(12px,1.4vw,20px)"}}>
                  <section data-card="1" style={{padding: "22px 24px", borderRadius: "22px", background: "#E9EAE7", transition: "transform .5s cubic-bezier(.22,1,.36,1),box-shadow .5s linear"}}>
                    <div style={{display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px"}}>
                      <div>
                        <h2 style={{margin: "0", fontSize: "19px", fontWeight: "500", letterSpacing: "-.01em"}}>Contact Coverage</h2>
                        <p style={{margin: "4px 0 0", fontSize: "13.5px", color: "#5A5F5C"}}>Share of the database reachable by each channel.</p>
                      </div>
                      <span data-open="1" aria-hidden="true" style={{display: "grid", placeItems: "center", width: "36px", height: "36px", borderRadius: "999px", background: "#F5F5F4", fontSize: "14px", flex: "none"}}>↗</span>
                    </div>
                    <div style={{display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(88px,1fr))", gap: "14px", marginTop: "22px"}}>
                      <div style={{display: "flex", flexDirection: "column", alignItems: "center", gap: "10px"}}>
                        <span style={{position: "relative", display: "grid", placeItems: "center", width: "86px", height: "86px"}}>
                          <svg viewBox="0 0 100 100" aria-hidden="true" style={{position: "absolute", inset: "0", width: "100%", height: "100%", transform: "rotate(-90deg)"}}>
                            <circle cx="50" cy="50" r="44" fill="none" stroke="#DADCD7" strokeWidth="6"></circle>
                            <circle cx="50" cy="50" r="44" fill="none" stroke="#1C1C1C" strokeWidth="6" strokeLinecap="round" strokeDasharray="276.5" strokeDashoffset={V.dashPhoneOffset}></circle>
                          </svg>
                          <span style={{fontSize: "20px", fontWeight: "400", letterSpacing: "-.02em"}}>
                            {V.dashPhonePct}
                            <span style={{fontSize: "11px", color: "#5A5F5C"}}>%</span>
                          </span>
                        </span>
                        <span style={{fontSize: "13px", color: "#4A4F4B"}}>Phone</span>
                      </div>
                      <div style={{display: "flex", flexDirection: "column", alignItems: "center", gap: "10px"}}>
                        <span style={{position: "relative", display: "grid", placeItems: "center", width: "86px", height: "86px"}}>
                          <svg viewBox="0 0 100 100" aria-hidden="true" style={{position: "absolute", inset: "0", width: "100%", height: "100%", transform: "rotate(-90deg)"}}>
                            <circle cx="50" cy="50" r="44" fill="none" stroke="#DADCD7" strokeWidth="6"></circle>
                            <circle cx="50" cy="50" r="44" fill="none" stroke="#1C1C1C" strokeWidth="6" strokeLinecap="round" strokeDasharray="276.5" strokeDashoffset={V.dashEmailOffset}></circle>
                          </svg>
                          <span style={{fontSize: "20px", fontWeight: "400", letterSpacing: "-.02em"}}>
                            {V.dashEmailPct}
                            <span style={{fontSize: "11px", color: "#5A5F5C"}}>%</span>
                          </span>
                        </span>
                        <span style={{fontSize: "13px", color: "#4A4F4B"}}>Email</span>
                      </div>
                      <div style={{display: "flex", flexDirection: "column", alignItems: "center", gap: "10px"}}>
                        <span style={{position: "relative", display: "grid", placeItems: "center", width: "86px", height: "86px"}}>
                          <svg viewBox="0 0 100 100" aria-hidden="true" style={{position: "absolute", inset: "0", width: "100%", height: "100%", transform: "rotate(-90deg)"}}>
                            <circle cx="50" cy="50" r="44" fill="none" stroke="#DADCD7" strokeWidth="6"></circle>
                            <circle cx="50" cy="50" r="44" fill="none" stroke="#1C1C1C" strokeWidth="6" strokeLinecap="round" strokeDasharray="276.5" strokeDashoffset={V.dashSocialOffset}></circle>
                          </svg>
                          <span style={{fontSize: "20px", fontWeight: "400", letterSpacing: "-.02em"}}>
                            {V.dashSocialPct}
                            <span style={{fontSize: "11px", color: "#5A5F5C"}}>%</span>
                          </span>
                        </span>
                        <span style={{fontSize: "13px", color: "#4A4F4B"}}>Socials</span>
                      </div>
                      <div style={{display: "flex", flexDirection: "column", alignItems: "center", gap: "10px"}}>
                        <span style={{position: "relative", display: "grid", placeItems: "center", width: "86px", height: "86px"}}>
                          <svg viewBox="0 0 100 100" aria-hidden="true" style={{position: "absolute", inset: "0", width: "100%", height: "100%", transform: "rotate(-90deg)"}}>
                            <circle cx="50" cy="50" r="44" fill="none" stroke="#DADCD7" strokeWidth="6"></circle>
                            <circle cx="50" cy="50" r="44" fill="none" stroke="#1C1C1C" strokeWidth="6" strokeLinecap="round" strokeDasharray="276.5" strokeDashoffset={V.dashDmOffset}></circle>
                          </svg>
                          <span style={{fontSize: "20px", fontWeight: "400", letterSpacing: "-.02em"}}>
                            {V.dashDmPct}
                            <span style={{fontSize: "11px", color: "#5A5F5C"}}>%</span>
                          </span>
                        </span>
                        <span style={{fontSize: "13px", color: "#4A4F4B"}}>LinkedIn DM</span>
                      </div>
                    </div>
                  </section>
                  <section data-card="1" style={{padding: "22px 24px", borderRadius: "22px", background: "linear-gradient(200deg,#B9CBA8 0%,#8FA382 100%)", color: "#F7F9F5", transition: "transform .5s cubic-bezier(.22,1,.36,1),box-shadow .5s linear"}}>
                    <div style={{display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px"}}>
                      <div>
                        <h2 style={{margin: "0", fontSize: "19px", fontWeight: "500", letterSpacing: "-.01em", color: "#1C1C1C"}}>Social Platform Coverage</h2>
                        <p style={{margin: "4px 0 0", fontSize: "13.5px", color: "#22281F"}}>Profiles found per platform.</p>
                      </div>
                      <span data-open="1" aria-hidden="true" style={{display: "grid", placeItems: "center", width: "36px", height: "36px", borderRadius: "999px", background: "rgba(255,255,255,.34)", color: "#1C1C1C", fontSize: "14px", flex: "none"}}>↗</span>
                    </div>
                    <div style={{position: "relative", height: "142px", marginTop: "24px"}}>
                      <div style={{position: "absolute", inset: "0", display: "flex", alignItems: "flex-end", gap: "9px"}}>
                        <span style={{flex: "1", display: "flex", alignItems: "flex-end", gap: "1.5px", height: "100%"}}>
                          <span style={{flex: "1", height: "88%", borderRadius: "2px 2px 0 0", background: "rgba(247,249,245,.95)", transformOrigin: "bottom", animation: "lsRise .95s cubic-bezier(.22,1,.36,1) 0.000s both"}}></span>
                          <span style={{flex: "1", height: "96%", borderRadius: "2px 2px 0 0", background: "rgba(247,249,245,.95)", transformOrigin: "bottom", animation: "lsRise .95s cubic-bezier(.22,1,.36,1) 0.020s both"}}></span>
                          <span style={{flex: "1", height: "100%", borderRadius: "2px 2px 0 0", background: "rgba(247,249,245,.95)", transformOrigin: "bottom", animation: "lsRise .95s cubic-bezier(.22,1,.36,1) 0.040s both"}}></span>
                          <span style={{flex: "1", height: "96%", borderRadius: "2px 2px 0 0", background: "rgba(247,249,245,.95)", transformOrigin: "bottom", animation: "lsRise .95s cubic-bezier(.22,1,.36,1) 0.060s both"}}></span>
                          <span style={{flex: "1", height: "88%", borderRadius: "2px 2px 0 0", background: "rgba(247,249,245,.95)", transformOrigin: "bottom", animation: "lsRise .95s cubic-bezier(.22,1,.36,1) 0.080s both"}}></span>
                        </span>
                        <span style={{flex: "1", display: "flex", alignItems: "flex-end", gap: "1.5px", height: "100%"}}>
                          <span style={{flex: "1", height: "71%", borderRadius: "2px 2px 0 0", background: "rgba(247,249,245,0.74)", transformOrigin: "bottom", animation: "lsRise .95s cubic-bezier(.22,1,.36,1) 0.060s both"}}></span>
                          <span style={{flex: "1", height: "78%", borderRadius: "2px 2px 0 0", background: "rgba(247,249,245,0.74)", transformOrigin: "bottom", animation: "lsRise .95s cubic-bezier(.22,1,.36,1) 0.080s both"}}></span>
                          <span style={{flex: "1", height: "81%", borderRadius: "2px 2px 0 0", background: "rgba(247,249,245,0.74)", transformOrigin: "bottom", animation: "lsRise .95s cubic-bezier(.22,1,.36,1) 0.100s both"}}></span>
                          <span style={{flex: "1", height: "78%", borderRadius: "2px 2px 0 0", background: "rgba(247,249,245,0.74)", transformOrigin: "bottom", animation: "lsRise .95s cubic-bezier(.22,1,.36,1) 0.120s both"}}></span>
                          <span style={{flex: "1", height: "71%", borderRadius: "2px 2px 0 0", background: "rgba(247,249,245,0.74)", transformOrigin: "bottom", animation: "lsRise .95s cubic-bezier(.22,1,.36,1) 0.140s both"}}></span>
                        </span>
                        <span style={{flex: "1", display: "flex", alignItems: "flex-end", gap: "1.5px", height: "100%"}}>
                          <span style={{flex: "1", height: "46%", borderRadius: "2px 2px 0 0", background: "rgba(247,249,245,0.62)", transformOrigin: "bottom", animation: "lsRise .95s cubic-bezier(.22,1,.36,1) 0.120s both"}}></span>
                          <span style={{flex: "1", height: "50%", borderRadius: "2px 2px 0 0", background: "rgba(247,249,245,0.62)", transformOrigin: "bottom", animation: "lsRise .95s cubic-bezier(.22,1,.36,1) 0.140s both"}}></span>
                          <span style={{flex: "1", height: "52%", borderRadius: "2px 2px 0 0", background: "rgba(247,249,245,0.62)", transformOrigin: "bottom", animation: "lsRise .95s cubic-bezier(.22,1,.36,1) 0.160s both"}}></span>
                          <span style={{flex: "1", height: "50%", borderRadius: "2px 2px 0 0", background: "rgba(247,249,245,0.62)", transformOrigin: "bottom", animation: "lsRise .95s cubic-bezier(.22,1,.36,1) 0.180s both"}}></span>
                          <span style={{flex: "1", height: "46%", borderRadius: "2px 2px 0 0", background: "rgba(247,249,245,0.62)", transformOrigin: "bottom", animation: "lsRise .95s cubic-bezier(.22,1,.36,1) 0.200s both"}}></span>
                        </span>
                        <span style={{flex: "1", display: "flex", alignItems: "flex-end", gap: "1.5px", height: "100%"}}>
                          <span style={{flex: "1", height: "29%", borderRadius: "2px 2px 0 0", background: "rgba(247,249,245,0.54)", transformOrigin: "bottom", animation: "lsRise .95s cubic-bezier(.22,1,.36,1) 0.180s both"}}></span>
                          <span style={{flex: "1", height: "32%", borderRadius: "2px 2px 0 0", background: "rgba(247,249,245,0.54)", transformOrigin: "bottom", animation: "lsRise .95s cubic-bezier(.22,1,.36,1) 0.200s both"}}></span>
                          <span style={{flex: "1", height: "33%", borderRadius: "2px 2px 0 0", background: "rgba(247,249,245,0.54)", transformOrigin: "bottom", animation: "lsRise .95s cubic-bezier(.22,1,.36,1) 0.220s both"}}></span>
                          <span style={{flex: "1", height: "32%", borderRadius: "2px 2px 0 0", background: "rgba(247,249,245,0.54)", transformOrigin: "bottom", animation: "lsRise .95s cubic-bezier(.22,1,.36,1) 0.240s both"}}></span>
                          <span style={{flex: "1", height: "29%", borderRadius: "2px 2px 0 0", background: "rgba(247,249,245,0.54)", transformOrigin: "bottom", animation: "lsRise .95s cubic-bezier(.22,1,.36,1) 0.260s both"}}></span>
                        </span>
                        <span style={{flex: "1", display: "flex", alignItems: "flex-end", gap: "1.5px", height: "100%"}}>
                          <span style={{flex: "1", height: "19%", borderRadius: "2px 2px 0 0", background: "rgba(247,249,245,0.49)", transformOrigin: "bottom", animation: "lsRise .95s cubic-bezier(.22,1,.36,1) 0.240s both"}}></span>
                          <span style={{flex: "1", height: "21%", borderRadius: "2px 2px 0 0", background: "rgba(247,249,245,0.49)", transformOrigin: "bottom", animation: "lsRise .95s cubic-bezier(.22,1,.36,1) 0.260s both"}}></span>
                          <span style={{flex: "1", height: "22%", borderRadius: "2px 2px 0 0", background: "rgba(247,249,245,0.49)", transformOrigin: "bottom", animation: "lsRise .95s cubic-bezier(.22,1,.36,1) 0.280s both"}}></span>
                          <span style={{flex: "1", height: "21%", borderRadius: "2px 2px 0 0", background: "rgba(247,249,245,0.49)", transformOrigin: "bottom", animation: "lsRise .95s cubic-bezier(.22,1,.36,1) 0.300s both"}}></span>
                          <span style={{flex: "1", height: "19%", borderRadius: "2px 2px 0 0", background: "rgba(247,249,245,0.49)", transformOrigin: "bottom", animation: "lsRise .95s cubic-bezier(.22,1,.36,1) 0.320s both"}}></span>
                        </span>
                        <span style={{flex: "1", display: "flex", alignItems: "flex-end", gap: "1.5px", height: "100%"}}>
                          <span style={{flex: "1", height: "10%", borderRadius: "2px 2px 0 0", background: "rgba(247,249,245,0.45)", transformOrigin: "bottom", animation: "lsRise .95s cubic-bezier(.22,1,.36,1) 0.300s both"}}></span>
                          <span style={{flex: "1", height: "11%", borderRadius: "2px 2px 0 0", background: "rgba(247,249,245,0.45)", transformOrigin: "bottom", animation: "lsRise .95s cubic-bezier(.22,1,.36,1) 0.320s both"}}></span>
                          <span style={{flex: "1", height: "11%", borderRadius: "2px 2px 0 0", background: "rgba(247,249,245,0.45)", transformOrigin: "bottom", animation: "lsRise .95s cubic-bezier(.22,1,.36,1) 0.340s both"}}></span>
                          <span style={{flex: "1", height: "11%", borderRadius: "2px 2px 0 0", background: "rgba(247,249,245,0.45)", transformOrigin: "bottom", animation: "lsRise .95s cubic-bezier(.22,1,.36,1) 0.360s both"}}></span>
                          <span style={{flex: "1", height: "10%", borderRadius: "2px 2px 0 0", background: "rgba(247,249,245,0.45)", transformOrigin: "bottom", animation: "lsRise .95s cubic-bezier(.22,1,.36,1) 0.380s both"}}></span>
                        </span>
                        <span style={{flex: "1", display: "flex", alignItems: "flex-end", gap: "1.5px", height: "100%"}}>
                          <span style={{flex: "1", height: "6%", borderRadius: "2px 2px 0 0", background: "rgba(247,249,245,0.43)", transformOrigin: "bottom", animation: "lsRise .95s cubic-bezier(.22,1,.36,1) 0.360s both"}}></span>
                          <span style={{flex: "1", height: "7%", borderRadius: "2px 2px 0 0", background: "rgba(247,249,245,0.43)", transformOrigin: "bottom", animation: "lsRise .95s cubic-bezier(.22,1,.36,1) 0.380s both"}}></span>
                          <span style={{flex: "1", height: "7%", borderRadius: "2px 2px 0 0", background: "rgba(247,249,245,0.43)", transformOrigin: "bottom", animation: "lsRise .95s cubic-bezier(.22,1,.36,1) 0.400s both"}}></span>
                          <span style={{flex: "1", height: "7%", borderRadius: "2px 2px 0 0", background: "rgba(247,249,245,0.43)", transformOrigin: "bottom", animation: "lsRise .95s cubic-bezier(.22,1,.36,1) 0.420s both"}}></span>
                          <span style={{flex: "1", height: "6%", borderRadius: "2px 2px 0 0", background: "rgba(247,249,245,0.43)", transformOrigin: "bottom", animation: "lsRise .95s cubic-bezier(.22,1,.36,1) 0.440s both"}}></span>
                        </span>
                        <span style={{flex: "1", display: "flex", alignItems: "flex-end", height: "100%"}}>
                          <span style={{flex: "1", height: "2px", borderRadius: "2px", background: "rgba(28,28,28,.16)", animation: "lsFadeIn .9s linear .5s both"}}></span>
                        </span>
                      </div>
                      <svg viewBox="0 0 520 142" preserveAspectRatio="none" aria-hidden="true" style={{position: "absolute", inset: "0", display: "block", width: "100%", height: "100%"}}>
                        <path d="M0 8.0 Q37.1 8.0 74.3 32.3 Q111.4 32.3 148.6 69.4 Q185.7 69.4 222.9 93.8 Q260.0 93.8 297.1 107.8 Q334.3 107.8 371.4 121.9 Q408.6 121.9 445.7 127.0 Q482.9 127.0 520.0 130.9" fill="none" stroke="#1C1C1C" strokeWidth="2" strokeLinecap="round" strokeDasharray="6 7" opacity=".55" style={{animation: "lsFadeIn 1.2s linear .5s both,lsMarch 3.4s linear infinite"}}></path>
                      </svg>
                    </div>
                    <div style={{display: "flex", gap: "8px", marginTop: "12px", fontSize: "11.5px", color: "#1C1C1C", textAlign: "center"}}>
                      <span style={{flex: "1"}}>
                        {V.dashPlatformColumns[0].short}
                        <br />
                        <strong style={{fontWeight: "700", fontSize: "13px"}}>{V.dashPlatformColumns[0].count}</strong>
                      </span>
                      <span style={{flex: "1"}}>
                        {V.dashPlatformColumns[1].short}
                        <br />
                        <strong style={{fontWeight: "700", fontSize: "13px"}}>{V.dashPlatformColumns[1].count}</strong>
                      </span>
                      <span style={{flex: "1"}}>
                        {V.dashPlatformColumns[2].short}
                        <br />
                        <strong style={{fontWeight: "700", fontSize: "13px"}}>{V.dashPlatformColumns[2].count}</strong>
                      </span>
                      <span style={{flex: "1"}}>
                        {V.dashPlatformColumns[3].short}
                        <br />
                        <strong style={{fontWeight: "700", fontSize: "13px"}}>{V.dashPlatformColumns[3].count}</strong>
                      </span>
                      <span style={{flex: "1"}}>
                        {V.dashPlatformColumns[4].short}
                        <br />
                        <strong style={{fontWeight: "700", fontSize: "13px"}}>{V.dashPlatformColumns[4].count}</strong>
                      </span>
                      <span style={{flex: "1"}}>
                        {V.dashPlatformColumns[5].short}
                        <br />
                        <strong style={{fontWeight: "700", fontSize: "13px"}}>{V.dashPlatformColumns[5].count}</strong>
                      </span>
                      <span style={{flex: "1"}}>
                        {V.dashPlatformColumns[6].short}
                        <br />
                        <strong style={{fontWeight: "700", fontSize: "13px"}}>{V.dashPlatformColumns[6].count}</strong>
                      </span>
                      <span style={{flex: "1"}}>
                        {V.dashPlatformColumns[7].short}
                        <br />
                        <strong style={{fontWeight: "700", fontSize: "13px"}}>{V.dashPlatformColumns[7].count}</strong>
                      </span>
                    </div>
                  </section>
                  <section data-card="1" style={{padding: "22px 24px", borderRadius: "22px", background: "#F5F5F4", transition: "transform .5s cubic-bezier(.22,1,.36,1),box-shadow .5s linear"}}>
                    <div style={{display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px"}}>
                      <div>
                        <h2 style={{margin: "0", fontSize: "19px", fontWeight: "500", letterSpacing: "-.01em"}}>Top Categories</h2>
                        <p style={{margin: "4px 0 0", fontSize: "13.5px", color: "#5A5F5C"}}>Business types in your database.</p>
                      </div>
                      <span data-open="1" aria-hidden="true" style={{display: "grid", placeItems: "center", width: "36px", height: "36px", borderRadius: "999px", background: "#EAEAE8", fontSize: "14px", flex: "none"}}>↗</span>
                    </div>
                    <ul style={{listStyle: "none", margin: "16px 0 0", padding: "0", display: "flex", flexDirection: "column"}}>
                      {shows(V.dashCategoriesEmpty) ? (
                        <>
                        <li style={{padding: "16px 0", borderTop: "1px solid #E4E5E2", color: "#5A5F5C", fontSize: "13.5px"}}>{V.dashCategoriesEmpty}</li>
                        </>
                      ) : null}
                      {(V.dashCategoryRows ?? []).map((c, __ic) => (
                        <Fragment key={__ic}>
                          <li style={{display: "flex", alignItems: "center", gap: "12px", padding: "12px 0", borderTop: "1px solid #E4E5E2"}}>
                            <span style={{flex: "1", fontSize: "14.5px"}}>{c.name}</span>
                            <span style={{fontSize: "15px", fontWeight: "500"}}>{c.count}</span>
                            <span style={{padding: "5px 11px", borderRadius: "999px", background: "#1C1C1C", color: "#F0F0F0", fontSize: "11.5px", fontWeight: "500", minWidth: "62px", textAlign: "center"}}>{c.badge}</span>
                          </li>
                        </Fragment>
                      ))}
                    </ul>
                  </section>
                </div>
                <section data-card="1" style={{padding: "22px 24px", borderRadius: "22px", background: "#F5F5F4", transition: "transform .5s cubic-bezier(.22,1,.36,1),box-shadow .5s linear"}}>
                  <div style={{display: "flex", flexWrap: "wrap", alignItems: "flex-start", justifyContent: "space-between", gap: "12px"}}>
                    <div>
                      <h2 style={{margin: "0", fontSize: "19px", fontWeight: "500", letterSpacing: "-.01em"}}>Run Timeline</h2>
                      <p style={{margin: "4px 0 0", fontSize: "13.5px", color: "#5A5F5C"}}>Every scrape and enrichment job, oldest to newest.</p>
                    </div>
                    <span data-open="1" aria-hidden="true" style={{display: "grid", placeItems: "center", width: "36px", height: "36px", borderRadius: "999px", background: "#EAEAE8", fontSize: "14px", flex: "none"}}>↗</span>
                  </div>
                  <div style={{display: "flex", flexWrap: "wrap", gap: "10px", marginTop: "16px"}}>
                    {shows(V.dashMile1On) ? (
                      <>
                      <span style={{display: "inline-flex", alignItems: "center", gap: "8px", padding: "7px 14px", borderRadius: "999px", background: "#EAEAE8", fontSize: "12.5px"}}>{V.dashMile1}</span>
                      </>
                    ) : null}
                    {shows(V.dashMile2On) ? (
                      <>
                      <span style={{display: "inline-flex", alignItems: "center", gap: "8px", padding: "7px 14px", borderRadius: "999px", background: "#EAEAE8", fontSize: "12.5px"}}>{V.dashMile2}</span>
                      </>
                    ) : null}
                    {shows(V.dashMile3On) ? (
                      <>
                      <span style={{display: "inline-flex", alignItems: "center", gap: "8px", padding: "7px 14px", borderRadius: "999px", background: "#1C1C1C", color: "#F0F0F0", fontSize: "12.5px"}}>{V.dashMile3}</span>
                      </>
                    ) : null}
                    {shows(V.dashMile4On) ? (
                      <>
                      <span style={{display: "inline-flex", alignItems: "center", gap: "8px", padding: "7px 14px", borderRadius: "999px", background: "#EAEAE8", fontSize: "12.5px"}}>{V.dashMile4}</span>
                      </>
                    ) : null}
                    {shows(V.dashMile5On) ? (
                      <>
                      <span style={{display: "inline-flex", alignItems: "center", gap: "8px", padding: "7px 14px", borderRadius: "999px", background: "#EAEAE8", fontSize: "12.5px"}}>{V.dashMile5}</span>
                      </>
                    ) : null}
                  </div>
                  <div data-timeline="1" style={{display: "flex", alignItems: "flex-end", gap: "3px", height: "130px", marginTop: "22px", paddingBottom: "14px", borderBottom: "1px solid #DEDFDC"}}>
                    {shows(V.dashTimelineEmpty) ? (
                      <>
                      <span style={{fontSize: "12.5px", color: "#5A5F5C"}}>{V.dashTimelineEmpty}</span>
                      </>
                    ) : null}
                    {(V.dashTimelineBars ?? []).map((b, __ib) => (
                      <Fragment key={__ib}>
                        <span style={{flex: "1", height: b.height, borderRadius: "2px 2px 0 0", background: "#C8D5BB", transformOrigin: "bottom"}}></span>
                      </Fragment>
                    ))}
                  </div>
                  <div style={{display: "flex", justifyContent: "space-between", marginTop: "12px", fontSize: "12px", color: "#5A5F5C"}}>
                    {(V.dashTimelineAxis ?? []).map((x, __ix) => (
                      <Fragment key={__ix}>
                        <span>{x.label}</span>
                      </Fragment>
                    ))}
                  </div>
                </section>
                <div style={{display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,340px),1fr))", gap: "clamp(12px,1.4vw,20px)", alignItems: "start"}}>
                  <section data-card="1" style={{padding: "22px 24px", borderRadius: "22px", background: "#1C1C1C", color: "#F0F0F0", transition: "transform .5s cubic-bezier(.22,1,.36,1),box-shadow .5s linear"}}>
                    <div style={{display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px"}}>
                      <div>
                        <h2 style={{margin: "0", fontSize: "19px", fontWeight: "500", letterSpacing: "-.01em"}}>Needs Attention</h2>
                        <p style={{margin: "4px 0 0", fontSize: "13.5px", color: "#9BA29C"}}>Gaps you can close in one run.</p>
                      </div>
                      <span style={{padding: "7px 15px", borderRadius: "999px", background: "#C8D5BB", color: "#1C1C1C", fontSize: "12px", fontWeight: "500", flex: "none"}}>{V.dashActionCount}</span>
                    </div>
                    <div style={{display: "flex", flexDirection: "column", gap: "10px", marginTop: "18px"}}>
                      {shows(V.dashNoEmailOn) ? (
                        <>
                        <div style={{display: "flex", flexWrap: "wrap", alignItems: "center", gap: "12px", padding: "15px 16px", borderRadius: "16px", background: "#252625"}}>
                          <span aria-hidden="true" style={{width: "3px", alignSelf: "stretch", minHeight: "34px", borderRadius: "2px", background: "#C8D5BB", flex: "none"}}></span>
                          <span style={{flex: "1", minWidth: "180px", fontSize: "13.5px", lineHeight: "1.45", color: "#D5D8D4"}}>
                            <strong style={{fontWeight: "700", color: "#F0F0F0"}}>{V.dashNoEmail}</strong>
                            {' '}leads have a website but no email
                          </span>
                          <button data-action="Run Email Finder" data-goto="email" type="button" data-attn="1" style={{minWidth: "132px", padding: "9px 16px", border: "0", borderRadius: "999px", background: "#3A3C3A", color: "#F0F0F0", fontFamily: "inherit", fontSize: "12.5px", fontWeight: "500", cursor: "pointer", transition: "background .25s linear,color .25s linear", flex: "none"}}>Run Email Finder</button>
                        </div>
                        </>
                      ) : null}
                      {shows(V.dashNoPhoneOn) ? (
                        <>
                        <div style={{display: "flex", flexWrap: "wrap", alignItems: "center", gap: "12px", padding: "15px 16px", borderRadius: "16px", background: "#252625"}}>
                          <span aria-hidden="true" style={{width: "3px", alignSelf: "stretch", minHeight: "34px", borderRadius: "2px", background: "#8FA382", flex: "none"}}></span>
                          <span style={{flex: "1", minWidth: "180px", fontSize: "13.5px", lineHeight: "1.45", color: "#D5D8D4"}}>
                            <strong style={{fontWeight: "700", color: "#F0F0F0"}}>{V.dashNoPhone}</strong>
                            {' '}leads are missing a phone (have a website to scrape)
                          </span>
                          <button data-action="Find phones" data-goto="phone" type="button" data-attn="1" style={{minWidth: "132px", padding: "9px 16px", border: "0", borderRadius: "999px", background: "#3A3C3A", color: "#F0F0F0", fontFamily: "inherit", fontSize: "12.5px", fontWeight: "500", cursor: "pointer", transition: "background .25s linear,color .25s linear", flex: "none"}}>Find phones</button>
                        </div>
                        </>
                      ) : null}
                      {shows(V.dashExportReadyOn) ? (
                        <>
                        <div style={{display: "flex", flexWrap: "wrap", alignItems: "center", gap: "12px", padding: "15px 16px", borderRadius: "16px", background: "#252625"}}>
                          <span aria-hidden="true" style={{width: "3px", alignSelf: "stretch", minHeight: "34px", borderRadius: "2px", background: "#6F8060", flex: "none"}}></span>
                          <span style={{flex: "1", minWidth: "180px", fontSize: "13.5px", lineHeight: "1.45", color: "#D5D8D4"}}>
                            <strong style={{fontWeight: "700", color: "#F0F0F0"}}>{V.dashExportReady}</strong>
                            {' '}leads ready to export with usable contact data
                          </span>
                          <button type="button" onClick={V.runExport} data-attn="1" style={{minWidth: "132px", padding: "9px 16px", border: "0", borderRadius: "999px", background: "#C8D5BB", color: "#1C1C1C", fontFamily: "inherit", fontSize: "12.5px", fontWeight: "500", cursor: "pointer", transition: "background .25s linear,color .25s linear", flex: "none"}} data-exportgo="1">Export now</button>
                        </div>
                        </>
                      ) : null}
                    </div>
                  </section>
                  <div style={{display: "flex", flexDirection: "column", gap: "clamp(12px,1.4vw,20px)"}}>
                    <section data-card="1" style={{padding: "22px 24px", borderRadius: "22px", background: "#F5F5F4", transition: "transform .5s cubic-bezier(.22,1,.36,1),box-shadow .5s linear"}}>
                      <h2 style={{margin: "0", fontSize: "19px", fontWeight: "500", letterSpacing: "-.01em"}}>Quick Actions</h2>
                      <div style={{display: "flex", flexDirection: "column", gap: "10px", marginTop: "16px"}}>
                        <button data-action="New scrape" data-goto="maps" type="button" data-qa="1" style={{display: "flex", alignItems: "center", gap: "14px", width: "100%", padding: "14px 16px", border: "0", borderRadius: "16px", background: "#EAEAE8", fontFamily: "inherit", textAlign: "left", cursor: "pointer", transition: "background .25s linear"}}>
                          <span aria-hidden="true" style={{display: "grid", placeItems: "center", width: "34px", height: "34px", borderRadius: "11px", background: "#C8D5BB", color: "#1C1C1C", flex: "none"}}>
                            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M13 3.5L5.5 13.5H11l-.8 7L18.5 10H13z"></path>
                            </svg>
                          </span>
                          <span style={{flex: "1", minWidth: "0"}}>
                            <span style={{display: "block", fontSize: "14.5px", fontWeight: "500"}}>New scrape</span>
                            <span style={{display: "block", marginTop: "2px", fontSize: "12.5px", color: "#5A5F5C"}}>Find more leads from Google Maps</span>
                          </span>
                          <span data-qa-arrow="1" aria-hidden="true" style={{color: "#5A5F5C", fontSize: "13px", transition: "transform .35s cubic-bezier(.22,1,.36,1)"}}>→</span>
                        </button>
                        <button data-action="Run Email Finder" data-goto="email" type="button" data-qa="1" style={{display: "flex", alignItems: "center", gap: "14px", width: "100%", padding: "14px 16px", border: "0", borderRadius: "16px", background: "#EAEAE8", fontFamily: "inherit", textAlign: "left", cursor: "pointer", transition: "background .25s linear"}}>
                          <span aria-hidden="true" style={{display: "grid", placeItems: "center", width: "34px", height: "34px", borderRadius: "11px", background: "#DDE3D6", color: "#3A4238", flex: "none"}}>
                            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                              <rect x="3.5" y="5.5" width="17" height="13" rx="3"></rect>
                              <path d="M4 7.5l8 5.5 8-5.5"></path>
                            </svg>
                          </span>
                          <span style={{flex: "1", minWidth: "0"}}>
                            <span style={{display: "block", fontSize: "14.5px", fontWeight: "500"}}>Run Email Finder</span>
                            <span style={{display: "block", marginTop: "2px", fontSize: "12.5px", color: "#5A5F5C"}}>Enrich pending leads with emails</span>
                          </span>
                          <span data-qa-arrow="1" aria-hidden="true" style={{color: "#5A5F5C", fontSize: "13px", transition: "transform .35s cubic-bezier(.22,1,.36,1)"}}>→</span>
                        </button>
                        <button type="button" onClick={V.openExpAll} data-qa="1" style={{display: "flex", alignItems: "center", gap: "14px", width: "100%", padding: "14px 16px", border: "0", borderRadius: "16px", background: "#EAEAE8", fontFamily: "inherit", textAlign: "left", cursor: "pointer", transition: "background .25s linear"}}>
                          <span aria-hidden="true" style={{display: "grid", placeItems: "center", width: "34px", height: "34px", borderRadius: "11px", background: "#DDE3D6", color: "#3A4238", flex: "none"}}>
                            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M12 4v10"></path>
                              <path d="M8 10.5l4 4 4-4"></path>
                              <path d="M4.5 18.5h15"></path>
                            </svg>
                          </span>
                          <span style={{flex: "1", minWidth: "0"}}>
                            <span style={{display: "block", fontSize: "14.5px", fontWeight: "500"}}>Export all leads</span>
                            <span style={{display: "block", marginTop: "2px", fontSize: "12.5px", color: "#5A5F5C"}}>Download every lead as CSV</span>
                          </span>
                          <span data-qa-arrow="1" aria-hidden="true" style={{color: "#5A5F5C", fontSize: "13px", transition: "transform .35s cubic-bezier(.22,1,.36,1)"}}>→</span>
                        </button>
                      </div>
                    </section>
                    <section data-card="1" style={{padding: "22px 24px", borderRadius: "22px", background: "#F5F5F4", transition: "transform .5s cubic-bezier(.22,1,.36,1),box-shadow .5s linear"}}>
                      <div style={{display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px"}}>
                        <div>
                          <h2 style={{margin: "0", fontSize: "19px", fontWeight: "500", letterSpacing: "-.01em"}}>Scheduled</h2>
                          <p style={{margin: "4px 0 0", fontSize: "13.5px", color: "#5A5F5C"}}>Upcoming runs and reminders.</p>
                        </div>
                        <span data-open="1" aria-hidden="true" style={{display: "grid", placeItems: "center", width: "36px", height: "36px", borderRadius: "999px", background: "#EAEAE8", fontSize: "14px", flex: "none"}}>↗</span>
                      </div>
                      <div style={{display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,190px),1fr))", gap: "18px", marginTop: "18px"}}>
                        <div>
                          <div style={{fontSize: "16px", fontWeight: "500"}}>Weekly Maps scrape</div>
                          <div style={{display: "flex", alignItems: "center", gap: "8px", marginTop: "10px", fontSize: "13.5px", color: "#4A4F4B"}}>
                            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{flex: "none"}}>
                              <rect x="4" y="5.5" width="16" height="14" rx="3"></rect>
                              <path d="M8 3.5v4M16 3.5v4M4 10h16"></path>
                            </svg>
                            {' '}12 Sep • 09:00
                          </div>
                          <div style={{display: "flex", alignItems: "center", gap: "8px", marginTop: "6px", fontSize: "13.5px", color: "#4A4F4B"}}>
                            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{flex: "none"}}>
                              <path d="M12 21s6.5-6 6.5-10.5A6.5 6.5 0 0 0 5.5 10.5C5.5 15 12 21 12 21z"></path>
                              <circle cx="12" cy="10.5" r="2.2"></circle>
                            </svg>
                            {' '}Manchester · 25km
                          </div>
                        </div>
                        <div style={{borderLeft: "1px solid #E4E5E2", paddingLeft: "18px"}}>
                          <div style={{fontSize: "16px", fontWeight: "500"}}>Enrichment sweep</div>
                          <div style={{display: "flex", alignItems: "center", gap: "8px", marginTop: "10px", fontSize: "13.5px", color: "#4A4F4B"}}>
                            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{flex: "none"}}>
                              <rect x="4" y="5.5" width="16" height="14" rx="3"></rect>
                              <path d="M8 3.5v4M16 3.5v4M4 10h16"></path>
                            </svg>
                            {' '}Due in 2 days
                          </div>
                          <div style={{display: "flex", alignItems: "center", gap: "8px", marginTop: "6px", fontSize: "13.5px", color: "#4A4F4B"}}>
                            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{flex: "none"}}>
                              <circle cx="12" cy="12" r="7.5"></circle>
                              <path d="M12 8v4.2l3 1.8"></path>
                            </svg>
                            {' '}63 pending leads
                          </div>
                        </div>
                      </div>
                    </section>
                  </div>
                </div>
              </div>
              </>
            ) : null}
            {shows(V.isMaps) ? (
              <>
              {shows(V.running) ? (
                <>
                <div style={{position: "fixed", inset: "0", zIndex: "80", display: "grid", placeItems: "center", padding: "clamp(14px,3vw,32px)", background: "rgba(28,28,28,.62)", animation: "lsScrimIn .35s linear both"}}>
                  <section style={{width: "100%", maxWidth: "900px", padding: "clamp(20px,2.4vw,28px)", borderRadius: "26px", background: "#F5F5F4", boxShadow: "0 40px 80px -40px rgba(28,28,28,.8)", animation: "lsPanelIn .5s cubic-bezier(.22,1,.36,1) both"}}>
                    <div style={{display: "flex", flexWrap: "wrap", alignItems: "flex-start", justifyContent: "space-between", gap: "14px"}}>
                      <div>
                        <div style={{display: "flex", alignItems: "center", gap: "11px"}}>
                          <span aria-hidden="true" style={{width: "15px", height: "15px", borderRadius: "999px", border: "2px solid rgba(124,132,124,.35)", borderTopColor: "#1C1C1C", animation: "lsSpin .8s linear infinite"}}></span>
                          <h2 style={{margin: "0", fontSize: "clamp(20px,2.2vw,26px)", fontWeight: "400", letterSpacing: "-.02em"}}>Scanning {V.runLocation}</h2>
                        </div>
                        <p style={{margin: "8px 0 0", fontSize: "13.5px", color: "#5A5F5C"}}>{V.runNote}</p>
                      </div>
                      <div style={{display: "flex", alignItems: "center", gap: "8px"}}>
                        <span style={{padding: "7px 14px", borderRadius: "999px", background: "#EAEAE8", fontSize: "12px", fontWeight: "500"}}>{V.foundLabel}</span>
                        <button type="button" data-ghost="1" onClick={V.stopRun} style={{display: "inline-flex", alignItems: "center", gap: "8px", height: "40px", padding: "0 18px", border: "0", borderRadius: "999px", background: "#E5E5E5", color: "#1C1C1C", fontFamily: "inherit", fontSize: "13px", fontWeight: "500", cursor: "pointer", transition: "background .25s linear"}}>Stop</button>
                      </div>
                    </div>
                    <div style={{position: "relative", height: "clamp(240px,30vh,340px)", marginTop: "18px", borderRadius: "20px", overflow: "hidden", background: "#E9EBE4"}}>
                      {(V.mapsPins ?? []).map((pin, __ipin) => (
                        <Fragment key={__ipin}>
                          <span data-pin="1" data-on={pin.reveal} data-name={pin.name} title={pin.name} style={{position: "absolute", left: pin.x, top: pin.y, display: "flex", alignItems: "center", gap: "7px", padding: "5px 12px 5px 5px", borderRadius: "999px", background: pin.color, color: "#F0F0F0", fontSize: "11.5px", fontWeight: "500", whiteSpace: "nowrap", boxShadow: "0 10px 20px -13px rgba(28,28,28,.85)"}}>
                            <span style={{display: "grid", placeItems: "center", width: "20px", height: "20px", borderRadius: "999px", background: "#1C1C1C", color: "#F0F0F0", fontSize: "8.5px", fontWeight: "700"}}>{pin.ini}</span>
                            {pin.name}
                          </span>
                        </Fragment>
                      ))}
                    </div>
                    <div style={{display: "flex", gap: "4px", marginTop: "16px"}}>
                      <span data-seg="1" data-on={V.p1} style={{flex: "1", height: "8px", borderRadius: "4px"}}></span>
                      <span data-seg="1" data-on={V.p2} style={{flex: "1", height: "8px", borderRadius: "4px"}}></span>
                      <span data-seg="1" data-on={V.p3} style={{flex: "1", height: "8px", borderRadius: "4px"}}></span>
                      <span data-seg="1" data-on={V.p4} style={{flex: "1", height: "8px", borderRadius: "4px"}}></span>
                      <span data-seg="1" data-on={V.p5} style={{flex: "1", height: "8px", borderRadius: "4px"}}></span>
                      <span data-seg="1" data-on={V.p6} style={{flex: "1", height: "8px", borderRadius: "4px"}}></span>
                      <span data-seg="1" data-on={V.p7} style={{flex: "1", height: "8px", borderRadius: "4px"}}></span>
                      <span data-seg="1" data-on={V.p8} style={{flex: "1", height: "8px", borderRadius: "4px"}}></span>
                    </div>
                    <div style={{display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "10px", marginTop: "12px"}}>
                      <span style={{fontSize: "12.5px", color: "#5A5F5C"}}>Enriching phones, emails and socials as each place lands.</span>
                      <span style={{fontSize: "12.5px", color: "#5A5F5C"}}>{V.kwCount}</span>
                    </div>
                  </section>
                </div>
                </>
              ) : null}
              <div style={{display: "flex", flexDirection: "column", gap: "clamp(12px,1.5vw,20px)"}}>
                <div style={{display: "flex", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: "16px"}}>
                  <div>
                    <div style={{display: "flex", alignItems: "center", gap: "12px"}}>
                      <h1 style={{margin: "0", fontSize: "clamp(26px,2.6vw,36px)", lineHeight: "1.1", letterSpacing: "-.03em", fontWeight: "400"}}>Google Maps Scraper</h1>
                      <span style={{display: "inline-flex", alignItems: "center", gap: "7px", padding: "6px 13px", borderRadius: "999px", background: "#C8D5BB", fontSize: "10.5px", fontWeight: "500", letterSpacing: ".14em"}}>
                        <span aria-hidden="true" style={{width: "6px", height: "6px", borderRadius: "999px", background: "#1C1C1C", animation: "lsPulse 2.4s ease-in-out infinite"}}></span>
                        {V.runBadge}{' '}
                      </span>
                    </div>
                    <p style={{margin: "8px 0 0", fontSize: "14.5px", color: "#5A5F5C"}}>{V.runNote}</p>
                  </div>
                </div>
                <section data-card="1" style={{padding: "22px 24px", borderRadius: "22px", background: "#F5F5F4", transition: "transform .5s cubic-bezier(.22,1,.36,1),box-shadow .5s linear"}}>
                  <div data-setup="1" style={{display: "grid", gridTemplateColumns: "minmax(0,1.05fr) minmax(0,1fr)", gap: "clamp(20px,3vw,44px)"}}>
                    <div>
                      <div style={{fontSize: "10.5px", fontWeight: "500", letterSpacing: ".16em", textTransform: "uppercase", color: "#555956"}}>Target Query</div>
                      <div style={{display: "flex", flexDirection: "column", gap: "14px", marginTop: "16px"}}>
                        <div>
                          <div style={{display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "8px", marginBottom: "7px"}}>
                            <span style={{fontSize: "12.5px", color: "#4A4F4B"}}>Keywords</span>
                            <span style={{fontSize: "11.5px", color: "#5A5F5C"}}>{V.kwCount}</span>
                          </div>
                          <div style={{display: "flex", flexWrap: "wrap", alignItems: "center", gap: "6px", minHeight: "46px", padding: "7px 10px", borderRadius: "14px", background: "#EAEAE8"}}>
                            {(V.keywords ?? []).map((kw, __ikw) => (
                              <Fragment key={__ikw}>
                                <button type="button" data-kw="1" onClick={kw.remove} title="Remove keyword" style={{display: "inline-flex", alignItems: "center", gap: "7px", padding: "6px 10px 6px 12px", border: "0", borderRadius: "999px", background: "#E2E4DE", color: "#1C1C1C", fontFamily: "inherit", fontSize: "13px", cursor: "pointer", transition: "background .25s linear"}}>
                                  {kw.label}
                                  <span data-x="1" aria-hidden="true" style={{fontSize: "13px", color: "#7C8478", transition: "color .25s linear"}}>×</span>
                                </button>
                              </Fragment>
                            ))}
                            <input data-kwinput="1" type="text" onKeyDown={V.onKwKey} onBlur={V.onKwBlur} aria-label="Add keyword" placeholder="Add keyword…" style={{flex: "1", minWidth: "104px", height: "32px", border: "0", background: "transparent", fontSize: "14.5px", color: "#1C1C1C", outline: "none"}} />
                          </div>
                          <span style={{display: "block", marginTop: "7px", fontSize: "12px", color: "#5A5F5C"}}>Comma or Enter adds another — every keyword runs as its own pass.</span>
                        </div>
                        <label style={{display: "block"}}>
                          <span style={{display: "block", fontSize: "12.5px", color: "#4A4F4B", marginBottom: "7px"}}>Location</span>
                          <input type="text" defaultValue="Manchester" style={{width: "100%", height: "46px", padding: "0 16px", border: "0", borderRadius: "14px", background: "#EAEAE8", fontSize: "15px", color: "#1C1C1C", outline: "none"}} data-location="1" />
                          <span style={{display: "block", marginTop: "7px", fontSize: "12px", color: "#5A5F5C"}}>Leave blank to use your current location.</span>
                        </label>
                        <div>
                          <span style={{display: "block", fontSize: "12.5px", color: "#4A4F4B", marginBottom: "7px"}}>Max results</span>
                          <div style={{display: "flex", alignItems: "center", gap: "8px"}}>
                            <button type="button" onClick={V.decMax} aria-label="Fewer results" data-step="1" style={{display: "grid", placeItems: "center", width: "40px", height: "40px", border: "0", borderRadius: "999px", background: "#EAEAE8", color: "#1C1C1C", fontFamily: "inherit", fontSize: "17px", cursor: "pointer", transition: "background .25s linear"}}>−</button>
                            <span style={{minWidth: "56px", textAlign: "center", fontSize: "19px", fontWeight: "500"}}>{V.maxResults}</span>
                            <button type="button" onClick={V.incMax} aria-label="More results" data-step="1" style={{display: "grid", placeItems: "center", width: "40px", height: "40px", border: "0", borderRadius: "999px", background: "#EAEAE8", color: "#1C1C1C", fontFamily: "inherit", fontSize: "17px", cursor: "pointer", transition: "background .25s linear"}}>+</button>
                          </div>
                        </div>
                        <div style={{marginTop: "6px", paddingTop: "18px", borderTop: "1px solid #E4E5E2"}}>
                          <div style={{fontSize: "10.5px", fontWeight: "500", letterSpacing: ".16em", textTransform: "uppercase", color: "#555956"}}>Enrichment</div>
                          <div style={{display: "flex", flexWrap: "wrap", alignItems: "center", gap: "7px", marginTop: "12px"}}>
                            <button type="button" onClick={V.togEmails} data-chip="1" data-on={V.chEmails} style={{display: "inline-flex", alignItems: "center", gap: "8px", padding: "10px 16px", border: "0", borderRadius: "999px", fontFamily: "inherit", fontSize: "13.5px", cursor: "pointer"}}>
                              <span data-tick="1" aria-hidden="true" style={{fontSize: "11px"}}>✓</span>
                              Find emails
                            </button>
                            <button type="button" onClick={V.togPhones} data-chip="1" data-on={V.chPhones} style={{display: "inline-flex", alignItems: "center", gap: "8px", padding: "10px 16px", border: "0", borderRadius: "999px", fontFamily: "inherit", fontSize: "13.5px", cursor: "pointer"}}>
                              <span data-tick="1" aria-hidden="true" style={{fontSize: "11px"}}>✓</span>
                              Find phone numbers
                            </button>
                            <button type="button" onClick={V.togSocial} data-chip="1" data-on={V.chSocial} style={{display: "inline-flex", alignItems: "center", gap: "8px", padding: "10px 16px", border: "0", borderRadius: "999px", fontFamily: "inherit", fontSize: "13.5px", cursor: "pointer"}}>
                              <span data-tick="1" aria-hidden="true" style={{fontSize: "11px"}}>✓</span>
                              Find social media
                            </button>
                            <button type="button" onClick={V.togDm} data-chip="1" data-on={V.chDm} style={{display: "inline-flex", alignItems: "center", gap: "8px", padding: "10px 16px", border: "0", borderRadius: "999px", fontFamily: "inherit", fontSize: "13.5px", cursor: "pointer"}}>
                              <span data-tick="1" aria-hidden="true" style={{fontSize: "11px"}}>✓</span>
                              Find decision makers
                            </button>
                            <button type="button" onClick={V.togLinkedin} data-chip="1" data-on={V.chLinkedin} style={{display: "inline-flex", alignItems: "center", gap: "8px", padding: "10px 16px", border: "0", borderRadius: "999px", fontFamily: "inherit", fontSize: "13.5px", cursor: "pointer"}}>
                              <span data-tick="1" aria-hidden="true" style={{fontSize: "11px"}}>✓</span>
                              Find LinkedIn page
                            </button>
                          </div>
                          <button type="button" onClick={V.openBulkKeywords} data-bulk="1" aria-haspopup="dialog" style={{display: "inline-flex", alignItems: "center", gap: "9px", marginTop: "14px", padding: "11px 18px", border: "1px dashed #C6C8C4", borderRadius: "14px", background: "transparent", fontFamily: "inherit", fontSize: "13px", color: "#4A4F4B", whiteSpace: "nowrap", cursor: "pointer", transition: "background .25s linear,border-color .25s linear"}}>
                            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <path d="M12 15.5V4"></path>
                              <path d="M8 7.5l4-4 4 4"></path>
                              <path d="M4.5 19.5h15"></path>
                            </svg>
                            {' '}Bulk import keywords{' '}
                          </button>
                        </div>
                        <div style={{display: "flex", flexWrap: "wrap", gap: "8px", marginTop: "2px"}}>
                          <button type="button" data-run="1" data-runbtn="1" data-state={V.runState} onClick={V.runScrape} style={{display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "9px", flex: "1", minWidth: "172px", height: "46px", padding: "0 20px", border: "0", borderRadius: "999px", background: "#1C1C1C", color: "#F0F0F0", fontFamily: "inherit", fontSize: "13.5px", fontWeight: "500", cursor: "pointer", transition: "transform .3s cubic-bezier(.22,1,.36,1)"}}>
                            <span data-runidle="1" style={{alignItems: "center", gap: "9px"}}>
                              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <path d="M13 3.5L5.5 13.5H11l-.8 7L18.5 10H13z"></path>
                              </svg>
                              {' '}Run with filters{' '}
                            </span>
                            <span data-runbusy="1" style={{alignItems: "center", gap: "9px"}}>
                              <span aria-hidden="true" style={{width: "15px", height: "15px", borderRadius: "999px", border: "2px solid rgba(240,240,240,.3)", borderTopColor: "#F0F0F0", animation: "lsSpin .8s linear infinite"}}></span>
                              {' '}Scraping…{' '}
                            </span>
                            <span data-runconn="1" style={{alignItems: "center", gap: "9px"}}>
                              <span aria-hidden="true" style={{width: "15px", height: "15px", borderRadius: "999px", border: "2px solid rgba(240,240,240,.3)", borderTopColor: "#F0F0F0", animation: "lsSpin 1.1s linear infinite"}}></span>
                              {' '}Connecting Google…{' '}
                            </span>
                          </button>
                        </div>
                      </div>
                    </div>
                    <div>
                      <div style={{fontSize: "10.5px", fontWeight: "500", letterSpacing: ".16em", textTransform: "uppercase", color: "#555956"}}>Maps Filters</div>
                      <div style={{display: "flex", flexDirection: "column", gap: "14px", marginTop: "16px"}}>
                        <label style={{display: "block", position: "relative"}}>
                          <span style={{display: "block", fontSize: "12.5px", color: "#4A4F4B", marginBottom: "7px"}}>Minimum rating</span>
                          <select style={{width: "100%", height: "46px", padding: "0 38px 0 14px", border: "0", borderRadius: "14px", background: "#EAEAE8", fontFamily: "inherit", fontSize: "15px", color: "#1C1C1C", outline: "none", appearance: "none"}}>
                            <option>Any</option>
                            <option>4.0+</option>
                            <option>4.5+</option>
                            <option>4.8+</option>
                          </select>
                          <span aria-hidden="true" style={{position: "absolute", right: "14px", bottom: "15px", display: "block", pointerEvents: "none", color: "#4A4F4B"}}>
                            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M6 9.5l6 6 6-6"></path>
                            </svg>
                          </span>
                        </label>
                        <label style={{display: "block", position: "relative"}}>
                          <span style={{display: "block", fontSize: "12.5px", color: "#4A4F4B", marginBottom: "7px"}}>Minimum reviews</span>
                          <select style={{width: "100%", height: "46px", padding: "0 38px 0 14px", border: "0", borderRadius: "14px", background: "#EAEAE8", fontFamily: "inherit", fontSize: "15px", color: "#1C1C1C", outline: "none", appearance: "none"}}>
                            <option>Any</option>
                            <option>25+</option>
                            <option>100+</option>
                            <option>500+</option>
                          </select>
                          <span aria-hidden="true" style={{position: "absolute", right: "14px", bottom: "15px", display: "block", pointerEvents: "none", color: "#4A4F4B"}}>
                            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M6 9.5l6 6 6-6"></path>
                            </svg>
                          </span>
                        </label>
                        <div style={{display: "flex", flexDirection: "column", gap: "11px", marginTop: "2px"}}>
                          <button type="button" onClick={V.toggleWebsite} data-sw="1" data-on={V.swWebsite} style={{display: "flex", alignItems: "center", gap: "12px", padding: "0", border: "0", background: "transparent", fontFamily: "inherit", cursor: "pointer"}}>
                            <span aria-hidden="true" data-sw="1" data-on={V.swWebsite} style={{position: "relative", display: "block", width: "42px", height: "24px", borderRadius: "999px", flex: "none"}}>
                              <span data-knob="1" style={{position: "absolute", top: "3px", left: "3px", width: "18px", height: "18px", borderRadius: "999px", background: "#F7F9F5"}}></span>
                            </span>
                            <span style={{fontSize: "14px", color: "#1C1C1C"}}>Has website</span>
                          </button>
                          <button type="button" onClick={V.togglePhone} data-sw="1" data-on={V.swPhone} style={{display: "flex", alignItems: "center", gap: "12px", padding: "0", border: "0", background: "transparent", fontFamily: "inherit", cursor: "pointer"}}>
                            <span aria-hidden="true" data-sw="1" data-on={V.swPhone} style={{position: "relative", display: "block", width: "42px", height: "24px", borderRadius: "999px", flex: "none"}}>
                              <span data-knob="1" style={{position: "absolute", top: "3px", left: "3px", width: "18px", height: "18px", borderRadius: "999px", background: "#F7F9F5"}}></span>
                            </span>
                            <span style={{fontSize: "14px", color: "#1C1C1C"}}>Has phone</span>
                          </button>
                        </div>
                      </div>
                      <div style={{marginTop: "22px", paddingTop: "18px", borderTop: "1px solid #E4E5E2"}}>
                        <div style={{fontSize: "10.5px", fontWeight: "500", letterSpacing: ".16em", textTransform: "uppercase", color: "#555956"}}>Run Behaviour</div>
                        <div style={{display: "flex", flexDirection: "column", gap: "14px", marginTop: "16px"}}>
                          <div data-gacct="1" data-on={V.gAcctOn} style={{display: "flex", flexWrap: "wrap", alignItems: "center", gap: "12px", padding: "13px 14px", borderRadius: "16px", background: "#EAEAE8"}}>
                            <span data-live="1" data-on={V.gAcctOn} aria-hidden="true" style={{width: "9px", height: "9px", borderRadius: "999px", flex: "none"}}></span>
                            <span style={{flex: "1", minWidth: "150px"}}>
                              <span style={{display: "block", fontSize: "13.5px", fontWeight: "500"}}>{V.gAcctTitle}</span>
                              <span style={{display: "block", marginTop: "2px", fontSize: "12px", lineHeight: "1.45", color: "#5A5F5C"}}>{V.gAcctNote}</span>
                            </span>
                            <button type="button" onClick={V.gAcctAction} data-ghost="1" style={{display: "inline-flex", alignItems: "center", justifyContent: "center", height: "36px", padding: "0 15px", border: "0", borderRadius: "999px", background: "#E5E5E5", color: "#1C1C1C", fontFamily: "inherit", fontSize: "12.5px", fontWeight: "500", whiteSpace: "nowrap", cursor: "pointer", transition: "background .25s linear"}}>{V.gAcctBtn}</button>
                          </div>
                          <button type="button" onClick={V.toggleBrowser} style={{display: "flex", alignItems: "flex-start", gap: "12px", padding: "0", border: "0", background: "transparent", fontFamily: "inherit", textAlign: "left", cursor: "pointer"}}>
                            <span aria-hidden="true" data-sw="1" data-on={V.swBrowser} style={{position: "relative", display: "block", width: "42px", height: "24px", borderRadius: "999px", flex: "none"}}>
                              <span data-knob="1" style={{position: "absolute", top: "3px", left: "3px", width: "18px", height: "18px", borderRadius: "999px", background: "#F7F9F5"}}></span>
                            </span>
                            <span style={{display: "flex", flexDirection: "column", gap: "3px", paddingTop: "2px"}}>
                              <span style={{fontSize: "14px", color: "#1C1C1C"}}>Show the browser window</span>
                              <span style={{fontSize: "12px", lineHeight: "1.45", color: "#5A5F5C"}}>Watch the run instead of headless. First thing to try if Google throttles.</span>
                            </span>
                          </button>
                          <button type="button" onClick={V.toggleDistricts} style={{display: "flex", alignItems: "flex-start", gap: "12px", padding: "0", border: "0", background: "transparent", fontFamily: "inherit", textAlign: "left", cursor: "pointer"}}>
                            <span aria-hidden="true" data-sw="1" data-on={V.swDistricts} style={{position: "relative", display: "block", width: "42px", height: "24px", borderRadius: "999px", flex: "none"}}>
                              <span data-knob="1" style={{position: "absolute", top: "3px", left: "3px", width: "18px", height: "18px", borderRadius: "999px", background: "#F7F9F5"}}></span>
                            </span>
                            <span style={{display: "flex", flexDirection: "column", gap: "3px", paddingTop: "2px"}}>
                              <span style={{fontSize: "14px", color: "#1C1C1C"}}>Split city into districts</span>
                              <span style={{fontSize: "12px", lineHeight: "1.45", color: "#5A5F5C"}}>{V.districtNote}</span>
                            </span>
                          </button>
                          <label style={{display: "block", position: "relative"}}>
                            <span style={{display: "block", fontSize: "12.5px", color: "#4A4F4B", marginBottom: "7px"}}>Delay between places</span>
                            <select aria-label="Delay between places" style={{width: "100%", height: "46px", padding: "0 38px 0 14px", border: "0", borderRadius: "14px", background: "#EAEAE8", fontFamily: "inherit", fontSize: "15px", color: "#1C1C1C", outline: "none", appearance: "none"}} defaultValue={V.paceLabel} onChange={V.onPaceChoice}>
                              <option>1.5 s · quick</option>
                              <option>3 s · steady</option>
                              <option>6 s · careful</option>
                              <option>10 s · very gentle</option>
                            </select>
                            <span aria-hidden="true" style={{position: "absolute", right: "14px", top: "40px", display: "block", pointerEvents: "none", color: "#4A4F4B"}}>
                              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M6 9.5l6 6 6-6"></path>
                              </svg>
                            </span>
                            <span style={{display: "block", marginTop: "7px", fontSize: "12px", color: "#5A5F5C"}}>Slower pacing is less likely to meet a bot check.</span>
                          </label>
                          <label style={{display: "block", position: "relative"}}>
                            <span style={{display: "block", fontSize: "12.5px", color: "#4A4F4B", marginBottom: "7px"}}>Browser</span>
                            <select aria-label="Browser program" style={{width: "100%", height: "46px", padding: "0 38px 0 14px", border: "0", borderRadius: "14px", background: "#EAEAE8", fontFamily: "inherit", fontSize: "15px", color: "#1C1C1C", outline: "none", appearance: "none"}} defaultValue={V.browserLabel} onChange={V.onBrowserChoice}>
                              <option>Bundled Chromium</option>
                              <option>Google Chrome (x86)</option>
                              <option>Google Chrome</option>
                              <option>Microsoft Edge</option>
                              <option>Brave</option>
                            </select>
                            <span aria-hidden="true" style={{position: "absolute", right: "14px", top: "40px", display: "block", pointerEvents: "none", color: "#4A4F4B"}}>
                              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M6 9.5l6 6 6-6"></path>
                              </svg>
                            </span>
                            <span style={{display: "block", marginTop: "7px", fontSize: "12px", color: "#5A5F5C"}}>Picks a program only — your own browser profile is never opened.</span>
                          </label>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div style={{marginTop: "22px", paddingTop: "20px", borderTop: "1px solid #E4E5E2"}}>
                    <div style={{display: "flex", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: "12px"}}>
                      <div>
                        <h2 style={{margin: "0", fontSize: "19px", fontWeight: "500", letterSpacing: "-.01em"}}>Coverage Map</h2>
                        <p style={{margin: "4px 0 0", fontSize: "13.5px", color: "#5A5F5C"}}>{V.mapsAreas} · {V.mapsRadius}. Pins land as each place is captured.</p>
                      </div>
                      <div style={{display: "flex", alignItems: "center", gap: "8px"}}>
                        <span style={{display: "inline-flex", alignItems: "center", gap: "8px", padding: "7px 14px", borderRadius: "999px", background: "#EAEAE8", fontSize: "12px", fontWeight: "500"}}>{V.foundLabel}</span>
                        <span style={{display: "inline-flex", alignItems: "center", gap: "7px", padding: "7px 14px", borderRadius: "999px", background: "#1C1C1C", color: "#F0F0F0", fontSize: "12px", fontWeight: "500"}}>
                          <span aria-hidden="true" style={{width: "6px", height: "6px", borderRadius: "999px", background: "#C8D5BB"}}></span>
                          {V.kwCount}
                        </span>
                      </div>
                    </div>
                    <div style={{position: "relative", height: "clamp(250px,25vw,330px)", marginTop: "16px", borderRadius: "18px", overflow: "hidden", background: "#E9EBE4"}}>
                      {(V.mapsPins ?? []).map((pin, __ipin) => (
                        <Fragment key={__ipin}>
                          <span data-pin="1" data-on={pin.on} data-name={pin.name} title={pin.name} style={{position: "absolute", left: pin.x, top: pin.y, display: "flex", alignItems: "center", gap: "7px", padding: "5px 12px 5px 5px", borderRadius: "999px", background: pin.color, color: "#F0F0F0", fontSize: "11.5px", fontWeight: "500", whiteSpace: "nowrap", boxShadow: "0 10px 20px -13px rgba(28,28,28,.85)"}}>
                            <span style={{display: "grid", placeItems: "center", width: "20px", height: "20px", borderRadius: "999px", background: "#1C1C1C", color: "#F0F0F0", fontSize: "8.5px", fontWeight: "700"}}>{pin.ini}</span>
                            {pin.name}
                          </span>
                        </Fragment>
                      ))}
                    </div>
                  </div>
                </section>
                <div style={{display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,190px),1fr))", gap: "clamp(12px,1.4vw,20px)", alignItems: "end"}}>
                  <div style={{display: "flex", flexDirection: "column", gap: "8px"}}>
                    <div style={{display: "flex", alignItems: "flex-start", gap: "10px"}}>
                      <span style={{fontSize: "clamp(40px,4vw,54px)", lineHeight: ".9", fontWeight: "700", letterSpacing: "-.04em", backgroundImage: "radial-gradient(circle at 50% 50%,#1C1C1C 1.45px,transparent 1.55px)", backgroundSize: "3.2px 3.2px", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent", WebkitTextFillColor: "transparent", animation: "lsPop .7s cubic-bezier(.22,1,.36,1) both"}}>{V.mapsProgress}</span>
                      <span style={{fontSize: "17px", color: "#5A5F5C", marginTop: "8px"}}>/{V.mapsProgressTotal}</span>
                      <span style={{marginLeft: "auto", padding: "5px 11px", borderRadius: "999px", background: "#F5F5F4", fontSize: "11.5px", fontWeight: "500"}}>{V.mapsProgressBadge}</span>
                    </div>
                    <div style={{fontSize: "13.5px", color: "#4A4F4B"}}>Progress</div>
                    <div style={{display: "flex", gap: "4px"}}>
                      {(V.mapsProgressBars ?? []).map((b, __ib) => (
                        <Fragment key={__ib}>
                          <span style={b.style}></span>
                        </Fragment>
                      ))}
                    </div>
                  </div>
                  <div style={{display: "flex", flexDirection: "column", gap: "8px"}}>
                    <div style={{display: "flex", alignItems: "flex-start", gap: "10px"}}>
                      <span style={{fontSize: "clamp(40px,4vw,54px)", lineHeight: ".9", fontWeight: "700", letterSpacing: "-.04em", backgroundImage: "radial-gradient(circle at 50% 50%,#1C1C1C 1.45px,transparent 1.55px)", backgroundSize: "3.2px 3.2px", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent", WebkitTextFillColor: "transparent", animation: "lsPop .7s cubic-bezier(.22,1,.36,1) both"}}>{V.mapsWithPhone}</span>
                      <span style={{fontSize: "17px", color: "#5A5F5C", marginTop: "8px"}}>/{V.mapsTotal}</span>
                      <span style={{marginLeft: "auto", padding: "5px 11px", borderRadius: "999px", background: "#F5F5F4", fontSize: "11.5px", fontWeight: "500"}}>{V.mapsPhonePct}</span>
                    </div>
                    <div style={{fontSize: "13.5px", color: "#4A4F4B"}}>Phones found</div>
                    <div style={{display: "flex", gap: "4px"}}>
                      {(V.mapsPhoneBars ?? []).map((b, __ib) => (
                        <Fragment key={__ib}>
                          <span style={b.style}></span>
                        </Fragment>
                      ))}
                    </div>
                  </div>
                  <div style={{display: "flex", flexDirection: "column", gap: "8px"}}>
                    <div style={{display: "flex", alignItems: "flex-start", gap: "10px"}}>
                      <span style={{fontSize: "clamp(40px,4vw,54px)", lineHeight: ".9", fontWeight: "700", letterSpacing: "-.04em", backgroundImage: "radial-gradient(circle at 50% 50%,#1C1C1C 1.45px,transparent 1.55px)", backgroundSize: "3.2px 3.2px", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent", WebkitTextFillColor: "transparent", animation: "lsPop .7s cubic-bezier(.22,1,.36,1) both"}}>{V.mapsWithWebsite}</span>
                      <span style={{fontSize: "17px", color: "#5A5F5C", marginTop: "8px"}}>/{V.mapsTotal}</span>
                      <span style={{marginLeft: "auto", padding: "5px 11px", borderRadius: "999px", background: "#F5F5F4", fontSize: "11.5px", fontWeight: "500"}}>{V.mapsWebsitePct}</span>
                    </div>
                    <div style={{fontSize: "13.5px", color: "#4A4F4B"}}>Websites found</div>
                    <div style={{display: "flex", gap: "4px"}}>
                      {(V.mapsWebsiteBars ?? []).map((b, __ib) => (
                        <Fragment key={__ib}>
                          <span style={b.style}></span>
                        </Fragment>
                      ))}
                    </div>
                  </div>
                  <div style={{display: "flex", flexDirection: "column", gap: "8px"}}>
                    <div style={{display: "flex", alignItems: "flex-start", gap: "10px"}}>
                      <span style={{fontSize: "clamp(40px,4vw,54px)", lineHeight: ".9", fontWeight: "700", letterSpacing: "-.04em", backgroundImage: "radial-gradient(circle at 50% 50%,#1C1C1C 1.45px,transparent 1.55px)", backgroundSize: "3.2px 3.2px", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent", WebkitTextFillColor: "transparent", animation: "lsPop .7s cubic-bezier(.22,1,.36,1) both"}}>{V.mapsWithEmail}</span>
                      <span style={{fontSize: "17px", color: "#5A5F5C", marginTop: "8px"}}>/{V.mapsTotal}</span>
                      <span style={{marginLeft: "auto", padding: "5px 11px", borderRadius: "999px", background: "#F5F5F4", fontSize: "11.5px", fontWeight: "500"}}>{V.mapsEmailPct}</span>
                    </div>
                    <div style={{fontSize: "13.5px", color: "#4A4F4B"}}>Emails found</div>
                    <div style={{display: "flex", gap: "4px"}}>
                      {(V.mapsEmailBars ?? []).map((b, __ib) => (
                        <Fragment key={__ib}>
                          <span style={b.style}></span>
                        </Fragment>
                      ))}
                    </div>
                  </div>
                </div>
                <div data-results="1" style={{display: "grid", gridTemplateColumns: "minmax(0,1.7fr) minmax(0,1fr)", gap: "clamp(12px,1.4vw,20px)", alignItems: "stretch"}}>
                  <section data-card="1" style={{padding: "22px 24px", borderRadius: "22px", background: "#F5F5F4", transition: "transform .5s cubic-bezier(.22,1,.36,1),box-shadow .5s linear"}}>
                    <div style={{display: "flex", flexWrap: "wrap", alignItems: "center", gap: "12px"}}>
                      <div>
                        <h2 style={{margin: "0", fontSize: "19px", fontWeight: "500", letterSpacing: "-.01em"}}>Results</h2>
                        <p style={{margin: "4px 0 0", fontSize: "13.5px", color: "#5A5F5C"}}>{V.mapsCaptured}</p>
                      </div>
                      <div style={{display: "flex", alignItems: "center", gap: "10px", flex: "1", minWidth: "190px", height: "42px", padding: "0 16px", marginLeft: "auto", borderRadius: "999px", background: "#EAEAE8"}}>
                        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="#3A3D3B" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true" style={{flex: "none"}}>
                          <circle cx="11" cy="11" r="6.5"></circle>
                          <path d="M16 16l4.5 4.5"></path>
                        </svg>
                        <input type="search" placeholder="Filter leads..." aria-label="Filter leads" style={{flex: "1", minWidth: "0", height: "100%", border: "0", background: "transparent", fontSize: "13.5px", color: "#1C1C1C", outline: "none"}} data-mapsfilter="1" value={V.mapsQueryText} onInput={V.onMapsInput} />
                      </div>
                      <button type="button" onClick={V.openExp} data-run="1" style={{display: "inline-flex", alignItems: "center", gap: "8px", height: "42px", padding: "0 18px", border: "0", borderRadius: "999px", background: "#1C1C1C", color: "#F0F0F0", fontFamily: "inherit", fontSize: "13px", fontWeight: "500", whiteSpace: "nowrap", cursor: "pointer", transition: "transform .3s cubic-bezier(.22,1,.36,1)"}}>
                        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M12 4v10"></path>
                          <path d="M8 10.5l4 4 4-4"></path>
                          <path d="M4.5 18.5h15"></path>
                        </svg>
                        Export
                      </button>
                    </div>
                    <div data-rowsblock="1" style={{marginTop: "18px"}}>
                      <div data-rowgrid="1" data-rowhead="1" style={{display: "grid", alignItems: "end", gap: "10px", padding: "0 0 11px", borderBottom: "1px solid #DEDFDC"}}>
                        <span></span>
                        <span style={{fontSize: "10px", fontWeight: "500", letterSpacing: ".15em", textTransform: "uppercase", color: "#555956"}}>Business</span>
                        <span style={{fontSize: "10px", fontWeight: "500", letterSpacing: ".15em", textTransform: "uppercase", color: "#555956"}}>Contact</span>
                        <span data-col="addr" style={{fontSize: "10px", fontWeight: "500", letterSpacing: ".15em", textTransform: "uppercase", color: "#555956"}}>Address</span>
                        <span data-col="rate" style={{fontSize: "10px", fontWeight: "500", letterSpacing: ".15em", textTransform: "uppercase", color: "#555956"}}>Rating</span>
                        <span data-col="soc" style={{fontSize: "10px", fontWeight: "500", letterSpacing: ".15em", textTransform: "uppercase", color: "#555956"}}>Socials</span>
                        <span style={{fontSize: "10px", fontWeight: "500", letterSpacing: ".15em", textTransform: "uppercase", color: "#555956", whiteSpace: "nowrap"}}>Score ▾</span>
                        <span style={{fontSize: "10px", fontWeight: "500", letterSpacing: ".15em", textTransform: "uppercase", color: "#555956", whiteSpace: "nowrap"}}>Decision</span>
                      </div>
                      <ul style={{listStyle: "none", margin: "0", padding: "0", display: "flex", flexDirection: "column"}}>
                        {shows(V.mapsState) ? (
                          <>
                          <li style={{padding: "26px 0", borderTop: "1px solid #E4E5E2", color: "#5A5F5C", fontSize: "13.5px"}}>{V.mapsState}</li>
                          </>
                        ) : null}
                        {(V.mapsRows ?? []).map((mr, __imr) => (
                          <Fragment key={__imr}>
                            <li data-row="1" data-rowgrid="1" style={{display: "grid", flexWrap: "wrap", alignItems: "center", gap: "10px", padding: "14px 0", borderTop: "1px solid #E4E5E2", transition: "background .25s linear"}}>
                              <span aria-hidden="true" style={{display: "grid", placeItems: "center", width: "40px", height: "40px", borderRadius: "12px", background: "#C8D5BB", fontSize: "13px", fontWeight: "700", flex: "none"}}>{mr.ini}</span>
                              <span style={{minWidth: "162px"}}>
                                <span style={{display: "block", fontSize: "14.5px", fontWeight: "500"}}>{mr.name}</span>
                                <span title={mr.domain} style={{display: "block", marginTop: "3px", fontSize: "12.5px", color: "#5A5F5C", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis"}}>{mr.domain}</span>
                                <span data-inline-addr="1" style={{display: "none", marginTop: "3px", fontSize: "12.5px", color: "#5A5F5C"}}>{mr.address}</span>
                              </span>
                              <span style={{minWidth: "152px", fontSize: "12.5px", color: "#4A4F4B", lineHeight: "1.5"}}>
                                <span style={{display: "block", whiteSpace: "nowrap"}}>{mr.phone}</span>
                                <span title={mr.email} style={{display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis"}}>{mr.email}</span>
                              </span>
                              <span data-col="addr" style={{minWidth: "146px", fontSize: "12.5px", color: "#4A4F4B", lineHeight: "1.5"}}>
                                {mr.addressLine1}
                                <br />
                                {mr.addressLine2}
                              </span>
                              <span data-col="rate" style={{minWidth: "68px", fontSize: "13px", color: "#4A4F4B"}}>
                                {mr.rating}
                                <br />
                                <span style={{color: "#5A5F5C"}}>{mr.reviews}</span>
                              </span>
                              <span data-col="soc" style={{display: "flex", gap: "5px", minWidth: "54px"}}>
                                {shows(mr.noSocials) ? (
                                  <>
                                  none
                                  </>
                                ) : null}
                                {(mr.socials ?? []).map((sn, __isn) => (
                                  <Fragment key={__isn}>
                                    <span data-col="soc" style={{display: "flex", gap: "5px", minWidth: "54px"}}>{sn.short}</span>
                                  </Fragment>
                                ))}
                              </span>
                              <span style={{padding: "5px 10px", borderRadius: "999px", background: mr.scoreBg, color: mr.scoreColor, fontWeight: "500", fontSize: "11.5px", minWidth: "46px", textAlign: "center"}}>{mr.score}</span>
                              <span style={{padding: "5px 10px", borderRadius: "999px", background: mr.decisionBg, color: mr.decisionColor, fontSize: "11.5px", minWidth: "78px", textAlign: "center"}}>{mr.decision}</span>
                            </li>
                          </Fragment>
                        ))}
                      </ul>
                    </div>
                    <div style={{display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "12px", marginTop: "18px", paddingTop: "16px", borderTop: "1px solid #E4E5E2"}}>
                      <span style={{fontSize: "12.5px", color: "#5A5F5C"}}>Showing {V.mapsShowing} of {V.mapsTotal} results</span>
                      {shows(V.mapsMoreOn) ? (
                        <>
                        <button type="button" data-more="1" style={{display: "inline-flex", alignItems: "center", gap: "9px", height: "40px", padding: "0 18px", border: "0", borderRadius: "999px", background: "#EAEAE8", color: "#1C1C1C", fontFamily: "inherit", fontSize: "13px", fontWeight: "500", cursor: "pointer", transition: "background .25s linear"}} onClick={V.showMoreMaps}>
                          {V.mapsMoreLabel}{' '}
                          <span aria-hidden="true">↓</span>
                        </button>
                        </>
                      ) : null}
                    </div>
                  </section>
                  <section data-card="1" style={{padding: "22px 24px", borderRadius: "22px", background: "#1C1C1C", color: "#F0F0F0", transition: "transform .5s cubic-bezier(.22,1,.36,1),box-shadow .5s linear"}}>
                    <div style={{display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px"}}>
                      <div>
                        <h2 style={{margin: "0", fontSize: "19px", fontWeight: "500", letterSpacing: "-.01em"}}>Live Activity</h2>
                        <p style={{margin: "4px 0 0", fontSize: "13.5px", color: "#9BA29C"}}>Run log, newest first.</p>
                      </div>
                      <span aria-hidden="true" style={{width: "8px", height: "8px", marginTop: "8px", borderRadius: "999px", background: "#C8D5BB", flex: "none", animation: "lsPulse 2.4s ease-in-out infinite"}}></span>
                    </div>
                    <ul style={{listStyle: "none", margin: "18px 0 0", padding: "0", display: "flex", flexDirection: "column", gap: "12px"}}>
                      {shows(V.mapsActivityEmpty) ? (
                        <>
                        <li style={{padding: "12px 0", borderBottom: "1px solid #2E302F", fontSize: "12.5px", color: "#9BA29C"}}>{V.mapsActivityEmpty}</li>
                        </>
                      ) : null}
                      {(V.mapsActivity ?? []).map((a, __ia) => (
                        <Fragment key={__ia}>
                          <li style={{display: "flex", flexDirection: "column", gap: "5px", paddingBottom: "12px", borderBottom: "1px solid #2E302F"}}>
                            <span style={{display: "flex", alignItems: "center", gap: "9px"}}>
                              <span style={{fontSize: "11.5px", color: "#9BA29C", letterSpacing: ".04em"}}>{a.when}</span>
                              {shows(a.isWarn) ? (
                                <>
                                <span style={{padding: "3px 9px", borderRadius: "7px", background: "#8C4A3F", color: "#F7EDEA", fontSize: "10px", fontWeight: "700", letterSpacing: ".08em"}}>{a.level}</span>
                                </>
                              ) : null}
                              {shows(a.isLive) ? (
                                <>
                                <span style={{padding: "3px 9px", borderRadius: "7px", background: "#C8D5BB", color: "#1C1C1C", fontSize: "10px", fontWeight: "700", letterSpacing: ".08em"}}>LIVE</span>
                                </>
                              ) : null}
                              {shows(a.isInfo) ? (
                                <>
                                <span style={{padding: "3px 9px", borderRadius: "7px", background: "#2E302F", color: "#B9BEB7", fontSize: "10px", fontWeight: "700", letterSpacing: ".08em"}}>INFO</span>
                                </>
                              ) : null}
                              {shows(a.isOk) ? (
                                <>
                                <span style={{padding: "3px 9px", borderRadius: "7px", background: "#C8D5BB", color: "#1C1C1C", fontSize: "10px", fontWeight: "700", letterSpacing: ".08em"}}>OK</span>
                                </>
                              ) : null}
                            </span>
                            <span style={{fontSize: "13px", color: "#E4E6E3"}}>{a.title}</span>
                            <span style={{fontSize: "12px", color: "#9BA29C"}}>{a.detail}</span>
                          </li>
                        </Fragment>
                      ))}
                    </ul>
                  </section>
                </div>
              </div>
              </>
            ) : null}
            {shows(V.isSocial) ? (
              <>
              <div style={{display: "flex", flexDirection: "column", gap: "clamp(12px,1.5vw,20px)"}}>
                <div style={{display: "flex", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: "16px"}}>
                  <div>
                    <div style={{display: "flex", alignItems: "center", gap: "12px"}}>
                      <h1 style={{margin: "0", fontSize: "clamp(26px,2.6vw,36px)", lineHeight: "1.1", letterSpacing: "-.03em", fontWeight: "400"}}>Social Profiles</h1>
                      <span style={{display: "inline-flex", alignItems: "center", gap: "7px", padding: "6px 13px", borderRadius: "999px", background: "#E3E4E1", fontSize: "10.5px", fontWeight: "500", letterSpacing: ".14em", color: "#4A4F4B"}}>
                        <span aria-hidden="true" style={{width: "6px", height: "6px", borderRadius: "999px", background: "#8B908C"}}></span>
                        {V.fPhone.scanning ? 'CHECKING' : 'IDLE'}{' '}
                      </span>
                    </div>
                    <p style={{margin: "8px 0 0", maxWidth: "76ch", fontSize: "14.5px", color: "#5A5F5C", textWrap: "pretty"}}>All scraped leads with their social profile URLs. Same engine as Email Finder — different lens.</p>
                  </div>
                  <button type="button" data-run="1" style={{display: "inline-flex", alignItems: "center", gap: "9px", height: "44px", padding: "0 22px", border: "0", borderRadius: "999px", background: "#1C1C1C", color: "#F0F0F0", fontFamily: "inherit", fontSize: "13.5px", fontWeight: "500", cursor: "pointer", transition: "transform .3s cubic-bezier(.22,1,.36,1)"}} onClick={V.deepRun} data-deeprun="1">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <circle cx="12" cy="12" r="8.5"></circle>
                      <path d="M3.5 12h17M12 3.5c2.2 2.4 3.3 5.3 3.3 8.5S14.2 18.1 12 20.5c-2.2-2.4-3.3-5.3-3.3-8.5S9.8 5.9 12 3.5z"></path>
                    </svg>
                    {' '}Deep enrich missing{' '}
                  </button>
                </div>
                <div data-socbar="1" style={{position: "sticky", top: "12px", zIndex: "30", padding: "14px 16px", borderRadius: "22px", background: "#F5F5F4", boxShadow: "0 18px 36px -26px rgba(28,28,28,.55)"}} data-soctoolbar="1">
                  <div style={{display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px"}}>
                    <div style={{display: "flex", alignItems: "center", gap: "10px", flex: "1", minWidth: "220px", height: "44px", padding: "0 16px", borderRadius: "999px", background: "#EAEAE8"}}>
                      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="#3A3D3B" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true" style={{flex: "none"}}>
                        <circle cx="11" cy="11" r="6.5"></circle>
                        <path d="M16 16l4.5 4.5"></path>
                      </svg>
                      <input data-socq="1" type="search" onInput={V.onSocInput} onKeyDown={V.onSocKey} onBlur={V.onSocBlur} placeholder="Search name, domain, handle or profile URL…" aria-label="Search profiles" style={{flex: "1", minWidth: "0", height: "100%", border: "0", background: "transparent", fontSize: "13.5px", color: "#1C1C1C", outline: "none"}} data-socsearch="1" value={V.socQ} />
                    </div>
                    <span style={{position: "relative", display: "block"}}>
                      <select onChange={V.onSocState} aria-label="Profile state" style={{height: "44px", padding: "0 36px 0 16px", border: "0", borderRadius: "999px", background: "#EAEAE8", fontFamily: "inherit", fontSize: "13.5px", color: "#1C1C1C", outline: "none", appearance: "none"}} data-socfilter="1">
                        <option>All</option>
                        <option>With socials</option>
                        <option>Pending</option>
                        <option>No website</option>
                      </select>
                      <span aria-hidden="true" style={{position: "absolute", right: "14px", top: "15px", display: "block", pointerEvents: "none", color: "#4A4F4B"}}>
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M6 9.5l6 6 6-6"></path>
                        </svg>
                      </span>
                    </span>
                    <button type="button" onClick={V.openImp} data-run="1" style={{display: "inline-flex", alignItems: "center", gap: "9px", height: "44px", padding: "0 20px", border: "0", borderRadius: "999px", background: "#1C1C1C", color: "#F0F0F0", fontFamily: "inherit", fontSize: "13.5px", fontWeight: "500", cursor: "pointer", transition: "transform .3s cubic-bezier(.22,1,.36,1)"}} data-socimpopen="1">
                      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M12 15.5V4"></path>
                        <path d="M8 7.5l4-4 4 4"></path>
                        <path d="M4.5 19.5h15"></path>
                      </svg>
                      {' '}Import websites{' '}
                    </button>
                    <button type="button" onClick={V.socRefresh} data-ghost="1" style={{display: "inline-flex", alignItems: "center", gap: "8px", height: "44px", padding: "0 18px", border: "0", borderRadius: "999px", background: "#E5E5E5", color: "#1C1C1C", fontFamily: "inherit", fontSize: "13.5px", fontWeight: "500", cursor: "pointer", transition: "background .25s linear"}} data-socrefresh="1">
                      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M20 12a8 8 0 1 1-2.6-5.9"></path>
                        <path d="M20 4v4.5h-4.5"></path>
                      </svg>
                      {' '}Refresh{' '}
                    </button>
                    <button type="button" onClick={V.openShist} data-ghost="1" style={{display: "inline-flex", alignItems: "center", gap: "8px", height: "44px", padding: "0 18px", border: "0", borderRadius: "999px", background: "#E5E5E5", color: "#1C1C1C", fontFamily: "inherit", fontSize: "13.5px", fontWeight: "500", cursor: "pointer", transition: "background .25s linear"}} data-shistopen="1" data-maphistopen="1">
                      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M4 12a8 8 0 1 0 2.4-5.7"></path>
                        <path d="M4 4.5V8.5h4"></path>
                        <path d="M12 8v4.5l3 2"></path>
                      </svg>
                      {' '}History{' '}
                      <span style={{display: "grid", placeItems: "center", minWidth: "22px", height: "22px", padding: "0 6px", borderRadius: "999px", background: "#C8D5BB", fontSize: "11px", fontWeight: "600"}}>{V.shCount}</span>
                    </button>
                  </div>
                  <div style={{display: "flex", flexWrap: "wrap", alignItems: "center", gap: "6px", marginTop: "10px"}}>
                    <span style={{marginRight: "4px", fontSize: "10.5px", fontWeight: "500", letterSpacing: ".14em", textTransform: "uppercase", color: "#555956"}}>Recent</span>
                    {(V.socHist ?? []).map((h, __ih) => (
                      <Fragment key={__ih}>
                        <button type="button" onClick={h.run} style={{display: "inline-flex", alignItems: "center", gap: "7px", height: "30px", padding: "0 12px", border: "0", borderRadius: "999px", fontFamily: "inherit", fontSize: "12.5px", cursor: "pointer"}} data-socrecent="1">
                          {h.q}
                          <span style={{fontSize: "11px", color: "#5A5F5C", fontVariantNumeric: "tabular-nums"}}>{h.n}</span>
                        </button>
                      </Fragment>
                    ))}
                  </div>
                </div>
                <div data-podium="1" style={{display: "grid", gridTemplateColumns: "minmax(0,1.6fr) minmax(0,1fr)", gap: "clamp(12px,1.4vw,20px)", alignItems: "start"}}>
                  <section data-card="1" style={{padding: "22px 24px", borderRadius: "22px", background: "#F5F5F4", transition: "transform .5s cubic-bezier(.22,1,.36,1),box-shadow .5s linear"}}>
                    <div style={{display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px"}}>
                      <div>
                        <h2 data-covcard="1" style={{margin: "0", fontSize: "19px", fontWeight: "500", letterSpacing: "-.01em"}}>Platform Coverage</h2>
                        <p style={{margin: "4px 0 0", fontSize: "13.5px", color: "#5A5F5C"}}>{V.covSub}</p>
                      </div>
                      <span data-open="1" aria-hidden="true" style={{display: "grid", placeItems: "center", width: "36px", height: "36px", borderRadius: "999px", background: "#EAEAE8", fontSize: "14px", flex: "none"}}>↗</span>
                    </div>
                    {shows(V.covScanning) ? (
                      <>
                      <div style={{display: "flex", alignItems: "center", gap: "10px", marginTop: "16px", padding: "10px 14px", borderRadius: "14px", background: "#E7EDE0", animation: "lsPanelIn .4s cubic-bezier(.22,1,.36,1) both"}}>
                        <span aria-hidden="true" style={{width: "12px", height: "12px", borderRadius: "999px", border: "2px solid rgba(28,28,28,.2)", borderTopColor: "#1C1C1C", animation: "lsSpin .8s linear infinite", flex: "none"}}></span>
                        <span style={{fontSize: "13px", fontWeight: "500"}}>{V.covBadge}</span>
                      </div>
                      </>
                    ) : null}
                    {shows(V.covResult) ? (
                      <>
                      <div style={{display: "flex", flexWrap: "wrap", alignItems: "center", gap: "10px", marginTop: "16px", padding: "8px 8px 8px 14px", borderRadius: "14px", background: "#E7EDE0", animation: "lsPanelIn .4s cubic-bezier(.22,1,.36,1) both"}}>
                        <span style={{flex: "1", minWidth: "180px", fontSize: "13px", fontWeight: "500"}}>{V.covResultLabel}</span>
                        <button type="button" onClick={V.exitScan} style={{height: "32px", padding: "0 14px", border: "0", borderRadius: "999px", background: "#1C1C1C", color: "#F0F0F0", fontFamily: "inherit", fontSize: "12.5px", fontWeight: "500", cursor: "pointer"}} data-exitscan="1">Show all leads</button>
                      </div>
                      </>
                    ) : null}
                    <div style={{display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(96px,1fr))", gap: "14px", marginTop: "20px"}}>
                      {(V.covRings ?? []).map((r, __ir) => (
                        <Fragment key={__ir}>
                          <div style={{display: "flex", flexDirection: "column", alignItems: "center", gap: "10px"}}>
                            <span style={{position: "relative", display: "grid", placeItems: "center", width: "98px", height: "98px"}}>
                              <svg viewBox="0 0 100 100" aria-hidden="true" style={{position: "absolute", inset: "0", width: "100%", height: "100%", transform: "rotate(-90deg)"}}>
                                <circle cx="50" cy="50" r="44" fill="none" stroke="#DADCD7" strokeWidth="7"></circle>
                                <circle cx="50" cy="50" r="44" fill="none" stroke="#1C1C1C" strokeWidth="7" strokeLinecap="round" strokeDasharray="276.5" strokeDashoffset={r.off}></circle>
                              </svg>
                              <span style={{fontSize: "22px", fontWeight: "400", letterSpacing: "-.02em", fontVariantNumeric: "tabular-nums"}}>
                                {r.pct}
                                <span style={{fontSize: "11px", color: "#5A5F5C"}}>%</span>
                              </span>
                            </span>
                            <span style={{textAlign: "center"}}>
                              <span style={{display: "block", fontSize: "13.5px", fontWeight: "500"}}>{r.name}</span>
                              <span style={{display: "block", marginTop: "2px", fontSize: "12px", color: "#5A5F5C", fontVariantNumeric: "tabular-nums"}}>{r.leads}</span>
                            </span>
                          </div>
                        </Fragment>
                      ))}
                    </div>
                    <ul style={{listStyle: "none", margin: "20px 0 0", padding: "0", display: "flex", flexDirection: "column"}}>
                      {(V.covBars ?? []).map((b, __ib) => (
                        <Fragment key={__ib}>
                          <li style={{display: "flex", alignItems: "center", gap: "12px", padding: "10px 0", borderTop: "1px solid #E4E5E2"}}>
                            <span aria-hidden="true" style={{display: "grid", placeItems: "center", width: "26px", height: "26px", borderRadius: "8px", background: "#E3E4E1", fontSize: "10.5px", fontWeight: "700", flex: "none"}}>{b.tag}</span>
                            <span style={{flex: "1", fontSize: "14px"}}>{b.name}</span>
                            <span style={{width: "74px", height: "6px", borderRadius: "3px", background: "#E3E4E1", overflow: "hidden"}}>
                              <span style={{display: "block", height: "100%", width: b.w, borderRadius: "3px", background: "#8FA382"}}></span>
                            </span>
                            <span style={{fontSize: "14.5px", fontWeight: "500", minWidth: "22px", textAlign: "right", fontVariantNumeric: "tabular-nums"}}>{b.n}</span>
                          </li>
                        </Fragment>
                      ))}
                    </ul>
                  </section>
                  <section data-card="1" style={{padding: "22px", borderRadius: "22px", background: "linear-gradient(180deg,#CBD8BC,#B4C6A2)", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", transition: "transform .5s cubic-bezier(.22,1,.36,1),box-shadow .5s linear"}}>
                    <h2 style={{margin: "0", fontSize: "17px", fontWeight: "500"}}>AI Insights</h2>
                    <span aria-hidden="true" style={{display: "grid", placeItems: "center", width: "128px", height: "128px", margin: "10px 0 8px", borderRadius: "999px", background: "radial-gradient(circle at 50% 42%,#F7F9F5 0%,#EEF2E9 62%,#E2E9DA 100%)", boxShadow: "inset 0 0 0 1px rgba(28,28,28,.07),0 14px 26px -18px rgba(28,28,28,.5)"}}>
                      <span style={{position: "relative", display: "block", width: "104px", height: "104px", overflow: "hidden"}}>
                        <span data-lottie="1" style={{position: "absolute", top: "-6px", left: "-6px", display: "block", width: "116px", height: "116px"}}></span>
                      </span>
                    </span>
                    <p style={{margin: "0", fontSize: "13px", lineHeight: "1.5", color: "#2C332A", textWrap: "pretty"}}>{V.socialInsight}</p>
                  </section>
                </div>
                <section data-card="1" style={{padding: "22px 24px", borderRadius: "22px", background: "#F5F5F4", transition: "transform .5s cubic-bezier(.22,1,.36,1),box-shadow .5s linear"}}>
                  <div style={{display: "flex", flexWrap: "wrap", alignItems: "center", gap: "12px"}}>
                    <div>
                      <h2 style={{margin: "0", fontSize: "19px", fontWeight: "500", letterSpacing: "-.01em"}} data-profcard="1">Profiles</h2>
                      <p data-soccount="1" style={{margin: "4px 0 0", fontSize: "13.5px", color: "#5A5F5C"}}>Showing {V.socialShowing} of {V.socialTotal} leads.</p>
                    </div>
                    <button type="button" onClick={V.exportProfiles} data-run="1" style={{display: "inline-flex", alignItems: "center", gap: "8px", height: "40px", padding: "0 18px", marginLeft: "auto", border: "0", borderRadius: "999px", background: "#1C1C1C", color: "#F0F0F0", fontFamily: "inherit", fontSize: "13px", fontWeight: "500", whiteSpace: "nowrap", cursor: "pointer", transition: "transform .3s cubic-bezier(.22,1,.36,1)"}}>
                      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M12 4v10"></path>
                        <path d="M8 10.5l4 4 4-4"></path>
                        <path d="M4.5 18.5h15"></path>
                      </svg>
                      Export
                    </button>
                  </div>
                  <div data-rowsblock="1" style={{marginTop: "18px"}}>
                    <div data-rowgrid="1" data-sochead="1" style={{display: "grid", alignItems: "end", gap: "10px", padding: "0 0 11px", borderBottom: "1px solid #DEDFDC"}}>
                      <span></span>
                      <span data-col="idx" style={{fontSize: "10px", fontWeight: "500", letterSpacing: ".15em", textTransform: "uppercase", color: "#555956", whiteSpace: "nowrap"}}>#</span>
                      <span style={{fontSize: "10px", fontWeight: "500", letterSpacing: ".15em", textTransform: "uppercase", color: "#555956", whiteSpace: "nowrap"}}>Business</span>
                      <span data-col="dom" style={{fontSize: "10px", fontWeight: "500", letterSpacing: ".15em", textTransform: "uppercase", color: "#555956", whiteSpace: "nowrap"}}>Domain</span>
                      <span style={{fontSize: "10px", fontWeight: "500", letterSpacing: ".15em", textTransform: "uppercase", color: "#555956", whiteSpace: "nowrap"}}>Profiles</span>
                      <span style={{fontSize: "10px", fontWeight: "500", letterSpacing: ".15em", textTransform: "uppercase", color: "#555956", whiteSpace: "nowrap"}}>Status</span>
                    </div>
                    <ul data-soclist="1" style={{listStyle: "none", margin: "0", padding: "0", display: "flex", flexDirection: "column"}}>
                      {shows(V.socialState) ? (
                        <>
                        <li style={{display: "flex", alignItems: "center", gap: "10px", padding: "13px 0", borderTop: "1px solid #E4E5E2", color: "#5A5F5C", fontSize: "13.5px"}}>{V.socialState}</li>
                        </>
                      ) : null}
                      {(V.scanRows ?? []).map((sr, __isr) => (
                        <Fragment key={__isr}>
                          <li data-row="1" data-rowgrid="1" data-scanrow={sr.phase} style={{display: "grid", flexWrap: "wrap", alignItems: "center", gap: "10px", padding: "13px 0", borderTop: "1px solid #E4E5E2", transition: "background .6s linear", animation: "lsPanelIn .45s cubic-bezier(.22,1,.36,1) both"}}>
                            <span style={{display: "grid", placeItems: "center", width: "16px", height: "16px", borderRadius: "5px", border: "1.5px solid #C6C8C4"}}></span>
                            <span data-col="idx" style={{minWidth: "34px", fontSize: "11px", fontWeight: "600", letterSpacing: ".08em", color: "#4A4F4B"}}>NEW</span>
                            <span style={{minWidth: "158px", fontSize: "14.5px", fontWeight: "500"}}>{sr.name}</span>
                            <span data-col="dom" title={sr.domain} style={{minWidth: "140px", fontSize: "12.5px", color: "#4A4F4B", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis"}}>{sr.domain}</span>
                            <span style={{display: "flex", gap: "5px", alignItems: "center", minWidth: "150px"}}>
                              {shows(sr.scanning) ? (
                                <>
                                <span style={{display: "inline-flex", alignItems: "center", gap: "7px", fontSize: "12.5px", color: "#4A4F4B"}}>
                                  <span aria-hidden="true" style={{width: "11px", height: "11px", borderRadius: "999px", border: "1.5px solid rgba(28,28,28,.2)", borderTopColor: "#1C1C1C", animation: "lsSpin .8s linear infinite"}}></span>
                                  {sr.scanLabel}
                                </span>
                                </>
                              ) : null}
                              {(sr.profiles ?? []).map((p, __ip) => (
                                <Fragment key={__ip}>
                                  <a href={p.url} target="_blank" rel="noopener noreferrer" data-social-profile-link={p.url} aria-label={`Open ${p.tag} profile`} title={p.url} style={{display: "grid", placeItems: "center", width: "26px", height: "26px", borderRadius: "8px", background: "#E3E4E1", color: "#1C1C1C", fontSize: "10.5px", fontWeight: "700", textDecoration: "none", cursor: "pointer", animation: "lsPanelIn .4s cubic-bezier(.22,1,.36,1) both"}}>{p.tag}</a>
                                </Fragment>
                              ))}
                              {shows(sr.none) ? (
                                <>
                                <span style={{fontSize: "12.5px", color: "#5A5F5C"}}>No profiles found</span>
                                </>
                              ) : null}
                            </span>
                            <span data-impst={sr.pill} style={{padding: "5px 10px", borderRadius: "999px", fontSize: "11.5px", minWidth: "96px", textAlign: "center", whiteSpace: "nowrap"}}>{sr.status}</span>
                          </li>
                        </Fragment>
                      ))}
                    </ul>
                  </div>
                </section>
              </div>
              </>
            ) : null}
            {shows(V.isEmail) ? (
              <>
              <div style={{display: "flex", flexDirection: "column", gap: "clamp(12px,1.5vw,20px)"}}>
                <div style={{display: "flex", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: "16px"}}>
                  <div>
                    <div style={{display: "flex", alignItems: "center", gap: "12px"}}>
                      <h1 style={{margin: "0", fontSize: "clamp(26px,2.6vw,36px)", lineHeight: "1.1", letterSpacing: "-.03em", fontWeight: "400"}}>Email Finder</h1>
                      <span style={{display: "inline-flex", alignItems: "center", gap: "7px", padding: "6px 13px", borderRadius: "999px", background: "#E3E4E1", fontSize: "10.5px", fontWeight: "500", letterSpacing: ".14em", color: "#4A4F4B"}}>
                        <span aria-hidden="true" style={{width: "6px", height: "6px", borderRadius: "999px", background: "#8B908C"}}></span>
                        IDLE{' '}
                      </span>
                    </div>
                    <p style={{margin: "8px 0 0", maxWidth: "76ch", fontSize: "14.5px", color: "#5A5F5C", textWrap: "pretty"}}>All scraped leads with their enrichment status. Run the cascade in bulk.</p>
                  </div>
                  <button data-action="Run the cascade" type="button" data-run="1" style={{display: "inline-flex", alignItems: "center", gap: "9px", height: "44px", padding: "0 22px", border: "0", borderRadius: "999px", background: "#1C1C1C", color: "#F0F0F0", fontFamily: "inherit", fontSize: "13.5px", fontWeight: "500", cursor: "pointer", transition: "transform .3s cubic-bezier(.22,1,.36,1)"}}>
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <rect x="3.5" y="5.5" width="17" height="13" rx="3"></rect>
                      <path d="M4 7.5l8 5.5 8-5.5"></path>
                    </svg>
                    {' '}Run the cascade{' '}
                  </button>
                </div>
                <div data-socbar="1" style={{position: "sticky", top: "12px", zIndex: "30", padding: "14px 16px", borderRadius: "22px", background: "#F5F5F4", boxShadow: "0 18px 36px -26px rgba(28,28,28,.55)"}}>
                  <div style={{display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px"}}>
                    <div style={{display: "flex", alignItems: "center", gap: "10px", flex: "1", minWidth: "220px", height: "44px", padding: "0 16px", borderRadius: "999px", background: "#EAEAE8"}}>
                      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="#3A3D3B" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true" style={{flex: "none"}}>
                        <circle cx="11" cy="11" r="6.5"></circle>
                        <path d="M16 16l4.5 4.5"></path>
                      </svg>
                      <input data-fq="email" type="search" onInput={V.fEmail.onInput} onKeyDown={V.fEmail.onKey} onBlur={V.fEmail.onBlur} placeholder="Search business, domain or email address…" aria-label="Search business, domain or email address" style={{flex: "1", minWidth: "0", height: "100%", border: "0", background: "transparent", fontSize: "13.5px", color: "#1C1C1C", outline: "none"}} value={V.fEmail.q} />
                    </div>
                    <span style={{position: "relative", display: "block"}}>
                      <select onChange={V.fEmail.onState} aria-label="Filter rows" style={{height: "44px", padding: "0 36px 0 16px", border: "0", borderRadius: "999px", background: "#EAEAE8", fontFamily: "inherit", fontSize: "13.5px", color: "#1C1C1C", outline: "none", appearance: "none"}}>
                        <option>All</option>
                        <option>Has email</option>
                        <option>High confidence</option>
                        <option>Needs verify</option>
                        <option>Pending</option>
                        <option>No website</option>
                      </select>
                      <span aria-hidden="true" style={{position: "absolute", right: "14px", top: "15px", display: "block", pointerEvents: "none", color: "#4A4F4B"}}>
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M6 9.5l6 6 6-6"></path>
                        </svg>
                      </span>
                    </span>
                    <button type="button" onClick={V.fEmail.act} data-run="1" style={{display: "inline-flex", alignItems: "center", gap: "9px", height: "44px", padding: "0 20px", border: "0", borderRadius: "999px", background: "#1C1C1C", color: "#F0F0F0", fontFamily: "inherit", fontSize: "13.5px", fontWeight: "500", cursor: "pointer", transition: "transform .3s cubic-bezier(.22,1,.36,1)"}} data-fact="fEmail">
                      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M5 12.5l4.5 4.5L19 7.5"></path>
                      </svg>
                      {' '}Verify all{' '}
                    </button>
                    <button type="button" onClick={V.verifyEmailValidity} data-email-validity="1" data-busy={V.emailValidityBusy} data-ghost="1" style={{display: "inline-flex", alignItems: "center", gap: "8px", height: "44px", padding: "0 18px", border: "0", borderRadius: "999px", background: "#C8D5BB", color: "#1C1C1C", fontFamily: "inherit", fontSize: "13.5px", fontWeight: "500", cursor: "pointer", transition: "background .25s linear,transform .3s cubic-bezier(.22,1,.36,1)"}}>
                      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M12 3.5l7 3v5.2c0 4.1-2.7 7.4-7 8.8-4.3-1.4-7-4.7-7-8.8V6.5l7-3z"></path>
                        <path d="M8.5 12l2.2 2.2 4.8-5"></path>
                      </svg>
                      {' '}{V.emailValidityLabel}{' '}
                    </button>
                    <button type="button" onClick={V.openImp} data-ghost="1" style={{display: "inline-flex", alignItems: "center", gap: "8px", height: "44px", padding: "0 18px", border: "0", borderRadius: "999px", background: "#E5E5E5", color: "#1C1C1C", fontFamily: "inherit", fontSize: "13.5px", fontWeight: "500", cursor: "pointer", transition: "background .25s linear"}}>
                      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M12 15.5V4"></path>
                        <path d="M8 7.5l4-4 4 4"></path>
                        <path d="M4.5 19.5h15"></path>
                      </svg>
                      {' '}Import websites{' '}
                    </button>
                    <button type="button" onClick={V.fEmail.refresh} data-ghost="1" style={{display: "inline-flex", alignItems: "center", gap: "8px", height: "44px", padding: "0 18px", border: "0", borderRadius: "999px", background: "#E5E5E5", color: "#1C1C1C", fontFamily: "inherit", fontSize: "13.5px", fontWeight: "500", cursor: "pointer", transition: "background .25s linear"}}>
                      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M20 12a8 8 0 1 1-2.6-5.9"></path>
                        <path d="M20 4v4.5h-4.5"></path>
                      </svg>
                      {' '}Refresh{' '}
                    </button>
                    <button type="button" onClick={V.fEmail.openHist} data-ghost="1" style={{display: "inline-flex", alignItems: "center", gap: "8px", height: "44px", padding: "0 18px", border: "0", borderRadius: "999px", background: "#E5E5E5", color: "#1C1C1C", fontFamily: "inherit", fontSize: "13.5px", fontWeight: "500", cursor: "pointer", transition: "background .25s linear"}}>
                      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M4 12a8 8 0 1 0 2.4-5.7"></path>
                        <path d="M4 4.5V8.5h4"></path>
                        <path d="M12 8v4.5l3 2"></path>
                      </svg>
                      {' '}History{' '}
                      <span style={{display: "grid", placeItems: "center", minWidth: "22px", height: "22px", padding: "0 6px", borderRadius: "999px", background: "#C8D5BB", fontSize: "11px", fontWeight: "600"}}>{V.fEmail.count}</span>
                    </button>
                  </div>
                  <div style={{display: "flex", flexWrap: "wrap", alignItems: "center", gap: "6px", marginTop: "10px"}}>
                    <span style={{marginRight: "4px", fontSize: "10.5px", fontWeight: "500", letterSpacing: ".14em", textTransform: "uppercase", color: "#555956"}}>Recent</span>
                    {(V.fEmail.hist ?? []).map((h, __ih) => (
                      <Fragment key={__ih}>
                        <button type="button" onClick={h.run} style={{display: "inline-flex", alignItems: "center", gap: "7px", height: "30px", padding: "0 12px", border: "0", borderRadius: "999px", fontFamily: "inherit", fontSize: "12.5px", cursor: "pointer"}} data-socrecent="1">
                          {h.q}
                          <span style={{fontSize: "11px", color: "#5A5F5C", fontVariantNumeric: "tabular-nums"}}>{h.n}</span>
                        </button>
                      </Fragment>
                    ))}
                    <span data-fcount="email" style={{marginLeft: "auto", fontSize: "12px", color: "#5A5F5C"}}>{V.emailShowing} rows on screen</span>
                  </div>
                </div>
                {shows(V.fEmail.scanOn) ? (
                  <>
                  <section data-card="1" style={{padding: "22px 24px", borderRadius: "22px", background: "#F5F5F4", animation: "lsPanelIn .45s cubic-bezier(.22,1,.36,1) both"}}>
                    <h2 data-fcov="email" style={{margin: "0", fontSize: "19px", fontWeight: "500", letterSpacing: "-.01em"}}>Email Coverage</h2>
                    <p style={{margin: "4px 0 0", fontSize: "13.5px", color: "#5A5F5C"}}>{V.fEmail.scanSub}</p>
                    {shows(V.fEmail.scanning) ? (
                      <>
                      <div style={{display: "flex", alignItems: "center", gap: "10px", marginTop: "16px", padding: "10px 14px", borderRadius: "14px", background: "#E7EDE0"}}>
                        <span aria-hidden="true" style={{width: "12px", height: "12px", borderRadius: "999px", border: "2px solid rgba(28,28,28,.2)", borderTopColor: "#1C1C1C", animation: "lsSpin .8s linear infinite", flex: "none"}}></span>
                        <span style={{fontSize: "13px", fontWeight: "500"}}>{V.fEmail.scanBadge}</span>
                      </div>
                      </>
                    ) : null}
                    {shows(V.fEmail.scanOn) ? (
                      <>
                      <div style={{display: "flex", flexWrap: "wrap", alignItems: "center", gap: "10px", marginTop: "16px", padding: "8px 8px 8px 14px", borderRadius: "14px", background: "#E7EDE0"}}>
                        <span style={{flex: "1", minWidth: "180px", fontSize: "13px", fontWeight: "500"}}>{V.fEmail.scanLabel}</span>
                        <button type="button" onClick={V.fEmail.exit} style={{height: "32px", padding: "0 14px", border: "0", borderRadius: "999px", background: "#1C1C1C", color: "#F0F0F0", fontFamily: "inherit", fontSize: "12.5px", fontWeight: "500", cursor: "pointer"}} data-exitscan="1">Show all leads</button>
                      </div>
                      </>
                    ) : null}
                    <div style={{display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(96px,1fr))", gap: "14px", marginTop: "20px"}}>
                      {(V.fEmail.rings ?? []).map((r, __ir) => (
                        <Fragment key={__ir}>
                          <div style={{display: "flex", flexDirection: "column", alignItems: "center", gap: "10px"}}>
                            <span style={{position: "relative", display: "grid", placeItems: "center", width: "98px", height: "98px"}}>
                              <svg viewBox="0 0 100 100" aria-hidden="true" style={{position: "absolute", inset: "0", width: "100%", height: "100%", transform: "rotate(-90deg)"}}>
                                <circle cx="50" cy="50" r="44" fill="none" stroke="#DADCD7" strokeWidth="7"></circle>
                                <circle cx="50" cy="50" r="44" fill="none" stroke="#1C1C1C" strokeWidth="7" strokeLinecap="round" strokeDasharray="276.5" strokeDashoffset={r.off}></circle>
                              </svg>
                              <span style={{fontSize: "22px", fontWeight: "400", letterSpacing: "-.02em", fontVariantNumeric: "tabular-nums"}}>
                                {r.pct}
                                <span style={{fontSize: "11px", color: "#5A5F5C"}}>%</span>
                              </span>
                            </span>
                            <span style={{textAlign: "center"}}>
                              <span style={{display: "block", fontSize: "13.5px", fontWeight: "500"}}>{r.name}</span>
                              <span style={{display: "block", marginTop: "2px", fontSize: "12px", color: "#5A5F5C", fontVariantNumeric: "tabular-nums"}}>{r.leads}</span>
                            </span>
                          </div>
                        </Fragment>
                      ))}
                    </div>
                  </section>
                  <section data-card="1" style={{padding: "22px 24px", borderRadius: "22px", background: "#F5F5F4", animation: "lsPanelIn .45s cubic-bezier(.22,1,.36,1) both"}}>
                    <div style={{display: "flex", flexWrap: "wrap", alignItems: "center", gap: "12px"}}>
                      <h2 data-fres="email" style={{margin: "0", fontSize: "19px", fontWeight: "500", letterSpacing: "-.01em"}}>Emails found</h2>
                      {shows(V.fEmail.scanDone) ? (
                        <>
                        <button type="button" onClick={V.fEmail.exportScan} data-run="1" style={{display: "inline-flex", alignItems: "center", gap: "8px", height: "40px", padding: "0 18px", marginLeft: "auto", border: "0", borderRadius: "999px", background: "#1C1C1C", color: "#F0F0F0", fontFamily: "inherit", fontSize: "13px", fontWeight: "500", whiteSpace: "nowrap", cursor: "pointer", transition: "transform .3s cubic-bezier(.22,1,.36,1)", animation: "lsPanelIn .35s cubic-bezier(.22,1,.36,1) both"}}>
                          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M12 4v10"></path>
                            <path d="M8 10.5l4 4 4-4"></path>
                            <path d="M4.5 18.5h15"></path>
                          </svg>
                          Export
                        </button>
                        </>
                      ) : null}
                    </div>
                    <ul style={{listStyle: "none", margin: "14px 0 0", padding: "0", display: "flex", flexDirection: "column"}}>
                      {(V.fEmail.rows ?? []).map((w, __iw) => (
                        <Fragment key={__iw}>
                          <li data-scanrow={w.pill} style={{display: "grid", gridTemplateColumns: "minmax(140px,220px) minmax(0,1fr) auto", alignItems: "center", gap: "14px", padding: "13px 10px", borderTop: "1px solid #E4E5E2", borderRadius: "12px", transition: "background .6s linear", animation: "lsPanelIn .45s cubic-bezier(.22,1,.36,1) both"}}>
                            <span style={{minWidth: "0"}}>
                              <span style={{display: "block", fontSize: "10.5px", fontWeight: "600", letterSpacing: ".08em", color: "#4A4F4B"}}>NEW</span>
                              <span style={{display: "block", marginTop: "2px", fontSize: "14px", fontWeight: "500", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis"}}>{w.domain}</span>
                            </span>
                            <span style={{display: "flex", flexWrap: "wrap", gap: "6px", minWidth: "0"}}>
                              {shows(w.scanning) ? (
                                <>
                                <span style={{display: "inline-flex", alignItems: "center", gap: "7px", fontSize: "12.5px", color: "#4A4F4B"}}>
                                  <span aria-hidden="true" style={{width: "11px", height: "11px", borderRadius: "999px", border: "1.5px solid rgba(28,28,28,.2)", borderTopColor: "#1C1C1C", animation: "lsSpin .8s linear infinite"}}></span>
                                  {w.scanLabel}
                                </span>
                                </>
                              ) : null}
                              {(w.items ?? []).map((it, __iit) => (
                                <Fragment key={__iit}>
                                  <span style={{display: "inline-flex", flexDirection: "column", gap: "1px", maxWidth: "100%", padding: "6px 11px", borderRadius: "12px", background: "#EAEAE8", animation: "lsPanelIn .4s cubic-bezier(.22,1,.36,1) both"}}>
                                    <span style={{fontSize: "13px", fontWeight: "500", overflowWrap: "anywhere"}}>{it.t}</span>
                                    <span style={{fontSize: "11px", color: "#5A5F5C"}}>{it.k}</span>
                                  </span>
                                </Fragment>
                              ))}
                              {shows(w.none) ? (
                                <>
                                <span style={{fontSize: "12.5px", color: "#5A5F5C"}}>Nothing published on this site</span>
                                </>
                              ) : null}
                            </span>
                            <span data-impst={w.pill} style={{padding: "5px 11px", borderRadius: "999px", fontSize: "11.5px", fontWeight: "500", whiteSpace: "nowrap"}}>{w.status}</span>
                          </li>
                        </Fragment>
                      ))}
                    </ul>
                  </section>
                  </>
                ) : null}
                <section data-card="1" style={{padding: "24px", borderRadius: "22px", background: "linear-gradient(160deg,#E9EDE4 0%,#CBD8BC 100%)", transition: "transform .5s cubic-bezier(.22,1,.36,1),box-shadow .5s linear"}}>
                  <div style={{display: "flex", flexWrap: "wrap", alignItems: "flex-start", justifyContent: "space-between", gap: "12px"}}>
                    <div>
                      <h2 style={{margin: "0", fontSize: "19px", fontWeight: "500", letterSpacing: "-.01em"}}>The Cascade</h2>
                      <p style={{margin: "4px 0 0", fontSize: "13.5px", color: "#4C554A"}}>Where the {V.emailTotal} scraped leads currently sit in the pipeline.</p>
                    </div>
                    <span style={{display: "inline-flex", alignItems: "center", gap: "6px", padding: "6px 12px", borderRadius: "999px", background: "#1C1C1C", color: "#F0F0F0", fontSize: "11.5px", whiteSpace: "nowrap"}}>
                      <strong style={{fontWeight: "700"}}>{V.emailBadge}</strong>
                      {' '}reach a verified address
                    </span>
                  </div>
                  <div data-cascade="1" style={{display: "flex", flexWrap: "wrap", gap: "clamp(10px,1.6vw,20px)", marginTop: "22px"}}>
                    {(V.emailCascade ?? []).map((k, __ik) => (
                      <Fragment key={__ik}>
                        <div style={{display: "flex", alignItems: "center", gap: "clamp(8px,1.4vw,18px)", flex: "1", minWidth: "150px"}}>
                          <div style={{flex: "1", minWidth: "0"}}>
                            <div style={{fontSize: "clamp(30px,3.2vw,44px)", lineHeight: ".9", fontWeight: "700", letterSpacing: "-.04em", backgroundImage: "radial-gradient(circle at 50% 50%,#1C1C1C 1.45px,transparent 1.55px)", backgroundSize: "3.2px 3.2px", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent", WebkitTextFillColor: "transparent", animation: "lsPop .7s cubic-bezier(.22,1,.36,1) both"}}>{k.count}</div>
                            <div style={{marginTop: "9px", fontSize: "13.5px", fontWeight: "500"}}>{k.label}</div>
                            <div style={{marginTop: "2px", fontSize: "12px", color: "#4C554A"}}>{k.note}</div>
                            <div style={{height: "6px", marginTop: "10px", borderRadius: "3px", background: "rgba(255,255,255,.55)", overflow: "hidden"}}>
                              <span style={{display: "block", height: "100%", width: k.width, borderRadius: "3px", background: "#1C1C1C"}}></span>
                            </div>
                          </div>
                          {shows(k.arrow) ? (
                            <>
                            <span aria-hidden="true" style={{color: "#6F8060", fontSize: "15px", flex: "none"}}>→</span>
                            </>
                          ) : null}
                        </div>
                      </Fragment>
                    ))}
                  </div>
                </section>
                <div data-emailtop="1" style={{display: "grid", gridTemplateColumns: "minmax(0,1.4fr) minmax(0,1fr)", gap: "clamp(12px,1.4vw,20px)", alignItems: "start"}}>
                  <section data-card="1" style={{padding: "22px 24px", borderRadius: "22px", background: "#F5F5F4", transition: "transform .5s cubic-bezier(.22,1,.36,1),box-shadow .5s linear"}}>
                    <div style={{display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px"}}>
                      <div>
                        <h2 style={{margin: "0", fontSize: "19px", fontWeight: "500", letterSpacing: "-.01em"}}>Confidence Mix</h2>
                        <p style={{margin: "4px 0 0", fontSize: "13.5px", color: "#5A5F5C"}}>Deliverability score of all {V.emailExtracted} extracted addresses.</p>
                      </div>
                      <span data-open="1" aria-hidden="true" style={{display: "grid", placeItems: "center", width: "36px", height: "36px", borderRadius: "999px", background: "#EAEAE8", fontSize: "14px", flex: "none"}}>↗</span>
                    </div>
                    <div style={{display: "flex", alignItems: "flex-end", gap: "3px", height: "132px", marginTop: "20px", paddingBottom: "10px", borderBottom: "1px solid #DEDFDC"}}>
                      {(V.emailBuckets ?? []).map((b, __ib) => (
                        <Fragment key={__ib}>
                          <span title={`score ${b.from}·${b.to}: ${b.count}`} style={{flex: "1", display: "flex", alignItems: "flex-end", height: "100%"}}>
                            <span style={{width: "100%", height: b.height, borderRadius: "3px 3px 0 0", background: b.color, transformOrigin: "bottom", animation: "lsRise .8s cubic-bezier(.22,1,.36,1) 0.00s both"}}></span>
                          </span>
                        </Fragment>
                      ))}
                    </div>
                    <div style={{display: "flex", justifyContent: "space-between", marginTop: "9px", fontSize: "11.5px", color: "#5A5F5C", fontVariantNumeric: "tabular-nums"}}>
                      <span>0</span>
                      <span>25</span>
                      <span>50</span>
                      <span>75</span>
                      <span>100</span>
                    </div>
                    <div style={{display: "flex", flexWrap: "wrap", gap: "8px", marginTop: "16px"}}>
                      {(V.emailChips ?? []).map((c, __ic) => (
                        <Fragment key={__ic}>
                          <span style={{display: "inline-flex", alignItems: "center", gap: "7px", padding: "7px 13px", borderRadius: "999px", background: "#EAEAE8", fontSize: "12.5px"}}>
                            <span aria-hidden="true" style={{width: "9px", height: "9px", borderRadius: "3px", background: c.color}}></span>
                            {c.label}{' '}
                            <strong style={{fontWeight: "700"}}>{c.count}</strong>
                          </span>
                        </Fragment>
                      ))}
                    </div>
                    <div style={{display: "flex", flexWrap: "wrap", gap: "8px", marginTop: "18px"}}>
                      <div style={{flex: "1", minWidth: "120px", padding: "12px 14px", borderRadius: "14px", background: "#EAEAE8"}}>
                        <div style={{fontSize: "12px", color: "#4A4F4B"}}>Needs verify</div>
                        <div style={{fontSize: "16px", fontWeight: "700", marginTop: "2px"}}>{V.emailNeedsVerify} leads</div>
                      </div>
                      <div style={{flex: "1", minWidth: "120px", padding: "12px 14px", borderRadius: "14px", background: "#EAEAE8"}}>
                        <div style={{fontSize: "12px", color: "#4A4F4B"}}>Avg per lead</div>
                        <div style={{fontSize: "16px", fontWeight: "700", marginTop: "2px"}}>{V.emailPerLead} emails</div>
                      </div>
                    </div>
                  </section>
                  <section data-card="1" style={{padding: "22px 24px", borderRadius: "22px", background: "#1C1C1C", color: "#F0F0F0", transition: "transform .5s cubic-bezier(.22,1,.36,1),box-shadow .5s linear"}}>
                    <h2 style={{margin: "0", fontSize: "19px", fontWeight: "500", letterSpacing: "-.01em"}}>Run in Bulk</h2>
                    <p style={{margin: "4px 0 0", fontSize: "13.5px", color: "#9BA29C"}}>{V.emailNoAddress} leads still have no address on file.</p>
                    <div style={{display: "flex", flexDirection: "column", gap: "8px", marginTop: "18px"}}>
                      <button data-action="Find & verify needed" type="button" data-attn="1" style={{display: "flex", alignItems: "center", gap: "12px", width: "100%", padding: "13px 15px", border: "0", borderRadius: "14px", background: "#C8D5BB", color: "#1C1C1C", fontFamily: "inherit", fontSize: "13.5px", fontWeight: "500", textAlign: "left", cursor: "pointer"}}>
                        <span style={{flex: "1"}}>Find &amp; verify needed</span>
                        <span>{V.emailNeedsVerify}</span>
                      </button>
                      <button onClick={V.verifyEmailValidity} data-email-validity="1" data-busy={V.emailValidityBusy} type="button" data-attn="1" style={{display: "flex", alignItems: "center", gap: "12px", width: "100%", padding: "13px 15px", border: "0", borderRadius: "14px", background: "#252625", color: "#F0F0F0", fontFamily: "inherit", fontSize: "13.5px", textAlign: "left", cursor: "pointer"}}>
                        <span style={{flex: "1"}}>{V.emailValidityLabel}</span>
                        <span style={{color: "#9BA29C"}}>{V.emailRisky}</span>
                      </button>
                      {shows(V.emailUnknownVisible) ? (
                        <>
                        <button onClick={V.recheckUnknownEmailValidity} data-leadsangel-recheck="1" type="button" data-attn="1" style={{display: "flex", alignItems: "center", gap: "12px", width: "100%", padding: "13px 15px", border: "0", borderRadius: "14px", background: "#252625", color: "#F0F0F0", fontFamily: "inherit", fontSize: "13.5px", textAlign: "left", cursor: "pointer"}}>
                          <span style={{flex: "1"}}>Recheck Unknown with LeadsAngel</span>
                          <span style={{color: "#9BA29C"}}>{V.emailUnknown}</span>
                        </button>
                        </>
                      ) : null}
                      <button data-action="Deep search missing" type="button" data-attn="1" style={{display: "flex", alignItems: "center", gap: "12px", width: "100%", padding: "13px 15px", border: "0", borderRadius: "14px", background: "#252625", color: "#F0F0F0", fontFamily: "inherit", fontSize: "13.5px", textAlign: "left", cursor: "pointer"}}>
                        <span style={{flex: "1"}}>Deep search missing</span>
                        <span style={{color: "#9BA29C"}}>{V.emailNoAddress}</span>
                      </button>
                      <div style={{display: "flex", alignItems: "center", gap: "12px", padding: "13px 15px", borderRadius: "14px", background: "#212221", color: "#7E837F", fontSize: "13.5px"}}>
                        <span style={{flex: "1"}}>Find &amp; verify selected</span>
                        <span>0</span>
                      </div>
                    </div>
                  </section>
                </div>
                <section data-flistcard="email" data-card="1" style={{padding: "22px 24px", borderRadius: "22px", background: "#F5F5F4", transition: "transform .5s cubic-bezier(.22,1,.36,1),box-shadow .5s linear"}}>
                  <div style={{display: "flex", flexWrap: "wrap", alignItems: "center", gap: "12px"}}>
                    <div>
                      <h2 style={{margin: "0", fontSize: "19px", fontWeight: "500", letterSpacing: "-.01em"}}>Addresses</h2>
                      <p style={{margin: "4px 0 0", fontSize: "13.5px", color: "#5A5F5C"}}>Showing {V.emailShowing} of {V.emailTotal} leads.</p>
                    </div>
                    <button type="button" onClick={V.openExp} data-run="1" style={{display: "inline-flex", alignItems: "center", gap: "8px", height: "40px", padding: "0 18px", marginLeft: "auto", border: "0", borderRadius: "999px", background: "#1C1C1C", color: "#F0F0F0", fontFamily: "inherit", fontSize: "13px", fontWeight: "500", whiteSpace: "nowrap", cursor: "pointer", transition: "transform .3s cubic-bezier(.22,1,.36,1)"}}>
                      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M12 4v10"></path>
                        <path d="M8 10.5l4 4 4-4"></path>
                        <path d="M4.5 18.5h15"></path>
                      </svg>
                      Export
                    </button>
                  </div>
                  <div data-rowsblock="1" style={{marginTop: "18px"}}>
                    <div data-rowgrid="1" data-mailhead="1" style={{display: "grid", alignItems: "end", gap: "10px", padding: "0 0 11px", borderBottom: "1px solid #DEDFDC"}}>
                      <span></span>
                      <span data-col="idx" style={{fontSize: "10px", fontWeight: "500", letterSpacing: ".15em", textTransform: "uppercase", color: "#555956", whiteSpace: "nowrap"}}>#</span>
                      <span style={{fontSize: "10px", fontWeight: "500", letterSpacing: ".15em", textTransform: "uppercase", color: "#555956", whiteSpace: "nowrap"}}>Business</span>
                      <span data-col="dom" style={{fontSize: "10px", fontWeight: "500", letterSpacing: ".15em", textTransform: "uppercase", color: "#555956", whiteSpace: "nowrap"}}>Domain</span>
                      <span style={{fontSize: "10px", fontWeight: "500", letterSpacing: ".15em", textTransform: "uppercase", color: "#555956", whiteSpace: "nowrap"}}>Emails</span>
                      <span style={{fontSize: "10px", fontWeight: "500", letterSpacing: ".15em", textTransform: "uppercase", color: "#555956", whiteSpace: "nowrap"}}>Verification</span>
                      <span data-col="status" style={{fontSize: "10px", fontWeight: "500", letterSpacing: ".15em", textTransform: "uppercase", color: "#555956", whiteSpace: "nowrap"}}>Status</span>
                    </div>
                    <ul data-flist="email" data-fpart="main" style={{listStyle: "none", margin: "0", padding: "0", display: "flex", flexDirection: "column"}}>
                      {shows(V.emailState) ? (
                        <>
                        <li style={{display: "flex", alignItems: "center", gap: "10px", padding: "13px 0", borderTop: "1px solid #E4E5E2", color: "#5A5F5C", fontSize: "13.5px"}}>{V.emailState}</li>
                        </>
                      ) : null}
                      {(V.fEmail.rows ?? []).map((r, __ir) => (
                        <Fragment key={__ir}>
                          <li data-row="1" data-rowgrid="1" style={{display: "grid", flexWrap: "wrap", alignItems: "center", gap: "10px", padding: "13px 0", borderTop: "1px solid #E4E5E2", transition: "background .25s linear"}}>
                            <span style={{display: "grid", placeItems: "center", width: "16px", height: "16px", borderRadius: "5px", border: "1.5px solid #C6C8C4"}}></span>
                            <span data-col="idx" style={{minWidth: "34px", fontSize: "12.5px", color: "#5A5F5C", fontVariantNumeric: "tabular-nums"}}>{r.index}</span>
                            <span style={{minWidth: "156px", fontSize: "14.5px", fontWeight: "500"}}>{r.name}</span>
                            <span data-col="dom" title={r.domain} style={{minWidth: "138px", fontSize: "12.5px", color: "#4A4F4B", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis"}}>{r.domain}</span>
                            <span title={r.primary} style={{minWidth: "150px", fontSize: "12.5px", color: "#4A4F4B", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis"}}>
                              {r.primary}{' '}
                              {shows(r.hasExtras) ? (
                                <>
                                <span style={{color: "#5A5F5C"}}>{r.extrasLabel}</span>
                                </>
                              ) : null}
                            </span>
                            <span style={{minWidth: "148px"}}>
                              {shows(V.isTone(r.tone, 'high')) ? (
                                <>
                                <span style={{display: "block", padding: "5px 10px", borderRadius: "999px", background: "#1C1C1C", color: "#F0F0F0", fontWeight: "500", fontSize: "11.5px", textAlign: "center", whiteSpace: "nowrap"}}>{r.label}</span>
                                </>
                              ) : null}
                              {shows(V.isTone(r.tone, 'domain')) ? (
                                <>
                                <span style={{display: "block", padding: "5px 10px", borderRadius: "999px", background: "#C8D5BB", fontWeight: "500", fontSize: "11.5px", textAlign: "center", whiteSpace: "nowrap"}}>{r.label}</span>
                                </>
                              ) : null}
                              {shows(V.isTone(r.tone, 'low')) ? (
                                <>
                                <span style={{display: "block", padding: "5px 10px", borderRadius: "999px", background: "#DDE3D6", fontSize: "11.5px", textAlign: "center", whiteSpace: "nowrap"}}>{r.label}</span>
                                </>
                              ) : null}
                              {shows(V.isTone(r.tone, 'unverified')) ? (
                                <>
                                <span style={{display: "block", padding: "5px 10px", borderRadius: "999px", background: "#EAEAE8", color: "#4A4F4B", fontSize: "11.5px", textAlign: "center", whiteSpace: "nowrap"}}>{r.label}</span>
                                </>
                              ) : null}
                              {shows(V.isTone(r.tone, 'no-website')) ? (
                                <>
                                <span style={{display: "block", padding: "5px 10px", borderRadius: "999px", background: "#EDEEEB", color: "#5A5F5C", fontSize: "11.5px", textAlign: "center", whiteSpace: "nowrap"}}>{r.label}</span>
                                </>
                              ) : null}
                              {shows(V.isTone(r.tone, 'pending')) ? (
                                <>
                                <span style={{display: "block", padding: "5px 10px", borderRadius: "999px", background: "#EAEAE8", color: "#4A4F4B", fontSize: "11.5px", textAlign: "center", whiteSpace: "nowrap"}}>{r.label}</span>
                                </>
                              ) : null}
                              {shows(V.isTone(r.tone, 'high')) ? (
                                <>
                                <span style={{display: "flex", gap: "3px", marginTop: "6px"}}>
                                  <span style={{flex: "1", height: "5px", borderRadius: "3px", background: "#1C1C1C"}}></span>
                                  <span style={{flex: "1", height: "5px", borderRadius: "3px", background: "#1C1C1C"}}></span>
                                  <span style={{flex: "1", height: "5px", borderRadius: "3px", background: "#1C1C1C"}}></span>
                                  <span style={{flex: "1", height: "5px", borderRadius: "3px", background: "#1C1C1C"}}></span>
                                </span>
                                </>
                              ) : null}
                              {shows(V.isTone(r.tone, 'domain')) ? (
                                <>
                                <span style={{display: "flex", gap: "3px", marginTop: "6px"}}>
                                  <span style={{flex: "1", height: "5px", borderRadius: "3px", background: "#8FA382"}}></span>
                                  <span style={{flex: "1", height: "5px", borderRadius: "3px", background: "#8FA382"}}></span>
                                  <span style={{flex: "1", height: "5px", borderRadius: "3px", background: "#E2E5DE"}}></span>
                                  <span style={{flex: "1", height: "5px", borderRadius: "3px", background: "#E2E5DE"}}></span>
                                </span>
                                </>
                              ) : null}
                              {shows(V.isTone(r.tone, 'low')) ? (
                                <>
                                <span style={{display: "flex", gap: "3px", marginTop: "6px"}}>
                                  <span style={{flex: "1", height: "5px", borderRadius: "3px", background: "#C8D5BB"}}></span>
                                  <span style={{flex: "1", height: "5px", borderRadius: "3px", background: "#E2E5DE"}}></span>
                                  <span style={{flex: "1", height: "5px", borderRadius: "3px", background: "#E2E5DE"}}></span>
                                  <span style={{flex: "1", height: "5px", borderRadius: "3px", background: "#E2E5DE"}}></span>
                                </span>
                                </>
                              ) : null}
                              {shows(V.isTone(r.tone, 'unverified')) ? (
                                <>
                                <span style={{display: "flex", gap: "3px", marginTop: "6px"}}>
                                  <span style={{flex: "1", height: "5px", borderRadius: "3px", background: "#E2E5DE"}}></span>
                                  <span style={{flex: "1", height: "5px", borderRadius: "3px", background: "#E2E5DE"}}></span>
                                  <span style={{flex: "1", height: "5px", borderRadius: "3px", background: "#E2E5DE"}}></span>
                                  <span style={{flex: "1", height: "5px", borderRadius: "3px", background: "#E2E5DE"}}></span>
                                </span>
                                </>
                              ) : null}
                              {shows(V.isTone(r.tone, 'no-website')) ? (
                                <>
                                <span style={{display: "flex", gap: "3px", marginTop: "6px"}}>
                                  <span style={{flex: "1", height: "5px", borderRadius: "3px", background: "#E2E5DE"}}></span>
                                  <span style={{flex: "1", height: "5px", borderRadius: "3px", background: "#E2E5DE"}}></span>
                                  <span style={{flex: "1", height: "5px", borderRadius: "3px", background: "#E2E5DE"}}></span>
                                  <span style={{flex: "1", height: "5px", borderRadius: "3px", background: "#E2E5DE"}}></span>
                                </span>
                                </>
                              ) : null}
                              {shows(V.isTone(r.tone, 'pending')) ? (
                                <>
                                <span style={{display: "flex", gap: "3px", marginTop: "6px"}}>
                                  <span style={{flex: "1", height: "5px", borderRadius: "3px", background: "#E2E5DE"}}></span>
                                  <span style={{flex: "1", height: "5px", borderRadius: "3px", background: "#E2E5DE"}}></span>
                                  <span style={{flex: "1", height: "5px", borderRadius: "3px", background: "#E2E5DE"}}></span>
                                  <span style={{flex: "1", height: "5px", borderRadius: "3px", background: "#E2E5DE"}}></span>
                                </span>
                                </>
                              ) : null}
                            </span>
                            {shows(r.isFound) ? (
                              <>
                              <span data-col="status" style={{minWidth: "88px", fontSize: "12.5px", fontWeight: "500", whiteSpace: "nowrap"}}>{r.statusLabel}</span>
                              </>
                            ) : null}
                            {shows(r.isMuted) ? (
                              <>
                              <span data-col="status" style={{minWidth: "88px", fontSize: "12.5px", color: "#5A5F5C", whiteSpace: "nowrap"}}>{r.statusLabel}</span>
                              </>
                            ) : null}
                          </li>
                        </Fragment>
                      ))}
                    </ul>
                  </div>
                </section>
              </div>
              </>
            ) : null}
            {shows(V.isPhone) ? (
              <>
              <div style={{display: "flex", flexDirection: "column", gap: "clamp(12px,1.5vw,20px)"}}>
                <div style={{display: "flex", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: "16px"}}>
                  <div>
                    <div style={{display: "flex", alignItems: "center", gap: "12px"}}>
                      <h1 style={{margin: "0", fontSize: "clamp(26px,2.6vw,36px)", lineHeight: "1.1", letterSpacing: "-.03em", fontWeight: "400"}}>Phone Finder</h1>
                      <span style={{display: "inline-flex", alignItems: "center", gap: "7px", padding: "6px 13px", borderRadius: "999px", background: "#E3E4E1", fontSize: "10.5px", fontWeight: "500", letterSpacing: ".14em", color: "#4A4F4B"}}>
                        <span aria-hidden="true" style={{width: "6px", height: "6px", borderRadius: "999px", background: "#8B908C"}}></span>
                        IDLE{' '}
                      </span>
                    </div>
                    <p style={{margin: "8px 0 0", maxWidth: "78ch", fontSize: "14.5px", color: "#5A5F5C", textWrap: "pretty"}}>All scraped phones, filterable. Maps phones load on scrape; missing ones can be backfilled by visiting each lead's website.</p>
                  </div>
                  <button onClick={V.queuePhone} type="button" data-run="1" style={{display: "inline-flex", alignItems: "center", gap: "9px", height: "44px", padding: "0 22px", border: "0", borderRadius: "999px", background: "#1C1C1C", color: "#F0F0F0", fontFamily: "inherit", fontSize: "13.5px", fontWeight: "500", cursor: "pointer", transition: "transform .3s cubic-bezier(.22,1,.36,1)"}}>
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M7 3.8l2.6.5 1.2 3.4-2 1.5a11 11 0 0 0 5.9 5.9l1.5-2 3.4 1.2.5 2.6a2 2 0 0 1-2.2 2.3C11.4 18.8 5.2 12.6 4.7 6a2 2 0 0 1 2.3-2.2z"></path>
                    </svg>
                    {' '}Find phones for missing{' '}
                  </button>
                </div>
                <div data-socbar="1" style={{position: "sticky", top: "12px", zIndex: "30", padding: "14px 16px", borderRadius: "22px", background: "#F5F5F4", boxShadow: "0 18px 36px -26px rgba(28,28,28,.55)"}}>
                  <div style={{display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px"}}>
                    <div style={{display: "flex", alignItems: "center", gap: "10px", flex: "1", minWidth: "220px", height: "44px", padding: "0 16px", borderRadius: "999px", background: "#EAEAE8"}}>
                      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="#3A3D3B" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true" style={{flex: "none"}}>
                        <circle cx="11" cy="11" r="6.5"></circle>
                        <path d="M16 16l4.5 4.5"></path>
                      </svg>
                      <input data-fq="phone" type="search" onInput={V.fPhone.onInput} onKeyDown={V.fPhone.onKey} onBlur={V.fPhone.onBlur} placeholder="Search business, area or number…" aria-label="Search business, area or number" style={{flex: "1", minWidth: "0", height: "100%", border: "0", background: "transparent", fontSize: "13.5px", color: "#1C1C1C", outline: "none"}} value={V.fPhone.q} />
                    </div>
                    <span style={{position: "relative", display: "block"}}>
                      <select onChange={V.fPhone.onState} aria-label="Filter rows" style={{height: "44px", padding: "0 36px 0 16px", border: "0", borderRadius: "999px", background: "#EAEAE8", fontFamily: "inherit", fontSize: "13.5px", color: "#1C1C1C", outline: "none", appearance: "none"}}>
                        <option>All</option>
                        <option>Direct line</option>
                        <option>Reception</option>
                        <option>Mobile</option>
                        <option>Missing</option>
                      </select>
                      <span aria-hidden="true" style={{position: "absolute", right: "14px", top: "15px", display: "block", pointerEvents: "none", color: "#4A4F4B"}}>
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M6 9.5l6 6 6-6"></path>
                        </svg>
                      </span>
                    </span>
                    <button type="button" onClick={V.fPhone.act} data-run="1" style={{display: "inline-flex", alignItems: "center", gap: "9px", height: "44px", padding: "0 20px", border: "0", borderRadius: "999px", background: "#1C1C1C", color: "#F0F0F0", fontFamily: "inherit", fontSize: "13.5px", fontWeight: "500", cursor: "pointer", transition: "transform .3s cubic-bezier(.22,1,.36,1)"}} data-fact="fPhone">
                      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M6.5 4h3l1.5 4-2 1.3a10 10 0 0 0 5.7 5.7l1.3-2 4 1.5v3A2 2 0 0 1 18 20 14 14 0 0 1 4 6a2 2 0 0 1 2.5-2z"></path>
                      </svg>
                      {' '}Check numbers{' '}
                    </button>
                    <button type="button" onClick={V.openImp} data-ghost="1" style={{display: "inline-flex", alignItems: "center", gap: "8px", height: "44px", padding: "0 18px", border: "0", borderRadius: "999px", background: "#E5E5E5", color: "#1C1C1C", fontFamily: "inherit", fontSize: "13.5px", fontWeight: "500", cursor: "pointer", transition: "background .25s linear"}}>
                      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M12 15.5V4"></path>
                        <path d="M8 7.5l4-4 4 4"></path>
                        <path d="M4.5 19.5h15"></path>
                      </svg>
                      {' '}Import websites{' '}
                    </button>
                    <button type="button" onClick={V.fPhone.refresh} data-ghost="1" style={{display: "inline-flex", alignItems: "center", gap: "8px", height: "44px", padding: "0 18px", border: "0", borderRadius: "999px", background: "#E5E5E5", color: "#1C1C1C", fontFamily: "inherit", fontSize: "13.5px", fontWeight: "500", cursor: "pointer", transition: "background .25s linear"}}>
                      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M20 12a8 8 0 1 1-2.6-5.9"></path>
                        <path d="M20 4v4.5h-4.5"></path>
                      </svg>
                      {' '}Refresh{' '}
                    </button>
                    <button type="button" onClick={V.fPhone.openHist} data-ghost="1" style={{display: "inline-flex", alignItems: "center", gap: "8px", height: "44px", padding: "0 18px", border: "0", borderRadius: "999px", background: "#E5E5E5", color: "#1C1C1C", fontFamily: "inherit", fontSize: "13.5px", fontWeight: "500", cursor: "pointer", transition: "background .25s linear"}}>
                      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M4 12a8 8 0 1 0 2.4-5.7"></path>
                        <path d="M4 4.5V8.5h4"></path>
                        <path d="M12 8v4.5l3 2"></path>
                      </svg>
                      {' '}History{' '}
                      <span style={{display: "grid", placeItems: "center", minWidth: "22px", height: "22px", padding: "0 6px", borderRadius: "999px", background: "#C8D5BB", fontSize: "11px", fontWeight: "600"}}>{V.fPhone.count}</span>
                    </button>
                  </div>
                  <div style={{display: "flex", flexWrap: "wrap", alignItems: "center", gap: "6px", marginTop: "10px"}}>
                    <span style={{marginRight: "4px", fontSize: "10.5px", fontWeight: "500", letterSpacing: ".14em", textTransform: "uppercase", color: "#555956"}}>Recent</span>
                    {(V.fPhone.hist ?? []).map((h, __ih) => (
                      <Fragment key={__ih}>
                        <button type="button" onClick={h.run} style={{display: "inline-flex", alignItems: "center", gap: "7px", height: "30px", padding: "0 12px", border: "0", borderRadius: "999px", fontFamily: "inherit", fontSize: "12.5px", cursor: "pointer"}} data-socrecent="1">
                          {h.q}
                          <span style={{fontSize: "11px", color: "#5A5F5C", fontVariantNumeric: "tabular-nums"}}>{h.n}</span>
                        </button>
                      </Fragment>
                    ))}
                    <span data-fcount="phone" style={{marginLeft: "auto", fontSize: "12px", color: "#5A5F5C"}}>{V.phoneShowing} rows on screen</span>
                  </div>
                </div>
                {shows(V.fPhone.scanOn) ? (
                  <>
                  <section data-card="1" style={{padding: "22px 24px", borderRadius: "22px", background: "#F5F5F4", animation: "lsPanelIn .45s cubic-bezier(.22,1,.36,1) both"}}>
                    <h2 data-fcov="phone" style={{margin: "0", fontSize: "19px", fontWeight: "500", letterSpacing: "-.01em"}}>Phone Coverage</h2>
                    <p style={{margin: "4px 0 0", fontSize: "13.5px", color: "#5A5F5C"}}>{V.fPhone.scanSub}</p>
                    {shows(V.fPhone.scanning) ? (
                      <>
                      <div style={{display: "flex", alignItems: "center", gap: "10px", marginTop: "16px", padding: "10px 14px", borderRadius: "14px", background: "#E7EDE0"}}>
                        <span aria-hidden="true" style={{width: "12px", height: "12px", borderRadius: "999px", border: "2px solid rgba(28,28,28,.2)", borderTopColor: "#1C1C1C", animation: "lsSpin .8s linear infinite", flex: "none"}}></span>
                        <span style={{fontSize: "13px", fontWeight: "500"}}>{V.fPhone.scanBadge}</span>
                      </div>
                      </>
                    ) : null}
                    {shows(V.fPhone.scanOn) ? (
                      <>
                      <div style={{display: "flex", flexWrap: "wrap", alignItems: "center", gap: "10px", marginTop: "16px", padding: "8px 8px 8px 14px", borderRadius: "14px", background: "#E7EDE0"}}>
                        <span style={{flex: "1", minWidth: "180px", fontSize: "13px", fontWeight: "500"}}>{V.fPhone.scanLabel}</span>
                        <button type="button" onClick={V.fPhone.exit} style={{height: "32px", padding: "0 14px", border: "0", borderRadius: "999px", background: "#1C1C1C", color: "#F0F0F0", fontFamily: "inherit", fontSize: "12.5px", fontWeight: "500", cursor: "pointer"}} data-exitscan="1">Show all leads</button>
                      </div>
                      </>
                    ) : null}
                    <div style={{display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(96px,1fr))", gap: "14px", marginTop: "20px"}}>
                      {(V.fPhone.rings ?? []).map((r, __ir) => (
                        <Fragment key={__ir}>
                          <div style={{display: "flex", flexDirection: "column", alignItems: "center", gap: "10px"}}>
                            <span style={{position: "relative", display: "grid", placeItems: "center", width: "98px", height: "98px"}}>
                              <svg viewBox="0 0 100 100" aria-hidden="true" style={{position: "absolute", inset: "0", width: "100%", height: "100%", transform: "rotate(-90deg)"}}>
                                <circle cx="50" cy="50" r="44" fill="none" stroke="#DADCD7" strokeWidth="7"></circle>
                                <circle cx="50" cy="50" r="44" fill="none" stroke="#1C1C1C" strokeWidth="7" strokeLinecap="round" strokeDasharray="276.5" strokeDashoffset={r.off}></circle>
                              </svg>
                              <span style={{fontSize: "22px", fontWeight: "400", letterSpacing: "-.02em", fontVariantNumeric: "tabular-nums"}}>
                                {r.pct}
                                <span style={{fontSize: "11px", color: "#5A5F5C"}}>%</span>
                              </span>
                            </span>
                            <span style={{textAlign: "center"}}>
                              <span style={{display: "block", fontSize: "13.5px", fontWeight: "500"}}>{r.name}</span>
                              <span style={{display: "block", marginTop: "2px", fontSize: "12px", color: "#5A5F5C", fontVariantNumeric: "tabular-nums"}}>{r.leads}</span>
                            </span>
                          </div>
                        </Fragment>
                      ))}
                    </div>
                  </section>
                  <section data-card="1" style={{padding: "22px 24px", borderRadius: "22px", background: "#F5F5F4", animation: "lsPanelIn .45s cubic-bezier(.22,1,.36,1) both"}}>
                    <div style={{display: "flex", flexWrap: "wrap", alignItems: "center", gap: "12px"}}>
                      <h2 data-fres="phone" style={{margin: "0", fontSize: "19px", fontWeight: "500", letterSpacing: "-.01em"}}>Numbers found</h2>
                      {shows(V.fPhone.scanDone) ? (
                        <>
                        <button type="button" onClick={V.fPhone.exportScan} data-run="1" style={{display: "inline-flex", alignItems: "center", gap: "8px", height: "40px", padding: "0 18px", marginLeft: "auto", border: "0", borderRadius: "999px", background: "#1C1C1C", color: "#F0F0F0", fontFamily: "inherit", fontSize: "13px", fontWeight: "500", whiteSpace: "nowrap", cursor: "pointer", transition: "transform .3s cubic-bezier(.22,1,.36,1)", animation: "lsPanelIn .35s cubic-bezier(.22,1,.36,1) both"}}>
                          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M12 4v10"></path>
                            <path d="M8 10.5l4 4 4-4"></path>
                            <path d="M4.5 18.5h15"></path>
                          </svg>
                          Export
                        </button>
                        </>
                      ) : null}
                    </div>
                    <ul style={{listStyle: "none", margin: "14px 0 0", padding: "0", display: "flex", flexDirection: "column"}}>
                      {(V.fPhone.rows ?? []).map((w, __iw) => (
                        <Fragment key={__iw}>
                          <li data-scanrow={w.pill} style={{display: "grid", gridTemplateColumns: "minmax(140px,220px) minmax(0,1fr) auto", alignItems: "center", gap: "14px", padding: "13px 10px", borderTop: "1px solid #E4E5E2", borderRadius: "12px", transition: "background .6s linear", animation: "lsPanelIn .45s cubic-bezier(.22,1,.36,1) both"}}>
                            <span style={{minWidth: "0"}}>
                              <span style={{display: "block", fontSize: "10.5px", fontWeight: "600", letterSpacing: ".08em", color: "#4A4F4B"}}>NEW</span>
                              <span style={{display: "block", marginTop: "2px", fontSize: "14px", fontWeight: "500", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis"}}>{w.domain}</span>
                            </span>
                            <span style={{display: "flex", flexWrap: "wrap", gap: "6px", minWidth: "0"}}>
                              {shows(w.scanning) ? (
                                <>
                                <span style={{display: "inline-flex", alignItems: "center", gap: "7px", fontSize: "12.5px", color: "#4A4F4B"}}>
                                  <span aria-hidden="true" style={{width: "11px", height: "11px", borderRadius: "999px", border: "1.5px solid rgba(28,28,28,.2)", borderTopColor: "#1C1C1C", animation: "lsSpin .8s linear infinite"}}></span>
                                  {w.scanLabel}
                                </span>
                                </>
                              ) : null}
                              {(w.items ?? []).map((it, __iit) => (
                                <Fragment key={__iit}>
                                  <span style={{display: "inline-flex", flexDirection: "column", gap: "1px", maxWidth: "100%", padding: "6px 11px", borderRadius: "12px", background: "#EAEAE8", animation: "lsPanelIn .4s cubic-bezier(.22,1,.36,1) both"}}>
                                    <span style={{fontSize: "13px", fontWeight: "500", overflowWrap: "anywhere"}}>{it.t}</span>
                                    <span style={{fontSize: "11px", color: "#5A5F5C"}}>{it.k}</span>
                                  </span>
                                </Fragment>
                              ))}
                              {shows(w.none) ? (
                                <>
                                <span style={{fontSize: "12.5px", color: "#5A5F5C"}}>Nothing published on this site</span>
                                </>
                              ) : null}
                            </span>
                            <span data-impst={w.pill} style={{padding: "5px 11px", borderRadius: "999px", fontSize: "11.5px", fontWeight: "500", whiteSpace: "nowrap"}}>{w.status}</span>
                          </li>
                        </Fragment>
                      ))}
                    </ul>
                  </section>
                  </>
                ) : null}
                <section data-card="1" style={{padding: "24px", borderRadius: "22px", background: "#1C1C1C", color: "#F0F0F0", transition: "transform .5s cubic-bezier(.22,1,.36,1),box-shadow .5s linear"}}>
                  <div style={{display: "flex", flexWrap: "wrap", alignItems: "flex-start", justifyContent: "space-between", gap: "16px"}}>
                    <div style={{display: "flex", alignItems: "flex-end", gap: "16px"}}>
                      <span style={{fontSize: "clamp(46px,5vw,68px)", lineHeight: ".86", fontWeight: "700", letterSpacing: "-.05em", backgroundImage: "radial-gradient(circle at 50% 50%,#F0F0F0 1.45px,transparent 1.55px)", backgroundSize: "3.2px 3.2px", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent", WebkitTextFillColor: "transparent", animation: "lsPop .7s cubic-bezier(.22,1,.36,1) both"}}>{V.phoneReachable}</span>
                      <div style={{paddingBottom: "4px"}}>
                        <div style={{fontSize: "17px", fontWeight: "500"}}>Reachable now</div>
                        <div style={{marginTop: "2px", fontSize: "13px", color: "#9BA29C"}}>of {V.phoneTotal} leads · {V.phoneCallablePct}% callable</div>
                      </div>
                    </div>
                    <span style={{display: "inline-flex", alignItems: "center", gap: "6px", padding: "7px 14px", borderRadius: "999px", background: "#C8D5BB", color: "#1C1C1C", fontSize: "11.5px", whiteSpace: "nowrap"}}>
                      <strong style={{fontWeight: "700"}}>{V.phoneDirect}</strong>
                      {' '}direct lines, no gatekeeper
                    </span>
                  </div>
                  <div data-ladder="1" style={{display: "flex", flexWrap: "wrap", gap: "clamp(8px,1.2vw,14px)", marginTop: "24px"}}>
                    <div style={{flex: V.phoneDirectWidth, minWidth: "96px"}}>
                      <div style={{height: "14px", borderRadius: "7px", background: "#C8D5BB"}}></div>
                      <div style={{marginTop: "10px", fontSize: "19px", fontWeight: "500"}}>{V.phoneDirect}</div>
                      <div style={{marginTop: "2px", fontSize: "12.5px", color: "#9BA29C"}}>Direct line</div>
                    </div>
                    <div style={{flex: V.phoneReceptionWidth, minWidth: "96px"}}>
                      <div style={{height: "14px", borderRadius: "7px", background: "#8FA382"}}></div>
                      <div style={{marginTop: "10px", fontSize: "19px", fontWeight: "500"}}>{V.phoneReception}</div>
                      <div style={{marginTop: "2px", fontSize: "12.5px", color: "#9BA29C"}}>Reception</div>
                    </div>
                    <div style={{flex: V.phoneMobileWidth, minWidth: "96px"}}>
                      <div style={{height: "14px", borderRadius: "7px", background: "#4A5347"}}></div>
                      <div style={{marginTop: "10px", fontSize: "19px", fontWeight: "500"}}>{V.phoneMobile}</div>
                      <div style={{marginTop: "2px", fontSize: "12.5px", color: "#9BA29C"}}>Mobile</div>
                    </div>
                    <div style={{flex: V.phoneMissingWidth, minWidth: "96px"}}>
                      <div style={{height: "14px", borderRadius: "7px", background: "#2E302F"}}></div>
                      <div style={{marginTop: "10px", fontSize: "19px", fontWeight: "500"}}>{V.phoneMissing}</div>
                      <div style={{marginTop: "2px", fontSize: "12.5px", color: "#9BA29C"}}>No number</div>
                    </div>
                  </div>
                </section>
                <div data-phonetop="1" style={{display: "grid", gridTemplateColumns: "minmax(0,1.25fr) minmax(0,1fr)", gap: "clamp(12px,1.4vw,20px)", alignItems: "start"}}>
                  <section data-card="1" style={{padding: "22px 24px", borderRadius: "22px", background: "#F5F5F4", transition: "transform .5s cubic-bezier(.22,1,.36,1),box-shadow .5s linear"}}>
                    <div style={{display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px"}}>
                      <div>
                        <h2 style={{margin: "0", fontSize: "19px", fontWeight: "500", letterSpacing: "-.01em"}}>By Area Code</h2>
                        <p style={{margin: "4px 0 0", fontSize: "13.5px", color: "#5A5F5C"}}>Where the {V.phoneReachable} numbers dial to.</p>
                      </div>
                      <span data-open="1" aria-hidden="true" style={{display: "grid", placeItems: "center", width: "36px", height: "36px", borderRadius: "999px", background: "#EAEAE8", fontSize: "14px", flex: "none"}}>↗</span>
                    </div>
                    <ul style={{listStyle: "none", margin: "16px 0 0", padding: "0", display: "flex", flexDirection: "column"}}>
                      {(V.phoneAreas ?? []).map((a, __ia) => (
                        <Fragment key={__ia}>
                          <li style={{display: "flex", alignItems: "center", gap: "12px", padding: "11px 0", borderTop: "1px solid #E4E5E2"}}>
                            <span style={{minWidth: "52px", fontSize: "13px", fontVariantNumeric: "tabular-nums", color: "#4A4F4B"}}>{a.code}</span>
                            <span style={{flex: "1", minWidth: "0", fontSize: "14px"}}>{a.label}</span>
                            <span style={{width: "76px", height: "6px", borderRadius: "3px", background: "#E3E4E1", overflow: "hidden"}}>
                              <span style={{display: "block", height: "100%", width: a.width, borderRadius: "3px", background: "#8FA382"}}></span>
                            </span>
                            <span style={{fontSize: "14.5px", fontWeight: "500", minWidth: "24px", textAlign: "right"}}>{a.count}</span>
                          </li>
                        </Fragment>
                      ))}
                    </ul>
                  </section>
                  <section data-card="1" style={{padding: "22px 24px", borderRadius: "22px", background: "linear-gradient(170deg,#E9EDE4 0%,#CBD8BC 100%)", transition: "transform .5s cubic-bezier(.22,1,.36,1),box-shadow .5s linear"}}>
                    <h2 style={{margin: "0", fontSize: "19px", fontWeight: "500", letterSpacing: "-.01em"}}>Backfill</h2>
                    <p style={{margin: "4px 0 0", fontSize: "13.5px", color: "#4C554A"}}>{V.phoneBackfillNote}</p>
                    <div style={{display: "flex", gap: "8px", marginTop: "16px"}}>
                      <div style={{flex: "1", padding: "12px 14px", borderRadius: "14px", background: "rgba(255,255,255,.55)"}}>
                        <div style={{fontSize: "12px", color: "#4C554A"}}>Backfillable</div>
                        <div style={{fontSize: "16px", fontWeight: "700", marginTop: "2px"}}>{V.phoneCanBackfill}</div>
                      </div>
                      <div style={{flex: "1", padding: "12px 14px", borderRadius: "14px", background: "rgba(255,255,255,.55)"}}>
                        <div style={{fontSize: "12px", color: "#4C554A"}}>No website</div>
                        <div style={{fontSize: "16px", fontWeight: "700", marginTop: "2px"}}>{V.phoneNoWebsite}</div>
                      </div>
                    </div>
                    <div style={{display: "flex", flexDirection: "column", gap: "8px", marginTop: "16px"}}>
                      <button onClick={V.queuePhone} type="button" data-attn="1" style={{display: "flex", alignItems: "center", gap: "12px", width: "100%", padding: "13px 15px", border: "0", borderRadius: "14px", background: "#1C1C1C", color: "#F0F0F0", fontFamily: "inherit", fontSize: "13.5px", fontWeight: "500", textAlign: "left", cursor: "pointer"}}>
                        <span style={{flex: "1"}}>Find phones for missing</span>
                        <span>{V.phoneCanBackfill}</span>
                      </button>
                      <div style={{display: "flex", alignItems: "center", gap: "12px", padding: "13px 15px", borderRadius: "14px", background: "rgba(255,255,255,.35)", color: "#5F6A5C", fontSize: "13.5px"}}>
                        <span style={{flex: "1"}}>Enrich selected</span>
                        <span>0</span>
                      </div>
                    </div>
                  </section>
                </div>
                <section data-flistcard="phone" data-card="1" style={{padding: "22px 24px", borderRadius: "22px", background: "#F5F5F4", transition: "transform .5s cubic-bezier(.22,1,.36,1),box-shadow .5s linear"}}>
                  <div style={{display: "flex", flexWrap: "wrap", alignItems: "center", gap: "12px"}}>
                    <div>
                      <h2 style={{margin: "0", fontSize: "19px", fontWeight: "500", letterSpacing: "-.01em"}}>Phone Book</h2>
                      <p style={{margin: "4px 0 0", fontSize: "13.5px", color: "#5A5F5C"}}>Showing {V.phoneShowing} of {V.phoneTotal} leads.</p>
                    </div>
                    <button type="button" onClick={V.openExp} data-run="1" style={{display: "inline-flex", alignItems: "center", gap: "8px", height: "40px", padding: "0 18px", marginLeft: "auto", border: "0", borderRadius: "999px", background: "#1C1C1C", color: "#F0F0F0", fontFamily: "inherit", fontSize: "13px", fontWeight: "500", whiteSpace: "nowrap", cursor: "pointer", transition: "transform .3s cubic-bezier(.22,1,.36,1)"}}>
                      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M12 4v10"></path>
                        <path d="M8 10.5l4 4 4-4"></path>
                        <path d="M4.5 18.5h15"></path>
                      </svg>
                      Export
                    </button>
                  </div>
                  <div data-rowsblock="1" style={{marginTop: "18px"}}>
                    <div data-rowgrid="1" data-phhead="1" style={{display: "grid", alignItems: "end", gap: "10px", padding: "0 0 11px", borderBottom: "1px solid #DEDFDC"}}>
                      <span></span>
                      <span data-col="idx" style={{fontSize: "10px", fontWeight: "500", letterSpacing: ".15em", textTransform: "uppercase", color: "#555956", whiteSpace: "nowrap"}}>#</span>
                      <span style={{fontSize: "10px", fontWeight: "500", letterSpacing: ".15em", textTransform: "uppercase", color: "#555956", whiteSpace: "nowrap"}}>Business</span>
                      <span style={{fontSize: "10px", fontWeight: "500", letterSpacing: ".15em", textTransform: "uppercase", color: "#555956", whiteSpace: "nowrap"}}>Phone</span>
                      <span style={{fontSize: "10px", fontWeight: "500", letterSpacing: ".15em", textTransform: "uppercase", color: "#555956", whiteSpace: "nowrap"}}>Line type</span>
                      <span data-col="area" style={{fontSize: "10px", fontWeight: "500", letterSpacing: ".15em", textTransform: "uppercase", color: "#555956", whiteSpace: "nowrap"}}>Area</span>
                      <span data-col="addr" style={{fontSize: "10px", fontWeight: "500", letterSpacing: ".15em", textTransform: "uppercase", color: "#555956", whiteSpace: "nowrap"}}>Address</span>
                    </div>
                    <ul data-flist="phone" data-fpart="main" style={{listStyle: "none", margin: "0", padding: "0", display: "flex", flexDirection: "column"}}>
                      {(V.fPhone.rows ?? []).map((p, __ip) => (
                        <Fragment key={__ip}>
                          <li data-row="1" data-rowgrid="1" style={{display: "grid", flexWrap: "wrap", alignItems: "center", gap: "10px", padding: "13px 0", borderTop: "1px solid #E4E5E2", transition: "background .25s linear"}}>
                            <span style={{display: "grid", placeItems: "center", width: "16px", height: "16px", borderRadius: "5px", border: "1.5px solid #C6C8C4"}}></span>
                            <span data-col="idx" style={{minWidth: "34px", fontSize: "12.5px", color: "#5A5F5C", fontVariantNumeric: "tabular-nums"}}>{p.index}</span>
                            <span style={{minWidth: "158px", fontSize: "14.5px", fontWeight: "500"}}>{p.name}</span>
                            <span style={{minWidth: "156px", fontSize: "13.5px", fontVariantNumeric: "tabular-nums", color: "#1C1C1C", whiteSpace: "nowrap"}}>{p.phone}</span>
                            <span style={{minWidth: "104px"}}>
                              {shows(p.isReception) ? (
                                <>
                                <span style={{display: "block", padding: "5px 10px", borderRadius: "999px", background: "#C8D5BB", fontWeight: "500", fontSize: "11.5px", textAlign: "center", whiteSpace: "nowrap"}}>Reception</span>
                                </>
                              ) : null}
                              {shows(p.isDirect) ? (
                                <>
                                <span style={{display: "block", padding: "5px 10px", borderRadius: "999px", background: "#1C1C1C", fontWeight: "500", color: "#F0F0F0", fontSize: "11.5px", textAlign: "center", whiteSpace: "nowrap"}}>Direct line</span>
                                </>
                              ) : null}
                              {shows(p.isMobile) ? (
                                <>
                                <span style={{display: "block", padding: "5px 10px", borderRadius: "999px", background: "#DDE3D6", fontWeight: "500", fontSize: "11.5px", textAlign: "center", whiteSpace: "nowrap"}}>Mobile</span>
                                </>
                              ) : null}
                              {shows(p.isMissing) ? (
                                <>
                                <span style={{display: "block", padding: "5px 10px", borderRadius: "999px", background: "#EAEAE8", fontWeight: "400", color: "#4A4F4B", fontSize: "11.5px", textAlign: "center", whiteSpace: "nowrap"}}>Missing</span>
                                </>
                              ) : null}
                            </span>
                            <span data-col="area" style={{minWidth: "70px", fontSize: "12.5px", color: "#4A4F4B", fontVariantNumeric: "tabular-nums"}}>{p.areaCode}</span>
                            <span data-col="addr" style={{minWidth: "150px", fontSize: "12.5px", color: "#4A4F4B", lineHeight: "1.5"}}>{p.address}</span>
                          </li>
                        </Fragment>
                      ))}
                    </ul>
                  </div>
                </section>
              </div>
              </>
            ) : null}
            {shows(V.isDm) ? (
              <>
              <div style={{display: "flex", flexDirection: "column", gap: "clamp(12px,1.5vw,20px)"}}>
                <div style={{display: "flex", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: "16px"}}>
                  <div>
                    <div style={{display: "flex", alignItems: "center", gap: "12px"}}>
                      <h1 style={{margin: "0", fontSize: "clamp(26px,2.6vw,36px)", lineHeight: "1.1", letterSpacing: "-.03em", fontWeight: "400"}}>Decision Makers</h1>
                      <span style={{display: "inline-flex", alignItems: "center", gap: "7px", padding: "6px 13px", borderRadius: "999px", background: "#E3E4E1", fontSize: "10.5px", fontWeight: "500", letterSpacing: ".14em", color: "#4A4F4B"}}>
                        <span aria-hidden="true" style={{width: "6px", height: "6px", borderRadius: "999px", background: "#8B908C"}}></span>
                        IDLE{' '}
                      </span>
                    </div>
                    <p style={{margin: "8px 0 0", maxWidth: "76ch", fontSize: "14.5px", color: "#5A5F5C", textWrap: "pretty"}}>LinkedIn profile URLs of decision-makers. Populated by deep enrichment.</p>
                  </div>
                  <div data-dm-picker="1" style={{display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap"}}>
                    <label style={{display: "flex", alignItems: "center", gap: "8px", fontSize: "12.5px", color: "#4A4F4B"}}>
                      Leads
                      <input data-dm-limit="1" type="number" min="1" max={V.dmLeadLimitMax} value={V.dmLeadLimit} onChange={V.onDmLeadLimitInput} aria-label="Leads per deep pass" style={{width: "72px", height: "36px", padding: "0 10px", border: "0", borderRadius: "999px", background: "#EAEAE8", fontFamily: "inherit", fontSize: "13px", color: "#1C1C1C", outline: "none"}} />
                    </label>
                    <span data-dm-selection="1" style={{fontSize: "12px", color: "#5A5F5C", whiteSpace: "nowrap"}}>{V.dmSelectedLabel}</span>
                  </div>
                  <button type="button" data-run="1" style={{display: "inline-flex", alignItems: "center", gap: "9px", height: "44px", padding: "0 22px", border: "0", borderRadius: "999px", background: "#1C1C1C", color: "#F0F0F0", fontFamily: "inherit", fontSize: "13.5px", fontWeight: "500", cursor: "pointer", transition: "transform .3s cubic-bezier(.22,1,.36,1)"}} onClick={V.deepRun} data-deeprun="1">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <circle cx="12" cy="8" r="3.4"></circle>
                      <path d="M5.5 19.5c1-3.1 3.4-4.7 6.5-4.7s5.5 1.6 6.5 4.7"></path>
                    </svg>
                    {' '}Deep enrich all missing{' '}
                  </button>
                </div>
                <div data-socbar="1" style={{position: "sticky", top: "12px", zIndex: "30", padding: "14px 16px", borderRadius: "22px", background: "#F5F5F4", boxShadow: "0 18px 36px -26px rgba(28,28,28,.55)"}}>
                  <div style={{display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px"}}>
                    <div style={{display: "flex", alignItems: "center", gap: "10px", flex: "1", minWidth: "220px", height: "44px", padding: "0 16px", borderRadius: "999px", background: "#EAEAE8"}}>
                      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="#3A3D3B" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true" style={{flex: "none"}}>
                        <circle cx="11" cy="11" r="6.5"></circle>
                        <path d="M16 16l4.5 4.5"></path>
                      </svg>
                      <input data-fq="dm" type="search" onInput={V.fDm.onInput} onKeyDown={V.fDm.onKey} onBlur={V.fDm.onBlur} placeholder="Search person, role or business…" aria-label="Search person, role or business" style={{flex: "1", minWidth: "0", height: "100%", border: "0", background: "transparent", fontSize: "13.5px", color: "#1C1C1C", outline: "none"}} value={V.fDm.q} />
                    </div>
                    <span style={{position: "relative", display: "block"}}>
                      <select onChange={V.fDm.onState} aria-label="Filter rows" style={{height: "44px", padding: "0 36px 0 16px", border: "0", borderRadius: "999px", background: "#EAEAE8", fontFamily: "inherit", fontSize: "13.5px", color: "#1C1C1C", outline: "none", appearance: "none"}}>
                        <option>All</option>
                        <option>Named contacts</option>
                        <option>Blocked leads</option>
                        <option>Pending</option>
                        <option>No website</option>
                      </select>
                      <span aria-hidden="true" style={{position: "absolute", right: "14px", top: "15px", display: "block", pointerEvents: "none", color: "#4A4F4B"}}>
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M6 9.5l6 6 6-6"></path>
                        </svg>
                      </span>
                    </span>
                    <button type="button" onClick={V.fDm.act} data-run="1" style={{display: "inline-flex", alignItems: "center", gap: "9px", height: "44px", padding: "0 20px", border: "0", borderRadius: "999px", background: "#1C1C1C", color: "#F0F0F0", fontFamily: "inherit", fontSize: "13.5px", fontWeight: "500", cursor: "pointer", transition: "transform .3s cubic-bezier(.22,1,.36,1)"}} data-fact="fDm">
                      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <circle cx="12" cy="8" r="3.5"></circle>
                        <path d="M5 20c.8-3.6 3.6-5.5 7-5.5s6.2 1.9 7 5.5"></path>
                      </svg>
                      {' '}Review suggestions{' '}
                    </button>
                    <button type="button" onClick={V.openImp} data-ghost="1" style={{display: "inline-flex", alignItems: "center", gap: "8px", height: "44px", padding: "0 18px", border: "0", borderRadius: "999px", background: "#E5E5E5", color: "#1C1C1C", fontFamily: "inherit", fontSize: "13.5px", fontWeight: "500", cursor: "pointer", transition: "background .25s linear"}}>
                      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M12 15.5V4"></path>
                        <path d="M8 7.5l4-4 4 4"></path>
                        <path d="M4.5 19.5h15"></path>
                      </svg>
                      {' '}Import websites{' '}
                    </button>
                    <button type="button" onClick={V.fDm.refresh} data-ghost="1" style={{display: "inline-flex", alignItems: "center", gap: "8px", height: "44px", padding: "0 18px", border: "0", borderRadius: "999px", background: "#E5E5E5", color: "#1C1C1C", fontFamily: "inherit", fontSize: "13.5px", fontWeight: "500", cursor: "pointer", transition: "background .25s linear"}}>
                      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M20 12a8 8 0 1 1-2.6-5.9"></path>
                        <path d="M20 4v4.5h-4.5"></path>
                      </svg>
                      {' '}Refresh{' '}
                    </button>
                    <button type="button" onClick={V.fDm.openHist} data-ghost="1" style={{display: "inline-flex", alignItems: "center", gap: "8px", height: "44px", padding: "0 18px", border: "0", borderRadius: "999px", background: "#E5E5E5", color: "#1C1C1C", fontFamily: "inherit", fontSize: "13.5px", fontWeight: "500", cursor: "pointer", transition: "background .25s linear"}}>
                      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M4 12a8 8 0 1 0 2.4-5.7"></path>
                        <path d="M4 4.5V8.5h4"></path>
                        <path d="M12 8v4.5l3 2"></path>
                      </svg>
                      {' '}History{' '}
                      <span style={{display: "grid", placeItems: "center", minWidth: "22px", height: "22px", padding: "0 6px", borderRadius: "999px", background: "#C8D5BB", fontSize: "11px", fontWeight: "600"}}>{V.fDm.count}</span>
                    </button>
                  </div>
                  <div style={{display: "flex", flexWrap: "wrap", alignItems: "center", gap: "6px", marginTop: "10px"}}>
                    <span style={{marginRight: "4px", fontSize: "10.5px", fontWeight: "500", letterSpacing: ".14em", textTransform: "uppercase", color: "#555956"}}>Recent</span>
                    {(V.fDm.hist ?? []).map((h, __ih) => (
                      <Fragment key={__ih}>
                        <button type="button" onClick={h.run} style={{display: "inline-flex", alignItems: "center", gap: "7px", height: "30px", padding: "0 12px", border: "0", borderRadius: "999px", fontFamily: "inherit", fontSize: "12.5px", cursor: "pointer"}} data-socrecent="1">
                          {h.q}
                          <span style={{fontSize: "11px", color: "#5A5F5C", fontVariantNumeric: "tabular-nums"}}>{h.n}</span>
                        </button>
                      </Fragment>
                    ))}
                    <span data-fcount="dm" style={{marginLeft: "auto", fontSize: "12px", color: "#5A5F5C"}}>{V.dmShowing} rows on screen</span>
                  </div>
                </div>
                {shows(V.fDm.scanOn) ? (
                  <>
                  <section data-card="1" style={{padding: "22px 24px", borderRadius: "22px", background: "#F5F5F4", animation: "lsPanelIn .45s cubic-bezier(.22,1,.36,1) both"}}>
                    <h2 data-fcov="dm" style={{margin: "0", fontSize: "19px", fontWeight: "500", letterSpacing: "-.01em"}}>Contact Coverage</h2>
                    <p style={{margin: "4px 0 0", fontSize: "13.5px", color: "#5A5F5C"}}>{V.fDm.scanSub}</p>
                    {shows(V.fDm.scanning) ? (
                      <>
                      <div style={{display: "flex", alignItems: "center", gap: "10px", marginTop: "16px", padding: "10px 14px", borderRadius: "14px", background: "#E7EDE0"}}>
                        <span aria-hidden="true" style={{width: "12px", height: "12px", borderRadius: "999px", border: "2px solid rgba(28,28,28,.2)", borderTopColor: "#1C1C1C", animation: "lsSpin .8s linear infinite", flex: "none"}}></span>
                        <span style={{fontSize: "13px", fontWeight: "500"}}>{V.fDm.scanBadge}</span>
                      </div>
                      </>
                    ) : null}
                    {shows(V.fDm.scanOn) ? (
                      <>
                      <div style={{display: "flex", flexWrap: "wrap", alignItems: "center", gap: "10px", marginTop: "16px", padding: "8px 8px 8px 14px", borderRadius: "14px", background: "#E7EDE0"}}>
                        <span style={{flex: "1", minWidth: "180px", fontSize: "13px", fontWeight: "500"}}>{V.fDm.scanLabel}</span>
                        <button type="button" onClick={V.fDm.exit} style={{height: "32px", padding: "0 14px", border: "0", borderRadius: "999px", background: "#1C1C1C", color: "#F0F0F0", fontFamily: "inherit", fontSize: "12.5px", fontWeight: "500", cursor: "pointer"}} data-exitscan="1">Show all leads</button>
                      </div>
                      </>
                    ) : null}
                    <div style={{display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(96px,1fr))", gap: "14px", marginTop: "20px"}}>
                      {(V.fDm.rings ?? []).map((r, __ir) => (
                        <Fragment key={__ir}>
                          <div style={{display: "flex", flexDirection: "column", alignItems: "center", gap: "10px"}}>
                            <span style={{position: "relative", display: "grid", placeItems: "center", width: "98px", height: "98px"}}>
                              <svg viewBox="0 0 100 100" aria-hidden="true" style={{position: "absolute", inset: "0", width: "100%", height: "100%", transform: "rotate(-90deg)"}}>
                                <circle cx="50" cy="50" r="44" fill="none" stroke="#DADCD7" strokeWidth="7"></circle>
                                <circle cx="50" cy="50" r="44" fill="none" stroke="#1C1C1C" strokeWidth="7" strokeLinecap="round" strokeDasharray="276.5" strokeDashoffset={r.off}></circle>
                              </svg>
                              <span style={{fontSize: "22px", fontWeight: "400", letterSpacing: "-.02em", fontVariantNumeric: "tabular-nums"}}>
                                {r.pct}
                                <span style={{fontSize: "11px", color: "#5A5F5C"}}>%</span>
                              </span>
                            </span>
                            <span style={{textAlign: "center"}}>
                              <span style={{display: "block", fontSize: "13.5px", fontWeight: "500"}}>{r.name}</span>
                              <span style={{display: "block", marginTop: "2px", fontSize: "12px", color: "#5A5F5C", fontVariantNumeric: "tabular-nums"}}>{r.leads}</span>
                            </span>
                          </div>
                        </Fragment>
                      ))}
                    </div>
                  </section>
                  <section data-card="1" style={{padding: "22px 24px", borderRadius: "22px", background: "#F5F5F4", animation: "lsPanelIn .45s cubic-bezier(.22,1,.36,1) both"}}>
                    <div style={{display: "flex", flexWrap: "wrap", alignItems: "center", gap: "12px"}}>
                      <h2 data-fres="dm" style={{margin: "0", fontSize: "19px", fontWeight: "500", letterSpacing: "-.01em"}}>People found</h2>
                      {shows(V.fDm.scanDone) ? (
                        <>
                        <button type="button" onClick={V.fDm.exportScan} data-run="1" style={{display: "inline-flex", alignItems: "center", gap: "8px", height: "40px", padding: "0 18px", marginLeft: "auto", border: "0", borderRadius: "999px", background: "#1C1C1C", color: "#F0F0F0", fontFamily: "inherit", fontSize: "13px", fontWeight: "500", whiteSpace: "nowrap", cursor: "pointer", transition: "transform .3s cubic-bezier(.22,1,.36,1)", animation: "lsPanelIn .35s cubic-bezier(.22,1,.36,1) both"}}>
                          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M12 4v10"></path>
                            <path d="M8 10.5l4 4 4-4"></path>
                            <path d="M4.5 18.5h15"></path>
                          </svg>
                          Export
                        </button>
                        </>
                      ) : null}
                    </div>
                    <ul style={{listStyle: "none", margin: "14px 0 0", padding: "0", display: "flex", flexDirection: "column"}}>
                      {(V.fDm.rows ?? []).map((w, __iw) => (
                        <Fragment key={__iw}>
                          <li data-scanrow={w.pill} style={{display: "grid", gridTemplateColumns: "minmax(140px,220px) minmax(0,1fr) auto", alignItems: "center", gap: "14px", padding: "13px 10px", borderTop: "1px solid #E4E5E2", borderRadius: "12px", transition: "background .6s linear", animation: "lsPanelIn .45s cubic-bezier(.22,1,.36,1) both"}}>
                            <span style={{minWidth: "0"}}>
                              <span style={{display: "block", fontSize: "10.5px", fontWeight: "600", letterSpacing: ".08em", color: "#4A4F4B"}}>NEW</span>
                              <span style={{display: "block", marginTop: "2px", fontSize: "14px", fontWeight: "500", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis"}}>{w.domain}</span>
                            </span>
                            <span style={{display: "flex", flexWrap: "wrap", gap: "6px", minWidth: "0"}}>
                              {shows(w.scanning) ? (
                                <>
                                <span style={{display: "inline-flex", alignItems: "center", gap: "7px", fontSize: "12.5px", color: "#4A4F4B"}}>
                                  <span aria-hidden="true" style={{width: "11px", height: "11px", borderRadius: "999px", border: "1.5px solid rgba(28,28,28,.2)", borderTopColor: "#1C1C1C", animation: "lsSpin .8s linear infinite"}}></span>
                                  {w.scanLabel}
                                </span>
                                </>
                              ) : null}
                              {(w.items ?? []).map((it, __iit) => (
                                <Fragment key={__iit}>
                                  <span style={{display: "inline-flex", flexDirection: "column", gap: "1px", maxWidth: "100%", padding: "6px 11px", borderRadius: "12px", background: "#EAEAE8", animation: "lsPanelIn .4s cubic-bezier(.22,1,.36,1) both"}}>
                                    <span style={{fontSize: "13px", fontWeight: "500", overflowWrap: "anywhere"}}>{it.t}</span>
                                    <span style={{fontSize: "11px", color: "#5A5F5C"}}>{it.k}</span>
                                  </span>
                                </Fragment>
                              ))}
                              {shows(w.none) ? (
                                <>
                                <span style={{fontSize: "12.5px", color: "#5A5F5C"}}>Nothing published on this site</span>
                                </>
                              ) : null}
                            </span>
                            <span data-impst={w.pill} style={{padding: "5px 11px", borderRadius: "999px", fontSize: "11.5px", fontWeight: "500", whiteSpace: "nowrap"}}>{w.status}</span>
                          </li>
                        </Fragment>
                      ))}
                    </ul>
                  </section>
                  </>
                ) : null}
                <div data-dmbody="1" style={{display: "grid", gridTemplateColumns: "300px minmax(0,1fr)", gap: "clamp(12px,1.4vw,20px)", alignItems: "start"}}>
                  <div style={{display: "flex", flexDirection: "column", gap: "clamp(12px,1.4vw,20px)"}}>
                    <section data-card="1" style={{padding: "22px 24px", borderRadius: "22px", background: "linear-gradient(170deg,#E9EDE4 0%,#CBD8BC 100%)", transition: "transform .5s cubic-bezier(.22,1,.36,1),box-shadow .5s linear"}}>
                      <div style={{fontSize: "10.5px", fontWeight: "500", letterSpacing: ".16em", textTransform: "uppercase", color: "#4C554A"}}>Coverage</div>
                      <div style={{display: "flex", alignItems: "flex-end", gap: "10px", marginTop: "12px"}}>
                        <span style={{fontSize: "clamp(44px,5vw,60px)", lineHeight: ".86", fontWeight: "700", letterSpacing: "-.05em", backgroundImage: "radial-gradient(circle at 50% 50%,#1C1C1C 1.45px,transparent 1.55px)", backgroundSize: "3.2px 3.2px", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent", WebkitTextFillColor: "transparent", animation: "lsPop .7s cubic-bezier(.22,1,.36,1) both"}}>{V.dmMatched}</span>
                        <span style={{fontSize: "15px", color: "#4C554A", paddingBottom: "5px"}}>of {V.dmTotal}</span>
                      </div>
                      <div style={{height: "8px", marginTop: "14px", borderRadius: "4px", background: "rgba(255,255,255,.6)", overflow: "hidden"}}>
                        <span style={{display: "block", height: "100%", width: "{{ dmCoveragePct }}%", borderRadius: "4px", background: "#1C1C1C"}}></span>
                      </div>
                      <div style={{display: "flex", justifyContent: "space-between", marginTop: "9px", fontSize: "12.5px", color: "#4C554A"}}>
                        <span>{V.dmCoveragePct}% have a named contact</span>
                        <span>{V.dmMissing} missing</span>
                      </div>
                    </section>
                    <section data-card="1" style={{padding: "22px 24px", borderRadius: "22px", background: "#F5F5F4", transition: "transform .5s cubic-bezier(.22,1,.36,1),box-shadow .5s linear"}}>
                      <h2 style={{margin: "0", fontSize: "17px", fontWeight: "500", letterSpacing: "-.01em"}}>Seniority Mix</h2>
                      <p style={{margin: "4px 0 0", fontSize: "13px", color: "#5A5F5C"}}>{V.dmSeniorityNote}</p>
                      <ul style={{listStyle: "none", margin: "14px 0 0", padding: "0", display: "flex", flexDirection: "column"}}>
                        {(V.dmSeniority ?? []).map((s, __is) => (
                          <Fragment key={__is}>
                            <li style={{display: "flex", alignItems: "center", gap: "10px", padding: "10px 0", borderTop: "1px solid #E4E5E2"}}>
                              <span style={{flex: "1", fontSize: "13.5px"}}>{s.role}</span>
                              <span style={{fontSize: "14.5px", fontWeight: "500"}}>{s.count}</span>
                            </li>
                          </Fragment>
                        ))}
                      </ul>
                    </section>
                    <section data-card="1" style={{padding: "22px 24px", borderRadius: "22px", background: "#1C1C1C", color: "#F0F0F0", transition: "transform .5s cubic-bezier(.22,1,.36,1),box-shadow .5s linear"}}>
                      <h2 style={{margin: "0", fontSize: "17px", fontWeight: "500", letterSpacing: "-.01em"}}>Deep Enrich</h2>
                      <p style={{margin: "4px 0 0", fontSize: "13px", color: "#9BA29C"}}>Costs one credit per lead.</p>
                      <div style={{display: "flex", flexDirection: "column", gap: "8px", marginTop: "16px"}}>
                        <button type="button" data-attn="1" style={{display: "flex", alignItems: "center", gap: "12px", width: "100%", padding: "13px 15px", border: "0", borderRadius: "14px", background: "#C8D5BB", color: "#1C1C1C", fontFamily: "inherit", fontSize: "13.5px", fontWeight: "500", textAlign: "left", cursor: "pointer"}} onClick={V.deepRun} data-deeprun="1">
                          <span style={{flex: "1"}}>Enrich all missing</span>
                          <span>{V.dmMissing}</span>
                        </button>
                        <div style={{display: "flex", alignItems: "center", gap: "12px", padding: "13px 15px", borderRadius: "14px", background: "#212221", color: "#7E837F", fontSize: "13.5px"}}>
                          <span style={{flex: "1"}}>Enrich selected</span>
                          <span>0</span>
                        </div>
                      </div>
                    </section>
                  </div>
                  <div style={{display: "flex", flexDirection: "column", gap: "clamp(12px,1.4vw,20px)", minWidth: "0"}}>
                    <section data-card="1" style={{padding: "22px 24px", borderRadius: "22px", background: "#F5F5F4", transition: "transform .5s cubic-bezier(.22,1,.36,1),box-shadow .5s linear"}}>
                      <div style={{display: "flex", flexWrap: "wrap", alignItems: "flex-start", justifyContent: "space-between", gap: "12px"}}>
                        <div>
                          <h2 style={{margin: "0", fontSize: "19px", fontWeight: "500", letterSpacing: "-.01em"}}>Where Matches Drop Off</h2>
                          <p style={{margin: "4px 0 0", fontSize: "13.5px", color: "#5A5F5C"}}>Every stage a lead must clear before a named contact lands.</p>
                        </div>
                        <span style={{display: "inline-flex", alignItems: "center", gap: "6px", padding: "6px 12px", borderRadius: "999px", background: "#1C1C1C", color: "#F0F0F0", fontSize: "11.5px", whiteSpace: "nowrap"}}>
                          Biggest loss:{' '}
                          <strong style={{fontWeight: "700"}}>no company page</strong>
                        </span>
                      </div>
                      <ul style={{listStyle: "none", margin: "20px 0 0", padding: "0"}}>
                        {(V.dmStages ?? []).map((st, __ist) => (
                          <Fragment key={__ist}>
                            <li style={{position: "relative", padding: "0 0 18px 26px"}}>
                              <span aria-hidden="true" style={{position: "absolute", left: "5px", top: "6px", width: "9px", height: "9px", borderRadius: "999px", background: "#1C1C1C"}}></span>
                              <span aria-hidden="true" style={{position: "absolute", left: "9px", top: "18px", bottom: "0", width: "1px", background: "#DEDFDC"}}></span>
                              <div style={{display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: "10px"}}>
                                <span style={{fontSize: "17px", fontWeight: "500", fontVariantNumeric: "tabular-nums"}}>{st.count}</span>
                                <span style={{flex: "1", minWidth: "140px", fontSize: "13.5px", color: "#4A4F4B"}}>{st.label}</span>
                              </div>
                              <div style={{height: "7px", marginTop: "8px", borderRadius: "4px", background: "#E7E8E5", overflow: "hidden"}}>
                                <span style={{display: "block", height: "100%", width: st.width, borderRadius: "4px", background: "#1C1C1C", transformOrigin: "left", animation: "lsGrow .9s cubic-bezier(.22,1,.36,1) both"}}></span>
                              </div>
                            </li>
                          </Fragment>
                        ))}
                      </ul>
                    </section>
                    <section data-flistcard="dm" data-card="1" style={{padding: "22px 24px", borderRadius: "22px", background: "#F5F5F4", transition: "transform .5s cubic-bezier(.22,1,.36,1),box-shadow .5s linear"}}>
                      <div style={{display: "flex", flexWrap: "wrap", alignItems: "center", gap: "12px"}}>
                        <div>
                          <h2 style={{margin: "0", fontSize: "19px", fontWeight: "500", letterSpacing: "-.01em"}}>Matched Contacts</h2>
                          <p style={{margin: "4px 0 0", fontSize: "13.5px", color: "#5A5F5C"}}>{V.dmShowingLabel}</p>
                        </div>
                        <div style={{display: "flex", alignItems: "center", gap: "8px", marginLeft: "auto", flexWrap: "wrap"}}>
                          <button type="button" onClick={V.openExp} data-run="1" style={{display: "inline-flex", alignItems: "center", gap: "8px", height: "40px", padding: "0 18px", border: "0", borderRadius: "999px", background: "#1C1C1C", color: "#F0F0F0", fontFamily: "inherit", fontSize: "13px", fontWeight: "500", whiteSpace: "nowrap", cursor: "pointer", transition: "transform .3s cubic-bezier(.22,1,.36,1)"}}>
                            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <path d="M12 4v10"></path>
                              <path d="M8 10.5l4 4 4-4"></path>
                              <path d="M4.5 18.5h15"></path>
                            </svg>
                            Export
                          </button>
                          {shows(V.dmMoreContactsOn) ? (
                            <>
                            <button type="button" data-ghost="1" style={{display: "inline-flex", alignItems: "center", gap: "8px", height: "42px", padding: "0 18px", border: "0", borderRadius: "999px", background: "#EAEAE8", color: "#1C1C1C", fontFamily: "inherit", fontSize: "13px", fontWeight: "500", cursor: "pointer"}} onClick={V.showAllDmContacts}>{V.dmShowAllLabel}</button>
                            </>
                          ) : null}
                        </div>
                      </div>
                      <div data-flist="dm" data-fpart="contacts" style={{display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,210px),1fr))", gap: "12px", marginTop: "18px"}}>
                        {(V.dmRows ?? []).map((d, __id) => (
                          <Fragment key={__id}>
                            <article data-person="1" style={{display: "flex", flexDirection: "column", gap: "14px", padding: "20px", borderRadius: "18px", background: "#EDEEEB", transition: "transform .4s cubic-bezier(.22,1,.36,1),box-shadow .4s linear"}}>
                              <div style={{display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "10px"}}>
                                <span aria-hidden="true" style={{display: "grid", placeItems: "center", width: "44px", height: "44px", borderRadius: "999px", background: "#C8D5BB", fontSize: "14px", fontWeight: "700", flex: "none"}}>{d.ini}</span>
                                {shows(d.isStrong) ? (
                                  <>
                                  <span style={{padding: "5px 11px", borderRadius: "999px", background: "#1C1C1C", color: "#F0F0F0", fontWeight: "500", fontSize: "11px", whiteSpace: "nowrap"}}>{d.strong}</span>
                                  </>
                                ) : null}
                                {shows(d.isLikely) ? (
                                  <>
                                  <span style={{padding: "5px 11px", borderRadius: "999px", background: "#C8D5BB", color: "#1C1C1C", fontWeight: "500", fontSize: "11px", whiteSpace: "nowrap"}}>{d.likely}</span>
                                  </>
                                ) : null}
                              </div>
                              <div>
                                <div style={{fontSize: "16px", fontWeight: "500", letterSpacing: "-.01em"}}>{d.name}</div>
                                <div style={{marginTop: "3px", fontSize: "13px", color: "#4A4F4B"}}>{d.title}</div>
                              </div>
                              <div style={{marginTop: "auto", paddingTop: "12px", borderTop: "1px solid #DEDFDC"}}>
                                <div style={{fontSize: "13px", fontWeight: "500", textWrap: "pretty"}}>{d.lead}</div>
                                <div style={{marginTop: "3px", fontSize: "12px", color: "#5A5F5C", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis"}}>{d.domain}</div>
                              </div>
                              {shows(d.showProfile) ? (
                                <>
                                <a data-ghost="1" style={{display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "8px", width: "100%", height: "38px", border: "0", borderRadius: "999px", background: "#F5F5F4", color: "#1C1C1C", fontFamily: "inherit", fontSize: "12.5px", fontWeight: "500", cursor: "pointer", textDecoration: "none"}} href={d.linkedinUrl} target="_blank" rel="noopener noreferrer" data-profile-link={d.linkedinUrl} role="button">
                                  <span aria-hidden="true" style={{display: "grid", placeItems: "center", width: "18px", height: "18px", borderRadius: "5px", background: "#1C1C1C", color: "#F0F0F0", fontSize: "9px", fontWeight: "700"}}>in</span>
                                  {' '}View profile{' '}
                                </a>
                                </>
                              ) : null}
                            </article>
                          </Fragment>
                        ))}
                      </div>
                    </section>
                    <section data-flistcard="dm" data-card="1" style={{padding: "22px 24px", borderRadius: "22px", background: "#F5F5F4", transition: "transform .5s cubic-bezier(.22,1,.36,1),box-shadow .5s linear"}}>
                      <div style={{display: "flex", flexWrap: "wrap", alignItems: "flex-start", justifyContent: "space-between", gap: "12px"}}>
                        <div>
                          <h2 style={{margin: "0", fontSize: "19px", fontWeight: "500", letterSpacing: "-.01em"}}>Awaiting a Match</h2>
                          <p style={{margin: "4px 0 0", fontSize: "13.5px", color: "#5A5F5C"}}>{V.dmBlockerNote}</p>
                        </div>
                        <span style={{position: "relative", display: "block"}}>
                          <select aria-label="Blocker filter" style={{height: "42px", padding: "0 36px 0 16px", border: "0", borderRadius: "999px", background: "#EAEAE8", fontFamily: "inherit", fontSize: "13.5px", color: "#1C1C1C", outline: "none", appearance: "none"}}>
                            <option>All blockers</option>
                            <option>No people listed</option>
                            <option>No company page</option>
                            <option>No website</option>
                            <option>Pending</option>
                          </select>
                          <span aria-hidden="true" style={{position: "absolute", right: "14px", top: "14px", display: "block", pointerEvents: "none", color: "#4A4F4B"}}>
                            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M6 9.5l6 6 6-6"></path>
                            </svg>
                          </span>
                        </span>
                      </div>
                      <ul data-flist="dm" data-fpart="blockers" style={{listStyle: "none", margin: "16px 0 0", padding: "0", display: "flex", flexDirection: "column"}}>
                        {(V.dmBlockers ?? []).map((b, __ib) => (
                          <Fragment key={__ib}>
                            <li data-row="1" style={{display: "flex", flexWrap: "wrap", alignItems: "center", gap: "12px", padding: "12px 0", borderTop: "1px solid #E4E5E2", transition: "background .25s linear"}}>
                              <span aria-hidden="true" style={{width: "8px", height: "8px", borderRadius: "999px", background: "#C6C8C4", flex: "none"}}></span>
                              <span style={{flex: "1", minWidth: "160px", fontSize: "14px", fontWeight: "500"}}>{b.name}</span>
                              <span title={b.domain} style={{minWidth: "150px", fontSize: "12.5px", color: "#4A4F4B", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis"}}>{b.domain}</span>
                              <span style={{padding: "5px 11px", borderRadius: "999px", background: "#EAEAE8", color: "#4A4F4B", fontSize: "11.5px", minWidth: "120px", textAlign: "center", whiteSpace: "nowrap"}}>{b.blocker}</span>
                            </li>
                          </Fragment>
                        ))}
                      </ul>
                      <div style={{display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "12px", marginTop: "16px", paddingTop: "14px", borderTop: "1px solid #E4E5E2"}}>
                        <span style={{fontSize: "12.5px", color: "#5A5F5C"}}>Showing {V.dmBlockersShowing} of {V.dmMissing}</span>
                        {shows(V.dmBlockerMoreOn) ? (
                          <>
                          <button type="button" data-more="1" style={{display: "inline-flex", alignItems: "center", gap: "9px", height: "40px", padding: "0 18px", border: "0", borderRadius: "999px", background: "#EAEAE8", color: "#1C1C1C", fontFamily: "inherit", fontSize: "13px", fontWeight: "500", cursor: "pointer"}} onClick={V.showAllDmBlockers}>
                            {V.dmBlockerShowAllLabel}{' '}
                            <span aria-hidden="true">↓</span>
                          </button>
                          </>
                        ) : null}
                      </div>
                    </section>
                  </div>
                </div>
                <section data-card="1" style={{padding: "22px 24px", borderRadius: "22px", background: "#F5F5F4", transition: "transform .5s cubic-bezier(.22,1,.36,1),box-shadow .5s linear"}}>
                  <div style={{display: "flex", flexWrap: "wrap", alignItems: "flex-start", justifyContent: "space-between", gap: "12px"}}>
                    <div>
                      <h2 data-dmsugs="1" style={{margin: "0", fontSize: "19px", fontWeight: "500", letterSpacing: "-.01em"}}>Suggestions to review</h2>
                      <p style={{margin: "4px 0 0", maxWidth: "70ch", fontSize: "13.5px", lineHeight: "1.55", color: "#5A5F5C", textWrap: "pretty"}}>Only schema.org people, named mailto addresses, LinkedIn /in/ profiles and explicit name + role text are saved as decision makers. Softer hits wait here for you.</p>
                    </div>
                    <span style={{padding: "7px 14px", borderRadius: "999px", background: "#C8D5BB", fontSize: "12px", fontWeight: "500", whiteSpace: "nowrap"}}>{V.dmSugBadge}</span>
                  </div>
                  <ul style={{listStyle: "none", margin: "16px 0 0", padding: "0", display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(min(100%,300px),1fr))", gap: "10px"}}>
                    {(V.dmSugRows ?? []).map((d, __id) => (
                      <Fragment key={__id}>
                        <li data-dmsug={d.state} style={{display: "flex", flexDirection: "column", gap: "12px", padding: "16px", borderRadius: "18px", transition: "background .3s linear,opacity .3s linear"}}>
                          <div style={{display: "flex", alignItems: "flex-start", gap: "12px"}}>
                            <span aria-hidden="true" style={{display: "grid", placeItems: "center", width: "38px", height: "38px", borderRadius: "12px", background: "#E3E4E1", fontSize: "13px", fontWeight: "700", flex: "none"}}>{d.initials}</span>
                            <span style={{flex: "1", minWidth: "0"}}>
                              <span style={{display: "block", fontSize: "14.5px", fontWeight: "500"}}>{d.name}</span>
                              <span style={{display: "block", marginTop: "2px", fontSize: "12.5px", color: "#4A4F4B"}}>{d.role} · {d.lead}</span>
                            </span>
                          </div>
                          <span style={{display: "block", padding: "9px 12px", borderRadius: "12px", background: "#EAEAE8", fontSize: "12px", lineHeight: "1.5", color: "#4A4F4B"}}>{d.source}</span>
                          {shows(d.pending) ? (
                            <>
                            <div style={{display: "flex", gap: "8px"}}>
                              <button type="button" onClick={d.confirm} data-run="1" style={{flex: "1", height: "38px", border: "0", borderRadius: "999px", background: "#1C1C1C", color: "#F0F0F0", fontFamily: "inherit", fontSize: "12.5px", fontWeight: "500", cursor: "pointer", transition: "transform .3s cubic-bezier(.22,1,.36,1)"}}>Confirm</button>
                              <button type="button" onClick={d.dismiss} data-ghost="1" style={{flex: "1", height: "38px", border: "0", borderRadius: "999px", background: "#E5E5E5", color: "#1C1C1C", fontFamily: "inherit", fontSize: "12.5px", fontWeight: "500", cursor: "pointer", transition: "background .25s linear"}}>Dismiss</button>
                            </div>
                            </>
                          ) : null}
                          {shows(d.resolved) ? (
                            <>
                            <div style={{display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", height: "38px"}}>
                              <span style={{fontSize: "12.5px", fontWeight: "500"}}>{d.outcome}</span>
                              <button type="button" onClick={d.undo} style={{padding: "0", border: "0", background: "transparent", fontFamily: "inherit", fontSize: "12.5px", color: "#4A4F4B", textDecoration: "underline", cursor: "pointer"}}>Undo</button>
                            </div>
                            </>
                          ) : null}
                        </li>
                      </Fragment>
                    ))}
                  </ul>
                </section>
              </div>
              </>
            ) : null}
            {shows(V.isWebsite) ? (
              <>
              <div style={{display: "flex", flexDirection: "column", gap: "clamp(12px,1.5vw,20px)"}}>
                <div style={{display: "flex", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: "16px"}}>
                  <div>
                    <div style={{display: "flex", alignItems: "center", gap: "12px"}}>
                      <h1 style={{margin: "0", fontSize: "clamp(26px,2.6vw,36px)", lineHeight: "1.1", letterSpacing: "-.03em", fontWeight: "400"}}>Website Lookup</h1>
                      <span style={{display: "inline-flex", alignItems: "center", gap: "7px", padding: "6px 13px", borderRadius: "999px", background: "#E3E4E1", fontSize: "10.5px", fontWeight: "500", letterSpacing: ".14em", color: "#4A4F4B"}}>
                        <span aria-hidden="true" style={{width: "6px", height: "6px", borderRadius: "999px", background: "#8B908C"}}></span>
                        IDLE{' '}
                      </span>
                    </div>
                    <p style={{margin: "8px 0 0", maxWidth: "80ch", fontSize: "14.5px", color: "#5A5F5C", textWrap: "pretty"}}>Paste or upload a list of websites — we'll find the business name, address, phone, emails, socials, and LinkedIn for each.</p>
                  </div>
                  <span style={{display: "inline-flex", alignItems: "center", gap: "8px", padding: "9px 16px", borderRadius: "999px", background: "#F5F5F4", fontSize: "12.5px", color: "#4A4F4B"}}>{V.importStatus}</span>
                </div>
                <div data-lookuptop="1" style={{display: "grid", gridTemplateColumns: "minmax(0,1.45fr) minmax(0,1fr)", gap: "clamp(12px,1.4vw,20px)", alignItems: "start"}}>
                  <section data-card="1" style={{padding: "clamp(22px,3vw,34px)", borderRadius: "22px", background: "linear-gradient(160deg,#E9EDE4 0%,#CBD8BC 100%)", transition: "transform .5s cubic-bezier(.22,1,.36,1),box-shadow .5s linear"}}>
                    <div style={{display: "flex", alignItems: "center", gap: "12px"}}>
                      <span aria-hidden="true" style={{display: "grid", placeItems: "center", width: "38px", height: "38px", borderRadius: "12px", background: "rgba(255,255,255,.6)", color: "#1C1C1C", flex: "none"}}>
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{flex: "none"}}>
                          <path d="M9.5 14.5l-2 2a3.5 3.5 0 0 1-5-5l3-3a3.5 3.5 0 0 1 5 0"></path>
                          <path d="M14.5 9.5l2-2a3.5 3.5 0 0 1 5 5l-3 3a3.5 3.5 0 0 1-5 0"></path>
                        </svg>
                      </span>
                      <div>
                        <h2 style={{margin: "0", fontSize: "19px", fontWeight: "500", letterSpacing: "-.01em"}}>Start with a list</h2>
                        <p style={{margin: "3px 0 0", fontSize: "13.5px", color: "#4C554A"}}>One website per line, or upload a CSV.</p>
                      </div>
                    </div>
                    <div style={{marginTop: "20px", padding: "18px 20px", border: "1.5px dashed rgba(28,28,28,.28)", borderRadius: "18px", background: "rgba(255,255,255,.42)"}}>
                      <div style={{display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "12px"}}>
                        <span style={{fontSize: "11px", fontWeight: "500", letterSpacing: ".14em", textTransform: "uppercase", color: "#4C554A"}}>Paste websites</span>
                        <span style={{fontSize: "11.5px", color: "#4C554A"}}>{V.importSummary}</span>
                      </div>
                      <div style={{display: "flex", gap: "14px", marginTop: "12px"}}>
                        <div aria-hidden="true" style={{display: "flex", flexDirection: "column", gap: "0", fontSize: "12.5px", lineHeight: "28px", color: "#4C554A", fontVariantNumeric: "tabular-nums", textAlign: "right", flex: "none"}}>
                          <span>01</span>
                          <span>02</span>
                          <span>03</span>
                          <span>04</span>
                          <span>05</span>
                        </div>
                        <div style={{width: "1px", background: "rgba(28,28,28,.16)", flex: "none"}}></div>
                        <div style={{minWidth: "0", fontSize: "14px", lineHeight: "2", color: "#3F4A3C", fontVariantNumeric: "tabular-nums"}}>
                          <span style={{display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis"}}>northernspine.co.uk</span>
                          <span style={{display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis"}}>deansgatephysio.co.uk</span>
                          <span style={{display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis"}}>rehablab.uk</span>
                          <span style={{display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis"}}>chorltonmovement.com</span>
                          <span style={{display: "block", color: "#4C554A"}}>…and 24 more</span>
                        </div>
                      </div>
                    </div>
                    <div style={{display: "flex", flexWrap: "wrap", gap: "8px", marginTop: "18px"}}>
                      <button type="button" onClick={V.openImp} data-run="1" style={{display: "inline-flex", alignItems: "center", gap: "9px", height: "44px", padding: "0 22px", border: "0", borderRadius: "999px", background: "#1C1C1C", color: "#F0F0F0", fontFamily: "inherit", fontSize: "13.5px", fontWeight: "500", cursor: "pointer", transition: "transform .3s cubic-bezier(.22,1,.36,1)"}}>
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{flex: "none"}}>
                          <path d="M12 15.5V4"></path>
                          <path d="M8 7.5l4-4 4 4"></path>
                          <path d="M4.5 19.5h15"></path>
                        </svg>
                        {' '}Import websites{' '}
                      </button>
                      <button type="button" data-attn="1" style={{display: "inline-flex", alignItems: "center", gap: "9px", height: "44px", padding: "0 20px", border: "0", borderRadius: "999px", background: "rgba(255,255,255,.62)", color: "#1C1C1C", fontFamily: "inherit", fontSize: "13.5px", fontWeight: "500", cursor: "pointer"}} data-lookup-action="clipboard" onClick={V.pasteWebsiteClipboard}>
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{flex: "none"}}>
                          <rect x="7" y="3.5" width="12" height="15" rx="3"></rect>
                          <path d="M5 7.5v11a2.5 2.5 0 0 0 2.5 2.5H15"></path>
                        </svg>
                        {' '}Paste from clipboard{' '}
                      </button>
                      <button type="button" data-attn="1" style={{display: "inline-flex", alignItems: "center", gap: "9px", height: "44px", padding: "0 20px", border: "0", borderRadius: "999px", background: "rgba(255,255,255,.62)", color: "#1C1C1C", fontFamily: "inherit", fontSize: "13.5px", fontWeight: "500", cursor: "pointer"}} data-lookup-action="csv" onClick={V.uploadWebsiteCsv}>
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{flex: "none"}}>
                          <path d="M6 3.5h8l4.5 4.5v12.5H6z"></path>
                          <path d="M14 3.5V8h4.5"></path>
                        </svg>
                        {' '}Upload CSV{' '}
                      </button>
                    </div>
                    <p style={{margin: "14px 0 0", fontSize: "12.5px", color: "#4C554A"}}>Supports up to 500 sites per import. Duplicates against your 128 existing leads are skipped automatically.</p>
                  </section>
                  <section data-card="1" style={{padding: "22px 24px", borderRadius: "22px", background: "#F5F5F4", transition: "transform .5s cubic-bezier(.22,1,.36,1),box-shadow .5s linear"}}>
                    <div style={{display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px"}}>
                      <div style={{minWidth: "0"}}>
                        <h2 style={{margin: "0", fontSize: "19px", fontWeight: "500", letterSpacing: "-.01em"}}>One site, filled in</h2>
                        <p style={{margin: "4px 0 0", fontSize: "13px", color: "#5A5F5C", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis"}}>deansgatephysio.co.uk</p>
                      </div>
                      <span style={{padding: "5px 12px", borderRadius: "999px", background: "#C8D5BB", fontSize: "11px", fontWeight: "500", whiteSpace: "nowrap", flex: "none"}}>Example</span>
                    </div>
                    <ul style={{listStyle: "none", margin: "14px 0 0", padding: "0", display: "flex", flexDirection: "column"}}>
                      <li style={{display: "flex", alignItems: "flex-start", gap: "11px", padding: "11px 0", borderTop: "1px solid #E4E5E2"}}>
                        <span aria-hidden="true" style={{display: "grid", placeItems: "center", width: "28px", height: "28px", borderRadius: "9px", background: "#DDE3D6", color: "#3A4238", flex: "none"}}>
                          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{flex: "none"}}>
                            <path d="M4 20V8.5l8-4.5 8 4.5V20"></path>
                            <path d="M9.5 20v-5h5v5"></path>
                          </svg>
                        </span>
                        <span style={{minWidth: "0", flex: "1"}}>
                          <span style={{display: "block", fontSize: "11px", letterSpacing: ".1em", textTransform: "uppercase", color: "#555956"}}>Business name</span>
                          <span style={{display: "block", marginTop: "3px", fontSize: "13.5px", fontWeight: "500", textWrap: "pretty"}}>Deansgate Physio Rooms</span>
                        </span>
                      </li>
                      <li style={{display: "flex", alignItems: "flex-start", gap: "11px", padding: "11px 0", borderTop: "1px solid #E4E5E2"}}>
                        <span aria-hidden="true" style={{display: "grid", placeItems: "center", width: "28px", height: "28px", borderRadius: "9px", background: "#DDE3D6", color: "#3A4238", flex: "none"}}>
                          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{flex: "none"}}>
                            <path d="M12 21s6.5-6 6.5-10.5A6.5 6.5 0 0 0 5.5 10.5C5.5 15 12 21 12 21z"></path>
                            <circle cx="12" cy="10.5" r="2.2"></circle>
                          </svg>
                        </span>
                        <span style={{minWidth: "0", flex: "1"}}>
                          <span style={{display: "block", fontSize: "11px", letterSpacing: ".1em", textTransform: "uppercase", color: "#555956"}}>Address</span>
                          <span style={{display: "block", marginTop: "3px", fontSize: "13.5px", fontWeight: "500", textWrap: "pretty"}}>244 Deansgate, Manchester M3 4BQ</span>
                        </span>
                      </li>
                      <li style={{display: "flex", alignItems: "flex-start", gap: "11px", padding: "11px 0", borderTop: "1px solid #E4E5E2"}}>
                        <span aria-hidden="true" style={{display: "grid", placeItems: "center", width: "28px", height: "28px", borderRadius: "9px", background: "#DDE3D6", color: "#3A4238", flex: "none"}}>
                          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{flex: "none"}}>
                            <path d="M7 3.8l2.6.5 1.2 3.4-2 1.5a11 11 0 0 0 5.9 5.9l1.5-2 3.4 1.2.5 2.6a2 2 0 0 1-2.2 2.3C11.4 18.8 5.2 12.6 4.7 6a2 2 0 0 1 2.3-2.2z"></path>
                          </svg>
                        </span>
                        <span style={{minWidth: "0", flex: "1"}}>
                          <span style={{display: "block", fontSize: "11px", letterSpacing: ".1em", textTransform: "uppercase", color: "#555956"}}>Phone</span>
                          <span style={{display: "block", marginTop: "3px", fontSize: "13.5px", fontWeight: "500", textWrap: "pretty"}}>+44 161 887 3320</span>
                        </span>
                        <span style={{padding: "4px 10px", borderRadius: "999px", background: "#1C1C1C", color: "#F0F0F0", fontWeight: "500", fontSize: "11px", whiteSpace: "nowrap", flex: "none", marginTop: "14px"}}>Direct line</span>
                      </li>
                      <li style={{display: "flex", alignItems: "flex-start", gap: "11px", padding: "11px 0", borderTop: "1px solid #E4E5E2"}}>
                        <span aria-hidden="true" style={{display: "grid", placeItems: "center", width: "28px", height: "28px", borderRadius: "9px", background: "#DDE3D6", color: "#3A4238", flex: "none"}}>
                          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{flex: "none"}}>
                            <rect x="3.5" y="5.5" width="17" height="13" rx="3"></rect>
                            <path d="M4 7.5l8 5.5 8-5.5"></path>
                          </svg>
                        </span>
                        <span style={{minWidth: "0", flex: "1"}}>
                          <span style={{display: "block", fontSize: "11px", letterSpacing: ".1em", textTransform: "uppercase", color: "#555956"}}>Email</span>
                          <span style={{display: "block", marginTop: "3px", fontSize: "13.5px", fontWeight: "500", textWrap: "pretty"}}>info@deansgatephysio.co.uk</span>
                        </span>
                        <span style={{padding: "4px 10px", borderRadius: "999px", background: "#1C1C1C", color: "#F0F0F0", fontWeight: "500", fontSize: "11px", whiteSpace: "nowrap", flex: "none", marginTop: "14px"}}>95</span>
                      </li>
                      <li style={{display: "flex", alignItems: "flex-start", gap: "11px", padding: "11px 0", borderTop: "1px solid #E4E5E2"}}>
                        <span aria-hidden="true" style={{display: "grid", placeItems: "center", width: "28px", height: "28px", borderRadius: "9px", background: "#DDE3D6", color: "#3A4238", flex: "none"}}>
                          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{flex: "none"}}>
                            <circle cx="12" cy="12" r="8.5"></circle>
                            <path d="M3.5 12h17M12 3.5c2.2 2.4 3.3 5.3 3.3 8.5S14.2 18.1 12 20.5c-2.2-2.4-3.3-5.3-3.3-8.5S9.8 5.9 12 3.5z"></path>
                          </svg>
                        </span>
                        <span style={{minWidth: "0", flex: "1"}}>
                          <span style={{display: "block", fontSize: "11px", letterSpacing: ".1em", textTransform: "uppercase", color: "#555956"}}>Socials</span>
                          <span style={{display: "block", marginTop: "3px", fontSize: "13.5px", fontWeight: "500", textWrap: "pretty"}}>
                            <span style={{display: "flex", gap: "5px", marginTop: "2px"}}>
                              <span aria-hidden="true" style={{display: "grid", placeItems: "center", width: "24px", height: "24px", borderRadius: "7px", background: "#E3E4E1", fontSize: "10px", fontWeight: "700"}}>ig</span>
                              <span aria-hidden="true" style={{display: "grid", placeItems: "center", width: "24px", height: "24px", borderRadius: "7px", background: "#E3E4E1", fontSize: "10px", fontWeight: "700"}}>in</span>
                            </span>
                          </span>
                        </span>
                      </li>
                      <li style={{display: "flex", alignItems: "flex-start", gap: "11px", padding: "11px 0", borderTop: "1px solid #E4E5E2"}}>
                        <span aria-hidden="true" style={{display: "grid", placeItems: "center", width: "28px", height: "28px", borderRadius: "9px", background: "#DDE3D6", color: "#3A4238", flex: "none"}}>
                          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{flex: "none"}}>
                            <circle cx="12" cy="8" r="3.4"></circle>
                            <path d="M5.5 19.5c1-3.1 3.4-4.7 6.5-4.7s5.5 1.6 6.5 4.7"></path>
                          </svg>
                        </span>
                        <span style={{minWidth: "0", flex: "1"}}>
                          <span style={{display: "block", fontSize: "11px", letterSpacing: ".1em", textTransform: "uppercase", color: "#555956"}}>Decision maker</span>
                          <span style={{display: "block", marginTop: "3px", fontSize: "13.5px", fontWeight: "500", textWrap: "pretty"}}>Ruth Ellery · Clinic Director</span>
                        </span>
                      </li>
                    </ul>
                    <p style={{margin: "14px 0 0", fontSize: "12.5px", color: "#5A5F5C", textWrap: "pretty"}}>Six fields per site, filled in one pass. Anything the lookup can't find is left blank rather than guessed.</p>
                  </section>
                </div>
                <section data-card="1" style={{padding: "22px 24px", borderRadius: "22px", background: "#F5F5F4", transition: "transform .5s cubic-bezier(.22,1,.36,1),box-shadow .5s linear"}}>
                  <div style={{display: "flex", flexWrap: "wrap", alignItems: "flex-start", justifyContent: "space-between", gap: "12px"}}>
                    <div>
                      <h2 style={{margin: "0", fontSize: "19px", fontWeight: "500", letterSpacing: "-.01em"}}>Results preview</h2>
                      <p style={{margin: "4px 0 0", fontSize: "13.5px", color: "#5A5F5C"}}>This is how imported sites will appear once enrichment runs.</p>
                    </div>
                    <div style={{display: "flex", flexWrap: "wrap", alignItems: "center", gap: "16px"}}>
                      <span style={{display: "flex", alignItems: "baseline", gap: "7px"}}>
                        <span style={{fontSize: "26px", fontWeight: "700", letterSpacing: "-.03em", backgroundImage: "radial-gradient(circle at 50% 50%,#1C1C1C 1.45px,transparent 1.55px)", backgroundSize: "3.2px 3.2px", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent", WebkitTextFillColor: "transparent", animation: "lsPop .7s cubic-bezier(.22,1,.36,1) both"}}>{V.importAdded}</span>
                        <span style={{fontSize: "12px", color: "#5A5F5C"}}>sites</span>
                      </span>
                      <span style={{fontSize: "12.5px", color: "#5A5F5C"}}>{V.importTally}</span>
                    </div>
                  </div>
                  <div style={{marginTop: "18px", padding: "0 0 11px", borderBottom: "1px solid #DEDFDC", display: "grid", gridTemplateColumns: "minmax(0,1.4fr) minmax(0,1.2fr) minmax(0,1fr) 88px", gap: "12px"}}>
                    <span style={{fontSize: "10px", fontWeight: "500", letterSpacing: ".15em", textTransform: "uppercase", color: "#555956", whiteSpace: "nowrap"}}>Website</span>
                    <span style={{fontSize: "10px", fontWeight: "500", letterSpacing: ".15em", textTransform: "uppercase", color: "#555956", whiteSpace: "nowrap"}}>Business</span>
                    <span style={{fontSize: "10px", fontWeight: "500", letterSpacing: ".15em", textTransform: "uppercase", color: "#555956", whiteSpace: "nowrap"}}>Contact</span>
                    <span style={{fontSize: "10px", fontWeight: "500", letterSpacing: ".15em", textTransform: "uppercase", color: "#555956", whiteSpace: "nowrap"}}>Status</span>
                  </div>
                  <ul style={{listStyle: "none", margin: "0", padding: "0", display: "flex", flexDirection: "column"}}>
                    {(V.importRows ?? []).map((r, __ir) => (
                      <Fragment key={__ir}>
                        <li style={{display: "grid", gridTemplateColumns: "minmax(0,1.4fr) minmax(0,1.2fr) minmax(0,1fr) 88px", alignItems: "center", gap: "12px", padding: "14px 0", borderTop: "1px solid #E7E8E5"}}>
                          <span style={{height: "11px", width: "72%", borderRadius: "6px", background: "#E4E5E2"}}>
                            <span style={{display: "block", fontSize: "13.5px", color: "#1C1C1C", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis"}}>{r.domain}</span>
                          </span>
                          <span style={{height: "11px", width: "58%", borderRadius: "6px", background: "#E9EAE7"}}>
                            <span style={{display: "block", fontSize: "13.5px", color: "#1C1C1C", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis"}}>{r.detail}</span>
                          </span>
                          <span style={{height: "11px", width: "64%", borderRadius: "6px", background: "#E9EAE7"}}>
                            <span style={{display: "block", fontSize: "13.5px", color: "#4A4F4B", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis"}}>{r.contact}</span>
                          </span>
                          <span style={{height: "22px", borderRadius: "999px", background: "#EDEEEB"}}>
                            <span style={{display: "block", padding: "5px 10px", borderRadius: "999px", background: "#C8D5BB", color: "#1C1C1C", fontSize: "11.5px", textAlign: "center", whiteSpace: "nowrap"}}>{r.status}</span>
                          </span>
                        </li>
                      </Fragment>
                    ))}
                  </ul>
                  {shows(V.importEmptyOn) ? (
                    <>
                    <div style={{display: "flex", flexDirection: "column", alignItems: "center", gap: "12px", padding: "26px 0 6px", textAlign: "center"}}>
                      <p style={{margin: "0", maxWidth: "40ch", fontSize: "14px", lineHeight: "1.6", color: "#5A5F5C", textWrap: "pretty"}}>{V.importEmpty}</p>
                      <button type="button" onClick={V.openImp} data-more="1" style={{display: "inline-flex", alignItems: "center", gap: "9px", height: "42px", padding: "0 20px", border: "0", borderRadius: "999px", background: "#EAEAE8", color: "#1C1C1C", fontFamily: "inherit", fontSize: "13px", fontWeight: "500", cursor: "pointer"}}>
                        Import websites{' '}
                        <span aria-hidden="true">↑</span>
                      </button>
                    </div>
                    </>
                  ) : null}
                </section>
              </div>
              </>
            ) : null}
            {shows(V.isLeads) ? (
              <>
              <div style={{display: "flex", flexDirection: "column", gap: "clamp(12px,1.5vw,20px)"}}>
                <div style={{display: "flex", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: "16px"}}>
                  <div>
                    <div style={{display: "flex", alignItems: "center", gap: "12px"}}>
                      <h1 style={{margin: "0", fontSize: "clamp(26px,2.6vw,36px)", lineHeight: "1.1", letterSpacing: "-.03em", fontWeight: "400"}}>All Leads</h1>
                      <span style={{display: "inline-flex", alignItems: "center", gap: "7px", padding: "6px 13px", borderRadius: "999px", background: "#C8D5BB", fontSize: "10.5px", fontWeight: "500", letterSpacing: ".14em"}}>
                        <span aria-hidden="true" style={{width: "6px", height: "6px", borderRadius: "999px", background: "#1C1C1C"}}></span>
                        128 SAVED{' '}
                      </span>
                    </div>
                    <p style={{margin: "8px 0 0", maxWidth: "74ch", fontSize: "14.5px", color: "#5A5F5C", textWrap: "pretty"}}>Every place any run has ever captured lands here and stays. Runs only add — nothing is overwritten, nothing expires.</p>
                  </div>
                  <div style={{display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px"}}>
                    <button type="button" onClick={V.openExpAll} data-ghost="1" style={{display: "inline-flex", alignItems: "center", gap: "9px", height: "44px", padding: "0 20px", border: "0", borderRadius: "999px", background: "#E5E5E5", color: "#1C1C1C", fontFamily: "inherit", fontSize: "13.5px", fontWeight: "500", cursor: "pointer", transition: "background .25s linear"}}>
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M12 4v10"></path>
                        <path d="M8 10.5l4 4 4-4"></path>
                        <path d="M4.5 18.5h15"></path>
                      </svg>
                      {' '}Export all{' '}
                    </button>
                    <button data-action="Save to list" data-goto="lists" type="button" data-run="1" style={{display: "inline-flex", alignItems: "center", gap: "9px", height: "44px", padding: "0 22px", border: "0", borderRadius: "999px", background: "#1C1C1C", color: "#F0F0F0", fontFamily: "inherit", fontSize: "13.5px", fontWeight: "500", cursor: "pointer", transition: "transform .3s cubic-bezier(.22,1,.36,1)"}}>
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M6.5 3.5h11v17l-5.5-3.6-5.5 3.6z"></path>
                      </svg>
                      {' '}Save to list{' '}
                    </button>
                  </div>
                </div>
                <section data-card="1" style={{padding: "24px", borderRadius: "22px", background: "#1C1C1C", color: "#F0F0F0", transition: "transform .5s cubic-bezier(.22,1,.36,1),box-shadow .5s linear"}}>
                  <div style={{display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,232px),1fr))", gap: "clamp(18px,3vw,40px)", alignItems: "start"}}>
                    <div>
                      <div style={{fontSize: "10.5px", fontWeight: "500", letterSpacing: ".16em", textTransform: "uppercase", color: "#8E948F"}}>Permanent store</div>
                      <div style={{display: "flex", alignItems: "flex-start", gap: "10px", marginTop: "14px"}}>
                        <span style={{fontSize: "clamp(44px,4.6vw,62px)", lineHeight: ".9", fontWeight: "700", letterSpacing: "-.04em", backgroundImage: "radial-gradient(circle at 50% 50%,#F0F0F0 1.45px,transparent 1.55px)", backgroundSize: "3.2px 3.2px", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent", WebkitTextFillColor: "transparent", animation: "lsPop .7s cubic-bezier(.22,1,.36,1) both"}}>{V.storeCount}</span>
                        <span style={{marginTop: "9px", fontSize: "14px", color: "#9BA29C"}}>
                          leads
                          <br />
                          on file
                        </span>
                      </div>
                      <p style={{margin: "14px 0 0", fontSize: "12.5px", lineHeight: "1.55", color: "#9BA29C", textWrap: "pretty"}}>{V.storeWhere}</p>
                    </div>
                    <div>
                      <div style={{fontSize: "10.5px", fontWeight: "500", letterSpacing: ".16em", textTransform: "uppercase", color: "#8E948F"}}>Where they came from</div>
                      <div style={{display: "flex", gap: "3px", marginTop: "16px"}}>
                        <span style={{flex: V.storeSources[0].flex, height: "14px", borderRadius: "7px 3px 3px 7px", background: "#C8D5BB"}}></span>
                        <span style={{flex: V.storeSources[1].flex, height: "14px", borderRadius: "3px", background: "#8FA382"}}></span>
                        <span style={{flex: V.storeSources[2].flex, height: "14px", borderRadius: "3px 7px 7px 3px", background: "#4C5548"}}></span>
                      </div>
                      <ul style={{listStyle: "none", margin: "14px 0 0", padding: "0", display: "flex", flexDirection: "column", gap: "9px"}}>
                        <li style={{display: "flex", alignItems: "center", gap: "10px", fontSize: "13px"}}>
                          <span aria-hidden="true" style={{width: "9px", height: "9px", borderRadius: "3px", background: "#C8D5BB"}}></span>
                          <span style={{flex: "1", color: "#DADCD7"}}>Google Maps scraper</span>
                          <strong style={{fontWeight: "500"}}>{V.storeSources[0].count}</strong>
                        </li>
                        <li style={{display: "flex", alignItems: "center", gap: "10px", fontSize: "13px"}}>
                          <span aria-hidden="true" style={{width: "9px", height: "9px", borderRadius: "3px", background: "#8FA382"}}></span>
                          <span style={{flex: "1", color: "#DADCD7"}}>Website import</span>
                          <strong style={{fontWeight: "500"}}>{V.storeSources[1].count}</strong>
                        </li>
                        <li style={{display: "flex", alignItems: "center", gap: "10px", fontSize: "13px"}}>
                          <span aria-hidden="true" style={{width: "9px", height: "9px", borderRadius: "3px", background: "#4C5548"}}></span>
                          <span style={{flex: "1", color: "#DADCD7"}}>Manual entry</span>
                          <strong style={{fontWeight: "500"}}>{V.storeSources[2].count}</strong>
                        </li>
                      </ul>
                    </div>
                    <div>
                      <div style={{fontSize: "10.5px", fontWeight: "500", letterSpacing: ".16em", textTransform: "uppercase", color: "#8E948F"}}>What is on file</div>
                      <div style={{display: "flex", flexDirection: "column", gap: "9px", marginTop: "16px"}}>
                        <div style={{display: "flex", alignItems: "center", gap: "12px", padding: "12px 15px", borderRadius: "14px", background: "#252625"}}>
                          <span style={{flex: "1", fontSize: "13.5px"}}>Phone numbers</span>
                          <span style={{fontSize: "15px", fontWeight: "500"}}>{V.storeOnFile[0].count}</span>
                          <span style={{fontSize: "11.5px", color: "#9BA29C"}}>{V.storeOnFile[0].pct}</span>
                        </div>
                        <div style={{display: "flex", alignItems: "center", gap: "12px", padding: "12px 15px", borderRadius: "14px", background: "#252625"}}>
                          <span style={{flex: "1", fontSize: "13.5px"}}>Email addresses</span>
                          <span style={{fontSize: "15px", fontWeight: "500"}}>{V.storeOnFile[1].count}</span>
                          <span style={{fontSize: "11.5px", color: "#9BA29C"}}>{V.storeOnFile[1].pct}</span>
                        </div>
                        <div style={{display: "flex", alignItems: "center", gap: "12px", padding: "12px 15px", borderRadius: "14px", background: "#252625"}}>
                          <span style={{flex: "1", fontSize: "13.5px"}}>Social profiles</span>
                          <span style={{fontSize: "15px", fontWeight: "500"}}>{V.storeOnFile[2].count}</span>
                          <span style={{fontSize: "11.5px", color: "#9BA29C"}}>{V.storeOnFile[2].pct}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </section>
                <section data-card="1" style={{padding: "22px 24px", borderRadius: "22px", background: "#F5F5F4", transition: "transform .5s cubic-bezier(.22,1,.36,1),box-shadow .5s linear"}}>
                  <div style={{display: "flex", flexWrap: "wrap", alignItems: "center", gap: "12px"}}>
                    <div>
                      <h2 style={{margin: "0", fontSize: "19px", fontWeight: "500", letterSpacing: "-.01em"}}>Lead ledger</h2>
                      <p style={{margin: "4px 0 0", fontSize: "13.5px", color: "#5A5F5C"}}>Newest capture first, grouped by the day it was saved.</p>
                    </div>
                    <div style={{display: "flex", alignItems: "center", gap: "10px", flex: "1", minWidth: "190px", height: "42px", padding: "0 16px", marginLeft: "auto", borderRadius: "999px", background: "#EAEAE8"}}>
                      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="#3A3D3B" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true" style={{flex: "none"}}>
                        <circle cx="11" cy="11" r="6.5"></circle>
                        <path d="M16 16l4.5 4.5"></path>
                      </svg>
                      <input type="search" placeholder={V.leadSearchPlaceholder} aria-label="Search leads" style={{flex: "1", minWidth: "0", height: "100%", border: "0", background: "transparent", fontSize: "13.5px", color: "#1C1C1C", outline: "none"}} data-leadsearch="1" value={V.leadQuery} onInput={V.onLeadInput} />
                    </div>
                  </div>
                  <div style={{display: "flex", flexWrap: "wrap", gap: "8px", marginTop: "16px"}}>
                    {(V.leadChips ?? []).map((lc, __ilc) => (
                      <Fragment key={__ilc}>
                        <button type="button" onClick={lc.pick} data-chip="1" data-on={lc.on} style={{display: "inline-flex", alignItems: "center", gap: "8px", padding: "10px 15px", border: "0", borderRadius: "999px", fontFamily: "inherit", fontSize: "13px", fontWeight: "500", cursor: "pointer"}}>
                          {lc.label}
                          <span style={{fontSize: "11.5px", opacity: ".7"}}>{lc.count}</span>
                        </button>
                      </Fragment>
                    ))}
                  </div>
                  <div style={{marginTop: "6px", overflowX: "auto"}}>
                    <div style={{minWidth: "660px"}}>
                      <div style={{display: "grid", gridTemplateColumns: "44px minmax(0,2fr) minmax(0,1.45fr) 104px 66px 88px", alignItems: "center", gap: "12px", padding: "14px 0 11px", borderBottom: "1px solid #DEDFDC"}}>
                        <span></span>
                        <span style={{fontSize: "10.5px", fontWeight: "500", letterSpacing: ".16em", textTransform: "uppercase", color: "#555956"}}>Business</span>
                        <span style={{fontSize: "10.5px", fontWeight: "500", letterSpacing: ".16em", textTransform: "uppercase", color: "#555956"}}>On file</span>
                        <span style={{fontSize: "10.5px", fontWeight: "500", letterSpacing: ".16em", textTransform: "uppercase", color: "#555956"}}>Source</span>
                        <span style={{fontSize: "10.5px", fontWeight: "500", letterSpacing: ".16em", textTransform: "uppercase", color: "#555956", textAlign: "center"}}>Score</span>
                        <span style={{fontSize: "10.5px", fontWeight: "500", letterSpacing: ".16em", textTransform: "uppercase", color: "#555956", textAlign: "right"}}>Saved</span>
                      </div>
                      <ul style={{listStyle: "none", margin: "0", padding: "0"}}>
                        {shows(V.leadsState) ? (
                          <>
                          <li style={{padding: "26px 0", borderTop: "1px solid #E4E5E2", color: "#5A5F5C", fontSize: "13.5px"}}>{V.leadsState}</li>
                          </>
                        ) : null}
                        {(V.leadDays ?? []).map((day, __iday) => (
                          <Fragment key={__iday}>
                            <li style={{display: "flex", alignItems: "center", gap: "14px", padding: "20px 0 8px"}}>
                              <span style={{fontSize: "10.5px", fontWeight: "500", letterSpacing: ".16em", textTransform: "uppercase", color: "#555956"}}>{day.label}</span>
                              <span aria-hidden="true" style={{flex: "1", height: "1px", background: "#E4E5E2"}}></span>
                              <span style={{fontSize: "12px", color: "#5A5F5C"}}>{day.count}</span>
                            </li>
                            {(day.rows ?? []).map((lc, __ilc) => (
                              <Fragment key={__ilc}>
                                <li data-row="1" style={{display: "grid", gridTemplateColumns: "44px minmax(0,2fr) minmax(0,1.45fr) 104px 66px 88px", alignItems: "center", gap: "12px", padding: "14px 0", borderTop: "1px solid #E4E5E2", transition: "background .25s linear"}}>
                                  <span aria-hidden="true" style={{display: "grid", placeItems: "center", width: "40px", height: "40px", borderRadius: "12px", background: "#C8D5BB", fontSize: "13px", fontWeight: "700"}}>{lc.ini}</span>
                                  <span style={{minWidth: "0"}}>
                                    <span style={{display: "block", fontSize: "14.5px", fontWeight: "500", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis"}}>{lc.name}</span>
                                    <span style={{display: "block", marginTop: "3px", fontSize: "12.5px", color: "#5A5F5C", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis"}}>{lc.domain}</span>
                                  </span>
                                  <span style={{display: "flex", gap: "5px"}}>
                                    {shows(lc.hp) ? (
                                      <>
                                      <span title="Phone on file" aria-label="Phone on file" style={{display: "grid", placeItems: "center", width: "23px", height: "23px", borderRadius: "7px", background: "#C8D5BB", color: "#1C1C1C", fontSize: "10px", fontWeight: "700"}}>P</span>
                                      </>
                                    ) : null}
                                    {shows(lc.he) ? (
                                      <>
                                      <span title="Email on file" aria-label="Email on file" style={{display: "grid", placeItems: "center", width: "23px", height: "23px", borderRadius: "7px", background: "#C8D5BB", color: "#1C1C1C", fontSize: "10px", fontWeight: "700"}}>E</span>
                                      </>
                                    ) : null}
                                    {shows(lc.hs) ? (
                                      <>
                                      <span title="Socials on file" aria-label="Socials on file" style={{display: "grid", placeItems: "center", width: "23px", height: "23px", borderRadius: "7px", background: "#C8D5BB", color: "#1C1C1C", fontSize: "10px", fontWeight: "700"}}>S</span>
                                      </>
                                    ) : null}
                                  </span>
                                  <span>{lc.source}</span>
                                  <span style={{padding: "5px 10px", borderRadius: "999px", background: "#1C1C1C", color: "#F0F0F0", fontSize: "11.5px", fontWeight: "500", textAlign: "center"}}>{lc.score}</span>
                                  <span style={{fontSize: "12.5px", color: "#5A5F5C", textAlign: "right", fontVariantNumeric: "tabular-nums"}}>{lc.saved}</span>
                                </li>
                              </Fragment>
                            ))}
                          </Fragment>
                        ))}
                      </ul>
                    </div>
                  </div>
                  <div style={{display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "12px", marginTop: "18px", paddingTop: "16px", borderTop: "1px solid #E4E5E2"}}>
                    <span style={{fontSize: "12.5px", color: "#5A5F5C"}}>Showing {V.leadsShowing} of {V.leadsOnFileTotal} {V.leadsResultLabel}</span>
                    {shows(V.leadsMoreOn) ? (
                      <>
                      <button type="button" data-more="1" style={{display: "inline-flex", alignItems: "center", gap: "9px", height: "40px", padding: "0 18px", border: "0", borderRadius: "999px", background: "#EAEAE8", color: "#1C1C1C", fontFamily: "inherit", fontSize: "13px", fontWeight: "500", cursor: "pointer", transition: "background .25s linear"}} onClick={V.showMoreLeads}>
                        Load 20 more{' '}
                        <span aria-hidden="true">↓</span>
                      </button>
                      </>
                    ) : null}
                  </div>
                </section>
              </div>
              </>
            ) : null}
            {shows(V.isLists) ? (
              <>
              <div style={{display: "flex", flexDirection: "column", gap: "clamp(12px,1.5vw,20px)"}}>
                <div style={{display: "flex", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: "16px"}}>
                  <div>
                    <div style={{display: "flex", alignItems: "center", gap: "12px"}}>
                      <h1 style={{margin: "0", fontSize: "clamp(26px,2.6vw,36px)", lineHeight: "1.1", letterSpacing: "-.03em", fontWeight: "400"}}>Saved Lists</h1>
                      <span style={{display: "inline-flex", alignItems: "center", gap: "7px", padding: "6px 13px", borderRadius: "999px", background: "#C8D5BB", fontSize: "10.5px", fontWeight: "500", letterSpacing: ".14em"}}>
                        <span aria-hidden="true" style={{width: "6px", height: "6px", borderRadius: "999px", background: "#1C1C1C"}}></span>
                        {V.keptBadge}{' '}
                      </span>
                    </div>
                    <p style={{margin: "8px 0 0", maxWidth: "74ch", fontSize: "14.5px", color: "#5A5F5C", textWrap: "pretty"}}>A run brings back everything it finds. Read through them here, bookmark the ones actually worth calling, and save just those into a list.</p>
                  </div>
                  <div style={{display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px"}}>
                    <button type="button" data-ghost="1" onClick={V.openExpView} style={{display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "9px", height: "44px", padding: "0 20px", border: "0", borderRadius: "999px", background: "#E5E5E5", color: "#1C1C1C", fontFamily: "inherit", fontSize: "13.5px", fontWeight: "500", cursor: "pointer", transition: "background .25s linear"}}>Export selection</button>
                    <button type="button" onClick={V.saveToList} data-run="1" style={{display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "9px", height: "44px", padding: "0 22px", border: "0", borderRadius: "999px", background: "#1C1C1C", color: "#F0F0F0", fontFamily: "inherit", fontSize: "13.5px", fontWeight: "500", cursor: "pointer", transition: "transform .3s cubic-bezier(.22,1,.36,1)"}}>
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M6.5 3.5h11v17l-5.5-3.6-5.5 3.6z"></path>
                      </svg>
                      {' '}{V.saveLabel}{' '}
                    </button>
                  </div>
                </div>
                <section data-card="1" style={{padding: "22px 24px", borderRadius: "22px", background: "#F5F5F4", transition: "transform .5s cubic-bezier(.22,1,.36,1),box-shadow .5s linear"}}>
                  <div style={{display: "flex", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: "12px"}}>
                    <div>
                      <div style={{fontSize: "10.5px", fontWeight: "500", letterSpacing: ".16em", textTransform: "uppercase", color: "#555956"}}>Straight from the last run</div>
                      <h2 style={{margin: "10px 0 0", fontSize: "19px", fontWeight: "500", letterSpacing: "-.01em"}}>{V.pickCount} to sort through</h2>
                      <p style={{margin: "4px 0 0", fontSize: "13.5px", color: "#5A5F5C"}}>{V.lastRunLine}</p>
                    </div>
                    <div style={{display: "flex", flexWrap: "wrap", gap: "8px"}}>
                      <button type="button" data-ghost="1" onClick={V.keepGood} style={{display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "9px", height: "40px", padding: "0 20px", border: "0", borderRadius: "999px", background: "#E5E5E5", color: "#1C1C1C", fontFamily: "inherit", fontSize: "13px", fontWeight: "500", cursor: "pointer", transition: "background .25s linear"}}>Bookmark 90+</button>
                      <button type="button" data-ghost="1" onClick={V.keepNone} style={{display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "9px", height: "40px", padding: "0 20px", border: "0", borderRadius: "999px", background: "transparent", color: "#4A4F4B", fontFamily: "inherit", fontSize: "13px", fontWeight: "500", cursor: "pointer", transition: "background .25s linear"}}>Clear</button>
                    </div>
                  </div>
                  <div style={{display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,258px),1fr))", gap: "12px", marginTop: "18px"}}>
                    {(V.picks ?? []).map((p, __ip) => (
                      <Fragment key={__ip}>
                        <div data-keep="1" data-on={p.on} style={{display: "flex", flexDirection: "column", gap: "11px", padding: "17px", borderRadius: "20px"}}>
                          <div style={{display: "flex", alignItems: "flex-start", gap: "10px"}}>
                            <span aria-hidden="true" style={{display: "grid", placeItems: "center", width: "38px", height: "38px", borderRadius: "12px", background: "#DDE3D6", fontSize: "12px", fontWeight: "700", flex: "none"}}>{p.ini}</span>
                            <span style={{flex: "1", minWidth: "0"}}>
                              <span style={{display: "block", fontSize: "14.5px", fontWeight: "500", lineHeight: "1.3", textWrap: "balance"}}>{p.name}</span>
                              <span style={{display: "block", marginTop: "3px", fontSize: "12.5px", color: "#5A5F5C", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis"}}>{p.domain}</span>
                            </span>
                            <button type="button" onClick={p.toggle} data-bm="1" aria-label="Bookmark this lead" style={{display: "grid", placeItems: "center", width: "34px", height: "34px", border: "0", borderRadius: "999px", fontFamily: "inherit", cursor: "pointer", flex: "none", transition: "background .25s linear,color .25s linear"}}>
                              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <path d="M6.5 3.5h11v17l-5.5-3.6-5.5 3.6z"></path>
                              </svg>
                            </button>
                          </div>
                          <div style={{display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px"}}>
                            <span data-sc={p.band} style={{padding: "5px 10px", borderRadius: "999px", fontSize: "11.5px", fontWeight: "500"}}>{p.score}</span>
                            <span style={{fontSize: "12.5px", color: "#4A4F4B"}}>{p.rating}</span>
                            <span style={{fontSize: "12.5px", color: "#5A5F5C", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis"}}>{p.area}</span>
                          </div>
                          <div style={{display: "flex", alignItems: "center", gap: "5px"}}>
                            <span data-has={p.hp} title="Phone on file" style={{display: "grid", placeItems: "center", width: "23px", height: "23px", borderRadius: "7px", fontSize: "10px", fontWeight: "700"}}>P</span>
                            <span data-has={p.he} title="Email on file" style={{display: "grid", placeItems: "center", width: "23px", height: "23px", borderRadius: "7px", fontSize: "10px", fontWeight: "700"}}>E</span>
                            <span data-has={p.hs} title="Socials on file" style={{display: "grid", placeItems: "center", width: "23px", height: "23px", borderRadius: "7px", fontSize: "10px", fontWeight: "700"}}>S</span>
                            <span style={{marginLeft: "auto", fontSize: "12px", color: "#5A5F5C"}}>{p.note}</span>
                          </div>
                        </div>
                      </Fragment>
                    ))}
                  </div>
                </section>
                <section data-card="1" style={{padding: "18px 20px", borderRadius: "22px", background: "#1C1C1C", color: "#F0F0F0"}}>
                  <div style={{display: "flex", flexWrap: "wrap", alignItems: "center", gap: "clamp(14px,2.4vw,28px)"}}>
                    <div style={{display: "flex", alignItems: "flex-start", gap: "10px"}}>
                      <span style={{fontSize: "clamp(32px,3.2vw,42px)", lineHeight: ".9", fontWeight: "700", letterSpacing: "-.04em", backgroundImage: "radial-gradient(circle at 50% 50%,#F0F0F0 1.45px,transparent 1.55px)", backgroundSize: "3.2px 3.2px", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent", WebkitTextFillColor: "transparent", animation: "lsPop .7s cubic-bezier(.22,1,.36,1) both"}}>{V.keptCount}</span>
                      <span style={{marginTop: "5px", fontSize: "13px", color: "#9BA29C"}}>{V.pickTotalLabel}</span>
                    </div>
                    <span aria-hidden="true" style={{width: "1px", alignSelf: "stretch", background: "#3A3B3A"}}></span>
                    <div style={{flex: "1", minWidth: "240px"}}>
                      <div style={{fontSize: "10.5px", fontWeight: "500", letterSpacing: ".16em", textTransform: "uppercase", color: "#8E948F"}}>Save into</div>
                      <div style={{display: "flex", flexWrap: "wrap", gap: "7px", marginTop: "10px"}}>
                        {(V.listTargets ?? []).map((t, __it) => (
                          <Fragment key={__it}>
                            <button type="button" onClick={t.pick} data-pick="1" data-on={t.on} style={{display: "inline-flex", alignItems: "center", gap: "8px", padding: "9px 15px", border: "0", borderRadius: "999px", fontFamily: "inherit", fontSize: "13px", cursor: "pointer", transition: "background .25s linear,color .25s linear"}}>
                              {t.label}
                              <span style={{fontSize: "11px", opacity: ".7"}}>{t.count}</span>
                            </button>
                          </Fragment>
                        ))}
                      </div>
                    </div>
                    <button type="button" onClick={V.saveToList} data-cta="1" style={{display: "inline-flex", alignItems: "center", gap: "9px", height: "46px", padding: "0 22px", border: "0", borderRadius: "999px", background: "#C8D5BB", color: "#1C1C1C", fontFamily: "inherit", fontSize: "13.5px", fontWeight: "500", cursor: "pointer", transition: "transform .3s cubic-bezier(.22,1,.36,1)"}}>
                      {V.saveLabel}{' '}
                      <span aria-hidden="true">→</span>
                    </button>
                  </div>
                  <p style={{margin: "12px 0 0", fontSize: "12px", color: "#9BA29C", textWrap: "pretty"}}>The other {V.droppedCount} stay in All Leads — saving to a list never deletes anything.</p>
                </section>
                <div style={{display: "flex", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: "12px", marginTop: "6px"}}>
                  <div>
                    <h2 style={{margin: "0", fontSize: "19px", fontWeight: "500", letterSpacing: "-.01em"}}>Your lists</h2>
                    <p style={{margin: "4px 0 0", fontSize: "13.5px", color: "#5A5F5C"}}>A lead can sit in as many lists as you like.</p>
                  </div>
                  <span style={{padding: "7px 14px", borderRadius: "999px", background: "#EAEAE8", fontSize: "12px", fontWeight: "500"}}>{V.listTotals}</span>
                </div>
                <div style={{display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,252px),1fr))", gap: "clamp(12px,1.4vw,20px)", alignItems: "stretch"}}>
                  {(V.savedLists ?? []).map((l, __il) => (
                    <Fragment key={__il}>
                      <section data-card="1" style={{display: "flex", flexDirection: "column", padding: "22px 24px", borderRadius: "22px", background: "#F5F5F4", transition: "transform .5s cubic-bezier(.22,1,.36,1),box-shadow .5s linear"}}>
                        <div style={{display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "10px"}}>
                          <h3 style={{margin: "0", fontSize: "16.5px", fontWeight: "500", letterSpacing: "-.01em", textWrap: "balance"}}>{l.name}</h3>
                          <span style={{padding: "5px 11px", borderRadius: "999px", background: "#EAEAE8", fontSize: "11.5px", fontWeight: "500", whiteSpace: "nowrap"}}>{l.members}</span>
                        </div>
                        <p style={{margin: "8px 0 0", fontSize: "13px", lineHeight: "1.5", color: "#5A5F5C", textWrap: "pretty"}}>{l.note}</p>
                        <div style={{display: "flex", alignItems: "center", margin: "16px 0 0", paddingLeft: "9px"}}>
                          <span aria-hidden="true" style={{display: "grid", placeItems: "center", width: "30px", height: "30px", marginLeft: "-9px", borderRadius: "999px", background: "#C8D5BB", border: "2px solid #F5F5F4", fontSize: "10px", fontWeight: "700"}}>
                            {(l.avatars ?? []).map((a, __ia) => (
                              <Fragment key={__ia}>
                                <span aria-hidden="true" style={{display: "grid", placeItems: "center", width: "30px", height: "30px", marginLeft: "-9px", borderRadius: "999px", background: "#DDE3D6", border: "2px solid #F5F5F4", fontSize: "10px", fontWeight: "700"}}>{a.ini}</span>
                              </Fragment>
                            ))}
                          </span>
                          <span aria-hidden="true" style={{display: "grid", placeItems: "center", width: "30px", height: "30px", marginLeft: "-9px", borderRadius: "999px", background: "#DDE3D6", border: "2px solid #F5F5F4", fontSize: "10px", fontWeight: "700"}}>NS</span>
                          <span aria-hidden="true" style={{display: "grid", placeItems: "center", width: "30px", height: "30px", marginLeft: "-9px", borderRadius: "999px", background: "#E3E4E1", border: "2px solid #F5F5F4", fontSize: "10px", fontWeight: "700"}}>AT</span>
                        </div>
                        <div style={{display: "flex", gap: "4px", marginTop: "auto", paddingTop: "16px"}}>
                          <span style={{flex: "1", height: "8px", borderRadius: "4px", background: "#8FA382"}}></span>
                          <span style={{flex: "1", height: "8px", borderRadius: "4px", background: "#8FA382"}}></span>
                          <span style={{flex: "1", height: "8px", borderRadius: "4px", background: "#8FA382"}}></span>
                          <span style={{flex: "1", height: "8px", borderRadius: "4px", background: "#8FA382"}}></span>
                          <span style={{flex: "1", height: "8px", borderRadius: "4px", background: "#8FA382"}}></span>
                          <span style={{flex: "1", height: "8px", borderRadius: "4px", background: "#8FA382"}}></span>
                        </div>
                        <div style={{display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", marginTop: "11px"}}>
                          <span style={{fontSize: "12px", color: "#5A5F5C"}}>{l.updated}</span>
                          <span aria-hidden="true" style={{fontSize: "13px", color: "#4A4F4B"}}>→</span>
                        </div>
                      </section>
                    </Fragment>
                  ))}
                </div>
              </div>
              </>
            ) : null}
            {shows(V.isRuns) ? (
              <>
              <div style={{display: "flex", flexDirection: "column", gap: "clamp(12px,1.5vw,20px)"}}>
                <div style={{display: "flex", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: "16px"}}>
                  <div>
                    <div style={{display: "flex", alignItems: "center", gap: "12px"}}>
                      <h1 style={{margin: "0", fontSize: "clamp(26px,2.6vw,36px)", lineHeight: "1.1", letterSpacing: "-.03em", fontWeight: "400"}}>Run History</h1>
                      <span style={{display: "inline-flex", alignItems: "center", gap: "7px", padding: "6px 13px", borderRadius: "999px", background: "#C8D5BB", fontSize: "10.5px", fontWeight: "500", letterSpacing: ".14em"}}>{V.runBadge}</span>
                    </div>
                    <p style={{margin: "8px 0 0", maxWidth: "74ch", fontSize: "14.5px", color: "#5A5F5C", textWrap: "pretty"}}>Every scrape, import and enrichment pass this machine has run, with what it captured and what it cost.</p>
                  </div>
                  <button type="button" onClick={V.openExpRuns} data-ghost="1" style={{display: "inline-flex", alignItems: "center", gap: "9px", height: "44px", padding: "0 20px", border: "0", borderRadius: "999px", background: "#E5E5E5", color: "#1C1C1C", fontFamily: "inherit", fontSize: "13.5px", fontWeight: "500", cursor: "pointer", transition: "background .25s linear"}}>
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M12 4v10"></path>
                      <path d="M8 10.5l4 4 4-4"></path>
                      <path d="M4.5 18.5h15"></path>
                    </svg>
                    {' '}Export log{' '}
                  </button>
                </div>
                <div style={{display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,196px),1fr))", gap: "clamp(12px,1.4vw,20px)", alignItems: "end"}}>
                  <div style={{display: "flex", flexDirection: "column", gap: "8px"}}>
                    <div style={{display: "flex", alignItems: "flex-start", gap: "10px"}}>
                      <span style={{fontSize: "clamp(40px,4vw,54px)", lineHeight: ".9", fontWeight: "700", letterSpacing: "-.04em", backgroundImage: "radial-gradient(circle at 50% 50%,#1C1C1C 1.45px,transparent 1.55px)", backgroundSize: "3.2px 3.2px", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent", WebkitTextFillColor: "transparent", animation: "lsPop .7s cubic-bezier(.22,1,.36,1) both"}}>{V.runCount}</span>
                      <span style={{marginLeft: "auto", padding: "5px 11px", borderRadius: "999px", background: "#F5F5F4", fontSize: "11.5px", fontWeight: "500"}}>{V.runCountBadge}</span>
                    </div>
                    <div style={{fontSize: "13.5px", color: "#4A4F4B"}}>Runs completed</div>
                    <div style={{display: "flex", gap: "4px"}}>
                      <span style={{flex: "1", height: "8px", borderRadius: "4px", background: "#8FA382"}}></span>
                      <span style={{flex: "1", height: "8px", borderRadius: "4px", background: "#8FA382"}}></span>
                      <span style={{flex: "1", height: "8px", borderRadius: "4px", background: "#8FA382"}}></span>
                      <span style={{flex: "1", height: "8px", borderRadius: "4px", background: "#8FA382"}}></span>
                      <span style={{flex: "1", height: "8px", borderRadius: "4px", background: "#8FA382"}}></span>
                      <span style={{flex: "1", height: "8px", borderRadius: "4px", background: "#8FA382"}}></span>
                    </div>
                  </div>
                  <div style={{display: "flex", flexDirection: "column", gap: "8px"}}>
                    <div style={{display: "flex", alignItems: "flex-start", gap: "10px"}}>
                      <span style={{fontSize: "clamp(40px,4vw,54px)", lineHeight: ".9", fontWeight: "700", letterSpacing: "-.04em", backgroundImage: "radial-gradient(circle at 50% 50%,#1C1C1C 1.45px,transparent 1.55px)", backgroundSize: "3.2px 3.2px", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent", WebkitTextFillColor: "transparent", animation: "lsPop .7s cubic-bezier(.22,1,.36,1) both"}}>{V.runPlaces}</span>
                      <span style={{marginLeft: "auto", padding: "5px 11px", borderRadius: "999px", background: "#F5F5F4", fontSize: "11.5px", fontWeight: "500"}}>{V.runPlacesBadge}</span>
                    </div>
                    <div style={{fontSize: "13.5px", color: "#4A4F4B"}}>Places captured</div>
                    <div style={{display: "flex", gap: "4px"}}>
                      <span style={{flex: "1", height: "8px", borderRadius: "4px", background: "#8FA382"}}></span>
                      <span style={{flex: "1", height: "8px", borderRadius: "4px", background: "#8FA382"}}></span>
                      <span style={{flex: "1", height: "8px", borderRadius: "4px", background: "#8FA382"}}></span>
                      <span style={{flex: "1", height: "8px", borderRadius: "4px", background: "#8FA382"}}></span>
                      <span style={{flex: "1", height: "8px", borderRadius: "4px", background: "#8FA382"}}></span>
                      <span style={{flex: "1", height: "8px", borderRadius: "4px", background: "#E2E5DE"}}></span>
                    </div>
                  </div>
                  <div style={{display: "flex", flexDirection: "column", gap: "8px"}}>
                    <div style={{display: "flex", alignItems: "flex-start", gap: "10px"}}>
                      <span style={{fontSize: "clamp(40px,4vw,54px)", lineHeight: ".9", fontWeight: "700", letterSpacing: "-.04em", backgroundImage: "radial-gradient(circle at 50% 50%,#1C1C1C 1.45px,transparent 1.55px)", backgroundSize: "3.2px 3.2px", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent", WebkitTextFillColor: "transparent", animation: "lsPop .7s cubic-bezier(.22,1,.36,1) both"}}>{V.runMedian}</span>
                      <span style={{fontSize: "17px", color: "#5A5F5C", marginTop: "8px"}}>{V.runMedianHalf}</span>
                      <span style={{marginLeft: "auto", padding: "5px 11px", borderRadius: "999px", background: "#F5F5F4", fontSize: "11.5px", fontWeight: "500"}}>{V.runMedianBadge}</span>
                    </div>
                    <div style={{fontSize: "13.5px", color: "#4A4F4B"}}>Run duration</div>
                    <div style={{display: "flex", gap: "4px"}}>
                      <span style={{flex: "1", height: "8px", borderRadius: "4px", background: "#8FA382"}}></span>
                      <span style={{flex: "1", height: "8px", borderRadius: "4px", background: "#8FA382"}}></span>
                      <span style={{flex: "1", height: "8px", borderRadius: "4px", background: "#8FA382"}}></span>
                      <span style={{flex: "1", height: "8px", borderRadius: "4px", background: "#E2E5DE"}}></span>
                      <span style={{flex: "1", height: "8px", borderRadius: "4px", background: "#E2E5DE"}}></span>
                      <span style={{flex: "1", height: "8px", borderRadius: "4px", background: "#E2E5DE"}}></span>
                    </div>
                  </div>
                  <div style={{display: "flex", flexDirection: "column", gap: "8px"}}>
                    <div style={{display: "flex", alignItems: "flex-start", gap: "10px"}}>
                      <span style={{fontSize: "clamp(40px,4vw,54px)", lineHeight: ".9", fontWeight: "700", letterSpacing: "-.04em", backgroundImage: "radial-gradient(circle at 50% 50%,#1C1C1C 1.45px,transparent 1.55px)", backgroundSize: "3.2px 3.2px", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent", WebkitTextFillColor: "transparent", animation: "lsPop .7s cubic-bezier(.22,1,.36,1) both"}}>{V.runCleanNum}</span>
                      <span style={{fontSize: "17px", color: "#5A5F5C", marginTop: "8px"}}>{V.runCleanTotal}</span>
                      <span style={{marginLeft: "auto", padding: "5px 11px", borderRadius: "999px", background: "#F5F5F4", fontSize: "11.5px", fontWeight: "500"}}>{V.runCleanBadge}</span>
                    </div>
                    <div style={{fontSize: "13.5px", color: "#4A4F4B"}}>Finished clean</div>
                    <div style={{display: "flex", gap: "4px"}}>
                      <span style={{flex: "1", height: "8px", borderRadius: "4px", background: "#8FA382"}}></span>
                      <span style={{flex: "1", height: "8px", borderRadius: "4px", background: "#8FA382"}}></span>
                      <span style={{flex: "1", height: "8px", borderRadius: "4px", background: "#8FA382"}}></span>
                      <span style={{flex: "1", height: "8px", borderRadius: "4px", background: "#8FA382"}}></span>
                      <span style={{flex: "1", height: "8px", borderRadius: "4px", background: "#8FA382"}}></span>
                      <span style={{flex: "1", height: "8px", borderRadius: "4px", background: "#E2E5DE"}}></span>
                    </div>
                  </div>
                </div>
                <section data-card="1" style={{padding: "22px 24px", borderRadius: "22px", background: "#F5F5F4", transition: "transform .5s cubic-bezier(.22,1,.36,1),box-shadow .5s linear"}}>
                  <div style={{display: "flex", flexWrap: "wrap", alignItems: "center", gap: "12px"}}>
                    <div>
                      <h2 style={{margin: "0", fontSize: "19px", fontWeight: "500", letterSpacing: "-.01em"}}>Timeline</h2>
                      <p style={{margin: "4px 0 0", fontSize: "13.5px", color: "#5A5F5C"}}>Bars show places captured per keyword pass.</p>
                    </div>
                    <div style={{display: "flex", flexWrap: "wrap", gap: "8px", marginLeft: "auto"}}>
                      {(V.runChips ?? []).map((rc, __irc) => (
                        <Fragment key={__irc}>
                          <button type="button" onClick={rc.pick} data-run-chip={rc.label} data-chip="1" data-on={rc.on} style={{display: "inline-flex", alignItems: "center", gap: "8px", padding: "10px 15px", border: "0", borderRadius: "999px", fontFamily: "inherit", fontSize: "13px", fontWeight: "500", cursor: "pointer"}}>
                            {rc.label}
                            <span style={{fontSize: "11.5px", opacity: ".7"}}>{rc.count}</span>
                          </button>
                        </Fragment>
                      ))}
                    </div>
                  </div>
                  <div style={{position: "relative", marginTop: "14px"}}>
                    <span aria-hidden="true" style={{position: "absolute", left: "18px", top: "8px", bottom: "8px", width: "1px", background: "#DEDFDC"}}></span>
                    <ul style={{listStyle: "none", margin: "0", padding: "0", position: "relative"}}>
                      {(V.runRows ?? []).map((r, __ir) => (
                        <Fragment key={__ir}>
                          <li style={{position: "relative", display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: "14px", alignItems: "center", padding: "16px 0 16px 44px", borderTop: "1px solid #E4E5E2"}}>
                            <span aria-hidden="true" style={{position: "absolute", left: "12px", top: "50%", marginTop: "-6px", display: "block", width: "13px", height: "13px", borderRadius: "999px", background: "#C8D5BB", boxShadow: "0 0 0 4px #F5F5F4"}}></span>
                            <div style={{minWidth: "0"}}>
                              <div style={{display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: "10px"}}>
                                <span style={{fontSize: "12px", color: "#5A5F5C", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap"}}>{r.when}</span>
                                <span style={{fontSize: "14.5px", fontWeight: "500", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis"}}>{r.keywords}</span>
                              </div>
                              <div style={{marginTop: "5px", fontSize: "12.5px", color: "#5A5F5C"}}>{r.summary}</div>
                            </div>
                            <div style={{display: "flex", alignItems: "center", gap: "12px"}}>
                              <span aria-hidden="true" style={{display: "flex", alignItems: "flex-end", gap: "3px", height: "34px"}}>
                                {(r.bars ?? []).map((b, __ib) => (
                                  <Fragment key={__ib}>
                                    <span style={{width: "6px", height: b.height, borderRadius: "3px", background: "#1C1C1C"}}></span>
                                  </Fragment>
                                ))}
                              </span>
                              {shows(r.isDone) ? (
                                <>
                                <span style={{padding: "5px 12px", borderRadius: "999px", background: "#C8D5BB", color: "#1C1C1C", fontSize: "11.5px", fontWeight: "500", whiteSpace: "nowrap"}}>{r.done}</span>
                                </>
                              ) : null}
                              {shows(r.isFailed) ? (
                                <>
                                <span style={{padding: "5px 12px", borderRadius: "999px", background: "#F0DEDC", color: "#7A2E27", fontSize: "11.5px", fontWeight: "500", whiteSpace: "nowrap"}}>{r.failed}</span>
                                </>
                              ) : null}
                              {shows(r.isCancelled) ? (
                                <>
                                <span style={{padding: "5px 12px", borderRadius: "999px", background: "#EAEAE8", color: "#4A4F4B", fontSize: "11.5px", fontWeight: "500", whiteSpace: "nowrap"}}>{r.cancelled}</span>
                                </>
                              ) : null}
                              <button data-action="Re-run" data-goto="maps" data-rerun="1" type="button" data-ghost="1" style={{display: "inline-flex", alignItems: "center", gap: "7px", height: "36px", padding: "0 15px", border: "0", borderRadius: "999px", background: "#EAEAE8", color: "#1C1C1C", fontFamily: "inherit", fontSize: "12.5px", fontWeight: "500", cursor: "pointer", transition: "background .25s linear"}}>Re-run</button>
                            </div>
                          </li>
                        </Fragment>
                      ))}
                    </ul>
                  </div>
                  <div style={{display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "12px", marginTop: "18px", paddingTop: "16px", borderTop: "1px solid #E4E5E2"}}>
                    <span style={{fontSize: "12.5px", color: "#5A5F5C"}}>Showing {V.runShowing} of {V.runCount} runs · log kept for 90 days</span>
                    {shows(V.runsMoreOn) ? (
                      <>
                      <button type="button" data-more="1" style={{display: "inline-flex", alignItems: "center", gap: "9px", height: "40px", padding: "0 18px", border: "0", borderRadius: "999px", background: "#EAEAE8", color: "#1C1C1C", fontFamily: "inherit", fontSize: "13px", fontWeight: "500", cursor: "pointer", transition: "background .25s linear"}} onClick={V.showMoreRuns}>
                        Older runs{' '}
                        <span aria-hidden="true">↓</span>
                      </button>
                      </>
                    ) : null}
                  </div>
                </section>
              </div>
              </>
            ) : null}
            {shows(V.isSettings) ? <SettingsPanel V={V} /> : null}
            {shows(V.gWin) ? (
              <>
              <div data-google-backdrop="1" onClick={(event) => { if (event.target === event.currentTarget) V.gCancel() }} style={{position: "fixed", inset: "0", zIndex: "95", display: "grid", placeItems: "center", padding: "clamp(14px,3vw,32px)", background: "rgba(28,28,28,.62)", animation: "lsScrimIn .35s linear both"}}>
                <section style={{width: "100%", maxWidth: "560px", borderRadius: "22px", background: "#F5F5F4", overflow: "hidden", boxShadow: "0 40px 80px -40px rgba(28,28,28,.8)", animation: "lsPanelIn .5s cubic-bezier(.22,1,.36,1) both"}}>
                  <div style={{display: "flex", alignItems: "center", gap: "12px", padding: "12px 16px", background: "#E4E6E3"}}>
                    <span aria-hidden="true" style={{display: "flex", gap: "6px"}}>
                      <span style={{width: "10px", height: "10px", borderRadius: "999px", background: "#C6C8C4"}}></span>
                      <span style={{width: "10px", height: "10px", borderRadius: "999px", background: "#C6C8C4"}}></span>
                      <span style={{width: "10px", height: "10px", borderRadius: "999px", background: "#C6C8C4"}}></span>
                    </span>
                    <span style={{flex: "1", minWidth: "0", padding: "7px 12px", borderRadius: "999px", background: "#F5F5F4", fontSize: "12px", color: "#4A4F4B", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis"}}>accounts.google.com · Nafran's own browser window</span>
                  </div>
                  <div style={{padding: "clamp(22px,3vw,34px)"}}>
                    {shows(V.gSigning) ? (
                      <>
                      <div style={{fontSize: "10.5px", fontWeight: "500", letterSpacing: ".16em", textTransform: "uppercase", color: "#555956"}}>Step {V.gStep} of 2</div>
                      <h2 style={{margin: "10px 0 0", fontSize: "clamp(22px,2.4vw,28px)", fontWeight: "400", letterSpacing: "-.02em"}}>{V.gHeading}</h2>
                      <p style={{margin: "8px 0 0", maxWidth: "46ch", fontSize: "13.5px", lineHeight: "1.6", color: "#5A5F5C", textWrap: "pretty"}}>You type this on Google's page. The app never sees the password — it only keeps the profile folder this window leaves behind.</p>
                      <input data-gfield="1" type={V.gFieldType} value={V.gFieldVal} readOnly={true} aria-label={V.gHeading} style={{width: "100%", height: "50px", marginTop: "18px", padding: "0 16px", border: "0", borderRadius: "14px", background: "#EAEAE8", fontFamily: "inherit", fontSize: "15px", color: "#1C1C1C", outline: "none"}} />
                      <div style={{display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px", marginTop: "18px"}}>
                        <button type="button" data-run="1" onClick={V.gNext} style={{display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "9px", height: "44px", padding: "0 22px", border: "0", borderRadius: "999px", background: "#1C1C1C", color: "#F0F0F0", fontFamily: "inherit", fontSize: "13.5px", fontWeight: "500", cursor: "pointer", transition: "transform .3s cubic-bezier(.22,1,.36,1)"}}>{V.gNextLabel}</button>
                        <button type="button" onClick={V.gCancel} style={{display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "9px", height: "44px", padding: "0 20px", border: "0", borderRadius: "999px", background: "transparent", color: "#4A4F4B", fontFamily: "inherit", fontSize: "13.5px", fontWeight: "500", cursor: "pointer", transition: "background .25s linear"}}>Close window</button>
                        <span style={{marginLeft: "auto", fontSize: "12px", color: "#5A5F5C"}}>{V.gFoot}</span>
                      </div>
                      </>
                    ) : null}
                    {shows(V.gDone) ? (
                      <>
                      <div style={{display: "flex", alignItems: "center", gap: "14px"}}>
                        <span aria-hidden="true" style={{display: "grid", placeItems: "center", width: "48px", height: "48px", borderRadius: "16px", background: "#C8D5BB", fontSize: "19px"}}>✓</span>
                        <div>
                          <h2 style={{margin: "0", fontSize: "clamp(20px,2.2vw,25px)", fontWeight: "400", letterSpacing: "-.02em"}}>Account connected</h2>
                          <p style={{margin: "4px 0 0", fontSize: "13.5px", color: "#5A5F5C"}}>{V.gDoneNote}</p>
                        </div>
                      </div>
                      </>
                    ) : null}
                  </div>
                </section>
              </div>
              </>
            ) : null}
            {shows(V.shOpen) ? (
              <>
              <div onClick={V.closeShist} style={{position: "fixed", inset: "0", zIndex: "90", background: "rgba(28,28,28,.5)", animation: "lsScrimIn .35s linear both"}}></div>
              <aside aria-label="Social history" style={{position: "fixed", top: "12px", right: "12px", bottom: "12px", zIndex: "91", display: "flex", flexDirection: "column", width: "min(420px,calc(100vw - 24px))", borderRadius: "26px", background: "#F5F5F4", boxShadow: "0 40px 80px -40px rgba(28,28,28,.8)", animation: "lsPanelIn .5s cubic-bezier(.22,1,.36,1) both"}}>
                <div style={{display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px", padding: "22px 22px 0"}}>
                  <div>
                    <h2 style={{margin: "0", fontSize: "clamp(19px,2.1vw,24px)", fontWeight: "400", letterSpacing: "-.02em"}}>{V.shTitle}</h2>
                    <p style={{margin: "5px 0 0", fontSize: "13px", color: "#5A5F5C"}}>{V.shSub}</p>
                  </div>
                  <button type="button" onClick={V.closeShist} aria-label="Close history" data-ghost="1" style={{display: "grid", placeItems: "center", width: "38px", height: "38px", border: "0", borderRadius: "999px", background: "#E5E5E5", color: "#1C1C1C", fontFamily: "inherit", fontSize: "16px", cursor: "pointer", flex: "none"}}>×</button>
                </div>
                <div data-range="1" data-active={V.shTab} style={{display: "flex", gap: "4px", margin: "16px 22px 0", padding: "4px", borderRadius: "999px", background: "#E5E5E5", alignSelf: "flex-start"}}>
                  <button type="button" data-r="All" onClick={V.shAll} style={{padding: "7px 14px", border: "0", borderRadius: "999px", fontFamily: "inherit", fontSize: "12.5px", cursor: "pointer"}}>All</button>
                  <button type="button" data-r="Searches" onClick={V.shSearch} style={{padding: "7px 14px", border: "0", borderRadius: "999px", fontFamily: "inherit", fontSize: "12.5px", cursor: "pointer"}}>Searches</button>
                  <button type="button" data-r="Imports" onClick={V.shImport} style={{padding: "7px 14px", border: "0", borderRadius: "999px", fontFamily: "inherit", fontSize: "12.5px", cursor: "pointer"}}>Activity</button>
                </div>
                <ol style={{flex: "1", minHeight: "0", overflowY: "auto", listStyle: "none", margin: "14px 0 0", padding: "0 22px 8px", display: "flex", flexDirection: "column"}}>
                  {(V.shRows ?? []).map((e, __ie) => (
                    <Fragment key={__ie}>
                      <li style={{borderTop: "1px solid #E4E5E2"}}>
                        <button type="button" onClick={e.toggle} aria-expanded={e.isOpen} data-shrow="1" style={{display: "grid", gridTemplateColumns: "34px minmax(0,1fr) 16px", alignItems: "center", gap: "12px", width: "100%", padding: "12px 0", border: "0", background: "transparent", fontFamily: "inherit", color: "inherit", textAlign: "left", cursor: "pointer"}}>
                          <span data-shkind={e.kind} aria-hidden="true" style={{display: "grid", placeItems: "center", width: "32px", height: "32px", borderRadius: "10px", fontSize: "13px"}}>{e.icon}</span>
                          <span style={{minWidth: "0"}}>
                            <span style={{display: "block", fontSize: "13.5px", fontWeight: "500", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis"}}>{e.title}</span>
                            <span style={{display: "block", marginTop: "2px", fontSize: "12px", color: "#5A5F5C"}}>{e.meta}</span>
                          </span>
                          <span data-chev={e.open} aria-hidden="true" style={{fontSize: "12px", color: "#4A4F4B", transition: "transform .3s cubic-bezier(.22,1,.36,1)"}}>⌄</span>
                        </button>
                        {shows(e.isOpen) ? (
                          <>
                          <div style={{margin: "0 0 12px 46px", padding: "12px 14px", borderRadius: "14px", background: "#EAEAE8", animation: "lsPanelIn .35s cubic-bezier(.22,1,.36,1) both"}}>
                            {shows(e.hasItems) ? (
                              <>
                              <ol style={{listStyle: "none", margin: "0", padding: "0", display: "flex", flexDirection: "column", gap: "6px"}}>
                                {(e.items ?? []).map((it, __iit) => (
                                  <Fragment key={__iit}>
                                    <li style={{fontSize: "13px", lineHeight: "1.5", color: "#1C1C1C", overflowWrap: "anywhere", userSelect: "text"}}>{it.text}</li>
                                  </Fragment>
                                ))}
                              </ol>
                              </>
                            ) : null}
                            {shows(e.canRun) ? (
                              <>
                              <button type="button" onClick={e.run} data-shist="1" style={{marginTop: "10px", height: "30px", padding: "0 12px", border: "0", borderRadius: "999px", fontFamily: "inherit", fontSize: "12px", cursor: "pointer"}}>Run again</button>
                              </>
                            ) : null}
                          </div>
                          </>
                        ) : null}
                      </li>
                    </Fragment>
                  ))}
                </ol>
                <div style={{display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", padding: "14px 22px 20px", borderTop: "1px solid #E4E5E2"}}>
                  <span style={{fontSize: "12px", color: "#5A5F5C"}}>{V.shFoot}</span>
                  <button type="button" onClick={V.clearShist} style={{padding: "0", border: "0", background: "transparent", fontFamily: "inherit", fontSize: "12.5px", color: "#4A4F4B", textDecoration: "underline", cursor: "pointer"}}>Clear history</button>
                </div>
              </aside>
              </>
            ) : null}
            {shows(V.scanOverlay) ? (
              <>
              <div onClick={(event) => { if (event.target === event.currentTarget && !shows(V.scanCancelVisible)) V.exitScan() }} style={{position: "fixed", inset: "0", zIndex: "95", display: "grid", placeItems: "center", padding: "clamp(14px,3vw,32px)", background: "rgba(28,28,28,.66)", animation: "lsScrimIn .35s linear both"}} data-scanscrim="1">
                <section style={{width: "100%", maxWidth: "520px", maxHeight: "92vh", overflowY: "auto", padding: "clamp(22px,3vw,32px)", borderRadius: "28px", background: "#F5F5F4", boxShadow: "0 40px 80px -40px rgba(28,28,28,.8)", animation: "lsPanelIn .5s cubic-bezier(.22,1,.36,1) both"}}>
                  <div style={{display: "flex", alignItems: "center", gap: "18px"}}>
                    <span aria-hidden="true" style={{position: "relative", display: "block", width: "78px", height: "78px", borderRadius: "999px", background: "#E7EDE0", overflow: "hidden", flex: "none"}}>
                      <span style={{position: "absolute", inset: "0", borderRadius: "999px", background: "conic-gradient(from 0deg,rgba(143,163,130,0) 0deg,rgba(143,163,130,.9) 70deg,rgba(143,163,130,0) 72deg)", animation: "lsSpin 1.6s linear infinite"}}></span>
                      <span style={{position: "absolute", inset: "14px", borderRadius: "999px", border: "1px solid rgba(28,28,28,.14)"}}></span>
                      <span style={{position: "absolute", inset: "28px", borderRadius: "999px", border: "1px solid rgba(28,28,28,.14)"}}></span>
                      <span style={{position: "absolute", left: "50%", top: "50%", width: "8px", height: "8px", margin: "-4px 0 0 -4px", borderRadius: "999px", background: "#1C1C1C"}}></span>
                    </span>
                    <div style={{minWidth: "0"}}>
                      <h2 style={{margin: "0", fontSize: "clamp(20px,2.3vw,26px)", fontWeight: "400", letterSpacing: "-.02em"}}>{V.ovTitle}</h2>
                      <p style={{margin: "5px 0 0", fontSize: "13px", color: "#5A5F5C"}}>{V.ovNote}</p>
                    </div>
                  </div>
                  <div style={{height: "6px", marginTop: "20px", borderRadius: "3px", background: "#E3E4E1", overflow: "hidden"}}>
                    <span style={{display: "block", height: "100%", width: V.ovPct, borderRadius: "3px", background: "#1C1C1C", transition: "width .5s cubic-bezier(.22,1,.36,1)"}}></span>
                  </div>
                  <div style={{display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "10px", marginTop: "16px"}}>
                    {shows(V.scanCancelVisible) ? (
                      <>
                      <button type="button" onClick={V.cancelScan} data-scan-cancel="1" style={{height: "36px", padding: "0 16px", border: "0", borderRadius: "999px", background: "#E5E5E5", color: "#1C1C1C", fontFamily: "inherit", fontSize: "12.5px", fontWeight: "500", cursor: "pointer"}}>Cancel scan</button>
                      </>
                    ) : null}
                  </div>
                  <ul style={{listStyle: "none", margin: "16px 0 0", padding: "0", display: "flex", flexDirection: "column"}}>
                    {(V.scanRows ?? []).map((sr, __isr) => (
                      <Fragment key={__isr}>
                        <li style={{display: "flex", flexWrap: "wrap", alignItems: "center", gap: "10px", padding: "11px 0", borderTop: "1px solid #E4E5E2"}}>
                          <span style={{flex: "1", minWidth: "140px", fontSize: "13.5px", fontWeight: "500", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis"}}>{sr.domain}</span>
                          <span style={{display: "flex", flexWrap: "wrap", gap: "4px", maxWidth: "100%"}}>
                            {(sr.chips ?? []).map((p, __ip) => (
                              <Fragment key={__ip}>
                                <a href={p.url} target="_blank" rel="noopener noreferrer" data-social-profile-link={p.url} aria-label={`Open ${p.t} profile`} title={p.k} style={{display: "grid", placeItems: "center", minWidth: "24px", height: "24px", padding: "0 7px", borderRadius: "7px", background: "#C8D5BB", color: "#1C1C1C", fontSize: "10.5px", fontWeight: "600", textDecoration: "none", whiteSpace: "nowrap", cursor: "pointer", animation: "lsPanelIn .35s cubic-bezier(.22,1,.36,1) both"}}>{p.t}</a>
                              </Fragment>
                            ))}
                          </span>
                          <span data-impst={sr.pill} style={{display: "inline-flex", alignItems: "center", gap: "6px", padding: "5px 11px", borderRadius: "999px", fontSize: "11.5px", fontWeight: "500", whiteSpace: "nowrap"}}>
                            {shows(sr.scanning) ? (
                              <>
                              <span aria-hidden="true" style={{width: "9px", height: "9px", borderRadius: "999px", border: "1.5px solid rgba(28,28,28,.25)", borderTopColor: "#1C1C1C", animation: "lsSpin .8s linear infinite"}}></span>
                              </>
                            ) : null}
                            {' '}{sr.status}{' '}
                          </span>
                        </li>
                      </Fragment>
                    ))}
                  </ul>
                </section>
              </div>
              </>
            ) : null}
            {shows(V.bulkKeywordsOpen) ? (
              <>
              <div data-bulk-keywords-modal="1" role="dialog" aria-modal="true" aria-labelledby="bulk-keywords-title" onClick={(event) => { if (event.target === event.currentTarget) V.closeBulkKeywords() }} style={{position: "fixed", inset: "0", zIndex: "92", display: "grid", placeItems: "center", padding: "clamp(14px,3vw,32px)", background: "rgba(28,28,28,.62)", animation: "lsScrimIn .35s linear both"}}>
                <section style={{width: "100%", maxWidth: "650px", maxHeight: "92vh", overflowY: "auto", padding: "clamp(20px,2.6vw,30px)", borderRadius: "26px", background: "#F5F5F4", boxShadow: "0 40px 80px -40px rgba(28,28,28,.8)", animation: "lsPanelIn .5s cubic-bezier(.22,1,.36,1) both"}}>
                  <div style={{display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "16px"}}>
                    <div>
                      <h2 id="bulk-keywords-title" style={{margin: "0", fontSize: "clamp(21px,2.4vw,27px)", fontWeight: "400", letterSpacing: "-.025em"}}>Bulk import keywords</h2>
                      <p style={{margin: "7px 0 0", maxWidth: "50ch", fontSize: "13.5px", lineHeight: "1.55", color: "#5A5F5C"}}>Paste one keyword per line. Commas, semicolons and numbered lists also work.</p>
                    </div>
                    <button type="button" onClick={V.closeBulkKeywords} aria-label="Close bulk keyword import" style={{display: "grid", placeItems: "center", width: "34px", height: "34px", border: "0", borderRadius: "999px", background: "#E5E5E5", color: "#1C1C1C", fontFamily: "inherit", fontSize: "18px", cursor: "pointer", flex: "none"}}>×</button>
                  </div>
                  <textarea data-bulk-keywords-input="1" value={V.bulkKeywordsText} onInput={V.onBulkKeywordsInput} spellCheck="false" aria-label="Bulk keywords" placeholder="dentist\nskin clinic\nphysiotherapist\nsoftware company" style={{display: "block", width: "100%", height: "180px", marginTop: "18px", padding: "15px 17px", border: "1px dashed #AEB3AA", borderRadius: "17px", background: "#EAEAE8", fontFamily: "inherit", fontSize: "14px", lineHeight: "1.7", color: "#1C1C1C", resize: "vertical", outline: "none"}}></textarea>
                  <div style={{display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px", marginTop: "11px"}}>
                    <button type="button" onClick={V.pasteBulkKeywords} data-ghost="1" style={{height: "36px", padding: "0 14px", border: "0", borderRadius: "999px", background: "#E5E5E5", color: "#1C1C1C", fontFamily: "inherit", fontSize: "12.5px", cursor: "pointer"}}>Paste from clipboard</button>
                    <button type="button" onClick={V.clearBulkKeywords} style={{height: "36px", padding: "0 12px", border: "0", background: "transparent", color: "#5A5F5C", fontFamily: "inherit", fontSize: "12.5px", textDecoration: "underline", cursor: "pointer"}}>Clear</button>
                    <span style={{marginLeft: "auto", padding: "7px 12px", borderRadius: "999px", background: "#DDE3D6", fontSize: "11.5px", fontWeight: "500"}}>{V.bulkKeywordCountLabel}</span>
                  </div>
                  {shows(V.bulkKeywordHasTerms) ? (
                    <>
                    <div style={{marginTop: "18px", padding: "16px", borderRadius: "18px", background: "#FFFFFF"}}>
                      <div style={{display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "8px"}}>
                        <span style={{fontSize: "10.5px", fontWeight: "500", letterSpacing: ".16em", textTransform: "uppercase", color: "#555956"}}>Preview</span>
                        <span style={{fontSize: "11.5px", color: "#5A5F5C"}}>{V.bulkKeywordLimitLabel}</span>
                      </div>
                      <div style={{display: "flex", flexWrap: "wrap", gap: "7px", marginTop: "12px"}}>
                        {(V.bulkKeywordRows ?? []).map((kw, __ikw) => (
                          <Fragment key={__ikw}>
                            <span style={{display: "inline-flex", alignItems: "center", gap: "7px", padding: "8px 11px", borderRadius: "999px", background: "#E7ECE2", fontSize: "12.5px", color: "#1C1C1C"}}>
                              <span style={{display: "grid", placeItems: "center", width: "18px", height: "18px", borderRadius: "999px", background: "#1C1C1C", color: "#F0F0F0", fontSize: "9px"}}>{kw.index}</span>
                              {kw.label}
                            </span>
                          </Fragment>
                        ))}
                      </div>
                      <p style={{margin: "11px 0 0", fontSize: "11.5px", color: "#6C766F"}}>{V.bulkKeywordDuplicateLabel}</p>
                    </div>
                    </>
                  ) : null}
                  <div style={{display: "flex", flexWrap: "wrap", gap: "8px", marginTop: "22px", paddingTop: "18px", borderTop: "1px solid #E0E2DE"}}>
                    <button type="button" onClick={V.replaceBulkKeywords} data-bulk-keywords-replace="1" data-run="1" style={{display: "inline-flex", alignItems: "center", justifyContent: "center", height: "44px", padding: "0 20px", border: "0", borderRadius: "999px", background: "#1C1C1C", color: "#F0F0F0", fontFamily: "inherit", fontSize: "13px", fontWeight: "500", cursor: "pointer"}}>Replace current</button>
                    <button type="button" onClick={V.addBulkKeywords} data-bulk-keywords-add="1" data-ghost="1" style={{display: "inline-flex", alignItems: "center", justifyContent: "center", height: "44px", padding: "0 20px", border: "0", borderRadius: "999px", background: "#E5E5E5", color: "#1C1C1C", fontFamily: "inherit", fontSize: "13px", fontWeight: "500", cursor: "pointer"}}>Add to current</button>
                    <button type="button" onClick={V.closeBulkKeywords} style={{display: "inline-flex", alignItems: "center", justifyContent: "center", height: "44px", padding: "0 16px", border: "0", background: "transparent", color: "#4A4F4B", fontFamily: "inherit", fontSize: "13px", cursor: "pointer"}}>Cancel</button>
                  </div>
                </section>
              </div>
              </>
            ) : null}
            {shows(V.impOpen) ? (
              <>
              <div onClick={(event) => { if (event.target === event.currentTarget) V.closeImp() }} style={{position: "fixed", inset: "0", zIndex: "90", display: "grid", placeItems: "center", padding: "clamp(14px,3vw,32px)", background: "rgba(28,28,28,.62)", animation: "lsScrimIn .35s linear both"}} data-socimp="1" data-impmodal="1">
                <section style={{width: "100%", maxWidth: "620px", maxHeight: "92vh", overflowY: "auto", padding: "clamp(20px,2.4vw,28px)", borderRadius: "26px", background: "#F5F5F4", boxShadow: "0 40px 80px -40px rgba(28,28,28,.8)", animation: "lsPanelIn .5s cubic-bezier(.22,1,.36,1) both"}}>
                  <h2 style={{margin: "0", fontSize: "clamp(19px,2.1vw,24px)", fontWeight: "400", letterSpacing: "-.02em"}}>Import websites</h2>
                  <p style={{margin: "6px 0 0", fontSize: "13.5px", lineHeight: "1.55", color: "#5A5F5C"}}>Paste website URLs, one per line.</p>
                  <textarea data-imptext="1" value={V.impValue} onInput={V.onImpText} spellCheck="false" aria-label="Website URLs" placeholder="northernspine.co.uk\nhttps://deansgatephysio.co.uk\nglowskin.mcr" style={{display: "block", width: "100%", height: "170px", marginTop: "16px", padding: "14px 16px", border: "1px dashed #C6C8C4", borderRadius: "16px", background: "#EAEAE8", fontFamily: "inherit", fontSize: "14px", lineHeight: "1.7", color: "#1C1C1C", resize: "vertical", outline: "none"}} data-socimpinput="1"></textarea>
                  <div style={{display: "flex", flexWrap: "wrap", gap: "8px", marginTop: "16px"}}>
                    {shows(V.impHasLines) ? (
                      <>
                      <button type="button" data-run="1" onClick={V.impImport} style={{display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "9px", height: "44px", padding: "0 22px", border: "0", borderRadius: "999px", background: "#1C1C1C", color: "#F0F0F0", fontFamily: "inherit", fontSize: "13.5px", fontWeight: "500", cursor: "pointer", transition: "transform .3s cubic-bezier(.22,1,.36,1)", animation: "lsPanelIn .35s cubic-bezier(.22,1,.36,1) both"}} data-socimpgo="1" data-importgo="1">
                        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
                          <circle cx="11" cy="11" r="6.5"></circle>
                          <path d="M16 16l4.5 4.5"></path>
                        </svg>
                        {' '}{V.impScanLabel}{' '}
                      </button>
                      </>
                    ) : null}
                    <button type="button" onClick={V.closeImp} style={{display: "inline-flex", alignItems: "center", justifyContent: "center", height: "44px", padding: "0 20px", border: "0", borderRadius: "999px", background: "transparent", color: "#4A4F4B", fontFamily: "inherit", fontSize: "13.5px", fontWeight: "500", cursor: "pointer"}} data-socimpcancel="1">Cancel</button>
                  </div>
                </section>
              </div>
              </>
            ) : null}
            {shows(V.expOpen) ? (
              <>
              <div data-export-backdrop="1" onClick={(event) => { if (event.target === event.currentTarget) V.closeExp() }} style={{position: "fixed", inset: "0", zIndex: "90", display: "grid", placeItems: "center", padding: "clamp(14px,3vw,32px)", background: "rgba(28,28,28,.62)", animation: "lsScrimIn .35s linear both"}}>
                <section style={{width: "100%", maxWidth: "700px", maxHeight: "92vh", overflowY: "auto", padding: "clamp(20px,2.4vw,28px)", borderRadius: "26px", background: "#F5F5F4", boxShadow: "0 40px 80px -40px rgba(28,28,28,.8)", animation: "lsPanelIn .5s cubic-bezier(.22,1,.36,1) both"}}>
                  <div style={{display: "flex", flexWrap: "wrap", alignItems: "flex-start", justifyContent: "space-between", gap: "14px"}}>
                    <div>
                      <h2 style={{margin: "0", fontSize: "clamp(19px,2.1vw,24px)", fontWeight: "400", letterSpacing: "-.02em"}}>{V.expTitle}</h2>
                      <p style={{margin: "6px 0 0", maxWidth: "52ch", fontSize: "13.5px", lineHeight: "1.55", color: "#5A5F5C", textWrap: "pretty"}}>{V.expNote}</p>
                    </div>
                    <span style={{padding: "7px 14px", borderRadius: "999px", background: "#C8D5BB", fontSize: "12px", fontWeight: "500", whiteSpace: "nowrap"}}>{V.expSummary}</span>
                  </div>
                  <div style={{marginTop: "20px"}}>
                    <div style={{fontSize: "10.5px", fontWeight: "500", letterSpacing: ".16em", textTransform: "uppercase", color: "#555956"}}>What to export</div>
                    <div style={{display: "flex", flexWrap: "wrap", gap: "8px", marginTop: "11px"}}>
                      {(V.expScopes ?? []).map((sc, __isc) => (
                        <Fragment key={__isc}>
                          <button type="button" onClick={sc.pick} data-chip="1" data-on={sc.on} style={{display: "inline-flex", alignItems: "center", gap: "8px", padding: "10px 16px", border: "0", borderRadius: "999px", fontFamily: "inherit", fontSize: "13.5px", cursor: "pointer"}}>
                            {sc.label}
                            <span style={{fontSize: "11.5px", opacity: ".7"}}>{sc.count}</span>
                          </button>
                        </Fragment>
                      ))}
                    </div>
                  </div>
                  <div style={{marginTop: "20px"}}>
                    <div style={{display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "10px"}}>
                      <span style={{fontSize: "10.5px", fontWeight: "500", letterSpacing: ".16em", textTransform: "uppercase", color: "#555956"}}>Columns</span>
                      <button type="button" onClick={V.expAllCols} style={{padding: "0", border: "0", background: "transparent", fontFamily: "inherit", fontSize: "12px", color: "#4A4F4B", textDecoration: "underline", cursor: "pointer"}}>Select all</button>
                    </div>
                    <div style={{display: "flex", flexWrap: "wrap", gap: "7px", marginTop: "11px"}}>
                      {(V.expCols ?? []).map((c, __ic) => (
                        <Fragment key={__ic}>
                          <button type="button" onClick={c.toggle} data-chip="1" data-on={c.on} style={{display: "inline-flex", alignItems: "center", gap: "7px", padding: "9px 14px", border: "0", borderRadius: "999px", fontFamily: "inherit", fontSize: "13px", cursor: "pointer"}}>
                            <span data-tick="1" aria-hidden="true" style={{fontSize: "10px"}}>✓</span>
                            {c.label}
                          </button>
                        </Fragment>
                      ))}
                    </div>
                  </div>
                  <div style={{marginTop: "20px"}}>
                    <div style={{fontSize: "10.5px", fontWeight: "500", letterSpacing: ".16em", textTransform: "uppercase", color: "#555956"}}>File</div>
                    <div style={{display: "flex", flexWrap: "wrap", alignItems: "center", gap: "10px", marginTop: "11px", padding: "13px 16px", borderRadius: "14px", background: "#EAEAE8"}}>
                      <span aria-hidden="true" style={{display: "grid", placeItems: "center", width: "32px", height: "32px", borderRadius: "10px", background: "#1C1C1C", color: "#F0F0F0", fontSize: "9.5px", fontWeight: "700"}}>{V.expBadge}</span>
                      <span style={{flex: "1", minWidth: "170px", fontSize: "13.5px", fontFamily: "ui-monospace,SFMono-Regular,Menlo,monospace"}}>{V.expFile}</span>
                      <span style={{fontSize: "12px", color: "#5A5F5C"}}>{V.expSize}</span>
                    </div>
                    <div style={{display: "flex", flexWrap: "wrap", gap: "8px", marginTop: "10px"}}>
                      {(V.delimChips ?? []).map((dc, __idc) => (
                        <Fragment key={__idc}>
                          <button type="button" onClick={dc.pick} data-chip="1" data-on={dc.on} style={{display: "inline-flex", alignItems: "center", gap: "8px", padding: "10px 15px", border: "0", borderRadius: "999px", fontFamily: "inherit", fontSize: "13px", fontWeight: "500", cursor: "pointer"}}>
                            {dc.label}
                            <span style={{fontSize: "11.5px", opacity: ".7"}}>{dc.count}</span>
                          </button>
                        </Fragment>
                      ))}
                    </div>
                  </div>
                  <div style={{display: "flex", flexWrap: "wrap", gap: "8px", marginTop: "22px", paddingTop: "18px", borderTop: "1px solid #E4E5E2"}}>
                    <button type="button" data-run="1" onClick={V.closeExp} style={{display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "9px", height: "44px", padding: "0 22px", border: "0", borderRadius: "999px", background: "#1C1C1C", color: "#F0F0F0", fontFamily: "inherit", fontSize: "13.5px", fontWeight: "500", cursor: "pointer", transition: "transform .3s cubic-bezier(.22,1,.36,1)"}}>
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M12 4v10"></path>
                        <path d="M8 10.5l4 4 4-4"></path>
                        <path d="M4.5 18.5h15"></path>
                      </svg>
                      {' '}Download{' '}
                    </button>
                    <button type="button" data-ghost="1" onClick={V.closeExp} style={{display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "9px", height: "44px", padding: "0 20px", border: "0", borderRadius: "999px", background: "transparent", color: "#4A4F4B", fontFamily: "inherit", fontSize: "13.5px", fontWeight: "500", cursor: "pointer", transition: "background .25s linear"}}>Cancel</button>
                  </div>
                </section>
              </div>
              </>
            ) : null}
            {shows(V.profileExportOpen) ? (
              <>
              <div data-profile-export-backdrop="1" onClick={(event) => { if (event.target === event.currentTarget) V.closeProfileExport() }} style={{position: "fixed", inset: "0", zIndex: "90", display: "grid", placeItems: "center", padding: "clamp(14px,3vw,32px)", background: "rgba(28,28,28,.62)", animation: "lsScrimIn .35s linear both"}}>
                <section style={{width: "100%", maxWidth: "520px", padding: "clamp(22px,3vw,32px)", borderRadius: "26px", background: "#F5F5F4", boxShadow: "0 40px 80px -40px rgba(28,28,28,.8)", animation: "lsPanelIn .5s cubic-bezier(.22,1,.36,1) both"}}>
                  <h2 style={{margin: "0", fontSize: "clamp(20px,2.2vw,26px)", fontWeight: "400", letterSpacing: "-.02em"}}>Export social profiles</h2>
                  <p style={{margin: "7px 0 0", fontSize: "13.5px", lineHeight: "1.55", color: "#5A5F5C"}}>{V.profileExportSummary}</p>
                  <div style={{display: "flex", flexWrap: "wrap", gap: "10px", marginTop: "24px"}}>
                    <button type="button" onClick={V.exportProfilesExcel} data-profile-export="xlsx" style={{display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "9px", height: "44px", padding: "0 20px", border: "0", borderRadius: "999px", background: "#1C1C1C", color: "#F0F0F0", fontFamily: "inherit", fontSize: "13.5px", fontWeight: "500", cursor: "pointer"}}>Excel (.xlsx)</button>
                    <button type="button" onClick={V.exportProfilesPdf} data-profile-export="pdf" style={{display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "9px", height: "44px", padding: "0 20px", border: "0", borderRadius: "999px", background: "#E5E5E5", color: "#1C1C1C", fontFamily: "inherit", fontSize: "13.5px", fontWeight: "500", cursor: "pointer"}}>PDF (.pdf)</button>
                    <button type="button" onClick={V.closeProfileExport} data-profile-export-cancel="1" style={{height: "44px", padding: "0 20px", border: "0", borderRadius: "999px", background: "transparent", color: "#4A4F4B", fontFamily: "inherit", fontSize: "13.5px", cursor: "pointer"}}>Cancel</button>
                  </div>
                </section>
              </div>
              </>
            ) : null}
            {shows(V.chatOpen) ? (
              <>
              <div data-chat-panel="1" style={{position: "fixed", right: "clamp(12px,2vw,26px)", bottom: "clamp(12px,2vw,26px)", zIndex: "95", width: "min(384px,calc(100vw - 24px))", maxHeight: "min(80vh,620px)", display: "flex", flexDirection: "column", borderRadius: "24px", background: "#F5F5F4", boxShadow: "0 34px 70px -34px rgba(28,28,28,.75)", overflow: "hidden", animation: "lsPanelIn .45s cubic-bezier(.22,1,.36,1) both"}}>
                <div style={{display: "flex", alignItems: "center", gap: "11px", padding: "14px 16px", background: "#1C1C1C", color: "#F0F0F0", flex: "none"}}>
                  <span data-chatlottie2="1" aria-hidden="true" style={{display: "block", width: "40px", height: "40px", flex: "none"}}></span>
                  <span style={{flex: "1", minWidth: "0"}}>
                    <span style={{display: "block", fontSize: "14.5px", fontWeight: "500"}}>Nafran Assist</span>
                    <span style={{display: "flex", alignItems: "center", gap: "6px", marginTop: "3px", fontSize: "11.5px", color: "#9BA29C"}}>
                      <span aria-hidden="true" style={{width: "6px", height: "6px", borderRadius: "999px", background: "#C8D5BB", animation: "lsPulse 2.4s ease-in-out infinite"}}></span>
                      AI · workspace aware
                    </span>
                  </span>
                  <button type="button" onClick={V.closeChat} aria-label="Close chat" style={{display: "grid", placeItems: "center", width: "32px", height: "32px", border: "0", borderRadius: "999px", background: "#2E302F", color: "#F0F0F0", fontFamily: "inherit", fontSize: "15px", cursor: "pointer", flex: "none"}}>×</button>
                </div>
                <div data-chatscroll="1" style={{flex: "1", minHeight: "min(180px,34vh)", overflowY: "auto", padding: "16px", display: "flex", flexDirection: "column", gap: "9px"}}>
                  {V.msgs.length === 0 ? (
                    <div data-assist-intro="1" style={{padding: "10px 2px", color: "#5A5F5C", fontSize: "13px", lineHeight: "1.5"}}>Ask me about finding leads, checking contact details, or exporting your list.</div>
                  ) : null}
                  {(V.msgs ?? []).map((m, __im) => (
                    <Fragment key={__im}>
                      <span data-msg={m.who} style={{maxWidth: "84%", padding: "11px 14px", fontSize: "13.5px", lineHeight: "1.5"}}>{m.text}</span>
                    </Fragment>
                  ))}
                  {shows(V.chatTyping) ? (
                    <>
                    <span data-msg="bot" aria-label="Typing" style={{display: "flex", alignItems: "center", gap: "5px", padding: "13px 14px"}}>
                      <span aria-hidden="true" style={{width: "6px", height: "6px", borderRadius: "999px", background: "#8B908C", animation: "lsPulse 1.2s ease-in-out infinite"}}></span>
                      <span aria-hidden="true" style={{width: "6px", height: "6px", borderRadius: "999px", background: "#8B908C", animation: "lsPulse 1.2s ease-in-out .2s infinite"}}></span>
                      <span aria-hidden="true" style={{width: "6px", height: "6px", borderRadius: "999px", background: "#8B908C", animation: "lsPulse 1.2s ease-in-out .4s infinite"}}></span>
                    </span>
                    </>
                  ) : null}
                </div>
                <div style={{flex: "none", padding: "0 16px 14px", display: "flex", flexDirection: "column", gap: "11px"}}>
                  <div style={{display: "flex", flexWrap: "wrap", gap: "6px"}}>
                    {(V.chatChips ?? []).map((c, __ic) => (
                      <Fragment key={__ic}>
                        <button type="button" onClick={c.send} data-chip="1" data-on="0" style={{display: "inline-flex", alignItems: "center", padding: "8px 13px", border: "0", borderRadius: "999px", fontFamily: "inherit", fontSize: "12.5px", cursor: "pointer"}}>{c.label}</button>
                      </Fragment>
                    ))}
                  </div>
                  <div style={{display: "flex", alignItems: "center", gap: "8px", padding: "5px 6px 5px 15px", borderRadius: "999px", background: "#EAEAE8"}}>
                    <input data-chatinput="1" type="text" onKeyDown={V.onChatKey} aria-label="Message Nafran Assist" placeholder="Type a message…" style={{flex: "1", minWidth: "0", height: "36px", border: "0", background: "transparent", fontSize: "13.5px", color: "#1C1C1C", outline: "none"}} />
                    <button type="button" onClick={V.sendChat} aria-label="Send" style={{display: "grid", placeItems: "center", width: "36px", height: "36px", border: "0", borderRadius: "999px", background: "#1C1C1C", color: "#F0F0F0", fontFamily: "inherit", fontSize: "14px", cursor: "pointer", flex: "none"}}>↑</button>
                  </div>
                  {shows(V.mailOpen) ? (
                    <>
                    <div style={{padding: "13px 14px", borderRadius: "16px", background: "#EAEAE8"}}>
                      <div style={{fontSize: "10.5px", fontWeight: "500", letterSpacing: ".16em", textTransform: "uppercase", color: "#555956"}}>Rather email?</div>
                      <div style={{display: "flex", flexWrap: "wrap", alignItems: "center", gap: "7px", marginTop: "9px"}}>
                        <input data-chatmail="1" type="email" aria-label="Your email" defaultValue="nafran@nafran.co" style={{flex: "1", minWidth: "132px", height: "38px", padding: "0 13px", border: "0", borderRadius: "999px", background: "#F5F5F4", fontSize: "13px", color: "#1C1C1C", outline: "none"}} />
                        <button type="button" onClick={V.sendMail} style={{display: "inline-flex", alignItems: "center", height: "38px", padding: "0 16px", border: "0", borderRadius: "999px", background: "#1C1C1C", color: "#F0F0F0", fontFamily: "inherit", fontSize: "12.5px", fontWeight: "500", cursor: "pointer"}}>Email transcript</button>
                      </div>
                      <p style={{margin: "9px 0 0", fontSize: "11.5px", lineHeight: "1.5", color: "#4A4F4B"}}>{V.mailNote}</p>
                    </div>
                    </>
                  ) : null}
                  <button type="button" onClick={V.toggleMail} style={{alignSelf: "flex-start", padding: "0", border: "0", background: "transparent", fontFamily: "inherit", fontSize: "12px", color: "#4A4F4B", textDecoration: "underline", cursor: "pointer"}}>{V.mailToggleLabel}</button>
                </div>
              </div>
              </>
            ) : null}
            {shows(V.toast) ? (
              <>
              <div style={{position: "fixed", left: "0", right: "0", bottom: "clamp(14px,3vh,32px)", zIndex: "110", display: "flex", justifyContent: "center", padding: "0 14px", pointerEvents: "none"}}>
                <div style={{display: "flex", alignItems: "center", gap: "11px", maxWidth: "520px", padding: "13px 18px", borderRadius: "999px", background: "#1C1C1C", color: "#F0F0F0", boxShadow: "0 24px 48px -24px rgba(28,28,28,.8)", animation: "lsPanelIn .35s cubic-bezier(.22,1,.36,1) both"}}>
                  <span aria-hidden="true" style={{width: "8px", height: "8px", borderRadius: "999px", background: "#C8D5BB", flex: "none", animation: "lsPulse 2s ease-in-out infinite"}}></span>
                  <span style={{fontSize: "13.5px", lineHeight: "1.45", textWrap: "pretty"}}>{V.toast}</span>
                </div>
              </div>
              </>
            ) : null}
            {shows(V.isStub) ? (
              <>
              <div style={{display: "flex", flexDirection: "column", alignItems: "flex-start", gap: "16px", padding: "clamp(40px,8vh,90px) 26px", borderRadius: "22px", background: "#F5F5F4"}}>
                <span style={{padding: "7px 15px", borderRadius: "999px", background: "#C8D5BB", fontSize: "12px", fontWeight: "500"}}>Not designed yet</span>
                <h1 style={{margin: "0", fontSize: "clamp(26px,3vw,44px)", lineHeight: "1.06", letterSpacing: "-.03em", fontWeight: "400"}}>{V.stubTitle}</h1>
                <p style={{margin: "0", maxWidth: "46ch", fontSize: "15px", lineHeight: "1.6", color: "#5A5F5C", textWrap: "pretty"}}>This section is in the navigation but has no screen yet. Tell me which one to build next and I'll design it in the same system.</p>
                <button type="button" onClick={V.goDashboard} style={{display: "inline-flex", alignItems: "center", gap: "10px", height: "46px", padding: "0 22px", border: "0", borderRadius: "999px", background: "#1C1C1C", color: "#F0F0F0", fontSize: "14px", fontWeight: "500", fontFamily: "inherit", cursor: "pointer"}}>Back to Dashboard</button>
              </div>
              </>
            ) : null}
            <footer data-status="1" style={{display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px", padding: "10px 18px", borderRadius: "999px", background: "#E5E5E5", fontSize: "11.5px", letterSpacing: ".06em", color: "#4A4F4B"}}>
              <span>LOCAL WORKSPACE</span><span aria-hidden="true">·</span><span>{V.sideStatus}</span>
              <span style={{marginLeft: "auto"}}>{V.buildLabel}</span>
            </footer>
          </div>
        </div>
      </div>
    </>
  )
}
