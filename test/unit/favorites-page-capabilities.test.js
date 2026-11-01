'use strict';
// The Favorites page is shared by desktop and iOS. iOS edits Favorites but has
// no import and no Start Page pins, so bookmarks.capabilities can turn those
// controls off; desktop answers only { editable: true } and keeps them.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../../src/renderer/pages/bookmarks.js'), 'utf8');

// A stand-in element: remembers what the page sets and answers anything else.
function element() {
  const state = { hidden: false, dataset: {}, style: {}, children: [] };
  const target = function () {};
  return new Proxy(target, {
    get(_, key) {
      if (key in state) return state[key];
      if (key === 'classList') return { add() {}, remove() {}, toggle() {}, contains: () => false };
      if (key === 'querySelectorAll') return () => [];
      if (key === 'then') return undefined;
      return element();
    },
    set(_, key, value) { state[key] = value; return true; },
    apply() { return element(); },
  });
}

async function openPage(capabilities) {
  const elements = new Map();
  const byKey = (key) => { if (!elements.has(key)) elements.set(key, element()); return elements.get(key); };
  const calls = [];
  const never = new Promise(() => {});
  const api = {
    bookmarks: {
      capabilities: async () => capabilities,
      list: () => never,
    },
    pins: {
      list: async () => { calls.push('pins.list'); return { pins: [], max: 8 }; },
      onChanged: () => { calls.push('pins.onChanged'); },
    },
  };
  const window = { bowserPages: api, blancRowIcon: { rowIcon: () => element() }, addEventListener() {}, location: {} };
  const document = {
    getElementById: (id) => byKey(`#${id}`),
    querySelector: (selector) => byKey(selector),
    querySelectorAll: () => [],
    createElement: () => element(),
    addEventListener() {},
  };
  const context = {
    window, document, console, setTimeout, clearTimeout, URL,
    blancI18n: { t: (key) => key },
    blancStartPins: { siteKey: () => 'site' },
  };
  context.globalThis = context;
  vm.runInNewContext(source, context);
  for (let i = 0; i < 20; i += 1) await Promise.resolve();
  return { importHidden: byKey('.import-actions').hidden, readOnlyHidden: byKey('#readOnlyNote').hidden, calls };
}

test('desktop: an editable Favorites page keeps import and pins', async () => {
  const page = await openPage({ editable: true });
  assert.equal(page.importHidden, false);
  assert.equal(page.readOnlyHidden, true);
  assert.deepEqual(page.calls.sort(), ['pins.list', 'pins.onChanged']);
});

test('iOS: an editable Favorites page without import or pins hides them', async () => {
  const page = await openPage({ editable: true, import: false, pins: false });
  assert.equal(page.importHidden, true);
  assert.equal(page.readOnlyHidden, true);
  assert.deepEqual(page.calls, []);
});

test('read-only Favorites hide import and say why', async () => {
  const page = await openPage({ editable: false });
  assert.equal(page.importHidden, true);
  assert.equal(page.readOnlyHidden, false);
  assert.deepEqual(page.calls, []);
});
