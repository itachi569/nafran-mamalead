/* Show the approved thank-you page only after server-confirmed payment and key delivery. */
(() => {
  const pending = document.getElementById('payment-pending');
  const confirmed = document.getElementById('payment-confirmed');
  const title = document.getElementById('payment-state-title');
  const message = document.getElementById('payment-state-message');
  const retry = document.getElementById('payment-retry');
  let checking = false;
  async function check() {
    if (checking) return;
    checking = true;
    retry.disabled = true;
    retry.textContent = 'Checking…';
    title.textContent = 'Confirming your payment.';
    message.setAttribute('role', 'status');
    message.textContent = 'Please wait while we verify your payment and license-key delivery.';
    try {
      for (let attempt = 0; attempt < 5; attempt++) {
        const status = await window.MamaLeadBilling.status();
        if (!status) throw new Error('Open this page in the same browser you used for checkout. If you already received your key, download MamaLead from the website and activate it in Account.');
        if (status.purchaseError) throw new Error(status.purchaseError);
        if (status.lifetime?.active && status.purchaseEmail) {
          document.getElementById('delivery-email').textContent = status.purchaseEmail;
          pending.hidden = true;
          confirmed.hidden = false;
          document.title = 'Thank you for choosing MamaLead';
          // The URL is never proof of payment. Reloads verify the browser's purchase again.
          history.replaceState(null, '', location.pathname);
          const heading = document.getElementById('thank-you-title');
          heading.setAttribute('tabindex', '-1');
          heading.focus({preventScroll:true});
          return;
        }
        if (attempt < 4) await new Promise(resolve => setTimeout(resolve, 1800));
      }
      throw new Error('Your payment or license-key delivery is still being confirmed. Check again shortly, or contact our team if you have already paid.');
    } catch (error) {
      title.textContent = 'Let’s check your payment.';
      message.setAttribute('role', 'alert');
      message.textContent = error.message || 'We could not confirm your payment. Please try again.';
    } finally {
      checking = false;
      retry.disabled = false;
      retry.textContent = 'Check payment again';
    }
  }
  retry.addEventListener('click', check);
  void check();
})();
