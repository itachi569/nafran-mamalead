/** A staff role alone does not establish ownership. */
export function isBusinessOwner(title: string): boolean {
  return !/\b(?:former|previous|ex[- ]|retired)\b/i.test(title) && /\b(?:co[- ]?owner|owner|co[- ]?founder|founder|proprietor|founding (?:attorney|partner|director|member))\b/i.test(title)
}

/** Initials/honorifics do not create a second identity for the same fully named owner. */
export function ownerIdentityKey(fullName:string):string{
  return fullName.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\b(?:co[- ]?)?(?:founder|owner|ceo|director)\s*$/i,'').split(/[^a-z]+/).filter(part=>part.length>1 && !['mr','mrs','ms','dr','prof','doctor'].includes(part)).join(' ')
}

/** Only retain a published mailbox whose local part identifies this named person. */
export function ownerEmail(fullName: string, email: string): string {
  const value = email.trim().toLowerCase().replace(/^mailto:/, '').split('?')[0]
  if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/.test(value)) return ''
  const local = value.split('@')[0].split('+')[0]
  if (/^(?:info|hello|hi|contact|mail|email|enquir(?:y|ies)|admin|office|reception|frontdesk|team|help|support|sales|notice|notices|legal|privacy|compliance|billing|accounts|careers|jobs|marketing|press|webmaster|no[-_.]?reply)(?:[._-]|$)/i.test(local)) return ''
  const key = local.replace(/[^a-z]/g, '')
  const names = fullName.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().split(/[^a-z]+/).filter(part=>part.length >= 3 && !['mrs','miss','prof','doctor'].includes(part))
  return names.some(name=>key.includes(name)) ? value : ''
}

/** Preserve a contact whose personal-page authorship was checked by discovery.
 * Old/unverified company inboxes never gain this exception from their domain alone. */
export function sourcedOwnerEmail(fullName:string,email:string,evidence:string,source:string):string{
 const named=ownerEmail(fullName,email)
 if(named)return named
 if(evidence!=='personal-page')return ''
 const value=email.trim().toLowerCase()
 if(!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/.test(value) || /^(?:support|sales|privacy|legal|billing|no.?reply)@/i.test(value))return ''
 try{
  const url=new URL(source),host=url.hostname.replace(/^www\./i,'')
  return /^https?:$/.test(url.protocol) && value.split('@')[1]===host && ownerIdentityKey(fullName).split(' ').some(part=>part.length>=4 && host.split('.')[0].includes(part))?value:''
 }catch{return ''}
}
