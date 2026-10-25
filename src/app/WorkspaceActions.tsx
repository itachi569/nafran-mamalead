import type { AppValues } from './useAppValues'
import type { CSSProperties } from 'react'

const button: CSSProperties = { border: 0, borderRadius: 999, padding: '12px 20px', background: '#1c1c1c', color: '#fff', cursor: 'pointer', font: 'inherit' }
const light: CSSProperties = { ...button, background: '#e7ebdf', color: '#1c1c1c' }
const field: CSSProperties = { padding: 12, border: '1px solid #d9ddd4', borderRadius: 12, background: '#f5f5f4', color: '#1c1c1c', font: 'inherit', maxWidth: '100%' }

export function WorkspaceDialogs({ V }: { V: AppValues }) {
  if (!V.mapsPrompt && !V.reportsOpen) return null
  const close = V.reportsOpen ? V.closeReports : V.closeMapsPrompt
  return <div style={{position:'fixed',inset:0,zIndex:110,background:'#0008',display:'grid',placeItems:'center',padding:24}} onClick={e=>{if(e.target===e.currentTarget)close()}}>
    <section role="dialog" aria-modal="true" aria-labelledby="workspace-dialog-title" style={{width:'100%',maxWidth:V.reportsOpen ? 820 : 650,maxHeight:'90vh',overflow:'auto',padding:32,borderRadius:26,background:'#f5f5f4',color:'#1c1c1c',boxShadow:'0 30px 100px #0004'}}>
      <button onClick={close} aria-label="Close dialog" style={{...light,float:'right'}}>×</button>
      <p style={{color:'#66765a',fontSize:12,letterSpacing:'.15em'}}>MAMALEAD</p>
      <h2 id="workspace-dialog-title">{V.reportsOpen ? 'Insights / Reports' : V.mapsPrompt==='google' ? 'Choose how to open Google Maps' : V.mapsPrompt==='license' ? 'Choose your MamaLead access' : 'Stop this scan?'}</h2>
      {V.mapsPrompt==='google' && <>
        <p style={{lineHeight:1.7}}>MamaLead uses its own Google browser profile. If you sign in, enter your password directly on Google. You can also scan in a private guest session.</p>
        {V.mapsGoogleConnected && <p style={{padding:'12px 16px',borderRadius:14,background:'#e7ebdf'}}>Your Google account is already connected. Continue with that account without signing in again.</p>}
        <div style={{display:'flex',gap:12,flexWrap:'wrap'}}>
          <button style={button} onClick={V.runGoogle}>{V.mapsGoogleConnected ? 'Continue with Google' : 'Sign in with Google'}</button>
          <button style={light} onClick={V.runGuest}>Continue without sign-in</button>
        </div>
        <label style={{display:'flex',alignItems:'flex-start',gap:12,padding:18,marginTop:20,border:'1px solid #d9ddd4',borderRadius:18,cursor:'pointer'}}>
          <input type="checkbox" checked={V.swBrowser==='1'} onChange={V.toggleBrowser} style={{width:20,height:20,marginTop:2,accentColor:'#1c1c1c',flexShrink:0}}/>
          <span><strong style={{display:'block',fontWeight:500}}>Show the browser window</strong><span style={{display:'block',marginTop:6,fontSize:13,lineHeight:1.6,color:'#5A5F5C'}}>Watch Google Maps while it scans. Turn off to scan in the background. If Google needs you to sign in, its window always opens.</span></span>
        </label>
      </>}
      {V.mapsPrompt==='license' && <><p>Start your 1-day free trial or activate Lifetime access to use MamaLead features.</p><div style={{display:'flex',gap:12,flexWrap:'wrap'}}><button style={button} onClick={V.startTrial}>Get my 1-day trial</button><button style={light} onClick={V.getLifetimeKey}>Get Lifetime key</button></div><button style={{border:0,background:'transparent',color:'#4A4F4B',font:'inherit',textDecoration:'underline',cursor:'pointer',padding:'18px 0 0'}} onClick={V.activateExistingKey}>I already have a key</button></>}
      {V.mapsPrompt==='stop' && <><p>Captured leads will be kept. The remaining search will be cancelled.</p><button style={button} onClick={V.confirmStop}>Yes, stop scan</button><button style={{...light,marginLeft:10}} onClick={close}>Keep scanning</button></>}
      {V.reportsOpen && <>
        <p style={{lineHeight:1.6,color:'#5a5f5c'}}>Your all-time overview of records currently saved on this device. A business can have more than one Decision Maker.</p>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12,margin:'18px 0'}}><span style={{fontSize:12,letterSpacing:'.1em',color:'#66765a'}}>ALL TIME · SAVED DATA</span><button style={light} disabled={V.reportsLoading} onClick={V.refreshReports}>{V.reportsLoading ? 'Refreshing…' : 'Refresh report'}</button></div>
        {V.reportsLoading ? <p role="status">Loading your saved totals…</p> : V.reportsError ? <p role="alert">{V.reportsError}</p> : <>
          <div style={{display:'grid',gridTemplateColumns:'repeat(2,minmax(0,1fr))',gap:12}}>
            {V.reportCounts.map((item,index)=><div key={item.label} data-report-stat={item.label} style={{padding:index<2?24:18,borderRadius:20,background:index===0?'#1c1c1c':index===1?'#c8d5bb':'#e9ece5',color:index===0?'#f5f5f4':'#1c1c1c'}}><strong data-report-value="1" style={{fontSize:index<2?40:26,fontWeight:500,display:'block',fontVariantNumeric:'tabular-nums',marginBottom:8}}>{item.value.toLocaleString()}</strong><span style={{fontSize:14}}>{item.label}</span></div>)}
          </div>
          <p style={{fontSize:12,lineHeight:1.6,color:'#5a5f5c'}}>Lead totals count saved businesses once. Decision Makers count saved named contacts. Contact categories can overlap.</p>
          <details style={{margin:'20px 0'}}><summary style={{cursor:'pointer',fontWeight:500}}>Search history</summary>{V.mapsRunOptions.length ? <ul style={{paddingLeft:20,maxHeight:220,overflow:'auto'}}>{V.mapsRunOptions.map(run=><li key={run.id}><button style={{...light,marginBottom:6,textAlign:'left'}} onClick={()=>{V.closeReports();V.goMaps();void V.selectMapsRun(run.id)}}>{run.label}</button></li>)}</ul> : <p>No searches saved yet.</p>}</details>
          <button style={button} onClick={()=>{close();V.openExpAll()}}>Export saved leads</button>
        </>}
      </>}
    </section>
  </div>
}

export function ScanReturn({V}:{V:AppValues}) {
  if (!V.runReturnVisible) return null
  return <button type="button" data-scan-return="1" onClick={V.restoreRun} style={{...button,position:'fixed',right:24,bottom:92,zIndex:79,maxWidth:'calc(100vw - 48px)',borderRadius:20,padding:'16px 24px',textAlign:'left',boxShadow:'0 12px 35px #0003'}}>
    <strong style={{display:'block',fontWeight:500}}>{V.running ? 'Back to scan' : 'View scan results'} <span aria-hidden="true">↗</span></strong>
    <span style={{display:'block',fontSize:12,color:'#c8d5bb',marginTop:5}}>{V.running ? 'Scan is still running' : 'Scan has ended'} · {V.foundLabel}</span>
  </button>
}

export function WebsiteFilter({V}:{V:AppValues}) {
  return <label style={{display:'grid',gap:6,fontSize:13}}>Website status<select aria-label="Website status" style={field} value={V.mapsWebsite} onChange={e=>V.setMapsWebsite(e.target.value)}><option value="any">Any website status</option><option value="has">Has website</option><option value="none">No website</option></select></label>
}

export function MapsResults({V}:{V:AppValues}) {
  return <div data-maps-results-table="1">
    <div style={{display:'flex',flexWrap:'wrap',gap:12,alignItems:'end',margin:'18px 0'}}>
      <label style={{display:'grid',gap:6,fontSize:13}}>Search / Run history<select disabled={V.running} aria-label="Search / Run history" style={field} value={V.mapsRunId} onChange={e=>void V.selectMapsRun(e.target.value)}><option value="latest">Latest search</option>{V.mapsRunOptions.map(run=><option key={run.id} value={run.id}>{run.label}</option>)}</select></label>
      <WebsiteFilter V={V}/>
      <select style={field} aria-label="Send selected leads to" value="" disabled={!V.mapsSelected.length} onChange={e=>V.sendMapsTo(e.target.value)}><option value="">Send {V.mapsSelected.length || ''} selected leads to…</option><option value="social">Social Profiles</option><option value="email">Email Finder</option><option value="phone">Phone Finder</option><option value="dm">Decision Makers</option></select>
      {V.running && <button style={light} onClick={V.restoreRun}>Show scanning progress</button>}
    </div>
    <div style={{overflowX:'auto'}}><table style={{width:'100%',borderCollapse:'collapse',minWidth:850,textAlign:'left',fontSize:13}}><thead><tr>{['Select','Business name','Website','Address','Phone / Email','Rating'].map(label=><th style={{padding:'14px 10px',borderBottom:'1px solid #d9ddd4',fontWeight:500}} key={label}>{label==='Select'?<input type="checkbox" aria-label="Select all results" checked={V.mapsRows.length>0 && V.mapsRows.every(row=>V.mapsSelected.includes(row.id))} onChange={V.selectAllMaps}/>:label}</th>)}</tr></thead><tbody>{V.mapsRows.map(row=><tr key={row.id} data-row="1">{[<input type="checkbox" aria-label={`Select ${row.name}`} checked={V.mapsSelected.includes(row.id)} onChange={()=>V.toggleMapsLead(row.id)}/>,<strong>{row.name}</strong>,row.website?<a href={row.website} target="_blank" rel="noreferrer">{row.domain}</a>:'No website',row.address,<>{row.phone}<br/>{row.email}</>,row.rating].map((cell,index)=><td key={index} style={{padding:'16px 10px',verticalAlign:'top',borderBottom:'1px solid #e3e5df',maxWidth:240,overflowWrap:'anywhere'}}>{cell}</td>)}</tr>)}</tbody></table>{V.mapsState && <p>{V.mapsState}</p>}</div>
  </div>
}

export function ImportSources({V}:{V:AppValues}) {
  return <div style={{display:'flex',gap:12,flexWrap:'wrap',marginTop:18}}><label style={light}>Import CSV<input aria-label="Import website CSV" type="file" accept=".csv,text/csv" style={{display:'block',maxWidth:230,marginTop:8}} onChange={e=>{const file=e.target.files?.[0];if(file)void V.importCsvFile(file)}}/></label><label style={{display:'grid',gap:6,fontSize:13}}>Use a Google Maps run<select style={field} aria-label="Import from Maps run" defaultValue="" onChange={e=>void V.importSavedRun(e.target.value)}><option value="">Choose a saved run…</option>{V.mapsRunOptions.map(run=><option key={run.id} value={run.id}>{run.label}</option>)}</select></label></div>
}

export function DecisionResults({V}:{V:AppValues}) {
  const small: CSSProperties={display:'block',fontSize:11,color:'#66765a',margin:'8px 0 4px'}
  return <div style={{overflowX:'auto',marginTop:18}}>
    <p role="status">{V.fDm.scanning ? 'Reading websites → following team/contact pages → collecting published people and contact details…' : 'Scan complete. Direct contacts and website contacts are labelled separately. Missing details stay blank.'}</p>
    <table style={{width:'100%',minWidth:1250,borderCollapse:'collapse',textAlign:'left',fontSize:13}}>
      <thead><tr>{['Person / Role','Business','Email addresses','Phone numbers','Business address','Published social links','Source'].map(label=><th key={label} style={{padding:12,borderBottom:'1px solid #d8ded2',fontWeight:500}}>{label}</th>)}</tr></thead>
      {V.fDm.rows.map(site=><tbody key={site.leadId} data-scanrow={site.pill}>
        {V.dmRows.filter(person=>person.leadId===site.leadId).map(person=><tr data-person="1" key={person.id}>
          {[
            <><strong>{person.name}</strong><br/>{person.title}</>,
            <><strong>{person.lead}</strong><br/>{person.domain}</>,
            <>{person.email && <><span style={small}>Direct</span><a href={`mailto:${person.email}`}>{person.email}</a></>}{person.businessEmails.length>0 && <><span style={small}>Website contacts</span>{person.businessEmails.map(email=><a key={email} style={{display:'block',marginBottom:5}} href={`mailto:${email}`}>{email}</a>)}</>}{!person.email && !person.businessEmails.length && 'Not published'}</>,
            <>{person.phone && <><span style={small}>Direct</span><a href={`tel:${person.phone}`}>{person.phone}</a></>}{person.businessPhones.length>0 && <><span style={small}>Website contacts</span>{person.businessPhones.map(phone=><a key={phone} style={{display:'block',marginBottom:5}} href={`tel:${phone}`}>{phone}</a>)}</>}{!person.phone && !person.businessPhones.length && 'Not published'}</>,
            person.address || 'Not published',
            person.socialLinks.length ? person.socialLinks.map(url=><a key={url} href={url} target="_blank" rel="noreferrer" style={{display:'block',marginBottom:8}}>{url.replace(/^https?:\/\/(?:www\.)?/i,'')}</a>) : 'Not published',
            /^https?:/.test(person.source)?<a href={person.source} target="_blank" rel="noreferrer">View source ↗</a>:person.source,
          ].map((cell,index)=><td key={index} style={{padding:12,borderBottom:'1px solid #e2e5de',maxWidth:240,overflowWrap:'anywhere',verticalAlign:'top',whiteSpace:index===4?'pre-line':undefined}}>{cell}</td>)}
        </tr>)}
        {!V.dmRows.some(person=>person.leadId===site.leadId) && <tr><td colSpan={7} style={{padding:12}}>{site.domain} · {site.scanning?'Reading website…':'No named contact published'}</td></tr>}
      </tbody>)}
    </table>
    {V.dmMoreContactsOn && <button style={{...light,marginTop:12}} onClick={V.showAllDmContacts}>{V.dmShowAllLabel}</button>}
  </div>
}
