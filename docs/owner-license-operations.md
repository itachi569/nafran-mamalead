# Private owner licences

The operator can issue a MamaLead Lifetime or 24-hour trial key without an email. These are explicit owner grants, separate from Stripe purchases and normal customer trials. The desktop keeps its existing Account activation screen; there is no public issuance endpoint or customer-facing free-key option.

## Issue a key

From this repository, using the already-authorized operator SSH identity:

```powershell
node scripts/issue-owner-license.mjs --ssh ahmed@65.109.114.243 --ssh-key PATH_TO_EXISTING_OPERATOR_KEY --kind lifetime --reason "Owner requested a Lifetime testing key"
node scripts/issue-owner-license.mjs --ssh ahmed@65.109.114.243 --ssh-key PATH_TO_EXISTING_OPERATOR_KEY --kind trial --reason "Owner requested a one-day testing key"
```

`--email` is optional. Use `--label` to identify a testing purpose. The CLI prints the key once after confirming its database record; the database stores only its SHA-256 hash and last four characters. Do not commit or log the returned key. Issuance requires the private SSH database permission; installing the desktop or knowing the command grants no issuance access.

Lifetime lasts until revoked. A trial starts its 24-hour clock when first activated and retains the normal 300-Maps-lead allowance. Both key types bind to one installation. Re-entering a trial key does not reset time or quota. Existing paid licences, Stripe refund checks, emailed trial requests, checkout and invoices are unchanged. Owner grants do not create a payment, invoice, Stripe customer, or email.

## Revoke

```powershell
node scripts/issue-owner-license.mjs --ssh ahmed@65.109.114.243 --ssh-key PATH_TO_EXISTING_OPERATOR_KEY --revoke LICENSE_ID --reason "Owner ended testing"
```

Only records in `owner_licenses` can be revoked by this command. Issue/revoke actions are recorded in `admin_license_actions`.

## Deployment and verification

Deploy the billing backend before issuing keys. The additive `owner_licenses` table requires the fleet's exact-commit schema release approval. Do not write to production runtime trees or bypass the release guard. Existing customer rows are not migrated or removed.

Local checks: `node scripts/verify-owner-licenses.mjs` and `node scripts/verify-billing-server.mjs`. On the fleet source tree the backend is under `app/`, and the operator CLI is `app/issue-owner-license.mjs`.

To verify a release, issue one requested key, activate it through the existing app screen, and check the server-returned `license.active`, `license.kind`, and `lifetime.active` or trial expiry. Never simulate a paid Stripe transaction to grant owner access.
