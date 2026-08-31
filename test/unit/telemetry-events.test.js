'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  PING_ENDPOINT,
  EVENT_ENDPOINT,
  createTelemetrySender,
  productUsageAllowed,
} = require('../../src/main/telemetry');

function senderHarness({ packaged = true } = {}) {
  const calls = [];
  const sender = createTelemetrySender({
    isPackaged: () => packaged,
    fetchImpl: async (url, init) => { calls.push({ url, ...init }); },
    getInstallId: () => '01234567-89ab-4cde-8f01-23456789abcd',
    getVersion: () => '1.10.0',
    platform: 'darwin',
    arch: 'arm64',
    getSystemVersion: () => '26.4.1',
    random: () => 0.5,
    newtabLayouts: ['ledger', 'billboard', 'shelf', 'tally', 'mahjong'],
    warn: () => {},
  });
  return { sender, calls };
}

test('launch and product usage share one narrow pseudonymous session payload', () => {
  const { sender, calls } = senderHarness();

  assert.equal(sender.sendLaunchPing(), true);
  assert.equal(sender.sendMahjongPlay(), true);
  assert.equal(sender.sendNewtabLayoutUsed('shelf'), true);
  assert.equal(calls.length, 3);

  const launch = JSON.parse(calls[0].body);
  const mahjong = JSON.parse(calls[1].body);
  const layout = JSON.parse(calls[2].body);
  assert.equal(calls[0].url, PING_ENDPOINT);
  assert.equal(calls[1].url, EVENT_ENDPOINT);
  assert.equal(calls[2].url, EVENT_ENDPOINT);
  assert.deepEqual(launch, {
    installId: '01234567-89ab-4cde-8f01-23456789abcd',
    sessionId: 0x3fffffff,
    version: '1.10.0',
    platform: 'darwin',
    arch: 'arm64',
    osVersion: '26',
  });
  assert.deepEqual(mahjong, { ...launch, event: 'mahjong_play' });
  assert.deepEqual(layout, { ...launch, event: 'newtab_layout', layout: 'shelf' });
});

test('each fixed product metric is sent at most once per app session', () => {
  const { sender, calls } = senderHarness();

  assert.equal(sender.sendMahjongPlay(), true);
  assert.equal(sender.sendMahjongPlay(), false);
  assert.equal(sender.sendNewtabLayoutUsed('ledger'), true);
  assert.equal(sender.sendNewtabLayoutUsed('ledger'), false);
  assert.equal(sender.sendNewtabLayoutUsed('tally'), true);
  assert.equal(calls.length, 3);
});

test('development builds and unknown layout values send nothing', () => {
  const dev = senderHarness({ packaged: false });
  assert.equal(dev.sender.sendLaunchPing(), false);
  assert.equal(dev.sender.sendMahjongPlay(), false);
  assert.equal(dev.sender.sendNewtabLayoutUsed('ledger'), false);
  assert.equal(dev.calls.length, 0);

  const packaged = senderHarness();
  for (const value of ['', 'unknown', '../../history', null, 1]) {
    assert.equal(packaged.sender.sendNewtabLayoutUsed(value), false);
  }
  assert.equal(packaged.calls.length, 0);
});

test('product usage requires saved consent and never reports a private tab', () => {
  assert.equal(productUsageAllowed({ firstRunComplete: true, usagePing: true, privateTab: false }), true);
  assert.equal(productUsageAllowed({ firstRunComplete: false, usagePing: true, privateTab: false }), false);
  assert.equal(productUsageAllowed({ firstRunComplete: true, usagePing: false, privateTab: false }), false);
  assert.equal(productUsageAllowed({ firstRunComplete: true, usagePing: true, privateTab: true }), false);
});

test('a synchronous or asynchronous network failure remains fire-and-forget', async () => {
  for (const fetchImpl of [
    () => { throw new Error('offline'); },
    () => Promise.reject(new Error('blocked')),
  ]) {
    const sender = createTelemetrySender({
      isPackaged: () => true,
      fetchImpl,
      getInstallId: () => '01234567-89ab-4cde-8f01-23456789abcd',
      getVersion: () => '1.10.0',
      platform: 'darwin',
      arch: 'arm64',
      getSystemVersion: () => '26.4.1',
      random: () => 0,
      newtabLayouts: ['ledger'],
      warn: () => {},
    });
    assert.equal(sender.sendMahjongPlay(), true);
  }
  await new Promise((resolve) => setImmediate(resolve));
});
