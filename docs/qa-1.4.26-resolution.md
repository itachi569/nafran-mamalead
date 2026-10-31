# Contact Support retest resolution — 1.4.26

Source: `MamaLead-Contact-Support-QA (1).md`, including the retest of commit
`1b871d4` / version 1.4.25. The retest confirmed ML-91, ML-92 and ML-94–96 fixed.

## ML-98: credentials in user-authored text

Desktop and server scrubbers now cover `sk-` and `sk-proj-` keys, standalone long
mixed-case/digit tokens, and labelled long secrets. The QA report's 43-character
alphabet-only example is also covered (the suggested digit-only expression would
miss it). Generic detection preserves intentional emails, URLs and file paths,
and normal long words. Recognizable API-key prefixes are always redacted.

Regression coverage checks both scrubbers, authenticated server submission and
the outbound notification payload. The packaged Electron test verifies that the
subject/message are scrubbed before transport and that the customer's contact
email remains readable. Tests use synthetic tokens and fixture mail only.

## ML-99 / ML-93: conditional Vercel support

The report allows documenting the deployment limitation. `contact-support.md`
now has an explicit hosting matrix: the current self-hosted SQLite deployment
supports the complete workflow; Vercel/Neon admin Support is read-only and has no
automatic failed-notification retry worker. No hosting migration or incomplete
cron route was added.

The owner confirmed the existing server remains the deployment target. No Vercel
setup, hosting switch or production deployment was performed.

## Validation

- Renderer/Electron production build passed.
- Support scrubber/cache/Neon-conflict regression checks passed.
- Local SQLite submission, sanitized notification payload, rate-limit, retry and
  authenticated admin support tests passed.
- Development and packaged Windows UI tests passed, including token redaction
  before transport, draft persistence, offline fallback and UUID recovery.
- Packaged version is 1.4.26; the package audit found no private config paths.
- Windows installer packaging completed on 31 October 2026 at 18:03 PKT
  (339,515,719 bytes). This local review installer is unsigned; production signing
  and publication remain separate release steps. SHA-256:
  `56aac3e42c13d4bc902d761d8486720e766d837291e59bd9a08215d3b6598eeb`.

## Remaining rollout checks

ML-97's cached support-address fix remains in place. The initial known fallback
is still `billing@nafran.co`; a different monitored mailbox has not been supplied.
Live Support/Resend configuration and real inbox/reply delivery still require
verification when the held production deployment is authorized. These are not
represented as passed by local fixture tests.
