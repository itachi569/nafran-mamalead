# Contact support — MamaLead 1.4.25

The desktop app has one support form, reachable from the sidebar, Settings → Account, the licence lock and failed Assist answers. It works without an active licence. The form keeps a local draft, creates one ticket per send, preserves its retry identifier, and offers a mail-app fallback when the server is unavailable. Website checkout and trial forms are unchanged.

## Server configuration

Use the existing private billing environment; never put these values in the installer or GitHub:

| Setting | Purpose |
| --- | --- |
| `SUPPORT_INBOX` | Destination support mailbox, also the customer-reply address. Set to the agreed monitored address. |
| `EMAIL_FROM` | Existing verified Resend sender. |
| `RESEND_API_KEY` | Existing server-only Resend credential. |
| `SUPPORT_REPLY_FROM` | Optional verified sender for admin replies; defaults to `EMAIL_FROM`. |
| `SUPPORT_SIGNATURE` | Optional plain-text reply signature; defaults to MamaLead Support. |
| `SUPPORT_SLA_TEXT` | Optional response-time copy. Empty by default; no response deadline is promised. |
| `SUPPORT_IP_SALT` | Dedicated random secret for hashing IP addresses; otherwise the existing download-signing secret is used. |
| `SUPPORT_TRUST_PROXY=1` | Only on the loopback origin behind a reverse proxy that overwrites `X-Forwarded-For`. Otherwise the socket IP is used. |

The initial fallback email is the existing `billing@nafran.co`; a new mailbox has not been agreed or verified. The live API overrides it through `/v1/support/config`. The app caches the last valid public email and SLA in `userData/support-config.json`, including across restarts, and uses them when the API is offline. No server credentials are cached. Tickets are accepted and saved even when delivery is not configured. A failed email notification does not delete a ticket or report a false send failure to the customer.

SQLite support tables and indexes are additive and created at startup. The Neon adapter creates the same support tables lazily. The local billing service retries pending/failed inbox notifications every minute (up to 10 per pass, after a two-minute grace period). The exported `retrySupportDelivery` helper supports a separately scheduled hosted worker; the Vercel HTTP function does not run a persistent timer. Resend requests reuse the ticket/action idempotency key. Failed admin replies require an explicit Retry in the inbox.

## Owner inbox

The existing owner sign-in protects `/admin/api/support`. The admin database remains read-only. Replies, internal notes and status changes go through the existing authenticated writer on `127.0.0.1:38749`, using the existing private `.admin-license-key` file. There is no new public writer, password or shared admin credential.

The Support tab contains filters, paginated search, an unread badge, customer messages, diagnostics, licence/installation context, reply confirmation, internal notes and status history. Recipient addresses stay masked unless `ADMIN_SHOW_EMAILS=1`; billing resolves the real recipient when sending. The UI never accepts a replacement recipient address. Customer email replies arrive in `SUPPORT_INBOX`; inbound mailbox synchronization is not included. A follow-up can be recorded as an internal note.

Without a writer or Resend configuration, tickets remain readable and replies show a configuration notice. A database without the new tables displays an upgrade notice. A GET never marks a ticket read; the UI sends an authenticated PATCH after opening it.

## Privacy and abuse controls

- Only version/OS/build context, installation identity, page and licence type/status/last four are included by default.
- Optional diagnostics contain total counts, provider name, locale/time zone and five scrubbed user-facing errors. No lead records, full keys, tokens, cookies or files are collected.
- Draft text stays on the device until submitted and clears after success or discard. Retry state stores only a hash and UUID.
- Subject/message text preserves deliberately entered contact emails and paths. A light scrub removes credential-shaped tokens and sensitive URL parts; automatic diagnostics still use full email/path/token redaction. Ordinary words such as “re-installed” remain readable.
- A conflicting request UUID returns 409 and clears the retry UUID; a new send gets a fresh identifier. Actual rate limits still return 429 with a compact, correctly pluralized wait time.
- Installation limits: 1 message/minute, 5/hour and 20/day; reply email: 10/day; hashed IP: 30/day. Admin replies are limited to 30/hour per owner identity.
- Authenticated request limits: 32 KB support submission, 16 KB admin action, 5,000-character message/reply. HTML is escaped in emails and rendered as text in the dashboard.

## Verification and rollout

Run `npm run build`, `node scripts/verify-support-qa.mjs`, `node scripts/verify-support.mjs`, `node scripts/verify-support-ui.cjs`, `node scripts/verify-admin-support-ui.mjs`, the relevant billing/admin regression checks, and `npm run package:win`.

The UI tests use isolated profiles and fixture mail delivery; they do not send customer emails. For the packaged check, set `MAMALEAD_TEST_EXE` to the newly built `MamaLead.exe` and run `node scripts/verify-support-ui.cjs --packaged`.

Deploy the billing and admin changes together before publishing the desktop update. Verify a real message and reply with an authorized test mailbox after rollout. Until that deployment, the public server does not provide the new support endpoint. Local review and GitHub source updates do not publish a production release.

The 31 October read-only production check confirmed systemd services running the self-hosted billing/admin entry points under `/opt/billing`, plus the authenticated writer listening only on `127.0.0.1:38749`. Current production is the SQLite deployment, not Vercel/Neon. The protected environment files were not readable by the developer account, so live Support/Resend configuration and delivery still require verification at rollout. The Vercel adapter does not yet provide admin support writes or a scheduled retry worker; do not migrate Support there without implementing those paths.
