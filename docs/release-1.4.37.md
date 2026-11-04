# MamaLead 1.4.37 combined release

Prepared 4 November 2026. Production rollout is pending approval of the final server commit and the protected provider configuration.

- Latest supplied website design (Nafran Mamalead website (4).zip), including the Mama AI section, footer and support popup. Existing trial, Stripe checkout, download and payment-confirmation flows are preserved.
- Mama AI uses the existing server AI provider, a hidden daily allowance, CAPTCHA, rate limits and a clickable hello@mamalead.com handoff.
- Full email validity for licensed fresh desktop installs through the authenticated server relay. Provider credentials stay on the server. Results distinguish Valid, Invalid, Risky and Unknown; unavailable SMTP verification is reported honestly.
- Single-machine Lifetime activation, including concurrent activation protection. Existing customer history is preserved.
- Admin ticket interface retired in favour of direct email support. Historical records and compatibility delivery endpoints remain available for older app versions; no customer data reset.
- Licence emails include a Copy license key link to a private browser copy page. The key travels in the URL fragment, is removed immediately and is not sent to the server.
- QA fixes reject generic off-site template emails, preserve genuine contacts and repair the cache UI regression test. Retired Decision Makers test entry points remain in the existing restore archive.

## Validation

Local desktop and packaged tests cover fresh/upgrade profiles, licensing, all active pages, Maps limits/repeat scans, PDF/Excel exports, notifications and responsive navigation during scanning. Controlled 200-site social and 200-email verification batches complete without stalling. Live sampled Maps, social and email-provider checks passed; these samples do not guarantee every business publishes every contact or that every mailbox accepts delivery.

The 4 November rebuilt local Windows installer is for QA. The published installer must come from the signed Windows release workflow, have a valid Nafran LTD signature and pass the guarded server publisher before the update feed changes. No private provider key, customer database, test profile or production credential may be included.

The existing fleet-ops server is the deployment target, not Vercel. Shared lead cache serving remains contribution-only. Protected environment installation uses the prepared owner script; other billing, mail and CAPTCHA configuration must be preserved.
