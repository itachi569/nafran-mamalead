import type {AssistMessage} from './assist'

const guide='\n\n[Import websites > Paste links / Upload a file (CSV/TSV) / From a Maps run > Scan N sites starts scanning. Search filters saved data. Email Finder: one published main email; validity checks this import. Export: Excel/PDF. Keys: Settings & Billing.]'
const style='\n\n[Decision Makers / owner-email lookup is unavailable in this desktop build. Never offer that page, a pass, or owner lookup. Available modules: Maps, Social Profiles, Email Finder (main business email), Phone Finder, Website Lookup. Reply in 1-3 short sentences, under 60 words; plain text. Explain purpose if asked what, steps if asked how. Name the relevant app page for its link. Do not invent controls or claim actions. Reports is the Insights / Reports card on Dashboard, not a tab.]'

/** Keep older connected servers aware of this desktop's controls without changing billing facts. */
export function assistMessagesWithWorkflowHint(messages:AssistMessage[]):AssistMessage[]{
 const last=messages.at(-1)
 if(!last||last.role!=='user')return messages
 const needsGuide=/email|phone|social|decision|website|lookup|import|export|scan|scrap|leads?|settings|billing|trial|lifetime/i.test(last.content)
 const hint=(needsGuide && last.content.length+guide.length+style.length<=1200?guide:'')+style
 return [...messages.slice(0,-1),{...last,content:last.content.slice(0,1200-hint.length)+hint}]
}
