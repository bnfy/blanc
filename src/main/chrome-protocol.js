'use strict';

const path = require('node:path');
const { pathToFileURL } = require('node:url');

const CHROME_SCHEME = 'blanc-chrome';
// No `persist:` prefix: privileged UI state lives in an in-memory session that
// ordinary and private browsing WebContents never share.
const CHROME_PARTITION = 'blanc-chrome';
const CHROME_INDEX_URL = `${CHROME_SCHEME}://index/`;
const CHROME_OVERLAY_URL = `${CHROME_SCHEME}://overlay/`;
const RENDERER_DIR = path.join(__dirname, '../renderer');

// Chrome is intentionally much smaller than the internal-pages surface. Each
// host receives only its own document/script plus the exact shared assets the
// stylesheet references. Encoded paths, query strings, credentials, ports,
// directories, and future files all fail closed until explicitly reviewed.
const SHARED_ASSETS = new Set([
  '/styles.css',
  '/quiet-glyph.js',
  '/panel-left.svg',
  '/pages/icon.svg',
  '/pages/inter-latin.woff2',
  '/pages/jetbrains-mono-latin.woff2',
]);
const HOST_ASSETS = new Map([
  ['index', new Map([
    ['/', 'index.html'],
    ['/renderer.js', 'renderer.js'],
    ['/vertical-tabs.js', 'vertical-tabs.js'],
  ])],
  ['overlay', new Map([
    ['/', 'overlay.html'],
    ['/overlay.js', 'overlay.js'],
  ])],
]);

function chromeResourcePath(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return null;
  }
  if (
    parsed.protocol !== `${CHROME_SCHEME}:`
    || parsed.username
    || parsed.password
    || parsed.port
    || parsed.search
    || parsed.hash
  ) return null;

  const hostAssets = HOST_ASSETS.get(parsed.hostname);
  if (!hostAssets) return null;
  const relative = hostAssets.get(parsed.pathname)
    ?? (SHARED_ASSETS.has(parsed.pathname) ? parsed.pathname.slice(1) : null);
  if (!relative) return null;
  return path.join(RENDERER_DIR, relative);
}

function createChromeProtocolHandler({ net }) {
  return (request) => {
    const resource = chromeResourcePath(request.url);
    if (!resource) return new Response('Not found', { status: 404 });
    return net.fetch(pathToFileURL(resource).href);
  };
}

function setupChromeProtocol({ session, net }) {
  session.protocol.handle(CHROME_SCHEME, createChromeProtocolHandler({ net }));
}

module.exports = {
  CHROME_SCHEME,
  CHROME_PARTITION,
  CHROME_INDEX_URL,
  CHROME_OVERLAY_URL,
  chromeResourcePath,
  createChromeProtocolHandler,
  setupChromeProtocol,
};
