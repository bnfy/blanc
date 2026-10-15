const assert = require('node:assert/strict');
const test = require('node:test');

const {
  persistableEntries, syncSnapshot, sessionTabMeta, metaAfterHistoryClear, MAX_META_TITLE, MAX_META_FAVICON,
} = require('../../src/main/session-snapshot');
const SAFE_ICON = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAGElEQVR42mNgGAWjYBSMglEwCkbBqAABBgAE/wABeV0FzgAAAABJRU5ErkJggg==';

const tab = (over = {}) => ({
  id: 't1', url: 'https://a.example/x', title: 'A',
  groupId: null, pinned: false, private: false, ...over,
});

test('persistableEntries: private and url-less tabs drop; error urls unwrap; local schemes stay', () => {
  const entries = persistableEntries([
    tab(),
    tab({ id: 't2', private: true }),
    tab({ id: 't3', url: '' }),
    tab({ id: 't4', url: 'blanc://error/?url=' + encodeURIComponent('https://fail.example/') }),
    tab({ id: 't5', url: 'file:///Users/me/doc.html' }),
    tab({ id: 't6', url: 'blanc://settings/' }),
  ]);
  assert.deepEqual(entries.map((e) => e.id), ['t1', 't4', 't5', 't6']);
  assert.equal(entries[1].url, 'https://fail.example/');
  // session.json keeps file:// and blanc:// — portability is the sync filter's job
  assert.equal(entries[2].url, 'file:///Users/me/doc.html');
  assert.equal(entries[3].url, 'blanc://settings/');
});

test('persistableEntries keeps id/groupId/pinned aligned per entry', () => {
  const entries = persistableEntries([
    tab({ id: 'a', groupId: 'g1', pinned: true }),
    tab({ id: 'b', private: true }),
    tab({ id: 'c' }),
  ]);
  assert.deepEqual(entries, [
    { id: 'a', url: 'https://a.example/x', groupId: 'g1', pinned: true },
    { id: 'c', url: 'https://a.example/x', groupId: null, pinned: false },
  ]);
});

test('syncSnapshot: http(s)-only, url-length skip, title truncation, private excluded', () => {
  const snap = syncSnapshot([
    tab({ title: 'x'.repeat(500), favicon: 'https://a.example/icon.svg' }),
    tab({ id: 'b', url: 'file:///etc/hosts' }),
    tab({ id: 'c', url: 'blanc://settings/' }),
    tab({ id: 'd', private: true }),
    tab({ id: 'e', url: 'https://long.example/' + 'p'.repeat(2100) }),
    tab({
      id: 'f',
      url: 'blanc://error/?url=' + encodeURIComponent('https://fail.example/'),
      favicon: 'javascript:alert(1)',
    }),
  ], []);
  assert.deepEqual(snap.tabs.map((t) => t.url), ['https://a.example/x', 'https://fail.example/']);
  assert.equal(snap.tabs[0].title.length, 200);
  // Mixed-version contract: icon metadata lives in the optional sidecar and
  // must never change the deployed session-tab shape.
  assert.deepEqual(Object.keys(snap.tabs[0]).sort(), ['groupId', 'pinned', 'title', 'url']);
});

test('syncSnapshot caps at 500 tabs and keeps only referenced groups, order preserved, collapsed stripped', () => {
  const many = Array.from({ length: 520 }, (_, i) =>
    tab({ id: `t${i}`, url: `https://a.example/${i}`, groupId: i === 0 ? 'g2' : null }));
  const snap = syncSnapshot(many, [
    { id: 'g1', name: 'unreferenced', collapsed: false },
    { id: 'g2', name: 'work', collapsed: true },
  ]);
  assert.equal(snap.tabs.length, 500);
  assert.deepEqual(snap.groups, [{ id: 'g2', name: 'work' }]);
});

test('sessionTabMeta carries a title and an allow-listed favicon, both bounded', () => {
  assert.deepEqual(
    sessionTabMeta(tab({ title: 'A', favicon: SAFE_ICON })),
    { title: 'A', favicon: SAFE_ICON }
  );
  assert.equal(sessionTabMeta(tab({ title: 'x'.repeat(500) })).title.length, MAX_META_TITLE);
  assert.equal(sessionTabMeta(tab({ favicon: 'javascript:alert(1)' })).favicon, null);
  assert.equal(sessionTabMeta(tab({ favicon: 'https://a.example/icon.png' })).favicon, null);
  assert.equal(
    sessionTabMeta(tab({ favicon: `data:image/png;base64,${'A'.repeat(MAX_META_FAVICON)}` })).favicon,
    null,
    'an oversized data: favicon is the fallback glyph — not worth persisting'
  );
  assert.deepEqual(sessionTabMeta(undefined), { title: '', favicon: null });
});

test('sessionTabMeta persists an EMPTY title for a tab sitting on our error page', () => {
  const meta = sessionTabMeta(tab({
    url: 'blanc://error/?url=' + encodeURIComponent('https://fail.example/'),
    title: 'This page did not load',
  }));
  assert.deepEqual(meta, { title: '', favicon: null },
    'persistableUrl unwraps to the site; the title there is Blanc error page copy');
});

test('sessionTabMeta writes customTitle only for a renamed tab', () => {
  assert.deepEqual(Object.keys(sessionTabMeta(tab())).sort(), ['favicon', 'title']);
  const meta = sessionTabMeta(tab({ title: 'Sheets', customTitle: '  Budget ' }));
  assert.equal(meta.title, 'Sheets', 'title keeps the page title for older builds');
  assert.equal(meta.customTitle, 'Budget');
  // An error page drops its Blanc-authored title but keeps the person's name.
  const onError = sessionTabMeta(tab({
    url: 'blanc://error/?url=' + encodeURIComponent('https://fail.example/'),
    title: 'Can’t reach this page', customTitle: 'Budget',
  }));
  assert.equal(onError.title, '');
  assert.equal(onError.customTitle, 'Budget');
});

test('syncSnapshot sends the name a renamed tab shows', () => {
  const snap = syncSnapshot([tab({ title: 'Sheets', customTitle: 'Budget' }), tab({ id: 'b', title: 'Plain' })], []);
  assert.deepEqual(snap.tabs.map((t) => t.title), ['Budget', 'Plain']);
  assert.deepEqual(Object.keys(snap.tabs[0]).sort(), ['groupId', 'pinned', 'title', 'url']);
});

test('metaAfterHistoryClear keeps typed names and drops page titles and icons', () => {
  const kept = metaAfterHistoryClear([
    { title: 'Sheets', favicon: SAFE_ICON, customTitle: 'Budget' },
    { title: 'Mail', favicon: null },
  ]);
  assert.deepEqual(kept, [
    { title: '', favicon: null, customTitle: 'Budget' },
    { title: '', favicon: null },
  ]);
});

test('metaAfterHistoryClear returns null when there is no name to keep', () => {
  assert.equal(metaAfterHistoryClear([{ title: 'Mail', favicon: null }]), null);
  assert.equal(metaAfterHistoryClear([{ title: 'Mail', customTitle: '   ' }]), null);
  assert.equal(metaAfterHistoryClear(undefined), null);
  assert.equal(metaAfterHistoryClear('junk'), null);
});
