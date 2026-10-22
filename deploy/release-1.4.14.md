# MamaLead Windows 1.4.14 — 22 October 2026

The owner authorised publishing all audited app changes and bringing the website
up to date with the current application.

## Source and signing

- Application: `f072da0b4002217d6178cbea1b49272943af5a49`, tag `v1.4.14-windows`.
- Website/screenshots: `e33ee7d` on `artifact-signing-windows-release`.
- Signed build: https://github.com/itachi569/nafran-mamalead/actions/runs/39758738882
- Publisher: Nafran LTD. CI verified both application and installer signatures.
- Installer: 333,871,760 bytes.
- SHA-256: `a25b7394c4d827a224984ba9ffa0219db31e0af0d2fede43a205cf9345a8c7ed`.
- SHA-512: `vagMI5cMquzJOhBB4AMLpHW1lU+/Dtboslq4ZdtL+Zzq8CjFPmqW5fMV1AFulpDz2t82j+zuOO0po7VWw2904w==`.

Only the signature-verified GitHub draft release assets were published. GitHub
asset digests and the CI-logged SHA-512 matched the server-staged installer.
The complete public installer was downloaded (an interrupted API transfer was
resumed through the public update feed). SHA-256 and feed SHA-512 matched;
Windows Authenticode returned **Valid** for
`CN=Nafran LTD, O=Nafran LTD, L=London, C=GB`, with a Microsoft timestamp.
The verified signed files replace the unsigned installer artifacts in local
`release/`; the earlier local artifacts are retained separately in the task's
`work/local-1.4.14-unsigned/` directory.

## Included changes

- Maps obeys one maximum across keywords and areas, including streaming and
  final results. Fewer available leads produce a smaller completed run.
- Cancelling a run prevents overlapping work until it settles.
- Finder searches filter the current saved results and explain their purpose.
- Social extraction preserves numeric Facebook profiles, reads escaped links
  and excludes share links, home pages and lookalike domains.
- Email verification can stop with completed results retained; Saved Lists use
  actual names and counts with duplicate-safe saving.
- A top welcome notice directs unactivated users to Settings & Billing for the
  1-day trial or Lifetime plan. Active Trial/Lifetime users do not see it.
- Existing current-import Decision Makers flow and direct PDF/Excel exports
  remain included, along with server-managed Nafran Assist.

## Website

The existing design is retained. Fifteen current app screenshots (including the
welcome notice) are referenced under `/img/app/v1.4.14/`. These use fictional
sample records and controlled fixture websites, not owner/customer records.
Versioned image URLs avoid stale cached screenshots. Copy, module descriptions,
FAQs, export guidance, total Maps limits and trial onboarding match the app.
Mac downloads remain hidden; their source and release setup are retained.

Website index SHA-256:
`572d48489a1e540f8475d50c4f342be3e81d6f51623d5e07478ec590213c052a`.

## Verification

The final packaged audit passed all 11 views, light/dark themes, website imports,
mock-provider AI through authenticated local billing, duplicate imports, named
lists, exact 20-lead Karachi quota accounting, CSV/Excel/PDF, restart persistence
and revoked-test-licence enforcement with no renderer errors. Decision Makers
import/scan/search/export/reset checks also passed. Maps limits, social parsing,
updater configuration and packaging checks passed. Welcome navigation, dismissal
and active-licence suppression were checked in an isolated packaged profile.

Local and public website checks passed screenshot loading, Windows download
links, mobile layout, aligned pricing buttons, and module modal rendering. The
public HTML and all 15 referenced screenshot SHA-256 hashes match the repository.
The
Subscribe handoff/fallback test passed after updating its obsolete Mac assertions.
All four production services remained active; billing health returned 200/test.
No real payment, customer cancellation or fresh live Google/provider scan was
performed as part of this release. Stripe remains in test mode.

## Publication and rollback

Signed installer and blockmap were installed first, preserving existing versioned
files; `latest.yml` was atomically replaced after health checks. The public API
pointer selects `/opt/billing/artifacts/MamaLead-Setup-1.4.14.exe`. Only the billing
service was restarted. Static website assets were installed before index.html.

Rollback copies are in `/home/ahmed/deploy-staging/1.4.14/rollback/`:
`installer-path`, `latest.yml`, and `index.html`. Restore these to their original
paths with service-readable ACLs, then restart only `nafran-billing` if reverting
the installer pointer. Retain versioned installer and image assets for clients
that may already reference them. No database migration was performed.

Public URLs:
- https://mamalead.com/
- https://api.mamalead.com/v1/download?platform=windows
- https://mamalead.com/updates/windows/latest.yml
