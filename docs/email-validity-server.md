# Managed email validity

Fresh desktop installs use MamaLead's authenticated billing API for full mailbox checks. Customers do not import a provider key. Existing explicitly configured desktop providers still work. If the server or SMTP provider is unavailable, report the failure; never substitute a DNS-only result as mailbox validity.

## Server

`LEADSANGEL_CONFIG_FILE` points to a private JSON file outside the source/runtime tree with `licenseKey`, `deviceId`, and optional `expiresOn` (YYYY-MM-DD). The existing activated SMTP API device is used. Keep the file root-owned and readable only by the billing service group (0640). No credential, provider job ID, raw request, or raw SMTP response is returned to clients or written to logs.

- `GET /v1/email-validity/status`: installation/device authenticated configuration, no secrets.
- `POST /v1/email-validity/jobs`: active trial/lifetime licence; up to 20 addresses, UUID requestId. Paid licence is revalidated at the start of every batch.
- `GET /v1/email-validity/jobs/:id`: installation/device ownership and current licence/expiry/revocation checks; partial results and progress.
- `DELETE /v1/email-validity/jobs/:id`: owner can stop work, even after a licence expires.

One job per installation, eight concurrent jobs globally, bounded storage. Existing atomic usage storage allows 12 batch starts/minute and 500/day per installation. Duplicate request IDs do not submit a second SMTP job. Jobs stop polling the provider after client disconnection or 150 seconds; completed partial results survive failures. Transient job/results data expires after ten minutes and is never added to the shared lead cache. Restarted servers cannot resume old jobs; users can retry the remaining addresses. Cancellation stops MamaLead polling; the external provider may finish work already accepted.

`billing-server/leadsangel-provider.mjs` is generated from the desktop provider implementation. Run `node scripts/build-server-email-provider.mjs` after modifying it, and `--check` in QA. This keeps recipient-vs-catch-all handling and 550 policy-vs-missing-mailbox classification identical.

## Desktop

Syntax, disposable-domain, and definitive DNS failures can finish locally. Other addresses go through the SMTP provider. Only explicitly selected/imported contacts are checked; duplicate addresses are sent once. Results persist in the local DB as they arrive. Cancellation retains completed rows. Provider outages do not fan out into many paid retries. Unresolved mailboxes remain unchecked/retryable, never invented Valid.

Valid, Invalid, Risky and Unknown remain distinct. A score is provider confidence, not a guaranteed delivery percentage. A policy-blocked SMTP check must remain Unknown.

## Verification

`node --test scripts/verify-email-validity-server.mjs`

`node scripts/verify-email-validity-managed.mjs` (fresh source desktop and local authenticated server, provider fixtures)

Set `MAMALEAD_TEST_EXE` for the same packaged test. The packaged test redirects API traffic inside the isolated test process only; shipped apps still enforce the production API origin.

For a deliberate live SMTP check, set the private `LEADSANGEL_CONFIG_FILE` path and add `--live`. The test extracts published emails from three unrelated public websites. It never sends mail, makes payments or modifies production customer data.
