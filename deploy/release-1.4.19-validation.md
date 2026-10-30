# MamaLead 1.4.19 release validation

Prepared 30 October 2026. Public rollout is performed separately through the guarded server publisher.

- Decision Makers is retired from the desktop and website. Its previous implementation remains in the restore archive branch.
- Current Windows website: eight module galleries, 24 packaged-app screenshots, 28 FAQs, Trial and Rs 10,000 Lifetime plans, correct logos and current scan/export/update workflows.
- Explicit LeadsAngel invalid/syntax and invalid/rcpt_rejected_550 results display Invalid. Inconclusive SMTP failures remain Unknown.
- Assist gives concise answers and current page directions; the server prompt no longer offers the retired owner-search feature.
- Private operator-issued Lifetime and one-day trial keys are separate from ordinary customer billing. No public key-issuance endpoint is available.

Validation: 16 core suites and 11 desktop suites passed. Fresh packaged end-to-end audit passed all ten pages, light/dark themes, trial activation, imports, exact 20-result Maps cap, saved lists, CSV/Excel/PDF exports, restart persistence and revoked-licence blocking, with zero renderer errors. External providers in that audit are deterministic fixtures. Separate real LeadsAngel checks returned valid, catch-all and rejected-mailbox responses and the installed mapping was verified. Seven Assist service tests and 19 owner-key tests passed. Website checks passed at 1440, 768 and 390 px, with no local HTTP or renderer errors.

Production billing is live: PKR 10,000 one-time Checkout verified without a payment. The former USD 30 price is inactive. Private owner testing access was activated using the normal licence path. Signing CI and the guarded installer/feed publisher must verify the final release artifact before publication.

Page-navigation performance regression: with 500 fictional leads and 200 saved runs, median click-to-paint improved from 661 ms to 289 ms and the slowest measured switch from 1,321 ms to 425 ms. Reused date formatters, batched layout measurements, theme updates limited to changes, immediate page scroll reset, and deferred offscreen row layout. First rows and search matches paint immediately. Light/dark, table responsiveness, finder search and notification tests pass. `node scripts/verify-navigation-performance.cjs` reproduces the fixture check without customer data.
