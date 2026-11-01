# MamaLead 1.4.35

Includes the 1.4.34 legacy-email repair, portable Electron QA paths and pending website/admin updates.

The final fresh-install audit found an obsolete dashboard card with sample scheduled runs and "63 pending leads". The card is removed; new installations show actual zero counts and open Account for licence activation. Existing user databases are retained during upgrades.

Release checks now include `verify-signed-fresh.cjs` for an empty packaged profile and `verify-package-clean.cjs` for accidental user databases, credential files and the private Turnstile secret in the archive. They accept `MAMALEAD_TEST_EXE` and `MAMALEAD_QA_OUTPUT`. The fresh-profile check registers a new unlicensed installation with the real billing service; it does not send email or activate a key.

The full audit fixtures were updated to use valid public email domains and realistic telephone numbers, to exercise bookmarks through the UI, and to describe Maps results with a matching business category. These corrections retain production validation rather than disabling it for tests.

Deployment remains through the existing server's guarded publisher. Website/admin commit approval and the protected Turnstile environment are separate from the signed desktop installer. Never publish an unsigned local QA installer.

## Published verification — 1 November 2026

Windows 1.4.35 is published to the production download endpoint and Windows update feed. The signed artifact was built from tag `v1.4.35-windows` at `d1ce12d4caac0a990c41b714c565fa68bf535280`; later commits contain QA scripts and documentation only. Authenticode validates the timestamped Nafran LTD signature. The live feed SHA-512 matches that installer, and both public download routes serve the expected 339,924,992-byte file.

Final results across the core and desktop audit cover 27 passing suites after repairing obsolete test fixtures. Windows and Ubuntu desktop CI passed. Additional packaged checks covered 10,000-lead paging/edit/delete/undo/list/export operations, a signed empty installation, and upgrading an old database containing private-domain email contacts. The clean signed profile had zero leads, contacts, socials, runs, lists, imports, exports and search history, with no active licence. All ten pages rendered; an unlicensed action returned to the licence field. No user databases or credential files were packaged.

The website and admin rollout was approved and verified on the existing hosting server. Clean public routes return HTTP 200. Support configuration reports email delivery and CAPTCHA configured; the production Turnstile frame loads in the approved browser runner, and an invalid CAPTCHA token is rejected. Responsive browser checks passed at 1440, 768 and 390 pixels. These final production checks did not submit a customer support message or charge a card; payment and message delivery paths were exercised by the isolated automated suites.

Only positively identified QA records were removed after private server backups. Real customers, payments, licences and the retained customer support conversation were preserved. The optional `MAMALEAD_QA_IDENTITIES_FILE` setting records only one-way hashes of isolated test-installation credentials to identify anonymous QA rows for guarded cleanup; it does not write bearer tokens or change production data itself.

Public installer SHA-256: `faedce4535e520df4bffb21bf7c7099e17a0554482308db5293f9816f065b78c`.
