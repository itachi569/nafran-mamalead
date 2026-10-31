# Website download choices and checkout response

New visitors who click Download for Windows now see the supplied Lifetime / free 1-day trial chooser immediately. Dedicated trial buttons still open the email form. Returning visitors with an emailed key retain their download instructions; verified buyers retain direct download.

All Lifetime links prepare the browser identity on pointer/focus/touch intent. This does not create Stripe sessions, send email or charge a payment. App-to-website Lifetime links start checkout without a redundant status request. The existing immediate loading notice, retry and double-click protection remain.

The billing service caches only the validated Stripe catalogue price for 60 seconds and shares concurrent price reads. Reopening an unpaid checkout retrieves its current session and expanded line items once. Payment, refund, duplicate-email and licence verification remain fresh.

Validation: 140 billing checks, cache concurrency/expiry/provider-failure tests, browser checkout/trial/download/recovery tests, responsive website and support tests. No desktop code or installer changes are required; Windows remains 1.4.30. Live latency must be measured after the guarded website/backend rollout.
