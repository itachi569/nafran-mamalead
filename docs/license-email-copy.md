# License email copy action

Trial and Lifetime emails now have a sage **Copy license key** link immediately below the key. Standard email clients do not support clipboard JavaScript, so the link opens `/copy-key` on mamalead.com; the user clicks the copy button there. The email explains this and retains selectable key text as a fallback. Plain-text emails contain the same link.

The key is in the URL fragment only, never a query string or path. The standalone page removes the fragment from browser history on load, holds the key only in page memory, has no analytics or external dependencies, and makes no API requests. It is not a licence validation or activation endpoint. Refreshing requires reopening the email link. Clipboard permission denial selects the full key and gives manual-copy instructions without falsely reporting success. The page is noindex, no-store, no-referrer and uses a restrictive CSP.

Deploy `website/copy-key.html`, `.css`, `.js` and the updated `website/server.mjs` **before or together with** the email builder/template. Do not deploy the new email template before the destination exists. No desktop installer change is needed. No live email was sent and no production release was performed while implementing this change.

Checks: `node scripts/verify-license-copy.mjs`, `node scripts/preview-license-email.mjs`, `node scripts/verify-public-pages.mjs`, and `node scripts/verify-billing-server.mjs`. Preview files use a dummy key that cannot activate an app.

References: [HTML email limitations](https://mailchimp.com/help/limitations-of-html-email/) and [Clipboard API](https://developer.mozilla.org/en-US/docs/Web/API/Clipboard_API).
