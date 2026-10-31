# MamaLead 1.4.31 — local QA fixes and admin inbox preview

Date: 1 November 2026
Base commit: `6f2bd555bba898a1559243ead2948943157504de`
Status: local changes and QA complete for the checks below. **Not deployed.** Source is prepared for GitHub; release publication remains separate.

## Review the admin inbox

Preview: http://127.0.0.1:8812/admin/

This is a local, clearly labelled sample-data preview. Reply actions in this preview do not send customer emails.

- Needs reply, Replied and Closed queues show separate counts and plain explanations.
- Needs reply opens first. All messages puts pending tickets first.
- Customer name, message preview and Reply now are prominent; technical columns are removed from the main list.
- Reading a ticket does not mark it as replied. Read/unread is separate from reply status.
- The detail view separates the customer's message from Your reply and shows delivery status, including retry for failed delivery.
- Search supports customer name, email, ticket and subject. Extra filters and technical details are tucked away.
- Customer replies to outgoing email arrive in the support Gmail inbox; automatic inbound email synchronization is not part of this change.

## Licence flow

The welcome banner appears on Dashboard only. It is absent from the Account licence screen. A blocked feature opens Account, scrolls to and focuses the licence input, and creates the notification “Enter your license key first”. The notification is also saved in the existing notification system.

Fresh launch, installed-app deep link, website trial/Lifetime actions and trial-start notification were verified with isolated licence fixtures.

## QA report coverage

| Item | Implemented change | Validation / limit |
|---|---|---|
| ML-101 | Retry temporary 502/503/504 responses once; respect bounded Retry-After and cancellation. | Local HTTP failure fixtures pass. |
| ML-102 | Support alert plus customer receipt, independent delivery tracking, idempotent retries. | Mock mail tests pass. Live delivery remains a deployment check. `emailQueued: false` can correctly mean already sent. |
| ML-103 | Public support route, server-verified Turnstile, hostname/action checks, honeypot and rate limits. | Mock challenge/security tests pass. Production Turnstile keys must be configured and verified when deployed. |
| ML-104 | /support, /privacy, /terms and /thank-you aliases; /contact redirects to support. | Local route/browser tests pass. |
| ML-105 | Support canonical/OG metadata and clear field validation. | Responsive browser tests pass. |
| ML-106 | Vendored disposable-domain list, including subdomain matching. | Extraction and packaged pre-check tests pass. |
| ML-107 | Reject placeholder and image-file email false positives. | Email extraction fixtures pass. |
| ML-108 | Status accurately distinguishes basic DNS checks from provider verification. | Both modes tested in the extracted installer; DNS does not claim mailbox delivery. |
| ML-109 | Expanded common typo and role-address handling. | Validity reliability tests pass. |
| ML-110 | Reject platform-owned social handles. | Social import/canonicalization regression suite passes. |
| ML-111 | Detect explicit Maps no-result pages and all-unrelated Latin query results; preserve non-Latin query handling. | Focused fixtures pass. A live Google Maps regression scan was not run in this turn. |
| ML-112 | Run History denominator includes done, cancelled and failed runs. | 6 done / 9 total fixture passes. |
| ML-113 | Refresh Saved Lists on navigation and database changes. | Outside-created list and membership-change tests pass. |
| ML-114 | Lead edit, delete with 5-second Undo, list rename and run deletion. | Repository and Electron tests pass; run deletion preserves leads. |
| ML-115 | Trim list names, limit to 80 characters and flag duplicate names. | Repository tests pass. |
| ML-116 | SQL-backed sort and 100-row All Leads pages. | 10,000-lead first page rendered in 230 ms in the final extracted-build run. |
| ML-117 | Normalize local/international phone formats for search. | Pakistan and UK fixtures plus Electron search pass. |
| ML-118 | Immediate invalid-input samples and same-domain merge feedback. | Repository and Website Lookup UI tests pass. |
| ML-119 | Accurate Saved Lists capture counts and access to older 50-row pages. | Electron paging checks pass. |
| ML-120 | Label repeat-inclusive run totals explicitly. | UI assertion passes. |

The requested “Already have a key? Download the app” bypass link was removed from the website trial popup.

## Verification completed

- Typecheck, application build and Windows packaging.
- Database regression: 78/78; new app-sections and Maps relevance fixtures: 7/7.
- Email extraction, retry and validity fixtures: 11/11; social import tests: 55/55.
- Billing fixtures: 140/140; support security, receipts, retries, CSRF and admin support tests.
- Website billing/chooser/thank-you and responsive support form tests at 375, 768 and 1440 pixels.
- 2,000-lead database/export/UI suite: 16/16; Website Lookup UI suite.
- Source and extracted-installer app-sections tests: paging, sorting, edit/save, delete/Undo, list refresh/rename, run deletion, licence banner and redirect.
- Extracted-installer website-access and local/LeadsAngel validity-mode tests.
- Admin inbox browser tests, desktop/mobile visual review, UTF-8 and git diff whitespace checks.

Some Electron tests use DOM-dispatched clicks because native Playwright pointer delivery was slow in this Windows environment. They verify application state changes, not a guarantee about every physical pointer interaction. The first packaged notification assertion missed a transient popup; observing its appearance before triggering navigation confirmed it renders correctly.

## Installer

`release/MamaLead Setup 1.4.31.exe` — 339,567,840 bytes; built 1 November 2026 at 02:31:33 local time.

The installer payload was extracted to a short temporary path, its app.asar hash matched the packaged application, and that extracted executable passed the checks above. The initial extraction into the long workspace path hit a Windows path-length limitation; the short-path extraction succeeded.

This is an **unsigned local QA installer**. Production publishing must use the existing signing/release pipeline. No existing customer installation was overwritten.

## Before a production rollout

Deploy only when requested. Configure production Turnstile values, verify real support alert/receipt delivery and perform the live Maps smoke check. Tests here used isolated data and mocked mail/payment services; no real customer mail or payment was initiated.
