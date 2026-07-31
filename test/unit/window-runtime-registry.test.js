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

test('a runtime keeps its local profile identity across a native re-attach', () => {
  const registry = createWindowRuntimeRegistry();
  const first = {};
  const runtime = registry.register({ id: 'one', profileId: 'work', browserWindow: first });

  registry.detach('one', first);
  registry.register({ id: 'one', profileId: 'work', browserWindow: {} });

  assert.equal(runtime.profileId, 'work');
  assert.throws(
    () => registry.register({ id: 'one', profileId: 'personal', browserWindow: {} }),
    /profile cannot change/
  );
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

test('tab order and group state belong to the runtime, not the registry', () => {
  const registry = createWindowRuntimeRegistry();
  const one = registry.register({ id: 'one', browserWindow: {} });
  const two = registry.register({ id: 'two', browserWindow: {} });

  one.tabOrder.push('tab-a');
  one.groups.push({ id: 'work', name: 'work', collapsed: false });

  assert.deepEqual(two.tabOrder, []);
  assert.deepEqual(two.groups, []);
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

test('chrome surfaces resolve only to their owning runtime', () => {
  const registry = createWindowRuntimeRegistry();
  const chromeOne = {};
  const chromeTwo = {};
  const overlayOne = { webContents: {} };
  const sheetTwo = { webContents: {} };
  const one = registry.register({ id: 'one', browserWindow: { webContents: chromeOne } });
  const two = registry.register({ id: 'two', browserWindow: { webContents: chromeTwo } });

  registry.setOverlay('one', { view: overlayOne });
  registry.setUtilitySheet('two', { view: sheetTwo });

  assert.equal(registry.getByBrowserWindow(one.browserWindow), one);
  assert.equal(registry.getByChromeWebContents(chromeOne), one);
  assert.equal(registry.getByChromeWebContents(overlayOne.webContents), one);
  assert.equal(registry.getByChromeWebContents(chromeTwo), two);
  assert.equal(registry.getByChromeWebContents(sheetTwo.webContents), two);
  assert.equal(registry.getByChromeWebContents({}), null);
});

test('detaching a window removes its native ownership lookup', () => {
  const registry = createWindowRuntimeRegistry();
  const browserWindow = { webContents: {} };
  registry.register({ id: 'one', browserWindow });

  registry.detach('one', browserWindow);

  assert.equal(registry.getByBrowserWindow(browserWindow), null);
  assert.equal(registry.getByChromeWebContents(browserWindow.webContents), null);
});

test('discarding a secondary runtime removes its ownership and registry record', () => {
  const registry = createWindowRuntimeRegistry();
  const browserWindow = { webContents: {} };
  registry.register({ id: 'secondary', browserWindow });
  registry.claimTab('secondary', 'tab-a');

  registry.discard('secondary', browserWindow);

  assert.equal(registry.get('secondary'), null);
  assert.equal(registry.ownerForTab('tab-a'), null);
  assert.deepEqual(registry.all(), []);
});
