'use strict';

// A site decides when its permission prompt appears, so the prompt must never
// take the keyboard from whatever the person is typing into: a keystroke
// meant for the page could otherwise answer the prompt, and a Block answer is
// persisted for the origin (permissions.js saveDecision).

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '../..');
const promptSource = fs.readFileSync(path.join(ROOT, 'src/renderer/permission.js'), 'utf8');

function fakeElement(id) {
  const listeners = new Map();
  return {
    id,
    hidden: true,
    textContent: '',
    focusCalls: 0,
    focus() { this.focusCalls += 1; },
    toggleAttribute(name, force) { if (name === 'hidden') this.hidden = !!force; },
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(fn);
    },
    dispatch(type, event = {}) {
      const full = { preventDefault() {}, ...event };
      for (const fn of listeners.get(type) ?? []) fn(full);
    },
  };
}

/** Runs the real permission.js against a minimal DOM and preload bridge. */
function loadPromptDocument() {
  const ids = ['permissionBar', 'permissionText', 'permissionGlyphs', 'permGlyphMic',
    'permGlyphCam', 'permAllowBtn', 'permBlockBtn'];
  const elements = Object.fromEntries(ids.map((id) => [id, fakeElement(id)]));
  const document = fakeElement('document');
  document.getElementById = (id) => elements[id] ?? null;
  const answers = [];
  let deliver = null;
  const window = {
    browserAPI: {
      respondPermission: (id, allow) => answers.push([id, allow]),
      onPermissionPrompt: (callback) => { deliver = callback; },
    },
  };
  vm.runInNewContext(promptSource, { document, window, URL });
  assert.ok(deliver, 'permission.js did not subscribe to prompts');
  return { elements, document, answers, deliver };
}

const GEOLOCATION = { id: 11, origin: 'https://maps.example', permission: 'geolocation', mediaTypes: [] };

test('clicking Block answers the shown prompt with a denial', () => {
  // Positive control: proves the harness can observe an answer, so the
  // Escape test below cannot pass just because nothing is wired up.
  const { elements, answers, deliver } = loadPromptDocument();
  deliver(GEOLOCATION);
  assert.equal(elements.permissionBar.hidden, false);
  assert.equal(elements.permissionText.textContent, 'maps.example wants to know your location');
  elements.permBlockBtn.dispatch('click');
  assert.deepEqual(answers, [[11, false]]);
});

test('showing a prompt leaves keyboard focus where it was', () => {
  const { elements, deliver } = loadPromptDocument();
  deliver(GEOLOCATION);
  deliver({ id: 12, origin: 'https://call.example', permission: 'media', mediaTypes: ['audio', 'video'] });
  elements.permAllowBtn.dispatch('click'); // advances to the queued media prompt
  assert.equal(elements.permissionText.textContent, 'call.example wants to use your camera and microphone');
  const focused = Object.values(elements).filter((element) => element.focusCalls > 0).map((element) => element.id);
  assert.deepEqual(focused, []);
});

test('Escape does not answer a pending prompt', () => {
  const { document, elements, answers, deliver } = loadPromptDocument();
  deliver(GEOLOCATION);
  document.dispatch('keydown', { key: 'Escape' });
  assert.deepEqual(answers, []);
  assert.equal(elements.permissionBar.hidden, false, 'the prompt must stay up until answered');
});

const mainSource = fs.readFileSync(path.join(ROOT, 'src/main/main.js'), 'utf8');
const attachStart = mainSource.indexOf('function attachPermissionView(');
const attachEnd = mainSource.indexOf('\n}', attachStart) + 2;
const attachSource = attachStart >= 0 ? mainSource.slice(attachStart, attachEnd) : null;

test('attachPermissionView is liftable from main.js', () => {
  assert.ok(attachSource, 'attachPermissionView not found — update this test');
});

const ensureStart = mainSource.indexOf('function ensurePermissionView(');
const ensureEnd = mainSource.indexOf('\n}', ensureStart) + 2;
const ensureSource = ensureStart >= 0 ? mainSource.slice(ensureStart, ensureEnd) : null;

test('ensurePermissionView is liftable from main.js', () => {
  assert.ok(ensureSource, 'ensurePermissionView not found — update this test');
});

function fakeWebContents(id) {
  // Electron's WebContents is an EventEmitter; keep its event semantics real.
  const wc = new (require('node:events').EventEmitter)();
  Object.assign(wc, {
    id,
    focusCalls: 0,
    focus() { wc.focusCalls += 1; },
    isDestroyed: () => false,
    loadURL() {},
    send() {},
  });
  return wc;
}

/** Creates a brand-new prompt view while `focused` holds the keyboard. */
function createPromptView(focused) {
  const runtime = { permissionView: null, permissionPrompts: new Map() };
  const sandbox = {
    rt: () => runtime,
    WebContentsView: class { constructor() { this.webContents = fakeWebContents(99); } setBackgroundColor() {} },
    CHROME_PARTITION: 'blanc-chrome',
    CHROME_PERMISSION_URL: 'blanc-chrome://permission/',
    path,
    __dirname: path.join(ROOT, 'src/main'),
    windowRuntimes: { registerChromeSurface() {}, unregisterChromeSurface() {} },
    bindWindowRuntime: (_owner, fn) => fn,
    lockPrivilegedNavigation() {},
    installChromeShortcuts() {},
    webContents: { getFocusedWebContents: () => focused },
  };
  vm.createContext(sandbox);
  return vm.runInContext(`${ensureSource}; ensurePermissionView();`, sandbox);
}

test('a brand-new prompt view hands the keyboard straight back to the page', () => {
  // Electron focuses a newly created view the moment it is attached.
  const page = fakeWebContents(5);
  const view = createPromptView(page);
  view.webContents.emit('focus');
  assert.equal(page.focusCalls, 1);
});

test('once the prompt has loaded, clicking into it keeps the keyboard there', () => {
  const page = fakeWebContents(5);
  const view = createPromptView(page);
  view.webContents.emit('focus');
  view.webContents.emit('did-finish-load');
  view.webContents.emit('focus'); // the person clicks Allow or Block
  assert.equal(page.focusCalls, 1, 'a deliberate click must not bounce focus back to the page');
});

test('nothing held the keyboard, so nothing is handed back', () => {
  const view = createPromptView(null);
  assert.doesNotThrow(() => view.webContents.emit('focus'));
});

test('attaching the prompt view shows it without focusing it', () => {
  const added = [];
  const view = {
    focusCalls: 0,
    bounds: null,
    setBounds(bounds) { this.bounds = bounds; },
    webContents: { focus() { view.focusCalls += 1; } },
  };
  const runtime = { window: { contentView: { addChildView: (child) => added.push(child) } }, permissionViewAttached: false };
  const sandbox = {
    hasLiveWindow: () => true,
    ensurePermissionView: () => view,
    permissionViewBounds: () => ({ x: 0, y: 736, width: 560, height: 84 }),
    rt: () => runtime,
  };
  vm.createContext(sandbox);
  vm.runInContext(`${attachSource}; attachPermissionView();`, sandbox);
  assert.deepEqual(added, [view], 'the prompt view must be attached');
  assert.equal(runtime.permissionViewAttached, true);
  assert.equal(view.focusCalls, 0);
});
