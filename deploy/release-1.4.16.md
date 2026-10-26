# MamaLead 1.4.16 release status

## Completed

- Removed the unused Find decision makers toggle from Google Maps Enrichment,
  including its unused state and handler. The dedicated Decision Makers module
  remains available.
- Rebuilt the local Windows installer with npm run package:win. Fresh local
  package: 336788870 bytes, SHA-256
  9DED87B1CC42A16111F3B7B336A79DD38377A2CB531188B6B8A014F934DE6E88.
- Launched the packaged app and visually checked the Maps screen. Captured new
  Maps/coverage images from an isolated fictional workspace for the website.
- Updated all website Maps screenshot references and related module guidance.
- App source pushed: a9f884000c1efafc5f39983659bfc3938577b4d1.
- Website source pushed to the desktop repository: e42c940.
- Windows signed CI success: https://github.com/itachi569/nafran-mamalead/actions/runs/40287984443
  Tag: v1.4.16-windows. App and installer signatures verified as Nafran LTD.
- Signed assets staged at /home/ahmed/deploy-staging/1.4.16/signed/.
  GitHub asset SHA-256 and sizes match. Installer SHA-256:
  33b5c9e8c7c4b2f58ff12fbc31ddd94e93f32ff1db20e199f83c887d42c79605.
- Canonical website source pushed to aamirmursleen/mamalead main:
  070fd336bd692b533720c98f010bb8d33bdd0865.
- VM115 source build passed: job 57a2aa18.
- VM115 candidate desktop/mobile browser check passed: job mamalead-1416-review.
  Evidence: /tmp/vm115-playwright/mamalead-1.4.16-review/.
- Read-only signature diagnostic using Microsoft's official root certificate
  passed signature, timestamp and CRL checks for the staged signed installer.

## Production remains pending

The guarded source publisher pushed the new website commit, then refused its
rollout because homepage changes require owner approval for the new exact SHA.
The prior approval for 1e7764c does not cover 070fd336bd692b533720c98f010bb8d33bdd0865.

The installer publisher passed asset hashes/metadata but failed its default CA
chain verification. Its root-owned configuration still needs the Microsoft
Identity Verification Root Certificate Authority 2020 trust fix documented in
installer-trust-fix-1.4.15.md (same configuration repair; publish 1.4.16 afterward).
No verification or release guard was bypassed, and no runtime files were written
manually. The current public source remains 1.4.15; Windows feed remains 1.4.14.

After the administrator registers the new exact-SHA approval and repairs the
publisher trust configuration, run from /home/ahmed/mamalead:

    mamalead-publish
    mamalead-installer-publish 1.4.16

Then verify the homepage images, download filename, updater version and health.