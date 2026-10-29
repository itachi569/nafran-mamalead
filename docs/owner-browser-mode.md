# Decision Makers: local Chrome search

Owner searches now run in the user's installed Google Chrome, using a dedicated
`owner-google-chrome` profile inside MamaLead's user-data directory. The normal
Chrome profile and the Google Maps browser profile are not used or copied.
This is local browser mode, not offline search: Google and linked sources still
need internet. No DataForSEO request is made by the app's Decision Makers or deep
owner queue. Existing license and per-company credit checks remain active.

Open **Decision Makers → Open Chrome & sign in**. Sign in directly on Google's
page. Import websites and start the scan; **Show Chrome** restores the search
window, including after it was minimized. Google session expiration may require
sign-in again. The app does not handle passwords, rewrite session-cookie expiry,
solve CAPTCHAs, or suppress browser security checks.

Each business uses at most two distinct searches:

1. `name of <domain> founder and his email must be present`
2. Only if an owner was established without an email:
   `<owner name> owner of <domain> email address`

Organic result links and AI Overview citations feed the existing public-source
verification. AI answer text is not accepted as proof of an email. A direct owner
email must match the established person; generic company inboxes and guessed
addresses remain excluded. No established owner means no speculative second query.

Sign-in happens before consuming a company credit. Google consent/verification
pauses the scan for up to five minutes for the user. Stop cancels the wait. A closed
or unreadable browser stops the batch instead of charging the remaining companies.
Successful empty searches can report Not published; sign-in, verification and
page-reading failures report a retryable error. Google may restrict automated
search even with a signed-in profile; availability is not guaranteed.

Chrome is started normally with its dedicated profile and a random loopback
DevTools port. No automation-hiding flags or copied credentials are used. Only
the search page's public result DOM is read. The private profile stays outside the
repository and installers. Normal Chrome can remain open at the same time.

Validation:

- `node scripts/test-owner-browser.cjs`: disposable Chrome profile, real DOM
  fixtures, two-query source verification, manual-check resume, Stop, profile
  persistence, setup before credits, and batch failure accounting.
- `node scripts/verify-owner-browser-ui.cjs [--packaged]`: isolated Electron
  workspace and Chrome profile; real main-process routing and preload, two
  searches, one company credit, zero DataForSEO calls, light/dark UI.
- `node scripts/test-owner-two-search.cjs` and
  `node scripts/test-owner-two-search-runner.cjs`: existing owner-source rules,
  two-query limits, durable outcomes, 50-company scope and cancellation.
- `node scripts/verify-owner-browser-live.cjs`: anonymous live smoke check;
  stops and reports if Google asks for human verification.

The QA scripts use fixture cookies only in disposable test profiles. They never
seed or modify authentication in the user's real Chrome or MamaLead profiles.
