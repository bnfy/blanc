'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const recovery = require('../../src/main/ublock-recovery');

test('the module stays pure', () => {
  const source = fs.readFileSync(path.join(__dirname, '../../src/main/ublock-recovery.js'), 'utf8');
  assert(!/require\(['"]electron['"]\)/.test(source));
});

test('only transient runtime failures recover automatically', () => {
  for (const code of ['ubo-decision-timeout', 'ubo-background-crashed', 'ubo-background-lost', 'ubo-background-disconnected',
    'ubo-background-unavailable', 'ubo-bridge-crashed', 'ubo-css-crashed', 'ubo-css-timeout']) assert(recovery.RECOVERABLE.has(code), code);
  for (const code of ['ubo-background-unsandboxed', 'ubo-background-node', 'ubo-response-invalid', 'ubo-redirect-invalid',
    'ubo-css-target-invalid', 'ubo-css-capacity', 'ubo-host-capacity', 'ubo-storage-failed', 'ubo-decision-failed',
    'ubo-css-failed', 'ubo-startup-timeout', 'ubo-initialization-failed']) assert(!recovery.RECOVERABLE.has(code), code);
  // Startup codes continue an episode only when an automatic attempt raised them.
  for (const code of ['ubo-startup-timeout', 'ubo-initialization-failed', 'ubo-decision-timeout']) assert(recovery.ATTEMPT_RECOVERABLE.has(code), code);
  assert(!recovery.ATTEMPT_RECOVERABLE.has('ubo-background-node'));
});

test('the budget allows three attempts per rolling window with growing delays', () => {
  let now = 1000;
  const budget = recovery.createRecoveryBudget({ now: () => now });
  assert.deepEqual(budget.take(), { allowed: true, attempt: 1, delayMs: 0 });
  now += 1000;
  assert.deepEqual(budget.take(), { allowed: true, attempt: 2, delayMs: 2000 });
  now += 1000;
  assert.deepEqual(budget.take(), { allowed: true, attempt: 3, delayMs: 10000 });
  assert.deepEqual(budget.take(), { allowed: false });
  now = 1000 + 600000 - 1;
  assert.deepEqual(budget.take(), { allowed: false }, 'still inside the 10-minute window');
  now += 1;
  assert.deepEqual(budget.take(), { allowed: true, attempt: 3, delayMs: 10000 }, 'the oldest attempt aged out');
  budget.exhaust();
  assert.deepEqual(budget.take(), { allowed: false });
});

test('constants match the approved spec', () => {
  assert.equal(recovery.RECOVERY_DEADLINE_MS, 30000);
  assert.equal(recovery.HOLD_CAPACITY, 512);
  assert.equal(recovery.DRAIN_RESERVE, 32);
  assert.equal(recovery.OUTAGE_CLAIM_MS, 10000);
  assert.equal(recovery.MAX_OUTAGE_TOKENS, 32);
});

test('a reload target exists only for the error page carrying that exact token', () => {
  const page = 'https://example.org/a?b=1';
  const error = token => `blanc://error/?${new URLSearchParams({ url: page, code: '-20', desc: 'ERR_BLOCKED_BY_CLIENT', outage: token })}`;
  assert.equal(recovery.outageReloadTarget(error('abc'), 'abc'), page);
  assert.equal(recovery.outageReloadTarget(error('abc'), 'other'), null);
  assert.equal(recovery.outageReloadTarget(`blanc://error/?${new URLSearchParams({ url: page, code: '-20' })}`, 'abc'), null);
  assert.equal(recovery.outageReloadTarget(`blanc://error/?${new URLSearchParams({ url: page, code: '-105', outage: 'abc' })}`, 'abc'), null);
  assert.equal(recovery.outageReloadTarget(page, 'abc'), null);
  assert.equal(recovery.outageReloadTarget(`blanc://error/?${new URLSearchParams({ url: 'javascript:alert(1)', code: '-20', outage: 'abc' })}`, 'abc'), null);
  assert.equal(recovery.outageReloadTarget(error(''), ''), null);
});
