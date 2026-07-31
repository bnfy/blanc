const assert = require('node:assert/strict');
const test = require('node:test');

const {
  validRuntimeId,
  createWindowRuntimeRegistry,
} = require('../../src/main/window-runtime-registry');

test('runtime ids are bounded portable workspace identifiers', () => {
  assert.equal(validRuntimeId('primary'), true);
  assert.equal(validRuntimeId('window_2'), true);
  assert.equal(validRuntimeId('window/2'), false);
  assert.equal(validRuntimeId(''), false);
});

test('each runtime owns isolated overlay and utility-sheet state', () => {
  const registry = createWindowRuntimeRegistry();
  const one = registry.register({ id: 'one', browserWindow: {} });
  const two = registry.register({ id: 'two', browserWindow: {} });
  const overlay = {};
  const sheet = {};

  registry.setOverlay('one', { view: overlay, mode: 'panel', prefill: 'hello' });
  registry.setUtilitySheet('two', { view: sheet, url: 'blanc://settings/' });

  assert.equal(one.overlayView, overlay);
  assert.equal(one.overlayMode, 'panel');
  assert.equal(one.utilitySheetView, null);
  assert.equal(two.overlayView, null);
  assert.equal(two.utilitySheetView, sheet);
  assert.equal(two.utilitySheetUrl, 'blanc://settings/');
});

test('tab ownership is exclusive and active identity is local to its runtime', () => {
  const registry = createWindowRuntimeRegistry();
  const one = registry.register({ id: 'one', browserWindow: {} });
  registry.register({ id: 'two', browserWindow: {} });

  registry.claimTab('one', 'tab-a');
  registry.setActiveTab('one', 'tab-a');

  assert.equal(one.activeTabId, 'tab-a');
  assert.equal(registry.ownerForTab('tab-a'), 'one');
  assert.throws(() => registry.claimTab('two', 'tab-a'), /already belongs/);
  assert.throws(() => registry.setActiveTab('two', 'tab-a'), /must belong/);

  assert.equal(registry.releaseTab('tab-a'), 'one');
  assert.equal(one.activeTabId, null);
  assert.equal(registry.ownerForTab('tab-a'), null);
});

test('detaching native chrome preserves local tabs for a replacement window', () => {
  const registry = createWindowRuntimeRegistry();
  const firstWindow = {};
  const runtime = registry.register({ id: 'primary', browserWindow: firstWindow });
  registry.claimTab('primary', 'tab-a');
  registry.setActiveTab('primary', 'tab-a');
  registry.setOverlay('primary', { view: {}, mode: 'panel', prefill: 'query' });
  registry.setUtilitySheet('primary', { view: {}, url: 'blanc://history/' });

  registry.detach('primary', firstWindow);
  assert.equal(runtime.browserWindow, null);
  assert.equal(runtime.overlayView, null);
  assert.equal(runtime.utilitySheetView, null);
  assert.equal(runtime.activeTabId, 'tab-a');

  const replacement = {};
  assert.equal(registry.register({ id: 'primary', browserWindow: replacement }), runtime);
  assert.equal(runtime.browserWindow, replacement);
  assert.equal(registry.ownerForTab('tab-a'), 'primary');
});

test('a runtime cannot be attached to a second live BrowserWindow', () => {
  const registry = createWindowRuntimeRegistry();
  registry.register({ id: 'primary', browserWindow: {} });
  assert.throws(
    () => registry.register({ id: 'primary', browserWindow: {} }),
    /already attached/
  );
});
