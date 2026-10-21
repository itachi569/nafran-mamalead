# Decision Makers 1.4.13

## Changes

- A Decision Makers import owns its exact website IDs. Old workspace contacts
  stay in the database but do not appear in this scan's results or exports.
- A standalone Decision Makers pass can start its queued scan. The foreground
  worker checks the stored job kind instead of always requiring Lifetime.
- Website scanning follows same-site Team, About, Leadership, Management, Staff
  and Contact links, bounded to five pages and 30 seconds per website. It reads
  structured Person records and multiple published name/role pairs.
- Repeating a scan updates the existing contact for that website and name.
  Missing fields do not overwrite details already saved.
- Completion scrolls to People Found below the sticky toolbar. The result card
  contains direct branded Excel and PDF buttons, without the generic leads modal.
- A successful export resets the current scan. Cancelled or failed saves keep
  the results. Saved contacts are not deleted.

## Verification

`node scripts/verify-decision-workflow.mjs` runs an isolated Electron workflow
with a local billing server, simulated Stripe checkout, a standalone Decision
Makers pass and fixture websites. It exercises the actual IPC, queue, scanner,
database, renderer and export writers. It does not spend real customer credits.

After `npm run package:win`, run the same workflow with
`NAFRAN_TEST_PACKAGED=1` to use `release/win-unpacked/MamaLead.exe`.
Coverage includes two consecutive websites, following a Team link, all three
published contacts, no previous-site leakage, toolbar-aware scrolling, cancelled
and failed saves, Excel fields, PDF output, reset, re-scan deduplication, preserved
database contacts and an empty site with exports disabled.

The real public `https://buffer.com/about` scan returned five names on
21 October 2026: Joel Gascoigne, Hannah Voice, Hailley Griffis, Simon Heaton and
Kateryna Porshnieva. A separate 37signals scan returned no named contacts.
These are observations, not a coverage guarantee: this bounded HTML scanner can
miss JavaScript-only, blocked or differently formatted people pages. Missing
fields stay blank, and it does not promise a named person on every website.

## Delivery

Windows release tag: `v1.4.13-windows`. Publish only the Azure-signed CI assets
after checking the app and installer signatures, GitHub asset digests and update
feed SHA-512. A local packaging build alone is not the public signed release.
Update the server installer pointer and Windows feed, then the website version.
Mac download visibility remains paused and its build setup remains in Git.

Rollback uses the previous `/opt/billing/app/.installer-path` and
`/opt/billing/artifacts/windows-updates/latest.yml`. No billing database migration
or backend source deployment is needed for this desktop fix.
