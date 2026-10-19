'use strict';

// F52: archived tabs show in the ⌘L Quick Switcher. Runs the real
// matchScore / switcherResults / resultKey / pickResult from overlay.js in a
// sandbox with stubbed state, so a rename or a dropped branch fails here
// (lift() asserts each function was found, so the test fails closed).
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
const plain = (value) => JSON.parse(JSON.stringify(value));

function sandbox({ archived = [], history = [], remote = [], privateActive = false } = {}) {
  const calls = [];
  const context = {
    state: {
      groups: [],
      tabs: [{ id: 't1', title: 'Start', url: 'https://start.test/', groupId: null, private: privateActive }],
      activeTabId: 't1',
    },
    favorites: [],
    remoteDevices: remote,
    historyEntries: history,
    archivedEntries: archived,
    wsWorkspaces: [],
    matchableText: (title, url) => `${title ?? ''} ${url ?? ''}`,
    stripUrl: (url) => url,
    tabDomain: (tab) => tab.url,
    hostOfUrl: (url) => url,
    blancI18n: { t: (key) => key },
    workspaceUI: { switchTo: () => {} },
    window: {
      browserAPI: {
        closeOverlay: () => calls.push(['close']),
        archiveRestore: (id) => calls.push(['restore', id]),
        navigate: (tabId, url) => calls.push(['navigate', tabId, url]),
      },
    },
  };
  vm.runInNewContext(['matchScore', 'switcherResults', 'resultKey', 'pickResult'].map(lift).join('\n')
    + '\nthis.api = { switcherResults, resultKey, pickResult };', context);
  return { ...context.api, calls };
}

const archivedRow = (id, url, title) => ({ id, url, title, favicon: null, archivedAt: 1, spaceName: null });

test('an archived entry ranks below remote tabs and above history', () => {
  const { switcherResults } = sandbox({
    archived: [archivedRow('a1', 'https://kiwi.test/archived', 'kiwi archived')],
    history: [{ url: 'https://kiwi.test/history', title: 'kiwi history' }],
    remote: [{ name: 'Mac', tabs: [{ url: 'https://kiwi.test/remote', title: 'kiwi remote' }] }],
  });
  const kinds = switcherResults('kiwi').map((r) => r.kind);
  assert.deepEqual(plain(kinds), ['remote', 'archived', 'history']);
});

test('an archived row is marked Archived and picking it restores that entry', () => {
  const { switcherResults, pickResult, calls } = sandbox({
    archived: [archivedRow('a1', 'https://kiwi.test/', 'kiwi')],
  });
  const row = switcherResults('kiwi').find((r) => r.kind === 'archived');
  assert.match(row.sub, /result\.archived/);
  pickResult(row);
  assert.deepEqual(plain(calls), [['restore', 'a1'], ['close']]);
});

test('a history row for the same URL is dropped in favor of the archived row', () => {
  const { switcherResults } = sandbox({
    archived: [archivedRow('a1', 'https://kiwi.test/', 'kiwi')],
    history: [{ url: 'https://kiwi.test/', title: 'kiwi' }],
  });
  assert.deepEqual(plain(switcherResults('kiwi').map((r) => r.kind)), ['archived']);
});

test('two archived entries with the same URL show one row', () => {
  const { switcherResults } = sandbox({
    archived: [archivedRow('a1', 'https://kiwi.test/', 'kiwi'), archivedRow('a2', 'https://kiwi.test/', 'kiwi')],
  });
  assert.equal(switcherResults('kiwi').filter((r) => r.kind === 'archived').length, 1);
});

test("a private tab's switcher shows no archived rows", () => {
  const { switcherResults } = sandbox({
    archived: [archivedRow('a1', 'https://kiwi.test/', 'kiwi')],
    privateActive: true,
  });
  assert.equal(switcherResults('kiwi').some((r) => r.kind === 'archived'), false);
});
