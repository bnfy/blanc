'use strict';

const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const test = require('node:test');
const { bringExternalWindowToFront, externalWindowRuntime } = require('../../src/main/window-activation');

function fixture(t, options = {}) {
  t.mock.timers.enable({ apis: ['setImmediate', 'setTimeout'] });
  const state = {
    minimized: false, hidden: false, active: false, focused: false, destroyed: false,
    deferRestore: false, deferActivation: false, deferFocus: false, ...options,
  };
  const calls = [];
  const application = Object.assign(new EventEmitter(), {
    isHidden: () => state.hidden,
    isActive: () => state.active,
    show() { calls.push('unhide'); state.hidden = false; },
    focus(options) {
      calls.push(['app.focus', options]);
      if (!state.deferActivation) {
        state.active = true;
        this.emit('did-become-active');
      }
    },
  });
  const window = Object.assign(new EventEmitter(), {
    isDestroyed: () => state.destroyed,
    isMinimized: () => state.minimized,
    isFocused: () => state.focused,
    restore() {
      calls.push('restore');
      if (!state.deferRestore) { state.minimized = false; this.emit('restore'); }
    },
    show() { calls.push('show'); },
    moveTop() { calls.push('moveTop'); },
    focus() {
      calls.push('window.focus');
      if (state.active && !state.hidden && !state.minimized && !state.deferFocus) {
        state.focused = true;
        this.emit('focus');
        application.emit('browser-window-focus', {}, this);
      }
    },
  });
  const activate = () => bringExternalWindowToFront(application, window, { platform: 'darwin' });
  const noListeners = () => {
    assert.deepEqual(application.eventNames(), []);
    assert.deepEqual(window.eventNames(), []);
  };
  return { application, window, calls, state, activate, noListeners };
}

for (const [name, options] of Object.entries({
  background: {}, hidden: { hidden: true }, minimized: { minimized: true },
  'hidden and minimized': { hidden: true, minimized: true },
})) {
  test(`macOS ${name} handoff unhides/restores before focusing and removes listeners`, (t) => {
    const f = fixture(t, options);
    assert.equal(f.activate(), true);
    t.mock.timers.tick(0);
    assert.equal(f.state.hidden, false);
    assert.equal(f.state.minimized, false);
    assert.equal(f.state.active, true);
    assert.equal(f.state.focused, true);
    assert.deepEqual(f.calls, [
      ...(options.hidden ? ['unhide'] : []), ...(options.minimized ? ['restore'] : []),
      'show', ['app.focus', { steal: true }], 'moveTop', 'window.focus',
    ]);
    f.noListeners();
    const calls = f.calls.length;
    t.mock.timers.tick(2_000);
    assert.equal(f.calls.length, calls);
  });
}

for (const order of [['restore', 'activate'], ['activate', 'restore']]) {
  test(`native completions in order ${order.join(', ')}`, (t) => {
    const f = fixture(t, { minimized: true, deferRestore: true, deferActivation: true });
    f.activate();
    t.mock.timers.tick(0);
    assert.equal(f.state.focused, false);
    for (const event of order) {
      if (event === 'restore') { f.state.minimized = false; f.window.emit('restore'); }
      else { f.state.active = true; f.application.emit('did-become-active'); }
    }
    assert.equal(f.state.focused, true);
    f.noListeners();
  });
}

test('the next-turn check repairs focus requested before native readiness', (t) => {
  const f = fixture(t, { deferFocus: true });
  f.activate();
  assert.equal(f.state.focused, false);
  f.state.deferFocus = false;
  t.mock.timers.tick(0);
  assert.equal(f.state.focused, true);
  f.noListeners();
});

test('a newer handoff cancels the earlier window before its delayed restore', (t) => {
  const f = fixture(t, { minimized: true, deferRestore: true });
  f.activate();
  const other = Object.assign(new EventEmitter(), {
    isDestroyed: () => false, isMinimized: () => false, isFocused: () => true,
    show() {}, focus() {}, moveTop() {},
  });
  bringExternalWindowToFront(f.application, other, { platform: 'darwin' });
  const count = f.calls.length;
  f.state.minimized = false;
  f.window.emit('restore');
  t.mock.timers.tick(0);
  assert.equal(f.calls.length, count);
  f.noListeners();
  assert.deepEqual(other.eventNames(), []);
});

for (const [owner, event] of [
  ['window', 'hide'], ['window', 'minimize'], ['window', 'closed'],
  ['application', 'before-quit'], ['application', 'will-quit'],
  ['application', 'did-resign-active'],
]) {
  test(`${event} cancels pending focus without pulling the app back`, (t) => {
    const f = fixture(t, { deferFocus: true });
    f.activate();
    f[owner].emit(event);
    const count = f.calls.length;
    f.window.emit('restore');
    f.application.emit('did-become-active');
    t.mock.timers.tick(2_000);
    assert.equal(f.calls.length, count);
    f.noListeners();
  });
}

test('changing to another Blanc window cancels the pending target', (t) => {
  const f = fixture(t, { deferFocus: true });
  f.activate();
  f.application.emit('browser-window-focus', {}, {});
  const count = f.calls.length;
  t.mock.timers.tick(0);
  assert.equal(f.calls.length, count);
  f.noListeners();
});

test('a hidden app detected on the follow-up is left hidden', (t) => {
  const f = fixture(t, { deferFocus: true });
  f.activate();
  f.state.hidden = true;
  t.mock.timers.tick(0);
  assert.equal(f.state.hidden, true);
  f.noListeners();
});

test('a missing native completion expires after two seconds without polling', (t) => {
  const f = fixture(t, { minimized: true, deferRestore: true });
  f.activate();
  t.mock.timers.tick(0);
  const count = f.calls.length;
  t.mock.timers.tick(1_999);
  assert.ok(f.window.listenerCount('restore'));
  t.mock.timers.tick(1);
  f.noListeners();
  assert.equal(f.calls.length, count);
});

test('destroyed targets and native call failures leave no activation listeners', (t) => {
  const f = fixture(t, { destroyed: true });
  assert.equal(f.activate(), false);
  assert.deepEqual(f.calls, []);
  f.state.destroyed = false;
  f.window.show = () => { throw new Error('closed during show'); };
  assert.throws(f.activate, /closed during show/);
  f.noListeners();
});

test('Windows/Linux retain synchronous restoration without macOS app operations', (t) => {
  const f = fixture(t, { minimized: true });
  for (const platform of ['win32', 'linux']) {
    f.state.minimized = true;
    f.calls.length = 0;
    assert.equal(bringExternalWindowToFront(f.application, f.window, { platform }), true);
    assert.deepEqual(f.calls, ['restore', 'show', 'moveTop', 'window.focus']);
    f.noListeners();
  }
});

test('routing prefers the remembered live profile/window and skips closing or discarded runtimes', () => {
  const primary = { profileId: 'personal', window: null };
  const work = { profileId: 'work', window: { isDestroyed: () => false } };
  const spare = { profileId: 'spare', window: { isDestroyed: () => false } };
  const runtimes = [primary, spare, work];
  assert.equal(externalWindowRuntime(runtimes, work, primary), work);
  assert.equal(externalWindowRuntime(runtimes, primary, primary, work), work);
  assert.equal(externalWindowRuntime(runtimes, { window: {} }, primary, work), work);
  work.closing = true;
  assert.equal(externalWindowRuntime(runtimes, work, primary), spare);
  assert.equal(externalWindowRuntime([primary], null, primary), primary);
});
