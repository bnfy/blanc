'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

// reloadTabAfterSettingsFanout lives in main.js, which cannot be required in a
// unit test. Same approach as web-app-region.test.js: lift the function's real
// source and run it in a sandbox with a controllable setImmediate, so these
// assert the shipped code rather than a copy of it.
const mainSource = fs.readFileSync(path.join(__dirname, '../../src/main/main.js'), 'utf8');
const fnSource = mainSource.match(
  /function reloadTabAfterSettingsFanout\(tab\) \{[\s\S]*?\n\}/
)?.[0];

test('the deferred-reload helper is still present in main.js', () => {
  assert.ok(fnSource, 'reloadTabAfterSettingsFanout not found — update this test with it');
});

/** Run the real function; returns a `flush()` that fires the deferred turn. */
function load() {
  let deferred = null;
  const sandbox = { setImmediate: (fn) => { deferred = fn; } };
  vm.runInNewContext(`${fnSource}\nthis.__fn = reloadTabAfterSettingsFanout;`, sandbox);
  return {
    call: (tab) => sandbox.__fn(tab),
    flush: () => { const fn = deferred; deferred = null; fn?.(); },
    scheduled: () => deferred !== null,
  };
}

const liveView = () => {
  const calls = { reload: 0 };
  return {
    view: { webContents: { isDestroyed: () => false, reload: () => { calls.reload += 1; } } },
    calls,
  };
};

test('a live tab reloads on the deferred turn', () => {
  const h = load();
  const { view, calls } = liveView();
  h.call({ view });
  assert.equal(calls.reload, 0, 'must not reload synchronously');
  h.flush();
  assert.equal(calls.reload, 1);
});

test('a tab whose webContents was destroyed does not reload', () => {
  const h = load();
  let reloads = 0;
  const view = { webContents: { isDestroyed: () => true, reload: () => { reloads += 1; } } };
  h.call({ view });
  h.flush();
  assert.equal(reloads, 0);
});

// The regression. closeTab() runs `wc.close()` and the view's webContents then
// reads back undefined; the deferred turn used to dereference it and throw an
// uncaught TypeError, which kills the main process. Reachable by closing a tab
// right after /allow-ads, /block-ads, or the shield popover's toggle.
test('a tab closed during the deferred turn does not crash the main process', () => {
  const h = load();
  const view = { webContents: { isDestroyed: () => false, reload: () => {} } };
  h.call({ view });
  view.webContents = undefined; // closeTab() closed it in the intervening turn
  assert.doesNotThrow(() => h.flush());
});

test('a missing tab or view schedules nothing at all', () => {
  for (const tab of [null, undefined, {}, { view: null }]) {
    const h = load();
    h.call(tab);
    assert.equal(h.scheduled(), false, JSON.stringify(tab));
  }
});
