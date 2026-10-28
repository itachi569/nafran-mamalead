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
2. Its federated credential trusts only `repo:itachi569@285477093/nafran-mamalead@1417685662:environment:windows-release` from GitHub's OIDC issuer. This is the exact subject emitted by this repository, including immutable owner/repository IDs; the legacy name-only subject does not match.
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

The Windows job fails before signing if any required value is missing. Signed installers are stored as **draft GitHub Release assets** on the build tag after both signature checks pass for publisher Nafran LTD. The Windows job has repository `contents: write` solely to create this draft and upload its three assets. A rerun may replace draft assets but refuses to overwrite a published release. Unsigned tests still use Actions artifacts with seven-day retention.

GitHub Actions artifact storage reached its quota on 20 October 2026 after a successfully signed build. Release assets avoid that Actions artifact storage dependency; no old artifacts were deleted.

## Fleet server publication

The current deployment path uses the server's guarded publishers. The canonical
website/billing repository is `aamirmursleen/mamalead`, checked out at
`/home/ahmed/mamalead`; it is separate from the Electron source repository.
Website files belong in canonical `landing/`, billing files in `app/`. Follow
the current server `AGENTS.md` and publisher checks for the candidate commit.

After signed CI succeeds for the exact reviewed tag/commit, obtain only the
three draft release assets: `MamaLead Setup <version>.exe`, its `.blockmap`,
and `latest.yml`. GitHub may normalize spaces to dots in release asset names;
restore the exact filenames referenced by `latest.yml` when staging. Verify
GitHub SHA-256 digests and sizes, installer SHA-512 against update metadata,
and valid timestamped Windows Authenticode for `Nafran LTD`. Require the CI
application-signing, installer-signing and signature-verification steps to pass.

Stage the verified files and `SHA256SUMS` under
`/home/ahmed/deploy-staging/<version>/signed/`. Staging must not write production
artifact paths, switch `.installer-path`, publish the feed or restart services.
Use the reviewed staging helper for the release; never log GitHub credentials
or temporary signed download URLs, and never distribute private secret files.

From `/home/ahmed/mamalead`, `mamalead-publish --check` verifies the canonical
source candidate, and `mamalead-publish` performs the source rollout through
VM115 validation and the release guard. Protected homepage/routing/schema
changes may require candidate-specific staging evidence and owner approval;
inspect the current guard result rather than assuming an older SHA approval
covers new files. Routine release permissions and certificate configuration
do not need to be recreated for each version.

Publish staged Windows artifacts using `mamalead-installer-publish <version>`.
The guarded installer publisher performs hash/metadata and Nafran LTD signature
checks, preserves rollback data, switches the download selection/feed and
checks health and public availability. Its Microsoft signing-root trust
configuration was repaired and successfully used for 1.4.16 on 26 October 2026.
Do not fall back to the older direct-copy scripts or disable signature checks.

The landing service serves a strict allowlist from
`/opt/billing/artifacts/windows-updates` at `/updates/windows/`; metadata is not
cached and artifacts support single byte ranges. The app disables multiple-range
requests. The publisher owns production file permissions, feed ordering,
installer selection and service changes. Website and installer publication are
independent; advertise a new downloadable version only when its signed files
are actually selected by the public endpoint.

After publication verify homepage/assets, updater version, full installer
hash/signature, byte-range response, download endpoint and API health. Record
the deployed source commit, signed hashes and publisher rollback path in the
versioned release document. The feed contains no credentials or customer data.

Artifact Signing gives the installer a verified publisher identity. Microsoft states that SmartScreen reputation still builds over time, so an early signed release can continue to show a warning until the publisher or file has sufficient reputation.
