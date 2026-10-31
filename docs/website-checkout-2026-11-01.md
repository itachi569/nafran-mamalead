# Website download choices and checkout response

New visitors who click Download for Windows now see the supplied Lifetime / free 1-day trial chooser immediately. Dedicated trial buttons still open the email form. Returning visitors with an emailed key retain their download instructions; verified buyers retain direct download.

All Lifetime links prepare the browser identity on pointer/focus/touch intent. This does not create Stripe sessions, send email or charge a payment. App-to-website Lifetime links start checkout without a redundant status request. The existing immediate loading notice, retry and double-click protection remain.

The billing service caches only the validated Stripe catalogue price for 60 seconds and shares concurrent price reads. Reopening an unpaid checkout retrieves its current session and expanded line items once. Payment, refund, duplicate-email and licence verification remain fresh.

Validation: 140 billing checks, cache concurrency/expiry/provider-failure tests, browser checkout/trial/download/recovery tests, responsive website and support tests. No desktop code or installer changes are required; Windows remains 1.4.30. Live latency must be measured after the guarded website/backend rollout.

## Approved payment confirmation page

Website Stripe checkouts now return to `thank-you.html`. The approved MamaLead design includes a logo watermark, the Rs 10,000 Lifetime pass, the actual delivery email, direct Windows download, activation steps and support. It verifies payment and key delivery through the existing browser identity before displaying success. Forged URLs, unpaid sessions, failed delivery, unavailable status and a different browser show a recoverable confirmation state. Existing checkout sessions returning to the homepage redirect to the same page after verification.

The signed Windows 1.4.30 fresh-install test confirms that the app opens Account with the license-key field. The thank-you page also provides `mamalead://billing` for an existing installation. The customer downloads and runs the installer; browsers do not execute downloaded installers automatically.

The browser suite checks confirmed/unfinished/failed payment states, retry, reload, direct download, legacy return redirects, missing assets and responsive layouts at 1440, 768 and 390 pixels. Payment and email fixtures are used; no live purchase or license email is sent by these tests.
