# MamaLead self-hosted test deployment

## 21 October 2026: server AI 1.4.12 and Windows-only website

Nafran Assist now calls Cerebras through the authenticated MamaLead billing
server. The owner's provider key is private on the server; customers install
1.4.12 and do not supply an API key. An actual authenticated desktop-client
chat returned an answer. See [AI operations](assist-server.md) for limits,
privacy and rollback. Stripe payments remain in **test mode**.

Application source: `d7bc83833c204843f6d98556e0c492c270a87c33`.

- Windows: tag `v1.4.12-windows`, [CI run 39556459677](https://github.com/itachi569/nafran-mamalead/actions/runs/39556459677).
  Public installer: 333,901,440 bytes; SHA-256
  `e73fdb806452934f5eef8dc8602ef4b7181a7624b1f0c745b476176d07252a86`.
  The full public download matched and Authenticode returned Valid for
  `CN=Nafran LTD, O=Nafran LTD, L=London, C=GB`. Update feed selects 1.4.12.
- Mac: tag `mac-v1.4.12`, [CI run 39556459438](https://github.com/itachi569/nafran-mamalead/actions/runs/39556459438).
  Apple Silicon DMG: 405,905,370 bytes, SHA-256
  `e549b1589c6b30c231f5a6700046123f17b8eeff5976ee88139f3dba2b47b502`.
  Intel DMG: 423,814,372 bytes, SHA-256
  `fd8176dd099b8d7f89fe06ccf38daa96cc3dbc61de35bf1dd8877a4674425586`.
  Both full public downloads matched CI/GitHub digests. Apple signing and
  notarization remain pending; no fresh Mac runtime test was performed.

At the owner's subsequent request, the website now offers **Windows only**.
All Mac download buttons and visible Mac guidance were removed. Header/hero
and download heading say **Download for Windows**. Mac source, workflow,
release assets and backend routes are retained; see
[restoration notes](mac-downloads-paused.md). Public index.html and sales.js
matched the deployed source after publication. Website privacy describes the
AI server flow and the Windows installer note identifies Nafran LTD.

## 20 October 2026: full Mac 1.4.11 releases published

The full **Mac 1.4.11** desktop application is now available for Apple Silicon
and Intel. Both native architecture builds succeeded in
[run 39474379664](https://github.com/itachi569/nafran-mamalead/actions/runs/39474379664)
at commit `f1b87e82c894ba794c46cf29162dd86263e32286`, tag `mac-v1.4.11`.
The workflow produces DMG and ZIP packages including bundled Chromium and
stores them, with CI SHA-256 manifests, in draft GitHub Release `418725339`.

Both DMGs were deployed to the fleet server. A complete download through each
public URL matched the staged artifact, GitHub asset digest, and CI checksum:

- Apple Silicon: `https://api.mamalead.com/v1/download?platform=mac-arm64`
  — 405,890,788 bytes; SHA-256
  `e925f65d7840983426a878a8fd150be3d78ec49f450516984e59f9ab6992d3b4`.
- Intel: `https://api.mamalead.com/v1/download?platform=mac-x64`
  — 423,832,003 bytes; SHA-256
  `70966577c5484f6bafd25bf56618ba4087161f8c954db615cd638c76bc6d7d62`.

The website buttons now say **Download for Mac · Apple Silicon** and
**Download for Mac · Intel**. The chip-selection guidance remains, and the
download note gives the version, DMG installation steps and pending Apple
verification. The public `sales.js` matched the deployed copy exactly.
Rollback files are in `/home/ahmed/deploy-staging/mac-1.4.11/rollback/`.

Apple Developer ID signing and notarization are **pending at the user's
request**. These full release packages are not Apple-verified; security
warnings or first-launch blocking remain possible. Mac automatic updates
remain disabled. This release performed compilation, packaging and download
integrity checks; no fresh Mac runtime or installation tests were run.
See [Mac release process](mac-release.md).

The existing signed Windows 1.4.11 download and update feed are unchanged.
The repository-required local Windows rebuild also completed; that unsigned
local rebuild was retained separately and the verified signed release was
restored to `release/` to prevent accidental unsigned distribution.
The billing service remains healthy in Stripe **test mode**.

## 20 October 2026: signed Windows 1.4.11 released

Windows **1.4.11** is live at `https://api.mamalead.com/v1/download?platform=windows`. The app executable and installer passed Azure Artifact Signing verification with publisher **Nafran LTD** in [the successful release workflow](https://github.com/itachi569/nafran-mamalead/actions/runs/39426159488), tag `v1.4.11-release3-windows`, application commit `e008d3e44d7b6c8d9b460bcfd573693b6140ddf8`.

- Public installer: 333,926,032 bytes; SHA-256 `2770ff43cf0232cbf85f88ebdf8e947db123f718099f3a41e6b0aef30b28535b`.
- A full download from the public API matched that hash and returned Windows Authenticode status **Valid**, subject `CN=Nafran LTD, O=Nafran LTD, L=London, C=GB`, with a Microsoft timestamp.
- The HTTPS generic update feed is `https://mamalead.com/updates/windows/`. `latest.yml` and the installer SHA-512 match. The public installer range request returned HTTP 206 with the correct first 16 bytes. The app pins the expected updater publisher to Nafran LTD and disables multiple-range requests.
- The signed binary, blockmap and metadata are stored under `/opt/billing/artifacts/windows-updates/`; `/opt/billing/artifacts/MamaLead-Setup-1.4.11.exe` is a hard link to the signed binary. `.installer-path` now selects it. Rollback files remain under `/home/ahmed/deploy-staging/1.4.11/rollback/`.
- Website version labels distinguish Windows 1.4.11 from Mac test 1.4.10. Apple Silicon/Intel guidance and trial-card instructions are retained. Both Mac downloads remain unsigned test builds.
- All four application services were active after publication. Public API health remains `{"ok":true,"mode":"test"}` and all download platforms report available.

The initial Azure login failure was fixed by matching GitHub's actual OIDC subject including immutable owner/repository IDs. A later build signed successfully but hit the GitHub Actions artifact storage quota. The final workflow saves signed binaries as draft GitHub Release assets instead; no old artifacts were deleted. Server downloads matched both the GitHub asset SHA-256 digests and the signed installer SHA-512 recorded by CI before publication.

During feed installation the landing service briefly failed because new files did not retain the service user's read ACL. Explicit read permissions were added and public HTTP 200 was verified before release publication. Deployment instructions now document this requirement.

Code signing establishes the verified publisher; it does not guarantee that Windows SmartScreen will never show a reputation warning. Existing builds without an update feed need a manual installation of this signed release first. Payments remain in Stripe test mode.

## 19 October 2026: MamaLead 1.4.10 branding release

The desktop product name is now **MamaLead**. The Windows installer and both Mac test DMGs use the new MamaLead green `m` icon based on the supplied brand logo. The Mac `.app` bundle is named `MamaLead.app`; its packaged icon and bundle name, Chromium startup, trial, and licence activation passed the [Apple Silicon and Intel CI run](https://github.com/itachi569/nafran-mamalead/actions/runs/39211000902). The unsigned [Windows CI build](https://github.com/itachi569/nafran-mamalead/actions/runs/39213090553) also passed, and the fresh local Windows installer launched and passed the packaged UI check. The package name and app ID remain stable so existing local app data and licence identity are retained.

The public website shows MamaLead 1.4.10. All three public download URLs return HTTP 200 with the correct filename and length; the first 4 KiB streamed over public HTTPS matched the files on the server:

- Windows: `https://api.mamalead.com/v1/download?platform=windows` — 333,589,059 bytes; SHA-256 `4E4DAE04FF280767F25A2AB541C6F00D97C8CD8DBBA24E599F27CC2ADCC8807F`.
- Mac Apple Silicon: `https://api.mamalead.com/v1/download?platform=mac-arm64` — 405,890,665 bytes; SHA-256 `5B14AD8D29D79F190D3178E3975A8EF55C78FEBD1DF9B9BFB0A450BA6CF93918`.
- Mac Intel: `https://api.mamalead.com/v1/download?platform=mac-x64` — 423,831,676 bytes; SHA-256 `9020BFC821755CA633CEA4432320A8A9ECD9D0F3E871F7F89616985DECA5A6B7`.

The billing API remained healthy in Stripe **test mode**, download options reported all platforms available, and the admin sign-in page returned HTTP 200. The prior website and download path files are saved under `/home/ahmed/deploy-staging/1.4.10/rollback/`. These Mac builds remain unsigned, so macOS may warn on first launch.

## 19 October 2026: Subscribe handoff and Mac test installers

The website's Decision Makers Subscribe button now opens `mamalead://subscribe/decision-makers`. The desktop app handles that link by opening its device-bound Rs 1,000 Stripe Checkout. The site renderer replaces card elements after page load, so the website now uses a delegated click handler and reapplies download links after each render. If the browser remains active without opening the app, Windows visitors are sent to the public installer download after a short delay; Mac visitors are taken to the Mac chip selector. Browser focus is only a best-effort way to detect an installed app, so the page also shows a clear fallback message.

Both unsigned macOS test builds passed the GitHub Actions packaged app, bundled Chromium, trial, and licence checks in [run 39157635914](https://github.com/itachi569/nafran-mamalead/actions/runs/39157635914). Apple Silicon and Intel DMGs are live at `https://api.mamalead.com/v1/download?platform=mac-arm64` and `https://api.mamalead.com/v1/download?platform=mac-x64`. The server-side SHA-256 values are `768F6118533523F5FF52CC71B89F0D322D6BDD9F311448C58D9092667CF152A1` (401,399,431 bytes) and `0F8A13021647615F6DA0F710DF597107DEAA1E2530801588A88C81699F157B0A` (419,402,252 bytes). Both public downloads returned HTTP 200 with the matching sizes. A live browser check confirmed that the website enables both Mac links after the billing API reports the files available.

The Mac DMGs are unsigned private test builds because no Apple signing or notarization credentials are configured. macOS may show a security warning. Stripe remains in test mode. The existing public Windows 1.4.9 installer is unchanged because this update changed the website and server download configuration, not the packaged desktop code; a fresh local Windows package and its Decision Makers checkout test passed.

## 18 October 2026: version 1.4.9 deployed to the fleet server

The current website, billing API, owner dashboard, and Windows installer are deployed to the fleet server. The website is live at `https://mamalead.com/`, the owner dashboard at `https://admin.mamalead.com/admin/`, and the Windows installer at `https://api.mamalead.com/v1/download?platform=windows`. All four application services restarted and remained active. The billing API health endpoint returned HTTP 200 in Stripe **test mode**. The admin sign-in configuration returned email login enabled and token login disabled.

The 1.4.9 installer is 336,342,145 bytes. Its server-side SHA-256 is `EA7640AE2D8E76488F434446CE3181DEE0AF4617AABEC9EB99C0875CE7C0DA4C`, matching the local build. The public download returned HTTP 200 with that size and filename, and its first bytes were a Windows executable header. Public website and dashboard HTML matched the deployed files exactly after removing Cloudflare's injected analytics beacon. Before deployment, a SQLite backup and source/site archive were saved on the server.

Local verification passed 113 billing checks, 50 dashboard checks, the admin login UI, website Decision Makers checkout, TypeScript type checking, and packaged Windows tests for Lifetime and Decision Makers flows. A live test-mode installation registration and billing status check succeeded without a payment. The Lifetime test price is PKR 10,000. No live card charge or owner password sign-in was performed in this deployment check.

The Windows installer is unsigned, so Windows SmartScreen can still warn. Mac installers are not in this release; the public API reports Mac unavailable and the website labels those downloads as coming soon. The test-mode deployment does not accept live card payments.

## Earlier deployment record — 14 October 2026 (Pakistan time)

## Version 1.4.1 public installer and device binding

The billing VM now serves `GET https://api.mamalead.com/v1/download` without a license key. A full public HTTPS download was 105,569,746 bytes and matched the rebuilt 1.4.1 installer SHA-256 `8AA63211634CD88E8EE898AAE8F59370EA3773EF95EA08C47AB680274ECD1B87`. Public download requests are counted separately from legacy signed downloads. The Windows app must submit a stable SHA-256 device ID and platform label when registering and checking a license; the server binds each installation token to that ID and rejects a different ID. The owner dashboard can show a shortened device ID and platform for activated slots. The packaged 1.4.1 app launched and created a device-bound registration on the public server. Local checks passed: 59 billing checks, 38 dashboard checks, and TypeScript type checking.

The updated 1.4.1 website files are staged on VM131 at `/srv/nafran-site/public`, but the public `https://mamalead.com/` gateway still serves the previous website copy (verified by its unchanged SHA-256). The VM site service is bound to loopback; switching the public origin requires gateway access. The supplied gateway SSH key is rejected, so the public website button and copy have **not** been updated. Until routing is fixed, the public installer link above works directly.

The 1.4.1 Windows installer is unsigned (`Get-AuthenticodeSignature: NotSigned`), so a SmartScreen reputation warning remains possible. Hosting the file on Azure would not sign it. Device IDs and server checks discourage key sharing but do not make a desktop client impossible to modify.

The website, billing API, and owner dashboard are publicly routed through HTTPS:

- Website: `https://mamalead.com/`
- Billing API: `https://api.mamalead.com/health` returns HTTP 200 with `mode: test`.
- Owner dashboard: `https://admin.mamalead.com/admin/` returns HTTP 200. Its API requires owner sign-in; an unauthenticated session request returns HTTP 401.

The VM131 billing service uses `BILLING_PUBLIC_URL=https://api.mamalead.com` and still uses Stripe **test mode**. The Stripe test account has an enabled, signed webhook endpoint at `https://api.mamalead.com/webhooks/stripe` for `checkout.session.completed` and `customer.subscription.deleted`. The signing secret is in the root-readable server environment file, not this repository. An unsigned POST returned HTTP 400; two real Stripe test Checkout events were received and recorded by the dashboard.

Public end-to-end checks completed with two independent sandbox buyers:

- Two Stripe test payments created two customer records and two lifetime licenses.
- The owner dashboard recorded two signed webhook events and two emailed keys.
- Resend marked both license emails to its `delivered@resend.dev` test recipient as Delivered.
- Both buyers received signed, protected installer links that returned HTTP 200.
- A delivered lifetime key activated through the public API. A second delivered lifetime key activated in the packaged Windows app against that public API. An existing delivered one-day trial key also activated through the public API.
- The protected server installer SHA-256 matched the latest local 1.4.0 installer.
- All owner dashboard health checks were `ok` after the billing and admin services restarted.

The server's daily SQLite backup timer is active. A fresh backup passed SQLite `quick_check`, was copied off VM131, encrypted with Windows DPAPI for the owner account, and passed a decrypt/byte comparison. The local `Nafran Offsite Backup` scheduled task runs at 07:00 Pakistan time and at user logon, and its manual scheduled run finished with result 0. The task needs this Windows PC signed in and connected to Tailscale; the server's own backup timer continues independently. See `Pull-NafranBackup.ps1` for the local pull script.

This remains a **sandbox deployment**. It does not accept live card payments. The public routes are verified, but direct SSH access to the gateway was unavailable, so its reverse-proxy configuration was not directly audited. The older `DEPLOYMENT-STATUS.md` records the state on 10 October and is retained as history.
