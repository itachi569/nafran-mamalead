(() => {
  'use strict';
  const input = document.getElementById('license-key');
  const button = document.getElementById('copy-key');
  const label = document.getElementById('copy-label');
  const status = document.getElementById('copy-status');
  let key = '';
  const loadKey = () => {
    const fragment = location.hash.slice(1);
    // No persistence, analytics, requests or automatic clipboard access. Remove
    // the fragment before the visitor follows a link or copies the address bar.
    try { history.replaceState(null, '', location.pathname); } catch { /* Still never sent in HTTP requests. */ }
    const candidate = new URLSearchParams(fragment).get('key') || '';
    key = /^NF(?:-[A-Z0-9]{4}){10}$/.test(candidate) ? candidate : '';
    input.value = key;
    button.disabled = !key;
    label.textContent = 'Copy license key';
    status.textContent = key ? 'Ready to copy. If you refresh this page, reopen the link in your email.' : 'Open “Copy license key” from your MamaLead email.';
  };
  loadKey();
  window.addEventListener('hashchange', loadKey);
  let busy = false;
  button.addEventListener('click', async () => {
    if (busy || !key) return;
    busy = true;
    const copying = key;
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(copying);
      if (copying !== key) return;
      label.textContent = 'Key copied';
      status.textContent = 'Copied! Paste your key into MamaLead → Settings & Billing → Account.';
    } catch {
      if (copying !== key) return;
      input.focus();
      input.select();
      input.setSelectionRange(0, key.length);
      label.textContent = 'Try copying again';
      status.textContent = 'Your browser blocked automatic copying. The key is selected: press Ctrl+C (⌘C on Mac), or touch and hold it and choose Copy.';
    } finally { busy = false; }
  });
})();
