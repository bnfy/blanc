import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require = createRequire(import.meta.url);
const {peer} = require('../tests/android/support/sync-peer.cjs');
const {createSyncFixture} = require('../../test/desktop/support/sync-fixture.js');
const capture = urls => ({urls, localIds: urls.map((_, i) => `local-${i}`), tabIds: urls.map(() => null),
  meta: urls.map(() => ({title: 'Title', customTitle: 'Local name'})), pinned: urls.map(() => false),
  groupIds: urls.map(() => null), groups: [], activeIndex: 0, documentPolicy: 1,
  inheritsDocumentPolicy: urls.map(() => false), localFiles: urls.map(() => false)});
const call = (device, method, ...args) => new Promise((resolve, reject) => device.context.__call(
  `desktop.spaces.${method}`, JSON.stringify(args), (ok, value) => ok ? resolve(JSON.parse(value)) : reject(Error(value))));
async function setup(body) {
  const worker = await createSyncFixture();
  const device = peer('Desktop', worker.url, {platform: 'macos'});
  const reopen = setInterval(() => {
    device.sync.resetRequestWindowForTest();
    for (const key of [...worker.env.records.keys()]) if (/^(rl|ip):/.test(key)) worker.env.records.delete(key);
  }, 100);
  try {
    assert.equal((await device.sync.startNew({handle: 'desktop-spaces'})).ok, true);
    const a = {id: 'a', name: 'First', ...capture(['https://first.example/'])};
    const b = {id: 'b', name: 'Second', ...capture(['https://second.example/'])};
    const windows = [{id: 'window-a', workspaceId: 'a', capture: capture(a.urls)},
      {id: 'window-b', workspaceId: 'b', capture: capture(b.urls)}];
    await call(device, 'push', {revision: 0, rows: [a, b], windows});
    assert.equal((await call(device, 'apply', {enabled: true, selections: [{id: 'a', mode: 'copy'}, {id: 'b', mode: 'copy'}]})).ok, true);
    await body({device, windows, worker});
  } finally {clearInterval(reopen); await worker.close();}
}
const state = device => device.module('shared-spaces').rebind(device.sync.sharedContext().accountId);

test('desktop sharing retains two independent window receipts and full metadata', () => setup(async ({device}) => {
  const receipts = state(device).data.windows;
  assert.equal(Object.keys(receipts).length, 2);
  assert.ok(Object.keys(receipts).some(key => key.startsWith('desktop:window-a:')));
  assert.ok(Object.keys(receipts).some(key => key.startsWith('desktop:window-b:')));
  for (const receipt of Object.values(receipts)) {
    assert.equal(Object.values(receipt.displayed.tabs)[0].name.v, 'Local name');
  }
}));

test('reconciliation never removes either open Space, including a held window', () => setup(async ({device, windows}) => {
  await call(device, 'hold', 'window-b');
  assert.equal(await call(device, 'metadata', 'a', {deleted: true}), true);
  assert.equal(await call(device, 'metadata', 'b', {deleted: true}), true);
  const preview = await call(device, 'preview', {local: true});
  const rows = preview.choices.map(choice => ({id: choice.id, name: choice.name, ...capture([`https://${choice.id}.example/`])}));
  // Stale native snapshots are refused before they can overwrite shared IDs.
  const stale = await call(device, 'push', {revision: 0, rows, windows});
  assert.equal(stale.stale, true);
  const current = await call(device, 'push', {revision: stale.revision, rows: stale.rows,
    windows: windows.map(win => ({...win, holding: true}))});
  assert.equal(current.rows.length, 2);
  assert.equal(current.rows[0].meta[0].customTitle, 'Local name');
  assert.equal(Object.keys(state(device).data.windows).length, 2);
}));

test('Undo detaches a deleted Space as a local copy without deleting the other window receipt', () => setup(async ({device}) => {
  assert.equal(await call(device, 'metadata', 'a', {deleted: true}), true);
  const stale = await call(device, 'push', {revision: 0, rows: [], windows: []});
  const answer = await call(device, 'push', {revision: stale.revision, rows: stale.rows,
    windows: [{id: 'window-b', workspaceId: 'b', holding: true}], restoring: 'a'});
  assert.equal(answer.rows.find(row => row.id === 'a').sharedId, undefined);
  assert.deepEqual(answer.rows.find(row => row.id === 'a').urls, ['https://first.example/']);
  assert.ok(Object.keys(state(device).data.windows).some(key => key.startsWith('desktop:window-b:')));
}));

test('a malformed window inventory is refused without changing the library', () => setup(async ({device, windows}) => {
  const stale = await call(device, 'push', {revision: 0, rows: [], windows: []});
  await assert.rejects(call(device, 'push', {revision: stale.revision, rows: stale.rows, windows: [windows[0], windows[0]]}), /invalid-desktop-inventory/);
  assert.equal((await call(device, 'preview', {local: true})).choices.length, 2);
}));
