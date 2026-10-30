// A directory's shared footer belongs to the directory, not the business being researched.
const directories = ['oladoc.com', 'marham.pk', 'practo.com', 'yelp.com', 'yellowpages.com', 'yellowpages.com.pk', 'justdial.com', 'healthgrades.com', 'zocdoc.com', 'tripadvisor.com']
export function directoryScanError(website: string): string | null {
  try {
    const host = new URL(website).hostname.toLowerCase().replace(/^www\./, '')
    if (directories.some(domain => host === domain || host.endsWith('.' + domain))) return 'This is a directory listing. Use the business’s own website to find its contacts; directory-wide contacts were not imported.'
  } catch { return 'This website URL is invalid. Check it and retry.' }
  return null
}
