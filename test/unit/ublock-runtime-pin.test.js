'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { verifyRuntimePins, checkRuntime } = require('../../scripts/check-ublock-runtime.cjs');
const matrix = require('../../src/main/ublock-platforms.json');
const metadata = require('../../package.json');
const lock = require('../../package-lock.json');
test('uBO acceptance matrix follows the locked official Electron build', () => checkRuntime());
test('dependency updates and build overrides cannot silently invalidate uBO support', () => {
  const newer = structuredClone(lock);
  newer.packages['node_modules/electron'].version = '44.6.0';
  assert.throws(() => verifyRuntimePins({ metadata, lock: newer, matrix }), /differs from the locked official runtime/);
  assert.throws(() => verifyRuntimePins({ metadata, lock, matrix, runtime: '44.6.0' }), /build runtime differs/);
  const changed = structuredClone(metadata); changed.devDependencies.electron = '^44.6.0';
  assert.throws(() => verifyRuntimePins({ metadata: changed, lock, matrix }), /specification drift/);
});

test('runtime capability is explicit and a retired runtime cannot advertise uBO support', () => {
  const missing = structuredClone(matrix); delete missing.manifestV2;
  assert.throws(() => verifyRuntimePins({ metadata, lock, matrix: missing }), /declare.*Manifest V2/);
  const retired = structuredClone(matrix); retired.manifestV2 = 'retired';
  verifyRuntimePins({ metadata, lock, matrix: retired });
  retired.platforms['darwin-arm64'].enabled = true;
  assert.throws(() => verifyRuntimePins({ metadata, lock, matrix: retired }), /retired Manifest V2 cannot enable/);
});
