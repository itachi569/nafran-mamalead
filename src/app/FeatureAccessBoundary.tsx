import type { ReactNode, SyntheticEvent } from 'react'

/** One interaction gate for every feature page; navigation and billing sit outside it. */
export function FeatureAccessBoundary({ children, allowed, onBlocked }: {
  children: ReactNode
  allowed: () => boolean
  onBlocked: () => void
}) {
  const guard = (event: SyntheticEvent) => {
    if (!(event.target instanceof Element) || !event.target.closest('button, a, input, textarea, select, [role="button"]') || allowed()) return
    event.preventDefault()
    event.stopPropagation()
    onBlocked()
  }
  return <div data-feature-access="1" style={{ display: 'contents' }} onClickCapture={guard} onPointerDownCapture={guard} onFocusCapture={event=>{if(!allowed() && event.target instanceof HTMLElement){event.target.blur();guard(event)}}}
    onKeyDownCapture={event => { if (event.key !== 'Tab' && event.key !== 'Escape') guard(event) }}
    onSubmitCapture={event => {
      if (allowed()) return
      event.preventDefault(); event.stopPropagation(); onBlocked()
    }}>
    {children}
  </div>
}
