'use strict';

// Mini window: switch to tabs and Spaces (#1734 part 2, spec
// docs/superpowers/specs/2026-11-28-mini-window-switch-design.md).
const test = require('node:test');
const assert = require('node:assert/strict');
const { miniSwitchRows, parseMiniSwitchKey } = require('../../src/main/mini-switch');

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
      { self: false, mini: false, place: 'Reading', tabs: [{ id: 'r1', title: 'Notes', url: 'https://notes.example/', favicon: PNG, private: false }] },
    ],
    saved: [{ id: 'sp1', name: 'Later', urls: ['https://a.example/', 'blanc://newtab/'], meta: [{ title: 'A', favicon: PNG }, {}] }],
  });
  assert.deepEqual(rows, [
    { key: 't:p1', title: 'https://page.example/', url: 'https://page.example/', favicon: null, place: null },
    { key: 't:r1', title: 'Notes', url: 'https://notes.example/', favicon: PNG, place: 'Reading' },
    { key: 's:sp1:0', title: 'A', url: 'https://a.example/', favicon: PNG, place: 'Later' },
  ]);
});

test('a saved tab with no meta is titled by its address', () => {
  const rows = miniSwitchRows({ windows: [], saved: [{ id: 'sp2', name: 'Trip', urls: ['https://b.example/'], meta: [] }] });
  assert.deepEqual(rows, [{ key: 's:sp2:0', title: 'https://b.example/', url: 'https://b.example/', favicon: null, place: 'Trip' }]);
});

test('keys parse, and malformed keys are refused', () => {
  assert.deepEqual(parseMiniSwitchKey('t:abc'), { kind: 'tab', tabId: 'abc' });
  assert.deepEqual(parseMiniSwitchKey('s:sp1:2'), { kind: 'saved', spaceId: 'sp1', index: 2 });
  for (const bad of ['s:sp1:-1', 's::0', 's:sp1:1.5', 's:sp1:', 't:', 'x:1', '', null, undefined, 7]) {
    assert.equal(parseMiniSwitchKey(bad), null, String(bad));
  }
});
