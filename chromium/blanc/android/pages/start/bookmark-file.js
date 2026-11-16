'use strict';
// Favorites import from a bookmarks file (F30): the fork's stand-in for
// pages.js's pages:bookmarks:import. The person picks a file; this parses
// shipping's bookmark-import.js way (the Netscape format every browser
// exports) and hands the entries to native, which applies shipping's merge.
// The page never learns the file's path.
(() => {
  const MAX_BYTES = 20 * 1024 * 1024;
  const decode = (s) => String(s)
    .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"')
    .replace(/&#x27;/gi, "'").replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/gi, '&'); // last, so &amp;lt; decodes to &lt; not <
  const attr = (attrs, name) => {
    const m = attrs.match(new RegExp(`${name}\\s*=\\s*"([^"]*)"`, 'i')) ||
      attrs.match(new RegExp(`${name}\\s*=\\s*'([^']*)'`, 'i')) ||
      attrs.match(new RegExp(`${name}\\s*=\\s*([^\\s>]+)`, 'i'));
    return m ? m[1] : null;
  };
  const TOKEN = /<\/dl\s*>|<dl\b[^>]*>|<h3\b[^>]*>([\s\S]*?)<\/h3\s*>|<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi;
  function parse(html, now = Date.now()) {
    const out = [];
    const stack = [];
    let pending;
    for (const m of String(html).matchAll(TOKEN)) {
      const tok = m[0].slice(0, 4).toLowerCase();
      if (tok.startsWith('</dl')) stack.pop();
      else if (tok.startsWith('<dl')) { stack.push(pending !== undefined ? pending : null); pending = undefined; }
      else if (tok.startsWith('<h3')) pending = decode(m[1] || '').trim() || null;
      else {
        const attrs = m[2] || '';
        const href = attr(attrs, 'href');
        if (!href) continue;
        const url = decode(href);
        if (!/^https?:\/\//i.test(url)) continue;
        const secs = Number(attr(attrs, 'add_date'));
        const ms = secs * 1000;
        const title = decode(m[3] || '').trim();
        const folder = stack.length ? stack[stack.length - 1] : null;
        out.push({ url, title: title || url, addedAt: Number.isFinite(secs) && secs > 0 && ms <= now ? ms : now,
          ...(folder ? { folder } : {}) });
      }
    }
    return out;
  }
  // Resolves to { cancelled }, { error } or { entries }.
  function pick() {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.html,.htm,text/html';
      input.addEventListener('cancel', () => resolve({ cancelled: true }));
      input.addEventListener('change', async () => {
        const file = input.files?.[0];
        if (!file) { resolve({ cancelled: true }); return; }
        if (file.size > MAX_BYTES) { resolve({ error: 'too-large' }); return; }
        try {
          const entries = parse(await file.text());
          resolve(entries.length ? { entries } : { error: 'empty' });
        } catch {
          resolve({ error: 'unreadable' });
        }
      });
      input.click();
    });
  }
  window.BlancBookmarkFile = { parse, pick };
})();
