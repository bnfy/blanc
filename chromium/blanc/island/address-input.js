// Copyright 2026 Bananify Creative. MIT; see LICENSE.
// What typed address-bar text means (S1.1), ported from shipping v1.45.1:
// classifyExternalNavigation() in src/main/external-protocols.js and
// normalizeAddressInput() in src/main/main.js. The engine a search goes to is
// the browser's choice (TemplateURLService), so a search stays a query here.
// tools/address-input.test.mjs runs shipping's own code against this file.
(() => {
  // These familiar links retain the explicit typed-address shortcut.
  const DIRECT_HANDOFF_PROTOCOLS = new Set(['mailto:', 'tel:', 'facetime:', 'sms:']);
  const BROWSER_PROTOCOLS = new Set([
    'http:', 'https:', 'about:', 'blob:', 'filesystem:', 'blanc:',
    'data:', 'javascript:', 'vbscript:',
  ]);
  const BLOCKED_OS_PROTOCOLS = new Set([
    'chrome:', 'chrome-extension:', 'devtools:', 'blanc-chrome:',
    'blanc-import:', 'file:', 'view-source:',
    'afp:', 'applescript:', 'disk:', 'disks:', 'hcp:', 'ie.http:', 'mk:',
    'ms-help:', 'nntp:', 'res:', 'shell:', 'vnd.ms.radio:',
    'cmd:', 'powershell:', 'terminal:', 'osascript:', 'ms-msdt:',
    'ms-appinstaller:', 'ms-settings:', 'search-ms:', 'search:',
    'smb:', 'ssh:', 'x-apple.systempreferences:',
  ]);
  const DENIED_HANDOFF_PROTOCOLS = new Set([...BROWSER_PROTOCOLS, ...BLOCKED_OS_PROTOCOLS]);

  function classifyExternalNavigation(url, { trusted = false } = {}) {
    if (typeof url !== 'string' || !/^[a-z][a-z0-9+.-]*:/i.test(url)
      || /[\u0000-\u0020\u007f\\"`]/.test(url)) return { action: 'none' };
    let protocol;
    try { protocol = new URL(url).protocol; } catch { return { action: 'none' }; }
    if (protocol.length === 2) return { action: 'none' };
    if (BLOCKED_OS_PROTOCOLS.has(protocol)) return { action: 'deny', protocol };
    if (DENIED_HANDOFF_PROTOCOLS.has(protocol)) return { action: 'none' };
    // A typed custom app URL needs a slash; page-initiated links need not.
    if (trusted && !DIRECT_HANDOFF_PROTOCOLS.has(protocol)
      && !/^([a-z][a-z0-9+.-]*):\//i.test(url)) return { action: 'none' };
    return {
      action: trusted && DIRECT_HANDOFF_PROTOCOLS.has(protocol) ? 'open' : 'confirm',
      protocol,
    };
  }

  // Shipping's normalizeAddressInput, with the search engine left to the
  // browser: `search(text)` stands where shipping called searchUrlFor(text).
  function normalize(input, search) {
    const trimmed = input.trim();
    const scheme = trimmed.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):\/\//)?.[1]?.toLowerCase();
    if (scheme) {
      // Script-executing schemes must never be navigable from the address bar.
      if (scheme === 'http' || scheme === 'https' || scheme === 'blanc') return trimmed;
      return search(trimmed);
    }
    if (/^localhost(:\d+)?(\/|$)/.test(trimmed)) return `http://${trimmed}`;
    if (/^(\d{1,3}\.){3}\d{1,3}(:\d+)?(\/|$)/.test(trimmed)) return `http://${trimmed}`;
    // A search operator such as site:example.com puts a colon where the host
    // would be; only a numeric port may follow one there.
    const host = trimmed.split(/[/?#]/, 1)[0];
    if (!host.includes('@') && /:(?!\d+$)/.test(host)) return search(trimmed);
    const looksLikeDomain = /^[^\s]+\.[a-zA-Z]{2,}(\/[^\s]*)?$/.test(trimmed);
    if (looksLikeDomain) return `https://${trimmed}`;
    return search(trimmed);
  }

  // Shipping's typed-address pipeline order: an OS hand-off is decided on the
  // raw text first, then the text is an address or a search query.
  function interpret(raw) {
    const text = String(raw ?? '');
    const handoff = classifyExternalNavigation(text, { trusted: true });
    if (handoff.action === 'open' || handoff.action === 'confirm') {
      return { kind: 'handoff', url: text, confirm: handoff.action === 'confirm' };
    }
    let query = null;
    const url = normalize(text, value => { query = value; return null; });
    return query !== null ? { kind: 'search', query } : { kind: 'address', url };
  }

  const api = Object.freeze({ classifyExternalNavigation, normalize, interpret });
  if (typeof module === 'object' && module.exports) module.exports = api;
  else window.BlancAddressInput = api;
})();
