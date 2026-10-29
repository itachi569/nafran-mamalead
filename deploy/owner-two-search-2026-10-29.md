# MamaLead 1.4.18 owner lookup update

This follow-up replaces the previous owner-search fanout with the selected two-query
flow. Server deployment, release tags and public installer/feed publication are deferred.

## Lookup behavior

1. `name of <domain> founder and his email must be present`
2. Only when a sourced owner is known without an email:
   `<Owner Name> owner of <domain> email address`

A sourced owner email ends the lookup immediately. Otherwise the completed lookup
shows **Not published**, meaning these searches did not establish a published owner
email. Provider failures are **Search failed**, not a claim that no email exists.
General company inboxes, guesses and AI-generated addresses are not owner evidence.
Source-page and strictly qualified search-index evidence retain separate labels.

Each query reads at most six result-linked public pages, with three reads in parallel.
There is no sitemap crawl, alternate search engine or third keyword. Stop aborts
outstanding work and retains completed results. One business consumes one app credit.
Saved data is replaced only after a completed successful check; failed prior records
are preserved but excluded from the new result/export.

## Search-service recovery

The user's Top Study World scan failed on its first query with DataForSEO task status
40101, `Internal SE Server Error`. A credential check succeeded. Direct tests with
different Google domains/locations returned a mixture of success and 40101, including
failures outside the Electron app. This is an intermittent upstream search failure,
not evidence that the credential is rejected.

- Cached AI citations remain usable, without waiting for asynchronous AI generation.
- A 40101 permits **one visible retry of the same keyword** via the regular Google
  SERP endpoint. Both keyword searches share this allowance: maximum three provider
  requests, not an unbounded retry loop. The provider can charge for that retry.
- Credential rejection is never retried. Stop prevents a recovery request.
- The entire business lookup has a 60-second ceiling. Normal completed requests
  return immediately; recovery does not add a delay to successful searches.
- If recovery also fails, the app retains an explicit error and provides **Retry
  failed business** for only the failed rows.

Official explanation: https://dataforseo.com/help-center/what-does-the-40101-error-mean

The live recovery test still received 40101 on both attempts. This release improves
recovery and error handling; it does **not** claim to repair the provider's servers
or guarantee that the same upstream error cannot recur.

## UI and website

The owner scan has an animated charcoal/sage loading panel with the current company,
the active query step, actual completed-business percentage, remaining count and Stop.
Reduced-motion preferences are respected. Failed searches have a direct retry action.
The website's Decision Makers text and three screenshots reflect the new flow and
loading panel; screenshot data is fictional demonstration data.

## Verification

Build/typecheck and the owner two-search unit, real SQLite runner and Electron UI
suites pass. Coverage includes one-query success, conditional second query, source
evidence, absent emails, provider errors, one shared recovery allowance, cancellation,
50 selected leads, scoped retries, stale-result exclusion and PDF export.
Existing owner evidence/discovery, contact crawl, main email, database (98 checks),
import count and website layout checks also passed during this update.

Live checks correctly identified Richard Kirkendall (Namecheap) and Joel Gascoigne
(Buffer) but did not establish an acceptable email. Top Study World sometimes returned
search results and sometimes 40101; no verified owner email was obtained. The passing
positive fixtures must not be presented as live owner-email discoveries.

The Windows QA installer is rebuilt with `npm run package:win -- --publish never`.
It is a local unsigned build; public signing/publication are separate release steps.
The final installer was produced on 29 October 2026 at 15:37 PKT (338,157,720 bytes).
Its SHA-256 is:
`84bd95365ec5d9b3327247c2238f00d3d73a7641fd16ada0402123380f25903f`.

The packaged Electron UI suite passed, including scoped retry/recovery, Stop, real
progress, both themes and exports. The ASAR has no secret/key/environment/database
files, and its owner-search, provider and runner code matches the compiled source.
The existing local installation was updated successfully (installer exit 0); its
installed provider/owner code was compared against the final build.
