# Local website preview - 1.4.18

Prepared 29 October 2026. This website is included in the source update and has **not been deployed** in this task.
The preview runs at `http://127.0.0.1:8798/`.

## Content and screenshots

The eight module descriptions and existing workflows were compared with the packaged
1.4.18 app. The page now uses 23 current light-mode screenshots with fictional sample
businesses. Customer data, credentials and real billing were not used for these images.

| Area | Information covered |
| --- | --- |
| Maps | Total run limit, live results, top-level Saved searches, per-run PDF/Excel, browser options |
| Social Profiles | Published account links, duplicate merging, expanded accounts, live saved search, History |
| Email Finder | One main website email, Contact Us/sitemap reads, optional scoped validity, progress/Stop, validity status filters, Unknown recheck, Cascade and Confidence mix |
| Phone Finder | Main website number first, additional numbers, saved Maps numbers, live search and exports |
| Decision Makers | Owner evidence, all selected businesses, progress/Stop, published versus indexed email sources, source labels in exports |
| Website Lookup | Selected contact fields, current-scan results, automatic result scrolling, source pages, retries and PDF/Excel |
| Saved data | All Leads, Lists, Run History, Insights / Reports and branded exports |
| Notifications | Click an unread card to mark it read; filters, explicit controls, delete/Undo and contextual actions |
| App updates | Opt-in background downloads, manual checking, progress, voluntary restart and new-release notifications |
| Assist | Concise answers, the user's language/script, relevant page-name links below replies, Reports navigation |
| Billing | Existing trial, Lifetime and Decision Makers access details retained |

The original header/footer logos, Windows-only download presentation, pricing and
checkout/download routes remain. The download URL still targets the existing public
release; this preview does not publish an installer or update feed.

## Scope boundary

The proposed owner-name/company Google query flow is **paused pending the user's
choice**. Its separate uncommitted backend prototype and test are not a completed
desktop release. This website describes the existing packaged 1.4.18 behavior, not
that unfinished proposal. Do not silently include or publish the prototype later.

## Validation and reproducibility

- `node scripts/verify-website-current.cjs` checks all 8 module galleries, 23 images,
  33 FAQs, original logos, Windows download route, aligned pricing actions and
  1440/768/390-pixel layouts. No page errors or missing local assets were found.
- Visual checks cover the update card, Assist link, owner source labels, Reports,
  Email Finder, module dialogs and mobile content.
- Explicit image dimensions reserve space while screenshots load.
- `scripts/capture-website-current.cjs`, `capture-website-email-current.cjs` and
  `capture-website-owner-current.cjs` use isolated sample profiles and the existing
  `release/owner-lookup/win-unpacked/MamaLead.exe` package.
- Screenshots and capture metadata are in `website/img/app/v1.4.18/`.
- Browser review outputs are in the workspace `outputs/MamaLead-website-1.4.18/`.

Deployment remains deferred at the user's request. Before any later release, align
the final app version, signed installer and website with the approved feature scope.
