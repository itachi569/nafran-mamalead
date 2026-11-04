/* MamaLead marketing analytics: Meta Pixel (dataset "MamaLead Pixel").
 * Single source of advertising tracking for the public website only.
 * - Loaded async/defer; every call is wrapped so ad blockers or Meta errors never break flows.
 * - No advanced matching, no customer data in event parameters.
 * - Marketing pages only; no payment returns, thank-you, copy-key, admin or desktop.
 * - Consent: not yet decided by the owner. Pixel loads without a blocking banner.
 *   To add a consent gate later, make consentGranted() return the visitor's choice
 *   and call MamaLeadAnalytics.init() after acceptance.
 * - Purchase: PENDING. Needs a verified paid-transaction signal (amount, currency,
 *   stable event id) from the billing API before it can be tracked safely.
 */
(() => {
  'use strict';
  if (window.MamaLeadAnalytics) return; // Guard against the script being evaluated twice.
  const pageUrl = new URL(location.href);
  const marketingHost = /^(mamalead\.com|www\.mamalead\.com|localhost|127\.0\.0\.1|\[::1\])$/i;
  const marketingPath = /^\/(?:index\.html|(?:support|privacy|terms)(?:\.html)?\/?)?$/;
  if (!/^https?:$/.test(pageUrl.protocol) || !marketingHost.test(pageUrl.hostname) ||
      !marketingPath.test(pageUrl.pathname) || pageUrl.searchParams.has('checkout')) return;
  const PIXEL_ID = '1628121598802764';
  const SENSITIVE = /^(session(?:[_-]?id)?|checkout[_-]?session(?:[_-]?id)?|cs|(?:access[_-]?|refresh[_-]?)?token|key|licen[cs]e(?:[_-]?key)?|email(?:[_-]?address)?|e|client[_-]?secret|password|payment_intent\w*|setup_intent\w*)$/i;
  let initialized = false;

  const consentGranted = () => true; // Consent policy undecided; hook for a future gate.

  function sanitizeUrl() {
    try {
      const url = new URL(location.href);
      let changed = false;
      for (const name of [...url.searchParams.keys()]) {
        if (SENSITIVE.test(name)) { url.searchParams.delete(name); changed = true; }
      }
      if (url.hash && /[=@]/.test(url.hash)) { url.hash = ''; changed = true; }
      if (changed) history.replaceState(history.state, '', url.pathname + url.search + url.hash);
      return true;
    } catch { return false; /* Skip tracking if the URL cannot be safely cleaned. */ }
  }

  function loadBase() {
    /* Standard Meta Pixel base code (async). */
    !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
    n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
    n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
    t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
    document,'script','https://connect.facebook.net/en_US/fbevents.js');
  }

  function call(...args) {
    try { if (typeof window.fbq === 'function') window.fbq(...args); } catch { /* no-op */ }
  }

  function init() {
    if (initialized || !consentGranted()) return;
    try {
      if (!sanitizeUrl()) return;
      loadBase();
      initialized = true;
      // Use only the explicit events below, not Meta's automatic setup/inferred events.
      call('set', 'autoConfig', false, PIXEL_ID);
      call('init', PIXEL_ID);
      call('track', 'PageView');
    } catch { /* no-op */ }
  }

  window.MamaLeadAnalytics = {
    init,
    /* Successful new trial request with confirmed key email delivery. */
    lead() { if (initialized) call('track', 'Lead', {content_name: 'MamaLead trial'}); },
    /* Valid Stripe Checkout URL obtained from an explicit Lifetime action. Never awaited. */
    initiateCheckout() { if (initialized) call('track', 'InitiateCheckout', {content_name: 'MamaLead Lifetime'}); }
    // purchase(): PENDING — see header comment.
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once: true});
  else init();
})();
