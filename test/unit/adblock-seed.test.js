const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { createHash } = require('node:crypto');
const { ElectronBlocker } = require('@ghostery/adblocker-electron');
const { Request } = require('@ghostery/adblocker');
const { parseSeedManifest } = require('../../src/main/adblock-engine-loader');

const ASSETS = path.resolve(__dirname, '../../src/main/assets');
const seed = fs.readFileSync(path.join(ASSETS, 'adblock-engine-seed.bin'));
const manifest = parseSeedManifest(
  fs.readFileSync(path.join(ASSETS, 'adblock-engine-seed.json'))
);

test('packaged blocker seed matches its manifest and current engine format', () => {
  assert.equal(seed.length, manifest.byteLength);
  assert.equal(createHash('sha256').update(seed).digest('hex'), manifest.sha256);
  assert.doesNotThrow(() => ElectronBlocker.deserialize(seed));
});

test('packaged blocker seed blocks a representative EasyPrivacy request', () => {
  const engine = ElectronBlocker.deserialize(seed);
  const result = engine.match(Request.fromRawDetails({
    url: 'https://www.google-analytics.com/collect?v=1',
    sourceUrl: 'https://example.com/',
    type: 'xmlhttprequest',
  }));
  assert.equal(result.match, true);
});

test('packaged blocker seed carries redirect resources and scriptlets', () => {
  const engine = ElectronBlocker.deserialize(seed);
  assert.match(engine.resources.getScriptlet('set'), /function/);
  assert.match(engine.resources.getResource('noop.js').dataUrl, /^data:/);
});
