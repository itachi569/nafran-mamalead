# MamaLead 1.4.17 — release handoff, publication pending

## Status recorded 29 October 2026

The desktop source and Windows release tag are pushed. Signed CI is pending;
this document does **not** confirm a published 1.4.17 installer, updater feed,
website or billing deployment. The previous verified public release is
[1.4.16](release-1.4.16.md). Update this handoff with the final signed artifact
hashes, canonical website commit and public checks after publication.

- Desktop commit: `344c937c9e31b6b75a437d4c04bc0e2729e02670`.
- Windows tag: `v1.4.17-r2-windows` (new immutable candidate; the earlier tag was not moved).
- Signed Windows CI: [run 40764761517](https://github.com/itachi569/nafran-mamalead/actions/runs/40764761517), pending.
- Website/billing source alignment and guarded server rollout: pending.
- Mac downloads remain paused; this tag selects the Windows signing job only.

## Included desktop changes

- Decision Makers displays owner/founder identity, business, published owner
  email and its source. Company inboxes, guessed addresses, navigation headings,
  testimonial people and superseded owner evidence are excluded. Public website,
  sitemap, company-story and search sources are verified before assigning mail.
- Saved Maps imports preserve selected business IDs: 15 selected businesses
  remain 15 even when only 13 have websites; shared or missing websites do not
  silently remove selected records. Missing-site businesses use name and location
  evidence. Pasted URL lists still deduplicate website URLs.
- Contact Coverage displays actual processed/remaining counts and percentage.
  Stop preserves completed results; cancelled work does not silently resume.
  Individual failures are counted while later businesses continue.
  The website-coverage count excludes records without a website: 13 sites among
  15 selected businesses displays 87%, while all 15 businesses remain selected.
- The website import dialog supports pasted links, native CSV/TSV file selection
  and saved Maps runs, with source-specific counts and a clean reset. Compact
  layout and hover contrast are improved.
- Email Finder selects one main email published on the website. Email validity
  is optional on the page and after a scan, scoped to the current selection.
  Phone Finder prioritizes the main published number; social links are
  canonicalized and deduplicated instead of repeating icons.
- Website Lookup gathers published website details and scrolls to the current
  results. Saved finder searches update while typing, with previous searches in
  History. Maps saved searches are accessible near the heading and exportable.
- PDF/Excel exports use the MamaLead logo and structured headings, columns and
  rows, including the owner-email export. Workspace branding and contrast are
  corrected, and the unused Members settings section is removed.
- Notifications use the new design and persistent states. Assist matches the
  user's language, including Roman Urdu; its companion server prompt change
  still needs the separately reviewed billing deployment.

## Local build and controlled verification

The fresh Windows package completed successfully and was tested as a packaged
Electron app using isolated profiles. The local installer is **unsigned** and
must not replace the production signed download:

- File: `release/MamaLead Setup 1.4.17.exe`.
- Built: `2026-10-28T20:37:55Z`.
- Bytes: `338150077`.
- SHA-256: `9881ba87c81c42960f8ac6593d09017e96970f54a0a08e20d95c8cf21af88f20`.
- Local Windows signature status: `NotSigned`.

The final packaged import/progress pass completed 26 checks: six selected-lead
checks, eleven import-count checks and nine progress checks. It verified 15/50
saved business selections, 100 CSV websites, cleared stale 13-site drafts,
17/17 completed owner fixture results and accurate 0–100% progress. Stop
responded in **191 ms**, retained one of four completed results at 25%, and did
not resume the cancelled work. A failed-site fixture processed all three
businesses, retaining two successes and one reported failure. There were no
renderer errors or live provider/billing calls in these UI tests.

The final candidate's isolated UI checks also verified Decision Makers website
coverage of 13/15 (87%), and Email Finder displaying `Checking 1/3` with Stop
while verification remained scoped to the same three imported lead IDs.

Seven additional packaged owner-repair checks used captured public page
fixtures. They removed false Shopify heading rows, retained the sourced founder,
cleared an unsupported inbox, obtained the published personal email from the
Usama Bajwa fixture, and replaced a specifically superseded Fathom owner with
the current supported identity. These are controlled regression checks, not a
live batch or customer-data modification.

Backend checks cover 15 selected businesses with 13 websites and 50 selected
businesses sharing 13 unique websites with 10 missing URLs; all selected IDs
were processed once with one allowance consumption per attempted business.
Final compiled source checks also passed owner fallback (6), company-story
discovery (12), safe root-alias retry (8), and shared page caching (3). The
sitemap source suite (12) verifies direct page locations, resource exclusion, safe
redirects, cache/cancellation and a 5-second request limit inside an unchanged
8-second discovery ceiling.

Evidence is retained in this task's workspace under
`outputs/MamaLead-decision-progress/` and
`outputs/MamaLead-owner-live-isolated/`, including
`packaged-saved-lead-count.json`, `packaged-import-count.json`,
`packaged-ui-progress.json` and `packaged-owner-ui.json`.

## Live public-source evidence and limits

Focused runs checked six previously selected independent sites. The latest
result for each site verified its owner identity; four sites returned at least
one sourced owner email. These results came from separate focused reruns, not
one simultaneous six-site batch or a production-wide success rate:

| Site | Latest observed result | Elapsed time |
| --- | --- | --- |
| Plausible | Marko Saric and Uku Taht identified; Uku's published address sourced from the original founder article | 14.4 s |
| Simple Analytics | Adriaan van Rossum and Iron Brands identified; Iron's published address sourced from its feedback article | 13.8 s |
| Grow & Convert | Devesh Khanal and Benji Hyam identified; both published addresses sourced from its thank-you and FAQ pages, with no paid provider request in that focused run | 35.3 s |
| Fathom | Jack Ellis identified; no owner mailbox verified in that run | 15.0 s |
| Rubenstein Law | Robert Rubenstein identified; no owner mailbox verified in that run | 19.9 s |
| Haber Law (`haber.law`) | David B. Haber and his published address found | 5.4 s |

The final packaged build also performed an isolated live Haber Law lookup in
6.0 seconds and verified the email on the fetched source. The different
`haberlaw.com` hostname had a TLS failure and was not silently treated as the
same verified website. No TLS protection was disabled.

Evidence: `source-blind-sample-latest-summary.json` records the focused source
results, and `packaged-blind-sample-haber-official-live.json` records the packaged
live check. The checks did not read or modify the customer's workspace database
or invoke app billing. Published owner email availability and network timing
vary; missing or timed-out results must remain distinguishable. These tests do
not promise an email for every business or a fixed completion time.

## Known Maps control limitation

The visible **Minimum rating**, **Minimum reviews** and **Has phone** controls
do not currently filter a Maps scan. This is a confirmed control-to-request
wiring gap, not a claim based only on an unused variable:

- `src/app/ReferenceApp.tsx` renders the rating/review selects without change
  handlers or controlled values, and renders the phone switch.
- `src/app/useAppValues.ts` only toggles `swPhone` for display; `runScrape`
  forwards website status but no rating, review-count or phone requirement.
- `src/app/useScraper.ts` constructs the desktop request without those three
  filters. `electron/scraper/types.ts` has no corresponding query fields, and
  `electron/scraper/chromium-maps.ts` applies the website-status filter only.

The website does not advertise those three controls as working capabilities.
The total result cap, website-status filter and saved-run workflows are separate
implemented paths. Repairing these dormant controls is recorded for follow-up;
no additional app changes were made during website alignment for this release.

## Remaining release actions

1. Wait for the exact Windows CI run above to finish successfully. Require both
   Azure signing steps, signature verification, refreshed metadata and draft
   release asset upload. Do not substitute the unsigned local installer.
2. Verify the draft's exact three assets against GitHub SHA-256/size, updater
   SHA-512/path/version, and Windows Authenticode publisher `Nafran LTD` with a
   timestamp. The task helper `work/stage-signed-1.4.17.cjs <run-id> <full-sha>`
   must target `v1.4.17-r2-windows` and the exact commit/run above. It prepares a
   local verified copy and stages the same files under
   `/home/ahmed/deploy-staging/1.4.17/signed/`; it does not publish them.
3. Align reviewed website files into `landing/` and companion billing files into
   `app/` in canonical repository `aamirmursleen/mamalead`, checked out at
   `/home/ahmed/mamalead`. Keep runtime secrets and customer databases separate.
   Record the final canonical commit and candidate browser/build evidence.
4. Use `mamalead-publish --check` and `mamalead-publish` through the current
   server release guard. Homepage/routing/schema rules and approval state are
   checked against the actual candidate, not inferred from an older release.
5. Publish the verified installer with `mamalead-installer-publish 1.4.17`.
   The configured publisher handles signature trust, metadata, backup/rollback,
   feed switching and health checks. Its certificate trust fix was completed
   for 1.4.16; do not recreate the signing identity or disable validation.
6. Verify public homepage/assets, updater version, full installer hash and
   signature, byte ranges, download endpoint and service health. Record the
   publication commit, signed digest, backup path and final results here.

Website and installer publication are separate guarded actions. Coordinate
release availability claims with the actual signed installer selected by the
public endpoint. Stripe mode must be verified from current server health; this
release does not authorize a payment-mode change.
