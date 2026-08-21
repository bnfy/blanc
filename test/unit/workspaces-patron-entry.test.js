'use strict';

// Regression: the main process always owned the Named Workspaces entitlement
// check, but the overlay let non-Patrons enter a name before the write failed.
// Entry now stops on an actionable Patron row while existing workspaces remain
// lapse-safe. Main's duplicate check remains the security boundary.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '../..');
const overlaySource = fs.readFileSync(path.join(ROOT, 'src/renderer/overlay.js'), 'utf8');
const mainSource = fs.readFileSync(path.join(ROOT, 'src/main/main.js'), 'utf8');

const lift = (name) => {
  const re = new RegExp(`function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\n  \\}`);
  const found = overlaySource.match(re)?.[0];
  assert.ok(found, `${name} not found in overlay.js — update this test with it`);
  return found;
};

test('non-Patron create and save-as entry stop before either name editor opens', () => {
  for (const name of ['beginCreateWorkspace', 'beginSaveWorkspace']) {
    const calls = [];
    const sandbox = {
      guardWorkspaceCreationEntry: () => { calls.push('gate'); return true; },
      openWorkspaceSwitcher: () => calls.push('editor'),
      pendingCreateWorkspace: false,
      createWorkspaceValue: '',
      pendingSaveAsWorkspace: false,
      saveAsWorkspaceValue: '',
      pendingRenameWorkspaceId: null,
      workspaceEditValue: '',
      pendingDeleteWorkspaceId: null,
      claimEditorFocus: false,
    };
    vm.runInNewContext(`${lift(name)}; this.run = ${name};`, sandbox);
    sandbox.run();
    assert.deepEqual(calls, ['gate'], `${name} must stop at the upfront gate`);
    assert.equal(sandbox.pendingCreateWorkspace, false);
    assert.equal(sandbox.pendingSaveAsWorkspace, false);
    assert.equal(sandbox.claimEditorFocus, false);
  }
});

test('active Patrons still reach both workspace name editors', () => {
  for (const name of ['beginCreateWorkspace', 'beginSaveWorkspace']) {
    const calls = [];
    const sandbox = {
      guardWorkspaceCreationEntry: () => false,
      openWorkspaceSwitcher: () => calls.push('editor'),
      pendingCreateWorkspace: false,
      createWorkspaceValue: '',
      pendingSaveAsWorkspace: false,
      saveAsWorkspaceValue: '',
      pendingRenameWorkspaceId: null,
      workspaceEditValue: '',
      pendingDeleteWorkspaceId: null,
      claimEditorFocus: false,
    };
    vm.runInNewContext(`${lift(name)}; this.run = ${name};`, sandbox);
    sandbox.run();
    assert.deepEqual(calls, ['editor']);
    assert.equal(name === 'beginCreateWorkspace'
      ? sandbox.pendingCreateWorkspace
      : sandbox.pendingSaveAsWorkspace, true);
    assert.equal(sandbox.claimEditorFocus, true);
  }
});

test('/workspace keeps existing rows lapse-safe but gates a new name upfront', () => {
  const existing = { id: 'ws_work', name: 'Work' };
  const calls = [];
  const sandbox = {
    wsWorkspaces: [existing],
    pendingScratchGuard: null,
    openWorkspaceSwitcher: () => calls.push(['open-switcher']),
    switchToWorkspace: (workspace) => calls.push(['switch', workspace.id]),
    guardWorkspaceCreationEntry: () => { calls.push(['gate']); return true; },
    runWorkspaceMutation: () => calls.push(['mutation']),
    retryScratchGuard: () => {},
    window: { browserAPI: { saveWorkspaceAs: (name) => calls.push(['save', name]) } },
  };
  vm.runInNewContext(`${lift('runWorkspaceCommand')}; this.run = runWorkspaceCommand;`, sandbox);

  sandbox.run('/workspace work');
  assert.deepEqual(calls, [['switch', 'ws_work']], 'lapsed users retain their existing data');

  calls.length = 0;
  sandbox.run('/workspace Personal project');
  assert.deepEqual(calls, [['gate']], 'a new name stops before saveWorkspaceAs IPC');
});

test('/workspace sends a new name to main only after the renderer gate passes', () => {
  const calls = [];
  const sandbox = {
    wsWorkspaces: [],
    pendingScratchGuard: null,
    openWorkspaceSwitcher: () => calls.push(['open-switcher']),
    switchToWorkspace: () => {},
    guardWorkspaceCreationEntry: () => false,
    runWorkspaceMutation: (promise) => calls.push(['mutation', promise]),
    retryScratchGuard: () => {},
    window: { browserAPI: { saveWorkspaceAs: (name) => { calls.push(['save', name]); return 'pending'; } } },
  };
  vm.runInNewContext(`${lift('runWorkspaceCommand')}; this.run = runWorkspaceCommand;`, sandbox);
  sandbox.run('/workspace Deep Work');
  assert.deepEqual(calls, [['save', 'Deep Work'], ['mutation', 'pending']]);
});

test('the Patron gate row distinguishes unlock from lapse and links to Patron Settings', () => {
  const calls = [];
  class El {
    constructor(tag) { this.tagName = tag; this.children = []; this.listeners = {}; }
    setAttribute(name, value) { this[name] = value; }
    append(...children) { this.children.push(...children); }
    addEventListener(name, fn) { this.listeners[name] = fn; }
  }
  const sandbox = {
    wsWorkspaces: [],
    document: { createElement: (tag) => new El(tag) },
    closeWorkspaceSwitcher: () => calls.push(['close-switcher']),
    window: { browserAPI: {
      closeOverlay: () => calls.push(['close-overlay']),
      openPage: (...args) => calls.push(['open-page', ...args]),
    } },
  };
  vm.runInNewContext(
    `${lift('renderWorkspacePatronGateRow')}; this.render = renderWorkspacePatronGateRow;`,
    sandbox,
  );
  const unlock = sandbox.render(false);
  assert.equal(unlock.children[0].textContent, 'Named Workspaces — Patron');
  assert.equal(unlock.children[1].textContent, 'unlock →');
  const renew = sandbox.render(true);
  assert.equal(renew.children[0].textContent, 'Renew Patron to create another');
  assert.equal(renew.children[1].textContent, '→');
  unlock.listeners.click();
  assert.deepEqual(calls, [
    ['close-switcher'],
    ['close-overlay'],
    ['open-page', 'settings', 'patron'],
  ]);
});

test('inactive users get one CTA instead of new and save-as controls', () => {
  const render = lift('renderWorkspaceSwitcherList');
  assert.match(render, /setSwitcherCommandVisibility\(wsPatronActive && !naming\)/);
  assert.match(render, /renderWorkspacePatronGateRow\(false\)/,
    'never-Patrons need one unlock CTA');
  assert.match(render, /if \(!wsPatronActive\) nodes\.push\(renderWorkspacePatronGateRow\(true\)\)/,
    'lapsed Patrons keep rows plus one renew CTA');
});

test('Patron activation and validation repaint an already-open workspace popover', () => {
  const settingsFanout = mainSource.match(
    /settings\.onSettingsChanged\(\(s\) => \{[\s\S]*?\n  \}\);/,
  )?.[0];
  assert.ok(settingsFanout, 'settings fan-out not found in main.js');
  assert.match(settingsFanout, /broadcastWorkspacesUpdated\(\)/,
    'setPatron changes must push the newly derived entitlement to chrome');
});
