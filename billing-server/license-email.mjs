import { readFileSync } from 'node:fs'

const template = readFileSync(new URL('./email-assets/license-template.html', import.meta.url), 'utf8')
const logo = readFileSync(new URL('./email-assets/mamalead-logo.png', import.meta.url)).toString('base64')
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]))

// An email address does not expose its owner's Google profile name. Use a
// readable part of the address, and never inject the raw address into HTML.
export function greetingNameFromEmail(email) {
  const local = String(email ?? '').split('@')[0].split('+')[0]
  const words = local.replace(/[._-]+/g, ' ').replace(/[^\p{L}\p{N} ]/gu, ' ').trim().split(/\s+/).filter(Boolean).slice(0, 3)
  const name = words.map((word) => word[0].toLocaleUpperCase('en') + word.slice(1)).join(' ').slice(0, 48)
  return /\p{L}/u.test(name) ? name : 'there'
}

export function buildLicenseEmail({ to, licenseKey, kind, download }) {
  if (kind !== 'trial' && kind !== 'lifetime' && kind !== 'decision') throw new Error('Unknown license email kind')
  const trial = kind === 'trial'
  const decision = kind === 'decision'
  const name = greetingNameFromEmail(to)
  const subject = trial ? 'Your MamaLead 1-day trial key is ready' : decision ? 'Your MamaLead Decision Makers key is ready' : 'Your MamaLead lifetime license key is ready'
  const intro = trial
    ? 'Your 1-day trial is ready. Activate this key in the desktop app to start 24 hours and capture up to 300 Google Maps leads across any keywords.'
    : decision ? 'Your Decision Makers pass is ready. Activate this key in the desktop app to use 1,000 Decision Maker searches during your 30-day pass.'
      : 'Here is your lifetime license key. Activate it in the desktop app to unlock unlimited Maps, email, phone and social lookups, plus your first 30 days of Decision Makers.'
  const features = trial
    ? ['Up to 300 Google Maps leads', 'Search any keywords and cities within that total', '24 hours from first activation on one device', 'Export and save your captured leads']
    : decision ? ['1,000 Decision Maker searches across your licensed devices', 'Your pass lasts 30 days from payment', 'A new pass can be bought when searches run out or the 30 days end', 'Payment is manual; no automatic renewal']
      : ['Unlimited Google Maps leads', 'Unlimited email, phone and social lookups', '1,000 Decision Maker searches in the first 30 days after activation', 'Export every run and keep your saved lists']
  const replacements = {
    TITLE: subject,
    PREHEADER: trial ? 'Your one-day trial license key is inside. Activate it in Settings & Billing → Account.' : decision ? 'Your Decision Makers key is inside. Activate it in Settings & Billing → Account.' : 'Your lifetime license key is inside. Activate it in Settings & Billing → Account.',
    HEADLINE: trial ? 'Your Trial Key is Ready!' : 'Your License Key is Ready!',
    GREETING_NAME: name,
    INTRO_HEADING: trial ? 'Welcome to your 1-day trial!' : 'Thank you for your purchase!',
    INTRO_COPY: intro,
    LICENSE_KEY: licenseKey,
    DONE_TITLE: trial ? 'Done! Your trial starts now' : decision ? 'Done! Decision Makers is ready' : 'Done! Lifetime is active',
    DONE_COPY: trial ? 'Your 24-hour trial and 300-lead allowance start at activation.' : decision ? 'Your 1,000-search pass lasts 30 days from payment. Your remaining count appears in Settings → Usage.' : 'Unlimited lookups and your first 30 Decision Makers days start at activation.',
    IMPORTANT_COPY: trial
      ? 'The 24 hours begin when you first activate this key. Keep it private; one trial is available per email and device.'
      : decision ? 'Keep this key private. This pass started at payment and renews only when you manually buy another pass.' : 'Keep this key private and save this email. You may need it again if you reinstall the app.',
    DOWNLOAD_URL: download,
    FEATURE_HEADING: trial ? 'Your trial includes:' : decision ? 'Your Decision Makers pass includes:' : 'Your lifetime license includes:',
    LICENSE_SUMMARY: trial ? '1-Day Trial License · Free' : decision ? 'Decision Makers Pass · Rs 1,000 PKR' : 'Lifetime License · Rs 10,000 PKR',
    FOOTER_REASON: trial ? 'You are receiving this because you requested a MamaLead 1-day trial.' : decision ? 'You are receiving this because you bought a MamaLead Decision Makers pass.' : 'You are receiving this because you bought a MamaLead lifetime license.',
    YEAR: new Date().getUTCFullYear(),
  }
  const featuresHtml = features.map((feature) => `<span style="color:#6F8A62;font-weight:bold;">&#10003;</span>&nbsp;&nbsp;${escapeHtml(feature)}`).join('<br>\n    ')
  const html = template.replace(/\{\{([A-Z_]+)\}\}/g, (_, key) => {
    if (key === 'FEATURES_HTML') return featuresHtml
    if (!(key in replacements)) throw new Error(`Unknown email template field: ${key}`)
    return escapeHtml(replacements[key])
  })
  const text = `Hey ${name},\n\n${intro}\n\nYour license key: ${licenseKey}\n\nDownload MamaLead: ${download}\nOpen Settings & Billing → Account, paste the key, and choose Activate.\n\n${features.join('\n')}\n\nKeep your key private.\n`
  return {
    subject, html, text,
    attachments: [{ filename: 'mamalead-logo.png', content: logo, content_type: 'image/png', content_id: 'mamalead-logo' }],
  }
}
