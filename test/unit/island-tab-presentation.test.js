'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(
  path.join(__dirname, '../../src/renderer/renderer.js'),
  'utf8'
);
const styles = fs.readFileSync(
  path.join(__dirname, '../../src/renderer/styles.css'),
  'utf8'
);

function extractFunction(name) {
  const start = source.indexOf(`function ${name}()`);
  assert.notEqual(start, -1, `${name} not found in renderer.js`);
  const bodyStart = source.indexOf('{', start);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`could not extract ${name} from renderer.js`);
}

const islandTabPresentation = extractFunction('islandTabPresentation');

function visibleDots(tabs, activeTabId) {
  const sandbox = {
    state: { tabs, activeTabId },
    DOT_CAP: 8,
    activeTab: () => tabs.find((tab) => tab.id === activeTabId) || null,
  };
  vm.runInNewContext(`${islandTabPresentation}\nthis.result = islandTabPresentation();`, sandbox);
  return {
    ...sandbox.result,
    pinned: Array.from(sandbox.result.pinned),
    section: Array.from(sandbox.result.section),
    shown: Array.from(sandbox.result.shown),
  };
}

test('the reported 14-tab topology shows the standalone pin, active group, and global remainder', () => {
  const tabs = [
    { id: 'pin', groupId: null, pinned: true },
    ...['p1', 'p2'].map((id) => ({ id, groupId: 'projects', pinned: false })),
    ...['t1', 't2'].map((id) => ({ id, groupId: 'tools', pinned: false })),
    ...['s1', 's2', 's3', 's4'].map((id) => ({ id, groupId: 'shopping', pinned: false })),
    ...['l1', 'l2', 'l3', 'l4', 'l5'].map((id) => ({ id, groupId: null, pinned: false })),
  ];
  const { pinned, section, shown, hidden } = visibleDots(tabs, 't1');

  assert.deepEqual(pinned.map((tab) => tab.id), ['pin']);
  assert.deepEqual(section.map((tab) => tab.id), ['t1', 't2']);
  assert.deepEqual(shown.map((tab) => tab.id), ['pin', 't1', 't2']);
  assert.equal(hidden, 11);
});

test('standalone pins stay global while grouped pins stay inside the active group', () => {
  const { pinned, section, shown, hidden } = visibleDots([
    { id: 'loose', groupId: null, pinned: false },
    { id: 'pinned-a', groupId: null, pinned: true },
    { id: 'grouped-pin', groupId: 'work', pinned: true },
    { id: 'grouped-active', groupId: 'work', pinned: false },
    { id: 'pinned-b', groupId: null, pinned: true },
  ], 'grouped-active');

  assert.deepEqual(pinned.map((tab) => tab.id), ['pinned-a', 'pinned-b']);
  assert.deepEqual(section.map((tab) => tab.id), ['grouped-pin', 'grouped-active']);
  assert.deepEqual(shown.map((tab) => tab.id), [
    'pinned-a', 'pinned-b', 'grouped-pin', 'grouped-active',
  ]);
  assert.equal(hidden, 1);
});

test('a loose active tab gets the standalone pins and loose section, not named groups', () => {
  const { pinned, section, hidden } = visibleDots([
    { id: 'loose-a', groupId: null, pinned: false },
    { id: 'pin', groupId: null, pinned: true },
    { id: 'grouped', groupId: 'work', pinned: false },
    { id: 'loose-b', groupId: null, pinned: false },
  ], 'loose-b');

  assert.deepEqual(pinned.map((tab) => tab.id), ['pin']);
  assert.deepEqual(section.map((tab) => tab.id), ['loose-a', 'loose-b']);
  assert.equal(hidden, 1);
});

test('an active standalone pin windows only the pinned shelf and never duplicates it', () => {
  const tabs = [
    ...Array.from({ length: 10 }, (_, index) => ({
      id: `pin-${index}`,
      groupId: null,
      pinned: true,
    })),
    { id: 'loose', groupId: null, pinned: false },
  ];
  const { pinned, section, shown, hidden } = visibleDots(tabs, 'pin-9');

  assert.equal(pinned.length, 8);
  assert.deepEqual(section, []);
  assert.equal(shown.filter((tab) => tab.id === 'pin-9').length, 1);
  assert.equal(shown.at(-1).id, 'pin-9');
  assert.equal(hidden, 3);
});

test('the cap reserves the active tab after standalone pins take priority', () => {
  const tabs = [
    ...Array.from({ length: 9 }, (_, index) => ({
      id: `pin-${index}`,
      groupId: null,
      pinned: true,
    })),
    ...Array.from({ length: 4 }, (_, index) => ({
      id: `work-${index}`,
      groupId: 'work',
      pinned: false,
    })),
  ];
  const { pinned, section, shown, hidden } = visibleDots(tabs, 'work-3');

  assert.equal(pinned.length, 7);
  assert.deepEqual(section.map((tab) => tab.id), ['work-3']);
  assert.equal(shown.length, 8);
  assert.ok(shown.some((tab) => tab.id === 'work-3'));
  assert.equal(hidden, 5);
});

test('the active-section window slides to retain a late active tab', () => {
  const tabs = Array.from({ length: 10 }, (_, index) => ({
    id: `work-${index}`,
    groupId: 'work',
    pinned: false,
  }));
  const { section, shown, hidden } = visibleDots(tabs, 'work-9');

  assert.deepEqual(section.map((tab) => tab.id), [
    'work-2', 'work-3', 'work-4', 'work-5',
    'work-6', 'work-7', 'work-8', 'work-9',
  ]);
  assert.equal(shown.length, 8);
  assert.equal(hidden, 2);
});

test('quiet state changes neither direct dots nor the global remainder', () => {
  const tabs = [
    { id: 'pin', groupId: null, pinned: true, asleep: false },
    { id: 'active', groupId: 'work', pinned: false, asleep: false },
    { id: 'direct-quiet', groupId: 'work', pinned: false, asleep: true },
    { id: 'overflow-quiet', groupId: 'play', pinned: false, asleep: true },
  ];
  const awake = visibleDots(tabs, 'active');
  const toggled = visibleDots(tabs.map((tab) => ({ ...tab, asleep: !tab.asleep })), 'active');

  assert.deepEqual(awake.shown.map((tab) => tab.id), ['pin', 'active', 'direct-quiet']);
  assert.deepEqual(toggled.shown.map((tab) => tab.id), ['pin', 'active', 'direct-quiet']);
  assert.equal(awake.hidden, 1);
  assert.equal(toggled.hidden, 1);
});

test('direct dots expose stable tab ids instead of relying on non-unique titles', () => {
  assert.match(source, /dot\.dataset\.tabId = t\.id/);
});

test('pinned and active-section dots use spacing alone as their separator', () => {
  assert.match(source, /sectionNodes\[0\]\.classList\.add\('dot-section-start'\)/);
  assert.match(styles, /\.island-dot\.dot-section-start\s*\{\s*margin-left:\s*4px;\s*\}/);
  assert.doesNotMatch(styles, /\.dot-section-start[^}]*border/s);
});

test('overflow copy describes the window-wide remainder, not the active group', () => {
  assert.match(source, /more \$\{hidden === 1 \? 'tab' : 'tabs'\} — open the list/);
  assert.doesNotMatch(source, /more \$\{hidden === 1 \? 'tab' : 'tabs'\} in this group/);
});
