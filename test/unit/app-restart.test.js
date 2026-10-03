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
