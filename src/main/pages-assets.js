'use strict';
// Pure blanc:// asset resolution (no Electron): a page's root serves
// <host>.html; any deeper path is a flat file in PAGES_DIR, except the
// virtual strings.js answered with the active language's catalog.
const path = require('path');
const { KNOWN_PAGES } = require('./utility-pages');

function resolvePagesAsset(host, pathname) {
  if (!KNOWN_PAGES.has(host)) return { kind: 'error', status: 404 };
  const name = pathname === '/' ? `${host}.html` : path.basename(pathname);
  if (name === 'strings.js') return { kind: 'strings' };
  if (!/^[\w.-]+$/.test(name)) return { kind: 'error', status: 400 };
  return { kind: 'file', name };
}

module.exports = { resolvePagesAsset };
