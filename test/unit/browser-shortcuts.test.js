'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { BROWSER_COMMAND_IDS, browserCommandDefinition, matchBrowserShortcut, installBrowserShortcuts, createBrowserCommandExecutor } = require('../../src/main/browser-shortcuts');
const input = (key, modifiers = {}) => ({ type: 'keyDown', key, ...modifiers });

test('every command names its menu label in the interface catalog', () => {
  const en = require('../../copy/messages/en.json');
  assert.ok(BROWSER_COMMAND_IDS.length >= 14);
  for (const id of BROWSER_COMMAND_IDS) {
    const { labelKey } = browserCommandDefinition(id, 'darwin');
    assert.ok(Object.hasOwn(en, labelKey), `${id}: ${labelKey} is in en.json`);
  }
});

test('Windows and Linux essentials and retained aliases dispatch to the same commands', () => {
  for (const platform of ['win32', 'linux']) {
    for (const [key, modifiers, command] of [
      ['h', { control: true }, 'history'], ['y', { control: true }, 'history'],
      ['j', { control: true }, 'downloads'], ['j', { control: true, shift: true }, 'downloads'],
      ['d', { alt: true }, 'address'], ['l', { control: true }, 'address'],
      ['F5', {}, 'reload'], ['r', { control: true }, 'reload'],
      ['PageDown', { control: true }, 'next-tab'], ['Tab', { control: true }, 'next-tab'],
      ['PageUp', { control: true }, 'previous-tab'], ['Tab', { control: true, shift: true }, 'previous-tab'],
      [',', { control: true }, 'settings'], ['w', { control: true }, 'close-tab'],
    ]) assert.equal(matchBrowserShortcut(input(key, modifiers), platform), command);
  }
});

test('ordinary editing, Tab, composition, AltGr and extra modifiers pass through', () => {
  for (const event of [input('Tab'), input('w'), input('w', { control: true, alt: true }),
    input('h', { control: true, meta: true }), input('h', { control: true, shift: true }),
    input('h', { control: true, isComposing: true }), input('h', { control: true, modifiers: ['altGraph'] }),
    input('c', { control: true }), { type: 'keyUp', key: 'w', control: true }]) {
    assert.equal(matchBrowserShortcut(event, 'win32'), null);
  }
  assert.equal(browserCommandDefinition('history', 'darwin').primary, 'CmdOrCtrl+Y');
  assert.equal(browserCommandDefinition('downloads', 'darwin').primary, 'CmdOrCtrl+Shift+J');
  assert.deepEqual(browserCommandDefinition('address', 'darwin').aliases, []);
  assert.equal(matchBrowserShortcut(input('h', { meta: true }), 'darwin'), null);
});

test('input routing follows current ownership, suppresses menu duplicates and consumes repeats', () => {
  const wc = Object.assign(new EventEmitter(), { id: 12, isDestroyed: () => false });
  let owner = { id: 'first' }, owns = true, calls = [], prevented = 0;
  installBrowserShortcuts({ webContents: wc, getRuntime: () => owner, ownsSurface: () => owns,
    execute: (id, runtime) => { calls.push([id, runtime.id]); return true; }, platform: 'win32' });
  const emit = extra => wc.emit('before-input-event', { preventDefault: () => prevented++ }, input('w', { control: true, ...extra }));
  emit(); owner = { id: 'second' }; emit(); emit({ isAutoRepeat: true });
  owns = false; emit(); owner = null; emit();
  assert.deepEqual(calls, [['close-tab', 'first'], ['close-tab', 'second']]);
  assert.equal(prevented, 3);
  const mac = new EventEmitter();
  installBrowserShortcuts({ webContents: mac, platform: 'darwin' });
  assert.equal(mac.listenerCount('before-input-event'), 0);
});

test('the shared executor rejects closed and resident windows and unknown commands', () => {
  const calls = [];
  const execute = createBrowserCommandExecutor({ settings: runtime => calls.push(runtime.id) });
  const runtime = { id: 'a', window: { isDestroyed: () => false } };
  assert.equal(execute('settings', runtime), true);
  for (const invalid of [null, {}, { ...runtime, closing: true }, { ...runtime, resident: true },
    { ...runtime, window: { isDestroyed: () => true } }]) assert.equal(execute('settings', invalid), false);
  assert.equal(execute('constructor', runtime), false);
  assert.deepEqual(calls, ['a']);
});


test('macOS keeps detached-window creation and reopen menu actions', () => {
  const calls = [];
  const actions = Object.fromEntries(['new-window', 'new-tab', 'new-private-tab', 'reopen-tab', 'settings'].map(id => [id, () => calls.push(id)]));
  const runtime = { id: 'mac', window: null };
  const mac = createBrowserCommandExecutor(actions, { platform: 'darwin' });
  for (const id of ['new-window', 'new-tab', 'new-private-tab', 'reopen-tab']) assert.equal(mac(id, runtime), true);
  assert.equal(mac('settings', runtime), false);
  assert.equal(createBrowserCommandExecutor(actions, { platform: 'win32' })('new-window', runtime), false);
  assert.deepEqual(calls, ['new-window', 'new-tab', 'new-private-tab', 'reopen-tab']);
});
