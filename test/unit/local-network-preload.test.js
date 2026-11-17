'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SOURCE = fs.readFileSync(path.join(__dirname, '../../src/main/local-network-preload.js'), 'utf8');
const MAINWORLD = SOURCE.match(/\/\/ >>> mainworld\n([\s\S]*?)\n\/\/ <<< mainworld/)[1];

// A page realm with a real EventTarget window and a strict original query.
function pageRealm({ answer } = {}) {
  const root = new EventTarget();
  Object.assign(root, { EventTarget, Event, CustomEvent, setTimeout, JSON });
  const realCalls = [];
  root.navigator = { permissions: { query: async (descriptor) => { realCalls.push(descriptor.name); return { state: 'denied', real: true }; } } };
  const asked = [];
  if (answer) {
    root.addEventListener('blanc:lna-query', (event) => {
      const { id, name } = JSON.parse(event.detail);
      asked.push(name);
      const state = answer(name);
      if (state === undefined) return;
      queueMicrotask(() => root.dispatchEvent(new CustomEvent('blanc:lna-state', { detail: JSON.stringify({ id, state }) })));
    });
  }
  const install = vm.runInNewContext(`(${MAINWORLD.trim()})`, {});
  return { root, realCalls, asked, install: () => install(root) };
}

test('the three names are answered from Blanc; everything else goes to the original query', async () => {
  const page = pageRealm({ answer: () => 'prompt' });
  assert.equal(page.install(), true);
  for (const name of ['loopback-network', 'local-network', 'local-network-access']) {
    const status = await page.root.navigator.permissions.query({ name });
    assert.equal(status.state, 'prompt', name);
    assert.equal(status.name, name);
  }
  assert.deepEqual(page.realCalls, []);
  const camera = await page.root.navigator.permissions.query({ name: 'camera' });
  assert.equal(camera.real, true);
  assert.deepEqual(page.realCalls, ['camera']);
});

test('no answer, or a malformed one, falls back to the original query', async () => {
  const page = pageRealm({ answer: (name) => (name === 'local-network' ? 'yes' : null) });
  page.install();
  assert.equal((await page.root.navigator.permissions.query({ name: 'loopback-network' })).real, true);
  assert.equal((await page.root.navigator.permissions.query({ name: 'local-network' })).real, true);
});

test('a status stays live and fires change when Blanc decides', async () => {
  const page = pageRealm({ answer: () => 'prompt' });
  page.install();
  const status = await page.root.navigator.permissions.query({ name: 'loopback-network' });
  const again = await page.root.navigator.permissions.query({ name: 'loopback-network' });
  assert.equal(status, again, 'one live object per name');
  let changes = 0;
  status.onchange = () => { changes += 1; };
  page.root.dispatchEvent(new CustomEvent('blanc:lna-changed', {
    detail: JSON.stringify({ states: { 'loopback-network': 'granted', 'local-network': 'bogus' } }),
  }));
  assert.equal(status.state, 'granted');
  assert.equal(changes, 1);
  page.root.dispatchEvent(new CustomEvent('blanc:lna-changed', {
    detail: JSON.stringify({ states: { 'loopback-network': 'granted' } }),
  }));
  assert.equal(changes, 1, 'an unchanged state fires nothing');
});

test('installing twice wraps once', () => {
  const page = pageRealm();
  assert.equal(page.install(), true);
  const patched = page.root.navigator.permissions.query;
  assert.equal(page.install(), false);
  assert.equal(page.root.navigator.permissions.query, patched);
});

// The isolated-world half, run against a fake electron and window.
function runPreload({ protocol = 'https:', top = true } = {}) {
  const window = new EventTarget();
  window.location = { protocol };
  window.top = top ? window : {};
  const invoked = [];
  const listeners = {};
  const executed = [];
  const electron = {
    ipcRenderer: {
      invoke: async (channel, name) => { invoked.push([channel, name]); return name === 'loopback-network' ? 'granted' : 'nonsense'; },
      on: (channel, fn) => { listeners[channel] = fn; },
    },
    webFrame: { executeJavaScript: (code) => { executed.push(code); return Promise.resolve(); } },
  };
  vm.runInNewContext(SOURCE, { window, require: () => electron, CustomEvent, JSON, Number });
  return { window, invoked, listeners, executed };
}

const nextEvent = (target, type) => new Promise((resolve) => target.addEventListener(type, (event) => resolve(JSON.parse(event.detail)), { once: true }));

test('the preload runs only in top-level web pages', () => {
  assert.equal(runPreload().executed.length, 1);
  assert.equal(runPreload({ top: false }).executed.length, 0);
  assert.equal(runPreload({ protocol: 'blanc:' }).executed.length, 0);
  assert.equal(runPreload({ protocol: 'file:' }).executed.length, 0);
});

test('the bridge asks main for known names only and drops bad states', async () => {
  const p = runPreload();
  let reply = nextEvent(p.window, 'blanc:lna-state');
  p.window.dispatchEvent(new CustomEvent('blanc:lna-query', { detail: JSON.stringify({ id: 4, name: 'loopback-network' }) }));
  assert.deepEqual(await reply, { id: 4, state: 'granted' });
  reply = nextEvent(p.window, 'blanc:lna-state');
  p.window.dispatchEvent(new CustomEvent('blanc:lna-query', { detail: JSON.stringify({ id: 5, name: 'local-network' }) }));
  assert.deepEqual(await reply, { id: 5, state: null });
  p.window.dispatchEvent(new CustomEvent('blanc:lna-query', { detail: JSON.stringify({ id: 6, name: 'camera' }) }));
  p.window.dispatchEvent(new CustomEvent('blanc:lna-query', { detail: '{' }));
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(p.invoked, [
    ['local-network:permission-query', 'loopback-network'],
    ['local-network:permission-query', 'local-network'],
  ]);
});

test('changes from main reach the page with only valid states', async () => {
  const p = runPreload();
  const changed = nextEvent(p.window, 'blanc:lna-changed');
  p.listeners['local-network:permission-changed'](null, { 'loopback-network': 'denied', 'local-network': 'x', other: 'granted' });
  assert.deepEqual(await changed, { states: { 'loopback-network': 'denied' } });
});
