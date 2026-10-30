import type { ReactNode, SyntheticEvent } from 'react'

/** One interaction gate for every feature page; navigation and billing sit outside it. */
export function FeatureAccessBoundary({ children, allowed, onBlocked, showLock=false }: {
  children: ReactNode
  showLock?:boolean
  allowed: () => boolean
  onBlocked: () => void
}) {
  const guard = (event: SyntheticEvent) => {
    if (!(event.target instanceof Element) || !event.target.closest('button, a, input, textarea, select, [role="button"]') || allowed()) return
    event.preventDefault()
    event.stopPropagation()
    onBlocked()
  }
  const locked=showLock && !allowed()
  return <>{locked && <section data-license-lock="1" role="status" style={{padding:24,marginBottom:20,borderRadius:24,background:'#DDE3D6'}}>
    <h2 style={{margin:'0 0 8px'}}>Activate MamaLead to start a search</h2>
    <p>Start your 1-day trial or activate Lifetime access. Your saved data stays on this computer.</p>
    <button type="button" onClick={onBlocked} style={{padding:'12px 20px',background:'#1C1C1C',color:'#fff',border:0,borderRadius:30}}>Activate / Start trial</button>
  </section>}<div data-feature-access="1" style={{ display: 'contents' }} onClickCapture={guard} onPointerDownCapture={guard} onFocusCapture={event=>{if(!allowed() && event.target instanceof HTMLElement){event.target.blur();guard(event)}}}
    onKeyDownCapture={event => { if (event.key !== 'Tab' && event.key !== 'Escape') guard(event) }}
    onSubmitCapture={event => {
      if (allowed()) return
      event.preventDefault(); event.stopPropagation(); onBlocked()
    }}>
    {locked ? <fieldset disabled style={{display:'contents',border:0,padding:0,margin:0}}>{children}</fieldset> : children}
  </div></>
}
