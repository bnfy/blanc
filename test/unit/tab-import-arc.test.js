'use strict';

// Runs the Arc import page script against a small fake DOM with a stubbed
// bridge and the real English catalog, the way a person would click through.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { createTranslator } = require('../../src/renderer/pages/i18n.js');

const root = path.resolve(__dirname, '../..');
const SCRIPT = fs.readFileSync(path.join(root, 'src/renderer/pages/tab-import-arc.js'), 'utf8');
const EN = JSON.parse(fs.readFileSync(path.join(root, 'copy/messages/en.json'), 'utf8'));
const t = createTranslator({
  locale: 'en',
  messages: Object.fromEntries(Object.entries(EN).filter(([, v]) => v?.message).map(([k, v]) => [k, v.message])),
  onMissing: (key) => { throw new Error(`missing ${key}`); },
});

class Element {
  constructor(tag) {
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.attrs = {};
    this.handlers = {};
    this.dataset = {};
    this.hidden = false;
    this.disabled = false;
    this.checked = false;
    this.className = '';
    this._text = '';
  }
  get textContent() { return this._text + this.children.map((c) => c.textContent).join(' '); }
  set textContent(value) { this._text = String(value); this.children = []; }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = [...nodes]; }
  setAttribute(name, value) { this.attrs[name] = String(value); }
  addEventListener(name, fn) { (this.handlers[name] ||= []).push(fn); }
  click() { if (!this.disabled) for (const fn of this.handlers.click || []) fn({}); }
  toggle() { this.checked = !this.checked; for (const fn of this.handlers.change || []) fn({}); }
  focus() {}
  all() { return this.children.flatMap((c) => [c, ...c.all()]); }
  querySelector(selector) { return this.all().find((n) => n.tagName === selector.toUpperCase()) ?? null; }
}

function page({ detect = { state: 'found' }, read, apply } = {}) {
  const ids = {};
  const byId = (id, tag = 'div') => { const n = new Element(tag); ids[id] = n; return n; };
  const entry = byId('arcImportEntry');
  entry.hidden = true;
  const status = byId('tabImportStatus', 'p');
  const progress = byId('tabImportStepProgress', 'p');
  progress.textContent = 'Step 1 of 4';
  const sourcePanel = new Element('section');
  const tabsPanel = new Element('section');
  tabsPanel.hidden = true;
  const preview = new Element('section');
  const result = new Element('section');
  preview.hidden = true;
  result.hidden = true;
  const calls = { read: [], apply: [], cancel: [], close: 0 };
  const document = {
    getElementById: (id) => ids[id] ?? null,
    createElement: (tag) => new Element(tag),
    querySelector: (selector) => ({
      '[data-arc-panel="preview"]': preview,
      '[data-arc-panel="result"]': result,
      '[data-step-panel="source"]': sourcePanel,
    })[selector] ?? null,
    querySelectorAll: (selector) => (selector === '[data-step-panel]' ? [sourcePanel, tabsPanel] : []),
  };
  const listeners = {};
  const window = {
    blancI18n: { t, formatLocale: () => 'en' },
    // contextBridge hands the page frozen objects; so does this stub.
    bowserPages: Object.freeze({
      surface: Object.freeze({ close: async () => { calls.close += 1; } }),
      tabImport: Object.freeze({
        arcDetect: async () => detect,
        arcRead: async (source) => { calls.read.push(source); return read(source); },
        arcApply: async (sessionId, request) => { calls.apply.push([sessionId, request]); return apply(request); },
        arcCancel: async (sessionId) => { calls.cancel.push(sessionId); return { ok: true }; },
      }),
    }),
    addEventListener: (name, fn) => { (listeners[name] ||= []).push(fn); },
  };
  vm.runInNewContext(SCRIPT, { window, document, Intl, Set, Number, Promise });
  const buttons = (node) => node.all().filter((n) => n.tagName === 'BUTTON');
  const find = (node, text) => buttons(node).find((b) => b.textContent === text);
  const boxes = () => preview.all().filter((n) => n.tagName === 'INPUT');
  const fire = (name) => { for (const fn of listeners[name] || []) fn({}); };
  return { entry, status, progress, sourcePanel, preview, result, calls, find, boxes, window, fire };
}

const settle = () => new Promise((resolve) => setImmediate(resolve));
const PREVIEW = {
  sessionId: 'session-1',
  source: 'arc',
  mode: 'spaces',
  remainingSlots: 3,
  favoritesCount: 2,
  skippedCount: 1,
  spaces: [
    { id: 'space-1', name: 'Work', tabCount: 3, pinnedCount: 1, todayCount: 1, folderCount: 1, separateProfile: false },
    { id: 'space-2', name: 'Client', tabCount: 2, pinnedCount: 2, todayCount: 0, folderCount: 0, separateProfile: true },
    { id: 'space-3', name: 'Empty', tabCount: 0, pinnedCount: 0, todayCount: 0, folderCount: 0, separateProfile: false },
  ],
};

test('Arc found: read, choose Spaces and create spaces', async () => {
  const p = page({
    read: () => PREVIEW,
    apply: () => ({ ok: true, mode: 'spaces', created: ['Work', 'Client'], droppedCount: 0, emptyCount: 0, favoritesAdded: 2 }),
  });
  await settle();
  assert.equal(p.entry.hidden, false);
  assert.match(p.entry.textContent, /Bring your Spaces, pinned tabs and folders from Arc\./);
  p.find(p.entry, 'Bring Spaces from Arc').click();
  await settle();
  assert.deepEqual(p.calls.read, ['arc']);
  assert.equal(p.preview.hidden, false);
  assert.equal(p.sourcePanel.hidden, true);
  assert.equal(p.progress.textContent, 'Arc Spaces');
  assert.match(p.preview.textContent, /You can add 3 more spaces\./);
  assert.match(p.preview.textContent, /3 tabs · 1 folder/);
  assert.match(p.preview.textContent, /sign in again/);
  assert.match(p.preview.textContent, /1 item can’t come across/);
  const [work, client, empty, favorites] = p.boxes();
  assert.deepEqual([work.checked, client.checked, empty.checked, empty.disabled, favorites.checked], [true, true, false, true, true]);
  assert.ok(p.find(p.preview, 'Create 2 spaces'));

  client.toggle();
  assert.ok(p.find(p.preview, 'Create 1 space'));
  client.toggle();
  p.find(p.preview, 'Create 2 spaces').click();
  await settle();
  // The request is built inside the page's own realm; compare its shape.
  assert.deepEqual(JSON.parse(JSON.stringify(p.calls.apply)), [['session-1', { mode: 'spaces', spaceIds: ['space-1', 'space-2'], favorites: true }]]);
  assert.equal(p.result.hidden, false);
  assert.match(p.result.textContent, /Created 2 spaces: Work and Client\./);
  assert.match(p.result.textContent, /Added 2 Favorites to the Arc folder\./);
  p.find(p.result, 'Done').click();
  await settle();
  assert.equal(p.calls.close, 1);
});

test('only Favorites selected changes the button, and nothing selected disables it', async () => {
  const p = page({ read: () => PREVIEW, apply: () => ({ ok: true }) });
  await settle();
  p.find(p.entry, 'Bring Spaces from Arc').click();
  await settle();
  const [work, client, , favorites] = p.boxes();
  work.toggle();
  client.toggle();
  assert.equal(p.find(p.preview, 'Add Favorites').disabled, false);
  favorites.toggle();
  assert.equal(p.find(p.preview, 'Add Favorites').disabled, true);
});

test('a Patron lapse turns the preview into windows with an explanation', async () => {
  const p = page({ read: () => PREVIEW, apply: () => ({ error: 'not-patron' }) });
  await settle();
  p.find(p.entry, 'Bring Spaces from Arc').click();
  await settle();
  p.find(p.preview, 'Create 2 spaces').click();
  await settle();
  assert.match(p.preview.textContent, /Blanc Patron is no longer active/);
  assert.match(p.preview.textContent, /opens in its own window/);
  assert.ok(p.find(p.preview, 'Open 2 windows'));
});

test('no room and read errors are explained in place', async () => {
  const p = page({ read: () => PREVIEW, apply: () => ({ error: 'no-room', remainingSlots: 1 }) });
  await settle();
  p.find(p.entry, 'Choose file…').click();
  await settle();
  assert.deepEqual(p.calls.read, ['file']);
  p.find(p.preview, 'Create 2 spaces').click();
  await settle();
  assert.match(p.preview.textContent, /Only 1 more space fits\./);

  const failing = page({ read: () => ({ error: 'not-arc' }) });
  await settle();
  failing.find(failing.entry, 'Choose file…').click();
  await settle();
  assert.equal(failing.status.textContent, 'That file isn’t an Arc sidebar. Look for StorableSidebar.json.');
  assert.equal(failing.preview.hidden, true);
});

test('Back cancels the session and returns to choosing a browser', async () => {
  const p = page({ read: () => PREVIEW, apply: () => ({ ok: true }) });
  await settle();
  p.find(p.entry, 'Bring Spaces from Arc').click();
  await settle();
  p.find(p.preview, 'Back').click();
  await settle();
  assert.deepEqual(p.calls.cancel, ['session-1']);
  assert.equal(p.preview.hidden, true);
  assert.equal(p.sourcePanel.hidden, false);
  assert.equal(p.progress.textContent, 'Step 1 of 4');
});

test('Linux offers Choose file… only, with the reason', async () => {
  const p = page({ detect: { state: 'unsupported' }, read: () => PREVIEW });
  await settle();
  assert.match(p.entry.textContent, /Arc never came to Linux/);
  assert.equal(p.find(p.entry, 'Bring Spaces from Arc'), undefined);
  assert.ok(p.find(p.entry, 'Choose file…'));
});

test('leaving the page drops the parsed sidebar held in main', async () => {
  const p = page({ read: () => PREVIEW, apply: () => ({ ok: true }) });
  await settle();
  p.find(p.entry, 'Bring Spaces from Arc').click();
  await settle();
  p.fire('pagehide');
  await settle();
  assert.deepEqual(p.calls.cancel, ['session-1']);
});
