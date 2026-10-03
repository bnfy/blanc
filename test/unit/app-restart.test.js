const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createAppRestarter } = require('../../src/main/app-restart');
function fixture(quit) {
  const app = new EventEmitter(), page = new EventEmitter();
  const calls = [];
  app.quit = () => { calls.push('quit'); quit?.(app, page); };
  app.relaunch = () => calls.push('relaunch');
  const restart = createAppRestarter({ app, webContents: { getAllWebContents: () => [page] }, onCancelled: () => calls.push('cancelled') });
  return { app, page, calls, restart };
}
test('restart waits through deferred quit and deduplicates repeated clicks', async () => {
  const f = fixture();
  const pending = f.restart();
  assert.equal(f.restart(), pending);
  assert.deepEqual(f.calls, ['quit']);
  f.app.emit('before-quit', { defaultPrevented: true });
  assert.deepEqual(f.calls, ['quit']);
  f.app.emit('quit');
  assert.equal(await pending, true);
  assert.deepEqual(f.calls, ['quit', 'relaunch']);
  assert.equal(f.page.listenerCount('will-prevent-unload'), 0);
});
test('Stay cancels restart and never relaunches on a later unrelated quit', async () => {
  const f = fixture((_app, page) => page.emit('will-prevent-unload', { defaultPrevented: false }));
  assert.equal(await f.restart(), false);
  f.app.emit('quit');
  assert.deepEqual(f.calls, ['quit', 'cancelled']);
  assert.equal(f.page.listenerCount('will-prevent-unload'), 0);
});
test('Leave permits quit and relaunch after existing page handlers decide', async () => {
  const f = fixture((app, page) => {
    const event = { defaultPrevented: false };
    page.emit('will-prevent-unload', event);
    event.defaultPrevented = true;
    queueMicrotask(() => app.emit('quit'));
  });
  assert.equal(await f.restart(), true);
  assert.deepEqual(f.calls, ['quit', 'relaunch']);
});
test('quit failure cancels the intent and permits retry', async () => {
  let fail = true;
  const f = fixture(app => { if (fail) throw new Error('quit failed'); app.emit('quit'); });
  assert.equal(await f.restart(), false);
  fail = false;
  assert.equal(await f.restart(), true);
  assert.deepEqual(f.calls, ['quit', 'cancelled', 'quit', 'relaunch']);
});

test('Stay preserves Quiet and Reopen state until the irreversible quit phase', async () => {
  const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
  const source = fs.readFileSync(path.join(__dirname, '../../src/main/main.js'), 'utf8');
  const lifecycle = source.slice(source.indexOf('let isQuitting = false;'), source.indexOf('/** Builds one window'));
  const app = new EventEmitter(), page = new EventEmitter();
  let closes = 0, downgrades = 0, stops = 0, relaunches = 0;
  const quiet = { view: { webContents: { isDestroyed: () => false, close: () => closes++ } }, secret: 'retained page state' };
  const snapshots = new Map([['quiet', quiet]]);
  const entry = { view: {}, expiryTimer: null };
  const runtime = { closing: false, closedEntries: [entry], window: { isDestroyed: () => false, show() {} } };
  app.relaunch = () => relaunches++;
  app.quit = () => { app.emit('before-quit'); runtime.closing = true; page.emit('will-prevent-unload', { defaultPrevented: false }); };
  const context = { app, webContents: { getAllWebContents: () => [page] }, createAppRestarter,
    sleepSnapshots: snapshots, windowRuntimes: { all: () => [runtime] }, forEachWindowRuntime: fn => fn(runtime),
    namedWorkspaces: { flushPending() {} }, forgetTabImportForRuntime() {}, clearTimeout,
    downgradeHeldEntry: () => downgrades++, blockingProviders: { stop: () => stops++ }, onePasswordBroker: null,
  };
  vm.runInNewContext(lifecycle + '\nthis.restart = restartApp; this.quitting = () => isQuitting;', context);
  assert.equal(await context.restart(), false);
  assert.equal(context.quitting(), false); assert.equal(runtime.closing, false);
  assert.equal(snapshots.get('quiet'), quiet); assert.equal(runtime.closedEntries[0], entry);
  assert.equal(closes, 0); assert.equal(downgrades, 0); assert.equal(stops, 0); assert.equal(relaunches, 0);
  app.emit('will-quit');
  assert.equal(snapshots.size, 0); assert.equal(closes, 1); assert.equal(downgrades, 1); assert.equal(stops, 1);
});

test('a Leave decision after ten seconds still completes the requested restart', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = fixture(); const pending = f.restart();
  t.mock.timers.tick(30000);
  f.page.emit('will-prevent-unload', { defaultPrevented: true });
  await Promise.resolve(); f.app.emit('quit');
  assert.equal(await pending, true); assert.deepEqual(f.calls, ['quit', 'relaunch']);
});
