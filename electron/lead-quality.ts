/** Transparent completeness score; a phone/website alone must never imply a verified lead. */
export function contactQuality(lead: {name?:string;website?:string;phone?:string;address?:string;rating?:number|null;reviewCount?:number|null;review_count?:number|null;has_email?:number;has_social?:number;verified_email?:number}): number {
  let score = lead.name?.trim() ? 5 : 0
  if (lead.website?.trim()) score += 15
  if ((lead.phone?.replace(/\D/g,'').length ?? 0) >= 9) score += 20
  if (lead.address?.trim()) score += 10
  if (lead.has_email) score += 15
  if (lead.verified_email) score += 15
  if (lead.has_social) score += 10
  if ((lead.rating ?? 0) >= 4) score += 5
  if ((lead.reviewCount ?? lead.review_count ?? 0) >= 20) score += 5
  return Math.min(100,score)
}
