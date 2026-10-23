'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pins, digest, crxZip, readCdmBinary, assertCdmVersionAbsent } = require('../desktop/support/cdm-lifecycle.cjs');
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
  assert.match(script,/automaticVendorRollback=false/);
  assert.match(script,/initial-delay=1/);
  assert.match(script,/await assertCdmVersionAbsent\(profile, fixtures.current.version\)/);
  assert.doesNotMatch(script,/disable-cup|--no-sandbox|--disable-web-security|components\.updatesEnabled\s*=/);
  const workflow=fs.readFileSync('.github/workflows/release-windows-linux.yml','utf8').split('  ecs-production-linux:')[1].split('\n  linux:')[0];
  assert.match(workflow,/contents: read/);assert.match(workflow,/inputs.mode == 'validation'/);
  assert.match(workflow,/inputs.ecs_production/);
  assert.doesNotMatch(workflow,/gh release|EVS_|APPLE_|contents: write/);
});
test('fixture binary reads support both vendor layouts without a stat/read race', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cdm-layout-test-'));
  try {
    const nested = path.join(root, '_platform_specific/linux_x64/libwidevinecdm.so');
    const flat = path.join(root, 'libwidevinecdm.so');
    fs.writeFileSync(flat, 'flat fixture');
    assert.equal((await readCdmBinary(root)).bytes.toString(), 'flat fixture');
    fs.mkdirSync(path.dirname(nested), { recursive: true });
    fs.writeFileSync(nested, 'nested fixture');
    assert.equal((await readCdmBinary(root)).binary, nested);
    assert.equal((await readCdmBinary(root)).bytes.toString(), 'nested fixture');
    fs.unlinkSync(nested);
    fs.mkdirSync(nested);
    await assert.rejects(readCdmBinary(root), { code: 'EISDIR' });
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
test('vendor-update precondition rejects any pre-existing current-version directory', async () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cdm-absence-test-'));
  try {
    fs.mkdirSync(path.join(profile, 'WidevineCdm', pins.previous.version), { recursive: true });
    await assertCdmVersionAbsent(profile, pins.current.version);
    fs.mkdirSync(path.join(profile, 'WidevineCdm', pins.current.version));
    await assert.rejects(assertCdmVersionAbsent(profile, pins.current.version), /new CDM must not exist/);
  } finally { fs.rmSync(profile, { recursive: true, force: true }); }
});
