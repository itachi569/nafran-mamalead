# MamaLead 1.4.30

The approved website design now handles trial registration and Lifetime checkout. The desktop Usage page links to that website; Account keeps licence activation and usage. Lifetime opens Stripe directly, with email collected by Stripe. Trial and direct-download actions request email before revealing the installer. Website success states depend on confirmed backend delivery and payment status. A fresh desktop profile opens Account activation, and activating a trial produces “1-day trial started”.

The website Contact Support form uses the same authenticated ticket API and admin inbox as the desktop form. Drafts, retry identifiers, rate limits, duplicate prevention, field validation and failure recovery are covered. Visitor-provided licence suffixes are recorded as a message note, never trusted as authenticated licence metadata. The redundant sidebar support link is removed; Account > Help & support remains.

The selected support inbox is `mamaleads997@gmail.com`, including offline contact fallback and licence-email links. Transactional email retains the existing verified sender. Website runtime dependencies are served locally so checkout and support do not depend on a third-party script CDN. Lifetime emails no longer advertise the retired Decision Makers add-on.

Social lookup retries a temporary HTTP 503 before attempting browser rendering. Access denials stop without repeated requests. Email validity keeps completed provider results when the remaining addresses reach the deadline, including callers without a streaming callback.

## Validation

- Core release audit: 16/16 suites, including billing, DB, exports, Maps limits, Assist, updates, email selection and social extraction.
- Desktop audit: all 11 suites pass after isolated reruns; fresh/restarted profiles, ten pages in both themes, licence revocation, 2,000-row search, imports, saved Maps exports, lookup persistence and notifications.
- Packaged app: Account, Payment, Invoices, website handoff, first-launch activation, trial-start notification, support drafts/retries and compact layouts.
- Website: checkout/trial/download behavior, duplicate-email rejection, unverified payment recovery, support ticket persistence, mobile and desktop layouts. Payment and support email providers are fixtures; no real payment or support email is sent.
- Social queue: 8/8 cases, including 50 sites, failed and slow sites, partial results, retry and Stop.
- Version 1.4.30 follow-up checks: 139/139 billing checks; packaged support and website activation flows; website mobile/desktop and checkout tests; VM115 backend build and candidate browser checks.
- Live public-site checks: Brew Tea Company, Plausible, Toronto Cupcake, Balsamiq and Fathom each returned published social profiles and a main email. Live SMTP validity returned three Valid, one catch-all Risky, and one still pending after the provider deadline. Pending is not treated as Valid.

## Deployment

Use the existing MamaLead server and its canonical repository, VM115 checks, release guard, and signed-installer publisher. The server update preserves its existing Windows update-feed handler. Support needs `SUPPORT_INBOX=mamaleads997@gmail.com` in the protected billing environment and reuses existing Resend/EMAIL_FROM settings. No secrets are packaged or committed.

The local QA installer is not a production signing artifact. Production publication requires the Nafran LTD signed installer, matching blockmap and update metadata from the Windows release workflow. Homepage and support-table schema changes remain subject to the server's exact-commit guard.
