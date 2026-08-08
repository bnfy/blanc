const assert = require('node:assert/strict');
const test = require('node:test');
const {
  COSMETIC_FILTER_CHANNEL,
  MUTATION_OBSERVER_CHANNEL,
  blockableHostname,
  hostnameForWebContents,
  isWebContentsExcepted,
  resolveBlockAdsCommand,
  installCosmeticExceptionHandlers,
} = require('../../src/main/adblock-exceptions');

function fakeWebContents(url) {
  return { getURL: () => url };
}

function fakeIpcMain() {
  const handlers = new Map();
  return {
    handlers,
    removeHandler(channel) { handlers.delete(channel); },
    handle(channel, fn) { handlers.set(channel, fn); },
  };
}

test('ad-block exceptions normalize the top-level webContents hostname', () => {
  const wc = fakeWebContents('https://www.AllRecipes.com/article');
  assert.equal(hostnameForWebContents(wc), 'allrecipes.com');
  assert.equal(isWebContentsExcepted(wc, ['allrecipes.com']), true);
  assert.equal(isWebContentsExcepted(wc, ['example.com']), false);
  assert.equal(isWebContentsExcepted(fakeWebContents('not a url'), ['allrecipes.com']), false);
});

test('only http(s) pages carry an exception hostname', () => {
  assert.equal(blockableHostname('https://www.Yahoo.com/news'), 'yahoo.com');
  assert.equal(blockableHostname('http://example.com'), 'example.com');
  // An internal page has no ads to allow. Left unfiltered, "/allow-ads" on a
  // new tab would file "newtab" and then suppress cosmetic filtering across
  // every blanc:// page.
  assert.equal(blockableHostname('blanc://newtab/'), null);
  assert.equal(blockableHostname('devtools://devtools/bundled/x.html'), null);
  assert.equal(blockableHostname('file:///Users/me/page.html'), null);
  assert.equal(blockableHostname(''), null);
  assert.equal(blockableHostname(null), null);
  assert.equal(hostnameForWebContents(fakeWebContents('blanc://newtab/')), null);
});

// The regression this suite exists to pin: an exception outranks the global
// switch, so on an excepted site a bare global toggle changes nothing the
// user can see — while silently unblocking every other site.
test('/block-ads re-blocks an excepted site instead of toggling globally', () => {
  const result = resolveBlockAdsCommand({
    hostname: 'yahoo.com',
    exceptions: ['yahoo.com', 'example.com'],
    enabled: true,
  });
  assert.equal(result.action, 'unexcept');
  assert.equal(result.hostname, 'yahoo.com');
  assert.deepEqual(result.exceptions, ['example.com']);
  // Global blocking survives — the other site stays protected.
  assert.equal(result.enabled, true);
});

test('/block-ads on an excepted site also switches blocking back on', () => {
  // Dropping the exception while the global switch is off would be the same
  // invisible no-op wearing a different hat.
  const result = resolveBlockAdsCommand({
    hostname: 'yahoo.com',
    exceptions: ['yahoo.com'],
    enabled: false,
  });
  assert.equal(result.action, 'unexcept');
  assert.equal(result.enabled, true);
  assert.deepEqual(result.exceptions, []);
});

test('/block-ads keeps toggling globally off an excepted site', () => {
  const off = resolveBlockAdsCommand({ hostname: 'example.com', exceptions: ['yahoo.com'], enabled: true });
  assert.equal(off.action, 'toggle');
  assert.equal(off.enabled, false);
  assert.deepEqual(off.exceptions, ['yahoo.com'], 'exceptions are untouched by the global toggle');

  const on = resolveBlockAdsCommand({ hostname: 'example.com', exceptions: [], enabled: false });
  assert.equal(on.action, 'toggle');
  assert.equal(on.enabled, true);
});

test('/block-ads toggles globally when there is no site to act on', () => {
  // Internal page, or no active tab at all.
  const result = resolveBlockAdsCommand({ hostname: null, exceptions: ['yahoo.com'], enabled: true });
  assert.equal(result.action, 'toggle');
  assert.equal(result.enabled, false);
  assert.deepEqual(result.exceptions, ['yahoo.com']);
  assert.doesNotThrow(() => resolveBlockAdsCommand({ hostname: 'a.com', exceptions: undefined, enabled: true }));
});

test('/allow-ads then /block-ads returns the site to its starting state', () => {
  const start = { enabled: true, exceptions: [] };
  const allowed = { enabled: start.enabled, exceptions: [...start.exceptions, 'yahoo.com'] };
  const reblocked = resolveBlockAdsCommand({ hostname: 'yahoo.com', ...allowed });
  assert.deepEqual(
    { enabled: reblocked.enabled, exceptions: reblocked.exceptions },
    start
  );
});

test('cosmetic filtering is skipped for an excepted tab', async () => {
  const ipcMain = fakeIpcMain();
  const calls = [];
  const blocker = {
    onInjectCosmeticFilters(...args) { calls.push(['inject', ...args]); return 'injected'; },
    onIsMutationObserverEnabled(...args) { calls.push(['mutation', ...args]); return true; },
  };
  const excepted = fakeWebContents('https://www.allrecipes.com/article');
  installCosmeticExceptionHandlers(
    ipcMain,
    blocker,
    (wc) => isWebContentsExcepted(wc, ['allrecipes.com'])
  );

  const inject = ipcMain.handlers.get(COSMETIC_FILTER_CHANNEL);
  const mutation = ipcMain.handlers.get(MUTATION_OBSERVER_CHANNEL);
  assert.equal(await inject({ sender: excepted }, excepted.getURL(), undefined), undefined);
  assert.equal(await mutation({ sender: excepted }), false);
  assert.deepEqual(calls, []);
});

test('cosmetic filtering still delegates for a protected tab', async () => {
  const ipcMain = fakeIpcMain();
  const calls = [];
  const blocker = {
    onInjectCosmeticFilters(...args) { calls.push(['inject', ...args]); return 'injected'; },
    onIsMutationObserverEnabled(...args) { calls.push(['mutation', ...args]); return true; },
  };
  const protectedTab = fakeWebContents('https://example.com/');
  installCosmeticExceptionHandlers(
    ipcMain,
    blocker,
    (wc) => isWebContentsExcepted(wc, ['allrecipes.com'])
  );

  const event = { sender: protectedTab };
  assert.equal(
    await ipcMain.handlers.get(COSMETIC_FILTER_CHANNEL)(event, protectedTab.getURL(), { ids: ['ad'] }),
    'injected'
  );
  assert.equal(await ipcMain.handlers.get(MUTATION_OBSERVER_CHANNEL)(event), true);
  assert.equal(calls.length, 2);
});
