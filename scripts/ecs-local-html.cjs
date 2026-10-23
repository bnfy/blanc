'use strict';

// Candidate-only, deliberately self-contained document preview. There is no
// URL-to-filesystem resolver: opening one file grants only its bounded snapshot.
const fs = require('node:fs/promises');
const { constants } = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const SCHEME = 'blanc-local-preview';
const MAX_BYTES = 8 * 1024 * 1024;
const LOCAL_HTML_SCHEME = Object.freeze({ scheme: SCHEME, privileges: Object.freeze({
  standard: true, secure: true, supportFetchAPI: true,
  allowServiceWorkers: false, bypassCSP: false, corsEnabled: true,
}) });
// Electron caches partition sessions. Reuse cleaned sessions, not one permanent
// session per document; live previews still have separate session boundaries.
const idleSessions = [];
const CSP = [
  "default-src 'none'", "base-uri 'none'", "object-src 'none'",
  "frame-src 'none'", "frame-ancestors 'none'", "worker-src 'none'",
  "connect-src 'none'", "form-action 'none'", "img-src data:",
  // Static preview: CSP connect-src/webRequest cannot contain WebRTC egress.
  // Deny document scripts at both the policy and WebContents preference layers.
  "script-src 'none'", "style-src 'unsafe-inline'", 'sandbox',
].join('; ');

function registerLocalHtmlScheme(protocol) {
  protocol.registerSchemesAsPrivileged([LOCAL_HTML_SCHEME]);
}

async function snapshotLocalHtml(filePath) {
  if (typeof filePath !== 'string' || !path.isAbsolute(filePath)) throw Error('Select an absolute HTML file');
  const canonical = await fs.realpath(filePath);
  if (!/\.(?:html?|xhtml?|xhtm)$/i.test(canonical)) throw Error('Select an HTML document');
  const handle = await fs.open(canonical, constants.O_RDONLY | constants.O_NOFOLLOW);
  let bytes;
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > MAX_BYTES) throw Error('HTML must be a regular file no larger than 8 MiB');
    // Bound the read as well as stat: a concurrently growing file cannot turn
    // this document capability into an unbounded allocation.
    const buffer = Buffer.alloc(Math.min(stat.size + 1, MAX_BYTES + 1));
    let length = 0;
    while (length < buffer.length) {
      const read = await handle.read(buffer, length, buffer.length - length, length);
      if (!read.bytesRead) break;
      length += read.bytesRead;
    }
    if (length > stat.size) throw Error('HTML changed while being read; select it again');
    bytes = Buffer.from(buffer.subarray(0, length));
  } finally { await handle.close(); }
  const url = `${SCHEME}://${randomUUID()}/index.html`;
  const permits = value => {
    if (bytes === null) return false;
    try { const parsed = new URL(value); parsed.hash = ''; return parsed.href === url; }
    catch { return false; }
  };
  return {
    url, permits,
    dispose() { bytes = null; },
    respond(request) {
      if (request.method !== 'GET' || !permits(request.url)) return new Response(null, { status: 403 });
      return new Response(bytes, { headers: {
        'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': CSP,
        'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer',
        'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), display-capture=()',
      } });
    },
  };
}

async function openIsolatedLocalHtml({ BrowserWindow, session }, filePath) {
  const document = await snapshotLocalHtml(filePath);
  const isolatedSession = idleSessions.pop() || session.fromPartition(`ecs-local-${randomUUID()}`, { cache: false });
  isolatedSession.protocol.handle(SCHEME, request => document.respond(request));
  // Independent of the page's CSP: deny file:, network, subframes and every
  // other resource. Neither redirects nor subresource paths grant more files.
  isolatedSession.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, (details, callback) => {
    callback({ cancel: details.method !== 'GET' || details.resourceType !== 'mainFrame' || !document.permits(details.url) });
  });
  isolatedSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  isolatedSession.setPermissionCheckHandler(() => false);
  const denyDownload = event => event.preventDefault();
  isolatedSession.on('will-download', denyDownload);
  const win = new BrowserWindow({ width: 1000, height: 750, title: 'Static local HTML — scripts and external resources blocked',
    webPreferences: { session: isolatedSession, sandbox: true, contextIsolation: true,
      javascript: false, nodeIntegration: false, webSecurity: true, webviewTag: false, allowRunningInsecureContent: false } });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-attach-webview', event => event.preventDefault());
  const navigation = (event, target) => {
    const url = target || event.url;
    if (event.isMainFrame === false || !document.permits(url)) event.preventDefault();
  };
  win.webContents.on('will-navigate', navigation);
  win.webContents.on('will-frame-navigate', event => navigation(event));
  win.webContents.on('will-redirect', event => navigation(event));
  let cleaned = false;
  const clean = async () => {
    if (cleaned) return;
    cleaned = true;
    document.dispose();
    isolatedSession.protocol.unhandle(SCHEME);
    isolatedSession.webRequest.onBeforeRequest(null);
    isolatedSession.removeListener('will-download', denyDownload);
    // Keep permissions denied even while this session is idle.
    await isolatedSession.clearStorageData();
    await isolatedSession.clearCache();
    await isolatedSession.closeAllConnections();
    idleSessions.push(isolatedSession);
  };
  win.once('closed', () => { clean().catch(error => console.error('Local preview cleanup failed:', error.message)); });
  try { await win.loadURL(document.url); }
  catch (error) { win.destroy(); throw error; }
  return win;
}

module.exports = { SCHEME, MAX_BYTES, CSP, LOCAL_HTML_SCHEME, registerLocalHtmlScheme, snapshotLocalHtml, openIsolatedLocalHtml };
