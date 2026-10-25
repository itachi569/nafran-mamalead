/** The same compact format picker is used by every general export entry point. */
export function ExportDialog({ title, summary, busy, empty, social = false, onExport, onClose }: {
  title: string
  summary: string
  busy: boolean
  empty: boolean
  social?: boolean
  onExport: (format: 'xlsx' | 'pdf') => void
  onClose: () => void
}) {
  const close = () => { if (!busy) onClose() }
  return <div data-export-backdrop={social ? undefined : '1'} data-profile-export-backdrop={social ? '1' : undefined} onClick={event => { if (event.target === event.currentTarget) close() }} style={{position:'fixed',inset:0,zIndex:90,display:'grid',placeItems:'center',padding:'clamp(14px,3vw,32px)',background:'rgba(28,28,28,.62)',animation:'lsScrimIn .35s linear both'}}>
    <section role="dialog" aria-modal="true" aria-label={title} style={{width:'100%',maxWidth:520,padding:'clamp(22px,3vw,32px)',borderRadius:26,background:'#F5F5F4',boxShadow:'0 40px 80px -40px rgba(28,28,28,.8)',animation:'lsPanelIn .5s cubic-bezier(.22,1,.36,1) both'}}>
      <h2 style={{margin:0,fontSize:'clamp(20px,2.2vw,26px)',fontWeight:400,letterSpacing:'-.02em'}}>{title}</h2>
      <p style={{margin:'7px 0 0',fontSize:13.5,lineHeight:1.55,color:'#5A5F5C'}}>{summary}</p>
      <div style={{display:'flex',flexWrap:'wrap',gap:10,marginTop:24}}>
        {(['xlsx','pdf'] as const).map(format => <button key={format} type="button" disabled={busy || empty} onClick={() => onExport(format)} data-export-format={social ? undefined : format} data-profile-export={social ? format : undefined} style={{display:'inline-flex',alignItems:'center',justifyContent:'center',gap:9,height:44,padding:'0 20px',border:0,borderRadius:999,background:format==='xlsx'?'#1C1C1C':'#E5E5E5',color:format==='xlsx'?'#F0F0F0':'#1C1C1C',fontFamily:'inherit',fontSize:13.5,fontWeight:500,cursor:busy || empty?'default':'pointer',opacity:busy || empty?0.5:1}}>{format==='xlsx'?'Excel (.xlsx)':'PDF (.pdf)'}</button>)}
        <button type="button" disabled={busy} onClick={close} data-profile-export-cancel={social?'1':undefined} style={{height:44,padding:'0 20px',border:0,borderRadius:999,background:'transparent',color:'#4A4F4B',fontFamily:'inherit',fontSize:13.5,cursor:'pointer'}}>Cancel</button>
      </div>
      {busy && <p role="status" style={{margin:'14px 0 0',fontSize:13,color:'#5A5F5C'}}>Choose a save location to finish exporting…</p>}
    </section>
  </div>
}
