# Website design and activation flow — 31 October 2026

Source: `Nafran Mamalead website.zip`, supplied by the owner. SHA-256:
`9910f33d0ac82a6b64b221a4428a2a4701bd01aaedf9fc8ba89a2eaa86e73ba9`.

The owner explicitly selected replacement of the current website and asked that the supplied design's instructions drive the app flow. The current `website/index.html` is this replacement, preserving the hero, red Lifetime offer, early pricing, download choices, trial popup and payment confirmation design. The owner has explicitly held deployment; this work must not be published until requested.

## Implemented flow

1. Free trial scrolls to Downloads and opens the email popup. A browser installation identity is created and persisted before requesting a trial.
2. The existing billing service sends the trial key. The sent state appears only after confirmed delivery. Failed delivery stays on the form. Refresh recovers the server-confirmed status without sending another key.
3. Before activation, the email can be corrected through the existing replacement-key API. A used trial cannot restart by changing email or browser identity on the same device.
4. Every Lifetime purchase button opens Stripe Checkout directly for Rs 10,000 PKR. The website has no Lifetime email form; Stripe collects the buyer's email. The existing billing service enforces one Lifetime key per normalized email when reconciling the verified payment. A duplicate payment is refunded through the existing protection and the website displays the server's notice instead of a success banner. The browser never receives a Stripe secret or license key.
5. Checkout returns to the website. Authenticated status reconciles Stripe's payment, checks the purchase, and emails the key. Query parameters or local flags alone cannot show payment success. Undelivered paid keys can be retried through status reconciliation.
6. After confirmed email delivery, the popup offers the Windows download. The first launch of a new desktop profile opens Settings & Billing → Account for activation. Existing profiles retain their usual start screen.
7. The browser purchase does not consume either of the two desktop Lifetime activation slots. The trial clock starts on desktop activation.

## Configuration and rollout

- Production API: `https://api.mamalead.com`, implemented by `billing-server/` on the current server. The legacy website-local Vercel functions are not the active deployment target.
- Deploy the updated billing server, website (including `billing.js`) and matching signed desktop release together when authorized. `APP_PUBLIC_URL` must be the intended HTTPS website origin, normally `https://mamalead.com`; the existing allowed-origin and email settings must include this site.
- Preview-only API override: `?billingApi=http://127.0.0.1:PORT`, accepted only when the page itself runs on loopback. Test suites intercept API requests and send no real email/payment.
- The supplied November 30, 2026 campaign deadline is retained as a configurable design property. The illustrative “37 left / 463 claimed” counters are disabled by default because they are not connected to sales records. The 50% offer remains visible.
- The launch-offer card uses the supplied compact reference: a 470 px maximum desktop width, outlined lock, separated discount and a red footer label. Until a claimed-license count is confirmed, that label states the actual Rs 10,000 saving instead of a sample sales total.
- Website Lookup no longer offers email validity. Its details and screenshots are described separately from Email Finder, where optional verification remains available.
- Decision Makers remains absent from the public website and app. Archived implementation is retained in the repository.

## Verification

- `node scripts/verify-billing-server.mjs`: 135 checks, including website trial delivery, correction/activation rules, direct Rs 10,000 checkout with Stripe-collected email, session reuse, duplicate-payment protection, unpaid returns, delivery retry, idempotence and both desktop activation slots.
- `node scripts/verify-website-billing.mjs`: real page UI with an intercepted API; all Lifetime buttons navigate directly to Stripe, double clicks and retry, trial delivery/correction/duplicate notices, refresh recovery, download choices, forged/duplicate return rejection and verified checkout handoff.
- `node scripts/verify-qa-website.mjs`: desktop, tablet and mobile layouts, navigation, Terms/support links, trial popup, readable mobile text, overflow, resources and renderer errors.
- `node scripts/verify-qa-1.4.22-ui.cjs --packaged`: new-profile Account landing plus existing activation and app regression scenarios.

These checks do not represent a real live charge, delivery to a customer inbox, a production rollout or signed release publication.
