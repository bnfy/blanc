'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../../src/main/ublock-provider.js'), 'utf8');
function fixture({ warmUntil = 0 } = {}) {
  const pending = new Map(), timers = [], failures = [];
  const context = { phase: 'ready', sequence: 0, MAX_PENDING: 256, DEADLINE_MS: 2000, OPERATION_DEADLINE_MS: 10000,
    WARMUP_DEADLINE_MS: 10000, warmUntil,
    pending, send() {}, error: null,
    setTimeout: (callback, delay) => { const timer = { callback, delay }; timers.push(timer); return timer; },
    fail: code => { failures.push(code); for (const item of pending.values()) item.reject(new Error(code)); pending.clear(); },
  };
  const deadline = source.match(/function decisionDeadline\(\) \{[\s\S]*?\n  \}/)?.[0];
  const ask = source.match(/function ask\(message\) \{[\s\S]*?\n  \}/)?.[0];
  assert.ok(deadline && ask, 'the provider still defines decisionDeadline() and ask()');
  vm.runInNewContext(deadline + '\n' + ask + '\nthis.ask = ask;', context);
  return { ...context, timers, failures };
}
test('each network decision retains the two-second fail-closed boundary', async () => {
  for (const name of ['onBeforeRequest', 'onBeforeSendHeaders', 'onHeadersReceived']) {
    const f = fixture(); const result = f.ask({ kind: 'request', name });
    const rejected = assert.rejects(result, /ubo-decision-timeout/);
    assert.equal(f.timers[0].delay, 2000); f.timers[0].callback(); await rejected;
    assert.deepEqual(f.failures, ['ubo-decision-timeout']); assert.equal(f.pending.size, 0);
  }
});
test('a slow site query or completion observer expires without taking filtering offline', async () => {
  for (const message of [{ kind: 'site-state', tabId: 1 }, { kind: 'request', name: 'onCompleted' }]) {
    const f = fixture(); let settled = false;
    const result = f.ask(message); result.then(() => { settled = true; }, () => { settled = true; });
    await Promise.resolve(); assert.equal(settled, false);
    assert.equal(f.timers[0].delay, 10000);
    const rejected = assert.rejects(result, /ubo-operation-timeout/);
    f.timers[0].callback(); await rejected;
    assert.deepEqual(f.failures, []); assert.equal(f.pending.size, 0);
  }
});


test('queue overflow rejects only excess work and existing decisions can still finish', async () => {
  const f = fixture();
  const decisions = Array.from({ length: 256 }, () => f.ask({ kind: 'request', name: 'onBeforeRequest' }));
  const first = [...f.pending.values()][0];
  await assert.rejects(f.ask({ kind: 'request', name: 'onBeforeRequest' }), /ubo-request-capacity/);
  assert.equal(f.pending.size, 256);
  assert.deepEqual(f.failures, []);
  f.pending.delete(1); first.resolve({ cancel: true });
  assert.deepEqual(await decisions[0], { cancel: true });
  const next = f.ask({ kind: 'request', name: 'onHeadersReceived' });
  assert.equal(f.pending.size, 256);
  for (const [id, item] of f.pending) { f.pending.delete(id); item.resolve({}); }
  await Promise.all([...decisions, next]);
  assert.deepEqual(f.failures, []);
});

test('a cold provider gets a longer decision window that still fails closed', async () => {
  const f = fixture({ warmUntil: Date.now() + 15000 });
  const result = f.ask({ kind: 'request', name: 'onBeforeRequest' });
  const rejected = assert.rejects(result, /ubo-decision-timeout/);
  assert.equal(f.timers[0].delay, 10000, 'first decisions after ready may take up to ten seconds');
  f.timers[0].callback(); await rejected;
  assert.deepEqual(f.failures, ['ubo-decision-timeout'], 'a missed warm-up decision still fails closed');
});

test('the warm-up window ends and decisions return to two seconds', async () => {
  const f = fixture({ warmUntil: Date.now() - 1 });
  const result = f.ask({ kind: 'request', name: 'onHeadersReceived' });
  const rejected = assert.rejects(result, /ubo-decision-timeout/);
  assert.equal(f.timers[0].delay, 2000);
  f.timers[0].callback(); await rejected;
});

test('the warm-up window opens each time the provider becomes ready', () => {
  assert.match(source, /const WARMUP_DEADLINE_MS = 10000;/);
  assert.match(source, /const WARMUP_WINDOW_MS = 15000;/);
  assert.match(source, /warmUntil = Date\.now\(\) \+ WARMUP_WINDOW_MS;\s*send\(\{ kind: 'enabled', value: enabled \}\);\s*state\('ready'\)/);
});
