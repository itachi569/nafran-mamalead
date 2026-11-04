# MamaLead website design handoff

Latest local website design snapshot: **4 November 2026**. This branch is for reviewing and improving the website in Claude Design. It includes the new Mama AI chat interface. It is not a production deployment or a new desktop release.

Updated from the user-supplied **Nafran Mamalead website (4).zip**: animated Mama AI showcase, support/email popup and dark footer with working checkout/trial links. The existing ticket form at `/support` remains available. Desktop, tablet and mobile browser checks passed in the integrated project, including the new chat entry points, support popup and checkout/trial/download flows with isolated service fixtures.

## Files to edit

- `index.html`: homepage, layout, sections, footer and support launcher.
- `mama-ai.css` and `mama-ai.js`: Mama AI chat panel and interactions.
- `support.html`, `privacy.html`, `terms.html`, `thank-you.html`: supporting pages.
- `img/`, `fonts/`, `vendor/`, `lottie/`: existing website assets.
- `billing.js`, `sales.js`, `support.js`, `thank-you.js`: existing checkout, trial, support and download interactions. Preserve their API contracts when changing presentation.

## Preview locally

Use Node.js 20 or newer. From the repository root in PowerShell:

```powershell
$env:LANDING_ROOT = (Resolve-Path website).Path
$env:LANDING_PORT = '8819'
node website/server.mjs
```

Open `http://127.0.0.1:8819/`. No dependency install is needed for this static preview. Other pages are available at `/support`, `/privacy`, `/terms` and `/thank-you`.

## Design requirements

- Keep MamaLead branding and the black, cream and sage colour palette.
- Keep the current Rs 10,000 Lifetime pricing and one-day trial flow. Trial and payment actions must retain the existing validation, email delivery and download behaviour.
- Mama AI replaces the fixed support launcher. Keep short answers, responsive layout, minimize/close controls and accessible keyboard focus states.
- The chat allowance is enforced by the API. Do not show a question count or remaining-message counter in the design. On reaching the allowance, offer email support.
- Keep `hello@mamalead.com` clickable wherever shown, using `mailto:hello@mamalead.com?subject=MamaLead%20Support`.
- Keep real product information. Do not add fabricated sales counts, endorsements or unsupported feature claims.

## Integration status

This is a **website frontend snapshot**. The new Mama AI API implementation is being maintained separately in the main working project and has not been deployed with this snapshot. Its routes are `GET /v1/assist/web/config` and `POST /v1/assist/web/chat`. Until that API is available, the local static preview can show the chat layout and its email fallback, but live AI replies are not guaranteed.

Backend and desktop files elsewhere in this branch are the public main baseline, not the latest unpublished application work. Do not use this branch for a full app release. Do not embed API keys or private configuration into the website. Return design changes for review; deployment is a separate step.
