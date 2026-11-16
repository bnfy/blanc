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
  const stale = await call(device, 'push', {revision: 0, rows: [], windows: [], restoring: 'a'});
  assert.equal(stale.stale, true);
  assert.equal(stale.restored, undefined, 'a stale inventory must not acknowledge Undo');
  const answer = await call(device, 'push', {revision: stale.revision, rows: stale.rows,
    windows: [{id: 'window-b', workspaceId: 'b', holding: true}], restoring: 'a'});
  assert.deepEqual(answer.restored, ['a']);
  assert.equal(answer.rows.find(row => row.id === 'a').sharedId, undefined);
  assert.deepEqual(answer.rows.find(row => row.id === 'a').urls, ['https://first.example/']);
  assert.ok(Object.keys(state(device).data.windows).some(key => key.startsWith('desktop:window-b:')));
}));

test('a malformed window inventory is refused without changing the library', () => setup(async ({device, windows}) => {
  const stale = await call(device, 'push', {revision: 0, rows: [], windows: []});
  await assert.rejects(call(device, 'push', {revision: stale.revision, rows: stale.rows, windows: [windows[0], windows[0]]}), /invalid-desktop-inventory/);
  assert.equal((await call(device, 'preview', {local: true})).choices.length, 2);
}));

test('a held window resumes capture after the next complete inventory', () => setup(async ({device, windows}) => {
  const stale = await call(device, 'push', {revision: 0, rows: [], windows: []});
  const held = await call(device, 'push', {revision: stale.revision, rows: stale.rows,
    windows: windows.map(win => ({...win, holding: true}))});
  const saved = state(device).data.windows;
  const captures = windows.map(win => {
    const receipt = Object.entries(saved).find(([key]) => key.startsWith(`desktop:${win.id}:`))[1];
    const id = Object.keys(receipt.displayed.tabs)[0];
    return {...win, capture: {...win.capture, tabIds: [id]}};
  });
  captures[0].capture.meta[0].customTitle = 'After switch';
  await call(device, 'push', {revision: held.revision, rows: held.rows, windows: captures});
  const receipt = Object.entries(state(device).data.windows).find(([key]) => key.startsWith('desktop:window-a:'))[1];
  assert.equal(Object.values(receipt.displayed.tabs)[0].name.v, 'After switch');
}));

test('a failed desktop disk checkpoint cannot return a durable push receipt', () => setup(async ({device, windows}) => {
  const stale = await call(device, 'push', {revision: 0, rows: [], windows: []});
  const captures = windows.map(win => {
    const receipt = Object.entries(state(device).data.windows).find(([key]) => key.startsWith(`desktop:${win.id}:`))[1];
    return {...win, capture: {...win.capture, tabIds: [Object.keys(receipt.displayed.tabs)[0]]}};
  });
  device.context.__host.persistDesktopStore = () => false;
  const result = await call(device, 'push', {revision: stale.revision, rows: stale.rows, windows: captures});
  assert.equal(result.durable, false);
}));

test('desktop row delivery includes the accepted group layout before the native checkpoint', () => setup(async ({device, windows}) => {
  const store = state(device);
  const receipt = Object.entries(store.data.windows).find(([key]) => key.startsWith('desktop:window-a:'))[1];
  const groupId = 'e'.repeat(32), model = device.module('shared-spaces-model');
  const stamp = value => model.field(value, Date.now() + 1000, 'independent-peer');
  const group = {name: stamp('Peer group'), color: stamp(null), collapsed: stamp(false),
    pos: stamp(model.keyFor('', '', groupId)), deleted: stamp(false)};
  store.update(data => {data.blobs[receipt.spaceId].blob.groups[groupId] = group;});
  const delivered = [];
  device.context.__host.emit = (event, json) => {
    if (event !== 'desktop-spaces-row') return;
    const payload = JSON.parse(json); delivered.push(payload);
    const win = windows.find(w => w.id === payload.windowId);
    const captureNow = {...win.capture, tabIds: Object.keys(receipt.displayed.tabs),
      groups: [{id: groupId, name: 'Peer group', color: null, collapsed: false}]};
    device.context.__call('desktop.spaces.rowDone', JSON.stringify([payload.windowId,
      payload.workspaceId, payload.token, true, captureNow]), () => {});
  };
  const stale = await call(device, 'push', {revision: 0, rows: [], windows: []});
  const captures = windows.map(win => {
    const saved = Object.entries(store.data.windows).find(([key]) => key.startsWith(`desktop:${win.id}:`))[1];
    return {...win, capture: {...win.capture, tabIds: Object.keys(saved.displayed.tabs)}};
  });
  await call(device, 'push', {revision: stale.revision, rows: stale.rows, windows: captures});
  const row = delivered.find(p => p.row.kind === 'groups');
  assert.ok(row);
  assert.equal(row.windowId, 'window-a');
  assert.deepEqual(row.layout.groups, [groupId]);
  assert.equal(row.layout.blob.groups[groupId].name.v, 'Peer group');
  assert.ok(!delivered.some(p => p.windowId === 'window-b'), 'other Space receives no group row');
}));


test('two pending Undo operations survive one inventory acknowledgement', () => setup(async ({device, windows}) => {
  await call(device, 'metadata', 'a', {deleted: true});
  await call(device, 'metadata', 'b', {deleted: true});
  const stale = await call(device, 'push', {revision: 0, rows: [], windows: [], restoring: ['a', 'b']});
  assert.equal(stale.restored, undefined);
  const answer = await call(device, 'push', {revision: stale.revision, rows: stale.rows,
    windows: windows.map(win => ({...win, holding: true})), restoring: ['a', 'b']});
  assert.deepEqual(answer.restored, ['a', 'b']);
  assert.ok(answer.rows.every(row => !row.sharedId));
  assert.deepEqual(answer.rows.map(row => row.urls), [['https://first.example/'], ['https://second.example/']]);
}));

test('cold closes replay durable intent before capture without echoing a local close', () => setup(async ({device, windows}) => {
  const store = state(device), [key, saved] = Object.entries(store.data.windows).find(([key]) => key.startsWith('desktop:window-a:'));
  const id = Object.keys(saved.displayed.tabs)[0], model = device.module('shared-spaces-model');
  const deleted = model.field(true, Date.now() + 1000, 'independent-peer');
  store.update(data => {
    data.blobs[saved.spaceId].blob.tabs[id].deleted = deleted;
    data.windows[key].accepted = [{op: 'close', kind: 'tabs', id, field: 'deleted', value: deleted}];
  });
  store.flush();
  assert.deepEqual(await call(device, 'coldRestore'), [{windowId: 'window-a', spaceId: saved.spaceId, tabIds: [id], navigations: []}]);
  assert.equal(store.data.windows[key].displayed.tabs[id].deleted.v, false, 'planning never acknowledges a close');
  const stale = await call(device, 'push', {revision: 0, rows: [], windows: []});
  const captures = windows.map(win => {
    const receipt = Object.entries(store.data.windows).find(([key]) => key.startsWith(`desktop:${win.id}:`))[1];
    return {...win, capture: {...win.capture, tabIds: Object.keys(receipt.displayed.tabs)}};
  });
  // A failed native removal must leave both intent and the displayed receipt.
  captures[0].protectedIds = [id];
  const retained = await call(device, 'push', {revision: stale.revision, rows: stale.rows, windows: captures});
  assert.equal(store.data.windows[key].displayed.tabs[id].deleted.v, false);
  assert.ok(store.data.windows[key].accepted.some(row => row.id === id && row.op === 'close'));
  captures[0].capture = capture(['chrome://newtab/']);
  await call(device, 'push', {revision: retained.revision, rows: retained.rows, windows: captures});
  assert.deepEqual(store.data.windows[key].displayed.tabs[id].deleted, deleted);
  assert.deepEqual(store.data.blobs[saved.spaceId].blob.tabs[id].deleted, deleted, 'no newer local deletion is invented');
  assert.equal(store.data.windows[key].accepted.some(row => row.id === id && row.op === 'close'), false);
  // Chromium may have died before its session commands reached disk. A second
  // restore of that older session receives the same tombstone, not a new tab.
  assert.deepEqual(await call(device, 'coldRestore'), [{windowId: 'window-a', spaceId: saved.spaceId, tabIds: [id], navigations: []}]);
}));

test('cold navigation is journaled before replay and acknowledged without a local navigation echo', () => setup(async ({device, windows}) => {
  const store = state(device), [key, saved] = Object.entries(store.data.windows).find(([key]) => key.startsWith('desktop:window-a:'));
  const id = Object.keys(saved.displayed.tabs)[0], model = device.module('shared-spaces-model');
  const value = model.field({url: 'https://remote.example/', title: 'Remote'}, Date.now() + 1000, 'independent-peer');
  store.update(data => {
    data.blobs[saved.spaceId].blob.tabs[id].nav = value;
    data.windows[key].accepted = [{op: 'nav', kind: 'tabs', id, field: 'nav', value}];
  });
  store.flush();
  const plan = await call(device, 'coldRestore');
  assert.equal(plan.length, 1); assert.deepEqual(plan[0].tabIds, []);
  assert.deepEqual(plan[0].navigations[0], {id, from: 'https://first.example/', ...value.v,
    token: JSON.stringify([id, value.c, value.by, value.v.url])});
  assert.equal(store.data.windows[key].displayed.tabs[id].nav.v.url, 'https://first.example/');
  assert.deepEqual(JSON.parse(JSON.stringify(store.data.windows[key].desktopColdNavigation[id])),
    JSON.parse(JSON.stringify({from: 'https://first.example/', value})));
  const stale = await call(device, 'push', {revision: 0, rows: [], windows: []});
  const captures = windows.map(win => {
    const receipt = Object.entries(store.data.windows).find(([key]) => key.startsWith(`desktop:${win.id}:`))[1];
    return {...win, capture: {...win.capture, tabIds: Object.keys(receipt.displayed.tabs)}};
  });
  captures[0].capture.urls[0] = value.v.url;
  captures[0].capture.meta[0].title = value.v.title;
  await call(device, 'push', {revision: stale.revision, rows: stale.rows, windows: captures});
  assert.deepEqual(store.data.windows[key].displayed.tabs[id].nav, value);
  assert.deepEqual(store.data.blobs[saved.spaceId].blob.tabs[id].nav, value);
  assert.equal(store.data.windows[key].accepted.some(row => row.id === id && row.op === 'nav'), false);
  assert.deepEqual(await call(device, 'coldRestore'), plan, 'same field identity repairs an older native checkpoint');
}));

test('remote changes request a fresh native capture before applying any layout', () => setup(async ({device}) => {
  const events = [];
  device.context.__host.emit = name => events.push(name);
  const store = state(device), index = structuredClone(store.data.index);
  const id = Object.keys(index.spaces)[0];
  index.spaces[id].name = device.module('shared-spaces-model').field('Remote title', Date.now() + 1000, 'independent-peer');
  device.module('shared-spaces').mergeIndex(index, device.sync.sharedContext());
  await new Promise(resolve => setImmediate(resolve));
  assert.ok(events.includes('desktop-spaces-refresh'));
  assert.equal(events.some(event => ['desktop-spaces-layout', 'desktop-spaces-row'].includes(event)), false,
    'a cached capture cannot overwrite a native edit that has not been captured yet');
}));

test('cold recovery retains native group identity after later shared-id captures', () => setup(async ({device, windows}) => {
  const native = 'ABCDEF0123456789ABCDEF0123456789';
  const store = state(device);
  const stale = await call(device, 'push', {revision: 0, rows: [], windows: []});
  const captures = windows.map(win => {
    const receipt = Object.entries(store.data.windows).find(([key]) => key.startsWith(`desktop:${win.id}:`))[1];
    return {...win, capture: {...win.capture, tabIds: Object.keys(receipt.displayed.tabs)}};
  });
  captures[0].capture.groups = [{id: native, name: 'Research', color: null, collapsed: false}];
  captures[0].capture.groupIds = [native];
  captures[0].capture.nativeGroupBindings = {[native]: native};
  const answer = await call(device, 'push', {revision: stale.revision, rows: stale.rows, windows: captures});
  const [key, saved] = Object.entries(store.data.windows).find(([key]) => key.startsWith('desktop:window-a:'));
  const shared = saved.desktopNativeGroups[native];
  assert.ok(shared && shared !== native);
  assert.equal(saved.displayed.groups[shared].deleted.v, false);
  captures[0].capture.groups[0].id = shared;
  captures[0].capture.groupIds = [shared];
  captures[0].capture.nativeGroupBindings[native] = shared;
  await call(device, 'push', {revision: answer.revision, rows: answer.rows, windows: captures});
  assert.equal(store.data.windows[key].groupBindings[shared], shared, 'later diff uses shared identity');
  assert.equal(store.data.windows[key].desktopNativeGroups[native], shared, 'native identity is still durable');
  const plan = (await call(device, 'coldRestore')).find(plan => plan.windowId === 'window-a');
  assert.equal(plan.groupBindings[native], shared);
  assert.deepEqual(plan.tabIds, []); assert.deepEqual(plan.navigations, []);
}));


test('a new index queues missing desktop Space blobs before an unrelated full pass finishes', () => setup(async ({device}) => {
  const spaces = device.module('shared-spaces'), ctx = device.sync.sharedContext();
  const store = state(device), index = structuredClone(store.data.index);
  const template = structuredClone(Object.values(index.spaces)[0]);
  const missing = '1'.repeat(32), dormant = '2'.repeat(32), removed = '3'.repeat(32);
  const stamp = value => device.module('shared-spaces-model').field(value, Date.now() + 1000, 'independent-peer');
  for (const id of [missing, dormant, removed]) index.spaces[id] = {...structuredClone(template), name: stamp(id), rev: 'new-revision'};
  index.spaces[removed].deleted = stamp(true);
  spaces.setDormant([dormant], ctx);
  const original = device.sync.syncNow, calls = [];
  let finish;
  device.sync.syncNow = (names, options) => {calls.push({names: [...names], options: {...options}}); return new Promise(resolve => {finish = resolve;});};
  try {
    spaces.mergeIndex(index, ctx);
    assert.deepEqual(calls, [{names: ['space-' + missing], options: {ahead: true}}],
      'discovery does not wait for the full-pass drain or fetch dormant/deleted Spaces');
    index.spaces[missing].name = stamp('Renamed before download');
    spaces.mergeIndex(index, ctx);
    assert.equal(calls.length, 1, 'the same missing revision cannot create a request storm');
    assert.equal(!!store.data.blobs[missing], false, 'no invented blob or visible Space');
  } finally {finish?.({ok: false}); device.sync.syncNow = original;}
}));
