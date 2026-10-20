# MamaLead Azure Artifact Signing setup

MamaLead uses the official `azure/artifact-signing-action@v2` workflow with GitHub OpenID Connect. The pipeline builds the unpacked app, signs its executable files, creates the NSIS installer, signs the installer, verifies both signatures, and refreshes the updater blockmap and SHA-512 metadata.

## Public Trust profile

The **MamaLead** profile is **Public Trust**, created with Nafran LTD's completed UK public organization identity validation. Its publisher subject is `CN=Nafran LTD, O=Nafran LTD, L=London, C=GB`. Public Trust Test and Private Trust profiles do not provide general Windows trust.

## Azure resources

1. In Azure Portal, search for **Artifact Signing Accounts**.
2. Create an account using the **Basic** plan in a supported service region.
3. Assign the account owner the **Artifact Signing Identity Verifier** role.
4. Open **Identity validations** and complete a **Public** individual or organization validation.
5. Open **Certificate profiles** and create a **Public Trust** profile using the approved identity.
6. Record the account name, certificate profile name, and regional endpoint shown below.

Supported endpoint examples include:

- East US: `https://eus.codesigning.azure.net/`
- Central US: `https://cus.codesigning.azure.net/`
- North Central US: `https://ncus.codesigning.azure.net/`
- Japan East: `https://jpe.codesigning.azure.net/`
- Korea Central: `https://krc.codesigning.azure.net/`
- Brazil South: `https://brs.codesigning.azure.net/`

## GitHub OIDC identity

1. The single-tenant Microsoft Entra app `MamaLead GitHub Actions Artifact Signing` is registered in tenant `9d680105-00fa-400e-9c66-35ce29c3d84e` (client ID `a1b48f5a-4378-4a80-baf0-740418dd2cc6`). It has no client secret.
2. Its federated credential trusts only `repo:itachi569/nafran-mamalead:environment:windows-release` from GitHub's OIDC issuer.
3. The `windows-release` GitHub environment allows `v*` tags only. The Windows job must set `environment: windows-release` so its OIDC subject matches the trust.
4. The app's service principal has **Artifact Signing Certificate Profile Signer** only at the `MamaLead` profile scope.
5. These values are stored as `windows-release` environment secrets:
   - `AZURE_CLIENT_ID`
   - `AZURE_TENANT_ID`
   - `AZURE_SUBSCRIPTION_ID`
6. These values are stored as `windows-release` environment variables:
   - `AZURE_ARTIFACT_SIGNING_ENDPOINT`
   - `AZURE_ARTIFACT_SIGNING_ACCOUNT`
   - `AZURE_ARTIFACT_SIGNING_PROFILE`
7. The Windows environment variable `WINDOWS_UPDATE_URL` points to `https://mamalead.com/updates/windows/`. `LEADSNAP_UPDATE_URL` remains a fallback for other release environments.

No Azure client secret or certificate private key is stored in GitHub. OIDC issues a short-lived workflow credential.

## Release

Push a `v<version>-windows` tag to build only the signed Windows release. For example, `v1.4.11-windows` builds package version `1.4.11`; the tag suffix selects the platform and does not change the app version. A manual run on an allowed tag can also select `windows_only`. Other `v*` tags retain the all-platform workflow and require the separate Apple and Linux credentials. Do not select an unsigned-test option for a public Windows release.

The Windows job fails before signing if any required value is missing. Download `nafran-windows-installer` only after both signature checks pass for publisher Nafran LTD.

## Fleet server publication

The landing service uses `deploy/landing-server.mjs` as `/opt/billing/landing/server.mjs`, with `deploy/windows-update-feed.mjs` beside it. It serves a strict allowlist from `/opt/billing/artifacts/windows-updates` at `/updates/windows/`; metadata is not cached, and artifacts support single byte ranges. The app disables multiple-range requests.

For each release, upload the signed installer and its refreshed blockmap into the feed directory first, retaining the original filenames from `latest.yml`. Verify their hashes, then atomically publish `latest.yml` last. Keep prior versioned artifacts for existing updater clients. Create a copy or hard link named `/opt/billing/artifacts/MamaLead-Setup-<version>.exe`, atomically update `/opt/billing/app/.installer-path`, and restart only `nafran-billing.service` with `sudo fleet-dev restart mamalead nafran-billing`.

Before changes, save the existing landing server and installer path under `~/deploy-staging/<version>/rollback/`. After publication verify the public feed, byte-range response, installer signature, download endpoint, and API health. The feed contains no credentials or customer data.

Artifact Signing gives the installer a verified publisher identity. Microsoft states that SmartScreen reputation still builds over time, so an early signed release can continue to show a warning until the publisher or file has sufficient reputation.
