/** Only these local destinations can be offered by Assist; model text never becomes a URL. */
export const assistDestinations = {
  dashboard: {label:'Dashboard',view:'dashboard'}, maps: {label:'Google Maps',view:'maps'},
  social: {label:'Social Profiles',view:'social'}, email: {label:'Email Finder',view:'email'},
  phone: {label:'Phone Finder',view:'phone'},
  website: {label:'Website Lookup',view:'website'}, leads: {label:'All Leads',view:'leads'},
  lists: {label:'Saved Lists',view:'lists'}, runs: {label:'Run History',view:'runs'},
  reports: {label:'Reports',view:'dashboard'}, settings: {label:'Settings & Billing',view:'settings'},
  account: {label:'Account',view:'settings',tab:'acct'}, payment: {label:'Payment',view:'settings',tab:'pay'},
  invoices: {label:'Invoices',view:'settings',tab:'inv'}, updates: {label:'App updates',view:'settings',tab:'acct'},
} as const
export type AssistDestination = keyof typeof assistDestinations

function topics(text:string):AssistDestination[] {
  const result:AssistDestination[]=[]
  const add=(key:AssistDestination,pattern:RegExp)=>{if(pattern.test(text))result.push(key)}
  add('reports',/\breports?\b|\binsights?\b|رپورٹ|تقارير|informe|rapport/i)
  add('social',/\bsocial\b|facebook|instagram|linkedin|tiktok|youtube|سوشل/i)
  add('email',/\be-?mails?\b|\bgmail\b|ای\s*میل/i)
  add('phone',/\bphone\b|\btelephone\b|\bnumber\b|\bmobil[eo]\b|فون|نمبر/i)
  add('website',/website\s*lookup|site\s*lookup/i)
  add('maps',/google\s*maps?|\bmaps?\b|نقشہ/i)
  add('lists',/saved\s*lists?|\blists\b|محفوظ.*فہرست/i)
  add('leads',/all\s*leads|saved\s*leads/i)
  add('runs',/run\s*history|search\s*history/i)
  add('dashboard',/\bdashboard\b/i)
  add('updates',/app\s*updates?|auto[ -]?updates?|software\s*updates?|update\s*(?:kar|kro|karo)|اپڈیٹ/i)
  add('invoices',/\binvoices?\b|\breceipts?\b/i)
  add('account',/\baccount\b|activat\w*|license\s*key|licence\s*key/i)
  add('payment',/\bpayment\b|card\s*details|billing\s*portal/i)
  if(!result.some(key=>['updates','invoices','account','payment'].includes(key)))add('settings',/\bsettings?\b|\bbilling\b|\btrial\b|\blifetime\b|\bsubscrib\w*\b|\bplan\b/i)
  return result
}

export function assistShortcuts(question:string,answer:string,currentPage:string):AssistDestination[] {
  if(/decision[ -]?makers?|owner.{0,30}(?:email|gmail)|(?:email|gmail).{0,30}owner/i.test(question))return []
  const requested=topics(question),described=topics(answer)
  // Explicit user topics take priority over incidental module names in the explanation.
  if(requested.includes('reports'))return ['reports']
  if(requested.length)return requested.slice(0,3)
  if(described.length)return described.slice(0,3)
  if(/\b(export|history|scan|import|validity)\b/i.test(question) && currentPage in assistDestinations)return [currentPage as AssistDestination]
  if(/\bwebsites?\b|\burls?\b/i.test(question))return ['website']
  return []
}
