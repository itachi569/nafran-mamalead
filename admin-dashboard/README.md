# Owner sign-in

The admin dashboard accepts one owner email and a separate dashboard password. It does not sign in to Google and must never use the Gmail account password. Passwords are verified with a salted scrypt hash on the admin server; the browser receives an HttpOnly session cookie after sign-in.

From the repository root, run `node admin-dashboard/server/setup-owner.mjs` in an interactive terminal. Enter the Gmail address and a new dashboard password when prompted. The password is hidden while typed. The command saves `.secrets/admin-owner.env`, which is ignored by Git. It contains `ADMIN_OWNER_EMAIL`, `ADMIN_PASSWORD_HASH`, and `ADMIN_ALLOW_TOKEN_LOGIN=0`; it never contains the plaintext password.

When deploying the admin server, add those values to its private environment alongside the existing `ADMIN_SESSION_SECRET` and billing database configuration. Keep the admin API behind HTTPS. Until the private environment is updated and the admin service restarted, the current owner-token login remains in use.

To change the email or password later, run `node admin-dashboard/server/setup-owner.mjs --replace` and update the server's private environment. Changing the password hash invalidates existing owner sessions. If the password is lost, a server operator must run setup again; the dashboard has no public password-reset route.

Verification: `node admin-dashboard/server/verify-admin.mjs` and `node scripts/verify-admin-login-ui.mjs`.
