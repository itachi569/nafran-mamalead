# MamaLead 1.4.23 — QA report follow-up

Date: 2026-10-31. Source reports: `MamaLead-All-Bugs-v1.4.22-9b143ea.md` and its expanded `(1)` copy. The expanded report contains 12 open app issues (ML-79–90) and 6 older website issues to recheck.

## App fixes

| Issue | Change | Verification |
|---|---|---|
| ML-79 | Completed lookups refresh the latest session; all-failed retries retain their own archived row and error. | Real Electron Retry failed interaction, refresh, database restart. |
| ML-80 | Shared singular/plural wording for websites, sites, errors, leads and details. | Single-site scan and notification checks. |
| ML-81 | One-time transactional cleanup archives untouched failed import placeholders. Maps records, manual contacts, edited names, saved-list entries and successfully read rows are preserved. Legacy imports without reliable scan counts are labelled explicitly. | Isolated legacy database, recoverable originals, idempotency and foreign-key checks. |
| ML-82 | Lookup totals include unreadable websites that were not saved. | New + reused + not saved matches the scan total, including an all-failed retry. |
| ML-83 | Negative MailVerifier responses, including “not deliverable”, take priority over positive words. | Parser regression cases. |
| ML-84 | Disposable, catch-all and role flags downgrade provider results to Risky, even when status says valid. | Apify and LeadsAngel fixtures; never stored as verified. |
| ML-85 | Local syntax, typo, MX, null-MX and A/AAAA checks precede provider calls. DNS results are cached; uncertain DNS remains Unknown. Role inboxes are identified. Verification details expose the reason and typo suggestion without changing the published address. | DNS fixtures plus real Electron validity IPC: only selected leads checked, results persisted, Stop works. Local Unknown results can be retried. |
| ML-86 | Instagram profilecard URLs normalize to profiles. Public Facebook share redirects resolve within a bounded deadline and are cached. | Canonicalization/redirect fixtures; external or private redirect targets rejected. An unresolved share is not falsely presented as a business profile. |
| ML-87 | Normal browser headers and one bounded hidden-browser read on homepage HTTP 403/503. No repeated rendering after the scan deadline. | Public sites listed below; browser fallback, challenge and cancellation checks. |
| ML-88 | Prefer published handles matching company/domain over the first HTML link. A stronger match can replace an earlier scraped weak match; manual selections remain protected. | Both candidate orders and saved-result replacement. |
| ML-89 | Exclude platform-owned, site-builder and “Designed by” credit links. | Synthetic footer/metadata cases and existing social-profile regression suite. |
| ML-90 | Supported `[at]`/`[dot]` and `(at)`/`(dot)` addresses are extracted, retained with source evidence and marked low confidence. | Two obfuscated forms; no mailbox-validity claim from extraction. |

## Public website checks

Read-only social checks using the actual scanner on this machine:

| Site | Result | Observed time |
|---|---|---|
| almeezangroup.com | 6 published social profiles | 7.0 s |
| dentistdrbilal.com | Instagram and Facebook | 2.1 s |
| rahmanandrahmanpackages.com | Published candidates found; company handles win over personal handles | 2.0 s |
| packages.com.pk | LinkedIn, Facebook and Instagram after bounded-render improvement | 6.8 s |

These are observations, not speed or coverage guarantees. Public sites may change or block access. Login, CAPTCHA and explicit access-denied pages are not bypassed.

## Website and download flow

- ML-01/03: Terms and support links work.
- ML-02: Retired Decision Makers subscription CTA absent.
- ML-51: Live Windows download HEAD returned HTTP 200 with installer metadata. The current public file is **MamaLead-Setup-1.4.21.exe**; this task does not publish a new release.
- ML-52/53: Desktop/tablet/mobile navigation, 44px mobile navigation targets, readable text and no horizontal overflow verified.
- Trial: email validation → confirmed key delivery → Windows download. Same-email reuse is rejected; delivery failure does not show a success message.
- Lifetime: every CTA goes directly to Stripe; no website email form. Stripe collects the email. Verified payment/key delivery is required before confirmation.
- The download was clicked and the browser emitted a successful file download. It does not execute an installer automatically.
- On first app launch after installation, **Settings & Billing → Account** opens with the activation field. Existing users retain their saved workspace.
- Website copy now explains that first launch and the distinction between local email-domain checks and provider mailbox verification. Email validity remains exclusive to Email Finder, not Website Lookup.

## Test scope and release state

New QA backend and Electron UI checks, prior 1.4.22 regression tests, social parsing/repair, LeadsAngel parsing/batch polling, email retry/cancellation/filtering, website desktop/mobile and checkout/download tests passed. Billing server fixture suite: **135/135**. The tests use isolated databases and profiles; they do not issue real licences, send trial email or charge Stripe. Paid mailbox verification responses are covered with fixtures, not represented as fresh live SMTP confirmation.

Windows installer rebuilt successfully with `npm run package:win` and `--publish never`, using the D: build directory to preserve C: free space. The packaged v1.4.23 executable passed the isolated Electron UI checks above; its bundled runtime matches the tested build. The installer's embedded archive passed its integrity check.

- File: `MamaLead Setup 1.4.23.exe`
- Built: 2026-10-31 15:53 PKT; 339,508,574 bytes.
- SHA-256: `f2012580f4320e897499a5aa7ff00c9f97463ae7a9e8bb3525baaf26d9bf1693`
- Signature: **NotSigned**. This is a local review installer, not the signed public release.

The existing owner installation/profile was not replaced. A full installed-version auto-update cycle and production signing/publication are release checks, not claimed by these local tests. Deployment and publication remain on hold until requested.
