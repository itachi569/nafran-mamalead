# Nafran Leads Scraper

Cross-platform Electron desktop app with a React + strict TypeScript renderer, a real Chromium
Google Maps scraping worker, and a **local-first SQLite database**. No server, no cloud account,
no API key — everything runs and stays on the machine.

## Architecture

```
React renderer  →  contextBridge preload  →  IPC  →  main process  →  SQLite
                                                          │
                                                          ├─ ScraperRunner  → ChromiumMapsProvider (Playwright)
                                                          └─ EnrichmentRunner → WebsiteEnricher (Playwright)
```

The renderer never touches SQL or a browser directly. It calls `window.desktop.*`; `electron/db/ipc.ts`
maps ~40 channels onto the repository, and `electron/db/local-db.ts` writes to `leads.db` through
Electron's built-in `node:sqlite` — no native module to rebuild, no Docker.

The database lives at `%APPDATA%\nafran-leads-scraper\leads.db` (macOS/Linux: the equivalent
`userData` directory). A run is written to the database **before** the renderer is told it finished,
so a crash between the two cannot lose captured leads.

```
electron/
  main.ts                 Electron entry; owns the run and forwards progress over IPC
  preload.ts              contextBridge API (sandboxed, CommonJS)
  db/
    schema.sql            15 tables + 3 views
    local-db.ts           DatabaseSync wrapper, workspace, usage counters
    repository.ts         every read and write
    ipc.ts                channel → repository mapping
  scraper/
    types.ts              query, lead and progress types
    location.ts           location → Google `gl`/`hl`, and address → town parsing
    provider.ts           ScraperProvider interface, lead hashing, error types
    chromium-maps.ts      the Playwright Google Maps scraper
    mock.ts               offline demo provider
    runner.ts             orchestration: progress, cancellation, partial results
    cli.ts                standalone runner used by `npm run scrape`
  enrichment/
    website.ts            site inspection: emails, phones, socials, people
    runner.ts             the enrichment queue
  export/writer.ts        pure export builder + save-dialog writer
src/                      React renderer
scripts/                  build, verification and diagnostics
```

## What works today

**Google Maps scraping.** The worker drives Chromium with Playwright, reads the public results
feed, opens each place and captures name, category, address, area, postcode, phone, website,
rating, review count, coordinates, place reference and Maps URL. Sponsored entries are skipped and
results are de-duplicated by name and address.

**Pacing and browser controls** (Maps page → Run behaviour). The browser window can be shown
instead of running headless, the delay between places is adjustable, a specific browser executable
can be chosen, and a city can be split into districts so Google's per-search result ceiling applies
many times instead of once.

**The Google account comes first.** `Run with filters` never scrapes from a profile Google has never
seen, because that is the run that meets the sign-in wall with no account to offer. Pressing it
checks the saved account; when there is none, **this app's own browser** opens on Google's sign-in
page and the run waits — the button reads *Connecting Google…*, the line under the page title says
to sign in, and the run starts in that same window the moment the account is in. Closing the window
cancels the run cleanly. When an account is already saved, nothing opens and the run starts at once.
`Sign in to Google…` in Run behaviour does the same connection early, so the window is already
waiting when a run needs it.

The account, the password and the second factor are typed by the user on Google's own page and never
pass through this app. What it keeps is the profile folder that window leaves behind, in the app's
own user-data directory (`google-profile`, beside `leads.db`) — never the browser the user browses
with, which does not have to be closed.

**Social profiles, imported or found.** The Social Profiles page keeps its controls — the search box,
the platform filter, **Import profiles** and **Refresh** — in a bar pinned under the page heading, so
they stay to hand while the list of leads scrolls past. The search reads the business name, the
domain **and** the profiles themselves (a handle or a profile URL), and the dropdown narrows by state
(all, with socials, pending, no website); the figure above the table counts what is on screen.
Searches are kept, most recent first, and offered back as chips under the box — clicking one runs
that search again, with the count it produced last time beside it.

**Import profiles** takes a pasted list of profile URLs, one per line: Instagram, Facebook,
LinkedIn, TikTok, YouTube or X. What each line will become is shown before it is imported — attached
to the lead its handle names, a new lead of its own, a duplicate of a line above it, or a line that
names no platform — because the preview is the import's own matcher rather than a description of it,
and the button says how many it will file. A URL already on file is skipped, and a scan overlay
counts the URLs as they land, leaving a bar on the coverage card that says what the scan covered and
can be dismissed. Cancel, Escape or the import itself closes the modal.

**History, per page.** The History button beside the toolbar opens a drawer listing every search,
import, refresh and finished pass on the page, newest first, with the count on the button. Rows open
to show what the entry was about — the term, or the URLs an import read — and a search offers **Run
again**, which puts the term back in the box and runs it. Tabs narrow the list to searches or to
everything else, the footer counts what is listed, and **Clear history** empties it. The log lives in
the local database, so it survives a restart.

**The Google window.** Connecting an account opens the app's own browser on Google's sign-in page,
and the interface shows a panel that stands in for it: which step of Google's page the window is on,
what to do there, and — when the account is in — "Account connected". The panel is the app's account
of what the window is for; the sign-in itself is Google's page in a real window, because a panel
inside the interface cannot type a password Google would accept.

**Enrichment.** A queue visits each lead's website and extracts addresses, phone numbers, social
profiles and named people, writing them to `lead_contacts`, `social_profiles` and
`decision_makers`. Decision makers are two-tier: only schema.org people, named mailto addresses,
LinkedIn `/in/` profiles and explicit name+role text are asserted; anything softer is offered as a
suggestion for the user to confirm or dismiss.

**Pages** — Dashboard, Google Maps, Social Profiles, Email Finder, Phone Finder, Decision Makers,
Website Lookup, All Leads, Saved Lists, Run History, Settings — all read live database figures.

**Phone Finder** counts every saved lead, including leads beyond the visible page. It separates
listing numbers, website numbers, mobile numbers and missing numbers using the stored source.

**Settings** shows the local workspace name, usage, recorded members, data path, time zone and
update status. Billing reads Stripe products, purchase status and invoices through a separate
server. It never invents prices, charges, devices or invitations. For local Stripe test mode, run
`npm run billing:dev`; the desktop checkout uses `http://127.0.0.1:38747` in development. The
packaged Windows app uses `https://api.mamalead.com` for license verification and cannot redirect it
with a local environment variable.
Stripe server keys stay outside the Electron build in server environment variables.

### Stripe billing setup

The supplied MamaLead Stripe document was imported into ignored local files
`.secrets/stripe-test.env` and `.secrets/stripe-live.env`. The server key stays in the separate
`billing-server` process; Electron stores only an encrypted installation token. On Windows it also
sends a SHA-256 hash derived from the machine ID and a short platform label. The server binds the
installation token to that device ID and limits a lifetime key to two activated devices. A key is
required to activate app features, not to download the installer. Anonymous download clicks can
be counted; the customer's email and device become known after key activation. Device IDs and
client checks raise the cost of casual sharing, but cannot make a client app impossible to patch.
The server checks
Stripe for the Rs 10,000 one-time Lifetime Deal, which unlocks the core features and includes 1,000 Decision Maker searches for the first 30 days after activation. Decision Makers can also be bought alone: the first Rs 1,000 payment emails a separate key for activation. Each manually purchased pass provides 1,000 server-metered searches for 30 days, shared across licensed devices. Saved alerts appear when 500 and 100 searches remain. There is no automatic renewal; a new pass can be purchased immediately when a quota is exhausted. A free 1-day trial
key is emailed once per address and browser identity, activates on one machine, and expires 24 hours
after first activation. The server creates hosted Checkout and portal sessions and reads real invoices. A new workspace is no longer
marked as a paid Pro subscription, and local invoice exports no longer generate sample charges.

For local testing, run `npm run billing:dev` in one terminal and `npm run desktop` in another.
Settings shows **Stripe test mode connected** and the verified prices. `npm run billing:test`
checks authentication, trial expiry, checkout creation, payment reconciliation, portal and
invoices without charging a card. Do not use the live key in the desktop process or installer.

The own-server deployment runs `billing-server/server.mjs` on billing VM131 with a persistent SQLite
`BILLING_DB_PATH`, routed publicly at `https://api.mamalead.com` in Stripe test mode. The server
streams the Windows installer from `LOCAL_DOWNLOAD_PATH` at `GET /v1/download?platform=windows`
without a key. `GET /v1/download?platform=mac-arm64` and `platform=mac-x64` stream
separate Apple Silicon and Intel Mac `.dmg` files from `MAC_ARM64_LOCAL_DOWNLOAD_PATH`
and `MAC_X64_LOCAL_DOWNLOAD_PATH`. The website checks `GET /v1/download-options`
and enables each Mac button only when its own file exists. The legacy `platform=mac`
and `MAC_LOCAL_DOWNLOAD_PATH` still select Apple Silicon.
The default download URL still selects Windows, and legacy signed grants still work.
Both files remain private on the VM. Keep the
installer readable only by the service account and back up the SQLite database.
For Blob storage, use `BLOB_DOWNLOAD_PATH`, `MAC_ARM64_BLOB_DOWNLOAD_PATH`, and
`MAC_X64_BLOB_DOWNLOAD_PATH` instead. Native Mac builds use `npm run package:mac -- --arm64`
on Apple Silicon and `npm run package:mac -- --x64` on Intel. Both include the matching
Playwright Chromium browser. Test each `.dmg` on its architecture before uploading it.
Set `RESEND_API_KEY` and `EMAIL_FROM` (or another tested mail sender) on the server before offering
trial keys or relying on automatic lifetime emails. The desktop keeps separate encrypted installation identities per billing origin,
so local test purchases never appear as live purchases. Preserve the public API URL and keep
independent SQLite backups once customers have paid.
Exports write CSV/TSV/semicolon straight to disk; Social Profiles also exports the saved profile
links as Excel `.xlsx` or PDF `.pdf` through the local save dialog.

**All Leads paging.** Startup keeps a 200-lead preview. All Leads reads its first 200 rows from
SQLite, and **Load 20 more** requests the next page. Search and filter chips query the whole
database; counts come from SQLite aggregates. Exports stream through database pages so an export
of all saved leads includes rows that have not been displayed.

## Commands

```bash
npm install --include=dev          # this shell sets omit=dev, so pass --include=dev
npx playwright install chromium    # the browser build the workers drive
npm run dev                        # Vite + Electron development shell
npm run build                      # renderer + electron production build
npm run desktop                    # build and launch the desktop app
npm run typecheck                  # renderer and electron, no emit
npm run db:test                    # repository test suite
npm run leads:scale:test           # isolated 2,000-lead paging, UI and export check
npm run scrape -- --keywords "physiotherapy,skin care clinic" \
                  --location "Manchester, United Kingdom" --limit 20
npm run package:win                # Windows installer (nsis)
npm run package:mac                # macOS dmg/zip — run on macOS
npm run package:linux              # Linux AppImage/deb — run on Linux
```

### Auto-updates

Packaged builds use `electron-updater` with a generic HTTPS feed. Set the real feed URL while
building every installer so it is embedded in the app, for example in PowerShell:

```powershell
$env:LEADSNAP_UPDATE_URL = 'https://your-domain.example/updates/nafran/'
$env:REQUIRE_UPDATE_FEED = '1'
npm run package:win
```

Publish each platform's generated `latest.yml`, `latest-mac.yml`, and `latest-linux.yml` with its
matching installer/ZIP/AppImage and blockmap files in that directory. Generic feeds do not upload
artifacts automatically; the CI workflow uploads them as build artifacts for deployment to your
HTTPS host. Upload the binaries before the metadata files so a new manifest never points at a
missing installer. Packaged apps check eight seconds after launch; Settings shows the result and
lets the user download and restart to install a newer version. Builds without a feed keep the update
card visible with a clear disabled message. Development launches never contact a feed. CI release
jobs set `REQUIRE_UPDATE_FEED=1` and fail if the URL is missing or not HTTPS.

### Signing and release builds

`electron-builder.config.cjs` keeps local packaging usable while allowing CI to fail closed for
unsigned releases. Set `REQUIRE_CODE_SIGNING=1` on release jobs. Windows reads `WIN_CSC_LINK` and
`WIN_CSC_KEY_PASSWORD`; macOS reads `CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_ID`,
`APPLE_APP_SPECIFIC_PASSWORD` and `APPLE_TEAM_ID`, or the App Store Connect API trio
`APPLE_API_KEY`, `APPLE_API_KEY_ID` and `APPLE_API_ISSUER`. In GitHub Actions, store the raw
App Store Connect `.p8` contents as `APPLE_API_KEY_P8`; the workflow writes it to a temporary file
before setting `APPLE_API_KEY`. Set `REQUIRE_NOTARIZATION=1` on a
release job to fail before packaging when notarization credentials are missing. macOS builds must
run on a macOS runner for Developer ID signing and notarization. The checked-in GitHub Actions
workflow `.github/workflows/build-installers.yml` builds all three platform artifacts and uploads
them as workflow artifacts.

The Linux job produces an AppImage and a Debian package, then signs both with the configured GPG
key. Set `REQUIRE_LINUX_SIGNING=1` with `LINUX_GPG_PRIVATE_KEY`, `LINUX_GPG_PASSPHRASE` (optional
for an unencrypted key) and `LINUX_GPG_KEY_ID`; the workflow uploads detached `.asc` signatures
next to each artifact. Run `npm run release:signing:check` locally or in CI to fail early when a
release credential is missing.
AppImage and DEB packaging is intentionally run on the Ubuntu CI runner; Windows cannot create
the Linux AppImage symlinks or invoke the Linux `fpm` toolchain reliably.

### DataForSEO production credential

The paid Decision Makers pass reads its credential in Electron's main process. It is never bundled
into the renderer, SQLite database, or installer. Production should inject `DATAFORSEO_API_KEY` at
process start, or set `DATAFORSEO_API_KEY_FILE` to a secret-manager mount containing `KEY=...` (or
the credential alone). A direct environment value takes precedence. For a local PowerShell run:

```powershell
$env:DATAFORSEO_API_KEY_FILE = 'C:\path\outside\the\app\dataforseo.env'
npm run desktop
```

The Account screen reports **Set by this machine** for this mode and its Test button calls the
zero-cost `/appendix/user_data` endpoint. The credential is held in memory by the Electron main
process for the session. Do not put it in `VITE_*`, source files, `package.json`, or a committed
`.env` file.

### Nafran Assist AI chat

Nafran Assist sends chat messages to Cerebras' OpenAI-compatible `/chat/completions` endpoint from
Electron's main process. Put the key in `%APPDATA%\nafran-leads-scraper\secrets\cerebras.key`
on Windows, configure `CEREBRAS_API_KEY` at app startup, or point `CEREBRAS_API_KEY_FILE`
at a secret file outside the project. The endpoint and model can be
changed with `CEREBRAS_API_URL` and `CEREBRAS_MODEL`; the defaults are Cerebras' API and
`gpt-oss-120b`. The renderer receives only the reply, never the key. Without a configured key the
chat reports the setup step instead of returning a scripted answer.

To verify the external secret path without running a paid search, set `DATAFORSEO_API_KEY_FILE` and
run `npm run verify:dataforseo-runtime`. The check calls only the zero-cost account endpoint and
confirms that the renderer localStorage remains empty.

Useful CLI flags: `--headless`, `--no-detail` (feed only, faster, no phone/website),
`--provider mock` (offline demo data), `--limit`.

## Verification

There is no test runner dependency. The suites drive the running app over the Chrome DevTools
Protocol and compare what the page renders against what the database holds, so they fail when the
two disagree rather than when a snapshot changes.

```bash
node scripts/dev-debug.mjs      # start the app with CDP on 127.0.0.1:9222
npm run verify                  # every suite below, in order
```

| Suite | Covers |
| --- | --- |
| `verify-backend.mjs` | the whole `window.desktop.local` bridge and every aggregate |
| `verify-pages.mjs` | Run History, All Leads, Email Finder, Social Profiles, Saved Lists |
| `verify-dashboard.mjs` | every dashboard tile, ring and insight against the database |
| `verify-remaining-pages.mjs` | Phone Finder, Decision Makers, Website Lookup |
| `verify-billing.mjs` | local usage and members against the workspace database |
| `npm run billing:test` | Stripe backend authentication, products, Checkout, portal and invoices |
| `verify-writes.mjs` | saved lists driven from the UI, and the export modal |
| `verify-console.mjs` | every surface, asserting the console stays clean |
| `verify-persistence.mjs` | what survives a restart |
| `verify-scrape-persistence.mjs` | a real scrape written to disk, then re-read |
| `verify-enrichment.mjs` | the enrichment queue end to end |
| `verify-google-gate.cjs` | Run with filters connecting Google first, and continuing in that window |
| `verify-social-page.cjs` | the Social Profiles search, platform filter and URL import |
| `test-social-import.cjs` | the URL parser and the import, against the repository directly |

`node scripts/verify-google-gate.cjs` needs no running app and no sign-in: it launches its own
copies of the desktop app in throwaway user-data folders (`--user-data-dir`, so the real database
and the real `google-profile` are untouched), presses Run with filters, and checks what the app's
own browser does. The account it connects is a cookie-jar entry put into that browser over its debug
port, which is not a login to any real account.

`node scripts/dev-debug.mjs` rebuilds `electron/` before starting. That matters: `package.json`
points at compiled `dist-electron/main.js`, so editing anything under `electron/` changes nothing
until it is rebuilt.

## Google Maps: what this does and does not do

- It reads public business listings. It does **not** bypass consent screens, CAPTCHA or bot checks.
  When Google serves a challenge the run stops with a clear message instead of pretending to have
  data. `detectBlock()` in `chromium-maps.ts` is the whole of that policy.
- **It reuses a signed-in Google profile, and that is a trade the user makes.** `Run with filters`
  always starts from the profile the app connected, so a run is an authenticated session. Read that
  as what it is — a signed-in account is an identified account, so a run is attributable to it, and
  heavy automation on it puts the account itself at risk. The trade is worth it for a profile
  created for the job; it is not worth it for the account the user reads their mail in.
- **It never touches the user's own browser profile.** The saved profile is this app's own folder.
  The browser picker chooses a *program* — Chrome, Edge, Brave — never a profile directory, so the
  Chrome the user browses with is not opened, read or written, and does not have to be closed.
- Automation of Maps is against Google's terms of service. The sanctioned route for production use
  is the official Places API; this worker exists because it needs no API key and no per-request
  billing. For volume, use the API.
- Google caps a search at roughly 120 results and decides that ceiling itself. Splitting a city into
  districts is the honest way to collect more of it.
- Headless mode is the default and is more likely to be challenged. If a run reports a block, turn
  on **Show the browser window**, slow the pace, and lower the result cap.

## Environment notes

Two quirks are worth knowing on Windows:

1. `NODE_ENV=production` and npm's `omit=dev` are set globally here, so plain `npm install` skips
   every dev dependency. Use `npm install --include=dev`.
2. Electron's post-install extraction can fail silently, leaving `node_modules/electron/dist` with
   only `locales`. The 130 MB zip is cached at
   `%LOCALAPPDATA%\electron\Cache\...\electron-v38.8.6-win32-x64.zip`; extract it into
   `node_modules/electron/dist` and write `electron.exe` into `node_modules/electron/path.txt`.
