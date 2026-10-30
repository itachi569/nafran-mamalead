const packageJson = require('./package.json')

const { updateFeedUrl } = require('./scripts/update-feed-url.cjs')
const feedUrl = updateFeedUrl()
const requireCodeSigning = process.env.REQUIRE_CODE_SIGNING === '1'
const requireNotarization = process.env.REQUIRE_NOTARIZATION === '1'
const isStoreBuild = process.env.MAMALEAD_STORE_BUILD === '1'
const storeIdentityName = process.env.MAMALEAD_STORE_IDENTITY_NAME?.trim()
const storePublisher = process.env.MAMALEAD_STORE_PUBLISHER?.trim()
const storePublisherDisplayName = process.env.MAMALEAD_STORE_PUBLISHER_DISPLAY_NAME?.trim()
const hasMacNotarizationCredentials = Boolean(
  (process.env.APPLE_API_KEY && process.env.APPLE_API_KEY_ID && process.env.APPLE_API_ISSUER) ||
    (process.env.APPLE_ID && process.env.APPLE_APP_SPECIFIC_PASSWORD && process.env.APPLE_TEAM_ID) ||
    (process.env.APPLE_KEYCHAIN && process.env.APPLE_KEYCHAIN_PROFILE),
)

if (requireNotarization && !hasMacNotarizationCredentials) {
  throw new Error(
    'REQUIRE_NOTARIZATION=1 but no Apple notarization credentials were supplied. Configure APPLE_API_KEY/APPLE_API_KEY_ID/APPLE_API_ISSUER, APPLE_ID/APPLE_APP_SPECIFIC_PASSWORD/APPLE_TEAM_ID, or APPLE_KEYCHAIN/APPLE_KEYCHAIN_PROFILE.',
  )
}

if (isStoreBuild && (!storeIdentityName || !storePublisher || !storePublisherDisplayName)) {
  throw new Error(
    'MAMALEAD_STORE_BUILD=1 requires MAMALEAD_STORE_IDENTITY_NAME, MAMALEAD_STORE_PUBLISHER, and MAMALEAD_STORE_PUBLISHER_DISPLAY_NAME from Partner Center.',
  )
}

module.exports = {
  ...packageJson.build,
  extraResources: [
    ...(packageJson.build.extraResources ?? []),
    { from: '.playwright-browsers', to: 'playwright-browsers' },
  ],
  mac: {
    ...packageJson.build.mac,
    // Hardened runtime is required for notarized macOS builds. It is safe to keep it on for local
    // unsigned builds too; notarization itself only runs when Apple credentials are present.
    hardenedRuntime: true,
    ...(hasMacNotarizationCredentials ? { notarize: true } : {}),
  },
  win: {
    ...packageJson.build.win,
    // Keep the generated Windows icon in source so packaging does not need WASM conversion.
    icon: 'build/mamalead-icon.ico',
    signtoolOptions: { publisherName: 'Nafran LTD' },
    // electron-builder discovers WIN_CSC_LINK/CSC_LINK automatically. CI can opt into failing
    // instead of silently producing an unsigned installer with REQUIRE_CODE_SIGNING=1.
    ...(requireCodeSigning ? { signAndEditExecutable: true } : {}),
  },
  appx: {
    applicationId: 'MamaLead',
    identityName: storeIdentityName || 'MamaLead.Preflight',
    publisher: storePublisher || 'CN=MamaLead Preflight',
    publisherDisplayName: storePublisherDisplayName || 'MamaLead',
    displayName: 'MamaLead',
    backgroundColor: '#F7F4EC',
    languages: ['en-US'],
    minVersion: '10.0.17763.0',
    maxVersionTested: '10.0.26100.0',
    capabilities: ['runFullTrust'],
  },
  ...(requireCodeSigning ? { forceCodeSigning: true } : {}),
  ...(!isStoreBuild && feedUrl
    ? {
        publish: {
          provider: 'generic',
          url: feedUrl,
          useMultipleRangeRequest: false,
        },
      }
    : {}),
}
