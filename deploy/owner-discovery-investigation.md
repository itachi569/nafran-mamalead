# Owner discovery follow-up — 29 October 2026

The current public Windows release remains the signed 1.4.17 installer described
in `release-1.4.17.md`. This follow-up changes desktop source only; pushing this
commit does not deploy the server or replace the public installer.

## Reproduced failure

An isolated run of the released code against `https://www.namecheap.com/`
returned no owner in 7.26 seconds. Its homepage returned HTTP 403. Free results
included login pages; paid results included a Google Images navigation link.
Those consumed the three-source verification limit. The supplied DataForSEO
credential authenticated successfully (task status 20000).

## Changes

- Discard search-engine navigation and login forms before source limits apply.
- Verify a second batch of three sources if the first batch yields no owner.
- Keep the precise domain query for free search, and use a quoted company-name
  query for the paid fallback. Still require fetched company/owner affiliation;
  a search snippet or similarly named company cannot establish ownership.
- Recognize dated founding statements such as “started in 2000 by CEO …”.
  Trailing sentence text and punctuation no longer invalidate an otherwise valid
  name. Being a CEO alone still does not establish ownership.
- Surface an unavailable email search even when sitemap/story discovery returns
  an empty list successfully.

## Validation and remaining limitation

`npm run typecheck` and `node scripts/test-owner-discovery.cjs` pass. Additional
existing regression checks cover Unicode names, other-company founders,
testimonials, superseded owners, named businesses without URLs, and published
email source verification.

A live isolated run of the updated source identified Richard Kirkendall from
`https://www.dataprovider.com/recipes/namecheap/` in a 23.44-second full lookup.
**It still did not verify a published owner email. This is not a complete fix
for the user's Namecheap email case.** No guessed address or generic support
inbox is substituted. Historical addresses found during manual investigation
are not hard-coded, and no deliverability claim is made.

The checks used isolated fixtures/profiles and did not alter customer records
or consume an application's Decision Makers allowance. A local installer build
is kept under `release/owner-discovery/` for packaged verification; it is not a
signed public release.

The local `npm run package:win -- --config.directories.output=release/owner-discovery
--publish never` build passed. Its installer was written at
`2026-10-29T04:47:00Z`, is 338150563 bytes, and is unsigned. SHA-256:
`eb4ebd993c5a8d258af9cbeef04f22925c2ee474fb6cba28bb0d0d723fb0fcdc`.
All nine enrichment modules match the current source build; no private data or
credential paths were found in the archive. The packaged runtime passed nine
discovery regressions and seven isolated UI/queue checks, including an actual
published owner email from captured public HTML, progress, cancellation controls,
and clearing previously incorrect generic owner inboxes.
