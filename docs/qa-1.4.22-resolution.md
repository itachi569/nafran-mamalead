# MamaLead 1.4.22 — QA resolution

Input: `MamaLead-All-Bugs-v1.4.21.md`, 31 October 2026. The report contains 12 actionable remaining app defects, ML-13 awaiting an unlicensed-profile check, 59 previously fixed app items and 6 website items awaiting retest.

## Remaining report items

| ID | Change and evidence |
| --- | --- |
| ML-58 | Slow HTTPS homepages receive a longer bounded first attempt. A later HTTP error no longer replaces the primary HTTPS failure. Timeouts include redirects/body reads and respect Stop. Tested delayed HTTPS, fallback errors, TLS failures and the five public sites named in the report. |
| ML-75 | Import previews reject directory/root-social URLs with reasons. Import and queue creation are transactional. A newly created, untouched domain placeholder is removed after its first homepage read fails; the failed row is preserved in job history for retry/export. Existing saved or manually edited leads are retained. |
| ML-68 | Saved Lists reads the persisted contact-completeness score used by All Leads. Actual UI fixture shows the same score of 85. |
| ML-15 | Every valid coordinate participates in a bounded grid of coverage clusters. The eight-pin truncation is removed. Accessible pins expose full names on hover/focus without overlapping labels. Tested 25 coordinates and a 50-point coincident cluster. |
| ML-39 | Opening Notifications marks currently unread records as seen and persists the change. New events and manual unread actions remain distinguishable. |
| ML-19 | Maps searches, done, stopped and failed are explicitly counted. User-stopped runs are excluded from the clean-completion denominator. |
| ML-62 | Email/phone/social outcomes are read from the most recent relevant scan, including Website Lookup. A successful rescan clears an older failure for that field without clearing unrelated failures. |
| ML-70 | Headers distinguish Maps searches from website import batches. Counts use batch/run records rather than saved lead totals. |
| ML-74 | Assist receives persisted, domain-matched scan errors from the repository and is instructed to explain those failures. Tests verify the real IPC context. The wording of a live model response is not guaranteed or covered by the fixture assertion. |
| ML-76 | Export dates and default filenames use the device's local calendar date. Karachi's midnight boundary was checked in an actual XLSX file. |
| ML-77 | Dashboard coverage explicitly says “email address”, avoiding confusion with postal addresses. |
| ML-78 | Import history includes new, reused, found, empty and failed counts from the related job. Failed placeholder rollback adjusts new-lead counts without hiding the failed import. |
| ML-13 | An isolated unlicensed profile verifies disabled Maps inputs and navigation to trial/Lifetime/key activation. The owner's active profile is not used for these tests. |

## Additional requested work

- Removed Verify found emails and automatic validity checks from Website Lookup, including its import dialog and post-scan controls. Email Finder retains its switch and current-results verification action. An actual lookup with Email Finder auto-verification enabled makes zero validity IPC calls.
- Replaced the website with the owner's latest ZIP design and implemented its website-first trial/payment flow, including one Lifetime key and one trial key per email with an explicit “This email is already used” notice. See `website-design-2026-10-31.md`.
- New desktop profiles open Account for their emailed key; existing profiles remain unchanged.

## Checks completed

- Windows renderer/Electron build and fresh Windows packaging.
- Packaged UI suite: new-profile landing, license gate, trial submission, key validation/activation/change cancellation, saved failures and details, map coverage, scores, notifications, empty/not-scanned states, Assist context and Email Finder-only validity.
- Backend QA fixtures: delayed HTTPS/fallback/Stop, invalid import preview, rollback and retained failed history, current field outcomes, counts, local date and XLSX.
- Existing core suites: database, auto-update state, Assist navigation/service, validity reliability, main-email selection, social profiles, contact crawl, Maps limits/browser/website filtering, exports, packaging and update metadata.
- Desktop regression suites: notifications, validity controls/filters, 2,000 leads, import counts, saved Maps searches and Website Lookup.
- Social batch regression: 50 sites, out-of-order completion, partial failure, timeout and cancellation (8 checks).
- Billing integration: 132 checks with fake Stripe and email transport, including the new browser-to-desktop flow.
- Website: 1440, 768, 390 and 375 px; support/Terms, mobile menu/tap targets, text, overflow, trial dialog and checkout recovery. Download GET/HEAD behavior is covered by the billing suite.

Screenshots and machine-readable artifacts are regenerated under ignored `screenshots/qa-1.4.22/`. Tests use isolated temporary profiles, fixture services and synthetic contacts. The previously reported public-site reproductions are in `screenshots/qa-1.4.21/live-websites.json`.

## Practical limits

## Local installer verification

The final `npm run package:win -- --config.directories.output=D:/CodexBuilds/MamaLead-1.4.22-20261031/release --publish never` completed successfully. The output directory was moved to D: after an earlier packaging attempt ran out of working space on C:. Do not use the older C: installer as the current build.

- File: `D:/CodexBuilds/MamaLead-1.4.22-20261031/release/MamaLead Setup 1.4.22.exe`
- Built: 31 October 2026, 13:37:24 local time; 339,500,976 bytes.
- SHA-256: `C5DBAE0EEBF2BDC4CB42B7E4F12244102624F328B5BF9F2B64B2A8F280677FB4`.
- Authenticode: `NotSigned` (local QA only). The packaged UI suite passed against the matching D: executable, including first-launch Account, key activation, import failures, notifications, map coverage and Email Finder-only validity.

## Practical limits

External websites can still time out, block access or publish no contact details; those outcomes must remain explicit. This round did not take a live payment, send customer email, complete a real Google sign-in challenge or test production provider outages. Local packaging is a test build; the signed release and server rollout remain held at the owner's request.
