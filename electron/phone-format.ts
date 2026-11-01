import { parsePhoneNumberFromString, getCountries, type CountryCode } from 'libphonenumber-js/max'

const pakistanAreas: Record<string,string> = { '42':'Lahore', '21':'Karachi', '51':'Islamabad / Rawalpindi', '41':'Faisalabad', '61':'Multan', '91':'Peshawar', '81':'Quetta', '52':'Sialkot', '55':'Gujranwala', '22':'Hyderabad', '62':'Bahawalpur', '48':'Sargodha', '71':'Sukkur' }

const countryCodes=new Set<string>(getCountries())
export function phoneCountry(context:string):CountryCode|undefined {
  const structured=context.match(/addressCountry["'\s:]+([A-Z]{2})\b/)?.[1]
  if(structured && countryCodes.has(structured))return structured as CountryCode
  const host=context.match(/https?:\/\/([^\s/"'<>]+)/i)?.[1]
  const tld=host?.split(':')[0].split('.').pop()?.toUpperCase()
  if(tld==='UK')return 'GB'
  // These country domains are widely used by businesses in other countries.
  if(tld && !['IO','CO','AI','ME','TV','CC','LY','FM','TO','SH','SO','GG','IM'].includes(tld) && countryCodes.has(tld))return tld as CountryCode
  const countries:[RegExp,CountryCode][]=[
    [/pakistan|lahore|karachi|islamabad|rawalpindi|\.pk\b/i,'PK'],
    [/united kingdom|great britain|manchester|london|\.uk\b/i,'GB'],
    [/united states|\bUSA\b|new york|california/i,'US'],
    [/\bcanada\b|toronto|vancouver/i,'CA'],[/\baustralia\b|sydney|melbourne/i,'AU'],
    [/\bindia\b|mumbai|new delhi/i,'IN'],[/united arab emirates|\bUAE\b|dubai/i,'AE'],
    [/germany|deutschland|berlin/i,'DE'],[/\bfrance\b|\bparis\b/i,'FR']
  ]
  const location=countries.find(([pattern])=>pattern.test(context))?.[1]
  if(location)return location
  const published=new Set<CountryCode>()
  for(const match of context.matchAll(/(?:tel:|(?:telephone|phone)["'\s:=\[]+)(\+[\d ().-]{7,}|00\d[\d ().-]{6,})/gi)){
    const raw=match[1].replace(/^00/,'+').replace(/\(0\)/g,'').replace(/[^+\d]/g,'').replace(/^\+920/,'+92').replace(/^\+440/,'+44')
    const phone=parsePhoneNumberFromString(raw)
    if(phone?.isValid()&&phone.country)published.add(phone.country)
  }
  return published.size===1?[...published][0]:undefined
}

/** Canonicalize a published number, without inventing a country for ambiguous national numbers. */
export function normalizePhone(raw:string,context=''):string {
  let value=raw.trim().replace(/^tel:/i,'')
  try{value=decodeURIComponent(value)}catch{return ''}
  value=value.split(/[;?]/)[0].replace(/\s*(?:ext\.?|extension|x)\s*\d+\s*$/i,'').trim()
  if(/^\d{1,3}(?:\.\d{1,3}){3}$/.test(value)&&value.split('.').every(part=>Number(part)<=255))return ''
  if(!/^[+\d\s().-]+$/.test(value))return ''
  value=value.replace(/^00/,'+').replace(/\(0\)/g,'').replace(/[^+\d]/g,'')
  const digits=value.replace(/\D/g,'')
  if(digits.length<7||digits.length>15)return ''
  const region=phoneCountry(context)
  if(!value.startsWith('+') && /^(?:92[1-9]\d{8,9})$/.test(value) && (!region||region==='PK'))value='+'+value
  // Some sites mistakenly retain the national trunk zero after the country code.
  value=value.replace(/^\+920/,'+92').replace(/^\+440/,'+44')
  if(!value.startsWith('+')&&!region)return digits.length>=9?value:''
  const parsed=parsePhoneNumberFromString(value,region)
  return parsed?.isValid()?String(parsed.number):''
}

export function phoneInfo(value: string, context = '') {
  const canonical=normalizePhone(value,context)
  const parsed=canonical?parsePhoneNumberFromString(canonical,phoneCountry(context)):undefined
  if(!parsed || !parsed.isValid())return {number:canonical || value.trim(),mobile:false,country:undefined,area:''}
  const mobile = parsed.getType() === 'MOBILE'
  const pkArea = Object.keys(pakistanAreas).find(code => parsed.nationalNumber.startsWith(code))
  return { number: parsed.number, mobile, country: parsed.country, area: parsed.country === 'PK' ? (mobile ? 'PK mobile' : pkArea ? `0${pkArea}` : 'PK landline') : parsed.country === 'GB' ? (mobile ? 'UK mobile' : '0'+parsed.nationalNumber.slice(0,3)) : '+'+parsed.countryCallingCode, city: parsed.country === 'PK' && !mobile && pkArea ? pakistanAreas[pkArea] : '' }
}
