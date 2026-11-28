'use strict';

// Mini window: switch to tabs and Spaces (#1734 part 2, spec
// docs/superpowers/specs/2026-11-28-mini-window-switch-design.md).
const test = require('node:test');
const assert = require('node:assert/strict');
const { miniSwitchRows, parseMiniSwitchKey, nearestTabByUrl } = require('../../src/main/mini-switch');

const PNG = 'data:image/png;base64,AA';

test('rows list other windows and saved Spaces, never private, mini or own tabs', () => {
  const rows = miniSwitchRows({
    windows: [
      { self: true, mini: true, place: null, tabs: [{ id: 'own', title: 'Own', url: 'https://own.example/', favicon: null, private: false }] },
      { self: false, mini: true, place: null, tabs: [{ id: 'm1', title: 'Other mini', url: 'https://mini.example/', favicon: null, private: false }] },
      { self: false, mini: false, place: null, tabs: [
        { id: 'x1', title: 'Secret', url: 'https://private.example/', favicon: null, private: true },
        { id: 'n1', title: 'New Tab', url: 'blanc://newtab/', favicon: null, private: false },
        { id: 'p1', title: '', url: 'https://page.example/', favicon: 'data:image/svg+xml,<svg/>', private: false },
      ] },
      { self: false, mini: false, place: 'Reading', spaceId: 'rd', tabs: [{ id: 'r1', title: 'Notes', url: 'https://notes.example/', favicon: PNG, private: false }] },
    ],
    saved: [{ id: 'sp1', name: 'Later', urls: ['https://a.example/', 'blanc://newtab/'], meta: [{ title: 'A', favicon: PNG }, {}] }],
  });
  assert.deepEqual(rows, [
    { key: 't:p1', title: 'https://page.example/', url: 'https://page.example/', favicon: null, place: null },
    // A tab in a Space carries its Space, so a pick can still show the Space
    // if the tab has gone (its held Space let go) by then.
    { key: 't:r1:rd', title: 'Notes', url: 'https://notes.example/', favicon: PNG, place: 'Reading' },
    { key: 's:sp1:0', title: 'A', url: 'https://a.example/', favicon: PNG, place: 'Later' },
  ]);
});

test('a saved tab is titled by its custom name, then its page title, then its address', () => {
  const rows = miniSwitchRows({ windows: [], saved: [{ id: 'sp2', name: 'Trip', urls: ['https://b.example/', 'https://c.example/', 'https://d.example/'],
    meta: [{}, { title: 'Page C' }, { title: 'Page D', customTitle: 'My D' }] }] });
  assert.deepEqual(rows.map((r) => r.title), ['https://b.example/', 'Page C', 'My D']);
});

test('a restored Space finds the picked tab by address, nearest its saved place', () => {
  const tabs = [{ id: 'a', url: 'https://x/' }, { id: 'b', url: 'https://y/' }, { id: 'c', url: 'https://x/' }];
  assert.equal(nearestTabByUrl(tabs, 'https://y/', 2), 'b', 'a dropped row shifted it');
  assert.equal(nearestTabByUrl(tabs, 'https://x/', 2), 'c');
  assert.equal(nearestTabByUrl(tabs, 'https://x/', 0), 'a');
  assert.equal(nearestTabByUrl(tabs, 'https://z/', 0), null);
});

test('keys parse, and malformed keys are refused', () => {
  assert.deepEqual(parseMiniSwitchKey('t:abc'), { kind: 'tab', tabId: 'abc', spaceId: null });
  assert.deepEqual(parseMiniSwitchKey('t:abc:sp1'), { kind: 'tab', tabId: 'abc', spaceId: 'sp1' });
  assert.deepEqual(parseMiniSwitchKey('s:sp1:2'), { kind: 'saved', spaceId: 'sp1', index: 2 });
  for (const bad of ['s:sp1:-1', 's::0', 's:sp1:1.5', 's:sp1:', 't:', 'x:1', '', null, undefined, 7]) {
    assert.equal(parseMiniSwitchKey(bad), null, String(bad));
  }
});
