'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

// persistSession lives in main.js, which cannot be required under node --test.
// Lift the real source and run it in a sandbox, so this asserts shipped code.
const { persistableEntries, sessionTabMeta } = require('../../src/main/session-snapshot');
const { buildSaveShape } = require('../../src/main/session-workspace');

const mainSource = fs.readFileSync(path.join(__dirname, '../../src/main/main.js'), 'utf8');
const fnSource = mainSource.match(/function persistSession\(\) \{[\s\S]*?\n\}/)?.[0];

test('persistSession is still liftable out of main.js', () => {
  assert.ok(fnSource, 'persistSession not found — update this test with it');
});

function run(tabList, activeTabId) {
  const data = {};
  const sandbox = {
    isQuitting: false,
    sessionPersistenceSuspended: false,
    sessionReadOnly: false,
    tabs: new Map(tabList.map((t) => [t.id, t])),
    rt: () => ({ tabOrder: tabList.map((t) => t.id), groups: [], activeTabId }),
    ensureSessionStore: () => ({ update: (fn) => fn(data) }),
    persistableEntries,
    sessionTabMeta,
    buildSaveShape,
  };
  vm.runInNewContext(`${fnSource}\nthis.__fn = persistSession;`, sandbox);
  sandbox.__fn();
  return data;
}

const tab = (over) => ({
  id: 'x', url: 'https://a/', title: 'A', favicon: null,
  private: false, groupId: null, pinned: false, ...over,
});

test('persistSession writes a meta entry per persisted url, in the same order', () => {
  const data = run([
    tab({ id: 'a', url: 'https://a/', title: 'Alpha', favicon: 'https://a/i.png' }),
    tab({ id: 'p', url: 'https://secret/', title: 'Secret', private: true }),
    tab({ id: 'b', url: 'https://b/', title: 'Beta' }),
  ], 'b');
  assert.deepEqual(data.windows[0].urls, ['https://a/', 'https://b/']);
  assert.deepEqual(data.windows[0].meta, [
    { title: 'Alpha', favicon: 'https://a/i.png' },
    { title: 'Beta', favicon: null },
  ]);
  assert.equal('meta' in data, false, 'the v0 mirror never carries meta');
});

test('the restore copy-back threads meta through the utility-url filter', () => {
  assert.match(mainSource, /saved\.meta = cleaned\.meta;/,
    'without this a dropped utility url misaligns every title by one');
});
