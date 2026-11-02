# Shared Maps cache

The desktop client uses the existing billing API on the MamaLead server. No Vercel deployment is needed. This feature is **off on the server until configured**; an older server returns a cache miss and the normal Maps scan continues.

## Matching and identity

The v1 SHA-256 key is NFKC/lowercase/trim/whitespace normalization of keyword and location, plus exact region and language. Punctuation, plurals, synonyms and nearby cities do not match. Each keyword has its own allowance. Website filtering is applied on read.

Saved and delivered businesses are skipped using canonical Maps CID (including ftid aliases), E.164 phone or registrable domain. Shared hosting/social domains are excluded from domain matching. This intentionally treats branches sharing a company domain or main phone as already known, per the approved cache specification.

Fresh cached leads pass through the existing persistence/progress/quota pipeline. Only the live shortfall is scraped. Credits count only newly delivered places. A requested count is a ceiling, not a promise that Google has that many matching new businesses.

Cached contact evidence is seeded without any validity verdict. Each enrichment category has its own freshness timestamp; a phone scan cannot refresh an old email. Only raw live Maps observations and fresh public website findings are uploaded. User edits never form a contribution.

## Configuration and rollout

Prepare these on the existing billing host when the owner authorizes deployment:

    LEAD_CACHE_ENABLED=1
    LEAD_CACHE_SERVE=0
    LEAD_CACHE_ROLLOUT_PERCENT=100
    LEAD_CACHE_TTL_DAYS=30
    LEAD_CACHE_ENRICH_TTL_DAYS=30
    LEAD_CACHE_PACE_FACTOR=0.5
    LEAD_CACHE_WARM_BROWSER=1

Start with contribution-only mode. After reviewing cache quality, set SERVE=1 and rollout 10, 50, then 100 percent. ENABLED=0 kills all sharing; LEADSNAP_LEAD_CACHE=0 disables the client. Lookup/write attempts are bounded to four seconds and writes use a local durable outbox (three attempts, seven-day retention). A disabled server leaves retries queued until they expire. New runs/startup retry due entries. Receipts expire after six hours, so very late contributions can be rejected safely.

Soft locks expire after ten minutes. Contending clients continue live immediately; waiting for another user is deliberately not enabled. The cache is marked complete only on an actual end-of-list, never on a loading timeout, requested cap, filtered run or run that skipped the user's existing places.

SQLite writes use synchronous BEGIN IMMEDIATE transactions. The Neon alternative uses request-scoped interactive transactions, an advisory lock, bulk upserts and the same operation logic. Server startup migrates SQLite; Neon migrates lazily. SQLite prunes daily. A Neon deployment must call leadCachePrune from its scheduled daily maintenance.

Contribution validation requires public Maps URLs and matching stable IDs, plausible public fields, an active license/device and a recent run receipt. Limits apply per installation and IP. More than 20% invalid rows blocks contributions for 24 hours. Conflicting phones/websites need two distinct current votes unless the old record is stale. Lookup exclusions contain hashes only.

## Owner statistics

The private admin dashboard's overview has Today / 7 days / 30 days cache statistics. Its authenticated API proxies the existing loopback writer credential. Installation tokens cannot read stats. The public billing API does not expose the private endpoint.

## Validation

Run build:electron, then:

    npm run lead-cache:test
    node scripts/verify-lead-cache-browser.cjs
    node scripts/verify-lead-cache-ui.cjs

The cache suite includes server/client contracts, 200 randomized overlap scenarios, real SQLite persistence and authenticated HTTP routes. The browser test exercises the Chromium skip hook. The UI test uses real Electron IPC, SQLite and quota settlement with isolated external-service fixtures. After packaging, set MAMALEAD_TEST_EXE to the extracted installer executable and run the UI script with --packaged.

The optional Postgres test uses PGlite through the same transaction adapter (set PGLITE_QA_MODULE to its installed module). Hosted Neon networking/latency still needs staging validation before enabling that alternative.

Primary driver documentation: https://github.com/neondatabase/serverless#readme
