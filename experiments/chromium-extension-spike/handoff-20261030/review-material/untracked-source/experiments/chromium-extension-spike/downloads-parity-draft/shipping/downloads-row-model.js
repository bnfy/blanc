'use strict';
// Row text for blanc://downloads. Served flat via <script> and require-able by
// node tests.
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.blancDownloadsRow = api;
})(typeof self !== 'undefined' ? self : this, function () {
  function sourceLabel(url) {
    try {
      const parsed = new URL(url);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return parsed.hostname.replace(/^www\./i, '');
    } catch { /* fall through to the raw text */ }
    return String(url ?? '');
  }

  function splitFileName(name) {
    const text = String(name ?? '');
    const dot = text.lastIndexOf('.');
    const ext = dot > 0 ? text.slice(dot) : '';
    return ext.length >= 2 && ext.length <= 9 ? { stem: text.slice(0, dot), ext } : { stem: text, ext: '' };
  }

  // Which buttons a row offers, in order. An interrupted download that
  // Chromium can continue offers Resume; otherwise one with a web source
  // offers Retry. One still held in flight can also be cancelled outright.
  function rowActions(d) {
    if (d?.state === 'progressing') return ['cancel'];
    if (d?.state === 'completed') return ['open', 'show'];
    if (d?.state !== 'interrupted') return [];
    const actions = [];
    if (d.canResume) actions.push('resume');
    else if (/^https?:/i.test(String(d.url ?? ''))) actions.push('retry');
    if (d.inFlight) actions.push('cancel');
    return actions;
  }

  return { sourceLabel, splitFileName, rowActions };
});
