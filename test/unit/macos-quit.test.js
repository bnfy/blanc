const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const {
  installMacOSQuitVisibilityGate,
  settleWindowHidden,
} = require('../../src/main/macos-quit');

const turn = () => new Promise((resolve) => setImmediate(resolve));

class FakeWindow extends EventEmitter {
  constructor({ visible = true } = {}) {
    super();
    this.visible = visible;
    this.destroyed = false;
    this.hideCalls = 0;
  }

  isDestroyed() { return this.destroyed; }
  isVisible() { return this.visible; }
  hide() {
    this.hideCalls += 1;
    this.visible = false;
    setImmediate(() => this.emit('hide'));
  }
}

function quitEvent() {
  return {
    defaultPrevented: false,
    preventDefault() { this.defaultPrevented = true; },
  };
}

test('a visible macOS window settles its hide event before quit is retried', async () => {
  const app = new EventEmitter();
  let quitCalls = 0;
  app.quit = () => { quitCalls += 1; };
  const window = new FakeWindow();
  installMacOSQuitVisibilityGate({
    app,
    BrowserWindow: { getAllWindows: () => [window] },
    platform: 'darwin',
  });

  const first = quitEvent();
  app.emit('before-quit', first);
  assert.equal(first.defaultPrevented, true);
  assert.equal(window.hideCalls, 1);
  assert.equal(quitCalls, 0);

  await turn();
  await turn();
  assert.equal(quitCalls, 1);

  const retry = quitEvent();
  app.emit('before-quit', retry);
  assert.equal(retry.defaultPrevented, false);
  assert.equal(window.hideCalls, 1);
});

test('coalesced hide events cannot strand the quit gate', async () => {
  const window = new FakeWindow();
  window.hide = function hideWithoutEvent() {
    this.hideCalls += 1;
    this.visible = false;
  };
  await settleWindowHidden(window);
  assert.equal(window.hideCalls, 1);
  assert.equal(window.listenerCount('hide'), 0);
  assert.equal(window.listenerCount('closed'), 0);
});

test('non-macOS quit behavior is untouched', () => {
  const app = new EventEmitter();
  installMacOSQuitVisibilityGate({
    app,
    BrowserWindow: { getAllWindows: () => [new FakeWindow()] },
    platform: 'win32',
  });
  assert.equal(app.listenerCount('before-quit'), 0);
});
