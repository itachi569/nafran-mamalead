# MamaLead 1.4.33 QA fixes

Source report: MamaLead-Full-QA-1.4.32-af7c883.md. Server deployment is not requested and has not been performed.

| Issue | Fix |
| --- | --- |
| ML-127 | Merge HTTP and rendered-page phone results by canonical number, retaining the strongest source. Normalize punctuation and terminal ISO country codes when comparing addresses; distinct street numbers remain separate. The same cleanup applies to saved Lookup history and exports. |
| ML-128 | Reject private/reserved and invalid email domains during extraction, storage and local precheck. No DNS/provider request is made for those inputs. Existing private email contacts are archived before a transactional, idempotent cleanup. Old Lookup snapshots hide those addresses without destroying the original saved JSON. |
| ML-129 | Explicit Cloudflare client-IP mode accepts only a valid CF-Connecting-IP from a trusted loopback/tunnel or Cloudflare peer. Arbitrary X-Forwarded-For is ignored. Other peers and invalid headers use the socket IP. Canonical IPs prevent equivalent spellings creating extra rate-limit buckets. |

## Verification

- Build/TypeScript: passed.
- Focused extraction, precheck, database repair and previous phone/import tests: 20/20 passed.
- Database regressions: 78/78 passed.
- Contact/sitemap crawl and main-email selection/archive checks: passed.
- Client-IP tests: 2/2 passed, including real HTTP requests with different spoofed XFF headers hitting one rate-limit bucket; a separate legitimate client can still submit. Captcha and mail delivery use fixtures, with no real messages.
- Website support browser integration and security checks: passed.
- Website Lookup source and packaged UI, PDF/Excel exports, saved results, retry handling, field selection, and the HTTP + rendered fallback merge: passed. One packaged run exceeded the harness's 20-second wait while installer compression was running; the rerun passed with the same assertions and the 60-second wait already used for other scan steps.
- Packaged email-validity modes: DNS-only and LeadsAngel provider configuration/IPC tests passed, with external requests blocked and fixture credentials. This does not claim a new live mailbox/provider verification.
- `npm run package:win -- --publish never`: passed. Fresh `release/MamaLead Setup 1.4.33.exe`, 339,609,460 bytes, built 2026-11-01 16:11:16 PKT. Local QA installer is unsigned; the public signed release feed was not changed.
- Installer SHA-256: `3C98A165CEDE61A1C5AE13E49927605D098484F8A7D3445561129758374E8D83`.
- Extracted installer and tested unpacked build have the same app.asar SHA-256: `707261F0578EE8C829A80E1EB0A559F2DEB8BDA29B541764176905F97214E4EB`. Packaged version is 1.4.33; private configuration files and supplied Turnstile key values are absent.
- Launched the extracted installer app from `D:/Codex-QA/MamaLead-1.4.33-f31bae9d/app/MamaLead.exe`. UI confirms v1.4.33, 523 saved leads and active unlimited Lifetime access. The old 1.4.30 app was closed gracefully first.
- The existing profile is explicitly reused for this test launch. Its approximately 4 GB size exceeds available C-drive space, so a second branded profile copy was avoided. A database backup is saved privately under the D-drive QA folder; no licence reset or empty profile was used.

Old test email fixtures using `.test` were changed to public-shaped domains in isolated mocked/local tests. Private-domain rejection remains enabled in production code and has dedicated regression cases.

## Deployment still pending

ML-102–105 are source-fixed but remain unverified on the live server until rollout. The protected production environment must contain the Turnstile keys/hostnames and `SUPPORT_CLIENT_IP_HEADER=cf-connecting-ip` for the existing trusted Cloudflare origin. See `docs/contact-support.md`. No production service, payment flow, public installer feed or customer mailbox was changed.
