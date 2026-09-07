(() => {
  const params = new URL(location.href).searchParams;
  const url = params.get('url') || '';
  const code = params.get('code') || '';
  const desc = params.get('desc') || '';
  const certificateFailure = params.get('kind') === 'certificate';

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
