'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createUblockRegistry } = require('../../src/main/ublock-registry');
test('stable identity survives quiet/wake without admitting private or foreign profiles', () => {
  let wc = { id: 10, isDestroyed: () => false, getURL: () => 'https://example.org/' };
  const tabs = [
    { id: 'normal', profileId: 'default', private: false, runtimeId: 'window' },
    { id: 'private', profileId: 'default', private: true },
    { id: 'foreign', profileId: 'other', private: false },
  ];
  const registry = createUblockRegistry({ profileId: 'default', listTabs: () => tabs, listWindows: () => [],
    liveContents: tab => tab.id === 'normal' ? wc : { id: 99 } });
  const original = registry.query()[0].id;
  assert.equal(registry.query().length, 1);
  wc = null; tabs[0].asleep = true;
  assert.equal(registry.fromContents(undefined), undefined);
  assert.equal(registry.fromContents(-1), undefined);
  assert.equal(registry.query()[0].id, original); assert.equal(registry.mapping().length, 0);
  wc = { id: 11, isDestroyed: () => false, getURL: () => 'https://example.org/' }; tabs[0].asleep = false;
  assert.deepEqual(registry.mapping(), [{ webContentsId: 11, tabId: original }]);
  assert.equal(registry.fromContents(99), undefined);
});
test('request metadata retains actual frame ancestry, initiator, headers and redirects', () => {
  const root = { parent: null, frameTreeNodeId: 10, url: 'https://root.test/' };
  const frame = { parent: root, frameTreeNodeId: 22, url: 'https://frame.test/' };
  const wc = { id: 1, isDestroyed: () => false, getURL: () => root.url };
  const registry = createUblockRegistry({ profileId: 'default', listTabs: () => [{ id: 'a', profileId: 'default' }],
    listWindows: () => [], liveContents: () => wc });
  const value = registry.request({ id: 100, webContentsId: 1, frame, resourceType: 'subFrame',
    url: 'https://new.test/', method: 'POST', timestamp: 1700000000250, initiatorOrigin: 'https://initiator.test',
    responseHeaders: { 'Content-Security-Policy': ['first', 'second'] }, redirectURL: 'https://redirect.test/' });
  assert.equal(value.tabId, 1); assert.equal(value.frameId, 22); assert.equal(value.parentFrameId, 0);
  assert.equal(value.type, 'sub_frame'); assert.equal(value.method, 'POST');
  assert.equal(value.initiator, 'https://initiator.test'); assert.equal(value.redirectUrl, 'https://redirect.test/');
  assert.equal(value.responseHeaders.length, 2);
  assert.equal(value.timeStamp, 1700000000250);
});
