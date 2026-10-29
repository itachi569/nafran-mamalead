function updateFeedUrl(environment = process.env) {
  let value = String(environment.LEADSNAP_UPDATE_URL || '').trim()
  if (!value) {
    if (environment.REQUIRE_UPDATE_FEED === '1') {
      throw new Error('REQUIRE_UPDATE_FEED=1 but LEADSNAP_UPDATE_URL is missing. Set it to the HTTPS directory that serves latest*.yml and installers.')
    }
    // Windows builds use the same signed production feed as release CI. Development
    // launches and Microsoft Store packages still disable the in-app updater at runtime.
    if (process.platform !== 'win32' || environment.MAMALEAD_DISABLE_UPDATES === '1') return ''
    value = 'https://mamalead.com/updates/windows/'
  }

  let url
  try {
    url = new URL(value)
  } catch {
    throw new Error('LEADSNAP_UPDATE_URL must be a valid HTTPS URL.')
  }
  const localTestFeed = url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname) && environment.REQUIRE_UPDATE_FEED !== '1'
  if ((!localTestFeed && url.protocol !== 'https:') || url.username || url.password || url.search || url.hash) {
    throw new Error('LEADSNAP_UPDATE_URL must be an HTTPS directory URL without credentials, query, or fragment (HTTP localhost is allowed for local tests).')
  }
  if (!url.pathname.endsWith('/')) url.pathname += '/'
  return url.toString()
}

module.exports = { updateFeedUrl }
