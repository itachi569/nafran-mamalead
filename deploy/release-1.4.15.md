# MamaLead 1.4.15 — source deployed; installer trust configuration pending

Desktop source: `a919637117dda56420408d2aee7e4d3740b5cb5f`, tag
`v1.4.15-windows`. Signed Windows build:
https://github.com/itachi569/nafran-mamalead/actions/runs/40222463655

Website source and 15 current light-mode screenshots were pushed in `66a5144`.
The app-only welcome banner is not shown in the website download section.

The server now deploys a separate canonical repository,
`aamirmursleen/mamalead`, from `/home/ahmed/mamalead`. The prepared production
commit is **`1e7764c7f8e6da52e248a3f3e3b339b626eca60f`**, pushed to `main`.
It updates `app/` billing source and `landing/` website source/assets.
The prior backend source matched the desktop repository baseline before copying
the intended changes. Runtime secrets, customer data and installer files were
not copied into that repository.

## Verification

- Local packaged app audit passed all 11 pages, licence controls, scan controls,
  reports, persistence and exports; no renderer errors.
- Decision Makers import, published personal/site contacts, addresses, social
  links, PDF/Excel and current-result reset passed. Database checks: 97/97.
- Local website checks passed 15 referenced images, Windows-only downloads,
  pricing alignment, desktop/mobile layout and module details.
- VM115 source build succeeded (job `dec55afc`).
- VM115 candidate website test passed desktop/mobile and Decision Makers modal
  checks (job `mamalead-1415-review2`); runtime cleanup verified. Candidate files
  were served from the reviewed Git snapshot inside the browser test; production
  HTTP responses were not changed.
- GitHub CI passed Azure signing and verified both application and installer
  publisher signatures as Nafran LTD.

## Production deployment: 26 October 2026

Owner approval was registered for exact commit
`1e7764c7f8e6da52e248a3f3e3b339b626eca60f`.
`mamalead-publish --check` passed and `mamalead-publish` completed deployment.
VM115 validation job `4d4f593e` passed. The publisher backed up source and SQLite,
updated the approved source, restarted billing/landing, and verified services,
database and public endpoints. The live homepage returns 200 and contains 1.4.15
content, reports details and the current screenshot paths. GitHub source is pushed.

## Signed installer: ready and staged, not published

The signed GitHub CI assets were downloaded and checked against GitHub SHA-256,
CI SHA-512, size and update metadata. Local Windows Authenticode validation is
Valid, publisher CN=Nafran LTD, with a Microsoft timestamp.

- Installer bytes: 334020024
- SHA-256: `210b07a498ff41e6838616b6ab06db4047730e98ce05b4a002658c4e1a7595be`
- Staged files: `/home/ahmed/deploy-staging/1.4.15/signed/`
- Approved publisher: `mamalead-installer-publish 1.4.15`

The new publisher passed file hashes and metadata but stopped at Authenticode
chain validation. Its default Linux CA bundle lacks Microsoft Identity
Verification Root Certificate Authority 2020. A separate diagnostic using the
root downloaded from Microsoft's official PKI repository passed signature,
timestamp and CRL verification. No signature check was disabled.

The server administrator must configure the root-owned publisher to use a
root-owned dedicated CA file for both `-CAfile` and `-TSA-CAfile`. The complete
procedure is in `deploy/installer-trust-fix-1.4.15.md`. Ahmed does not have
permission to modify that publisher or its trust configuration. The public
Windows update feed still reports 1.4.14; the installer switch remains pending.

Stripe health still reports test mode. Mac downloads remain hidden.