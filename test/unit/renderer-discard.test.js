'use strict';

const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const test = require('node:test');
const {
  hasExclusiveRenderer,
  hasBeforeUnloadListener,
  terminateRenderer,
} = require('../../src/main/renderer-discard');

const contents = (pid, { destroyed = false } = {}) => ({
  getOSProcessId: () => pid,
  isDestroyed: () => destroyed,
});

test('renderer discard requires a positive PID owned by exactly one WebContents', () => {
  const target = contents(101);
  assert.equal(hasExclusiveRenderer(target, [target, contents(202)]), true);
  assert.equal(hasExclusiveRenderer(target, [target, contents(101)]), false);
  assert.equal(hasExclusiveRenderer(contents(0), []), false);
  assert.equal(hasExclusiveRenderer(target, [target, contents(101, { destroyed: true })]), true);
});

function debuggerContents({ listenersByContext = {}, fail = false } = {}) {
  class Client extends EventEmitter {
    isAttached() { return true; }
    async sendCommand(method, params) {
      if (fail) throw new Error('CDP unavailable');
      if (method === 'Runtime.enable') {
        for (const id of Object.keys(listenersByContext)) {
          this.emit('message', {}, 'Runtime.executionContextCreated', {
            context: { id: Number(id), auxData: { isDefault: true, frameId: `frame-${id}` } },
          });
        }
        return {};
      }
      if (method === 'Runtime.evaluate') {
        return { result: { objectId: `window-${params.contextId}` } };
      }
      if (method === 'DOMDebugger.getEventListeners') {
        const id = params.objectId.replace('window-', '');
        return { listeners: listenersByContext[id] };
      }
      return {};
    }
  }
  return { debugger: new Client() };
}

test('beforeunload detection inspects every frame main world', async () => {
  const clean = debuggerContents({ listenersByContext: { 1: [], 2: [{ type: 'click' }] } });
  assert.equal(await hasBeforeUnloadListener(clean, { contextWaitMs: 0 }), false);

  const protectedTab = debuggerContents({
    listenersByContext: { 1: [], 2: [{ type: 'beforeunload' }] },
  });
  assert.equal(await hasBeforeUnloadListener(protectedTab, { contextWaitMs: 0 }), true);
});

test('beforeunload detection fails closed when CDP cannot prove safety', async () => {
  assert.equal(await hasBeforeUnloadListener(debuggerContents(), { contextWaitMs: 0 }), true,
    'no reported main-world context is uncertain');
  assert.equal(await hasBeforeUnloadListener(debuggerContents({ fail: true }), { contextWaitMs: 0 }), true);
});

// terminateRenderer: Linux ends the renderer itself; elsewhere Electron's
// crash request already kills the process.
function rendererTarget(pid) {
  const calls = [];
  return {
    calls,
    contents: {
      getOSProcessId: () => pid,
      forcefullyCrashRenderer: () => calls.push('crash'),
    },
    kill: (target, signal) => calls.push(`kill:${target}:${signal}`),
  };
}
const procWith = (lines) => () => lines.join('\0');

test('on Linux a verified renderer is ended with SIGKILL, not asked to crash', () => {
  const t = rendererTarget(4242);
  const how = terminateRenderer(t.contents, {
    platform: 'linux', execPath: '/opt/Blanc/blanc', kill: t.kill,
    readFile: procWith(['/opt/Blanc/blanc', '--type=renderer', '--enable-crash-reporter=x']),
  });
  assert.equal(how, 'killed');
  assert.deepEqual(t.calls, ['kill:4242:SIGKILL']);
});

test('on Linux a pid that is not one of our renderers only gets the crash request', () => {
  for (const argv of [
    ['/usr/bin/other', '--type=renderer'], // another program
    ['/opt/Blanc/blanc', '--type=zygote'], // ours, but not a renderer
  ]) {
    const t = rendererTarget(4242);
    const how = terminateRenderer(t.contents, { platform: 'linux', execPath: '/opt/Blanc/blanc', kill: t.kill, readFile: procWith(argv) });
    assert.equal(how, 'crash-requested');
    assert.deepEqual(t.calls, ['crash'], argv.join(' '));
  }
  const unreadable = rendererTarget(4242);
  terminateRenderer(unreadable.contents, { platform: 'linux', execPath: '/opt/Blanc/blanc', kill: unreadable.kill, readFile: () => { throw new Error('ENOENT'); } });
  assert.deepEqual(unreadable.calls, ['crash'], 'no /proc entry: never killed blind');
});

test('on Linux a refused kill falls back to the crash request', () => {
  const t = rendererTarget(4242);
  const how = terminateRenderer(t.contents, {
    platform: 'linux', execPath: '/opt/Blanc/blanc', readFile: procWith(['/opt/Blanc/blanc', '--type=renderer']),
    kill: () => { throw Object.assign(new Error('EPERM'), { code: 'EPERM' }); },
  });
  assert.equal(how, 'crash-requested');
  assert.deepEqual(t.calls, ['crash']);
});

test('off Linux the crash request is used and /proc is never consulted', () => {
  for (const platform of ['darwin', 'win32']) {
    const t = rendererTarget(4242);
    const how = terminateRenderer(t.contents, { platform, kill: t.kill, readFile: () => { throw new Error('must not read'); } });
    assert.equal(how, 'crash-requested');
    assert.deepEqual(t.calls, ['crash'], platform);
  }
});
