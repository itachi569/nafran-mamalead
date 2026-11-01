# MamaLead 1.4.32 — QA fixes and Turnstile setup

Status: source fixes and Windows installer built. Packaged UI, Website Lookup and validity-mode checks passed. Not deployed to the server.

## New app issues

| ID | Change |
| --- | --- |
| ML-121 | Saved list cards now open their members. Remove a member, export only that list as PDF/Excel, or delete the list with a five-second Undo. Removing a list/member keeps the underlying leads in All Leads. Members are paged 50 at a time. |
| ML-122 | One phone normalizer is used by HTML/tel/JSON-LD extraction, Maps, database contact writes and manual edits. Pakistani local, +92, 0092 and bare 92 formats merge; erroneous +920 prefixes are repaired and invalid lengths rejected. Valid international numbers retain their country codes. Ambiguous national numbers are not assigned an invented country. Existing changed/removed phone values are archived in data_quality_repairs before a one-time transactional repair. |
| ML-123 | Escape closes the lead drawer, keyboard focus stays inside it, backdrop clicks close it, and a successful Save closes it and refreshes the saved lead. Failed saves retain the edit form. |
| ML-124 | Maps Has website/No website uses the business-website policy. Facebook, Instagram, YouTube, WhatsApp and Linktree do not count as a business website. Their profile links remain saved separately. |
| ML-125 | Website Lookup counts social/directory URLs as skipped, explains the reason before scanning and retains discarded samples in the scan history. All-social input cannot create an empty scan. |
| ML-126 | A single selected lead uses singular wording in the delete/Undo notice. |

## Website and support

- ML-103: the provided keys are stored only in ignored .secrets/mamalead-turnstile.env. The billing service loads this private file locally; TURNSTILE_CONFIG_FILE can select a protected server path. Existing environment variables take precedence. Only the public site key is exposed by /v1/support/web/config. The form posts to /v1/support/web, with server-side token, action and hostname checks.
- ML-102: emailQueued=false is expected when both emailSent and receiptSent are true. Failed notifications are persisted and retried independently. Sanitized failure logs include ticket ID and delivery phase, with no credentials or message content. Tests verify actual delivery flags and retries, not a false alarm for successful mail.
- ML-104: clean routes /support, /privacy, /terms and /thank-you return 200 locally; /contact redirects to /support and preserves the query string. These existing source fixes still need rollout.
- ML-105: all five pages now have title, description, canonical and Open Graph metadata. Referenced social-preview images resolve.
- Production server, Cloudflare settings, live mail delivery, Stripe payments and public download feeds were not changed.

## Turnstile verification

The supplied private config loaded successfully. A request to the real Cloudflare Siteverify endpoint returned HTTP 200 and invalid-input-response for an intentionally invalid token. No invalid token was accepted, and no secret appeared in the public config. This is a configuration/rejection check, not a completed human challenge. A full real-host CAPTCHA check on mamalead.com remains part of the future deployment smoke test.

The browser integration test uses a temporary private key file, the real billing handler and SQLite ticket storage, with Cloudflare and email delivery mocked. No real support emails were sent.

## Regression checks

- Build / TypeScript: pass.
- Focused QA, import, phone, storage and secret-loading tests: 15/15 pass.
- Database regression checks: 78/78 pass.
- Billing regression checks: 140/140 pass.
- Maps browser fixture: any / has / none filters, social links and requested result cap pass.
- Contact crawl: sitemap/contact-page discovery and extraction pass.
- Main-email selection / archived alternatives checks pass.
- Public page routes, metadata, image URLs and private-file rejection pass.
- Public support security and browser integration checks pass.
- Extracted-installer UI: pass, including 10,000-lead paging/sort, lead editing and closing, Saved List member removal, scoped PDF/Excel exports, list deletion/Undo, run deletion and licence redirect. First-page render in this fixture: 402 ms.
- Extracted-installer email validity: DNS-only and LeadsAngel provider modes both pass. These are isolated mode/configuration checks; no real verification credits or customer mail were used.
- Packaged Website Lookup: mixed/all-social rejection and explanations, actual scan counts, sitemap contacts, CSV/Maps imports, PDF/Excel selection scope, failed-site handling, reload recovery and dark mode pass. This test used the unpacked build whose ASAR hash matches the extracted installer.
- Live phone extraction: [Loafology](https://loafology.com/pages/contact-us) returned 8 unique valid-format numbers in about 3.1 seconds; [Flow](https://flowspecialtycoffee.com/) returned 1 in about 0.8 seconds. Published numbers were canonicalized and duplicates removed. This checks extraction and number structure, not whether a number is currently answered.

## Local installer

- File: `release/MamaLead Setup 1.4.32.exe`
- Built: 2026-11-01 13:52:06 +05:00
- Size: 339,570,117 bytes
- SHA-256: `3D56ACE249DD9186A8BFBB429371EDBC7CC6A47E95E7060D3372DD921FAA8CEA`
- Local QA installer is **unsigned**; it has not replaced the signed public release.
- Extracted installer ASAR matches the build. Package contains version 1.4.32, no private key file and neither supplied Turnstile key value.

## Useful commands

    node --test scripts/test-qa-1432.cjs scripts/test-app-sections.cjs scripts/test-email-extraction.cjs scripts/test-turnstile-config.mjs
    node scripts/test-database.cjs
    node scripts/verify-maps-website-filter.cjs
    node scripts/verify-contact-crawl.cjs
    node scripts/verify-main-email.cjs
    node scripts/verify-web-support-security.mjs
    node scripts/verify-website-support.mjs
    node scripts/verify-public-pages.mjs
    node scripts/verify-billing-server.mjs
    node scripts/verify-app-sections.cjs
    node scripts/verify-email-validity-mode.cjs
    npm run package:win -- --publish never

Set MAMALEAD_TEST_EXE to the freshly extracted installer payload when running the two Electron UI checks. Tests use temporary workspaces and mock billing; the customer's saved data is not used.
