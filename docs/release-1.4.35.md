# MamaLead 1.4.35

Includes the 1.4.34 legacy-email repair, portable Electron QA paths and pending website/admin updates.

The final fresh-install audit found an obsolete dashboard card with sample scheduled runs and "63 pending leads". The card is removed; new installations show actual zero counts and open Account for licence activation. Existing user databases are retained during upgrades.

Release checks now include `verify-signed-fresh.cjs` for an empty packaged profile and `verify-package-clean.cjs` for accidental user databases, credential files and the private Turnstile secret in the archive. They accept `MAMALEAD_TEST_EXE` and `MAMALEAD_QA_OUTPUT`. The fresh-profile check registers a new unlicensed installation with the real billing service; it does not send email or activate a key.

The full audit fixtures were updated to use valid public email domains and realistic telephone numbers, to exercise bookmarks through the UI, and to describe Maps results with a matching business category. These corrections retain production validation rather than disabling it for tests.

Deployment remains through the existing server's guarded publisher. Website/admin commit approval and the protected Turnstile environment are separate from the signed desktop installer. Never publish an unsigned local QA installer.
