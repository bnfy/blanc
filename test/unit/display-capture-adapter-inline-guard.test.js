'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const moduleApi = require('../../src/main/display-capture-adapter-constraints');

function loadInlineApi() {
  const preload = fs.readFileSync(
    path.join(__dirname, '../../src/main/capture-preload-linux.js'),
    'utf8',
  );
  const match = preload.match(/\/\/ >>> adapter-constraints\n([\s\S]*?)\n  \/\/ <<< adapter-constraints/);
  assert.ok(match, 'adapter-constraints markers missing from capture-preload.js');
  const sandbox = { exports: {} };
  vm.createContext(sandbox);
  vm.runInContext(
    `${match[1]}\nexports.sanitizeAdapterSnapshot = sanitizeAdapterSnapshot;\nexports.buildAdapterCapabilities = buildAdapterCapabilities;\nexports.resolveAdapterConstraints = resolveAdapterConstraints;`,
    sandbox,
  );
  return sandbox.exports;
}

test('inline adapter and module agree on sanitize, capabilities, and resolve', () => {
  const inline = loadInlineApi();
  const dirty = {
    settings: { width: 1024, height: 768, frameRate: 30, deviceId: 'x', groupId: 'y' },
    capabilities: { width: { min: 1, max: 1024 }, deviceId: 'x' },
  };
  const same = (a, b) => assert.equal(JSON.stringify(a), JSON.stringify(b));
  same(inline.sanitizeAdapterSnapshot(dirty), moduleApi.sanitizeAdapterSnapshot(dirty));
  same(
    inline.buildAdapterCapabilities({ width: 1024, height: 768, frameRate: 30 }),
    moduleApi.buildAdapterCapabilities({ width: 1024, height: 768, frameRate: 30 }),
  );
  const caps = moduleApi.buildAdapterCapabilities({ width: 1024, height: 768, frameRate: 30 });
  const current = { width: 1024, height: 768, frameRate: 30 };
  for (const requested of [
    { width: { max: 1920 }, height: { max: 1080 }, frameRate: { min: 0, ideal: 30 } },
    { width: { ideal: 1920 } },
    { width: { min: 1920 } },
    { frameRate: { exact: 60 } },
    { width: { min: 900, max: 800 } },
    { width: { exact: 640 }, height: { exact: 480 } },
  ]) {
    same(
      inline.resolveAdapterConstraints(caps, current, requested),
      moduleApi.resolveAdapterConstraints(caps, current, requested),
    );
  }
});
