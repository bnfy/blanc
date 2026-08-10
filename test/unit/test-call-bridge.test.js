'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { installTestCallBridge } = require('../../src/main/test-call-bridge');
const { callTestHook } = require('../desktop/support/test-hook-call');

test('a repeated call id returns the original result without repeating its mutation', async () => {
  let mutations = 0;
  const target = {};
  installTestCallBridge(target, {
    mutate(value) { mutations += 1; return { value, mutations }; },
  });

  const first = target.__blancCall(1, 'mutate', ['kept']);
  const retry = target.__blancCall(1, 'mutate', ['ignored']);
  assert.strictEqual(retry, first, 'the bridge must retain the exact in-flight promise');
  assert.deepEqual(await retry, { value: 'kept', mutations: 1 });
  assert.equal(mutations, 1);
});

test('a lost Playwright reply retries the same id and runs a mutating hook once', async () => {
  let mutations = 0;
  let inspectorAttempts = 0;
  const target = {};
  installTestCallBridge(target, {
    newTab() { mutations += 1; return `tab-${mutations}`; },
  });
  const electronApp = {
    async evaluate(_evaluator, request) {
      inspectorAttempts += 1;
      const result = await target.__blancCall(request.id, request.method, request.args);
      if (inspectorAttempts === 1) {
        throw new Error('Execution context was destroyed, most likely because of a navigation.');
      }
      return result;
    },
  };

  assert.equal(await callTestHook(electronApp, 'newTab'), 'tab-1');
  assert.equal(inspectorAttempts, 2);
  assert.equal(mutations, 1, 'retrying the reply must not create a second tab');
});

test('permanent inspector failures are not retried', async () => {
  let attempts = 0;
  const electronApp = {
    async evaluate() { attempts += 1; throw new Error('candidate process exited'); },
  };
  await assert.rejects(callTestHook(electronApp, 'state'), /candidate process exited/);
  assert.equal(attempts, 1);
});
