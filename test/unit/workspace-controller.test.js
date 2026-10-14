'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createWorkspaceController } = require('../../src/main/workspace-controller');
const { transferSession, undoRebindTarget } = require('../../src/main/workspace-residency');
const registry = require('../../src/main/window-runtime-registry');
function harness(overrides = {}) {
  const calls = [];
  const runtime = { id: 'window-a', profileId: 'default' };
  const adapter = {
    randomId: () => 'random', get: (_r, id) => ({ id }), owner: () => null,
    protection: () => ({ tabCount: 0 }), fingerprint: () => 'stable',
    checkpoint: () => { calls.push('checkpoint'); return { ok: true }; },
    stage: () => { calls.push('stage'); return {
      commit: () => { calls.push('commit'); return { ok: true }; },
      finish: () => calls.push('finish'), rollback: () => calls.push('rollback'),
    }; },
    focus: () => { calls.push('focus'); return { ok: true, action: 'focus' }; },
    openElsewhere: () => { calls.push('new-window'); return { ok: true }; },
    create: () => { calls.push('create'); return { ok: true, workspace: { id: 'new' } }; },
    ...overrides,
  };
  return { runtime, calls, adapter, controller: createWorkspaceController(adapter) };
}
test('same workspace with private tabs is a no-op before protection/save', () => {
  const h = harness(); h.adapter.owner = () => h.runtime;
  h.adapter.protection = () => { throw Error('must not inspect'); };
  assert.deepEqual(h.controller.open(h.runtime, 'target'), { ok: true, action: 'noop' });
  assert.deepEqual(h.calls, []);
});
test('a holder in another window is focused before protection/checkpoint', () => {
  const h = harness({ owner: () => ({ id: 'other' }), protection: () => { throw Error('not reached'); } });
  assert.equal(h.controller.open(h.runtime, 'target').ok, true); assert.deepEqual(h.calls, ['focus']);
});
test('private decision is single-use, target-bound and invalidated by page changes; force is ignored', () => {
  const h = harness({ protection: () => ({ tabCount: 1, privateCount: 1 }) });
  const guard = h.controller.open(h.runtime, 'a', { force: true });
  assert.equal(guard.error, 'unsaved-scratch'); assert.deepEqual(h.calls, []);
  assert.equal(h.controller.open(h.runtime, 'a', { decision: guard.decision }).ok, true);
  assert.equal(h.controller.open(h.runtime, 'a', { decision: guard.decision }).error, 'unsaved-scratch');
  const next = h.controller.open(h.runtime, 'a'); h.adapter.fingerprint = () => 'changed';
  assert.equal(h.controller.open(h.runtime, 'a', { decision: next.decision }).error, 'unsaved-scratch');
  assert.equal(h.controller.open(h.runtime, 'b', { decision: next.decision }).error, 'unsaved-scratch');
});
test('protected pages cannot be overridden but the target can open elsewhere', () => {
  const h = harness({ protection: () => ({ blocked: true, reason: 'capture' }) });
  assert.equal(h.controller.open(h.runtime, 'a', { force: true }).error, 'protected-pages');
  assert.equal(h.controller.open(h.runtime, 'a', { newWindow: true }).ok, true); assert.deepEqual(h.calls, ['new-window']);
});
test('failed outgoing durable save never stages or closes a page', () => {
  const h = harness({ checkpoint: () => ({ ok: false, error: 'storage-failed' }) });
  assert.equal(h.controller.open(h.runtime, 'a').error, 'storage-failed'); assert.deepEqual(h.calls, []);
});
test('failed commit rolls back staged state instead of finalizing page disposal', () => {
  const calls = [];
  const h = harness({ stage: () => ({ commit: () => ({ ok: false, error: 'storage-failed' }), rollback: () => calls.push('rollback'), finish: () => calls.push('finish') }) });
  assert.equal(h.controller.open(h.runtime, 'a').error, 'storage-failed'); assert.deepEqual(calls, ['rollback']);
});
test('a reentrant second window cannot acquire the same profile/workspace reservation', () => {
  const h = harness(); let raced;
  h.adapter.checkpoint = () => { raced = h.controller.open({ id: 'other', profileId: 'default' }, 'a'); return { ok: true }; };
  assert.equal(h.controller.open(h.runtime, 'a').ok, true); assert.equal(raced.error, 'busy');
});
test('create guard occurs before writing, and creation consults no entitlement', () => {
  const h = harness({ protection: () => ({ tabCount: 2, privateCount: 0 }), canCreate: () => false });
  assert.equal(h.controller.create(h.runtime, 'New').error, 'unsaved-scratch'); assert.deepEqual(h.calls, []);
  assert.equal(h.controller.create(h.runtime, 'New', { newWindow: true }).ok, true);
  assert.deepEqual(h.calls, ['create', 'new-window']);
});
test('a created record is reported as saved when its activation commit fails', () => {
  const h = harness({
    stage: () => ({
      commit: () => ({ ok: false, error: 'storage-failed' }),
      rollback: () => h.calls.push('rollback'),
      finish: () => h.calls.push('finish'),
    }),
  });
  const result = h.controller.create(h.runtime, 'New');
  assert.deepEqual(result, {
    ok: false,
    error: 'saved-not-opened',
    cause: 'storage-failed',
    workspaceId: 'new',
  });
  assert.deepEqual(h.calls, ['create', 'checkpoint', 'rollback']);
});
test('transferring membership retains exact tab/view identity, groups and window-local history', () => {
  registry.resetForTests(); const source = registry.createRuntime({ id: 'a' }); const target = registry.createRuntime({ id: 'b' });
  const view = { draft: 'Keep this draft', storage: new Map([['draft', 'text']]) };
  const tab = { id: 't', view, runtimeId: 'a' }; const tabs = new Map([['t', tab]]);
  source.tabOrder = ['t']; source.workspaceId = 'work'; source.activeTabId = 't'; source.groups = [{ id: 'g' }]; source.closedEntries = ['closed-a']; target.closedEntries = ['closed-b'];
  registry.attachTab(source, 't'); transferSession(source, target, { tabs, registry });
  assert.equal(registry.runtimeForTab('t'), target); assert.equal(tabs.get('t').view, view);
  assert.deepEqual(target.groups, [{ id: 'g' }]); assert.deepEqual(target.closedEntries, ['closed-b']); assert.deepEqual(source.closedEntries, ['closed-a']);
  transferSession(target, source, { tabs, registry }); assert.equal(source.activeTabId, 't'); assert.equal(tab.view.draft, 'Keep this draft');
});
test('invalid membership is rejected before either runtime or valid ownership changes', () => {
  registry.resetForTests(); const source = registry.createRuntime({ id: 'source' }); const target = registry.createRuntime({ id: 'target' });
  const tab = { id: 'good', runtimeId: 'source' }; const tabs = new Map([['good', tab]]);
  source.tabOrder = ['good', 'missing']; source.workspaceId = 'work'; source.activeTabId = 'good'; source.groups = [{ id: 'g' }];
  registry.attachTab(source, 'good');
  assert.throws(() => transferSession(source, target, { tabs, registry }), /membership is invalid/);
  assert.deepEqual(source.tabOrder, ['good', 'missing']); assert.equal(source.workspaceId, 'work'); assert.equal(source.activeTabId, 'good');
  assert.deepEqual(source.groups, [{ id: 'g' }]); assert.deepEqual(target.tabOrder, []); assert.equal(target.workspaceId, null);
  assert.equal(tab.runtimeId, 'source'); assert.equal(registry.runtimeForTab('good'), source);
});
// Retention never blocks a switch any more: see workspace-room.test.js (D22).
test('cancel invalidates a previously issued private-close decision', () => {
  const h = harness({ protection: () => ({ tabCount: 1, privateCount: 1 }) }); const decision = h.controller.open(h.runtime, 'a');
  h.controller.cancel(h.runtime); assert.equal(h.controller.open(h.runtime, 'a', { decision: decision.decision }).error, 'unsaved-scratch'); assert.deepEqual(h.calls, []);
});
test('Undo rebinds only the window the delete unbound, and only while nothing else holds the space', () => {
  const runtime = (id, extra = {}) => ({ id, workspaceId: null, closing: false, resident: false, workspaceTransition: false, ...extra });
  const a = runtime('a'); const b = runtime('b');
  assert.equal(undoRebindTarget(['a'], [a, b], 'ws'), a);
  assert.equal(undoRebindTarget(['a'], [{ ...a, workspaceId: 'other' }, b], 'ws'), null, 'the window has joined another space');
  assert.equal(undoRebindTarget(['a'], [a, { ...b, workspaceId: 'ws' }], 'ws'), null, 'another window holds the space');
  assert.equal(undoRebindTarget(['a'], [{ ...a, closing: true }], 'ws'), null, 'the window is closing');
  assert.equal(undoRebindTarget(['a'], [{ ...a, resident: true }], 'ws'), null, 'hidden resident sets are never rebound');
  assert.equal(undoRebindTarget(['a'], [{ ...a, workspaceTransition: true }], 'ws'), null, 'mid-switch');
  assert.equal(undoRebindTarget(['gone'], [a, b], 'ws'), null, 'the window no longer exists');
  assert.equal(undoRebindTarget([], [a], 'ws'), null);
});
test('a created space is handed its chosen identity', () => {
  let seen = null;
  const h = harness({ create: (_r, name, options) => { seen = [name, options.color, options.symbol]; return { ok: true, workspace: { id: 'new' } }; } });
  assert.equal(h.controller.create(h.runtime, 'Side', { newWindow: true, color: '#6757a3', symbol: 'code' }).ok, true);
  assert.deepEqual(seen, ['Side', '#6757a3', 'code']);
});
