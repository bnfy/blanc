'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { snapshotLocalHtml, registerLocalHtmlScheme, SCHEME, MAX_BYTES } = require('../../scripts/ecs-local-html.cjs');
const { EventEmitter } = require('node:events');

async function fixture(run) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ecs-local-unit-'));
  try {
    const file = path.join(dir, 'document.html');
    await fs.writeFile(file, '<h1>Selected document</h1>');
    await run({ dir, file });
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
}

test('local preview snapshots only selected HTML; no filesystem path resolver', async () => fixture(async ({ file }) => {
  const doc = await snapshotLocalHtml(file);
  await fs.writeFile(file, '<h1>Changed after selection</h1>');
  const response = doc.respond({ url: doc.url, method: 'GET' });
  assert.equal(await response.text(), '<h1>Selected document</h1>');
  assert.equal(response.headers.get('cache-control'), 'no-store');
  for (const url of [
    new URL('neighbor.txt', doc.url).href, new URL('../secret.txt', doc.url).href,
    new URL('/%2e%2e%2fsecret.txt', doc.url).href, doc.url + '?file=/etc/passwd',
    doc.url.replace('/index.html', '/sw.js'), doc.url.replace('://', '://user@'),
    'file:///etc/passwd', 'https://example.com/index.html',
    doc.url.replace(/:\/\/[^/]+/, '://another-document'),
  ]) {
    assert.equal(doc.permits(url), false, url);
    assert.equal(doc.respond({ url, method: 'GET' }).status, 403);
  }
  assert.equal(doc.respond({ url: doc.url, method: 'POST' }).status, 403);
  assert.equal(doc.permits(doc.url + '#section'), true);
  assert.notEqual((await snapshotLocalHtml(file)).url, doc.url);
  doc.dispose();
  assert.equal(doc.permits(doc.url), false);
  assert.equal(doc.respond({ url: doc.url, method: 'GET' }).status, 403);
}));

test('response enforces opaque sandbox and denies egress, frames, workers, forms and base URL changes', async () => fixture(async ({ file }) => {
  const doc = await snapshotLocalHtml(file);
  const csp = doc.respond({ url: doc.url, method: 'GET' }).headers.get('content-security-policy');
  for (const directive of ["default-src 'none'", "script-src 'none'", "connect-src 'none'", "frame-src 'none'", "worker-src 'none'", "form-action 'none'", "base-uri 'none'", 'sandbox']) assert.ok(csp.includes(directive));
  assert.ok(!csp.includes('allow-scripts'));
  assert.ok(!csp.includes('allow-same-origin'));
  assert.ok(!csp.includes('unsafe-eval'));
}));

test('scheme never enables service workers or CSP bypass', () => {
  let schemes;
  registerLocalHtmlScheme({ registerSchemesAsPrivileged: value => { schemes = value; } });
  assert.equal(schemes[0].scheme, SCHEME);
  assert.equal(schemes[0].privileges.allowServiceWorkers, false);
  assert.equal(schemes[0].privileges.bypassCSP, false);
});

test('local document JavaScript is disabled in native WebContents preferences', async () => {
  const source = await fs.readFile(path.join(__dirname, '../../src/main/local-html-preview.js'), 'utf8');
  assert.match(source, /javascript:\s*false/);
});

test('small previews allocate to file size and recycle cleaned session handlers', async t => fixture(async ({ file }) => {
  const { openIsolatedLocalHtml } = require('../../scripts/ecs-local-html.cjs');
  const alloc = Buffer.alloc;
  const sizes = [];
  t.mock.method(Buffer, 'alloc', (...args) => { sizes.push(args[0]); return alloc(...args); });
  let created = 0, handler, requestHandler;
  const ses = new EventEmitter();
  Object.assign(ses, {
    protocol: { handle: (_scheme, fn) => { handler = fn; }, unhandle: () => { handler = null; } },
    webRequest: { onBeforeRequest: (...args) => { requestHandler = args.at(-1); } },
    setPermissionRequestHandler() {}, setPermissionCheckHandler() {},
    clearStorageData: async () => {}, clearCache: async () => {}, closeAllConnections: async () => {},
  });
  class Window extends EventEmitter {
    constructor() { super(); this.webContents = new EventEmitter(); this.webContents.setWindowOpenHandler = () => {}; }
    async loadURL() {}
    destroy() { this.emit('closed'); }
  }
  const session = { fromPartition: () => { created++; return ses; } };
  for (let i = 0; i < 50; i++) {
    const win = await openIsolatedLocalHtml({ BrowserWindow: Window, session }, file);
    assert.equal(typeof handler, 'function');
    win.destroy();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(handler, null); assert.equal(requestHandler, null);
    assert.equal(ses.listenerCount('will-download'), 0);
  }
  assert.equal(created, 1, 'one cleaned partition reused for serial previews');
  assert.ok(sizes.every(size => size < 1024), 'small documents do not allocate 8 MiB');
}));

test('selection rejects relative paths, directories, non-HTML and oversized files', async () => fixture(async ({ dir }) => {
  await assert.rejects(snapshotLocalHtml('relative.html'));
  const text = path.join(dir, 'private.txt'); await fs.writeFile(text, 'private');
  await assert.rejects(snapshotLocalHtml(text));
  const directory = path.join(dir, 'directory.html'); await fs.mkdir(directory);
  await assert.rejects(snapshotLocalHtml(directory));
  const huge = path.join(dir, 'huge.html'); await fs.writeFile(huge, Buffer.alloc(MAX_BYTES + 1));
  await assert.rejects(snapshotLocalHtml(huge));
}));
