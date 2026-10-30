# MamaLead 1.4.20 — QA Part 2

Source: the supplied `MamaLead-QA-Report-Part2-v1.4.19.md` (ML-40 through ML-56). These changes are local/GitHub release preparation. Production and the public download/update feed have not been changed.

The earlier duplicate **Emails found** card was removed in `2e1df70`. Email scan results now scroll to the main email table, which retains validity and export controls.

## Changes and evidence

| ID | Resolution | Verification |
| --- | --- | --- |
| ML-40 | Native picker and dropped files share byte-level validation. Binary, PDF and renamed XLSX files are rejected before import; failed replacement clears the previous selection. Email/Phone imports cannot silently change into Social Profiles. | Real native picker and drop IPC/renderer checks; invalid and oversized file tests. |
| ML-41 | Lists above 500 show an always-visible batch notice and **Scan first 500**. The remainder is saved locally and offered when Import websites opens again. Website Lookup also retains the next batch. | 650 URLs: the renderer dispatched 500 and reopened with the remaining 150; persistent remainder helper tested. |
| ML-42 | Each captured Maps lead and its run membership are committed before its progress event is broadcast. Finalisation is idempotent. Restart marks unfinished runs Interrupted while retaining captured leads. | A second SQLite connection sees live data; close/reopen recovery and repeated finalisation tested. Full Electron audit observes a persisted running record before completion. |
| ML-43 | Remember the selected Google/guest mode. A visible Change control opens the choice again. | First-run prompt, second guest run without prompt, explicit switch to Google, and renderer reload preserving Google mode. Login itself is not automated. |
| ML-44 | Keywords, requested maximum and location persist as the user's draft; scan history cannot reset them. | Draft reload with eight selected keywords and Lahore; guarded defaults and bounded maximum. |
| ML-45 | Shared WHATWG URL parsing canonicalises IDNs to ASCII/punycode for import/storage/deduplication. Preview retains the user's readable spelling. | UTF-16 file, Unicode and equivalent punycode domains, IDN deduplication, malformed inputs. |
| ML-46 | Empty files and lists without a usable website column have specific inline errors. A column selector allows correction. | Native empty/no-column files and manual column selection. |
| ML-47 | Numbered/bulleted keyword prefixes are removed; each keyword is limited to 80 characters and overlong terms are reported. | `1.`, `2)`, `3 -`, duplicates and overlong inputs. |
| ML-48 | Add to current shows existing + accepted = total and the number excluded by the eight-keyword ceiling. | Three existing + twenty incoming => five additions, eight total, fifteen excluded. |
| ML-49 | Native picker/drop accept genuine XLSX. The first worksheet is converted to text and the Website/Domain heading can follow the export's branded rows. | Branded Excel round trip and native XLSX import. Renaming Excel to CSV is still rejected. |
| ML-50 | Unsupported builds disable the update action and omit automatic-update promises/toggle. | Renderer control assertions; development updater checks. |
| ML-51 | Public installer endpoint supports HEAD with the same metadata as GET, an empty body, and no download-count increment. Local HEAD uses stat without opening the file stream. | Local billing integration over HTTP. Production requires a later deployment. |
| ML-52 | Compact mobile header with Download and an accessible menu including FAQ. Menu closes on link, outside click, Escape, and viewport change. | Browser checks at 375, 390, 768 and 1440 pixels; closed phone header is 61px. |
| ML-53 | Mobile navigation/footer controls have at least 44px targets; tiny text raised to at least 12px. Privacy navigation also has larger targets. | Mobile DOM geometry/text-size checks and screenshot inspection. |
| ML-54 | Trial form uses one inline validation path with `noValidate`, alert text and `aria-invalid`. | Four invalid input forms are consistently rejected before IPC. |
| ML-55 | Lifetime users see no trial card. The server rejects trial requests and activation on active Lifetime installations, including secondary paid devices and private owner keys. | Billing/owner integration suites and Lifetime UI check. |
| ML-56 | Maps header, Saved searches and Run History distinguish **Stopped by you**, captured/target totals, and interrupted/failed runs. | Cancellation persistence and saved-search UI checks. |

## Validation scope

- Build and TypeScript checks pass.
- Part 2 core and Electron UI regression suites pass.
- Billing integration: 116 checks; private owner-key integration: 20 checks; repository: 78 checks.
- Full development app audit passes all ten pages in light/dark, imports, single email results list, validity cancellation/resume, Maps 20-result cap/accounting, live persistence, restart persistence, CSV/Excel/PDF, AI fixture and revoked-licence handling.
- Desktop/mobile website browser suite passes with no renderer errors or horizontal overflow.

Automated tests use isolated profiles/databases and controlled services. They do not send customer email, charge Stripe, sign in to Google, publish an updater feed, or overwrite the owner's saved workspace. A real clean-machine install/uninstall, public update migration, real Stripe checkout and Google sign-in remain release acceptance checks; this report does not claim those were performed.

## Windows artifact

- `npm run package:win` succeeded. `release/MamaLead Setup 1.4.20.exe` was rebuilt at **30 October 2026, 18:54:20 PKT**, size **339,485,967 bytes**.
- Packaged Part 2 UI checks passed, including the real native file decoder, 500/150 batch behaviour, remembered Maps mode, trial restrictions and unsupported updater controls.
- Full packaged app audit passed all ten pages/themes, finder imports, the single email results table, Maps capture/accounting/persistence, CSV/Excel/PDF exports, restart and revoked-licence handling, with no renderer errors. Email-verification cancellation/resume was additionally exercised in the development audit.
- Packaged saved-search checks passed: city/run isolation, 1,005-row Excel export, PDF export, persistence, live results, and stopped-run labels with captured/target totals in the header and history.
- Installer SHA-256: `BEC000A618C097B6FF4EA971BC14A0A5FD39153B06BD9C4DC6EBD2C3BD6461AB`.
- The application payload extracted from the installer exactly matches the packaged app used for verification. ASAR SHA-256: `A7FACD65DA5B5F39C2312145F2BB26CBBEAA3C7F675D14827B3AE55E2CB943FB`.
- Inspected 5,148 ASAR entries: no private configuration/credential paths were packaged.
- This local installer is **unsigned**, for local testing. A signed public release and update-feed publication were not performed.

These artifact details supersede the earlier Part 1 build hashes in `qa-1.4.20-resolution.md`.
