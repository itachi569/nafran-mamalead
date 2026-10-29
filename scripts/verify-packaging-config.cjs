// Validates installer targets and signing gates without requiring a macOS or Linux host.
const path = require('node:path')

const CONFIG = path.join(process.cwd(), 'electron-builder.config.cjs')
function load(overrides = {}) {
  const names = [
    'LEADSNAP_UPDATE_URL',
    'REQUIRE_UPDATE_FEED',
    'MAMALEAD_DISABLE_UPDATES',
    'REQUIRE_CODE_SIGNING',
    'REQUIRE_NOTARIZATION',
    'WIN_CSC_LINK',
    'APPLE_ID',
    'APPLE_APP_SPECIFIC_PASSWORD',
    'APPLE_TEAM_ID',
    'APPLE_API_KEY',
    'APPLE_API_KEY_ID',
    'APPLE_API_ISSUER',
    'MAMALEAD_STORE_BUILD',
    'MAMALEAD_STORE_IDENTITY_NAME',
    'MAMALEAD_STORE_PUBLISHER',
    'MAMALEAD_STORE_PUBLISHER_DISPLAY_NAME',
  ]
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]))
  for (const name of names) {
    if (Object.prototype.hasOwnProperty.call(overrides, name)) process.env[name] = overrides[name]
    else delete process.env[name]
  }
  delete require.cache[require.resolve(CONFIG)]
  try {
    return require(CONFIG)
  } finally {
    for (const name of names) {
      if (previous[name] === undefined) delete process.env[name]
      else process.env[name] = previous[name]
    }
  }
}

const results = []
function check(name, ok, detail = '') {
  results.push(ok)
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` · ${detail}` : ''}`)
}

const local = load()
check('Windows keeps an NSIS target', local.win.target.some((target) => (typeof target === 'string' ? target : target.target) === 'nsis'))
check('macOS exposes DMG and ZIP targets', local.mac.target.includes('dmg') && local.mac.target.includes('zip'))
check('Linux exposes AppImage and DEB targets', local.linux.target.includes('AppImage') && local.linux.target.includes('deb'))
check('macOS hardened runtime is enabled', local.mac.hardenedRuntime === true)
check('local builds do not require unavailable signing credentials', local.forceCodeSigning !== true)
check('Windows builds default to the official update feed', process.platform !== 'win32' || local.publish?.url === 'https://mamalead.com/updates/windows/')
check('offline test builds can explicitly disable update feeds', load({MAMALEAD_DISABLE_UPDATES:'1'}).publish === undefined)
check('Store package uses full trust and the MamaLead application id', local.appx.capabilities.includes('runFullTrust') && local.appx.applicationId === 'MamaLead')

const store = load({
  MAMALEAD_STORE_BUILD: '1',
  MAMALEAD_STORE_IDENTITY_NAME: 'Reserved.MamaLead',
  MAMALEAD_STORE_PUBLISHER: 'CN=Store Publisher',
  MAMALEAD_STORE_PUBLISHER_DISPLAY_NAME: 'MamaLead',
  LEADSNAP_UPDATE_URL: 'https://updates.example.test/nafran/',
})
check('Store package reads Partner Center identity', store.appx.identityName === 'Reserved.MamaLead' && store.appx.publisher === 'CN=Store Publisher')
check('Store package leaves updates to Microsoft Store', store.publish === undefined)
check('Store package rejects missing Partner Center identity', (() => {
  try { load({ MAMALEAD_STORE_BUILD: '1' }); return false } catch (error) { return /requires MAMALEAD_STORE_IDENTITY_NAME/.test(error.message) }
})())

const signed = load({ REQUIRE_CODE_SIGNING: '1', REQUIRE_NOTARIZATION: '1', WIN_CSC_LINK: 'configured-in-ci', APPLE_ID: 'ci@example.test', APPLE_APP_SPECIFIC_PASSWORD: 'ci-password', APPLE_TEAM_ID: 'TEAM123456' })
check('release builds can require code signing', signed.forceCodeSigning === true)
check('notarization turns on when Apple credentials are present', signed.mac.notarize === true)
check('update feed is passed to the builder', load({ LEADSNAP_UPDATE_URL: 'https://updates.example.test/nafran/' }).publish?.url === 'https://updates.example.test/nafran/')
check('update feed URL is normalised', load({ LEADSNAP_UPDATE_URL: 'https://updates.example.test/nafran' }).publish?.url === 'https://updates.example.test/nafran/')
check('release refuses a missing update feed', (() => {
  try { load({ REQUIRE_UPDATE_FEED: '1' }); return false } catch (error) { return /LEADSNAP_UPDATE_URL is missing/.test(error.message) }
})())
check('release refuses an insecure update feed', (() => {
  try { load({ REQUIRE_UPDATE_FEED: '1', LEADSNAP_UPDATE_URL: 'http://updates.example.test/nafran/' }); return false } catch (error) { return /HTTPS directory URL/.test(error.message) }
})())

const failed = results.filter((ok) => !ok).length
console.log(`packaging config checks: ${results.length - failed}/${results.length} passed`)
if (failed) process.exitCode = 1
