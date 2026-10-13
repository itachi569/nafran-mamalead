# MamaLead self-hosted test deployment — 14 October 2026 (Pakistan time)

The website, billing API, and owner dashboard are publicly routed through HTTPS:

- Website: `https://mamalead.com/`
- Billing API: `https://api.mamalead.com/health` returns HTTP 200 with `mode: test`.
- Owner dashboard: `https://admin.mamalead.com/admin/` returns HTTP 200. Its API requires owner sign-in; an unauthenticated session request returns HTTP 401.

The VM131 billing service uses `BILLING_PUBLIC_URL=https://api.mamalead.com` and still uses Stripe **test mode**. The Stripe test account has an enabled, signed webhook endpoint at `https://api.mamalead.com/webhooks/stripe` for `checkout.session.completed` and `customer.subscription.deleted`. The signing secret is in the root-readable server environment file, not this repository. An unsigned POST returned HTTP 400; two real Stripe test Checkout events were received and recorded by the dashboard.

Public end-to-end checks completed with two independent sandbox buyers:

- Two Stripe test payments created two customer records and two lifetime licenses.
- The owner dashboard recorded two signed webhook events and two emailed keys.
- Resend marked both license emails to its `delivered@resend.dev` test recipient as Delivered.
- Both buyers received signed, protected installer links that returned HTTP 200.
- A delivered lifetime key activated through the public API. A second delivered lifetime key activated in the packaged Windows app against that public API. An existing delivered one-day trial key also activated through the public API.
- The protected server installer SHA-256 matched the latest local 1.4.0 installer.
- All owner dashboard health checks were `ok` after the billing and admin services restarted.

The server's daily SQLite backup timer is active. A fresh backup passed SQLite `quick_check`, was copied off VM131, encrypted with Windows DPAPI for the owner account, and passed a decrypt/byte comparison. The local `Nafran Offsite Backup` scheduled task runs at 07:00 Pakistan time and at user logon, and its manual scheduled run finished with result 0. The task needs this Windows PC signed in and connected to Tailscale; the server's own backup timer continues independently. See `Pull-NafranBackup.ps1` for the local pull script.

This remains a **sandbox deployment**. It does not accept live card payments. The public routes are verified, but direct SSH access to the gateway was unavailable, so its reverse-proxy configuration was not directly audited. The older `DEPLOYMENT-STATUS.md` records the state on 10 October and is retained as history.
