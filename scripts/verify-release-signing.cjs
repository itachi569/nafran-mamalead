// Fails a release job before packaging when its platform signing material is missing.
// Local builds stay unsigned and usable; CI release jobs opt into these gates explicitly.
const required = process.env.REQUIRE_CODE_SIGNING === '1'
const requireNotarization = process.env.REQUIRE_NOTARIZATION === '1'
const requireLinuxSigning = process.env.REQUIRE_LINUX_SIGNING === '1'
const windowsSigningMethod = String(process.env.WINDOWS_SIGNING_METHOD ?? '').trim().toLowerCase()

function present(...names) {
  return names.some((name) => String(process.env[name] ?? '').trim().length > 0)
}

function allPresent(...names) {
  return names.every((name) => String(process.env[name] ?? '').trim().length > 0)
}

function fail(message) {
  console.error(`FAIL  ${message}`)
  process.exitCode = 1
}

if (!required && !requireNotarization && !requireLinuxSigning) {
  console.log('PASS  local packaging does not require release signing credentials')
  process.exit(0)
}

if (process.platform === 'win32' && required) {
  if (windowsSigningMethod === 'artifact-signing') {
    if (!allPresent(
      'AZURE_CLIENT_ID',
      'AZURE_TENANT_ID',
      'AZURE_SUBSCRIPTION_ID',
      'AZURE_ARTIFACT_SIGNING_ENDPOINT',
      'AZURE_ARTIFACT_SIGNING_ACCOUNT',
      'AZURE_ARTIFACT_SIGNING_PROFILE',
    )) fail('Azure Artifact Signing requires OIDC IDs, endpoint, account and certificate profile')
    else console.log('PASS  Azure Artifact Signing configuration is present')
  } else if (!present('WIN_CSC_LINK', 'CSC_LINK')) fail('Windows signing requires WIN_CSC_LINK or CSC_LINK')
  else console.log('PASS  Windows signing certificate is configured')
}

if (process.platform === 'darwin' && required) {
  if (!present('CSC_LINK', 'CSC_NAME')) fail('macOS signing requires CSC_LINK or CSC_NAME')
  else console.log('PASS  macOS Developer ID certificate is configured')
}

if (process.platform === 'darwin' && requireNotarization) {
  const api = allPresent('APPLE_API_KEY', 'APPLE_API_KEY_ID', 'APPLE_API_ISSUER')
  const appleId = allPresent('APPLE_ID', 'APPLE_APP_SPECIFIC_PASSWORD', 'APPLE_TEAM_ID')
  const keychain = allPresent('APPLE_KEYCHAIN', 'APPLE_KEYCHAIN_PROFILE')
  if (!api && !appleId && !keychain) fail('macOS notarization requires App Store Connect API, Apple ID, or keychain credentials')
  else console.log('PASS  macOS notarization credentials are configured')
}

if (process.platform === 'linux' && requireLinuxSigning) {
  if (!allPresent('LINUX_GPG_PRIVATE_KEY', 'LINUX_GPG_KEY_ID')) fail('Linux signing requires LINUX_GPG_PRIVATE_KEY and LINUX_GPG_KEY_ID')
  else console.log('PASS  Linux GPG signing material is configured')
}

if (process.exitCode) process.exit(process.exitCode)
