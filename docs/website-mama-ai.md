# Mama AI website chat

The homepage's fixed support launcher opens Mama AI in the MamaLead black, cream and sage theme. The support email is always available as a `mailto:hello@mamalead.com?subject=MamaLead%20Support` link. The same link is used when an AI answer mentions the support address.

## Behaviour

- Short MamaLead product answers in the visitor's language. Roman Urdu stays in Latin letters. The assistant explains features, Windows installation, the one-day trial and Rs 10,000 Lifetime checkout; it does not perform account actions or promise delivery of unpublished contacts.
- Six successful answers per UTC day. No quota, message count or remaining indicator is displayed. The sixth answer includes a support handoff. Later requests receive the handoff without calling the provider.
- Quota is enforced by the API using a keyed hash of the trusted client IP. Visitors sharing one connection share an allowance. Refreshing, another tab or clearing browser storage does not reset it. Chat text is kept only in sessionStorage for the current tab/day and sent to Cerebras for replies; the API persists usage counters, not messages.
- Failed, empty or truncated provider replies release their quota reservation. Duplicate in-flight requests from the same connection are rejected. There is a 300-answer daily public-chat budget, a 3-request concurrency bound, and the existing 2,000/day shared Assist budget.
- Email remains available when chat cannot connect or its budget is exhausted. Email links open a draft; the chatbot does not send email or create support tickets.

## Runtime configuration

The production API reuses `CEREBRAS_API_KEY` / `CEREBRAS_API_KEY_FILE`, `CEREBRAS_MODEL`, the existing Turnstile credentials and `SUPPORT_IP_SALT` or `DOWNLOAD_SIGNING_KEY`. Never include these secrets in website files. `WEBSITE_AI_ENABLED=0` disables AI while leaving email support visible. Turnstile verifies action `mamalead_chat` and the configured `TURNSTILE_HOSTNAMES`; production uses real keys. Keep the existing trusted Cloudflare client-IP configuration on the loopback-only origin.

Routes: `GET /v1/assist/web/config`, `POST /v1/assist/web/chat`. The website's existing static allowlist serves `mama-ai.js` and `mama-ai.css`, with no-store cache headers. The API adds read/refund operations on the existing `assist_usage` table; no schema migration is needed. Deploy the API and website together through the normal fleet release process. The desktop installer does not contain this website feature.

## Validation

- `node --test scripts/verify-website-assist.mjs scripts/verify-assist-service.mjs`: real HTTP and SQLite quota, restart persistence, CAPTCHA action/hostname rejection, failure refunds, concurrent requests, day expiry, no credential leakage, existing desktop Assist contracts.
- `node scripts/verify-website-assist-ui.mjs`: desktop, 375px and 768px layouts, hidden allowance, clickable mail links, six-reply handoff, refresh persistence, retry, escaped HTML, minimize/close, no overflow or page errors. This isolated test uses provider/CAPTCHA test doubles.
- `node scripts/verify-billing-server.mjs`: 144 existing billing checks.
- `node scripts/verify-public-pages.mjs` and `node scripts/verify-qa-website.mjs`: existing routes, assets, homepage and responsive regression checks.

Local review helpers outside the repo use Cloudflare's documented dummy test widget and real Cerebras replies. They must never be copied to production. Production widget verification must be smoke-tested on the actual domain after an approved rollout.
