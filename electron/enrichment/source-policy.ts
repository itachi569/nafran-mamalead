import {cleanWebsiteUrl} from '../website-domain'
// A directory's shared footer belongs to the directory, not the business being researched.
const directories = ['oladoc.com', 'marham.pk', 'practo.com', 'yelp.com', 'yellowpages.com', 'yellowpages.com.pk', 'justdial.com', 'healthgrades.com', 'zocdoc.com', 'tripadvisor.com']
export const SOCIAL_HOSTS = ['youtube.com','youtu.be','facebook.com','fb.com','fb.me','instagram.com','wa.me','whatsapp.com','linktr.ee','tiktok.com','x.com','twitter.com','linkedin.com']
export function socialWebsite(value:string):boolean {
  try {const host=new URL(cleanWebsiteUrl(value) || value).hostname.toLowerCase();return SOCIAL_HOSTS.some(domain=>host===domain||host.endsWith('.'+domain))}catch{return false}
}
export function directoryScanError(website: string): string | null {
  try {
    const host = new URL(cleanWebsiteUrl(website) || website).hostname.toLowerCase().replace(/^www\./, '')
    if(socialWebsite(website))return 'This is a social profile, not the business website. Its link is kept under Social Profiles; add the business’s own website to scan its contacts.'
    if(['lovable.app','github.io','wixsite.com'].includes(host))return 'Use the business’s full hosted website address, including its subdomain.'
    if (directories.some(domain => host === domain || host.endsWith('.' + domain))) return 'This is a directory listing. Use the business’s own website to find its contacts; directory-wide contacts were not imported.'
  } catch { return 'This website URL is invalid. Check it and retry.' }
  return null
}
