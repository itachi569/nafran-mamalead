# MamaLead 1.4.37 QA fixes

Reviewed on 3 November 2026 against `MamaLead-Full-QA-1.4.36-8025f0b.md`.
This records the original 3 November checks, followed by the 4 November release update below. Production rollout is pending the final combined commit approval.

## Reported bugs

| Issue | Change | Verification |
| --- | --- | --- |
| ML-132: template email saved as a business email | One shared placeholder policy covers visible text, mailto, structured data, rendered pages, shared-cache seeds and saved Website Lookup snapshots/exports. Generic off-site template mailboxes such as `contact@info.com` are rejected; genuine named mail.com contacts and a business's own domain remain eligible. | Extraction fixtures, cache persistence, historical lookup read/export and packaged upgrade checks pass. Existing template contacts are archived with their original source before removal; cleanup is transactional and idempotent. |
| ML-133: retired owner-search tests import missing modules | Removed 18 obsolete test/capture entry points, including the 11 reported tests. All are preserved in the existing Decision Makers restore archive; the archived feature documentation is labelled accordingly. | All 34 active compiled-module test imports resolve. The check now runs in verify-all and CI. |
| ML-134: flaky cache UI draft initialization | Seed localStorage before React initializes; wait for Maps location and assert the requested keyword, limit and location before Run. | Five consecutive isolated source runs and the packaged regression passed. CI repeats the test five times on Windows and Linux. |

The support page now has an Open Graph image. `.html` aliases redirect with HTTP 301 to clean URLs and preserve query parameters; GET and HEAD checks pass.

## One key, one machine

- Paid Lifetime activation is capped at one machine even if an older environment still specifies two.
- Repeat activation on the original installation remains valid. Copying its token to another device is rejected.
- Two simultaneous first activations have exactly one winner.
- Historical second-slot records remain available for audit but no longer authorize paid work. The original first slot remains active.
- Trial and private owner-issued keys retain their single-installation binding and original expiry rules. A trial is not restarted by repeat activation.
- Website terms/pricing, licence emails and admin capacity now describe one machine.
- This backend rule takes effect for customers only after the server changes are deployed. Normal updates/restarts preserve the current installation; this change does not add automatic licence transfer after a data wipe or to another PC.

Billing checks: **144 passed**. Admin checks: **60 passed**. Private Lifetime/trial checks: **20 passed**. Tests use isolated databases and simulated payments; no customer purchase, email or licence was changed.

## Desktop and provider checks

- `npm run package:win` completed for 1.4.37. This is a local, **unsigned** QA installer, not a signed production release.
- The installer was built on 3 November 2026 at 11:53 PKT (339,823,769 bytes). Its extracted executable and app archive match the tested packaged files byte-for-byte. Installer SHA-256: `13e7360df99369e72f08b57529f625894a4ab2c99850df3a8c6ba34f70378e81`.
- The packaged upgrade retains a genuine alternative email and archives the old placeholder exactly once.
- A fresh packaged profile contains zero leads, contacts, lists, runs, imports and exports. It opens at the licence field; unlicensed actions return there. All current pages render with no renderer errors, using an isolated local billing fixture.
- Packaged All Leads with 10,000 fixture rows rendered its first page in 533 ms on this PC. Paging, sorting, phone search, edit, deletion/Undo, saved-list actions, PDF/Excel export and Run History deletion passed.
- Package inspection found no saved user database or credential files. The private server CAPTCHA secret is absent from the package.
- 22 targeted email/contact regression tests passed.

The real LeadsAngel service was checked from the 1.4.37 packaged app using the existing private configuration, in an isolated profile. All three addresses were confirmed present on their source pages; the provider returned results for all three in 59 seconds:

| Published address | Provider result |
| --- | --- |
| `ceo@topstudyworld.com` | Invalid: mailbox does not exist, SMTP 550 / 5.1.1 |
| `hello@plausible.io` | Valid |
| `hello@brewteacompany.co.uk` | Valid |

These are the provider's observations at test time, not a delivery guarantee. Licence expiry reported by the saved configuration is 30 October 2031. No test messages were sent and the customer's database was not changed. The original fresh-profile DNS-only limitation was addressed on 4 November by the server-managed verification described below; the private provider key is never bundled into the installer.

## 200-lead Social Profiles question

The import limit is 500 unique website URLs. Controlled 50-site and 200-site tests exercised the real crawler/queue/database with simulated website responses, including retry, one blocked site, one site without profiles and out-of-order completion. The 200-site test completed all 200: 198 profile results, one not-published outcome and one error; later sites continued successfully. This demonstrates batch handling, not that every real business has a published social profile. Businesses without a usable website and duplicate website URLs can reduce the number of distinct sites scanned.

## Limits of this verification

- The production shared cache remains contribution-only; no production cache-serving switch was changed.
- A real cache hit and Cloudflare-proxied client-IP handling were not re-tested against production. Existing fixture tests cover those paths.
- The report's foreign-device Run History rejection is a licence-binding outcome. Run History was verified with an isolated authorized fixture, without resetting or moving a customer's licence.
- No production deployment, GitHub push, real payment, support ticket, trial email or customer-data reset was performed.

## 4 November combined release update

The installer was rebuilt at 20:24 PKT on 4 November (339,823,624 bytes). The earlier installer timestamp and hash above describe the earlier QA build, not this release candidate. The local build remains unsigned; production uses the signed release workflow.

Fresh installs now use the authenticated email-validity server relay without a local provider credential. Missing server configuration produces an unavailable message instead of calling DNS checks full verification. A packaged test covered 200 addresses in ten batches of 20, page navigation during verification, partial results, cancellation and an empty selected scope. Live public-address checks through the relay returned Valid for Plausible and Brew Tea, and Invalid for the Top Study World mailbox. No messages were sent.

The latest design-4 website, Mama AI, email-only admin support and licence-email copy page are included in the combined release. Desktop/mobile website, trial/download/checkout, quota/error handling and private copy-page tests pass. The final server build and signed installer are tracked in the release handoff; source preparation alone does not mean the changes are live.
