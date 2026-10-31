'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');

test('Chromium harness CDP arguments remain data even with executable-looking strings', async () => {
  const { callFunction } = await import('../../experiments/chromium-extension-spike/cdp-function.mjs');
  const calls = [];
  const client = { async send(method, params) {
    calls.push({ method, params });
    if (method === 'Runtime.evaluate') return { result: { objectId: 'fixture-global' } };
    if (method === 'Runtime.callFunctionOn') {
      const fn = vm.runInNewContext(`(${params.functionDeclaration})`);
      return { result: { value: await fn(...params.arguments.map(arg => arg.value)) } };
    }
    return {};
  } };
  const hostile = '\"); globalThis.compromised = true; // </script><img src=x onerror=alert(1)>';
  const values = [hostile, { nested: [hostile, 1, null] }];
  assert.deepEqual(JSON.parse(JSON.stringify(await callFunction(client, function(a, b) { return [a, b]; }, values))), values);
  const invocation = calls.find(call => call.method === 'Runtime.callFunctionOn').params;
  assert.equal(invocation.functionDeclaration.includes(hostile), false);
  assert.deepEqual(invocation.arguments, values.map(value => ({ value })));
  assert.equal(invocation.userGesture, false);
  assert.equal(calls.at(-1).method, 'Runtime.releaseObject');
});

test('Chromium harness CDP exceptions still release the global reference', async () => {
  const { callFunction } = await import('../../experiments/chromium-extension-spike/cdp-function.mjs');
  const calls = [];
  const client = { async send(method) {
    calls.push(method);
    if (method === 'Runtime.evaluate') return { result: { objectId: 'global' } };
    if (method === 'Runtime.callFunctionOn') return { exceptionDetails: { text: 'rejected' } };
    return {};
  } };
  await assert.rejects(callFunction(client, function() {}), /rejected/);
  assert.equal(calls.at(-1), 'Runtime.releaseObject');
});

test('HTTP desktop fixture does not reflect request path or blanklink payload into markup', async (t) => {
  const server = await require('../desktop/support/fixtures-server').start();
  t.after(server.close);
  const payload = '<img src=x onerror=globalThis.fixtureAttack=1>';
  const response = await fetch(`${server.base}/site/${encodeURIComponent(payload)}?blanklink=${encodeURIComponent(payload)}`);
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.equal(html.includes(payload), false);
  assert.equal(html.includes(encodeURIComponent(payload)), false);
  assert.match(html, /textContent/);
  assert.match(html, /encodeURIComponent\(name\)/);
});
