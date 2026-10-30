import { parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js/max'

const pakistanAreas: Record<string,string> = { '42':'Lahore', '21':'Karachi', '51':'Islamabad / Rawalpindi', '41':'Faisalabad', '61':'Multan', '91':'Peshawar', '81':'Quetta', '52':'Sialkot', '55':'Gujranwala', '22':'Hyderabad', '62':'Bahawalpur', '48':'Sargodha', '71':'Sukkur' }

export function phoneInfo(value: string, context = '') {
  const region: CountryCode | undefined = /pakistan|lahore|karachi|islamabad|\.pk\b/i.test(context) ? 'PK' : /united kingdom|manchester|london|\.uk\b/i.test(context) ? 'GB' : undefined
  const raw = value.trim().replace(/^00/, '+')
  const parsed = parsePhoneNumberFromString(raw, region)
  if(!parsed || !parsed.isPossible())return {number:value.trim(),mobile:false,country:undefined,area:''}
  const mobile = parsed.getType() === 'MOBILE'
  const pkArea = Object.keys(pakistanAreas).find(code => parsed.nationalNumber.startsWith(code))
  return { number: parsed.number, mobile, country: parsed.country, area: parsed.country === 'PK' ? (mobile ? 'PK mobile' : pkArea ? `0${pkArea}` : 'PK landline') : parsed.country === 'GB' ? (mobile ? 'UK mobile' : '0'+parsed.nationalNumber.slice(0,3)) : '+'+parsed.countryCallingCode, city: parsed.country === 'PK' && !mobile && pkArea ? pakistanAreas[pkArea] : '' }
}
