const assert = require('node:assert/strict');
const test = require('node:test');

const {
  SESSION_WORKSPACE_VERSION,
  PRIMARY_WINDOW_ID,
  readSessionWorkspace,
  activeWorkspaceWindow,
  replaceWorkspaceWindow,
  removeWorkspaceWindow,
} = require('../../src/main/session-workspace');

test('legacy flat session migrates losslessly into the primary workspace', () => {
  const result = readSessionWorkspace({
    urls: ['https://one.example/', 'https://two.example/'],
    activeIndex: 1,
    groups: [{ id: 'work', name: 'work', collapsed: true }],
    groupIds: ['work', 'work'],
    pinned: [true, false],
  });

  assert.equal(result.supported, true);
  assert.equal(result.migrated, true);
  assert.equal(result.workspace.version, SESSION_WORKSPACE_VERSION);
  assert.equal(result.workspace.activeWindowId, PRIMARY_WINDOW_ID);
  assert.deepEqual(result.workspace.windows, [{
    id: PRIMARY_WINDOW_ID,
    urls: ['https://one.example/', 'https://two.example/'],
    activeIndex: 1,
    groups: [{ id: 'work', name: 'work', collapsed: true }],
    groupIds: ['work', 'work'],
    pinned: [true, false],
  }]);
});

test('current workspace keeps distinct tab ownership and selects the active owner', () => {
  const result = readSessionWorkspace({
    version: SESSION_WORKSPACE_VERSION,
    activeWindowId: 'second',
    windows: [
      { id: 'primary', urls: ['https://one.example/'] },
      { id: 'second', urls: ['https://two.example/'], activeIndex: 0 },
    ],
  });

  assert.equal(result.migrated, false);
  assert.equal(activeWorkspaceWindow(result.workspace).id, 'second');
  assert.equal(activeWorkspaceWindow(result.workspace).urls[0], 'https://two.example/');
});

test('replacement updates one owner without rewriting other window workspaces', () => {
  const first = readSessionWorkspace({
    version: SESSION_WORKSPACE_VERSION,
    activeWindowId: 'primary',
    windows: [
      { id: 'primary', urls: ['https://one.example/'] },
      { id: 'second', urls: ['https://two.example/'] },
    ],
  }).workspace;
  const next = replaceWorkspaceWindow(first, {
    id: 'primary', urls: ['https://three.example/'], activeIndex: 0,
  });

  assert.equal(next.activeWindowId, 'primary');
  assert.equal(next.windows.find((windowState) => windowState.id === 'primary').urls[0], 'https://three.example/');
  assert.equal(next.windows.find((windowState) => windowState.id === 'second').urls[0], 'https://two.example/');
});

test('background workspace persistence keeps the focused workspace active', () => {
  const first = readSessionWorkspace({
    version: SESSION_WORKSPACE_VERSION,
    activeWindowId: 'second',
    windows: [
      { id: 'primary', urls: ['https://one.example/'] },
      { id: 'second', urls: ['https://two.example/'] },
    ],
  }).workspace;

  const next = replaceWorkspaceWindow(first, {
    id: 'primary', urls: ['https://three.example/'], activeIndex: 0,
  }, { activeWindowId: 'second' });

  assert.equal(next.activeWindowId, 'second');
  assert.equal(next.windows.find((windowState) => windowState.id === 'primary').urls[0], 'https://three.example/');
});

test('closing a secondary workspace removes it without dropping the primary', () => {
  const first = readSessionWorkspace({
    version: SESSION_WORKSPACE_VERSION,
    activeWindowId: 'second',
    windows: [
      { id: 'primary', urls: ['https://one.example/'] },
      { id: 'second', urls: ['https://two.example/'] },
    ],
  }).workspace;

  const next = removeWorkspaceWindow(first, 'second');

  assert.equal(next.activeWindowId, 'primary');
  assert.deepEqual(next.windows.map((windowState) => windowState.id), ['primary']);
  assert.equal(removeWorkspaceWindow(first, 'primary').windows.length, 2);
});

test('newer session records are preserved rather than downgraded', () => {
  const result = readSessionWorkspace({ version: SESSION_WORKSPACE_VERSION + 1, windows: [] });
  assert.equal(result.supported, false);
  assert.equal(result.migrated, false);
  assert.equal(result.workspace.windows.length, 1);
});
