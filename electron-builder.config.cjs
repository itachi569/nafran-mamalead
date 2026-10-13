const packageJson = require('./package.json')

const { updateFeedUrl } = require('./scripts/update-feed-url.cjs')
const feedUrl = updateFeedUrl()
const requireCodeSigning = process.env.REQUIRE_CODE_SIGNING === '1'
const requireNotarization = process.env.REQUIRE_NOTARIZATION === '1'
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

module.exports = {
  ...packageJson.build,
  mac: {
    ...packageJson.build.mac,
    // Hardened runtime is required for notarized macOS builds. It is safe to keep it on for local
    // unsigned builds too; notarization itself only runs when Apple credentials are present.
    hardenedRuntime: true,
    ...(hasMacNotarizationCredentials ? { notarize: true } : {}),
  },
  win: {
    ...packageJson.build.win,
    // electron-builder discovers WIN_CSC_LINK/CSC_LINK automatically. CI can opt into failing
    // instead of silently producing an unsigned installer with REQUIRE_CODE_SIGNING=1.
    ...(requireCodeSigning ? { signAndEditExecutable: true } : {}),
  },
  ...(requireCodeSigning ? { forceCodeSigning: true } : {}),
  ...(feedUrl
    ? {
        publish: {
          provider: 'generic',
          url: feedUrl,
        },
      }
    : {}),
}
