# MamaLead 1.4.20 — QA resolution record

Source: user-supplied MamaLead-QA-Report-v1.4.19.md, 30 October 2026.
These are source/build changes. Website publication and the signed production update feed are separate release steps.

| ID | Resolution |
|---|---|
| ML-01 | Branded Terms page covering trial, licence device limits (two machines for purchased Lifetime, one for trial), Lifetime price, support and refund enquiries; linked from site footer and app purchase area. |
| ML-02 | Current website has no retired Decision Makers subscription offer; desktop/mobile tests reject the old Rs 1,000 CTA. |
| ML-03 | Visible header Support and footer Contact support using the existing mailbox. No unprovided WhatsApp number invented. |
| ML-04 | Trial CTA opens/focuses the email form even with disconnected billing. Existing submission success/error feedback retained. |
| ML-05 | Welcome CTA opens that same trial destination. |
| ML-06 | Shared friendly IPC errors; sandboxed preload bundled so runtime imports do not break the desktop bridge. |
| ML-07 | Key whitespace/uppercase normalization, Show/Hide, and validation against the actual backend alphabet before IPC. |
| ML-08 | Active licence summary replaces empty input. Use a different key reveals it. Device transfer remains a support action; no destructive Deactivate button added. |
| ML-09 | Trial and purchase offers hidden for active Lifetime users. |
| ML-10 | Static cards describe existing allowance rather than offering an unimplemented quantity selector. |
| ML-11 | Settings scroll retained per tab. |
| ML-12 | Secure-storage guidance explains OS keychain recovery, including Linux Secret Service. No plaintext key fallback. |
| ML-13 | Pointer, keyboard and focus gates intercept locked feature inputs before edits. |
| ML-14 | Friendly missing-browser recovery; Lookup error wrapping/clamping and full tooltip. Installer bundles Chromium. |
| ML-15 | Actual coordinates drive pins/counts; eight-pin preview limit disclosed; collisions adjusted and long labels truncated within bounds. |
| ML-16 | Coverage city/extent comes from the selected real run. |
| ML-17 | Removed Manchester default; reuse last location, otherwise ask for a city/area. |
| ML-18 | Empty exports disabled, including social profiles; backend rejects empty tables. |
| ML-19 | Completed count/duration use successful runs. Settings labels historical counter as attempts; history keeps failed filter and correct record total. |
| ML-20 | Automatic enrichment only reads leads from the current Maps run ID; activity retains/filters that ID. |
| ML-21 | Progress/completion refresh rows and counts. Phone row projection and filter include website contacts consistently. |
| ML-22 | All Leads business-name links open full saved contact details, address, rating/reviews, socials and source. |
| ML-23 | Saved badge uses actual lead total. |
| ML-24 | Weighted completeness score replaces blanket 100/60; list and single-lead/export paths agree. |
| ML-25 | Mixed/imported workspaces no longer inherit unrelated Maps-city text; initials derive from business names. Historical import filenames are not preserved by the existing schema. |
| ML-26 | Finder route entry reloads data and resets stale scopes/errors while retaining active work. |
| ML-27 | Persistent per-lead Failed vs empty-success status; visible cause and Retry for Email/Phone/Social; retry switches to Scanning. |
| ML-28 | Known directory hosts rejected before extraction. Existing canonical social dedupe/platform-specific extraction retained. Historical/manual saved contacts are not destructively deleted. |
| ML-29 | Phone actions use progress UI; libphonenumber normalizes/classifies PK/UK/international numbers with location context. |
| ML-30 | Email coverage describes saved Maps/imported leads; cascade shows progress/completion. |
| ML-31 | Scan visible websites and per-row failed-scan Retry on Social Profiles. |
| ML-32 | Subset Satoshi PDF fonts preserve tested Latin Unicode typography including em dash. This is not a claim of coverage of every world script. |
| ML-33 | XLSX normalizes/deduplicates phones and uses Phone 1/Phone 2 columns when needed. |
| ML-34 | Optimized shared artwork, XLSX compression and PDF font subsets: fixture files about 144 KB XLSX / 55 KB PDF. |
| ML-35 | Success closes export picker and records Open folder notification; verified existing path. |
| ML-36 | Native Save dialog opens before export generation. Cancel does no formatting work. |
| ML-37 | Safe bold/newline rendering; recent scan failures and Maps error supplied to Assist for troubleshooting. |
| ML-38 | Responsive root and resize relayout. Windows maximize test passes; original Linux compositor symptom not directly reproduced here. |
| ML-39 | Repeated event/run notices grouped; bell counts unread actionable/error notices, full history retained. |

## Verification

- Build and TypeScript checks passed. `npm run package:win` completed for 1.4.20; installer timestamp 30 October 2026, 17:34 PKT.
- Release audit: 16 core suites and 11 desktop suites passed collectively. The initial core run had two failures; both passed after correcting the old initials/logo expectations and pooled image-buffer handling. Final reruns: database 78/78; branded exports 24 rows with logo, columns and pagination.
- verify-qa-1.4.19.cjs: failed/empty outcomes, directory isolation, run scoping, counts, score consistency, PK/UK phones, XLSX columns, compact exports, friendly errors, restart persistence.
- verify-qa-1.4.19-ui.cjs: locked Maps/trial navigation and submission, key validation/show/activation, Lifetime card and hidden offers, lead details, visible finder errors, Social scan control, maximize width, no renderer exceptions.
- verify-qa-website.mjs: real server returns Terms; support/terms links, no retired CTA, no overflow/JavaScript errors at 1440px and 390px.
- Exported PDF rendered with Poppler and visually reviewed for branding, rows, headings, pagination and phone column width.
- Final packaged-app checks: `verify-qa-1.4.19-ui.cjs --packaged` passed trial/activation, failure states, details and maximization; `verify-saved-maps-searches.cjs --packaged` passed 21 checks including 1,005-row export, current-run isolation and persistence. GUI suites ran sequentially after an overlapping-window screenshot timeout; result screenshots now use the page rather than an animated element.
- Extracted the installer application payload and matched its app.asar SHA-256 to the tested packaged app: `545DEB16F8FB6CBF86C1C1235923B39363BBCCD25810BF835C2FB815726FAA05`.
- Installer SHA-256: `EF062A3B4DDF216E65B0BD69A16A58DDDAEDE5FA882D436087837B3ACB08D95F`. This local test installer is unsigned; no public release tag/update feed was published. The website retains the existing signed 1.4.19 download until a signed release is published.
- Checked all 5,145 packaged ASAR paths: private configuration and provider credential files are absent.

Tests use isolated profiles and fixture/mock services: no real payment, customer emails, activation-key consumption, or changes to the owner's saved workspace. Website accessibility and extraction cannot be guaranteed; failures now stay explicit.

The report's Linux keyring, localhost billing URL, missing Linux Chromium and xdotool-corrupted input were environment problems. It confirms activation of key ending 4F99; no replacement was needed.

## Pricing layout follow-up

The supplied reference informed the offer hierarchy while MamaLead branding and actual pricing were retained. The hero now leads with “Google Maps leads. Rs 10,000. For life.” and the paid CTA contains the price. Start free 1-day trial scrolls to Download for Windows. The first full section after the hero is Pricing, with Lifetime before Trial. No competitor savings, refund guarantee or video claim was invented.

Desktop/mobile browser checks passed at 1440px and 390px, including trial-button navigation to the Windows download section. Local preview: http://127.0.0.1:8798/#top. These website edits have not been deployed to production.
