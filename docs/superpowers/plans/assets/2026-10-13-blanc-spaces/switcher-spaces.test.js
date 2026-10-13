'use strict';

// Typing a space's name in ⌘L offers to switch to it. Runs the real
// matchScore / switcherResults / resultKey / pickResult from overlay.js in a
// sandbox with stubbed state, so a rename or a dropped branch fails here.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const overlay = fs.readFileSync(path.join(__dirname, '../../src/renderer/overlay.js'), 'utf8');
const lift = (name) => {
  const source = overlay.match(new RegExp(`\\n  function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\n  \\}\\n`))?.[0];
  assert.ok(source, `${name} not found in overlay.js`);
  return source;
};

// Values built inside the sandbox come from another realm; compare their shape.
const plain = (value) => JSON.parse(JSON.stringify(value));

function sandbox(workspaces) {
  const calls = [];
  const context = {
    state: { groups: [{ id: 'g1', name: 'research' }], tabs: [{ id: 't1', title: 'Research notes', url: 'https://notes.test/', groupId: 'g1' }], activeTabId: 't1' },
    favorites: [], remoteDevices: [], historyEntries: [], wsWorkspaces: workspaces,
    matchableText: (title, url) => `${title ?? ''} ${url ?? ''}`, stripUrl: (url) => url, tabDomain: (tab) => tab.url,
    blancI18n: { t: (key, params) => (params?.count !== undefined ? `${params.count} tabs` : key) },
    workspaceUI: { switchTo: (w) => calls.push(['switch', w.id]) },
    window: { browserAPI: { closeOverlay: () => calls.push(['close']), focusGroup: (id) => calls.push(['group', id]), switchTab: (id) => calls.push(['tab', id]) } },
  };
  vm.runInNewContext(['matchScore', 'switcherResults', 'resultKey', 'pickResult'].map(lift).join('\n')
    + '\nthis.api = { switcherResults, resultKey, pickResult };', context);
  return { ...context.api, calls };
}

const SPACES = [
  { id: 'a', name: 'Research', active: true, tabCount: 3, color: '#426c4c', symbol: 'flask' },
  { id: 'b', name: 'Reading', active: false, tabCount: 5, color: '#376694', symbol: 'book' },
  { id: 'c', name: 'Recipes', active: false, tabCount: 2, color: '#974f2a', symbol: 'coffee' },
];

test('typing a space name offers that space, ranked with groups, never the current space', () => {
  const { switcherResults } = sandbox(SPACES);
  const results = switcherResults('re');
  const spaces = results.filter((r) => r.kind === 'space');
  assert.deepEqual(plain(spaces.map((r) => r.workspace.id)), ['b', 'c'], 'every matching space survives de-duplication; the current one is left out');
  assert.equal(spaces[0].sub, '5 tabs');
  const group = results.find((r) => r.kind === 'group');
  assert.equal(spaces[0].score, group.score, 'spaces and groups share a rank');
});

test('each space result has its own key, and picking it switches without closing the overlay', () => {
  const { switcherResults, resultKey, pickResult, calls } = sandbox(SPACES);
  const spaces = switcherResults('re').filter((r) => r.kind === 'space');
  assert.deepEqual(plain(spaces.map(resultKey)), ['space:b', 'space:c']);
  pickResult(spaces[0]);
  assert.deepEqual(plain(calls), [['switch', 'b']], 'the Spaces menu decides when the overlay closes');
});
