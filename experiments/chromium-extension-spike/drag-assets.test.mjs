import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { prepareDragAsset } from './drag-assets.mjs';

const source = fs.readFileSync(new URL('../../src/renderer/tab-drag.js', import.meta.url), 'utf8');
const sandbox = {};
vm.runInNewContext(prepareDragAsset(source), sandbox);
const resolve = sandbox.blancTabDrag.resolveTabDrop;
const row = (id, top, pinned = false) => ({ id, top, bottom: top + 32, pinned });
const section = (kind, top, bottom, rows) => ({ kind, groupId: null, top, bottom, rows });
const tab = (id, pinned = false) => ({ kind: 'tab', id, pinned, groupId: null });

test('empty pinned section cannot swallow the first loose-tab gap', () => {
  const model = { top: 65, bottom: 161, sections: [
    section('pinned', 65, 65, []),
    section('loose', 65, 161, [row('A', 65), row('N', 97), row('B', 129)]),
  ] };
  assert.equal(resolve(model, tab('B'), 73)?.intent.beforeId, 'A');
});

test('coincident boundary accepts each source only into its own bucket', () => {
  const model = { top: 0, bottom: 128, sections: [
    section('pinned', 0, 64, [row('P', 0, true), row('Q', 32, true)]),
    section('loose', 64, 128, [row('A', 64), row('B', 96)]),
  ] };
  assert.equal(resolve(model, tab('B'), 64)?.intent.beforeId, 'A');
  assert.equal(resolve(model, tab('P', true), 64)?.intent.beforeId, null);
  assert.equal(resolve(model, tab('B'), 5), null);
  assert.equal(resolve(model, tab('P', true), 120), null);
});

test('a pinned source still prefers the pinned section beside empty loose', () => {
  const model = { top: 0, bottom: 64, sections: [
    section('pinned', 0, 64, [row('P', 0, true), row('Q', 32, true)]),
    section('loose', 64, 64, []),
  ] };
  assert.equal(resolve(model, tab('P', true), 64)?.intent.beforeId, null);
});

test('preparation refuses a missing or repeated resolver anchor', () => {
  assert.throws(() => prepareDragAsset('changed'), /anchor changed/);
  assert.throws(() => prepareDragAsset(source + source), /anchor changed/);
});
