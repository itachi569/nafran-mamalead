import type {AssistMessage} from './assist'
import {isSupportContactQuestion} from './assist-navigation'

const guide='\n\n[Import websites > Paste links / Upload a file (CSV/TSV) / From a Maps run > Scan N sites starts scanning. Search filters saved data. Email Finder: one published main email; validity checks this import. Export: Excel/PDF. Keys: Settings & Billing.]'
const supportGuide='\n\n[Contacting MamaLead: use Settings & Billing > Account > Help & support. It opens an in-app message form. The Contact Support link below your answer opens that form. Do not claim our email/phone details are listed there. Never invent contact details or suggest Email Finder/Phone Finder to contact our team.]'
const style='\n\n[Decision Makers/owner lookup and passes are unavailable; never offer them. Reply in 1-3 short sentences, under 60 words, plain text. Explain purpose for what, steps for how. Name the relevant page for its link; never invent controls or claim actions. Reports opens from Dashboard Insights / Reports.]'

/** Keep older connected servers aware of this desktop's controls without changing billing facts. */
export function assistMessagesWithWorkflowHint(messages:AssistMessage[]):AssistMessage[]{
 const last=messages.at(-1)
 if(!last||last.role!=='user')return messages
 const needsGuide=/email|phone|social|decision|website|lookup|import|export|scan|scrap|leads?|settings|billing|trial|lifetime/i.test(last.content)
 const workflow=isSupportContactQuestion(last.content)?supportGuide:needsGuide?guide:''
 const hint=(last.content.length+workflow.length+style.length<=1200?workflow:'')+style
 return [...messages.slice(0,-1),{...last,content:last.content.slice(0,1200-hint.length)+hint}]
}
