# MamaLead 1.4.21 — combined QA report resolution

Date: 31 October 2026 (Asia/Karachi).
Input: MamaLead-All-Bugs-v1.4.20.md — 73 IDs: 31 open app items, 36 previously fixed app items, 6 website items awaiting retest.

This is a local maintenance build. It does not deploy the website/backend or publish a signed production update. Existing customer data and the owner's active licence were not used for destructive testing. Desktop checks use isolated profiles and test billing.

## Open app items addressed

| Report IDs | Change and verification |
| --- | --- |
| ML-58 | Website reads try HTTPS and the alternate www host, preserve meaningful failures, and save the successful canonical URL. HTTP access denial/certificate failures are not bypassed. Tested with fixture failures and all five public sites cited in the report. |
| ML-27, ML-59 | Email, phone and social scan outcomes persist per lead/per module. Pending, successful empty, failed and skipped results are distinguished. Failed homepage reads cannot become a successful empty scan. Error reasons/retry survive navigation. |
| ML-28, ML-60 | Social/directory URLs are excluded from business crawling. Supported Maps social/WhatsApp links are retained as profiles. Business hosting subdomains remain intact. A transactional upgrade repair archives originals, removes automated pollution and redundant profiles, and preserves manual data. |
| ML-68, ML-24 | One contact-completeness formula writes the stored score after contact/website/social mutations and during upgrade. Lists, lead views and exports read that value. Unchanged scores are not repeatedly written. |
| ML-57, ML-49 | XLSX input reads merged, empty, rich-text, formula and hyperlink cells safely. The app's own branded export round-trips through the real importer. |
| ML-65 | Assist checks JSON content type, handles HTML/malformed gateway replies, retries transient 502/503/504 once within the existing overall deadline, and offers a friendly Retry answer action. Purchase calls are not retried. |
| ML-55 | Main checks fresh billing status before requesting a trial. Existing server protections against replacing Lifetime with a trial are covered by the billing integration suite. |
| ML-29 | Pakistani geographic numbers retain Lahore 042, Karachi 021 and other mapped area codes; mobiles retain their mobile classification. |
| ML-15 | Coverage labels are anchored inside the map, constrained to its width and expose full names through tooltips. Light pins use dark text; stale pins retain readable contrast. The visible-pin count explains the subset and points users to all results. |
| ML-25 | Saved Lists says Recent saved captures, initials use words containing letters, and list avatars reflect actual members rather than placeholder names. |
| ML-39, ML-69, ML-62 | Maps/enrichment phases group by run. Partial failures are described as finished with issues, persist alongside successful phases and no longer mark the entire batch failed. Successful exports add no unread badge; actionable notices remain unread. Raw network/browser messages are translated for users. |
| ML-16 | Coverage distinguishes the last run's location from the next requested location and dims stale pins. |
| ML-19 | History labels distinguish Maps statistics from the filtered mixed timeline; today's count is captured places. Historical browser-install errors use customer-facing text. |
| ML-17 | On upgrade without a saved form draft, the last run restores the location. |
| ML-61 | URL normalization removes tracking parameters/fragments while preserving meaningful query parameters and full business hostnames. |
| ML-63 | Changing an active key has a Cancel action, replacement warning and confirmation. Dismissing confirmation makes no activation call. |
| ML-64 | Keyword removal buttons have labels naming the keyword they remove. |
| ML-66 | Assist has a larger output allowance and detects truncated provider replies rather than displaying half an answer as complete; the user can retry. |
| ML-67 | Escape and backdrop close the lead-detail panel; focus returns to its opening row. |
| ML-70 | Finder header explicitly counts website import runs, avoiding confusion with the number of leads. |
| ML-71 | Excel rating, review-count and score cells are numeric; phone numbers remain text. |
| ML-72 | Bulk-keyword counts distinguish keywords found from the eight-per-run limit. Add and Replace each explain their resulting count; the preview explicitly belongs to Replace. Duplicate labels and incorrect singular/plural text are removed. |
| ML-73 | The Electron window title follows the current page. |
| ML-13 | An isolated unlicensed profile verifies the Maps inputs are disabled and activation/trial actions are available before editing. The owner's active licence is unaffected. |
| ML-37 | Assist receives bounded recent scan errors and the Maps error rather than guessing from no context. Existing safe bold/newline rendering is retained. Tests verify actual error context reaches the provider; generated advice still depends on the provider's response. |

## Website retest

ML-01/02/03/52/53 pass the existing homepage/Terms regression at 1440, 768, 390 and 375 px: Terms and support links, removal of the retired subscription CTA, usable mobile navigation/tap targets, readable text, no horizontal overflow and no renderer errors. No design replacement was made for this bug-fix task.

ML-51: read-only public HEAD checks returned HTTP 200 for the Windows download endpoint, Terms and the Windows update metadata feed.

## Live reproductions of ML-58

Using the actual contact reader, without replacing network responses:

| Input website | Working address | Result | Elapsed |
| --- | --- | --- | --- |
| http://physioway.pk | https://physioway.pk/ | 1 published email; no scan error | 1.6 s |
| http://physiodoctor.pk | https://www.physiodoctor.pk/ | 1 published email; no scan error | 3.5 s |
| http://www.physiogic.com/?utm_source=google | https://www.physiogic.com/ | 1 published email; no scan error | 2.7 s |
| http://reactivephysio.pk | https://reactivephysio.pk/ | 1 published email; no scan error | 1.8 s |
| http://ejazdanish.lahorespinecare.com | https://ejazdanish.lahorespinecare.com/ | 1 published email; no scan error | 1.4 s |

These are observations from this run, not guaranteed timings or a guarantee that all websites publish contact details.

## Reproducible checks and evidence

- `scripts/verify-qa-1.4.21.cjs`: transport recovery, mixed outcomes, durable scores, XLSX round-trip/numeric cells, recoverable cleanup, Lifetime guard, Assist gateway retry.
- `scripts/verify-qa-1.4.21-ui.cjs`: licence flow, failure states, key replacement, location restore, map bounds, list members, Escape/focus, titles and grouped notifications.
- `scripts/verify-qa-1.4.21-live.cjs`: optional public-site reproduction above.
- `scripts/verify-release-audit.cjs`: core and desktop suites; raw logs under `screenshots/qa-1.4.21/`.
- `scripts/verify-social-batch.cjs`: 50 websites, concurrent completion, access failures, delayed response, timeout and Stop.
- `scripts/verify-qa-part2.cjs` and `scripts/verify-qa-part2-ui.cjs`: import, persistence and bulk-keyword regressions.
- `scripts/verify-qa-website.mjs`: responsive website checks.

The existing 36 resolved IDs were regression-tested through these suites; this does not imply that every external-service scenario has been exercised.

## Recorded validation

| Check | Result |
| --- | --- |
| Core release suites | 16/16 passed |
| Desktop regression suites | All 11 passed, including the notification recheck after waiting for its entry animation to finish |
| Social batch regression | 8/8 passed, including 50 sites, partial failure, timeout and Stop |
| QA 1.4.21 backend | Passed: canonical URLs, durable per-module outcomes, archive/idempotency/FK checks, scores, real XLSX round-trip, billing guard and Assist retry |
| QA Part 2 backend | Passed: binary/oversized/UTF-16/IDN imports, 650-site batching and persistence |
| QA Part 2 UI | Passed: real file-picker/import IPC, retained next batch, keyword counts, remembered Maps mode and trial validation |
| Responsive website | Passed at 1440, 768, 390 and 375 px |
| Live report websites | 5/5 successfully read; one published email found for each in this run |
| Package contents | Version 1.4.21; renderer matches the current build; no private credential paths found in the app archive |

The earlier icon-conversion packaging failure was resolved by using the existing generated Windows ICO as a checked-in build asset. The PNG source is unchanged.

## Final Windows test build

- `npm run package:win`: passed with the final source changes.
- `verify-qa-1.4.21-ui.cjs --packaged` and `verify-qa-part2-ui.cjs --packaged`: both passed against the fresh `release/win-unpacked/MamaLead.exe`. The packaged renderer matches the current build. No renderer exceptions occurred.
- Installer: `release/MamaLead Setup 1.4.21.exe`, 339,497,285 bytes, written 31 October 2026 at 00:57:07 Asia/Karachi.
- SHA-256: `663605966813BCF259EBFC49017B2747F0117522E4B78EB1E552CCFD454F6189`.
- Authenticode status: **NotSigned**. This is a local QA installer; the signed public 1.4.20 release/update feed has not been replaced.
- Screenshot review confirmed readable map labels, distinct Add/Replace keyword counts and the upper-right notification popup.

## External checks still requiring a separate release test

A clean-machine Windows install/uninstall, SmartScreen reputation, real Google sign-in/CAPTCHA, actual payment processing and actual trial email delivery were not exercised. Licence safeguards and checkout integration were tested with isolated test services. Provider outages, blocked sites and unpublished contacts remain possible and now have explicit states rather than false success/empty results.
