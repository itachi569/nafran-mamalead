# Owner sign-in

The admin dashboard accepts one owner email and a separate dashboard password. It does not sign in to Google and must never use the Gmail account password. Passwords are verified with a salted scrypt hash on the admin server; the browser receives an HttpOnly session cookie after sign-in.

From the repository root, run `node admin-dashboard/server/setup-owner.mjs` in an interactive terminal. Enter the Gmail address and a new dashboard password when prompted. The password is hidden while typed. The command saves `.secrets/admin-owner.env`, which is ignored by Git. It contains `ADMIN_OWNER_EMAIL`, `ADMIN_PASSWORD_HASH`, and `ADMIN_ALLOW_TOKEN_LOGIN=0`; it never contains the plaintext password.

When deploying the admin server, add those values to its private environment alongside the existing `ADMIN_SESSION_SECRET` and billing database configuration. Keep the admin API behind HTTPS. Until the private environment is updated and the admin service restarted, the current owner-token login remains in use.

To change the email or password later, run `node admin-dashboard/server/setup-owner.mjs --replace` and update the server's private environment. Changing the password hash invalidates existing owner sessions. If the password is lost, a server operator must run setup again; the dashboard has no public password-reset route.

Verification: `node admin-dashboard/server/verify-admin.mjs` and `node scripts/verify-admin-login-ui.mjs`.

## Cancel a Lifetime plan

Open **Licenses**, find the customer/key and select **Cancel Lifetime**.
Enter a reason and the displayed last four key characters, then confirm.
The dashboard refreshes its counts, licences and device rows after success.
Already cancelled keys show the cancellation date instead of another button.
This is a licence revocation, not a Stripe refund or subscription cancellation.
There is no restore action in the dashboard.

All devices bound to that Lifetime key lose core access and Decision Maker
access attached to it at their next server licence check. The desktop main
process caches a successful check for up to 15 seconds; ongoing work may
finish. A separately licensed Decision Maker plan is not revoked.

The admin database connection remains read-only. A narrow authenticated
writer in the billing process listens only on `127.0.0.1:38749`. The two
services read `/opt/billing/app/.admin-license-key` (64 random hex characters,
private file readable only by the deployment/service accounts). This file
must not be committed or sent to the browser. Without it, the cancellation
control is unavailable. The self-hosted local server wires this bridge; other
hosting adapters remain read-only unless explicitly configured with a writer.

The owner session and `x-nafran-admin` header are required for
`POST /admin/api/licenses/cancel`. It accepts the exact full licence ID,
last four key characters, confirmation `CANCEL LIFETIME` and a 3–300 character
reason. The owner identity comes from the authenticated server configuration.
The writer atomically sets `licenses.revoked_at` and adds an
`admin_license_actions` audit record. Retries are idempotent and do not
duplicate that record. No purchase, email, device binding or Stripe row is deleted.

Deployment rollback copies are at
`/home/ahmed/deploy-staging/admin-cancellation-20261021/rollback/`.
Restoring the previous server/UI files and restarting both services removes
the feature. It does not undo any licence cancellations already recorded.

## Support inbox

MamaLead 1.4.24 adds the Support tab: filtered tickets, unread counts, replies, notes and status history. The admin database remains read-only; writes use the authenticated loopback billing writer and its existing private key file. Configure `SUPPORT_INBOX`, `EMAIL_FROM` and `RESEND_API_KEY` in billing; `SUPPORT_REPLY_FROM` and `SUPPORT_SIGNATURE` are optional. Full licence keys are never included. Customer replies arrive in the support mailbox; there is no inbound-email synchronization. See [contact-support rollout and verification](../docs/contact-support.md).
