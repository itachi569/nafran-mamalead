# Decision Makers: local Chrome search

Owner searches now run in the user's installed Google Chrome, using a dedicated
`owner-google-chrome` profile inside MamaLead's user-data directory. The normal
Chrome profile and the Google Maps browser profile are not used or copied.
This is local browser mode, not offline search: Google and linked sources still
need internet. No DataForSEO request is made by the app's Decision Makers or deep
owner queue. Existing license and per-company credit checks remain active.

Open **Decision Makers → Open Chrome & sign in**. This first window is ordinary
installed Chrome, without remote debugging, Playwright or any automation-hiding
flags. Sign in directly on Google's page, close that Chrome window, then click
**Connect saved sign-in** in MamaLead. Only this explicit second action attaches
the search controller. A saved-session hint allows future runs to reuse the
profile, but it never replaces checking the actual Google session.

Once connected, consecutive imports reuse the same Chrome process without
focusing or restoring its window. After restarting MamaLead or closing the search
window, the next scan reconnects the saved profile automatically and minimizes
the newly opened window. **Show Chrome** remains an explicit foreground action.
The card displays **Google sign-in saved** instead of repeating setup instructions.
If MamaLead was restarted during the first manual login, **Connect saved sign-in**
can resume setup after that login window is closed.

Import websites and start the scan; **Show Chrome** restores the search window,
including after it was minimized. To renew an expired login, stop the scan and
choose **Sign in to Google** to reopen the normal manual window. Sign-in is never
attempted inside the controlled search window. The app does not handle passwords,
rewrite session-cookie expiry, solve CAPTCHAs, or suppress browser security checks.

Each business uses an adaptive search sequence:

1. `"<domain>" founder owner email address`
2. Check the linked public pages for ownership and the person's published email.
3. If no owner was established, try targeted founder/about queries for that domain.
4. Once identified, search `"<owner name>" "<domain>" email address`, then
   contact, Gmail and site-specific variations only as needed.
5. Stop at the first verified owner/email match and retain the public source link.

The sequence has a maximum of six distinct queries and 45 seconds of active work
per company. Google checks that require the user have a separate wait allowance.
Each query has at most six ranked sources, three prefetched together, with a
3.5-second source-read ceiling. Up to three relevant contact/about links from
the company's own pages can be followed without spending another Google query.
Source URLs are read once per company. There is no unbounded crawl.

Organic result links and AI Overview citations feed the existing public-source
verification. AI answer text is not accepted as proof of an email. A direct owner
email must match the established person; generic company inboxes and guessed
addresses remain excluded. Published Gmail addresses are allowed when their
source ties them to the established owner and business. Missing emails remain
blank; an exhausted time budget is a retryable error, not proof of absence.

Starting a scan scrolls once to Contact Coverage, with Stop in view. Progress ticks
do not override the user's subsequent scrolling; completion reveals the results.
The panel distinguishes Google steps that need user action from active searching
and displays how many linked source pages have been checked.

Search reads begin at document commit instead of waiting for DOMContentLoaded,
so a deferred third-party script cannot delay visible results. Normal navigation
and DOM reading share a 15-second deadline (user verification has a separate wait).
Up to three linked sources are prefetched, then inspected in priority order.
A complete verified result returns immediately and aborts unnecessary peer reads;
source validation remains required even when Google displays a convincing summary.

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
  fixtures, source verification, manual-check resume, Stop, profile
  persistence, setup before credits, and batch failure accounting.
- `node scripts/verify-owner-browser-ui.cjs [--packaged]`: isolated Electron
  workspace and Chrome profile; real main-process routing and preload, adaptive
  follow-up searches, one credit per company, zero DataForSEO calls, light/dark UI.
- `node scripts/test-owner-two-search.cjs` and
  `node scripts/test-owner-two-search-runner.cjs`: existing owner-source rules,
  adaptive limits, fast early exit, Gmail matching, linked contact pages,
  durable outcomes, 50-company scope and cancellation.
- `node scripts/verify-owner-browser-live.cjs`: anonymous live smoke check;
  stops and reports if Google asks for human verification.

The sign-in regression checks assert that the manual window has no debugging
switches or automation connection, connection cannot start while it is open,
and a missing/expired session returns a recovery instruction. They do not prove
that Google will accept a particular real account; the user completes that step.

The QA scripts use fixture cookies only in disposable test profiles. They never
seed or modify authentication in the user's real Chrome or MamaLead profiles.
