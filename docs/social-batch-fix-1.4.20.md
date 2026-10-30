# Social Profiles batch repair — 30 October 2026

The reported three-site job did finish all three rows, but only Venus succeeded. Corecare hit the 3.5-second HTTP cutoff and Nur Skin had a transient connection failure. Retrying Corecare separately succeeded. There was no three-site limit.

## Changes

- Social homepages now have a six-second request timeout, one transient retry and a sixteen-second total site budget. Old HTTP URLs retry over HTTPS; a missing Maps location page can fall back to the same site's homepage. Certificate and access-denied errors are not bypassed.
- Up to three social websites run concurrently. Failed sites do not prevent later sites from completing. Stop cancels all active requests before another job starts.
- Progress and row states use actual completed lead IDs, including results finishing out of order. The active IDs survive polling. A failed site can be retried without rescanning successful sites.
- Failure messages identify the website. A successfully read website with no profiles shows “No profiles published”. Hidden zero-width/spam social links are excluded.

## Validation

- `verify-social-batch.cjs`: eight tests cover a page slower than the old cutoff, transient retry, HTTP upgrade, temporary server error, access denial, missing location fallback, hidden injected links, a 50-site batch, Stop/restart and a permanently unresponsive site.
- Existing social canonicalization, extraction and database-repair tests pass.
- The full isolated Electron app audit passes, including social/email/phone/website imports, Maps capture, export, restart and licence enforcement.
- Packaged Electron UI: all 50 controlled websites reached a final state. The intentionally denied site remained a retryable error, the empty site had no fabricated profiles, and 48 profiles were saved. Retrying only the denied site after recovery added its profile and preserved the other 48.
- Packaged live test of the three reported sites completed in 7.78 seconds with no failed rows: Venus returned five published links, Corecare returned Instagram and TikTok, Nur Skin exposed no genuine visible social profile links. Hidden unrelated accounts on Nur Skin's page were not returned. This is a point-in-time result; external sites and connection speeds can change.
- Website's supplied first-screen design was checked separately; it does not change this desktop payload.

## Local installer

`release/MamaLead Setup 1.4.20.exe`, built 2026-10-30 19:41:52 PKT, 339,487,873 bytes.

SHA-256: `FA1F3BF8C0883B362ABD8EF2085B78E3CBA07AC19AFDAEE877374DA148CDCBA8`.

The installer-extracted `app.asar` matches the packaged executable used for the UI/live tests: `5B3B217731D2244B2C7C4B1D65EF8260A1ADB8DD58DACB3F28E1F7B2648FA077`.

The latest packaged app was reopened with the existing customer testing profile. No customer database or licence was reset. No production deployment or release-feed change was made.
