(() => {
  const params = new URL(location.href).searchParams;
  const url = params.get('url') || '';
  const code = params.get('code') || '';
  const desc = params.get('desc') || '';
  const certificateFailure = params.get('kind') === 'certificate';
  if (code === '-20') document.getElementById('blockingSettingsLink').hidden = false;

  document.getElementById('errorUrl').textContent = url;
  if (certificateFailure) {
    document.getElementById('errorTitle').textContent = 'Your connection isn’t private';
    document.getElementById('errorDetail').textContent =
      params.get('certMessage') || 'The site could not prove its identity.';
    document.getElementById('safetyLink').textContent = 'Back to safety';
    const details = document.getElementById('certificateDetails');
    const fields = [
      ['text', 'certificateSubject', 'certificateSubjectRow', 'subject'],
      ['text', 'certificateIssuer', 'certificateIssuerRow', 'issuer'],
      ['date', 'certificateExpiry', 'certificateExpiryRow', 'validTo'],
    ];
    let shown = false;
    for (const [kind, valueId, rowId, key] of fields) {
      const raw = params.get(key);
      if (!raw) continue;
      const value = kind === 'date' ? new Date(Number(raw)).toLocaleDateString() : raw;
      if (!value || value === 'Invalid Date') continue;
      document.getElementById(valueId).textContent = value;
      document.getElementById(rowId).hidden = false;
      shown = true;
    }
    details.hidden = !shown;
    if (params.get('continue') === '1' && /^https:\/\//i.test(url)) {
      let label = url;
      try { label = new URL(url).host; } catch { /* keep the raw url */ }
      const nav = document.querySelector('.newtab-links');
      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'advanced-toggle';
      toggle.textContent = 'Advanced';
      toggle.setAttribute('aria-expanded', 'false');
      toggle.setAttribute('aria-controls', 'advancedPanel');
      nav.append(toggle);

      const panel = document.createElement('div');
      panel.id = 'advancedPanel';
      panel.className = 'advanced-panel';
      panel.hidden = true;
      const warning = document.createElement('p');
      warning.className = 'section-hint';
      warning.textContent = 'This site’s certificate isn’t trusted, so Blanc can’t confirm who you’re talking to. ' +
        'Someone on your network could be impersonating it. Only continue if you know this device — ' +
        'for example, a router, NAS or server on your own network.';
      const proceed = document.createElement('button');
      proceed.type = 'button';
      proceed.id = 'continueUnsafe';
      proceed.className = 'continue-unsafe';
      proceed.textContent = `Continue to ${label} (unsafe)`;
      proceed.addEventListener('click', async () => {
        proceed.disabled = true;
        const result = await window.bowserPages?.errorPage?.continueUnsafe?.().catch(() => null);
        if (!result?.ok) proceed.disabled = false;
      });
      panel.append(warning, proceed);
      nav.after(panel);

      const setOpen = (open) => {
        panel.hidden = !open;
        toggle.setAttribute('aria-expanded', String(open));
        if (open) proceed.focus();
      };
      toggle.addEventListener('click', () => setOpen(panel.hidden));
      document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && !panel.hidden) { setOpen(false); toggle.focus(); }
      });
    }
  } else {
    // Network failures carry a numeric code; crashes carry a reason string.
    const NON_NUMERIC = /[^-\d]/;
    document.getElementById('errorDetail').textContent = NON_NUMERIC.test(code)
      ? `${desc || 'The page crashed'} (reason: ${code})`
      : desc ? `${desc} (${code})` : `Error ${code}`;
  }

  // Only re-link to schemes a failed navigation can legitimately have —
  // never let a crafted error URL smuggle e.g. javascript: into the href.
  if (/^(https?|file):\/\//i.test(url)) {
    document.getElementById('retryLink').href = url;
  }
})();
