'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  sectionsOf, normalizeOrder, itemsOf, layoutItems, legacyOrder, firstTabOf, placeInGroup,
} = require('../../src/renderer/tab-sections');

const loose = (id) => ({ id, groupId: null, pinned: false });
const member = (id, groupId, pinned = false) => ({ id, groupId, pinned });
const pin = (id) => ({ id, groupId: null, pinned: true });
const ids = (list) => list.map((t) => t.id);

test('sectionsOf splits runs around groups', () => {
  const list = [loose('L1'), loose('L2'), member('G1a', 'g1'), loose('L3'), member('G2a', 'g2'), loose('L4')];
  assert.deepEqual(sectionsOf(list), [
    { key: 'run:L1', groupId: null, tabIds: ['L1', 'L2'] },
    { key: 'g1', groupId: 'g1', tabIds: ['G1a'] },
    { key: 'run:L3', groupId: null, tabIds: ['L3'] },
    { key: 'g2', groupId: 'g2', tabIds: ['G2a'] },
    { key: 'run:L4', groupId: null, tabIds: ['L4'] },
  ]);
});

test('group sits at its first member and collects scattered members', () => {
  const list = [member('G1a', 'g1'), loose('L1'), member('G1b', 'g1')];
  assert.deepEqual(sectionsOf(list), [
    { key: 'g1', groupId: 'g1', tabIds: ['G1a', 'G1b'] },
    { key: 'run:L1', groupId: null, tabIds: ['L1'] },
  ]);
});

test('grouped pins lead their group', () => {
  const list = [member('a', 'g1'), member('p', 'g1', true), member('b', 'g1')];
  assert.deepEqual(sectionsOf(list)[0].tabIds, ['p', 'a', 'b']);
});

test('ungrouped pins are not sections and do not split a run', () => {
  const list = [loose('L1'), pin('P'), loose('L2')];
  assert.deepEqual(sectionsOf(list), [{ key: 'run:L1', groupId: null, tabIds: ['L1', 'L2'] }]);
});

test('normalizeOrder is idempotent and puts ungrouped pins first', () => {
  const list = [loose('L1'), member('G1a', 'g1'), pin('P'), loose('L2'), member('G1b', 'g1')];
  const once = normalizeOrder(list);
  assert.deepEqual(once, ['P', 'L1', 'G1a', 'G1b', 'L2']);
  const byId = new Map(list.map((t) => [t.id, t]));
  assert.deepEqual(normalizeOrder(once.map((id) => byId.get(id))), once);
});

test('itemsOf lists groups once and loose tabs singly', () => {
  const list = [pin('P'), loose('L1'), member('G1a', 'g1'), member('G1b', 'g1'), loose('L2')];
  assert.deepEqual(itemsOf(list), [
    { id: 'L1', groupId: null },
    { id: 'g1', groupId: 'g1' },
    { id: 'L2', groupId: null },
  ]);
});

test('layoutItems round-trips itemsOf and keeps missing items at the end', () => {
  const list = [pin('P'), loose('L1'), member('G1a', 'g1'), member('G1b', 'g1', true), loose('L2')];
  assert.deepEqual(layoutItems(itemsOf(list).map((i) => i.id), list), ['P', 'L1', 'G1b', 'G1a', 'L2']);
  assert.deepEqual(layoutItems(['g1', 'L1', 'nope'], list), ['P', 'G1b', 'G1a', 'L1', 'L2']);
});

test('legacyOrder puts groups in groups[] order then loose', () => {
  const list = [loose('L1'), member('B1', 'gb'), pin('P'), member('A1', 'ga'), loose('L2'), member('B2', 'gb'), member('C1', 'gc')];
  assert.deepEqual(legacyOrder(list, ['ga', 'gb']), ['P', 'A1', 'B1', 'B2', 'C1', 'L1', 'L2']);
});

test('firstTabOf names a group section\'s first tab', () => {
  const sections = sectionsOf([loose('L1'), member('a', 'g1'), member('p', 'g1', true)]);
  assert.equal(firstTabOf(sections, 'g1'), 'p');
  assert.equal(firstTabOf(sections, 'missing'), null);
});

test('placeInGroup keeps a member inside its block', () => {
  const list = [member('NEW', 'g1'), loose('L1'), member('G1a', 'g1'), member('G1b', 'g1'), loose('L2')];
  assert.deepEqual(placeInGroup(ids(list), list, 'NEW', 'g1'), ['L1', 'G1a', 'G1b', 'NEW', 'L2']);
  const alone = [loose('L1'), member('ONLY', 'g9')];
  assert.deepEqual(placeInGroup(ids(alone), alone, 'ONLY', 'g9'), ['L1', 'ONLY']);
});

// Tab group colors: one shared painter for the panel band, the side-list
// block and the Island's dots (spec 2026-10-17-tab-group-colors-design.md).
function fakeElement() {
  const classes = new Set();
  const props = new Map();
  return {
    classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c), contains: (c) => classes.has(c) },
    style: { setProperty: (k, v) => props.set(k, v), removeProperty: (k) => props.delete(k), getPropertyValue: (k) => props.get(k) ?? '' },
    classes, props,
  };
}

test('a colored band carries the color and its class', () => {
  const { paintGroup } = require('../../src/renderer/tab-sections');
  const el = fakeElement();
  paintGroup(el, { id: 'g', color: '#376694' }, 'group-colored');
  assert.ok(el.classes.has('group-colored'));
  assert.equal(el.props.get('--group-color'), '#376694');
});

test('an uncolored band is unchanged', () => {
  const { paintGroup } = require('../../src/renderer/tab-sections');
  const el = fakeElement();
  paintGroup(el, { id: 'g', color: null }, 'group-colored');
  paintGroup(el, null, 'group-colored');
  assert.equal(el.classes.size, 0);
  assert.equal(el.props.size, 0);
});
