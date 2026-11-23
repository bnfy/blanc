'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { snapshotLocalHtml, registerLocalHtmlScheme, SCHEME, MAX_BYTES, REFUSALS } = require('../../scripts/ecs-local-html.cjs');
const { EventEmitter } = require('node:events');
const { HTML_EXTENSIONS } = require('../../src/main/local-html-files');

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
    removeMenu() {}
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

// Each refusal carries a reason code (not English) so main can say why in
// the person's language (#1634 follow-up).
test('selection rejects relative paths, directories, non-HTML and oversized files with a reason', async () => fixture(async ({ dir, file }) => {
  const refused = reason => error => error.localHtmlRefusal === reason && REFUSALS.includes(reason);
  await assert.rejects(snapshotLocalHtml('relative.html'), refused('unreadable'));
  await assert.rejects(snapshotLocalHtml(null), refused('unreadable'));
  const text = path.join(dir, 'private.txt'); await fs.writeFile(text, 'private');
  await assert.rejects(snapshotLocalHtml(text), refused('not-html'));
  // A link named .html that points at another kind of file is judged by its target.
  const disguised = path.join(dir, 'disguised.html'); await fs.symlink(text, disguised);
  await assert.rejects(snapshotLocalHtml(disguised), refused('not-html'));
  const directory = path.join(dir, 'directory.html'); await fs.mkdir(directory);
  await assert.rejects(snapshotLocalHtml(directory), refused('unreadable'));
  await assert.rejects(snapshotLocalHtml(path.join(dir, 'missing.html')), refused('unreadable'));
  const huge = path.join(dir, 'huge.html'); await fs.writeFile(huge, Buffer.alloc(MAX_BYTES + 1));
  await assert.rejects(snapshotLocalHtml(huge), refused('too-large'));
  const exact = path.join(dir, 'exact.html'); await fs.writeFile(exact, Buffer.alloc(MAX_BYTES));
  (await snapshotLocalHtml(exact)).dispose();
  if (process.platform !== 'win32' && process.getuid?.() !== 0) {
    await fs.chmod(file, 0o000);
    await assert.rejects(snapshotLocalHtml(file), refused('unreadable'));
    await fs.chmod(file, 0o600);
  }
}));

test('a file that grows while it is read is refused as changed', async () => fixture(async ({ file }) => {
  const real = fs.open;
  fs.open = async (...args) => {
    const handle = await real(...args);
    const stat = handle.stat.bind(handle);
    // Report the size before the growth, as a writer racing the read would.
    handle.stat = async () => Object.assign(await stat(), { size: 4 });
    return handle;
  };
  try { await assert.rejects(snapshotLocalHtml(file), error => error.localHtmlRefusal === 'changed'); }
  finally { fs.open = real; }
}));

// Review of #1630: every extension Blanc registers for must open.
// Review of #1630 on Linux: a FIFO named *.html handed over on the command
// line must be refused at once, not hold a libuv thread waiting for a writer.
test('a FIFO named like an HTML file is refused without waiting for a writer', { skip: process.platform === 'win32' }, async () => fixture(async ({ dir }) => {
  const fifo = path.join(dir, 'pipe.html');
  require('node:child_process').execFileSync('mkfifo', [fifo]);
  const timeout = new Promise((_, reject) => { const t = setTimeout(() => reject(new Error('blocked on the FIFO')), 2000); t.unref(); });
  await assert.rejects(Promise.race([snapshotLocalHtml(fifo), timeout]),
    error => error.localHtmlRefusal === 'unreadable');
}));

test('preview accepts every HTML extension Blanc registers for', async () => fixture(async ({ dir }) => {
  for (const ext of HTML_EXTENSIONS) {
    const file = path.join(dir, `page${ext.toUpperCase()}`);
    await fs.writeFile(file, '<p>ok</p>');
    const doc = await snapshotLocalHtml(file);
    doc.dispose();
  }
}));

// Review of #1630: on Windows and Linux a preview must not keep Blanc
// running after its last browser window closes.
test('closeAllLocalHtmlPreviews closes every open preview window', async () => fixture(async ({ file }) => {
  const { openIsolatedLocalHtml, closeAllLocalHtmlPreviews } = require('../../scripts/ecs-local-html.cjs');
  const ses = new EventEmitter();
  Object.assign(ses, {
    protocol: { handle() {}, unhandle() {} }, webRequest: { onBeforeRequest() {} },
    setPermissionRequestHandler() {}, setPermissionCheckHandler() {},
    clearStorageData: async () => {}, clearCache: async () => {}, closeAllConnections: async () => {},
  });
  let closes = 0;
  class Window extends EventEmitter {
    constructor() { super(); this.webContents = new EventEmitter(); this.webContents.setWindowOpenHandler = () => {}; this.gone = false; }
    async loadURL() {}
    removeMenu() { this.menuRemoved = true; }
    isDestroyed() { return this.gone; }
    close() { closes++; this.gone = true; this.emit('closed'); }
  }
  const session = { fromPartition: () => ses };
  const first = await openIsolatedLocalHtml({ BrowserWindow: Window, session }, file);
  await openIsolatedLocalHtml({ BrowserWindow: Window, session }, file);
  // On Windows and Linux every window shows the app menu unless it removes
  // it, and its shortcuts (Ctrl+W, Ctrl+T) would act on the browser window.
  assert.equal(first.menuRemoved, true, 'the preview carries no app menu');
  closeAllLocalHtmlPreviews();
  assert.equal(closes, 2);
  closeAllLocalHtmlPreviews();
  assert.equal(closes, 2, 'a closed preview is forgotten');
}));
