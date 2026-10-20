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
7. Add `LEADSNAP_UPDATE_URL` as a GitHub secret before running the full signed-release workflow if it is not already configured.

No Azure client secret or certificate private key is stored in GitHub. OIDC issues a short-lived workflow credential.

## Release

Run the **Build installers** workflow without selecting either unsigned-test option, or push a release tag. The Windows job fails before signing if any required value is missing. Download `nafran-windows-installer` only after both signature checks pass.

Artifact Signing gives the installer a verified publisher identity. Microsoft states that SmartScreen reputation still builds over time, so an early signed release can continue to show a warning until the publisher or file has sufficient reputation.
