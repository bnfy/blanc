'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { bringExternalWindowToFront } = require('../../src/main/window-activation');

function fixture({ minimized = false, destroyed = false } = {}) {
  const calls = [];
  const application = {
    focus(options) { calls.push(['app.focus', options]); },
  };
  const window = {
    isDestroyed: () => destroyed,
    isMinimized: () => minimized,
    restore: () => calls.push(['restore']),
    show: () => calls.push(['show']),
    moveTop: () => calls.push(['moveTop']),
    focus: () => calls.push(['window.focus']),
  };
  return { application, window, calls };
}

test('macOS external URL handoff restores, raises, activates, and focuses Blanc', () => {
  const { application, window, calls } = fixture({ minimized: true });
  assert.equal(
    bringExternalWindowToFront(application, window, { platform: 'darwin' }),
    true,
  );
  assert.deepEqual(calls, [
    ['restore'],
    ['show'],
    ['moveTop'],
    ['app.focus', { steal: true }],
    ['window.focus'],
  ]);
});

test('other platforms raise the handoff window without macOS steal activation', () => {
  const { application, window, calls } = fixture();
  assert.equal(
    bringExternalWindowToFront(application, window, { platform: 'win32' }),
    true,
  );
  assert.deepEqual(calls, [['show'], ['moveTop'], ['window.focus']]);
});

test('a destroyed handoff window is a safe no-op', () => {
  const { application, window, calls } = fixture({ destroyed: true });
  assert.equal(
    bringExternalWindowToFront(application, window, { platform: 'darwin' }),
    false,
  );
  assert.deepEqual(calls, []);
});
