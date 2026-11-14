import test from 'node:test';
import assert from 'node:assert/strict';
import { createRemoteTabsReader } from './remote-tabs-reader.mjs';
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return {promise, resolve}; };
test('read forwards native shaped devices without stripping shipping presentation fields', async () => {
  const devices = [{deviceId:'peer', name:'Desk', tabs:[{url:'https://example.org', icon:'native-icon'}], groups:[]}];
  const reader = createRemoteTabsReader(async (method, args) => {
    assert.equal(method, 'listRemoteTabs'); assert.deepEqual(args, []); return devices;
  });
  assert.equal(await reader.listRemoteTabs(), devices);
});
test('account invalidation rejects a late reply; a fresh read remains usable', async () => {
  const first = deferred(); let calls = 0;
  const reader = createRemoteTabsReader(() => ++calls === 1 ? first.promise : Promise.resolve([]));
  const pending = reader.listRemoteTabs(); reader.invalidate(); first.resolve([{deviceId:'old-account'}]);
  await assert.rejects(pending, {code:'STALE_REMOTE_TABS'});
  assert.deepEqual(await reader.listRemoteTabs(), []);
});
test('teardown rejects queued replies and prevents another native request', async () => {
  const response = deferred(); let calls = 0;
  const reader = createRemoteTabsReader(() => { calls++; return response.promise; });
  const pending = reader.listRemoteTabs(); reader.dispose(); response.resolve([]);
  await assert.rejects(pending, {code:'STALE_REMOTE_TABS'});
  await assert.rejects(reader.listRemoteTabs(), {code:'STALE_REMOTE_TABS'});
  assert.equal(calls, 1);
});
test('native failures and malformed replies never masquerade as an empty successful list', async () => {
  const failure = new Error('Native service unavailable');
  await assert.rejects(createRemoteTabsReader(async () => { throw failure; }).listRemoteTabs(), e => e === failure);
  await assert.rejects(createRemoteTabsReader(async () => ({devices:[]})).listRemoteTabs(), TypeError);
});
