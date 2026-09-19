'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const {
  sanitizeAdapterSnapshot,
  buildAdapterCapabilities,
  resolveAdapterConstraints,
} = require('../../src/main/display-capture-adapter-constraints');

const SOURCE_1024 = {
  settings: { width: 1024, height: 768, frameRate: 30, deviceId: 'secret-device', groupId: 'secret-group' },
  capabilities: {
    width: { min: 1, max: 1024 },
    height: { min: 1, max: 768 },
    frameRate: { min: 0, max: 30 },
    deviceId: 'secret-device',
    groupId: 'secret-group',
  },
};

test('sanitizeAdapterSnapshot strips source and device identifiers', () => {
  const clean = sanitizeAdapterSnapshot(SOURCE_1024);
  assert.equal(clean.settings.deviceId, undefined);
  assert.equal(clean.settings.groupId, undefined);
  assert.equal(clean.capabilities.deviceId, undefined);
  assert.equal(clean.capabilities.groupId, undefined);
  assert.equal(clean.settings.width, 1024);
  assert.equal(clean.capabilities.width.max, 1024);
});

test('buildAdapterCapabilities describes downscale-only adapter support from source', () => {
  const caps = buildAdapterCapabilities(sanitizeAdapterSnapshot(SOURCE_1024).settings);
  assert.deepEqual(caps.width, { min: 1, max: 1024 });
  assert.deepEqual(caps.height, { min: 1, max: 768 });
  assert.ok(caps.frameRate.max >= 30);
  assert.equal(caps.deviceId, undefined);
  assert.equal(caps.groupId, undefined);
});

test('larger max than source succeeds and keeps source-sized output', () => {
  const caps = buildAdapterCapabilities({ width: 1024, height: 768, frameRate: 30 });
  const result = resolveAdapterConstraints(caps, { width: 1024, height: 768, frameRate: 30 }, {
    width: { max: 1920 },
    height: { max: 1080 },
    frameRate: { min: 0, ideal: 30 },
  });
  assert.equal(result.ok, true);
  assert.equal(result.settings.width, 1024);
  assert.equal(result.settings.height, 768);
  assert.equal(result.settings.frameRate, 30);
  assert.deepEqual(result.constraints.width, { max: 1920 });
});

test('oversized ideal is best-effort within adapter capabilities', () => {
  const caps = buildAdapterCapabilities({ width: 1024, height: 768, frameRate: 30 });
  const result = resolveAdapterConstraints(caps, { width: 1024, height: 768, frameRate: 30 }, {
    width: { ideal: 1920 },
    height: { ideal: 1080 },
  });
  assert.equal(result.ok, true);
  assert.equal(result.settings.width, 1024);
  assert.equal(result.settings.height, 768);
});

test('impossible required min rejects with constraint name width', () => {
  const caps = buildAdapterCapabilities({ width: 1024, height: 768, frameRate: 30 });
  const result = resolveAdapterConstraints(caps, { width: 1024, height: 768, frameRate: 30 }, {
    width: { min: 1920 },
  });
  assert.equal(result.ok, false);
  assert.equal(result.constraint, 'width');
});

test('impossible exact rejects with the failing constraint name', () => {
  const caps = buildAdapterCapabilities({ width: 1024, height: 768, frameRate: 30 });
  const result = resolveAdapterConstraints(caps, { width: 1024, height: 768, frameRate: 30 }, {
    frameRate: { exact: 60 },
  });
  assert.equal(result.ok, false);
  assert.equal(result.constraint, 'frameRate');
});

test('contradictory ranges reject', () => {
  const caps = buildAdapterCapabilities({ width: 1024, height: 768, frameRate: 30 });
  const result = resolveAdapterConstraints(caps, { width: 1024, height: 768, frameRate: 30 }, {
    width: { min: 900, max: 800 },
  });
  assert.equal(result.ok, false);
  assert.equal(result.constraint, 'width');
});

test('exact within range selects that output size', () => {
  const caps = buildAdapterCapabilities({ width: 1024, height: 768, frameRate: 30 });
  const result = resolveAdapterConstraints(caps, { width: 1024, height: 768, frameRate: 30 }, {
    width: { exact: 640 },
    height: { exact: 480 },
  });
  assert.equal(result.ok, true);
  assert.equal(result.settings.width, 640);
  assert.equal(result.settings.height, 480);
});
