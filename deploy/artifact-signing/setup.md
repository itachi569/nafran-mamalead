# MamaLead Azure Artifact Signing setup

MamaLead uses the official `azure/artifact-signing-action@v2` workflow with GitHub OpenID Connect. The pipeline builds the unpacked app, signs its executable files, creates the NSIS installer, signs the installer, verifies both signatures, and refreshes the updater blockmap and SHA-512 metadata.

## Public Trust eligibility

The certificate profile must be **Public Trust** to establish a Windows publisher identity for a publicly downloaded installer. Public Trust Test and Private Trust profiles do not provide general Windows trust.

Microsoft currently limits Public Trust identity validation:

- Individual developers: United States or Canada.
- Organizations: United States, Canada, European Union, United Kingdom, Australia, New Zealand, Japan, South Korea, Singapore, Switzerland, Norway, or Israel.

A Pakistan-based individual or Pakistan-registered organization cannot currently complete Public Trust validation. Do not enter an inaccurate country, legal entity, address, or identity. Use Artifact Signing only if the actual Azure billing identity or legal organization is eligible.

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

1. Create a Microsoft Entra application/service principal for GitHub Actions.
2. Add a federated credential for repository `itachi569/nafran-mamalead` and the branch, tag, or protected GitHub environment used for release builds.
3. Assign that service principal the **Artifact Signing Certificate Profile Signer** role on the certificate profile scope.
4. Add these GitHub repository secrets:
   - `AZURE_CLIENT_ID`
   - `AZURE_TENANT_ID`
   - `AZURE_SUBSCRIPTION_ID`
   - `LEADSNAP_UPDATE_URL`
5. Add these GitHub repository variables:
   - `AZURE_ARTIFACT_SIGNING_ENDPOINT`
   - `AZURE_ARTIFACT_SIGNING_ACCOUNT`
   - `AZURE_ARTIFACT_SIGNING_PROFILE`

No Azure client secret or certificate private key is stored in GitHub. OIDC issues a short-lived workflow credential.

## Release

Run the **Build installers** workflow without selecting either unsigned-test option, or push a release tag. The Windows job fails before signing if any required value is missing. Download `nafran-windows-installer` only after both signature checks pass.

Artifact Signing gives the installer a verified publisher identity. Microsoft states that SmartScreen reputation still builds over time, so an early signed release can continue to show a warning until the publisher or file has sufficient reputation.
