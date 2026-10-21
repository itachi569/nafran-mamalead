# Nafran Assist server operation

Deployed 21 October 2026 with desktop version 1.4.12, source
`d7bc83833c204843f6d98556e0c492c270a87c33`.

## Request flow

Desktop clients use the existing installation token and device binding with
`GET /v1/assist/status` and `POST /v1/assist/chat` on `api.mamalead.com`.
The billing service verifies the current licence and reserves usage before
calling Cerebras. Old desktop versions must be upgraded to use this service.
No customer API key is required or bundled into the app.

The service reads `CEREBRAS_API_KEY`, or the private file selected by
`CEREBRAS_API_KEY_FILE`, defaulting to `/opt/billing/app/.assist-api-key`.
The deployed file is mode 640 with a read ACL for `nafran-billing`.
Never commit the file, copy it into releases or include it in logs.
The current model is `gpt-oss-120b`; `CEREBRAS_MODEL` can override it.

## Limits and privacy

- Unactivated/inactive devices: 5 onboarding requests total.
- Active trials: 25 requests per UTC day.
- Active paid access: 100 requests per UTC day, shared by linked licence.
- Per device: 6 requests per minute and one concurrent request.
- Whole service: 2,000 requests per UTC day and eight concurrent requests.
- Maximum 8 recent messages, 1,200 characters each; 600 output tokens.

SQLite `assist_usage` stores counters, not chat contents. Chat messages and
an allowlisted workspace summary go to Cerebras; full lead rows are not
automatically included. Failed upstream calls consume a reserved request.
Daily counters expire; onboarding counters persist. Device registration is
the existing trust mechanism, so onboarding is not an absolute person-level
abuse barrier. The global limit bounds aggregate request volume.

## Operations and rollback

Restart with `sudo fleet-dev restart mamalead nafran-billing`.
The private deployment directory is
`/home/ahmed/deploy-staging/assist-1.4.12/`; its `rollback/` contains the
previous core/server source and website files. Restore source with the service
read ACL preserved before restarting if rollback is necessary. The added
usage table may remain; removing it is unnecessary. Rolling the API back
disables server AI for 1.4.12 clients.

An authenticated real chat using the desktop billing client returned a
successful Cerebras answer after deployment. Local Windows packaging and
Windows/Mac CI builds completed. No new full installer UI or Mac runtime
test was performed for this release. Stripe remains in test mode.
