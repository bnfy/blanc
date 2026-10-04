const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

// build.mjs is ESM and self-executes only when run directly; the entry guard
// lets this CommonJS test import the checkers without triggering a build.
let api;
test.before(async () => {
  api = await import('../../browser-api/build.mjs');
});

const PRELOAD = fs.readFileSync(path.join(__dirname, '../../src/main/preload.js'), 'utf8');

function mutate(from, to) {
  assert.ok(PRELOAD.includes(from), `fixture text missing from preload.js: ${from}`);
  return PRELOAD.replace(from, to);
}

test('the shipped preload, main and renderers match the contract', () => {
  assert.deepEqual(api.check(), []);
});

test('the contract validates and lists every member once', () => {
  const contract = api.loadContract();
  assert.deepEqual(api.validateContract(contract), []);
  assert.equal(new Set(contract.members.map((m) => m.name)).size, contract.members.length);
});

test('a renamed channel is reported', () => {
  const problems = api.checkPreload(api.loadContract(), mutate("'tabs:switch'", "'tabs:activate'"));
  assert.ok(problems.some((p) => p.includes('switchTab') && p.includes("'tabs:activate'")), problems.join('\n'));
});

test('a reshaped payload is reported', () => {
  const problems = api.checkPreload(api.loadContract(),
    mutate("ipcRenderer.send('permissions:respond', { id, allow })", "ipcRenderer.send('permissions:respond', id, allow)"));
  assert.ok(problems.some((p) => p.includes('respondPermission') && p.includes('sends')), problems.join('\n'));
});

test('a dropped boolean coercion is reported', () => {
  const problems = api.checkPreload(api.loadContract(),
    mutate("ipcRenderer.send('chrome:workspace-switcher', !!open)", "ipcRenderer.send('chrome:workspace-switcher', open)"));
  assert.ok(problems.some((p) => p.includes('setWorkspaceSwitcherOpen')), problems.join('\n'));
});

test('a changed default argument is reported', () => {
  const problems = api.checkPreload(api.loadContract(), mutate('restart = false', 'restart = true'));
  assert.ok(problems.some((p) => p.includes('selectBlockingProvider (defaults)')), problems.join('\n'));
});

test('an extra trusted document is reported', () => {
  const problems = api.checkPreload(api.loadContract(),
    mutate("'blanc-chrome://permission/',", "'blanc-chrome://permission/',\n  'blanc-chrome://fill-status/',"));
  assert.ok(problems.some((p) => p.includes('untrusted document blanc-chrome://fill-status/')), problems.join('\n'));
});

test('a platform-gated member leaking to other platforms is reported', () => {
  const problems = api.checkPreload(api.loadContract(),
    mutate("const ONE_PASSWORD_AVAILABLE = process.platform === 'darwin';", 'const ONE_PASSWORD_AVAILABLE = true;'));
  assert.ok(problems.some((p) => p.startsWith('linux:') && p.includes('fillLoginFromOnePassword')), problems.join('\n'));
  assert.ok(problems.some((p) => p.startsWith('win32:') && p.includes('fillLoginFromOnePassword')), problems.join('\n'));
});

test('an event that leaks its listener is reported', () => {
  const problems = api.checkPreload(api.loadContract(),
    mutate("return () => ipcRenderer.removeListener('tabs:updated', listener);", 'return () => {};'));
  assert.ok(problems.some((p) => p.includes('onTabsUpdated') && p.includes('unsubscribe')), problems.join('\n'));
});

test('a member missing from the contract is reported', () => {
  const contract = api.loadContract();
  contract.members = contract.members.filter((m) => m.name !== 'closeWindow');
  const problems = api.checkPreload(contract);
  assert.ok(problems.some((p) => p.includes('"closeWindow", which is not in the contract')), problems.join('\n'));
});

test('an unknown type in the contract is reported', () => {
  const contract = api.loadContract();
  contract.members.find((m) => m.name === 'closeTab').params[0].type = 'TabIdentifier';
  assert.ok(api.validateContract(contract).some((p) => p.includes('"TabIdentifier"')));
});

test('a channel removed from main is reported', () => {
  const contract = api.loadContract();
  contract.members.find((m) => m.name === 'closeTab').channel = 'tabs:no-such-channel';
  assert.ok(api.checkMain(contract).some((p) => p.includes('tabs:no-such-channel')));
});

// ---- tabs:updated payload shapes ----

const MAIN = fs.readFileSync(path.join(__dirname, '../../src/main/main.js'), 'utf8');

function mutateMain(from, to) {
  assert.ok(MAIN.includes(from), `fixture text missing from main.js: ${from}`);
  return MAIN.replace(from, to);
}

test('every payload fixture validates against the contract', () => {
  assert.deepEqual(api.checkPayloads(api.loadContract()), []);
});

test('a new field in the serializeTabs allowlist is reported', () => {
  const problems = api.checkMainPayloadKeys(api.loadContract(),
    mutateMain('        fillHint: tab.fillHint === true,\n', '        fillHint: tab.fillHint === true,\n        profileId: tab.profileId,\n'));
  assert.ok(problems.some((p) => p.includes('"profileId", which is not a field of TabEntry')), problems.join('\n'));
});

test('a field dropped from the tabs:updated payload is reported', () => {
  const problems = api.checkMainPayloadKeys(api.loadContract(),
    mutateMain('    adblockEnabled: settings.getSettings().adblockEnabled,\n    shieldPopover', '    shieldPopover'));
  assert.ok(problems.some((p) => p.includes('TabsUpdatedPayload.adblockEnabled is not produced')), problems.join('\n'));
});

test('a capture row field change is reported', () => {
  const problems = api.checkMainPayloadKeys(api.loadContract(),
    mutateMain("surfaceId: row.id, host: captureHostOf(row.url), kind: 'tab',", "surfaceId: row.id, host: captureHostOf(row.url), kind: 'tab', title: row.title,"));
  assert.ok(problems.some((p) => p.includes('"title", which is not a field of CaptureRow')), problems.join('\n'));
});

test('an unrecognized spread in the payload is reported', () => {
  const problems = api.checkMainPayloadKeys(api.loadContract(),
    mutateMain('    ...widthMetrics,\n  };', '    ...widthMetrics,\n    ...extraState(),\n  };'));
  assert.ok(problems.some((p) => p.includes('unrecognized spread "...extraState()"')), problems.join('\n'));
});

test('the validator rejects wrong values, missing fields and extra fields', () => {
  const contract = api.loadContract();
  assert.deepEqual(api.validateValue({ mode: 'count', count: 1, title: 'x' }, 'ShieldChip', contract), []);
  assert.ok(api.validateValue({ mode: 'loud', count: 1, title: 'x' }, 'ShieldChip', contract).length > 0);
  assert.ok(api.validateValue({ mode: 'count', title: 'x' }, 'ShieldChip', contract).some((p) => p.includes('count: missing')));
  assert.ok(api.validateValue({ mode: 'count', count: 1, title: 'x', extra: true }, 'ShieldChip', contract).some((p) => p.includes('not a field')));
  assert.ok(api.validateValue([{ id: 'g', name: 'n' }], 'TabGroup[]', contract).some((p) => p.includes('collapsed: missing')));
  assert.deepEqual(api.validateValue(null, 'ConnectionState | null', contract), []);
  assert.ok(api.validateValue('ftp', 'ConnectionState | null', contract).length > 0);
});

test('a contract enum narrower than the helpers produce is reported', () => {
  const contract = api.loadContract();
  contract.types.SiteInfo.fields.state.type = "'neutral' | 'secure' | 'local' | 'insecure' | 'internal'";
  assert.ok(api.checkPayloads(contract).some((p) => p.includes('state') && p.includes('certificate-error')));
});
