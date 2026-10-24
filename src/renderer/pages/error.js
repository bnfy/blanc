(() => {
  const { t } = blancI18n;
  const params = new URL(location.href).searchParams;
  const url = params.get('url') || '';
  const code = params.get('code') || '';
  const desc = params.get('desc') || '';
  const certificateFailure = params.get('kind') === 'certificate';
  // A page-opened tab Blanc can't rebuild with its opener's restrictions
  // (main/document-policy.js). It offers no way to load the page here.
  const inert = params.get('kind') === 'inert';
  if (code === '-20') document.getElementById('blockingSettingsLink').hidden = false;

  document.getElementById('errorUrl').textContent = url;
  // The title and the safe way out depend on the failure, so this script is
  // their only writer (the page's static text is applied after it runs).
  document.getElementById('errorTitle').textContent = certificateFailure
    ? t('error.certificate.title')
    : t('error.title');
  document.getElementById('safetyLink').textContent = certificateFailure
    ? t('error.certificate.back')
    : t('error.newTab');
  if (inert) {
    document.getElementById('errorTitle').textContent = t('error.inert.title');
    document.getElementById('errorDetail').textContent = t('error.inert.detail');
    const pageTitle = params.get('title');
    if (pageTitle) document.title = pageTitle;
    const copy = document.createElement('button');
    copy.type = 'button';
    copy.id = 'copyLink';
    copy.className = 'advanced-toggle';
    copy.textContent = t('error.inert.copy');
    copy.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(url);
        copy.textContent = t('error.inert.copied');
      } catch {
        // Clipboard refused: leave the address selected to copy by hand.
        const range = document.createRange();
        range.selectNodeContents(document.getElementById('errorUrl'));
        getSelection().removeAllRanges();
        getSelection().addRange(range);
      }
    });
    document.getElementById('retryLink').replaceWith(copy);
  } else if (certificateFailure) {
    document.getElementById('errorDetail').textContent =
      params.get('certMessage') || t('error.certificate.unproven');
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
      const value = kind === 'date' ? new Date(Number(raw)).toLocaleDateString(blancI18n.formatLocale()) : raw;
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
      toggle.textContent = t('error.certificate.advanced');
      toggle.setAttribute('aria-expanded', 'false');
      toggle.setAttribute('aria-controls', 'advancedPanel');
      nav.append(toggle);

      const panel = document.createElement('div');
      panel.id = 'advancedPanel';
      panel.className = 'advanced-panel';
      panel.hidden = true;
      const warning = document.createElement('p');
      warning.className = 'section-hint';
      warning.textContent = t('error.certificate.warning');
      const proceed = document.createElement('button');
      proceed.type = 'button';
      proceed.id = 'continueUnsafe';
      proceed.className = 'continue-unsafe';
      proceed.textContent = t('error.certificate.continue', { host: label });
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
    const crashed = NON_NUMERIC.test(code);
    const detail = document.getElementById('errorDetail');
    // Chromium's own description (e.g. ERR_NAME_NOT_RESOLVED) is a code name.
    if (desc && !crashed) detail.dataset.i18nIgnore = '';
    detail.textContent = crashed
      ? t('error.crashDetail', { description: desc || t('error.crashed'), reason: code })
      : desc ? `${desc} (${code})` : t('error.code', { code });
  }

  // Only re-link to schemes a failed navigation can legitimately have —
  // never let a crafted error URL smuggle e.g. javascript: into the href.
  if (!inert && /^(https?|file):\/\//i.test(url)) {
    document.getElementById('retryLink').href = url;
  }
})();
