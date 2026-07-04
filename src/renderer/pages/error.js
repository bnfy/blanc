(() => {
  const params = new URL(location.href).searchParams;
  const url = params.get('url') || '';
  const code = params.get('code') || '';
  const desc = params.get('desc') || '';

  document.getElementById('errorUrl').textContent = url;
  // Network failures carry a numeric code (e.g. -105); a crash carries a
  // reason string (e.g. "oom"), which reads better labelled.
  const NON_NUMERIC = /[^-\d]/;
  document.getElementById('errorDetail').textContent = NON_NUMERIC.test(code)
    ? `${desc || 'The page crashed'} (reason: ${code})`
    : desc ? `${desc} (${code})` : `Error ${code}`;

  // Only re-link to schemes a failed navigation can legitimately have —
  // never let a crafted error URL smuggle e.g. javascript: into the href.
  if (/^(https?|file):\/\//i.test(url)) {
    document.getElementById('retryLink').href = url;
  }
})();
