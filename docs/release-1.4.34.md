# MamaLead 1.4.34

## QA report corrections

- ML-130: source UI tests resolve the installed Electron binary on each platform. Packaged tests accept an explicit executable path. A path lint and Ubuntu/Windows CI cover regressions.
- ML-131: startup rechecks legacy email rows using a new, idempotent migration marker, including databases previously marked by 1.4.33. Invalid private-domain addresses are archived, the best remaining active public address becomes primary, and edits cannot reintroduce a private-domain address. Previously retired addresses are not resurrected.
- The 1.4.33 cleanup already existed; this release strengthens upgrade and manual-edit handling, rather than requiring a rescan.

## Local validation

- Windows installer rebuilt with `npm run package:win`, version 1.4.34, fresh artifact in `release/`.
- 88 database assertions and 12 focused QA/email extraction tests passed.
- Actual source and packaged Electron launches passed the legacy-database repair test.
- Source and packaged Website Lookup tests passed: URL/CSV/saved-run imports, counts, selected fields, one primary email, deduplicated phones, failures, recovery after reload, PDF/Excel exports and dark mode.
- UI tests disable background-window throttling to avoid screenshot stalls when the user is working in another window.

## Rollout

Deploy the latest website, billing API and admin dashboard through the existing canonical MamaLead server worktree, VM115 validation and release guard. This includes the prior pending support clean routes, public support configuration, Turnstile validation, Cloudflare client-IP handling, support inbox improvements and website trial/download changes.

The private Turnstile site/secret configuration must be installed in the protected server environment, with `SUPPORT_CLIENT_IP_HEADER=cf-connecting-ip` only for the private Cloudflare origin. No keys belong in Git, the installer or public assets. Publish only the matching Nafran LTD signed Windows release through the guarded installer publisher. Local QA installers are unsigned and must not be published.

Live rollout, CAPTCHA configuration and Linux CI are not established by these local checks; record their actual results separately after deployment.
