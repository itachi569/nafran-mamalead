# Decision Makers repair — 1.4.18

This local Windows build includes the existing updater, notification and Assist changes plus the owner lookup repair. It has not been published to the public download/update feed.

## Causes and changes

- The normal desktop window was still running the older `release/win-unpacked` copy. Source fixes and isolated test builds had not replaced that running process. The refreshed local app is now in `release/owner-lookup/win-unpacked`.
- Email discovery waited for every free index and sitemap before starting the paid search. Independent searches now run together and a readable, matching source can return immediately. Cancellation still propagates, and cofounders share page reads.
- A fully quoted company domain hid some external contact profiles. The paid email query now searches the already-established full owner name; the fetched evidence still has to match the business.
- Customer quotes, guest-founder articles, combined founder/CEO roles and navigation fragments could become owners. These are filtered; a second role such as `Co-founder, President` remains valid. JSON-LD founders with `givenName` and `familyName` now work.
- External owner discovery requires an explicit reference to the target website. A brand match alone cannot substitute a different business with the same name.
- When a source cannot be read, an explicit search-index email can be retained only after establishing the owner independently and matching one unmasked, person-specific mailbox on the exact business domain. Generic inboxes, patterns, samples, unrelated domains and masked addresses are rejected. A readable page that no longer publishes the email does not fall back to its stale snippet.
- Indexed email evidence is labelled in the app and both export formats. It is not labelled as live-page or mailbox verification. An additive SQLite column preserves this distinction across restart and incomplete rescans.

## Validation

- `scripts/test-owner-discovery.cjs`: 15 regression groups, including same-brand companies, structured names, founder role combinations, parallel lookup, cancellation and indexed evidence rejection cases.
- `scripts/test-owner-evidence.cjs`: legacy database migration, source preservation on interrupted retries, evidence upgrades, clearing completed empty results, deduplication and exports.
- Existing captured-page suites cover Shopify, CalendarJet, Plausible, Fathom, Grow & Convert and Haber Law, along with short-name resolution, sitemaps and shared cofounder reads.
- Isolated Electron UI checks exercised the real queue, progress, one result/one allowance unit, the evidence label, PDF and Excel output, and renderer errors. No customer database or actual billing was used for these controlled checks.
- The packaged app was verified against the compiled modules. Private keys, `.secrets`, environment files and customer databases were absent from the ASAR.

## Live sample and limits

Ten different sites were checked. These are observed outcomes, not a guarantee of coverage:

| Site | Latest observed result | Approximate seconds |
| --- | --- | ---: |
| Namecheap | Founder and explicit indexed business email; source page blocked direct reading | 18 |
| Grow & Convert | Two founders and two emails on published company pages | 4 |
| Haber Law | Founder and published email | 5 |
| Plausible | Two founders; one published owner email | 12 |
| Simple Analytics | Founder; no matching email verified in this pass | 9 |
| Transistor | Both founders identified; no matching email found | 11 |
| Tally | Unrelated Tally accounting founders and customer quotes rejected; no accepted owner in final pass | 12 |
| Awwwards | Guest founders rejected; no accepted owner in this pass | 24 |
| Carrd | Website request timed out; no accepted owner | 14 |
| Balsamiq | Website/search time limit reached; no accepted owner | 43 |

Provider timeouts, blocked pages and missing public contacts remain possible. A failed or empty lookup must not be represented as a verified contact. The indexed fallback can also be outdated; its weaker provenance is visible.

The broad legacy `scripts/test-database.cjs` suite still fails its earlier multi-email/suggestion assumptions. Re-running with the pre-change `a8546d7` repository module reproduces the same failures. Those failures are separate from this repair; the focused migration and owner export checks pass.

Full local audit outputs and screenshots are in the workspace `outputs/MamaLead-owner-current-audit` folder. The customer database was backed up outside the repository before reopening the updated app. The local installer is unsigned; public signed publication is still a separate release step.
