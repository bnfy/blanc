'use strict';
// Names a user gives synced devices (spec 2026-10-16-island-lower-section-design.md §7).
const assert = require('node:assert/strict');
const test = require('node:test');

const {
  MAX_DEVICE_NAME,
  MAX_DEVICE_NAME_ENTRIES,
  normalizeDeviceNames,
  setDeviceNameEntry,
  mergeDeviceNames,
  resolveDeviceName,
  deviceNamesEqual,
} = require('../../src/main/device-names');

const NEO = '2f1c9a52-6a1e-4b8e-9d0a-1d2c3b4a5f60';
const MINI = '7c0d4e1b-1b2a-4c3d-8e9f-0a1b2c3d4e5f';

test('the limits match the published-name cap', () => {
  assert.equal(MAX_DEVICE_NAME, 80);
  assert.equal(MAX_DEVICE_NAME_ENTRIES, 64);
});

test('setDeviceNameEntry trims, caps and stamps the entry without touching the input', () => {
  const before = {};
  const map = setDeviceNameEntry(before, NEO, '  Work laptop ', { at: 100, tie: 'a' });
  assert.deepEqual(map, { [NEO]: { name: 'Work laptop', at: 100, tie: 'a' } });
  assert.deepEqual(before, {}, 'the input is not mutated');
  const long = setDeviceNameEntry(map, NEO, 'x'.repeat(81), { at: 101, tie: 'a' });
  assert.equal(long[NEO].name, 'x'.repeat(80));
  assert.deepEqual(setDeviceNameEntry(map, 'not an id!', 'Nope', { at: 102, tie: 'a' }), map);
});

test('renames of two different devices on two Macs both survive, in either merge order', () => {
  const macA = setDeviceNameEntry({}, NEO, 'Work laptop', { at: 100, tie: 'a' });
  const macB = setDeviceNameEntry({}, MINI, 'Studio', { at: 101, tie: 'b' });
  const expected = {
    [NEO]: { name: 'Work laptop', at: 100, tie: 'a' },
    [MINI]: { name: 'Studio', at: 101, tie: 'b' },
  };
  assert.deepEqual(mergeDeviceNames(macA, macB), expected);
  assert.deepEqual(mergeDeviceNames(macB, macA), expected);
});

test('for the same device the later rename wins, and a later clear beats an older name', () => {
  const named = setDeviceNameEntry({}, NEO, 'Work laptop', { at: 100, tie: 'a' });
  const renamed = setDeviceNameEntry({}, NEO, 'Old Mac', { at: 200, tie: 'b' });
  assert.equal(mergeDeviceNames(named, renamed)[NEO].name, 'Old Mac');
  assert.equal(mergeDeviceNames(renamed, named)[NEO].name, 'Old Mac');
  const cleared = setDeviceNameEntry(named, NEO, '   ', { at: 300, tie: 'a' });
  assert.deepEqual(cleared[NEO], { name: '', at: 300, tie: 'a' }, 'an empty name is kept as a clear');
  assert.equal(mergeDeviceNames(renamed, cleared)[NEO].name, '');
  assert.equal(mergeDeviceNames(cleared, renamed)[NEO].name, '');
});

test('an equal clock resolves the same way on both sides', () => {
  const a = { [NEO]: { name: 'Zed', at: 100, tie: 'aaa' } };
  const b = { [NEO]: { name: 'Alpha', at: 100, tie: 'bbb' } };
  assert.equal(mergeDeviceNames(a, b)[NEO].name, 'Zed', 'the smaller tie-breaker wins');
  assert.equal(mergeDeviceNames(b, a)[NEO].name, 'Zed');
  const c = { [NEO]: { name: 'Zed', at: 100, tie: 'same' } };
  const d = { [NEO]: { name: 'Alpha', at: 100, tie: 'same' } };
  assert.equal(mergeDeviceNames(c, d)[NEO].name, 'Alpha', 'then the smaller name');
  assert.equal(mergeDeviceNames(d, c)[NEO].name, 'Alpha');
});

test('the map keeps only the newest 64 entries', () => {
  const big = {};
  for (let i = 0; i < 65; i++) big[`device-${String(i).padStart(2, '0')}`] = { name: `D${i}`, at: 1000 + i, tie: '' };
  const kept = normalizeDeviceNames(big);
  assert.equal(Object.keys(kept).length, 64);
  assert.equal(kept['device-00'], undefined, 'the oldest entry is dropped');
  assert.equal(kept['device-64'].name, 'D64');
  assert.equal(Object.keys(mergeDeviceNames(big, {})).length, 64, 'a merge is bounded too');
});

test('invalid ids and entries are dropped', () => {
  const kept = normalizeDeviceNames({
    [NEO]: { name: 'Fine', at: 5, tie: 't' },
    'bad id': { name: 'Space in id', at: 5, tie: '' },
    ['x'.repeat(65)]: { name: 'Too long an id', at: 5, tie: '' },
    __proto__: { name: 'Prototype', at: 5, tie: '' },
    'no-name': { at: 5, tie: '' },
    'zero-at': { name: 'Zero', at: 0, tie: '' },
    'float-at': { name: 'Float', at: 1.5, tie: '' },
    'not-object': 'Name',
    'long-tie': { name: 'Long tie', at: 5, tie: 'x'.repeat(129) },
    'no-tie': { name: 'No tie', at: 5 },
  });
  assert.deepEqual(Object.keys(kept).sort(), [NEO, 'long-tie', 'no-tie'].sort());
  assert.equal(kept['long-tie'].tie, '', 'an unusable tie-breaker becomes empty');
  assert.equal(kept['no-tie'].tie, '');
  assert.deepEqual(normalizeDeviceNames(null), {});
  assert.deepEqual(normalizeDeviceNames([{ name: 'x', at: 1 }]), {});
  assert.deepEqual(normalizeDeviceNames('names'), {});
});

test('resolveDeviceName prefers a chosen name and falls back on a clear or no entry', () => {
  const map = {
    [NEO]: { name: 'Work laptop', at: 100, tie: '' },
    [MINI]: { name: '', at: 100, tie: '' },
  };
  assert.equal(resolveDeviceName(map, NEO, 'MacBook Neo'), 'Work laptop');
  assert.equal(resolveDeviceName(map, MINI, 'Mac mini'), 'Mac mini');
  assert.equal(resolveDeviceName(map, 'other-device', 'Linux box'), 'Linux box');
  assert.equal(resolveDeviceName(null, NEO, 'MacBook Neo'), 'MacBook Neo');
  assert.equal(resolveDeviceName(map, 'constructor', 'Windows PC'), 'Windows PC', 'inherited keys are not entries');
});

test('deviceNamesEqual ignores key order and invalid entries', () => {
  const a = { [NEO]: { name: 'A', at: 1, tie: '' }, [MINI]: { name: 'B', at: 2, tie: '' } };
  const b = { [MINI]: { name: 'B', at: 2, tie: '' }, [NEO]: { name: 'A', at: 1, tie: '' }, 'bad id': {} };
  assert.equal(deviceNamesEqual(a, b), true);
  assert.equal(deviceNamesEqual(a, { [NEO]: { name: 'A', at: 1, tie: '' } }), false);
  assert.equal(deviceNamesEqual({}, undefined), true);
});
