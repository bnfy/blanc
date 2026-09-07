'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const test = require('node:test');
const {
  loadAdblockEngine,
  parseSeedManifest,
} = require('../../src/main/adblock-engine-loader');

const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');

function fixture() {
  const seed = Buffer.from('valid serialized seed');
  const snapshot = {
    digest: 'a'.repeat(64),
    resourceDigest: 'b'.repeat(64),
    files: [
      { file: 'easylist.txt', sha256: 'c'.repeat(64) },
      { file: 'easyprivacy.txt', sha256: 'd'.repeat(64) },
    ],
  };
  const manifest = Buffer.from(JSON.stringify({
    schemaVersion: 1,
    seedId: sha256(seed).slice(0, 16),
    byteLength: seed.length,
    sha256: sha256(seed),
    engine: {
      package: '@ghostery/adblocker-electron',
      packageVersion: '2.18.2',
      formatVersion: 878,
    },
    filters: { combinedSha256: snapshot.digest, files: snapshot.files },
    resources: { sha256: snapshot.resourceDigest },
  }));
  return { seed, snapshot, manifest };
}

const identity = { packageVersion: '2.18.2', formatVersion: 878 };
const engine = (label) => ({ label, serialize: () => Buffer.from(`serialized:${label}`) });

test('valid cache wins before the packaged seed and bundled compilation', async () => {
  const calls = [];
  const result = await loadAdblockEngine({
    cachePath: 'cache.bin',
    snapshot: fixture().snapshot,
    engineIdentity: identity,
    readFile: async (file) => { calls.push(file); return Buffer.from('cached'); },
    deserialize: (bytes) => engine(bytes.toString()),
    compile: () => { throw new Error('must not compile'); },
  });
  assert.equal(result.source, 'cache');
  assert.equal(result.engine.label, 'cached');
  assert.deepEqual(calls, ['cache.bin']);
});

test('cold start verifies and loads the packaged seed without a network path', async () => {
  const { seed, snapshot, manifest } = fixture();
  const writes = [];
  const result = await loadAdblockEngine({
    cachePath: 'cache.bin',
    seedPath: 'seed.bin',
    manifestPath: 'seed.json',
    snapshot,
    engineIdentity: identity,
    readFile: async (file) => {
      if (file === 'cache.bin') throw Object.assign(new Error('missing'), { code: 'ENOENT' });
      return file === 'seed.json' ? manifest : seed;
    },
    deserialize: (bytes) => engine(bytes.toString()),
    compile: () => { throw new Error('must not compile'); },
    writeCache: async (file, bytes) => writes.push([file, bytes.toString()]),
  });
  assert.equal(result.source, 'seed');
  assert.equal(result.engine.label, seed.toString());
  assert.deepEqual(writes, [['cache.bin', seed.toString()]]);
});

test('corrupt seed falls back to the verified bundled sources', async () => {
  const { snapshot, manifest } = fixture();
  let compiledWith;
  const result = await loadAdblockEngine({
    cachePath: 'cache.bin',
    seedPath: 'seed.bin',
    manifestPath: 'seed.json',
    snapshot,
    engineIdentity: identity,
    readFile: async (file) => {
      if (file === 'cache.bin') throw Object.assign(new Error('missing'), { code: 'ENOENT' });
      return file === 'seed.json' ? manifest : Buffer.from('tampered');
    },
    deserialize: () => { throw new Error('corrupt'); },
    compile: (value) => { compiledWith = value; return engine('compiled'); },
    writeCache: async () => {},
  });
  assert.equal(result.source, 'bundled-sources');
  assert.equal(compiledWith, snapshot);
  assert.equal(result.recoveries[0].stage, 'seed');
});

test('cache-write failure is nonfatal for seed and source paths', async () => {
  const { seed, snapshot, manifest } = fixture();
  for (const corruptSeed of [false, true]) {
    const result = await loadAdblockEngine({
      cachePath: 'cache.bin',
      seedPath: 'seed.bin',
      manifestPath: 'seed.json',
      snapshot,
      engineIdentity: identity,
      readFile: async (file) => {
        if (file === 'cache.bin') throw Object.assign(new Error('missing'), { code: 'ENOENT' });
        if (file === 'seed.json') return manifest;
        return corruptSeed ? Buffer.from('bad') : seed;
      },
      deserialize: (bytes) => {
        if (bytes.equals(seed)) return engine('seed');
        throw new Error('bad data');
      },
      compile: () => engine('compiled'),
      writeCache: async () => { throw Object.assign(new Error('locked'), { code: 'EPERM' }); },
    });
    assert.equal(result.engine.label, corruptSeed ? 'compiled' : 'seed');
    assert.equal(result.recoveries.at(-1).stage, 'cache-write');
  }
});

test('bundled-source compilation failure remains fail-closed', async () => {
  const { snapshot } = fixture();
  await assert.rejects(loadAdblockEngine({
    cachePath: 'cache.bin',
    seedPath: 'seed.bin',
    manifestPath: 'seed.json',
    snapshot,
    engineIdentity: identity,
    readFile: async () => { throw Object.assign(new Error('missing'), { code: 'ENOENT' }); },
    deserialize: () => { throw new Error('bad data'); },
    compile: () => { throw new Error('verified input could not compile'); },
  }), /verified input could not compile/);
});

test('seed manifest validation is strict and loader has no live fetch implementation', () => {
  assert.throws(() => parseSeedManifest('{}'), /invalid blocker seed manifest/);
  for (const modulePath of [
    require.resolve('../../src/main/adblock-engine-loader'),
    require.resolve('../../src/main/adblock'),
  ]) {
    const source = fs.readFileSync(modulePath, 'utf8');
    assert.doesNotMatch(source, /\bfetch\s*\(|fromLists\s*\(|https?:\/\//);
  }
});
