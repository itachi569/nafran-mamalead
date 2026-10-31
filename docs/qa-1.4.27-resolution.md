# Email validity, saved imports and Assist support — 1.4.27

## Changes

- A normal validity check retries Unknown results from every provider, including
  LeadsAngel, within the selected import/current result scope. Completed results
  are retained. Empty and already-checked selections have clear status messages.
- LeadsAngel's `recipient_accepted_catch_all_rejected` response now maps to Valid:
  rejecting a random mailbox is not a catch-all risk. Explicit disposable,
  catch-all and role flags still prevent Valid. Recipient SMTP 5.1.1 explains
  mailbox absence; policy rejections remain Unknown. Random catch-all test
  failures are excluded from the recipient diagnosis.
- Returning to Email Finder or Phone Finder clears the old search/filter and
  opens saved results. Imports continue using the durable local database.
- Assist distinguishes contacting MamaLead from finding leads' emails/numbers.
  Support questions offer one Contact Support link, opening the actual form.
  Generic words in answers no longer generate unrelated Finder links.
- Desktop workflow guidance and the server prompt describe the real support
  form and prohibit invented company phone/email details. Existing language,
  short-answer and feature-access rules remain in place.

## Validation

- Renderer and Electron production build, LeadsAngel mapping/polling tests,
  six retry/cancellation tests, and the 1.4.23 verifier regression suite passed.
- Email progress/cancel/resume and validity-filter UI tests passed.
- Isolated Electron UI test scanned a new and an existing website, verified
  only their Unknown emails, and restored all 526 saved leads on page return.
  Both imported results and validity survived a full process restart.
  The reused lead was beyond the first 500 rows; re-import created no duplicate.
- Assist navigation tests covered English, Roman Urdu and Urdu, the reported
  typo in the support question, and legitimate Finder requests.
- Twelve desktop destinations were exercised, including direct opening of the
  support form without sending a message. Nine server Assist tests passed.
- A bounded live LeadsAngel check accepted the configured licence. The reported
  mailbox received recipient SMTP 550 / 5.1.1; the service was functioning.
  A separate accepted control address exposed the catch-all parsing defect.
  Credentials and private diagnostic output are not committed.

- Both the saved-import/validity test and all twelve Assist navigation checks
  also passed in the packaged 1.4.27 Windows application.
- A live check through the packaged provider adapter returned Invalid for the
  rejected mailbox and Valid (92) for the accepted control. It completed in four
  seconds using the service's current response; this is not a fresh-probe speed
  guarantee. The licence expires on 30 October 2031.
- Package audit: 5,157 entries, version 1.4.27, changed modules present, and no
  private configuration/credential paths. Packaging configuration: 17/17 passed.

Tests use isolated profiles and fixture websites. Customer databases are not
modified by automated tests. No support messages were sent during verification.

The Windows installer build completed on 31 October 2026 at 18:39 PKT. The local
review installer is unsigned; production signing/publication are separate held
release steps. Size: 339,516,610 bytes. SHA-256:
`1179f3249a142f605b7d181dbc2b5b73f287271052b0ea7d3f6f365a4c4917da`.

## Release status

Production deployment is on hold. The existing self-hosted server remains the
target; no Vercel setup or hosting change is involved. The server prompt change
must be deployed with the next authorized backend release. The updated desktop
also supplies the support guidance to older connected servers.
