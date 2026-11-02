# MamaLead 1.4.36

Maps searches now filter each business against the requested keyword, skip saved identities and keep collecting after a stalled or virtualized results feed. Requested counts remain maximums: fewer available matching new businesses produce fewer results.

Email work starts while Maps rows arrive. Saved identities match visible rows, updates survive navigation, and missing websites, pending checks and missing emails have distinct states. Batched renderer updates and fewer SQLite checkpoints keep navigation responsive during scanning and while minimized.

The optional shared public-business cache includes authenticated routes, bounded client requests, durable retries, freshness rules, hashed exclusions, private admin statistics and privacy disclosure. Deploy in contribution-only mode first. The cache excludes private workspace edits, licence/customer email, notes, lists and email verification results. See lead-cache.md for rollout and rollback controls.

The website footer now follows the cream and sage theme with grouped links and accessible contact details. Support remains mamaleads997@gmail.com; the new domain mailbox is deferred.

Validation: typecheck/build; 38 Maps checks; controlled Chromium repeated runs of 200/200/50/0 with no overlap; five live matching Maps results; cache contracts, SQLite, PostgreSQL adapter and HTTP tests; 140 billing checks; 10 admin cancellation assertions; admin/support/website browser checks. The extracted local installer passed cache, live-email-row, navigation and minimized-scan fixture checks. Its archive excludes secrets and customer data.

The local QA installer is unsigned. Production publication requires the Nafran LTD signed Windows workflow, verified update metadata and the existing guarded server publisher. Network-dependent results and the availability of 200 matching businesses cannot be guaranteed.
