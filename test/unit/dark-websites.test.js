const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');

const policy = require('../../src/main/dark-websites');
const { createStylesheetFetcher } = require('../../src/main/dark-websites-fetch');
const { createDarkWebsitesService } = require('../../src/main/dark-websites-service');

const ROOT = path.join(__dirname, '..', '..');
const PRELOAD = path.join(ROOT, 'src/main/dark-websites-preload.js');

test('only http(s) pages have a dark-site hostname', () => {
  assert.equal(policy.darkSiteHostname('https://www.Example.com/a?b'), 'example.com');
  assert.equal(policy.darkSiteHostname('http://news.example.org/'), 'news.example.org');
  for (const url of ['blanc://newtab/', 'blanc-chrome://index/', 'chrome-extension://x/y', 'file:///tmp/a.html', '', null, 'nope']) {
    assert.equal(policy.darkSiteHostname(url), null, String(url));
  }
});

test('pages are darkened only when on, Blanc is dark, and the site is not excepted', () => {
  const base = { url: 'https://example.com/', enabled: true, exceptions: [], systemDark: true };
  assert.equal(policy.shouldDarken(base), true);
  assert.equal(policy.shouldDarken({ ...base, enabled: false }), false);
  assert.equal(policy.shouldDarken({ ...base, systemDark: false }), false);
  assert.equal(policy.shouldDarken({ ...base, exceptions: ['example.com'] }), false);
  assert.equal(policy.shouldDarken({ ...base, url: 'blanc://newtab/' }), false);
  assert.equal(policy.shouldDarken({ ...base, enabled: 'yes' }), false);
});

test('private overrides apply only to private tabs', () => {
  const overrides = new Map([['example.com', false], ['kept.example', true]]);
  const base = { enabled: true, exceptions: ['kept.example'], systemDark: true, privateOverrides: overrides };
  assert.equal(policy.shouldDarken({ ...base, url: 'https://example.com/', isPrivate: true }), false);
  assert.equal(policy.shouldDarken({ ...base, url: 'https://example.com/', isPrivate: false }), true);
  assert.equal(policy.shouldDarken({ ...base, url: 'https://kept.example/', isPrivate: true }), true);
  assert.equal(policy.shouldDarken({ ...base, url: 'https://kept.example/', isPrivate: false }), false);
  // Overrides never bypass the global switch or Blanc's appearance.
  assert.equal(policy.shouldDarken({ ...base, url: 'https://kept.example/', isPrivate: true, enabled: false }), false);
  assert.equal(policy.shouldDarken({ ...base, url: 'https://kept.example/', isPrivate: true, systemDark: false }), false);
});

test('/dark-site flips a normal site through the saved site list', () => {
  const url = 'https://www.example.com/page';
  assert.deepEqual(policy.resolveDarkSiteCommand({ url, enabled: true, exceptions: ['other.org'] }), {
    hostname: 'example.com', darkened: false, privateOverride: null,
    settings: { darkWebsitesExceptions: ['other.org', 'example.com'] },
  });
  assert.deepEqual(policy.resolveDarkSiteCommand({ url, enabled: true, exceptions: ['example.com', 'other.org'] }), {
    hostname: 'example.com', darkened: true, privateOverride: null,
    settings: { darkWebsites: true, darkWebsitesExceptions: ['other.org'] },
  });
  // Off globally: the command turns the feature on for this site.
  assert.deepEqual(policy.resolveDarkSiteCommand({ url, enabled: false, exceptions: ['example.com'] }), {
    hostname: 'example.com', darkened: true, privateOverride: null,
    settings: { darkWebsites: true, darkWebsitesExceptions: [] },
  });
  assert.equal(policy.resolveDarkSiteCommand({ url: 'blanc://settings/', enabled: true, exceptions: [] }), null);
});

test('/dark-site in a private tab never writes the site to settings', () => {
  const url = 'https://secret.example/';
  const overrides = new Map();
  const on = policy.resolveDarkSiteCommand({ url, enabled: true, exceptions: [], isPrivate: true, privateOverrides: overrides });
  assert.deepEqual(on, { hostname: 'secret.example', darkened: false, settings: null, privateOverride: false });
  overrides.set('secret.example', false);
  const back = policy.resolveDarkSiteCommand({ url, enabled: true, exceptions: [], isPrivate: true, privateOverrides: overrides });
  assert.deepEqual(back, { hostname: 'secret.example', darkened: true, settings: null, privateOverride: true });
  // Turning the feature on globally reveals nothing about the site.
  const off = policy.resolveDarkSiteCommand({ url, enabled: false, exceptions: [], isPrivate: true, privateOverrides: new Map() });
  assert.deepEqual(off, { hostname: 'secret.example', darkened: true, settings: { darkWebsites: true }, privateOverride: true });
  for (const result of [on, back, off]) {
    assert.ok(!JSON.stringify(result.settings || {}).includes('secret.example'));
  }
});

test('only public unicast addresses may be fetched', () => {
  for (const address of ['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111', '[2001:4860:4860::8888]']) {
    assert.equal(policy.isPublicAddress(address), true, address);
  }
  for (const address of [
    '127.0.0.1', '10.1.2.3', '172.16.0.1', '192.168.1.1', '169.254.169.254', '100.64.0.1',
    '0.0.0.0', '224.0.0.1', '255.255.255.255', '::1', '::', 'fe80::1', 'fd00::1', 'ff02::1',
    '::ffff:127.0.0.1', '::ffff:7f00:1', '64:ff9b::a00:1', '2002:a00:1::1', 'example.com', '', null,
  ]) {
    assert.equal(policy.isPublicAddress(address), false, String(address));
  }
});

test('stylesheet URLs are limited to public http(s) hosts without credentials', () => {
  assert.equal(policy.parseStylesheetUrl('https://cdn.example.com/site.css').host, 'cdn.example.com');
  assert.equal(policy.parseStylesheetUrl('http://8.8.8.8/a.css').literal, true);
  for (const url of [
    'file:///etc/passwd', 'data:text/css,body{}', 'ftp://example.com/a.css', 'blanc://newtab/x.css',
    'https://user:pw@example.com/a.css', 'http://localhost/a.css', 'http://app.localhost/a.css',
    'http://intranet/a.css', 'http://printer.local/a.css', 'http://svc.internal/a.css',
    'http://127.0.0.1/a.css', 'http://127.1/a.css', 'http://[::1]/a.css', 'http://0x7f000001/a.css',
    'http://169.254.169.254/latest', `https://example.com/${'a'.repeat(policy.MAX_STYLESHEET_URL_LENGTH)}`,
    42, null,
  ]) {
    assert.equal(policy.parseStylesheetUrl(url), null, String(url).slice(0, 60));
  }
});

const allowAll = async () => true;

function cssResponse(body, { type = 'text/css; charset=utf-8', status = 200, length } = {}) {
  const headers = new Map([['content-type', type]]);
  if (length !== undefined) headers.set('content-length', String(length));
  return {
    ok: status >= 200 && status < 300,
    headers: { get: (name) => headers.get(name.toLowerCase()) ?? null },
    body: new Response(body).body,
  };
}

function fakeSession({ addresses = ['93.184.216.34'], respond = () => cssResponse('a{color:red}') } = {}) {
  const calls = { resolve: [], fetch: [] };
  return {
    calls,
    resolveHost: async (host) => { calls.resolve.push(host); return { endpoints: addresses.map((address) => ({ address })) }; },
    fetch: async (url, init) => { calls.fetch.push({ url, init }); return respond(url, init); },
  };
}

test('the stylesheet fetch is cookieless, redirect-free and CSS-only', async () => {
  const ses = fakeSession();
  const fetchCss = createStylesheetFetcher({ getSession: () => ses });
  assert.equal(await fetchCss(1, 'https://cdn.example.com/a.css', allowAll), 'a{color:red}');
  const { init } = ses.calls.fetch[0];
  assert.equal(init.credentials, 'omit');
  assert.equal(init.redirect, 'error');
  assert.ok(init.signal);

  const html = fakeSession({ respond: () => cssResponse('<html>', { type: 'text/html' }) });
  assert.equal(await createStylesheetFetcher({ getSession: () => html })(1, 'https://cdn.example.com/a.css', allowAll), null);
  const missing = fakeSession({ respond: () => cssResponse('', { status: 404 }) });
  assert.equal(await createStylesheetFetcher({ getSession: () => missing })(1, 'https://cdn.example.com/a.css', allowAll), null);
});

test('a stylesheet the page\'s blocker would block is never fetched', async () => {
  const ses = fakeSession();
  const fetchCss = createStylesheetFetcher({ getSession: () => ses });
  const asked = [];
  assert.equal(await fetchCss(1, 'https://tracker.example/t.css', async (url) => { asked.push(url); return false; }), null);
  assert.deepEqual(asked, ['https://tracker.example/t.css']);
  // A missing or non-boolean decision fails closed, before any lookup.
  assert.equal(await fetchCss(1, 'https://cdn.example.com/a.css'), null);
  assert.equal(await fetchCss(1, 'https://cdn.example.com/a.css', async () => 'yes'), null);
  assert.equal(await fetchCss(1, 'https://cdn.example.com/a.css', async () => { throw new Error('provider failed'); }), null);
  assert.equal(ses.calls.resolve.length + ses.calls.fetch.length, 0);
  // Invalid URLs never reach the blocker.
  assert.equal(await fetchCss(1, 'http://127.0.0.1/a.css', async () => { throw new Error('asked'); }), null);
});

test('hosts resolving to any private address are refused before fetching', async () => {
  for (const addresses of [['10.0.0.5'], ['93.184.216.34', '127.0.0.1'], []]) {
    const ses = fakeSession({ addresses });
    assert.equal(await createStylesheetFetcher({ getSession: () => ses })(1, 'https://rebind.example/a.css', allowAll), null);
    assert.equal(ses.calls.fetch.length, 0, addresses.join());
  }
  const local = fakeSession();
  assert.equal(await createStylesheetFetcher({ getSession: () => local })(1, 'http://192.168.0.1/a.css', allowAll), null);
  assert.equal(local.calls.resolve.length + local.calls.fetch.length, 0);
});

test('oversized stylesheets are dropped, declared or streamed', async () => {
  const big = 'a'.repeat(policy.MAX_STYLESHEET_BYTES + 1);
  const declared = fakeSession({ respond: () => cssResponse('x', { length: policy.MAX_STYLESHEET_BYTES + 1 }) });
  assert.equal(await createStylesheetFetcher({ getSession: () => declared })(1, 'https://cdn.example.com/a.css', allowAll), null);
  const streamed = fakeSession({ respond: () => cssResponse(big) });
  assert.equal(await createStylesheetFetcher({ getSession: () => streamed })(1, 'https://cdn.example.com/a.css', allowAll), null);
});

test('each page has a fetch rate limit and a concurrency limit', async () => {
  let t = 0;
  const ses = fakeSession();
  const fetchCss = createStylesheetFetcher({ getSession: () => ses, now: () => t });
  for (let i = 0; i < policy.MAX_STYLESHEET_FETCHES_PER_MINUTE; i += 1) {
    assert.notEqual(await fetchCss(7, `https://cdn.example.com/${i}.css`, allowAll), null);
  }
  assert.equal(await fetchCss(7, 'https://cdn.example.com/over.css', allowAll), null);
  assert.notEqual(await fetchCss(8, 'https://cdn.example.com/other-page.css', allowAll), null);
  t += 60_000;
  assert.notEqual(await fetchCss(7, 'https://cdn.example.com/next-minute.css', allowAll), null);

  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const slow = fakeSession({ respond: async () => { await gate; return cssResponse('b{}'); } });
  const limited = createStylesheetFetcher({ getSession: () => slow, now: () => 0 });
  const pending = [];
  for (let i = 0; i < policy.MAX_CONCURRENT_STYLESHEET_FETCHES; i += 1) {
    pending.push(limited(9, `https://cdn.example.com/slow-${i}.css`, allowAll));
  }
  assert.equal(await limited(9, 'https://cdn.example.com/one-too-many.css', allowAll), null);
  release();
  assert.deepEqual(await Promise.all(pending), pending.map(() => 'b{}'));
  assert.equal(await limited(9, 'https://cdn.example.com/after.css', allowAll), 'b{}');
});

function serviceHarness({ darkWebsites = true, exceptions = [], dark = true, blocked = [] } = {}) {
  const ipcMain = new EventEmitter();
  const handlers = new Map();
  ipcMain.handle = (channel, fn) => handlers.set(channel, fn);
  const nativeTheme = new EventEmitter();
  nativeTheme.shouldUseDarkColors = dark;
  let stored = { darkWebsites, darkWebsitesExceptions: exceptions };
  const writes = [];
  const listeners = [];
  const settings = {
    getSettings: () => stored,
    setSettings: (partial) => { writes.push(partial); stored = { ...stored, ...partial }; listeners.forEach((fn) => fn(stored)); return stored; },
  };
  const sent = [];
  const tabs = [];
  const allowAsked = [];
  const service = createDarkWebsitesService({
    ipcMain, nativeTheme, settings,
    getFetchSession: () => fakeSession(),
    forEachTabContents: (fn) => tabs.forEach(fn),
    allowStylesheet: async (wc, url) => { allowAsked.push([wc.getURL(), url]); return !blocked.includes(url); },
  });
  service.install();
  const contents = (url, { persistent = true, id = 1 } = {}) => ({
    id,
    getURL: () => url,
    isDestroyed: () => false,
    send: (channel, payload) => sent.push({ channel, url, payload }),
    once: () => {},
    session: { isPersistent: () => persistent },
  });
  const get = (url, { parent = null, persistent = true } = {}) => {
    const event = { sender: contents(url, { persistent }), senderFrame: { url, parent } };
    ipcMain.emit(policy.GET_CHANNEL, event);
    return event.returnValue;
  };
  return { service, settings, writes, sent, tabs, contents, get, handlers, nativeTheme, listeners, allowAsked };
}

test('main answers the preload only for http(s) main frames', () => {
  const h = serviceHarness();
  assert.deepEqual(h.get('https://example.com/'), { on: true });
  assert.deepEqual(h.get('https://example.com/', { parent: {} }), { on: false });
  assert.deepEqual(h.get('blanc://settings/'), { on: false });
  assert.deepEqual(serviceHarness({ dark: false }).get('https://example.com/'), { on: false });
  assert.deepEqual(serviceHarness({ exceptions: ['example.com'] }).get('https://example.com/'), { on: false });
});

test('the stylesheet channel serves only pages that are being darkened', async () => {
  const h = serviceHarness({ exceptions: ['kept.example'], blocked: ['https://tracker.example/t.css'] });
  const fetchCss = h.handlers.get(policy.FETCH_CHANNEL);
  const call = (pageUrl, opts = {}) => fetchCss({ sender: h.contents(pageUrl), senderFrame: { url: pageUrl, parent: opts.parent ?? null } }, 'https://cdn.example.com/a.css');
  assert.equal(await call('https://example.com/'), 'a{color:red}');
  assert.equal(await call('https://kept.example/'), null);
  assert.equal(await call('https://example.com/', { parent: {} }), null);
  assert.equal(await call('blanc://newtab/'), null);
  assert.deepEqual(h.allowAsked, [['https://example.com/', 'https://cdn.example.com/a.css']]);
  const blockedCall = await fetchCss({ sender: h.contents('https://example.com/'), senderFrame: { url: 'https://example.com/', parent: null } }, 'https://tracker.example/t.css');
  assert.equal(blockedCall, null);
});

test('theme changes and private /dark-site choices reach open tabs without touching settings', () => {
  const h = serviceHarness();
  h.tabs.push(h.contents('https://example.com/', { id: 1 }), h.contents('https://secret.example/', { persistent: false, id: 2 }), h.contents('blanc://newtab/', { id: 3 }));
  h.nativeTheme.shouldUseDarkColors = false;
  h.nativeTheme.emit('updated');
  assert.deepEqual(h.sent.map((m) => [m.url, m.payload.on]), [['https://example.com/', false], ['https://secret.example/', false]]);

  h.nativeTheme.shouldUseDarkColors = true;
  h.sent.length = 0;
  const result = h.service.runDarkSiteCommand({ url: 'https://secret.example/', private: true });
  assert.deepEqual(result, { hostname: 'secret.example', darkened: false });
  assert.equal(h.writes.length, 0);
  assert.deepEqual(h.sent.map((m) => [m.url, m.payload.on]), [['https://example.com/', true], ['https://secret.example/', false]]);
  // The same site in a normal tab is unaffected.
  assert.deepEqual(h.get('https://secret.example/'), { on: true });
  assert.deepEqual(h.get('https://secret.example/', { persistent: false }), { on: false });

  const normal = h.service.runDarkSiteCommand({ url: 'https://example.com/', private: false });
  assert.deepEqual(normal, { hostname: 'example.com', darkened: false });
  assert.deepEqual(h.writes, [{ darkWebsitesExceptions: ['example.com'] }]);
  assert.equal(h.service.runDarkSiteCommand(null), null);
});

function runPreload({ url = 'https://example.com/', top = true, state = { on: true } } = {}) {
  const calls = { expose: [], info: [], execute: [], listeners: [] };
  const location = new URL(url);
  const window = {};
  window.top = top ? window : {};
  const electron = {
    contextBridge: { exposeInIsolatedWorld: (...args) => calls.expose.push(args) },
    webFrame: {
      setIsolatedWorldInfo: (...args) => calls.info.push(args),
      executeJavaScriptInIsolatedWorld: (...args) => { calls.execute.push(args); return Promise.resolve(); },
    },
    ipcRenderer: {
      sendSync: (channel) => { calls.sync = channel; return state; },
      invoke: async () => null,
      on: (channel, fn) => calls.listeners.push([channel, fn]),
    },
  };
  vm.runInNewContext(fs.readFileSync(PRELOAD, 'utf8'), {
    location, window, require: (name) => { assert.equal(name, 'electron'); return electron; },
  });
  return calls;
}

test('the generated preload is current and built from the pinned engine', async () => {
  const { generate } = await import('../../dark-reader/build.mjs');
  assert.equal(fs.readFileSync(PRELOAD, 'utf8'), generate());
  const pinned = JSON.parse(fs.readFileSync(path.join(ROOT, 'dark-reader/pinned.json'), 'utf8'));
  assert.equal(pinned.license, 'MIT');
  const engine = fs.readFileSync(path.join(ROOT, 'dark-reader/upstream/darkreader.js'), 'utf8');
  assert.ok(fs.readFileSync(PRELOAD, 'utf8').includes(JSON.stringify(engine).slice(1, 2000)));
});

test('the preload runs the engine only in a darkened http(s) main frame, in its own world', () => {
  const on = runPreload();
  assert.equal(on.sync, policy.GET_CHANNEL);
  assert.equal(on.expose.length, 1);
  assert.equal(on.expose[0][0], policy.DARK_WEBSITES_WORLD_ID);
  assert.equal(on.expose[0][1], '__blancDarkWebsitesBridge');
  assert.deepEqual(Object.keys(on.expose[0][2]), ['fetchCss']);
  assert.equal(on.info[0][0], policy.DARK_WEBSITES_WORLD_ID);
  assert.match(on.info[0][1].csp, /style-src 'unsafe-inline'/);
  assert.equal(on.info[0][1].securityOrigin, 'https://example.com');
  assert.ok(on.execute.every(([world]) => world === policy.DARK_WEBSITES_WORLD_ID));
  assert.ok(on.execute[0][1][0].code.includes('Dark Reader v4.9.133'));
  assert.match(on.execute[1][1][0].code, /apply\(\{ on: true \}\)/);
  assert.equal(on.listeners[0][0], policy.UPDATE_CHANNEL);

  const off = runPreload({ state: { on: false } });
  assert.equal(off.expose.length + off.info.length + off.execute.length, 0);
  // Turning it on later boots the engine once, then only applies.
  off.listeners[0][1]({}, { on: true });
  off.listeners[0][1]({}, { on: false });
  assert.equal(off.expose.length, 1);
  assert.equal(off.execute.length, 3);
  assert.match(off.execute[2][1][0].code, /apply\(\{ on: false \}\)/);

  for (const calls of [runPreload({ url: 'blanc://newtab/' }), runPreload({ top: false }), runPreload({ url: 'file:///a.html' })]) {
    assert.equal(calls.sync, undefined);
    assert.equal(calls.execute.length, 0);
  }
  // A malformed reply is treated as off.
  assert.equal(runPreload({ state: 'on' }).execute.length, 0);
});

test('Dark websites settings are validated, device-local and never synced', () => {
  const electronId = require.resolve('electron');
  const original = require.cache[electronId];
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-dark-websites-'));
  require.cache[electronId] = { id: electronId, filename: electronId, loaded: true, exports: { app: { getPath: () => userData, on: () => {} } } };
  try {
    delete require.cache[require.resolve('../../src/main/settings')];
    delete require.cache[require.resolve('../../src/main/store')];
    const settings = require('../../src/main/settings');
    assert.equal(settings.getSettings().darkWebsites, false);
    assert.deepEqual(settings.getSettings().darkWebsitesExceptions, []);
    const next = settings.setSettings({
      darkWebsites: true,
      darkWebsitesExceptions: ['https://www.Example.com/path', 'example.com', 'not a host', 42],
    });
    assert.equal(next.darkWebsites, true);
    assert.deepEqual(next.darkWebsitesExceptions, ['example.com']);
    assert.equal(settings.setSettings({ darkWebsites: 'yes' }).darkWebsites, true);
    const source = fs.readFileSync(path.join(ROOT, 'src/main/settings.js'), 'utf8');
    const synced = source.match(/const SYNCED_KEYS = \[([^\]]*)\]/)[1];
    assert.doesNotMatch(synced, /darkWebsites/);
  } finally {
    delete require.cache[require.resolve('../../src/main/settings')];
    delete require.cache[require.resolve('../../src/main/store')];
    if (original) require.cache[electronId] = original;
    else delete require.cache[electronId];
  }
});
