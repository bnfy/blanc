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

// ---- event send sites ----

function sendSources(from, to, target = 'main.js') {
  const files = fs.readdirSync(path.join(__dirname, '../../src/main'))
    .filter((f) => f.endsWith('.js') && f !== 'preload.js' && f !== 'test-hook.js');
  return files.map((file) => {
    let text = fs.readFileSync(path.join(__dirname, '../../src/main', file), 'utf8');
    if (file === target && from) {
      assert.ok(text.includes(from), `fixture text missing from ${target}: ${from}`);
      text = text.replace(from, to);
    }
    return { file, text };
  });
}

test('every structured event payload matches its send sites', () => {
  assert.deepEqual(api.checkEventSends(api.loadContract(), sendSources()), []);
});

test('an extra field in an event payload literal is reported', () => {
  const problems = api.checkEventSends(api.loadContract(),
    sendSources("send('overlay:hide', { retract: retracts })", "send('overlay:hide', { retract: retracts, reason: 'x' })"));
  assert.ok(problems.some((p) => p.includes('"reason", which is not a field of OverlayHidePayload')), problems.join('\n'));
});

test('a required field missing from an event payload is reported', () => {
  const problems = api.checkEventSends(api.loadContract(),
    sendSources("    connected: rt().shieldAnchorCenter !== null,\n", ''));
  assert.ok(problems.some((p) => p.includes('ShieldAnchorUpdate.connected')), problems.join('\n'));
});

test('a payload built in a variable is resolved through its declaration', () => {
  const problems = api.checkEventSends(api.loadContract(),
    sendSources('const payload = { id: promptId, origin, permission, mediaTypes };', 'const payload = { id: promptId, origin, permission };'));
  assert.ok(problems.some((p) => p.includes('PermissionPromptPayload.mediaTypes')), problems.join('\n'));
});

test('an unreadable payload argument is reported', () => {
  const problems = api.checkEventSends(api.loadContract(),
    sendSources("send('chrome:page-tint', { id: tab.id, color });", "send('chrome:page-tint', tint[0]);"));
  assert.ok(problems.some((p) => p.includes('onPageTint') && p.includes('teach browser-api/build.mjs')), problems.join('\n'));
});

test('an unknown payloadCheck value is rejected', () => {
  const contract = api.loadContract();
  contract.members.find((m) => m.name === 'onFindResult').payloadCheck = 'trust-me';
  assert.ok(api.validateContract(contract).some((p) => p.includes('unknown payloadCheck')));
});

// ---- invoke results ----

test('every typed invoke result matches what its handler can return', () => {
  assert.deepEqual(api.checkInvokeResults(api.loadContract(), sendSources()), []);
});

test('a void handler that starts returning a value is reported', () => {
  const problems = api.checkInvokeResults(api.loadContract(),
    sendSources("chromeHandle('tabs:close', (_e, id) => closeTab(id));", "chromeHandle('tabs:close', (_e, id) => { closeTab(id); return id; });"));
  assert.ok(problems.some((p) => p.includes('closeTab result') && p.includes('returns a value')), problems.join('\n'));
});

test('a boolean handler that can resolve to undefined is reported', () => {
  const problems = api.checkInvokeResults(api.loadContract(),
    sendSources("chromeHandle('tabs:open-glance-picker', () => openGlancePicker());", "chromeHandle('tabs:open-glance-picker', () => { openGlancePicker(); });"));
  assert.ok(problems.some((p) => p.includes('openGlancePicker result') && p.includes('undefined')), problems.join('\n'));
});

test('a returned object that drifts from its type is reported', () => {
  const problems = api.checkInvokeResults(api.loadContract(),
    sendSources('    patronActive: settings.isPatronActive(),\n', '    patronActive: settings.isPatronActive(),\n    plan: settings.plan,\n'));
  assert.ok(problems.some((p) => p.includes('listWorkspaces result') && p.includes('WorkspacesPayload')), problems.join('\n'));
});

test('a typed result whose handler disappears is reported', () => {
  const contract = api.loadContract();
  contract.members.find((m) => m.name === 'closeTab').channel = 'tabs:gone';
  assert.ok(api.checkInvokeResults(contract, sendSources()).some((p) => p.includes("handler for 'tabs:gone' not found")));
});

test('an unknown resultCheck value is rejected', () => {
  const contract = api.loadContract();
  contract.members.find((m) => m.name === 'stop').resultCheck = 'trust-me';
  assert.ok(api.validateContract(contract).some((p) => p.includes('unknown resultCheck')));
});

test('a try block that returns on every path does not fall through, and one that can is reported', () => {
  const problems = api.checkInvokeResults(api.loadContract(),
    sendSources('      return response;\n    } finally {', '    } finally {'));
  assert.ok(problems.some((p) => p.includes('searchSuggestions result') && p.includes('undefined')), problems.join('\n'));
});

test('a returned literal outside its field\'s union is reported', () => {
  const problems = api.checkInvokeResults(api.loadContract(),
    sendSources("return { error: 'blocking-not-ready' };", "return { error: 'blocking-busy' };"));
  assert.ok(problems.some((p) => p.includes('allowAdsOnActiveSite result') && p.includes("'blocking-busy'")), problems.join('\n'));
});

test('a returned local is read through its object literal', () => {
  const problems = api.checkInvokeResults(api.loadContract(),
    sendSources('const response = { engine: engineId, label: engine.label, suggestions: [] };', 'const response = { engine: engineId, label: engine.label, suggestions: [], cached: false };'));
  assert.ok(problems.some((p) => p.includes('searchSuggestions result') && p.includes('cached')), problems.join('\n'));
});

test('a forwarded module result is checked where it is built', () => {
  const extra = api.checkInvokeResults(api.loadContract(),
    sendSources("return { ok: false, reason: 'busy' };", "return { ok: false, reason: 'busy', retryAt: 0 };", 'credential-fill-controller.js'));
  assert.ok(extra.some((p) => p.includes('fillLoginFromOnePassword result (credential-fill-controller.js fill)') && p.includes('retryAt')), extra.join('\n'));
  const fallsThrough = api.checkInvokeResults(api.loadContract(),
    sendSources("      return { ok: false, reason: 'unexpected' };", '', 'credential-fill-controller.js'));
  assert.ok(fallsThrough.some((p) => p.includes('fillLoginFromOnePassword result') && p.includes('undefined')), fallsThrough.join('\n'));
});

test('list and command fixtures reject a contract narrower than the code', () => {
  for (const [type, field, narrowed, label] of [
    ['HistoryEntry', 'favicon', 'string', 'listHistory()'],
    ['FavoriteItem', 'folder', 'string', 'listBookmarks()'],
    ['RemoteTab', 'groupId', 'string', 'remote devices'],
    ['BlockAdsResult', 'action', "'toggle'", 'resolveBlockAdsCommand'],
  ]) {
    const contract = api.loadContract();
    contract.types[type].fields[field].type = narrowed;
    assert.ok(api.checkPayloads(contract).some((p) => p.includes(label) && p.includes(field)), `${type}.${field}`);
  }
});

test('the list fixtures leave the module cache as they found it', () => {
  const store = require.resolve('../../src/main/store.js');
  const history = require.resolve('../../src/main/history.js');
  assert.ok(api.listFixtures().length > 0);
  assert.equal(require.cache[store], undefined);
  assert.equal(require.cache[history], undefined);
});

test('SearchEngineId must match the settings schema', () => {
  const contract = api.loadContract();
  assert.deepEqual(api.checkSearchEngines(contract), []);
  contract.types.SearchEngineId.ts = "'duckduckgo' | 'google' | 'bing'";
  assert.ok(api.checkSearchEngines(contract).some((p) => p.includes("'brave'")));
});

test('the validator checks true and false literal types', () => {
  const contract = api.loadContract();
  assert.deepEqual(api.validateValue({ ok: true, filledUser: true, filledPass: false }, 'FillLoginSuccess | FillLoginFailure', contract), []);
  assert.ok(api.validateValue({ ok: true, reason: 'busy' }, 'FillLoginSuccess | FillLoginFailure', contract).length > 0);
});

// ---- workspace action results ----

test('workspace error, reason and action literals are all in the contract', () => {
  assert.deepEqual(api.checkWorkspaceCodes(api.loadContract(), sendSources()), []);
});

test('a new workspace error code in main.js is reported', () => {
  const problems = api.checkWorkspaceCodes(api.loadContract(),
    sendSources("return { ok: false, error: 'not-patron' };", "return { ok: false, error: 'needs-patron' };"));
  assert.ok(problems.some((p) => p.includes("error 'needs-patron'")), problems.join('\n'));
});

test('a new protection reason is reported', () => {
  const problems = api.checkWorkspaceCodes(api.loadContract(),
    sendSources("return { blocked: true, reason: 'active-page' };", "return { blocked: true, reason: 'signing-in' };"));
  assert.ok(problems.some((p) => p.includes("reason 'signing-in'")), problems.join('\n'));
});

test('a workspace result spread that drifts from its type is reported', () => {
  const problems = api.checkInvokeResults(api.loadContract(),
    sendSources('    patronActive: settings.isPatronActive(),\n', '    patronActive: settings.isPatronActive(),\n    plan: settings.plan,\n'));
  assert.ok(problems.some((p) => p.includes('renameWorkspace result') && p.includes('plan')), problems.join('\n'));
});

test('a handler-table workspace action is resolved and checked', () => {
  const problems = api.checkInvokeResults(api.loadContract(),
    sendSources("      return { ok: true, ...workspacesProjection() };\n    });\n  }", "      return { ok: true, moved: true, ...workspacesProjection() };\n    });\n  }"));
  assert.ok(problems.some((p) => p.includes('moveWorkspace result') && p.includes('moved')), problems.join('\n'));
});

test('controller fixtures reject an error code the contract does not list', () => {
  const contract = api.loadContract();
  contract.types.WorkspaceErrorCode.ts = contract.types.WorkspaceErrorCode.ts.replace("'busy' | ", '');
  assert.ok(api.checkPayloads(contract).some((p) => p.includes('controller open (busy)') && p.includes('error')));
});
