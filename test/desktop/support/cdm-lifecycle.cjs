'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const pins = require('../fixtures/cdm-lifecycle.json');
const digest = (bytes, algorithm = 'sha256') => crypto.createHash(algorithm).update(bytes).digest('hex');
function crxZip(bytes, pin) {
  assert.equal(bytes.length, pin.bytes, 'CDM archive length');
  assert.equal(digest(bytes, 'sha512'), pin.sha512, 'upstream-pinned CDM archive digest');
  assert.equal(bytes.toString('ascii', 0, 4), 'Cr24');
  assert.equal(bytes.readUInt32LE(4), 3);
  const offset = 12 + bytes.readUInt32LE(8);
  assert(offset > 12 && offset < bytes.length - 4);
  assert.equal(bytes.readUInt32LE(offset), 0x04034b50);
  return bytes.subarray(offset);
}
async function readCdmBinary(directory) {
  let binary = path.join(directory, '_platform_specific/linux_x64/libwidevinecdm.so');
  try { return { binary, bytes: await fs.readFile(binary) }; }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    binary = path.join(directory, 'libwidevinecdm.so');
    return { binary, bytes: await fs.readFile(binary) };
  }
}
async function assertCdmVersionAbsent(profile, version) {
  // Snapshot the owned, stopped profile's cache directory. Requiring the whole
  // version directory to be absent is stronger than checking one binary path.
  const versions = await fs.readdir(path.join(profile, 'WidevineCdm'));
  assert(!versions.includes(version), 'new CDM must not exist before the vendor update');
}
async function prepareCdmFixtures(root) {
  const { extract } = await import('@electron-internal/extract-zip');
  const results = {};
  for (const [kind, pin] of Object.entries({ previous: pins.previous, current: pins.current })) {
    const response = await fetch(pin.url, { signal: AbortSignal.timeout(60000) });
    assert.equal(response.status, 200, 'Google CDM download must succeed');
    const zip = path.join(root, `${kind}.zip`), directory = path.join(root, kind);
    await fs.writeFile(zip, crxZip(Buffer.from(await response.arrayBuffer()), pin));
    await fs.mkdir(directory);
    await extract(zip, { dir: directory });
    assert.equal(JSON.parse(await fs.readFile(path.join(directory, 'manifest.json'), 'utf8')).version, pin.version);
    const { binary, bytes } = await readCdmBinary(directory);
    assert.equal(bytes.subarray(0, 4).toString('hex'), '7f454c46', 'actual ELF CDM required');
    assert.equal(bytes[4], 2, '64-bit CDM');
    assert.equal(bytes.readUInt16LE(18), 62, 'x86-64 CDM');
    results[kind] = { directory, binary, version: pin.version, sha256: digest(bytes), archiveSha512: pin.sha512 };
  }
  assert.notEqual(results.previous.sha256, results.current.sha256, 'different actual binaries required');
  return results;
}
// Test-only cache staging, while the owned browser is stopped. This is not a
// production rollback API and does not change/disable CRX verification in ECS.
async function stageCdm(profile, fixture) {
  const target = path.join(profile, 'WidevineCdm', fixture.version);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.cp(fixture.directory, target, { recursive: true });
  const binary = path.join(target, '_platform_specific/linux_x64/libwidevinecdm.so');
  await fs.mkdir(path.dirname(binary), { recursive: true });
  await fs.copyFile(fixture.binary, binary);
  assert.equal(digest(await fs.readFile(binary)), fixture.sha256);
  const hint = path.join(profile, 'WidevineCdm/latest-component-updated-widevine-cdm');
  await fs.writeFile(`${hint}.tmp`, JSON.stringify({ Path: target }));
  await fs.rename(`${hint}.tmp`, hint);
  for (const relative of ['Local State', 'chromium/Local State']) {
    const file = path.join(profile, relative);
    const state = await fs.readFile(file, 'utf8').then(JSON.parse, () => null);
    if (!state) continue;
    const apps = (state.updateclientdata ||= {}).apps ||= {};
    (apps.oimompecagnajdejgnnjijobebaeigek ||= {}).pv = fixture.version;
    await fs.writeFile(`${file}.tmp`, JSON.stringify(state));
    await fs.rename(`${file}.tmp`, file);
  }
  return binary;
}
module.exports = { pins, digest, crxZip, readCdmBinary, assertCdmVersionAbsent, prepareCdmFixtures, stageCdm };
