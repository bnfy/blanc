'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const PRELOAD = path.join(__dirname, '../../src/main/passkey-preload.js');
const SOURCE = fs.readFileSync(PRELOAD, 'utf8');
const MAINWORLD = SOURCE.match(/\/\/ >>> mainworld\n([\s\S]*?)\n\/\/ <<< mainworld/)[1];

// A page realm whose credentials container records what reaches the browser.
function pageRealm() {
  const reached = [];
  class CredentialsContainer {
    get(options) { reached.push({ op: 'get', options, self: this }); return Promise.resolve('real-get'); }
    create(options) { reached.push({ op: 'create', options, self: this }); return Promise.resolve('real-create'); }
  }
  const container = new CredentialsContainer();
  const PublicKeyCredential = {
    isConditionalMediationAvailable: async () => true,
    isUserVerifyingPlatformAuthenticatorAvailable: async () => true,
    getClientCapabilities: async () => ({ conditionalGet: true, conditionalCreate: true, passkeyPlatformAuthenticator: true }),
  };
  const root = { navigator: { credentials: container }, PublicKeyCredential, DOMException };
  const install = vm.runInNewContext(`(${MAINWORLD.trim()})`, {});
  return { root, reached, CredentialsContainer, install: () => install(root) };
}

const publicKey = { challenge: new Uint8Array(32), rpId: 'example.com' };
const settle = (promise, ms = 20) => Promise.race([
  promise.then((value) => ({ value }), (error) => ({ error })),
  new Promise((resolve) => setTimeout(() => resolve('pending'), ms)),
]);

test('pages are told quiet (conditional) passkey requests are unavailable', async () => {
  const page = pageRealm();
  assert.equal(page.install(), true);
  assert.equal(await page.root.PublicKeyCredential.isConditionalMediationAvailable(), false);
  // Spread into this realm: the guard builds its object in the page's realm.
  assert.deepEqual({ ...await page.root.PublicKeyCredential.getClientCapabilities() },
    { conditionalGet: false, conditionalCreate: false, passkeyPlatformAuthenticator: true });
  assert.equal(await page.root.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable(), true);
});

test('a conditional get never reaches the browser and ends when the page aborts it', async () => {
  const page = pageRealm();
  page.install();
  const controller = new AbortController();
  const request = page.root.navigator.credentials.get({ mediation: 'conditional', publicKey, signal: controller.signal });
  assert.equal(await settle(request), 'pending');
  controller.abort();
  const outcome = await settle(request);
  assert.equal(outcome.error.name, 'AbortError');
  assert.equal(outcome.error, controller.signal.reason);
  assert.deepEqual(page.reached, []);
});

test('a quiet request made through the prototype is held too', async () => {
  const page = pageRealm();
  page.install();
  const request = page.CredentialsContainer.prototype.get.call(page.root.navigator.credentials, { mediation: 'conditional', publicKey });
  assert.equal(await settle(request), 'pending');
  assert.deepEqual(page.reached, []);
});

test('a conditional get with an already aborted signal rejects at once', async () => {
  const page = pageRealm();
  page.install();
  const reason = new Error('gone');
  const outcome = await settle(page.root.navigator.credentials.get({
    mediation: 'conditional', publicKey, signal: AbortSignal.abort(reason),
  }));
  assert.equal(outcome.error, reason);
  assert.deepEqual(page.reached, []);
});

test('a conditional get without a signal just stays quiet', async () => {
  const page = pageRealm();
  page.install();
  assert.equal(await settle(page.root.navigator.credentials.get({ mediation: 'conditional', publicKey })), 'pending');
  assert.deepEqual(page.reached, []);
});

test('a conditional create is held the same way', async () => {
  const page = pageRealm();
  page.install();
  const controller = new AbortController();
  const request = page.root.navigator.credentials.create({ mediation: 'conditional', publicKey, signal: controller.signal });
  assert.equal(await settle(request), 'pending');
  controller.abort();
  assert.equal((await settle(request)).error.name, 'AbortError');
  assert.deepEqual(page.reached, []);
});

test('a passkey request the person starts still reaches the browser unchanged', async () => {
  const page = pageRealm();
  page.install();
  const container = page.root.navigator.credentials;
  const modal = { publicKey };
  assert.equal(await container.get(modal), 'real-get');
  assert.equal(await container.create(modal), 'real-create');
  // Conditional mediation without publicKey is a password request, not a passkey one.
  const password = { mediation: 'conditional', password: true };
  assert.equal(await container.get(password), 'real-get');
  assert.deepEqual(page.reached.map(({ op, options, self }) => [op, options, self === container]),
    [['get', modal, true], ['create', modal, true], ['get', password, true]]);
});

test('installing twice wraps once, and a page without WebAuthn is left alone', () => {
  const page = pageRealm();
  assert.equal(page.install(), true);
  const { get } = page.CredentialsContainer.prototype;
  assert.equal(page.install(), false);
  assert.equal(page.CredentialsContainer.prototype.get, get);

  const install = vm.runInNewContext(`(${MAINWORLD.trim()})`, {});
  assert.equal(install({ navigator: {} }), false);
});

// The isolated-world half, run against a fake electron, window and process.
function runPreload({ platform, protocol }) {
  const injected = [];
  vm.runInNewContext(SOURCE, {
    require(name) {
      assert.equal(name, 'electron');
      return { contextBridge: { executeInMainWorld: (script) => injected.push(script) } };
    },
    process: { platform },
    window: { location: { protocol } },
  }, { filename: PRELOAD });
  return injected;
}

test('the guard runs only on Windows web pages', () => {
  for (const protocol of ['https:', 'http:']) {
    const injected = runPreload({ platform: 'win32', protocol });
    assert.equal(injected.length, 1, protocol);
    assert.equal(injected[0].func.name, 'installConditionalPasskeyGuard');
  }
  assert.equal(runPreload({ platform: 'win32', protocol: 'blanc:' }).length, 0);
  assert.equal(runPreload({ platform: 'darwin', protocol: 'https:' }).length, 0);
  assert.equal(runPreload({ platform: 'linux', protocol: 'https:' }).length, 0);
});
