'use strict';

// Mini window: switch to tabs and Spaces (#1734 part 2). Runs the real
// matchScore / switcherResults / resultKey / pickResult from overlay.js in a
// sandbox, as overlay-archived-results.test.js does (lift() fails closed).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const overlay = fs.readFileSync(path.join(__dirname, '../../src/renderer/overlay.js'), 'utf8');
const lift = (name) => {
  const source = overlay.match(new RegExp(`\\n  (?:async )?function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\n  \\}\\n`))?.[0];
  assert.ok(source, `${name} not found in overlay.js`);
  return source;
};
const plain = (value) => JSON.parse(JSON.stringify(value));

function sandbox({ mini = true, elsewhere = [], favorites = [], workspaces = [], goReply = { ok: true } } = {}) {
  const calls = [];
  const context = {
    state: {
      miniWindow: mini,
      groups: [],
      tabs: [{ id: 't1', title: 'docs here', url: 'https://own.test/', groupId: null, private: false }],
      activeTabId: 't1',
    },
    favorites,
    remoteDevices: [], historyEntries: [], archivedEntries: [],
    elsewhereTabs: elsewhere, elsewhereNotice: '',
    wsWorkspaces: workspaces, wsOtherProfiles: [],
    matchableText: (title, url) => `${title ?? ''} ${url ?? ''}`,
    stripUrl: (url) => url,
    tabDomain: (tab) => tab.url,
    hostOfUrl: (url) => new URL(url).host,
    blancI18n: { t: (key) => key },
    workspaceUI: { switchTo: (w) => calls.push(['space', w.id]) },
    renderList: () => calls.push(['render']),
    window: {
      browserAPI: {
        closeOverlay: () => calls.push(['close']),
        goToMiniSwitchTab: (key) => { calls.push(['go', key]); return Promise.resolve(goReply); },
      },
    },
  };
  vm.runInNewContext(['matchScore', 'switcherResults', 'resultKey', 'pickResult'].map(lift).join('\n')
    + '\nthis.api = { switcherResults, resultKey, pickResult };', context);
  return { ...context.api, calls, context };
}

const row = (key, title, url, place) => ({ key, title, url, favicon: null, place });

test('tabs elsewhere rank below this window\'s tabs and above Favorites, and say where they are', () => {
  const { switcherResults, resultKey } = sandbox({
    elsewhere: [row('t:9', 'docs elsewhere', 'https://docs.example/', 'Reading'), row('s:sp:0', 'docs saved', 'https://saved.example/', null)],
    favorites: [{ id: 'f1', url: 'https://fav.example/', title: 'docs favorite', favicon: null }],
  });
  const results = plain(switcherResults('docs'));
  const kinds = results.map((r) => r.kind);
  assert.ok(kinds.indexOf('tab') < kinds.indexOf('elsewhere'), kinds.join());
  assert.ok(kinds.lastIndexOf('elsewhere') < kinds.indexOf('favorite'), kinds.join());
  const reading = results.find((r) => r.key === 't:9');
  assert.equal(reading.sub, 'docs.example · Reading');
  assert.equal(results.find((r) => r.key === 's:sp:0').sub, 'saved.example · mini.switch.anotherWindow');
  assert.equal(resultKey(reading), 'elsewhere:t:9');
});

test('an ordinary window lists nothing from elsewhere; a mini window offers Spaces again', () => {
  const ordinary = sandbox({ mini: false, elsewhere: [row('t:9', 'docs elsewhere', 'https://docs.example/', null)] });
  assert.ok(!plain(ordinary.switcherResults('docs')).some((r) => r.kind === 'elsewhere'));
  const mini = sandbox({ workspaces: [{ id: 'w1', name: 'Reading', active: false, tabCount: 2 }] });
  assert.ok(plain(mini.switcherResults('read')).some((r) => r.kind === 'space' && r.workspace.id === 'w1'));
});

test('picking a tab elsewhere goes there; a gone tab leaves a notice and the panel open', async () => {
  const ok = sandbox({ elsewhere: [row('t:9', 'docs elsewhere', 'https://docs.example/', null)] });
  ok.pickResult(ok.switcherResults('docs').find((r) => r.kind === 'elsewhere'));
  assert.deepEqual(ok.calls, [['go', 't:9']], 'the panel waits for the answer');
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(ok.calls.at(-1), ['close']);

  const gone = sandbox({ elsewhere: [row('t:9', 'docs elsewhere', 'https://docs.example/', null)], goReply: { ok: false, error: 'gone' } });
  gone.pickResult(gone.switcherResults('docs').find((r) => r.kind === 'elsewhere'));
  await new Promise((r) => setImmediate(r));
  assert.ok(!gone.calls.some(([kind]) => kind === 'close'), 'the panel stays');
  assert.equal(gone.context.elsewhereNotice, 'mini.switch.gone');
  assert.deepEqual(plain(gone.context.elsewhereTabs), []);
  assert.deepEqual(gone.calls.at(-1), ['render']);
});

test('the panel loads tabs elsewhere only in a mini window, and shows a notice row', () => {
  const refresh = lift('refreshSwitcherData');
  assert.match(refresh, /state\.miniWindow === true \? window\.browserAPI\.listMiniSwitchTabs\(\) : \[\]/);
  assert.match(refresh, /elsewhereTabs = Array\.isArray\(elsewhereList\) \? elsewhereList : \[\];/);
  assert.match(overlay, /if \(elsewhereNotice\) \{\s*const notice = emptyRow\(elsewhereNotice\);\s*notice\.classList\.add\('command-notice'\);/);
  assert.match(overlay, /addressInput\.addEventListener\('input', \(e\) => \{\s*elsewhereNotice = '';/);
  assert.ok(!overlay.includes('spaceResults'), 'Spaces are offered again in a mini window');
});
