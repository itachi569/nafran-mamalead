# MamaLead website preview — 1.4.19

Prepared 30 October 2026. Local preview only; no production deployment, installer publication or update-feed change was performed.

Preview: http://127.0.0.1:8798/

## Current app coverage

The page now follows the packaged Windows app at version 1.4.19. Its eight feature galleries cover all ten current sidebar pages:

| App page | Website coverage |
| --- | --- |
| Dashboard | Dashboard screenshot, Insights / Reports, saved lead and contact totals |
| Google Maps | Total lead cap across the run, optional Google browser, live results, Saved searches and per-run PDF/Excel |
| Social Profiles | Published profile links, account deduplication, expandable accounts, saved search and scan progress |
| Email Finder | One main website email, Contact Us/sitemap discovery, current results, optional scoped validity, progress/Stop and exports |
| Phone Finder | Main published number, additional numbers, saved Maps phones, instant saved search and scan progress |
| Website Lookup | Selected email/phone/social/address fields, up to 500 unique sites, source pages, statuses, retries and current-scan export |
| All Leads | Saved local database, search and branded PDF/Excel exports |
| Saved Lists | Named lists for selected businesses |
| Run History | Earlier Maps runs and enrichment work |
| Settings & Billing | Trial/Lifetime activation, Usage/Payment/Invoices/Account, automatic updates and Assist |

Shared import, History, Notifications, concise multilingual Assist with page links, and automatic-update controls are documented. All visible Decision Makers offers, allowance claims, owner-email descriptions, subscription links and gallery screenshots have been removed. Header/footer retain the MamaLead logo. Pricing is a two-card Trial/Lifetime layout with aligned actions. The website privacy text no longer describes removed owner searches.

## Screenshots and validation

- 24 PNG screenshots in `website/img/app/v1.4.19/`, captured from the current packaged desktop app with isolated fictional sample data.
- Email validity screenshots use simulated provider responses. Assist uses an explicitly illustrative response. No customer records, credentials, real payments or mailbox verification were used for captures.
- Three finder progress screenshots come from the packaged queue tests, which exercise 0/50/100% progress and stopping with completed results retained.
- `node scripts/verify-website-current.cjs` passed at desktop 1440 px, tablet 768 px and mobile 390 px: eight gallery descriptions and every image tab, 28 FAQs, current image decoding, both logos, how-it-works destinations, pricing alignment, no page overflow and no renderer/local-asset errors.
- Additional QA evidence: `outputs/MamaLead-website-1.4.19/check.json` in the parent task workspace, alongside desktop/mobile preview images.

## Reproduce and preview

The screenshot scripts expect the current packaged app in `release/win-unpacked`:

1. `node scripts/capture-website-current.cjs`
2. `node scripts/capture-website-email-current.cjs` (refreshes the detailed Email Finder captures)
3. `node scripts/verify-finder-progress-ui.cjs --packaged`; use the three light-mode `packaged-*-running.png` captures for the corresponding `*-progress.png` website files.
4. Serve `website/` locally using `website/server.mjs` with `LANDING_ROOT` set to its absolute directory and `LANDING_PORT=8798`.
5. `node scripts/verify-website-current.cjs`

All changes in this task affect website content/assets or website capture/QA scripts. The desktop app and its installer were not changed. The Windows download still points to `https://api.mamalead.com/v1/download?platform=windows`; it has not been redirected to the unsigned local 1.4.19 QA installer. Version 1.4.19 screenshots here preview the latest app, not a claim that its installer has been published.
