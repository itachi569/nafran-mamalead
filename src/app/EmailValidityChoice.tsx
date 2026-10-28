import './email-validity-choice.css'

export function EmailValidityChoice({enabled,disabled,onToggle}:{enabled:boolean;disabled?:boolean;onToggle:()=>void}) {
  return <div className="email-validity-choice" data-email-validity-choice="1">
    <div><strong>Verify found emails</strong><p>Check email validity after this scan, or leave it off and check the results later.</p></div>
    <button type="button" role="switch" aria-label="Verify found emails" aria-checked={enabled} disabled={disabled} onClick={onToggle}><span>{enabled?'On':'Off'}</span><i aria-hidden="true"/></button>
  </div>
}
