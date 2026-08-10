'use strict';

const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const test = require('node:test');
const {
  hasExclusiveRenderer,
  hasBeforeUnloadListener,
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
