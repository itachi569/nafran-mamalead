# Mac desktop releases

The `Build Mac release` workflow builds the full MamaLead desktop application,
including its bundled Playwright Chromium, separately on native Apple Silicon
and Intel macOS runners. It uses the same application source and version as the
Windows release.

## Build and stage

1. Commit the desired source and set the package version.
2. Push a tag named exactly `mac-v<package version>`, for example `mac-v1.4.11`.
3. Both architecture jobs must succeed before server publication.
4. The workflow saves a DMG, ZIP and SHA-256 manifest for each architecture in a
   draft GitHub Release. Draft release assets avoid the Actions artifact storage
   quota. Published release assets cannot be replaced by this workflow.
5. Download the assets using authenticated GitHub access. Verify their lengths
   and GitHub SHA-256 digests, then compare the files against the CI manifests.

This workflow currently builds **without Apple Developer ID signing or
notarization**. Apple Silicon packaging may use an ad-hoc signature; that is not
an Apple-verified publisher identity. The builds contain the complete product,
but macOS security warnings or a first-launch block remain possible.

Mac automatic updates are deliberately disabled in these builds. Set up the
Apple identity, notarization, and an architecture-appropriate update feed before
enabling automatic updates. Until then, upgrades require downloading a new DMG.
The signed Windows release workflow and its update feed are independent.

## Publish to the fleet server

The download API reads these path files when the billing service starts:

- `/opt/billing/app/.mac-arm64-path`
- `/opt/billing/app/.mac-x64-path`

Each contains an absolute path to its DMG beneath `/opt/billing/artifacts/`.
Use versioned names such as `MamaLead-1.4.11-mac-arm64.dmg` and
`MamaLead-1.4.11-mac-x64.dmg`. Preserve the previous path files and website
files for rollback. Install both DMGs before replacing either path file, and
grant the `nafran-billing` service user read access to every new file with
`setfacl -m u:nafran-billing:r <file>`.

Replace the two path files atomically, retaining service read permissions,
then restart with `sudo -n fleet-dev restart mamalead nafran-billing`.
Download the complete files through the public endpoints and compare hashes
before publishing the new website labels:

- `https://api.mamalead.com/v1/download?platform=mac-arm64`
- `https://api.mamalead.com/v1/download?platform=mac-x64`

Update both `website/index.html` and `website/sales.js`; JavaScript reapplies the
download labels when page cards are rendered. Preserve the Apple Silicon/Intel
device guide and accurately state the pending Apple verification.
