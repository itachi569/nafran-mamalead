# Desktop updates, notifications and Assist navigation

These source changes follow public Windows 1.4.17. They are not a newly published
signed release. Do not replace the production 1.4.17 installer with a local test build.

## User behavior

- Settings & Billing → Account → App updates has an **Automatic updates** switch.
  It defaults off and persists in the device's `app-updates.json` preference file.
- The installed app checks 8 seconds after startup, then every 4 hours while open.
  Both modes notify the user when a newer release is available. The notification
  opens the App updates card. An app that is closed cannot check for releases.
- When enabled, the update downloads in the background with real progress. It
  installs on the user's normal app quit or explicit **Restart to install**.
  Download completion never closes the app automatically. Explicit restart waits
  until active scraping, enrichment, verification and Google sign-in are finished.
- Switching off stops future automatic downloads and installation on quit. An
  already running download can finish; the user can install it manually.
- Clicking an unread notification's text, icon, time or blank card area marks it
  read. Enter/Space works when the card is focused. The explicit unread control,
  delete, undo, unread filter and action links retain their own behavior.
- Assist asks for direct answers, normally 1–3 short sentences under 60 words,
  preserving the user's language/script. The related page name is a text link
  under the answer. Only fixed in-app destinations are supported; following a
  link does not start a scan, checkout or download. Reports opens the real saved
  totals dialog. Existing licensing checks remain in force.

## Publication

1. Increment the desktop version for the next release (greater than 1.4.17).
2. Run the existing restricted Windows signing workflow. CI still requires the
   configured HTTPS feed, validates the Nafran LTD publisher and signs artifacts.
3. Stage that release's signed installer, blockmap and matching `latest.yml` using
   the existing guarded server publisher. Follow [release-1.4.17.md](release-1.4.17.md)
   for the established workflow; use the new version and its exact artifacts.
4. Verify the public download, metadata, hashes and Authenticode signature. Only
   then can installed clients see and install the new version.

Pushing source alone does not deliver desktop updates. Older clients with a
configured feed can obtain this feature through their existing manual update
control. Builds without an embedded feed need one installation of a configured
release. Windows builds now embed `https://mamalead.com/updates/windows/` by
default; `MAMALEAD_DISABLE_UPDATES=1` is available for intentionally offline test
builds. Development launches and Store-managed packages retain their own behavior.

The new desktop includes a concise-answer compatibility hint for an older connected
Assist server. Publish `billing-server/assist.mjs` through the normal server release
to apply the stronger concise-answer policy to all clients. Provider keys remain
server-side.

## Verification

After `npm run build`:

```text
node scripts/test-auto-updates.cjs
npm run packaging:test
node scripts/verify-updates.cjs
node scripts/verify-notifications.cjs
node scripts/test-assist-navigation.cjs
node scripts/verify-assist-service.mjs
node scripts/verify-assist-navigation-ui.cjs
```

The packaged checks accept the fresh unpacked executable path:

```text
node scripts/verify-auto-updates-ui.cjs "release/auto-update/win-unpacked/MamaLead.exe"
node scripts/verify-assist-navigation-ui.cjs "release/auto-update/win-unpacked/MamaLead.exe"
node scripts/verify-notifications.cjs "--exe=release/auto-update/win-unpacked/MamaLead.exe"
```

Updater UI tests simulate provider events, never download/run another installer,
and use isolated profiles. They cover persisted opt-in, real IPC, progress,
notifications, manual restart, error retries, polling and the busy-scan guard.
Assist UI tests cover 12 real destinations with controlled answers, isolated
workspace totals and no paid provider calls.
