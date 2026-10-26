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

## Windows release published: 26 October 2026

The administrator configured the root-owned installer publisher to use the
Microsoft code-signing root certificate for signature and timestamp validation.
`mamalead-installer-publish 1.4.16` completed successfully with all checks enabled.

- Public installer: https://api.mamalead.com/v1/download?platform=windows
- HTTP 200; filename MamaLead-Setup-1.4.16.exe; length 333988008 bytes.
- Update feed: https://mamalead.com/updates/windows/latest.yml reports 1.4.16.
- Installer SHA-256: 33b5c9e8c7c4b2f58ff12fbc31ddd94e93f32ff1db20e199f83c887d42c79605.
- Publisher verified hashes, update metadata, Nafran LTD signature, rollback,
  billing health and public artifact/feed.
- Rollback record: /var/lib/mamalead-publish/installer-backups/20261026T130909Z-1.4.16.
- Billing health returns ok:true, mode:test.

## Website screenshot deployment still pending

`mamalead-publish --check` still rejects the new homepage source SHA:
`070fd336bd692b533720c98f010bb8d33bdd0865`.
The server's exact-SHA guard requires owner approval for this specific commit;
the earlier 1.4.15 approval does not cover it. VM115 staging evidence is already
available under /tmp/vm115-playwright/mamalead-1.4.16-review/.

The public website returns HTTP 200 but still references the previous Maps
screenshots. Its download button now serves the updated 1.4.16 installer.
Once the owner registers this exact homepage SHA, run `mamalead-publish` from
/home/ahmed/mamalead, then verify the two new Maps screenshot URLs. No further
installer publication or trust fix is required for this release.