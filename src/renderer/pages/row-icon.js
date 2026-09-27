'use strict';
// A 16px site icon for utility-sheet rows: the stored sanitized favicon when
// there is one, else the Island's domain-initial tile (renderer.js
// faviconFallbackLabel). Served flat to pages via a <script> tag AND
// require-able by node tests. Main already sanitizes stored favicons; the PNG
// data-URL check here is a second, cheap guard.
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.blancRowIcon = api;
})(typeof self !== 'undefined' ? self : this, function () {
  const PNG_PREFIX = 'data:image/png;base64,';

  function fallbackLetter(url) {
    try {
      const host = new URL(url || '').hostname.replace(/^www\./i, '');
      return Array.from(host)[0]?.toUpperCase() || '•';
    } catch {
      return '•';
    }
  }

  function rowIcon(document, url, favicon) {
    const el = document.createElement('span');
    el.className = 'row-icon';
    el.setAttribute('aria-hidden', 'true');
    if (typeof favicon === 'string' && favicon.toLowerCase().startsWith(PNG_PREFIX)) {
      const img = document.createElement('img');
      img.src = favicon;
      img.alt = '';
      el.append(img);
    } else {
      el.classList.add('fallback');
      el.textContent = fallbackLetter(url);
    }
    return el;
  }

  return { fallbackLetter, rowIcon };
});
