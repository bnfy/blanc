'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { pins, digest, crxZip } = require('../desktop/support/cdm-lifecycle.cjs');
test('CDM fixture digests are independently pinned for two distinct actual versions', () => {
  assert.notEqual(pins.previous.version,pins.current.version);
  for(const pin of [pins.previous,pins.current]) {
    assert.match(pin.url,/^https:\/\/www\.google\.com\/dl\//);
    assert.match(pin.source,/mozilla-firefox\/firefox\/blob\/[a-f0-9]{40}\//);
    assert.match(pin.sha512,/^[a-f0-9]{128}$/);
    assert(pin.bytes>10000000);
  }
});
test('fixture extraction rejects altered archives before parsing', () => {
  const bytes=Buffer.alloc(24);bytes.write('Cr24');bytes.writeUInt32LE(3,4);bytes.writeUInt32LE(4,8);bytes.writeUInt32LE(0x04034b50,16);
  const pin={bytes:bytes.length,sha512:digest(bytes,'sha512')};
  assert.equal(crxZip(bytes,pin).length,8);
  assert.throws(()=>crxZip(bytes,{...pin,bytes:100}));
  const changed=Buffer.from(bytes);changed[23]=1;assert.throws(()=>crxZip(changed,pin),/digest/);
});
test('lifecycle run preserves signature and sandbox checks and requires real restart and unmuted playback', () => {
  const script=fs.readFileSync('test/desktop/ecs-cdm-lifecycle.mjs','utf8');
  assert.match(script,/locator\('#drmRestart'\)\.click/);
  assert.match(script,/result\.muted,false/);
  assert.match(script,/inspectLinuxCdm\(await processId\(\),expectedBinary\)/);
  assert.match(script,/automaticVendorRollback:false/);
  assert.match(script,/initial-delay=1/);
  assert.doesNotMatch(script,/disable-cup|--no-sandbox|--disable-web-security|components\.updatesEnabled\s*=/);
  const workflow=fs.readFileSync('.github/workflows/ecs-cdm-lifecycle.yml','utf8');
  assert.match(workflow,/contents: read/);assert.match(workflow,/refs\/heads\/codex\/ecs-production-integration/);
  assert.doesNotMatch(workflow,/gh release|EVS_|APPLE_|contents: write/);
});
