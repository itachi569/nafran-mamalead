# Website design 4 integration — 4 November 2026

Source: the user-supplied `Nafran Mamalead website (4).zip`, under `deploy/mamalead-website/`.

Imported the new homepage and the related support links on Privacy, Terms and the thank-you page. The supplied fonts, images, Mama AI assets and billing JavaScript match the current project and did not require replacement.

## Included

- Animated Mama AI section with labelled sample conversations and a working link to the real chat.
- New dark footer, grouped navigation, product facts, email/AI shortcuts and Lifetime/trial calls to action.
- Support popup with clickable `hello@mamalead.com`, copy-address interaction, keyboard focus handling and a link to Mama AI.
- Existing hidden chat allowance and email handoff.
- Existing Stripe checkout, trial email delivery gate, Windows download chooser and verified-payment thank-you flow.
- The existing ticket form at `/support` is preserved; it was not included in the design ZIP.

The ZIP's Vercel configuration was not imported. The existing server and backend routes remain the deployment target. This work updates the website only; it does not change the desktop installer.

## Checks

Passed:

- `node scripts/verify-public-pages.mjs`
- `node scripts/verify-qa-website.mjs` — desktop/tablet/mobile layouts, support popup, keyboard focus, trial navigation, clean routes, no overflow or JavaScript errors.
- `node scripts/verify-website-assist-ui.mjs` — all three Mama AI entry points, hidden quota, six-reply handoff, retry, persisted conversation and clickable email.
- `node scripts/verify-website-support.mjs` — public ticket form validation, CAPTCHA, drafts, inbox and email acknowledgment contract.
- `node scripts/verify-website-billing.mjs` — checkout buttons including the new footer, double-click protection, trial/download recovery and payment-confirmation states.
- Additional browser check of the direct `/#support` link, copy interaction, support-to-chat handoff and footer trial scroll.

Payment, mail, CAPTCHA and AI-provider behaviour in these browser suites uses isolated fixtures; no production purchase or customer email was created. Screenshots are in `screenshots/website-design4/`. Existing working pages were backed up outside the repository in `outputs/website-before-design4-20261104/`.

No production deployment was performed. The design sharing branch contains frontend files only; the integrated project also retains the unpublished Mama AI backend work.
