# Local 1.4.14 changes — not deployed

The owner explicitly requested no server deployment until they ask. Do not tag a
release, publish these installers, update the live website version or change the
server download pointer as part of this local work. The public release remains
1.4.13.

## Maps limit

The old UI passed its Max results value only as `maxResultsPerKeyword`.
Each keyword/district combination became another search, and the billing
reservation used that value multiplied by the number of searches. Thus 20 in
the UI was not a total cap. The user's reported 37-lead run was not available in
this local database's recent history, so its exact search list was not confirmed.

The UI now sends `maxResultsTotal` as well, labelled **Max results per run**.
All keyword/district searches share that cap. The main process reserves at most
the requested total and takes the smaller of the user cap and server allowance.
The Chromium detail loop and final runner collection also enforce the ceiling.
Background database reads preserve an active run's count, target and rows instead
of replacing them with all saved leads. Fewer than the limit may be returned if
Google has fewer results, a run is stopped, or the available plan allowance is lower.

The actual Chromium Maps parser was exercised against intercepted fixture HTML:
40 requested / 60 available -> 40; 25 / 40 -> 25; 25 / 10 -> 10;
the same 10 businesses across two area searches -> 10 unique leads.
No live Google Maps scrape was performed for this change.

## Search bars

These are filters over the loaded local results, not new internet searches.
Social Profiles already searched business name, domain, handle and profile URL.
Email/Phone/Decision Makers shared a filter that omitted business/area fields and
unconditionally skipped search after imports. Decision Makers' contact cards
also ignored the toolbar search.

The shared finder now includes the advertised fields, applies search after
imports, handles formatted phone numbers and narrows individual Decision Maker
contacts. Clearing the search restores the current list. A new import clears the
previous search and state filter so that unrelated old text cannot hide its rows.

Development checks passed using isolated fixture data:

- `node scripts/verify-finder-search.cjs`: Social, Email and Phone advertised
  fields, no match, clearing, formatted and unformatted telephone searches.
- `node scripts/verify-decision-workflow.mjs`: Decision Makers search after import
  by name, role and business/domain; no match and clearing; existing scan and
  direct export/reset workflow.

The same scripts can use the freshly packaged Windows app by setting
`NAFRAN_TEST_PACKAGED=1`. Test profiles are separate from the owner's database.
The local installer is unsigned; the existing public signed release is unchanged.

## Full local audit on 22 October 2026

Additional fixes found during the requested A-to-Z audit:

- Social extraction preserves Facebook `profile.php?id=...`, reads escaped
  JSON social URLs, and excludes share/post/home links and lookalike hosts.
- Scrape cancellation retains ownership until the old provider finishes;
  overlapping runs are rejected and progress cannot exceed the total cap.
- Email verification now displays its progress and Stop checking control.
  Cancellation keeps completed verdicts; a later pass checks remaining emails.
- Saved Lists destination chips use actual stored lists and counts. New lists
  accept a user-provided name instead of the original design's sample targets.

The comprehensive `scripts/verify-app-audit.mjs` uses isolated profiles, a local
billing database, controlled websites, a fake Stripe price endpoint and mocked AI
responses. It covers all 11 views in light/dark mode, imports, server AI, duplicate
imports, named lists, Maps quota accounting, CSV/Excel/PDF, restart persistence,
email cancellation/resume and revoked licence enforcement. Set
`NAFRAN_TEST_PACKAGED=1` to run the packaged flow (email mock cancellation is
checked by the source-app run).

Other suites cover 2,000-lead pagination/search/export, trial request and
activation, Lifetime/Decision Maker checkout state, DM export/reset, LeadsAngel
import and storage, notifications, update controls, admin cancellation, database
migrations and provider error handling. No real purchase or customer cancellation
was made. Test logs are under `work/audit-2026-10-22/` in the task workspace.

Older test assumptions were updated for contact deduplication, the current
Settings/Account update card, and explicit isolated theme-test user data.
The old standalone profile-export test requires licence setup; its export cases
are covered in the authenticated comprehensive audit.

The final installer is rebuilt locally after the audit changes. Do not use an
earlier 1.4.14 installer timestamp as evidence that it contains every audit fix.
The package archive is checked for `.secrets`, `.env` and server-access paths.

Additional local UI changes:
- Social, Email, Phone and Decision Makers search boxes explicitly describe
  searching saved results in the current list.
- On launch, devices without an active Trial or Lifetime licence show a top
  welcome notice directing users to Settings & Billing for a 1-day free trial
  or Lifetime access. Its button opens the Usage tab; dismissal lasts for the
  current session. Active Trial/Lifetime devices do not show the notice.
- The packaged app was inspected with an isolated profile for the notice,
  billing navigation, dismissal and active-licence suppression. Public website
  downloads have not been updated with these local changes.
