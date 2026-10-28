import type {AssistMessage} from './assist'

const guide='\n\n[Current MamaLead desktop controls: In Email Finder, Phone Finder, Social Profiles or Decision Makers, click "Import websites", choose "Paste links", "Upload a file" (CSV/TSV), or "From a Maps run", then "Scan N sites". The scan starts automatically; do not invent a Run/Search/Find Emails button. The search bar filters saved results only. Email Finder returns one main email actually published on the company website, never guessed; validity checks the current import only. Export offers Excel/PDF. Trial and Lifetime activation are in Settings & Billing.]'

/** Keep older connected servers aware of this desktop's controls without changing billing facts. */
export function assistMessagesWithWorkflowHint(messages:AssistMessage[]):AssistMessage[]{
 const last=messages.at(-1)
 if(!last||last.role!=='user'||!/email|phone|social|decision|website|lookup|import|export|scan|scrap|leads?|settings|billing|trial|lifetime/i.test(last.content))return messages
 return [...messages.slice(0,-1),{...last,content:last.content.slice(0,1200-guide.length)+guide}]
}
