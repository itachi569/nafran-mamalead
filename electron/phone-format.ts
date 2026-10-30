import { parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js/max'

export function phoneInfo(value: string, context = '') {
  const region: CountryCode | undefined = /pakistan|lahore|karachi|islamabad|\.pk\b/i.test(context) ? 'PK' : /united kingdom|manchester|london|\.uk\b/i.test(context) ? 'GB' : undefined
  const raw = value.trim().replace(/^00/, '+')
  const parsed = parsePhoneNumberFromString(raw, region)
  if(!parsed || !parsed.isPossible())return {number:value.trim(),mobile:false,country:undefined,area:''}
  return { number: parsed.number, mobile: parsed.getType() === 'MOBILE', country: parsed.country, area: parsed.country === 'PK' ? (parsed.getType()==='MOBILE' ? 'PK mobile' : '+92') : parsed.country === 'GB' ? (parsed.getType()==='MOBILE' ? 'UK mobile' : '0'+parsed.nationalNumber.slice(0,3)) : '+'+parsed.countryCallingCode }
}
