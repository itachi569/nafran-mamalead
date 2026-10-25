# MamaLead 1.4.15 — prepared; production approval pending

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

## Remaining publication gate

`mamalead-publish` validated and pushed the production commit, then the installed
release guard refused rollout: the exact SHA needs staging evidence and owner
approval. `/home/ahmed/AGENTS.md` and the canonical repository's AGENTS.md require
that approval for homepage/assets and protected billing SQL content. Do not
bypass the guard or write directly into `/opt/billing` or `/srv/nafran-site`.

Owner/Aamir must register approval for the exact production SHA above using the
server's release-guard procedure. Review artifacts are under
`/tmp/vm115-playwright/mamalead-1.4.15-review2/` on fleet-ops.
After approval, run `mamalead-publish` from `/home/ahmed/mamalead` and verify the
live homepage/assets, billing health and admin availability.

The server's documented source publisher excludes installer files and runtime
download pointers. Publishing the signed 1.4.15 Windows installer, blockmap and
`latest.yml`, and selecting the new download, also needs the owner-managed
artifact publication path. Retain the existing 1.4.14 artifacts and rollback
pointers. Verify signed-release hashes before switching either public endpoint.

No production rollout or public installer switch is claimed by this note.
Stripe test mode and Mac download visibility are unchanged.
