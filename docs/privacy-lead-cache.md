# Shared lead cache data boundary

The public cache is a collection of public business observations, not a copy of a customer's workspace.

Allowed: business name/category/address/area/postcode, published phone/website, Maps ID/URL, rating/review count/coordinates, capture times, published contact values and their source URLs.

Never uploaded: workspace/lead IDs, customer email or license, notes/tags/lists/bookmarks/scores, local edits, decision makers, verification results or export history. Contributions use an immutable in-memory live capture, not a later database export. Website enrichment requires a recorded original live Maps website and shares newly observed findings only.

Only source-backed website emails on the business domain or approved public mail providers are accepted. Social URLs must match their declared network. Validity remains a separate user-triggered check.

The server retains installation IDs privately for receipts, abuse controls and distinct confirmations; none appear in lookup or admin cache-stat responses. Contribution audit and query membership expire after 90 days. Run receipts expire after seven days; contributions require a receipt no older than six hours. IP rate buckets store a hash and expire daily.

Website privacy wording discloses sharing before rollout. The client never uploads cached rows as fresh observations. If sharing is disabled or unreachable, local Maps operation continues subject to the existing license check.
