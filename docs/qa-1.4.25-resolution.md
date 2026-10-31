# Contact Support QA resolution — 1.4.25

Source report: `MamaLead-Contact-Support-QA.md`, tested against 1.4.24 / `fbdf1ce`.

| Item | Resolution | Evidence |
| --- | --- | --- |
| ML-91 | Strict credential token boundaries preserve ordinary words in desktop and server text. | `verify-support-qa.mjs` |
| ML-92 | Deliberately typed emails and paths remain in subject/message; automatic diagnostics are fully scrubbed. | QA checks and authenticated server round trip |
| ML-93 | Production was confirmed as self-hosted SQLite, with loopback writer listening. Local writer, reply/note/status and retry tests pass. Live mail configuration/delivery remains a rollout check. | Read-only systemd/listener check; `verify-support.mjs`, `verify-admin-support-ui.mjs` |
| ML-94 | Singular seconds and compact minute/second waits. | `verify-support-qa.mjs` |
| ML-95 | Sidebar now says Contact support, with no external-link arrow. | Electron UI check |
| ML-96 | SQLite/Neon request conflicts return 409, while actual limits return 429. Desktop discards conflicting UUID for the next attempt. | QA, server and Electron retry checks |
| ML-97 | Last valid configured support address persists across app restart and is used offline. Existing fallback mailbox retained until a replacement is confirmed. | Cache and offline/restart UI checks |

Admin Decision Maker controls and reporting were removed from the active dashboard.
The complete pre-removal admin code is saved in
`archive/admin-decision-maker-2026-10-31`; see `decision-maker-archive.md`.
Historical payment totals and Lifetime cancellation remain intact.

## Validation

- Renderer and Electron build.
- Support contract/cache tests, authenticated SQLite support tests, and mocked Neon collision/rate-limit checks.
- Desktop support UI: unlicensed access, persistent draft, cached offline address, retry/cancel, UUID conflict recovery, success and cooldown.
- Admin support UI and login, admin verification (50 assertions), Lifetime cancellation (10 assertions), billing server regression (135 assertions).
- Windows installer rebuilt for 1.4.25, with a separate packaged support UI check using an isolated profile.

The local review installer is unsigned (339,515,018 bytes), built on 31 October
2026. SHA-256: `69d29cdbd6fcb7bd32832737c2e93c3ee5693669ad010638fa4870e678a09aef`.
Production signing and publishing are separate release steps.

All email delivery in these tests uses fixtures. No customer email was sent.
The server environment files are protected: Support/Resend setting presence and
real inbox/reply delivery have not been confirmed. Production deployment and
update-feed publication remain held for review; local/GitHub changes do not
update the live admin page.
