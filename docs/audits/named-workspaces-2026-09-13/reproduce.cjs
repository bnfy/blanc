// Audit probes: assert the observed defects, not desired future behavior.
// No Electron/UI launch; all persistence uses a disposable temporary directory.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../../..');
const main = fs.readFileSync(path.join(root, 'src/main/main.js'), 'utf8');
const overlay = fs.readFileSync(path.join(root, 'src/renderer/overlay.js'), 'utf8');
const model = require(path.join(root, 'src/main/workspaces-model'));
function lift(source, name, indent = '') {
  const start = source.indexOf(`${indent}function ${name}(`);
  assert.ok(start >= 0, name);
  const end = source.indexOf(`\n${indent}}`, start);
  assert.ok(end > start, name);
  return source.slice(start, end + indent.length + 2);
}
function run(source, name, context, args = [], indent = '') {
  vm.runInNewContext(`${lift(source, name, indent)}\nthis.fn = ${name};`, context);
  return context.fn(...args);
}
const record = { id: 'work', name: 'Work', profileId: 'default', urls: ['https://example.test/'], groups: [] };
const empty = { urls: [], activeIndex: 0, groups: [], groupIds: [], pinned: [], meta: [] };

// A focus/noop operation is incorrectly blocked before binding resolution.
for (const binding of ['other', 'here']) {
  const runtime = { id: 'here', workspaceId: binding === 'here' ? 'work' : null };
  const context = {
    withWindowRuntime: (_, fn) => fn(), namedWorkspaces: { get: () => record },
    scratchGuardResult: () => ({ ok: false, error: 'unsaved-scratch', tabCount: 1, privateCount: 1 }),
    deriveWorkspaceBindings: () => ({ work: binding }), resolveOpen: model.resolveOpen,
  };
  const result = run(main, 'switchWindowToWorkspace', context, [runtime, 'work']);
  assert.equal(result.error, 'unsaved-scratch');
  assert.equal(model.resolveOpen({ work: binding }, 'work', 'here').action, binding === 'here' ? 'noop' : 'focus');
}
console.log('CONFIRMED: focus and noop both hit the destructive-switch guard.');

assert.equal(model.scratchSwitchGuardResult({ bound: true, tabs: [{ url: 'https://example.test/draft', private: false }], blankNewTabUrl: 'blanc://newtab/' }), null);
assert.match(lift(main, 'applyWorkspaceToWindow'), /closeTab\(id, \{ record: false, selectReplacement: false \}\)/);
assert.match(lift(main, 'closeTab'), /wc\.close\(\)/);
console.log('CONFIRMED code path: bound ordinary pages pass the guard and close without recovery or waitForBeforeUnload.');

let saved = false;
run(main, 'autosaveWorkspaceBindings', {
  forEachWindowRuntime: (fn) => fn({ workspaceId: 'work' }),
  namedWorkspaces: { get: () => record, saveCapture: () => { saved = true; } },
  workspaceCapture: () => empty,
});
assert.equal(saved, false);
console.log('CONFIRMED: an empty persistable capture leaves the previous workspace URLs saved.');

let rendered;
const renderContext = {
  pointerHeld: false, focusedRowAnchor: () => null, addressInput: { value: '/settings' },
  selectedResultIndex: -1, visibleResults: [], visibleCommands: [], siteInfoOpen: false,
  inputTouched: true, COMMANDS: [{ cmd: '/settings' }], commandRow: () => 'command',
  islandList: { replaceChildren: (...rows) => { rendered = rows; } },
  pendingScratchGuard: { tabCount: 1 }, scratchGuardRow: () => 'guard',
  focusPendingEditor: () => {}, islandHint: {}, activeTab: () => null,
  state: { groups: [] }, modKey: 'Cmd',
};
run(overlay, 'renderList', renderContext, [], '  ');
assert.deepEqual(rendered, ['command']);
console.log('CONFIRMED: a pending switch warning is hidden while slash-command text remains in the address field.');

const layoutContext = {
  footerWorkspace: { getBoundingClientRect: () => ({ top: 350, bottom: 378, right: 600 }) },
  workspaceSwitcher: { style: {}, offsetHeight: 850, offsetWidth: 240 },
  window: { innerHeight: 600, innerWidth: 900 },
};
run(overlay, 'layoutWorkspaceSwitcher', layoutContext, [], '  ');
assert.equal(layoutContext.workspaceSwitcher.style.top, '8px');
assert.ok(8 + layoutContext.workspaceSwitcher.offsetHeight > 600);
console.log('CONFIRMED geometry: an 850px menu in a 600px viewport extends 258px below the viewport. CSS provides no vertical scroll bound.');

let attemptedName;
const editContext = {
  workspaceEditValue: 'Existing', pendingRenameWorkspaceId: 'work', workspaceSwitcherOpen: false,
  window: { browserAPI: { renameWorkspace: (_, name) => { attemptedName = name; return { ok: false, error: 'duplicate-name' }; } } },
  runWorkspaceMutation: () => {},
};
run(overlay, 'commitWorkspaceRename', editContext, ['work'], '  ');
assert.equal(attemptedName, 'Existing');
assert.equal(editContext.workspaceEditValue, '');
assert.equal(editContext.pendingRenameWorkspaceId, null);
console.log('CONFIRMED: rename discards its editor and value before success is known; create and save-as use the same pattern.');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-workspace-audit-'));
let userData = path.join(tmp, 'future');
fs.mkdirSync(userData);
const futureFile = path.join(userData, 'workspaces.json');
fs.writeFileSync(futureFile, JSON.stringify({ version: 99, workspaces: [{ ...record, futureField: 'keep me' }] }));
const electronId = require.resolve(path.join(root, 'node_modules/electron'));
require.cache[electronId] = { id: electronId, filename: electronId, loaded: true, exports: { app: { getPath: () => userData, on: () => {} } } };
const storeId = require.resolve(path.join(root, 'src/main/store'));
const wsId = require.resolve(path.join(root, 'src/main/workspaces'));
async function persistenceProbes() {
  try {
    const workspaces = require(wsId);
    workspaces.list();
    await new Promise((resolve) => setTimeout(resolve, 350));
    const repaired = JSON.parse(fs.readFileSync(futureFile, 'utf8'));
    assert.equal(repaired.version, 1);
    assert.equal(repaired.workspaces[0].futureField, undefined);
    console.log('CONFIRMED: merely listing a version-99 file rewrites it as version 1 and drops unknown record fields.');

    delete require.cache[wsId];
    delete require.cache[storeId];
    userData = path.join(tmp, 'not-a-directory');
    fs.writeFileSync(userData, 'simulate an unwritable destination without changing permissions');
    const brokenStore = require(wsId);
    const result = brokenStore.create({ name: 'Reported saved', capture: empty });
    assert.equal(result.ok, true);
    await new Promise((resolve) => setTimeout(resolve, 350));
    assert.equal(fs.existsSync(path.join(userData, 'workspaces.json')), false);
    assert.equal(brokenStore.list().length, 1);
    console.log('CONFIRMED: create returns ok:true and retains the record in memory after the disk write fails.');
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}
persistenceProbes().catch((error) => { console.error(error); process.exitCode = 1; });
