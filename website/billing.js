/* Browser credentials identify a purchase; they never contain a license or Stripe secret. */
(() => {
  const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  const override = new URL(location.href).searchParams.get('billingApi');
  const api = local && override && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(override)
    ? override : 'https://api.mamalead.com';
  const key = 'mamalead.website.installation:' + api;
  let pending, token;
  try { token = localStorage.getItem(key); } catch {}
  async function request(path, body, credential) {
    const abort = new AbortController(), timeout = setTimeout(() => abort.abort(), 25000);
    try {
      const response = await fetch(api + path, {
        method: body === undefined ? 'GET' : 'POST', signal: abort.signal,
        headers: { ...(body === undefined ? {} : {'Content-Type':'application/json'}), ...(credential ? {Authorization:'Bearer ' + credential} : {}) },
        ...(body === undefined ? {} : {body:JSON.stringify(body)})
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'The service is temporarily unavailable. Please try again.');
      return data;
    } catch (error) {
      if (error.name === 'AbortError') throw new Error('The request took too long. Please retry; we will check any existing request first.');
      throw error;
    } finally { clearTimeout(timeout); }
  }
  async function identity() {
    if (token) return token;
    if (!pending) pending = request('/v1/installations', {}).then(data => {
      if (!/^[A-Za-z0-9_-]{43}$/.test(data.token || '')) throw new Error('Could not create a secure checkout session.');
      // Persist before sending email or opening Checkout, so a refresh can recover the result.
      try { localStorage.setItem(key, data.token); } catch { throw new Error('Enable browser storage to receive a trial key or complete checkout.'); }
      token = data.token;
      return token;
    }).finally(() => { pending = null; });
    return pending;
  }
  async function status() { return token ? request('/v1/status', undefined, token) : null; }
  window.MamaLeadBilling = {
    status,
    async trial(email, replaceExisting) {
      const credential = await identity();
      const existing = await status();
      if (existing?.trialRequest?.email === email && existing.trialRequest.emailSent) throw new Error('This email is already used for a 1-day trial. Use the key already emailed to you.');
      const data = await request('/v1/trial', {email, replaceExisting:!!replaceExisting}, credential);
      if (data.emailSent !== true) throw new Error('Email delivery has not been confirmed. Please try again.');
      return data;
    },
    async checkout() {
      const data = await request('/v1/checkout', {product:'lifetime',channel:'website'}, await identity());
      if (!/^https:\/\/checkout\.stripe\.com\//.test(data.url || '')) throw new Error('Secure Checkout could not be opened.');
      return data.url;
    }
  };
})();
