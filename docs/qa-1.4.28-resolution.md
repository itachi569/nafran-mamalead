# Settings designs and MamaLead profile directory — 1.4.28

## Changes

- Account, Invoices and Payment follow the supplied `Award-site design build`
  ZIPs 10, 11 and 12: sage settings navigation, dark licence/payment cards,
  rounded panels, summary tiles, expandable receipt tickets and Stripe actions.
- Current Lifetime offer remains Rs 10,000. Invoice amounts are the actual
  amounts recorded by Stripe, rather than overwriting historical receipts.
  Prototype names, keys, card numbers and Rs 8,400 amounts are not shipped.
- Account retains real NF-key activation, masking, replacement confirmation,
  trial expiry, support, updates and local data controls. A rejected replacement
  does not remove the current licence. Support opens the existing message form.
- Invoices distinguish loading, empty, offline and failure states. Refresh can
  discover a newly linked customer. Paid totals keep currencies separate and
  exclude unpaid amounts. Actual Stripe PDF URLs are used when supplied;
  existing servers can still open hosted receipts. Receipt help opens support.
- Payment uses the existing authenticated Stripe portal. A new authenticated
  `/v1/payment-details` endpoint provides only brand, last four digits, holder
  and expiry. It validates customer ownership, prefers the current default card,
  and otherwise uses the paid Lifetime checkout's method. No full card number,
  CVC, raw Stripe object or client secret is exposed or persisted by this UI.
  Older/unavailable servers retain a usable portal without invented card data.
- Default data moves from `nafran-leads-scraper` to the real `MamaLead` directory.
  Bootstrap acquires the existing single-instance lock before copying the full
  profile to a temporary sibling and publishing the completed copy. SQLite WAL,
  encryption metadata, licence tokens, browser profiles and preferences are
  retained; the legacy directory remains a backup. Explicit/custom profiles are
  untouched. Existing destination data is never merged or overwritten. Locked
  files, linked folders or copy errors retain the original working profile.

## Validation

- Renderer/Electron production build and 17 packaging configuration checks.
- 138 billing server checks, including invoice metadata, authenticated card
  display and anonymous-access rejection, using fixture Stripe responses.
- Payment details tests cover customer isolation, current-card precedence,
  paid-only fallback, non-card/null states and restricted display fields.
- Isolated Electron settings tests cover activation, key visibility, replacement
  cancellation/failure, trial expiry, existing support form, both portal actions,
  invoice/PDF opening, actual amounts, mixed currencies, missing customer,
  refresh, empty/offline/error states, compact layouts and dark mode.
- The same suite passed against the packaged Windows app. Masked card numbers
  remain inside the card, and narrow Settings navigation stacks above the page.
  Removed a legacy inline window-width override that defeated container queries.
- Package audit: version 1.4.28, 5,158 entries, changed profile/bootstrap/billing
  modules present, and no private configuration, credential or database paths.
- Profile migration tests preserve a real SQLite lead, encrypted safeStorage
  fixture token and localStorage preference through migration and restart.
  File tests cover WAL, original backup, custom paths, collisions, failed-copy
  cleanup and repeat launch without overwriting newer data.

Automated tests use isolated profiles and fixture billing data. They do not
charge cards, send support messages or change the user's active database.

## Release status

Production deployment is on hold. The existing self-hosted server remains the
target. The additional invoice and payment metadata must accompany the next
authorized backend deployment; older servers retain hosted-receipt and portal
functionality. No Vercel configuration or hosting change is involved.

The fresh `npm run package:win` build completed on 31 October 2026 at 21:27 PKT.
The local review installer is unsigned; production signing/publication remain
held release steps. Installer size: 339,522,242 bytes. SHA-256:
`43c9167a292dc4508ab81b54fcd769e5faa3a41d8552af56a18b496079257d3f`.

Local review installer:
`D:/CodexBuilds/MamaLead-1.4.28-20261031/release/MamaLead Setup 1.4.28.exe`.
Packaged UI previews are in `screenshots/qa-1.4.28/` (`*-design.png`); these
show isolated fixture accounts, not customer card or licence records.
