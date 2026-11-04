/* MamaLead marketing analytics: Meta Pixel (dataset "MamaLead Pixel").
 * Single source of advertising tracking for the public website only.
 * - Loaded async/defer; every call is wrapped so ad blockers or Meta errors never break flows.
 * - No advanced matching, no customer data in event parameters.
 * - Consent: not yet decided by the owner. Pixel loads without a blocking banner.
 *   To add a consent gate later, make consentGranted() return the visitor's choice
 *   and call MamaLeadAnalytics.init() after acceptance.
 * - Purchase: PENDING. Needs a verified paid-transaction signal (amount, currency,
 *   stable event id) from the billing API before it can be tracked safely.
 */
(() => {
  'use strict';
  if (window.MamaLeadAnalytics) return; // Guard against the script being evaluated twice.
  const PIXEL_ID = '1628121598802764';
  const SENSITIVE = /^(session_id|checkout_session|cs|token|access_token|key|license|licence|email|e|payment_intent\w*|setup_intent\w*)$/i;
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
    } catch { /* never break the page */ }
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
      // thank-you.js removes the checkout query after verification; strip anything sensitive first anyway.
      sanitizeUrl();
      loadBase();
      initialized = true;
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
