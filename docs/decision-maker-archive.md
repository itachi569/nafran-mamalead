# Decision Maker archive and restore

The complete working repository before removal is preserved on GitHub:

- Branch: `archive/decision-maker-2026-10-30`
- Commit: `31c5b621d1d8089c1f98ae7ce64fbc7d59d1fc6d`
- Link: https://github.com/itachi569/nafran-mamalead/tree/archive/decision-maker-2026-10-30

This is a full source snapshot, including the owner search, dedicated Google browser,
DataForSEO adapter, identity and email matching, progress/stop controls, imports,
exports, billing integration, notifications, Assist navigation, and verification scripts.
Private credentials and customer data are intentionally not part of GitHub.

## Restore for development

Fetch the archive and create a separate checkout. Do not reset the current product branch.

```sh
git fetch origin archive/decision-maker-2026-10-30
git worktree add ../mamalead-decision-maker-restore -b restore/decision-maker origin/archive/decision-maker-2026-10-30
```

Use the archived `package-lock.json` with `npm ci`, then `npm run build`.
Follow `AGENTS.md` when preparing a Windows installer. Supply any required service
credentials through the documented private configuration, never source files.

Key areas: `electron/enrichment/{owner-search,google-browser,dataforseo,owner-contact}.ts`,
`electron/enrichment/runner.ts`, `electron/db/repository.ts`, `electron/{main,preload}.ts`,
`electron/export/writer.ts`, `electron/billing/client.ts`, `src/app/useAppValues.ts`,
`src/app/{ReferenceApp,SettingsPanel,ImportWebsitesDialog,OwnerBrowserControl}.tsx`.
Review the removal commit against the archive when integrating into a newer build;
do not overwrite unrelated improvements wholesale.

## Current desktop behavior

Decision Maker navigation, scans, browser/paid-search adapters, IPC, purchases,
allowances, exports, suggestions, and Assist links are removed. Legacy queued owner
jobs terminate without a search or charge. Existing owner records and database
tables are retained without an active desktop API, so restoration does not require
destroying customer data. Shared website/email parsers remain for Email Finder,
Phone Finder, Social Profiles and Website Lookup.

This change does not deploy the website, billing server, or production update feed.
Older installed clients retain their existing server compatibility.

## Admin dashboard archive (31 October 2026)

The admin system before its Decision Maker controls were removed is also preserved:

- Branch: `archive/admin-decision-maker-2026-10-31`
- Commit: `fbdf1ce82402301e676874e96a84576847163a67`
- Link: https://github.com/itachi569/nafran-mamalead/tree/archive/admin-decision-maker-2026-10-31

This snapshot includes the admin page, server queries, revenue calculations and
verification fixtures. Restore it in a separate checkout, using the same worktree
approach above with this branch name. Review `admin-dashboard/index.html`,
`admin-dashboard/server/admin-core.mjs` and `admin-dashboard/server/stores.mjs`
when merging the functionality back; retain newer Support fixes.

In 1.4.25 the admin dashboard no longer exposes Decision Maker activity, pass
allowances, customer filters, subscription counters or purchase columns. Existing
financial history is retained as “Other payment”; old records and compatibility
for installed clients are not deleted. Lifetime cancellation remains available.
