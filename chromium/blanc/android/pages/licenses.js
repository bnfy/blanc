// Copyright 2026 Bananify Creative. MIT; see LICENSE.
// Legal documents are shown verbatim as plain text; their titles and loading
// state belong to the interface catalog. The title links remain a direct way
// to read each bundled file if a fetch fails.
for (const element of document.querySelectorAll('[data-notice]')) {
  // Translate static elements before the fetch can finish, so a later
  // DOMContentLoaded translation pass cannot replace the notice with Loading.
  element.textContent = blancI18n.t('android.licenses.loading');
  fetch(element.dataset.notice)
    .then(response => {
      if (!response.ok) throw new Error('notice unavailable');
      return response.text();
    })
    .then(text => { element.textContent = text; })
    .catch(() => { element.textContent = blancI18n.t('android.licenses.loadFailed'); });
}
