# MamaLead — Meta Pixel handoff for the marketing developer / Codex

Prepared: 4 November 2026, Asia/Karachi.

## Start here

The owner wants Facebook/Instagram Meta Pixel added to the existing MamaLead marketing website. This file supplies implementation context for another Codex session. It is a handoff, not an installed Pixel or a deployment approval. No Pixel ID was supplied and no tracking code was installed during preparation of this file.

Give the following instruction to Codex with this file attached:

> Read this handoff and the current repository's AGENTS.md. Inspect the latest website and preserve the owner's design, checkout, trial, download and support behavior. Add the Meta Pixel supplied by our marketer. Use the event definitions below, confirm which conversion events are in scope, and test success, failure and duplicate-event cases. Show the owner a preview, diff and test results. Do not deploy until the owner asks. Use MamaLead's existing server release workflow, not Vercel. Never upload customer records, credentials or desktop lead data to Meta.

## Links and access

- Live website: https://mamalead.com/
- Source repository: https://github.com/itachi569/nafran-mamalead
- Website source: https://github.com/itachi569/nafran-mamalead/tree/main/website
- Billing API: https://api.mamalead.com
- Owner admin dashboard: https://admin.mamalead.com/admin/ — private; not a Pixel target.

The source repository was verified PUBLIC when this file was prepared. The marketer can read/clone it without receiving the owner's GitHub password. Direct pushes require the marketer's own authorized collaborator account; otherwise use a fork and pull request. This file does not itself grant GitHub, Meta, server or admin access.

The production source repository is separate: https://github.com/aamirmursleen/mamalead . Access, if required, must be provided to the developer's own account by its owner. A website PR and an operator handoff are sufficient if the marketer has no production access.

## Source state verified during handoff

| Location | Observed state |
| --- | --- |
| Public source `main` | `8025f0bfed00479c89f6d0d6180eb34f25d330f3` |
| Public source `artifact-signing-windows-release` | Same commit as `main` above |
| Owner's local working branch | `artifact-signing-windows-release`, same HEAD, package version `1.4.37` |
| Owner's local working tree | Contains additional UNCOMMITTED app/backend/website fixes; these are not all on GitHub |
| Production source worktree | `/home/ahmed/mamalead`, clean `main`, HEAD `cd960e52811ed01a46e68e926aba614533707c08` |

These are dated observations, not permanent pins. Fetch current refs before starting. Local uncommitted changes include `website/index.html`, `website/core.mjs`, `website/server.mjs`, `website/support.html` and `website/terms.html`. Do not overwrite those changes or assume the public repository includes them. Coordinate with the owner for their latest website patch before merging; an isolated Pixel branch/PR can be prepared meanwhile. Never use `git reset --hard` or blanket staging to reconcile this workspace.

## Product and funnel to preserve

MamaLead is a Windows desktop app. The website markets it and handles trial requests, Stripe checkout and installer delivery. Decision Makers has been removed from the customer offering; old backend/archive references are not permission to restore it. Public Mac downloads are currently hidden.

The inspected website displays PKR Rs 10,000 for Lifetime, with a regular price of Rs 20,000. Treat these as current displayed copy, not a hard-coded source of transaction revenue. A free trial runs for 24 hours from activation inside the desktop app, with up to 300 Google Maps leads.

Current user flows:

1. Lifetime / Buy now opens Stripe Checkout directly; the website must not add a separate email-entry step. Stripe collects the buyer's email.
2. Trial opens the trial email form. Only confirmed successful delivery of the trial key unlocks the trial download instructions. Duplicate/invalid email and delivery errors remain errors.
3. A new visitor's general Download button opens the Lifetime / free-trial chooser. Preserve existing returning-user behavior and email-gated flow.
4. Verified website checkout returns to the thank-you page with download and activation instructions. Payment is checked through the billing API; a success-looking URL is never payment proof.
5. The customer runs the Windows installer and activates the key in Account. A browser download does not prove installation or trial activation.
6. Current public support email is `mamaleads997@gmail.com`. The proposed `hello@mamalead.com` migration is separate and was not completed by this handoff.

## Code map

Paths below are relative to the public source repository. Find the named functions instead of relying on line numbers.

| File | What it does / where to look |
| --- | --- |
| `website/index.html` | Main design, inline React/Babel UI, download chooser and trial modal. Functions `checkout`, `submitTrial`, `restoreBilling`, `startTrial`. |
| `website/billing.js` | `window.MamaLeadBilling`: browser identity, `trial(email, replaceExisting)`, `checkout()`, `status()`, support helpers. |
| `website/thank-you.html` | Confirmation design; `#payment-pending` and `#payment-confirmed`; loads billing and thank-you JS. |
| `website/thank-you.js` | `check()` polls `MamaLeadBilling.status()`, verifies success and removes the checkout query from the URL. |
| `website/sales.js` | Shared public-download link handling and small navigation behaviors; it is not the main checkout controller. |
| `website/support.html`, `website/support.js` | Support form and Cloudflare Turnstile integration. Preserve the form and its errors. |
| `website/privacy.html`, `website/terms.html` | Public policies; update advertising-tracking disclosure to match what is actually enabled. |
| `website/server.mjs` | Actual Node static server, clean-route aliases and a strict file allowlist. |
| `billing-server/core.mjs` | Active self-hosted billing handler; `/v1/trial`, `/v1/checkout`, `/v1/status`, payment reconciliation. |
| `billing-server/server.mjs` | Self-hosted billing service and storage integration. |
| `website/core.mjs`, `website/neon-store.mjs`, `website/vercel.json` | An alternate hosting adapter/config remains in source. Do not assume it is the active production backend. |

Critical serving detail: `website/server.mjs` serves only filenames matching `allowedFile`. A new `website/analytics.js` will return 404 until the allowlist explicitly permits it. If adding CSS, also inspect the MIME map and allowlist. Check cache behavior for modified/new JS so a release cannot leave stale tracking logic in the browser.

The inspected source contains no existing `fbq`/Meta loader or Google Tag Manager installation. Check again before implementing, including any live Cloudflare/Tag Manager injection, to avoid installing the same Pixel twice. A live homepage HEAD request returned HTTP 200 with no Content-Security-Policy header at handoff time; inspect current HTML, response headers and edge rules rather than assuming this remains true.

## Required input from the marketer

- The correct Meta Pixel / dataset ID, or the base-code snippet from the intended Meta Events Manager dataset. Do not invent an ID.
- Access to that dataset's Test Events and Diagnostics, and confirmation that it belongs to the intended ad account/business.
- Which conversion events the campaign needs. The table below is the proposed mapping.
- The agreed marketing-consent behavior and markets being targeted. Preserve essential billing and support storage independently of optional ad tracking.

The browser Pixel ID is a public identifier. Stripe, Resend, SSH, Meta Conversions API and other secret credentials must not be placed in frontend code or this handoff. Conversions API is a separate optional implementation, not an automatic requirement for a browser Pixel task.

## Proposed event definitions

| Event | Correct trigger | Must NOT count as this event |
| --- | --- | --- |
| `PageView` | Once per eligible page navigation after marketing tracking is permitted. | React re-renders, modal opening, hash scrolling, repeated initialization. |
| `Lead` | A new trial request successfully completes and the backend confirms `emailSent === true`; recommended hook after `MamaLeadBilling.trial(...)` resolves in `submitTrial`. | Clicking Free trial, typing an email, failed/duplicate requests, restoring an earlier trial after reload. |
| `InitiateCheckout` | An explicit Lifetime action successfully obtains a valid Stripe checkout URL and begins navigation. | Hover/focus prewarming, a failed checkout API call, every button on screen registering its own duplicate event. |
| `Purchase` — only if included | A newly completed, verified paid Stripe Lifetime purchase, with authoritative amount, currency and a stable non-secret event identifier. | Merely opening `/thank-you`, a URL containing `checkout=success`, an unpaid/failed/refunded session, private owner grants, an existing Lifetime user revisiting, or a failed API request. |
| `DownloadApp` — optional custom event | The user deliberately starts an authorized Windows download. | Trial signup, installation completion, or licence activation. A click alone must not be labelled a completed installation. |

Do not fire `StartTrial` on the website email request: this app starts the 24-hour trial clock only when the key is activated in the desktop app.

### Important Purchase limitation in current code

`thank-you.js` currently shows confirmation when `status.lifetime?.active` and `status.purchaseEmail` exist. Its status call can repeat on polling/reload. Do not simply place an unconditional `fbq('track', 'Purchase', ...)` inside that block: it can count the same entitlement repeatedly, and entitlement alone is not a new transaction.

If Purchase is requested, first inspect the current API response. It must distinguish a verified paid transaction from trial/complimentary grants and expose the safe transaction metadata needed by tracking. If it does not, propose and test the smallest authenticated backend addition; otherwise deliver the base Pixel/non-purchase events and explicitly mark Purchase as pending. Never claim purchase tracking works by hard-coding the displayed price or guessing a session ID.

Use the actual server-confirmed amount and currency. For a PKR 10,000 payment, the event value is `10000`, not a formatted currency string or the Stripe minor-unit amount. Record one conversion per transaction. A browser duplicate guard helps but does not guarantee cross-device deduplication. If browser Pixel and Conversions API are later combined, follow current Meta event-ID deduplication guidance and use one stable event ID for the same conversion.

## Implementation constraints

- Put shared tracking logic in one small module/configuration and initialize the intended Pixel once. Do not inject it into the Electron desktop, owner admin dashboard, API JSON or payment-provider pages.
- Keep the current black/sage design and download, trial, checkout, CAPTCHA and support flows working. Third-party tracking must never block Stripe navigation or cause form submission to fail.
- Load asynchronously. Missing Pixel config, script errors, ad blockers and network timeouts must be harmless to the website. Do not await tracking delivery to start checkout.
- Implement agreed consent behavior: where opt-in is required, no Pixel request/cookie or unconditional noscript beacon before consent. Test accept, reject, reload and withdrawal. Update disclosure to match actual behavior, without making unsupported legal claims.
- Do not send customer email fields, licence keys, browser installation tokens, support messages, scanned lead records or card information in event parameters. Automatic advanced matching is not authorized by this handoff.
- Pixel libraries may collect the current URL automatically. Do not initialize them while checkout session IDs, access tokens, email addresses or other sensitive query/hash values remain in the visible URL. Preserve any data the existing flow needs privately, sanitize the address first, and do not break return verification. Keep allowed campaign attribution parameters only under the agreed consent rules.
- Keep one event source for each action. A direct Pixel install plus Tag Manager's copy will duplicate events. Use documented Meta code from the correct dataset and review supplied snippets before adding them.
- Preserve keyboard focus, responsive layouts, existing loading notices, download recovery, one-email trial handling and payment verification.

## Local setup and tests

Read repository instructions and its current Node requirements. The existing backend tests use `node:sqlite`, so use a compatible Node 22+ release. Work on a new branch in a clean clone/worktree; do not modify the owner's unrelated uncommitted fixes.

Example checkout:

```sh
git clone https://github.com/itachi569/nafran-mamalead.git
cd nafran-mamalead
git switch -c marketing/meta-pixel
npm ci
```

Example Windows PowerShell preview, from the repo root:

```powershell
$env:LANDING_ROOT = (Resolve-Path ./website).Path
$env:LANDING_HOST = '127.0.0.1'
$env:LANDING_PORT = '8815'
node website/server.mjs
```

Open `http://127.0.0.1:8815/`. If the port is occupied, choose another unused port. Existing `billing.js` defaults to the REAL production API even on localhost; do not submit real trial forms or start real checkout during automated QA. Reuse the existing intercepted/mock API tests below. Live email sends and real payments need explicit instructions.

Relevant existing checks:

```sh
node scripts/verify-public-pages.mjs
node scripts/verify-website-billing.mjs
node scripts/verify-website-support.mjs
```

`verify-website-billing.mjs` starts an isolated preview and intercepts billing endpoints, including trial failures, duplicate handling, checkout and paid/unpaid confirmation. It is a useful location for tracking assertions. The support suite uses a fixture mail provider/CAPTCHA, not customer mail. If the billing backend changes, also run `node scripts/verify-direct-checkout.mjs` and relevant billing regressions. Use project-supplied Playwright/browser setup.

Add meaningful event checks, preferably intercepting/stubbing the Pixel rather than sending fixture conversions to the production dataset:

1. Correct Pixel ID; one permitted PageView; no duplicate loader after modal/state changes.
2. No tracking before required consent or after rejection/withdrawal; the business flow still works.
3. One Lead after a new successful trial delivery, zero on invalid/duplicate/failed requests and restoring a prior request.
4. One InitiateCheckout for a successful explicit checkout; none on prewarm or error. Tracking must not introduce a visible checkout delay.
5. If Purchase is in scope: verified paid success only; correct real amount/currency; no duplicate on polling, retry, back navigation or reload; zero for fake URLs, owner grants, unpaid/refunded/error states.
6. New script is actually served with the right content type; no JS errors on homepage, support and thank-you pages; no mobile overflow at 390/768/1440px.
7. A blocked Meta script does not break trial, support, download or Stripe checkout.
8. Review event payloads for sensitive data and URL leakage.

Finally, use the intended dataset's Meta Test Events/Pixel Helper to verify real browser receipt in an authorized test. A unit test or network request alone is not proof that Events Manager received a conversion. Report any account access or browser blockers honestly.

## Production handoff

Hosting is the owner's existing self-hosted server behind Cloudflare, NOT Vercel. Do not create a replacement deployment or change DNS for a Pixel install.

The server's production source layout differs from the public source:

| Public source | Production source |
| --- | --- |
| `website/` | `landing/` |
| `billing-server/` | `app/` |
| `admin-dashboard/` | `admin-dashboard/` |

Confirm this mapping and the deployed service before applying patches; it is not permission to copy whole folders over existing production source.

The authorized server operator uses `/home/ahmed/mamalead`. Read both `/home/ahmed/AGENTS.md` and the worktree's `AGENTS.md` at deployment time. The observed workflow uses:

- `mamalead-publish --check` for a read-only readiness check.
- `vm115-build` and `vm115-playwright` for fleet build/browser checks; no browsers/builds directly on fleet-ops.
- `mamalead-publish` to validate, push the canonical repository and publish approved changes.

The existing release guard requires exact-commit owner approval for homepage/public asset and certain other protected changes. A new Pixel patch is not covered automatically by an old approval. Prepare the tested commit and evidence, then let the authorized owner/operator use the established workflow. Do not edit runtime files under `/opt/billing` or `/srv/nafran-site`, bypass the guard, share SSH identities or ask the marketer to reuse someone else's credentials.

The current request authorizes creating this handoff only. Pixel deployment should happen after the owner requests it. Pixel-only website work does not require a desktop installer update; if desktop code/assets/build configuration are changed, follow the repository's installer rebuild rule.

## Deliverables back to the owner

- Pixel ID and the dataset name confirmed with the marketer.
- Branch/PR and exact commit, plus a concise list of changed files.
- Events enabled and their tested triggers; explicit note if Purchase or CAPI is not included.
- Preview screenshots and automated test summary.
- Meta Test Events evidence from an authorized test, without customer data.
- Deployment status (preview only / pushed / actually deployed), live verification results and rollback commit if published.

## Official references to consult

- Meta Pixel setup: https://developers.facebook.com/docs/meta-pixel/get-started
- Meta Pixel event reference: https://developers.facebook.com/docs/meta-pixel/reference
- Pixel/CAPI deduplication: https://developers.facebook.com/docs/marketing-api/conversions-api/deduplicate-pixel-and-server-events

Meta's documentation fetch returned HTTP 429 during preparation of this handoff. Open the current official docs/Events Manager in your own session before choosing SDK details; this file's event table is a proposed project mapping, not a claim that the latest provider documentation was fully retrieved.

## What this file does not contain

No full chat transcript, passwords, SSH private keys, Stripe/Resend/Cloudflare/Cerebras credentials, customer databases, support conversations or licence keys are included. Unrelated Cloudflare mailbox setup and desktop QA work are outside this marketing task.
