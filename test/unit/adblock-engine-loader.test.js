const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { createHash } = require('node:crypto');
const {
  RECOVERY_CACHE_ID,
  cacheFilename,
  loadAdblockEngine,
} = require('../../src/main/adblock-engine-loader');

const USER_DATA = '/profile';
const MANIFEST_PATH = '/app/seed.json';
const SEED_PATH = '/app/seed.bin';

function hash(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function manifestFor(seed, seedId = hash(seed).slice(0, 16)) {
  return Buffer.from(JSON.stringify({
    schemaVersion: 1,
    seedId,
    sha256: hash(seed),
    byteLength: seed.length,
  }));
}

function engineBytes(name) {
  return Buffer.from(`engine:${name}`);
}

function deserialize(bytes) {
  const value = Buffer.from(bytes).toString('utf8');
  if (!value.startsWith('engine:')) throw new Error('serialized engine version mismatch');
  return { name: value.slice('engine:'.length), serialize: () => Buffer.from(bytes) };
}

function memoryIo(entries = []) {
  const files = new Map(entries.map(([file, bytes]) => [file, Buffer.from(bytes)]));
  return {
    files,
    readFile: async (file) => {
      if (!files.has(file)) {
        const error = new Error(`ENOENT: ${file}`);
        error.code = 'ENOENT';
        throw error;
      }
      return Buffer.from(files.get(file));
    },
    writeFile: async (file, bytes) => {
      files.set(file, Buffer.from(bytes));
    },
  };
}

test('a compatible versioned user cache wins without reading the seed or network', async () => {
  const seed = engineBytes('seed');
  const manifest = manifestFor(seed);
  const seedId = JSON.parse(manifest).seedId;
  const cachePath = path.join(USER_DATA, cacheFilename(seedId));
  const io = memoryIo([
    [MANIFEST_PATH, manifest],
    [cachePath, engineBytes('cache')],
  ]);
  let networkBuilds = 0;

  const loaded = await loadAdblockEngine({
    userDataDir: USER_DATA,
    deserialize,
    buildFromNetwork: async () => {
      networkBuilds += 1;
      return deserialize(engineBytes('network'));
    },
    seedPath: SEED_PATH,
    manifestPath: MANIFEST_PATH,
    ...io,
  });

  assert.equal(loaded.source, 'cache');
  assert.equal(loaded.engine.name, 'cache');
  assert.equal(networkBuilds, 0);
  assert.deepEqual(loaded.recoveries, []);
});

test('a corrupt user cache falls back to the verified seed and repairs the cache', async () => {
  const seed = engineBytes('seed');
  const manifest = manifestFor(seed);
  const seedId = JSON.parse(manifest).seedId;
  const cachePath = path.join(USER_DATA, cacheFilename(seedId));
  const io = memoryIo([
    [MANIFEST_PATH, manifest],
    [SEED_PATH, seed],
    [cachePath, Buffer.from('corrupt')],
  ]);

  const loaded = await loadAdblockEngine({
    userDataDir: USER_DATA,
    deserialize,
    buildFromNetwork: async () => deserialize(engineBytes('network')),
    seedPath: SEED_PATH,
    manifestPath: MANIFEST_PATH,
    ...io,
  });

  assert.equal(loaded.source, 'seed');
  assert.equal(loaded.engine.name, 'seed');
  assert.deepEqual(io.files.get(cachePath), seed);
  assert.deepEqual(loaded.recoveries.map(({ stage }) => stage), ['cache']);
});

test('a checksum-invalid seed falls through to the live-list recovery build', async () => {
  const expectedSeed = engineBytes('seed');
  const io = memoryIo([
    [MANIFEST_PATH, manifestFor(expectedSeed)],
    [SEED_PATH, engineBytes('tampered')],
  ]);

  const loaded = await loadAdblockEngine({
    userDataDir: USER_DATA,
    deserialize,
    buildFromNetwork: async () => deserialize(engineBytes('network')),
    seedPath: SEED_PATH,
    manifestPath: MANIFEST_PATH,
    ...io,
  });

  assert.equal(loaded.source, 'network');
  assert.equal(loaded.engine.name, 'network');
  assert.deepEqual(loaded.recoveries.map(({ stage }) => stage), ['seed']);
  assert.deepEqual(io.files.get(loaded.cachePath), engineBytes('network'));
});

test('an engine-format mismatch in the seed also falls through to the network', async () => {
  const oldSeed = Buffer.from('old-engine-format');
  const io = memoryIo([
    [MANIFEST_PATH, manifestFor(oldSeed)],
    [SEED_PATH, oldSeed],
  ]);

  const loaded = await loadAdblockEngine({
    userDataDir: USER_DATA,
    deserialize,
    buildFromNetwork: async () => deserialize(engineBytes('network')),
    seedPath: SEED_PATH,
    manifestPath: MANIFEST_PATH,
    ...io,
  });

  assert.equal(loaded.source, 'network');
  assert.deepEqual(loaded.recoveries.map(({ stage }) => stage), ['seed']);
});

test('seed-disabled recovery uses its own reusable cache and surfaces offline failure', async () => {
  const recoveryCache = path.join(USER_DATA, cacheFilename(RECOVERY_CACHE_ID));
  const cachedIo = memoryIo([[recoveryCache, engineBytes('recovered')]]);
  const cached = await loadAdblockEngine({
    userDataDir: USER_DATA,
    deserialize,
    buildFromNetwork: async () => { throw new Error('offline'); },
    seedPath: null,
    manifestPath: null,
    ...cachedIo,
  });
  assert.equal(cached.source, 'cache');
  assert.equal(cached.engine.name, 'recovered');

  const failedIo = memoryIo([[recoveryCache, Buffer.from('corrupt')]]);
  await assert.rejects(
    loadAdblockEngine({
      userDataDir: USER_DATA,
      deserialize,
      buildFromNetwork: async () => { throw new Error('offline'); },
      seedPath: null,
      manifestPath: null,
      ...failedIo,
    }),
    /offline/
  );
});

test('cache-write failure never prevents a verified seed from protecting startup', async () => {
  const seed = engineBytes('seed');
  const io = memoryIo([
    [MANIFEST_PATH, manifestFor(seed)],
    [SEED_PATH, seed],
  ]);

  const loaded = await loadAdblockEngine({
    userDataDir: USER_DATA,
    deserialize,
    buildFromNetwork: async () => deserialize(engineBytes('network')),
    seedPath: SEED_PATH,
    manifestPath: MANIFEST_PATH,
    readFile: io.readFile,
    writeFile: async () => { throw new Error('read-only profile'); },
  });

  assert.equal(loaded.source, 'seed');
  assert.equal(loaded.engine.name, 'seed');
  assert.deepEqual(loaded.recoveries.map(({ stage }) => stage), ['cache-write']);
});
