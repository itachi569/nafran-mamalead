# Nafran Leads Scraper — historical app design brief

> This is the original design brief and includes retired pricing/features. For the current 1.4.22 website and activation flow, see [website-design-2026-10-31.md](website-design-2026-10-31.md) and [qa-1.4.22-resolution.md](qa-1.4.22-resolution.md).

This document describes the **desktop app** so a web version / marketing site can be designed from
it. It covers every screen, what each control does, the data behind it, and the services it talks to.
Screenshots of all 11 pages are in `screenshots/` next to this file.

---

## 1. What the product is

A **local-first lead generation desktop app** for a single operator (agency / freelancer) whose
customers are local businesses.

The workflow in one line:

> Scrape Google Maps for a keyword + city → get businesses (name, address, phone, website, rating,
> reviews) → enrich each one by reading its own website (social profiles, email addresses, phone
> numbers, named decision makers) → work the list (score, filter, save to lists, export CSV/Excel).

Everything is stored on the user's machine in SQLite. There is no account, no cloud, no telemetry.
The app is sold as a subscription (Free / Pro £39 / Studio £89 per month), and the plan only limits
how many scrapes and lookups are allowed per month. **Billing is not implemented yet** — the billing
page shows plan + usage honestly but has no payment provider behind it.

---

## 2. Tech stack (what's in the zip)

| Layer | What it is |
|---|---|
| Shell | Electron 38 (main process in `electron/`, TypeScript, compiled to CJS in `dist-electron/`) |
| UI | React 19 + Vite 7, TypeScript. The whole UI is one generated component: `src/app/ReferenceApp.tsx` |
| UI source of truth | `src/app/ReferenceApp.tsx` is **generated** from `.reference/markup.html` (the designer's export) by `scripts/build-reference-ui.mjs`. Never hand-edit it — edit the generator or the design markup and re-run `node scripts/build-reference-ui.mjs` |
| Values | Every binding (`{{ name }}` in the markup) is a key in the object returned by `src/app/useAppValues.ts` |
| Styles | `src/styles.css`, also generated, from `.reference/styles.css` |
| Database | SQLite through `node:sqlite`, file at `%APPDATA%\nafran-leads-scraper\leads.db`, WAL mode |
| Scraping | Playwright-driven Chromium reads Google Maps result pages |
| Enrichment | Background worker (`electron/enrichment/runner.ts`) with job kinds: `social`, `email`, `phone`, `decision-maker`, `website`, `deep` |
| Verification suites | `scripts/verify-*.cjs` / `test-*.cjs` — Playwright drives the real app and asserts real DOM |

**Design tokens** (from `src/styles.css`): font `Satoshi` (fallback Helvetica/Arial), page background
`#EFEFEF`, text `#1C1C1C`, cards `#F5F5F4` on light and `#1C1C1C` on dark cards, accent greens
`#C8D5BB` / `#A9BC9B` / `#8FA382` / `#DDE3D6`, muted text `#5A5F5C` / `#9BA29C`, borders `#E4E5E2`,
pills with `border-radius:999px`, cards with `border-radius:22px`, most controls 40–46px tall.
Light and dark themes both exist (the whole palette is remapped).

---

## 3. The 11 screens and what happens on click

Navigation is a left rail with five groups: **Home** (Dashboard), **Scraper** (Google Maps),
**Add-ons** (Social Profiles, Email Finder, Phone Finder, Decision Makers, Website Lookup),
**Data** (All Leads, Saved Lists, Run History), **System** (Settings).
The rail also shows live plan usage ("0 of 2,000 Maps scrapes", "0 leads on file", "22 days left"),
a theme switch, and an "Ask Nafran Assist" chat button.

### 3.1 Dashboard (`screenshots/dashboard.png`)
At-a-glance view: four headline tiles (Total Leads, Enriched, With Phone, Ready to Export), a
scrape-volume chart, AI insight sentence, contact-coverage rings (phone / email / socials / decision
makers), social platform coverage, top categories, "Needs attention" list with one-click actions,
"Quick actions", and a run timeline.
**Clicks:** range switcher (7 Days / 30 Days / All Time) re-reads the aggregates · "Run Email Finder"
→ Email Finder page · "Find phones" → Phone Finder · "New scrape" → Google Maps page ·
"Export now" opens the export modal.

### 3.2 Google Maps (`screenshots/maps.png`, `screenshots/maps-results.png`)
The scraper. Left: keyword chips (add/remove, "Add keyword…"), a location box, "Max results" stepper,
an enrichment multi-select (Find emails / Find phone numbers / Find social media / Find decision
makers / Find LinkedIn page), a "Bulk import keywords" action, and the primary **Run with filters**
button. Right: filters (minimum rating, minimum reviews, has website, has phone), run behaviour
(Google account status + "Sign in to Google…", show browser window, split city into districts, delay
between places 1.5–10 s, browser program picker).
Below: a live map sketch with pins for the places captured, a progress strip (Progress / Phones found
/ Websites found / Emails found), and the **Results** table (business, contact, address, rating,
socials, score, decision) with a filter box, Export button, pagination ("Show all"), plus a Live
Activity log.
**Clicks:** Run with filters opens the app's own browser if Google isn't connected, then scrapes and
streams places in live · "Show all leads" clears the scan filter · Escape cancels a running scan ·
a running pass can be stopped from the scan panel.

### 3.3 Social Profiles (`screenshots/social.png`)
Table of the social profiles found on each lead's site: initials, business, platform chips, handle,
status, "last checked". Toolbar: search box, state filter (All / With profiles / Pending / No
website), Refresh, Import, History drawer (recent searches as chips). Summary cards: reach,
platform donuts, extras.
**Clicks:** clicking a row's profile opens the profile URL · "Import profiles" opens the shared import
modal (paste profile URLs or handles → real profiles are filed) · Refresh re-reads the database ·
a scan started here shows the scan overlay with per-URL progress.

### 3.4 Email Finder (`screenshots/email.png`)
Finds email addresses by reading each lead's own website (contact/about/team pages, mailto links,
schema.org). Shows: a coverage cascade (leads → with website → page read → addresses found), a
confidence mix chart (score buckets 0–100 in fives), a tier chip summary, and one row per lead
(index, business, best address, tier chip, how many found, status, confidence bar).
Bulk actions: "Run the cascade", "Find & verify needed", "Advanced SMTP check", "Deep search missing"
(deep = paid DataForSEO search). Per-address actions: copy, mark verified, re-check.
**Clicks:** the scan panel shows the crawled page and a ring per URL · addresses are click-to-copy ·
"Verify" runs the verification provider (see §5).

### 3.5 Phone Finder (`screenshots/phone.png`)
One row per lead: business, number or "No number found", line-type pill (reception / direct / mobile /
missing), area code, address. A dark summary card: how many leads a call would reach, what share is
callable, how many are direct lines. "By Area Code" card groups numbers by dialling code.
**Clicks:** "Find phones for missing" queues a phone pass over every lead without a number.

### 3.6 Decision Makers (`screenshots/dm.png`)
Names the person to ask for. Coverage card (matched / total, %), seniority mix, "Matched Contacts"
cards (initials, name, role, company, LinkedIn button, strong/likely badge), "Suggested Contacts"
(candidates found by the deep pass, each with the evidence it came from — Confirm / Dismiss / Undo),
and an "Awaiting a match" blocker list with a blocker filter ("No website", "No people listed",
"Pending").
**Clicks:** Confirm turns a suggestion into a confirmed contact · Dismiss/Undo move it back ·
"View profile" opens LinkedIn · "Deep enrich missing" / "Deep enrich all missing" run the paid pass.

### 3.7 Website Lookup (`screenshots/website.png`)
Paste a domain (or many) and the app reads just that site: business name, address, phone, email,
socials, decision maker — one card per site — plus recent import batches.
**Clicks:** "Import websites" opens the shared import modal · pasting profile URLs switches the same
modal to profile import · "Upload CSV" / "Paste from clipboard" are drawn but not wired yet ·
`isProfileLine()` decides the route: a social host or a leading `@` = profile import, anything else =
website scan.

### 3.8 All Leads (`screenshots/leads.png`)
The ledger: every lead on file, newest first, grouped by the day it was saved. Columns: initials,
business + domain, on-file chips (P / E / S), source (Maps / Import / Manual), score pill, saved date.
Above it: a dark "Permanent store" card (total on file, where the file lives and its size, source
split) and "What is on file" (phone numbers, email addresses, social profiles with counts and %).
Toolbar: search box, filter chips (All / Has phone / Has email / Has socials / No contact yet),
Export all, Save to list, pagination.
**Clicks:** chips filter the table · "Load 20 more" really loads 20 more rows · "Export all" opens the
export modal (CSV / Excel, scope + column picker, writes straight to disk).

### 3.9 Saved Lists (`screenshots/lists.png`)
Bookmarked leads grouped into named lists (name, member count, avatars, updated date, note). Card for
"the picks from the last run" with a bookmark counter.
**Clicks:** "Save to list" on All Leads sends the selection here · list cards open their members.

### 3.10 Run History (`screenshots/runs.png`)
Every scrape, import and enrichment pass the machine has run: badge with the total, four tiles
(Runs, Places captured, Median duration, Clean runs), and a timeline — one row per run with time,
keywords, summary line, a bar chart of places per pass, status pill (Done / Failed / Cancelled) and a
**Re-run** button that really starts the same scrape again. Footer: "Showing N of M runs · log kept
for 90 days" with "Older runs" pagination. Export log button.
**Clicks:** "Re-run" navigates to Google Maps and starts a run with the same filters.

### 3.11 Settings / Billing & Account (`screenshots/settings.png`)
Five sections in a left tab list: **Plan & usage** (plan card with price, renewal date, cycle range
and six usage meters: Maps scrapes, Email lookups, Phone lookups, Social lookups, Decision-maker
lookups, AI insight summaries — each "N of limit" with a bar), **Payment** (no card on file),
**Invoices** (empty — the app does not bill), **Account** (identity rows, time zone, password,
two-factor, data location, and the **DataForSEO key** row: paste box + Save + Test, where Test is
free and reports the account balance), **Team** (seats).
**Clicks:** tab list switches sections · Save stores the API key on this machine only · Test calls
DataForSEO `/appendix/user_data` (free) and reports "Working · $X left" or "Rejected — check the key."

### Global
- Header: global search (leads, runs, pages — real, with a results dropdown), theme button, notifications.
- Floating toast for every action result; a bottom status strip ("CONNECTED · ERRORS 0 · ELAPSED ·
  STATUS · BUILD v1.4.0").
- "Ask Nafran Assist" chat: scripted answers (no AI model behind it) that quote the workspace's real numbers.
- Google account gate: the app opens **its own** browser window for Google sign-in (never the user's),
  and a scrape will not start until it is connected.

---

## 4. Data model (SQLite)

`workspaces` · `workspace_members` · `subscriptions` · `usage_counters` · `scrape_runs` · `leads` ·
`lead_contacts` (emails/phones found, with source + confidence) · `social_profiles` ·
`decision_makers` (confirmed people) · `decision_maker_candidates` (suggestions awaiting confirmation) ·
`lists` / `list_items` · `enrichment_jobs` (queue: kind, lead_ids, status) · `exports` ·
`import_batches` · `search_history` · `activity_log`.

A lead row: name, category, address, area, postcode, phone, website, rating, review_count, latitude,
longitude, place_ref, maps_url, query, keyword, provider (`chromium-maps` / `import` / `mock`),
captured_at, last_scanned_at.

---

## 5. External services

| Service | Used for | Credential |
|---|---|---|
| Google Maps (via bundled Chromium) | the scrape itself | the user's own Google account, inside the app's browser |
| **DataForSEO** | "Deep Enrich": a Google search to name a business's founder/owner, then a second search for that person's mailbox. Standard queue, depth 10, ≈ $0.0006 per search (≈ $0.0024 per lead worst case) | API key (Base64 `login:password`) entered in Settings; never written to disk by the main process |
| **LeadsAngel** | email deliverability / SMTP verification (imported as a ZIP licence, has an expiry date) | licence ZIP imported in Settings |
| **Apify** | optional email-verifier actor | `APIFY_EMAIL_VERIFIER_ACTOR` environment variable |

Rules the app follows: a search snippet is somebody else's claim, so deep-pass addresses are filed as
**suggestions to confirm**, never as facts. A mailbox is only accepted when the page mentions the
business or the address is on the business's own domain.

---

## 6. What to design for the website (suggested scope)

1. **Marketing site** (most likely): hero with the value proposition ("scrape Google Maps, enrich on
   your own machine, no cloud"), how it works in 3 steps (scrape → enrich → export), feature pages
   per add-on (Social, Email, Phone, Decision Makers, Website Lookup), the privacy angle ("all data
   stays on your machine"), a screenshot tour using `screenshots/`, pricing (Free / Pro £39 / Studio
   £89), FAQ, download page with the Windows installer, and a support/contact page.
2. **Web app version** (bigger): the same 11 screens in a browser, with the scraping worker moved to a
   server, plus accounts, billing and per-seat limits — the desktop app's billing/team pages already
   sketch what that looks like.
3. The design language to carry over: Satoshi, `#EFEFEF` page, rounded 22px cards, 999px pills, the
   green accent family, the light/dark duality, tables with dot-grid "big number" typography.

---

## 7. Notes for whoever works on this

- `src/app/ReferenceApp.tsx` and `src/styles.css` are **generated** — change the design markup or the
  generator, then run `node scripts/build-reference-ui.mjs` and `npm run build`.
- The app runs on Windows x64 today; `npm run package:win | package:mac | package:linux` build the
  installers, `npm run verify` runs the whole verification battery.
- Not finished yet (see `README-FIRST.txt`): a few dashboard cards still show the designer's sample
  figures (contact-coverage rings, social platform chart, top categories, two run-timeline chips),
  the Decision Makers footer row count is fixed, billing has no payment provider, and the app has no
  icon or code signing yet.

---

## 8. Landing page: what has to change to match the app

There is a landing-page design (`Leads Scraper Landing`). Whatever it says, it has to agree with what
the app actually does. The list below is the app's own truth — anything on the page that contradicts
it is a change.

### 8.1 Claims that must match
| The page should say | Because |
|---|---|
| **Windows 10/11 desktop app** (64-bit) | only the Windows build exists; mac/linux targets are configured but never built |
| **Everything stays on your machine** (SQLite file, no cloud, no account) | the app has no server and no signup |
| **It drives your own Google account** in the app's own browser window | a scrape will not run until Google is connected; it never touches the user's normal browser profile |
| **You bring your own credentials for optional extras** — DataForSEO (deep search, ≈ $0.0024 per lead) and a LeadsAngel licence ZIP for SMTP verification | they are optional and imported in Settings; this app does not bill for them |
| **Export to CSV / Excel, written straight to disk** | that is what the export modal does |
| **No credit card needed to start** | there is no payment provider behind the app yet (see 8.3) |

### 8.2 Features to show, per screen
1. **Google Maps Scraper** — keywords + city, rating/review/website filters, live map pins, live
   activity log, results table with score and decision column.
2. **Social Profiles** — the profiles each site publishes, with an import for pasted profile URLs.
3. **Email Finder** — reads the lead's own website (contact/about/team pages, mailto, schema.org),
   shows a coverage cascade and a confidence mix, and verifies through the imported LeadsAngel licence.
4. **Phone Finder** — reception / direct / mobile line typing, area-code breakdown, backfill card.
5. **Decision Makers** — names the person to ask for, with evidence; suggestions must be confirmed
   by a human before they count.
6. **Website Lookup** — paste any domain (or many) and get one card per site.
7. **All Leads / Saved Lists / Run History** — the local ledger, lists, and a re-runnable log.
8. **Settings** — plan and usage, the API keys, theme, and where the database lives.

Use the real screenshots in `screenshots/app-pages/` (11 pages, real data) rather than design
mockups — the numbers in them are true.

### 8.3 What the page must NOT promise (yet)
- **Buying a plan inside the app.** There is no billing provider: the Pricing page can list
  Free / Pro £39 / Studio £89, but the button should be "Download" or "Join the waitlist", not
  "Subscribe" — until a payment provider exists.
- **A web app / login / team seats.** The app is local and single-operator today; `web/` is a
  separate Next.js experiment, not a hosted product.
- **Automatic updates.** `electron-updater` is wired, but no release feed is configured, so nobody
  receives updates yet.
- **macOS / Linux downloads.** Do not offer what has not been built.

### 8.4 Things a landing page for this product needs
1. **Download section** — one Windows button, file size (~100 MB), and a short note: *"Windows may
   show a SmartScreen warning because this build is not code-signed yet — More info → Run anyway."*
2. **A 60-second "how it works"** — scrape → enrich → export, with a screenshot per step.
3. **Privacy block** — where the database lives (`%APPDATA%\nafran-leads-scraper\leads.db`), that
   nothing is uploaded, and how to back it up.
4. **FAQ** — Is this allowed by Google? (it scrapes public listings through your own signed-in
   browser, at a human pace with a configurable delay) · Do I need an API key? (no, only for the paid
   extras) · Does it work for my city/country? (the market list covers UK, PK, IN, AE, SA, BD, US, CA,
   AU, IE, DE, FR, ES, IT, NL, TR, MY, SG, ZA, QA, KW, OM, BH) · Where is my data? · Refunds/support.
5. **Pricing table** — what each tier would include, marked clearly if it is not purchasable yet.
6. **Design language carried over** — Satoshi, `#EFEFEF` page, 22px cards, 999px pills, greens
   `#C8D5BB` / `#A9BC9B` / `#8FA382`, dark `#1C1C1C` sections, dot-grid big numbers.

### 8.5 Where the landing design lives
Drop the design export (`Leads Scraper Landing.dc.html` and any images it needs) into `landing/` in
this zip. Then it, this brief and the app source travel together, and the page can be rebuilt to
match the app screen by screen.
