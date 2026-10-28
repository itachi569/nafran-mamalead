# MamaLead 1.4.17 — installer and website deployed

## Status recorded 29 October 2026

The signed Windows installer, updated website and Assist server prompt are
deployed. Owner approval was accepted by the release guard for the exact
canonical commit, and `mamalead-publish` completed at `2026-10-28T21:01Z`.
The complete public installer download matches the signed CI artifact; all
24 published landing files match their reviewed source. The final production
browser check passed on VM115 against the real public site at desktop and mobile sizes.

- Desktop commit: `344c937c9e31b6b75a437d4c04bc0e2729e02670`.
- Windows tag: `v1.4.17-r2-windows` (new immutable candidate; the earlier tag was not moved).
- Signed Windows CI: [run 40764761517](https://github.com/itachi569/nafran-mamalead/actions/runs/40764761517), completed successfully.
- Signed installer: `335381112` bytes, SHA-256 `74b0814aedcf08ade50cea25693ee0dd6390a66cb5285e8b0d53a8a87cc27183`.
- Signed CI installer and complete public download: matching size, SHA-256 and SHA-512; Authenticode **Valid**, publisher **Nafran LTD**, timestamp present.
- Installer publication backup: `/var/lib/mamalead-publish/installer-backups/20261028T205614Z-1.4.17`.
- Desktop repository website commit: `4eb9604255fbacf7c62ded7607e48818e7284038`, pushed.
- Canonical website/Assist commit: `bee9af72a08ae64450a3a9ce7a1b46a13f951941`, pushed to `aamirmursleen/mamalead` main and deployed successfully.
- API health: `ok`; payment mode remains `test`. No payment-mode change was made.
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
  was deployed with the reviewed billing service rollout.

## Local build and controlled verification

The fresh Windows package completed successfully and was tested as a packaged
Electron app using isolated profiles. The local installer is **unsigned** and
must not replace the production signed download:

- File: `release/MamaLead Setup 1.4.17.exe`.
- Built: `2026-10-28T20:37:55Z`.
- Bytes: `338150077`.
- SHA-256: `9881ba87c81c42960f8ac6593d09017e96970f54a0a08e20d95c8cf21af88f20`.
- Local Windows signature status: `NotSigned`.

An earlier packaged import/progress pass in this release work completed 26 checks: six selected-lead
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

Seven additional earlier packaged owner-repair checks used captured public page
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

The earlier packaged build also performed an isolated live Haber Law lookup in
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

## Website verification and guarded rollout

Website files are aligned into `landing/` and the companion Assist server change
into `app/` in canonical repository `aamirmursleen/mamalead`. The reviewed
candidate is `bee9af72a08ae64450a3a9ce7a1b46a13f951941`.

- VM115 build `29d8baf2`: **36/36 checks passed**.
- Candidate Playwright review `mamalead-1417-review3`: passed, covering 19
  screenshots, eight modules and 29 FAQs.
- Candidate review evidence: `/tmp/vm115-playwright/mamalead-1.4.17-review3`.
- The exact-SHA owner approval was accepted; the guard reported
  `homepage_approved=yes` for the canonical commit above.
- Final rollout VM115 build: `afc84db2`.
- `mamalead-publish` completed successfully at `2026-10-28T21:01Z`, restarting
  `nafran-billing` and `nafran-landing`. Database checks passed; public health
  checks passed **4/4**.
- The guarded publisher created source backup
  `source-20261028T210109Z-bee9af72a08a.tar.gz` and database backup
  `billing-20261028T210109Z-bee9af72a08a.sqlite3`. These were produced by the
  configured publisher, not by manual live-file replacement.
- All **24 landing files** match the canonical reviewed source after source
  normalization: 19 PNG screenshots, two HTML files and three metadata files.
- Public homepage SHA-256:
  `f93965d5b8637138b2890a8f01c8727c87ea8a4a7e2388f5caaada6a64fe51a1`.
- API health is `ok` and reports payment mode `test`.

The full public installer download is `335381112` bytes and matches the signed
CI artifact's SHA-256 and SHA-512. Authenticode verification reports Valid,
Nafran LTD, timestamped. Public artifact verification is complete; the production
browser's rendered-page review is the remaining check recorded below.

## Final public browser verification

VM115 job `mamalead-1417-production` passed against the real public site, without
substituting local page or asset responses. It verified the approved HTML hash,
all 19 screenshots, eight modules, the Email Finder validity gallery, Decision
Makers progress/selected-business galleries, desktop/mobile layouts and FAQs.
No page errors, failed resources, payment actions or download actions occurred.
Evidence: `/tmp/vm115-playwright/mamalead-1.4.17-production/`.

Website and installer publication used their separate guarded actions. The
existing signer configuration and release safeguards were retained. Stripe is
still in test mode; this release did not authorize a payment-mode change.
